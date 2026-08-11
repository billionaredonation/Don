import {
  getMapObjectTypesList,
  getMapObjectType,
  getHouseClassesList,
  createMapObjectDraft,
} from '../mapObjects/mapObjectTypes.js';

import {
  getMapObjects,
  addMapObject,
  updateMapObject,
  deleteMapObject,
  clearMapObjects,
} from '../mapObjects/mapObjectsRepository.js';

import {
  createMapObjectsLayer,
  renderMapObjects,
  clearMapObjectsLayer,
  getMapObjectIdFromEvent,
} from '../mapObjects/mapObjectsRenderer.js';

import {
  teleportPlayerTo,
  getCurrentPlayerPoint,
} from './adminTeleport.js';

import { createAdminObjectMover } from './adminObjectMover.js';
import { saveAdminObject } from './adminObjectEditor.js';

const ADMIN_TELEPORT_HOTKEY_STORAGE_KEY = 'mn-admin-teleport-hotkey';
const DEFAULT_ADMIN_TELEPORT_HOTKEY = 't';
const ADMIN_HOTKEY_EVENT_FLAG = '__mnAdminHotkeyHandled';

function isDesktopAdminDevice() {
  const width = Math.min(window.innerWidth || 9999, window.screen?.width || 9999);
  const height = Math.min(window.innerHeight || 9999, window.screen?.height || 9999);
  const hasTouch = navigator.maxTouchPoints > 0;

  return !(hasTouch && Math.min(width, height) <= 768);
}

function isAdminPanelHotkey(event) {
  if (!isDesktopAdminDevice()) return false;

  const key = String(event?.key || '').trim().toLowerCase();
  const code = String(event?.code || '').trim();

  return (
    code === 'KeyP' ||
    key === 'p' ||
    key === 'з'
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getAdminTeleportHotkey() {
  try {
    return localStorage.getItem(ADMIN_TELEPORT_HOTKEY_STORAGE_KEY) || DEFAULT_ADMIN_TELEPORT_HOTKEY;
  } catch {
    return DEFAULT_ADMIN_TELEPORT_HOTKEY;
  }
}

function enableAdminModeClass() {
  document.body.classList.add('admin-mode');
}

function disableAdminModeClass() {
  document.body.classList.remove('admin-mode');
}

function showAdminNotice(message) {
  window.dispatchEvent(new CustomEvent('mn:toast', {
    detail: { message },
  }));

  let notice = document.querySelector('.admin-floating-notice');

  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'admin-floating-notice';
    notice.style.cssText = `
      position: fixed;
      left: 50%;
      top: 18px;
      z-index: 100000;
      transform: translateX(-50%);
      max-width: min(520px, calc(100vw - 24px));
      padding: 10px 14px;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 14px;
      background: rgba(8, 12, 18, 0.92);
      color: #fff;
      font: 800 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      box-shadow: 0 12px 36px rgba(0,0,0,0.45);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      pointer-events: none;
      text-align: center;
    `;
    document.body.appendChild(notice);
  }

  notice.textContent = message;
  clearTimeout(notice._hideTimer);

  notice._hideTimer = setTimeout(() => {
    notice?.remove();
  }, 3200);

  console.log(`[admin] ${message}`);
}

function getPointFromEvent(event, viewport) {
  const rect = viewport.getBoundingClientRect();

  return {
    x: round(clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)),
    y: round(clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)),
  };
}

function notifyMapObjectsChanged(cityId) {
  window.dispatchEvent(new CustomEvent('mn:map-objects-changed', {
    detail: { cityId },
  }));
}

const ADMIN_OBJECT_SECTIONS = Object.freeze({
  property: { label: 'Недвижимость', categories: ['house', 'business'] },
  services: { label: 'Сервисы', categories: ['service'] },
  jobs: { label: 'Работы', categories: ['job'] },
  decor: { label: 'Декор', categories: ['decor'] },
  misc: { label: 'NPC / метки', categories: ['npc', 'marker'] },
});

function getAdminObjectSectionForCategory(category) {
  return Object.entries(ADMIN_OBJECT_SECTIONS)
    .find(([, section]) => section.categories.includes(String(category || '')))?.[0] || 'misc';
}

function createObjectOptionsHtml(sectionKey = 'property') {
  const section = ADMIN_OBJECT_SECTIONS[sectionKey] || ADMIN_OBJECT_SECTIONS.property;
  return getMapObjectTypesList()
    .filter((type) => section.categories.includes(type.category))
    .map((type) => `<option value="${type.type}">${type.icon} ${type.label}</option>`)
    .join('');
}

function createHouseClassOptionsHtml() {
  return getHouseClassesList()
    .map((item) => `<option value="${item.value}">${item.icon} ${item.label}</option>`)
    .join('');
}

export function enableAdminPanel({
  root,
  stage,
  viewport,
  playerMarker,
  playerPosition,
  cityId,
  nickname,
  mapControls,
  movementChannel,
}) {
  if (!root || !stage || !viewport || !playerMarker || !playerPosition) return null;

  let enabled = false;
  let teleportMode = false;
  let placeMode = false;

  let selectedType = 'house';
  let selectedObjectSection = 'property';
  let selectedVariant = 'standard';
  let objects = [];
  let selectedObjectId = null;
  let objectMover = null;
  let jobResizePointerId = null;
  let jobResizeObjectId = null;

  const objectsLayer = createMapObjectsLayer();
  objectsLayer.classList.add('map-objects-layer-admin');
  objectsLayer.hidden = true;
  objectsLayer.style.display = 'none';
  viewport.appendChild(objectsLayer);

  const panel = document.createElement('aside');
  panel.className = 'admin-panel';
  panel.hidden = true;

  panel.innerHTML = `
    <div class="admin-panel-head">
      <strong>ADMIN</strong>
      <button class="admin-btn admin-close" type="button">×</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-toggle-teleport" type="button">Телепорт: OFF</button>
      <button class="admin-btn admin-toggle-place" type="button">Клик: OFF</button>
    </div>

    <div class="admin-separator"></div>

    <div class="admin-object-sections" aria-label="Раздел объектов">
      ${Object.entries(ADMIN_OBJECT_SECTIONS).map(([key, section]) => `<button type="button" data-admin-object-section="${key}"${key === 'property' ? ' data-active="true"' : ''}>${section.label}</button>`).join('')}
    </div>

    <label class="admin-label">
      Тип объекта
      <select class="admin-select admin-object-type">
        ${createObjectOptionsHtml('property')}
      </select>
    </label>

    <label class="admin-label admin-house-class-wrap">
      Класс дома
      <select class="admin-select admin-house-class">
        ${createHouseClassOptionsHtml()}
      </select>
    </label>

    <label class="admin-label">
      Название
      <input class="admin-input admin-object-name" placeholder="Название дома / бизнеса" />
    </label>

    <div class="admin-job-size-wrap" hidden>
      <div class="admin-editor-title">Размер рабочей зоны</div>
      <div class="admin-size-grid">
        <label class="admin-label">
          Ширина, % карты
          <input class="admin-input admin-job-width" type="number" min="0.8" max="30" step="0.1" value="8" inputmode="decimal" />
        </label>
        <label class="admin-label">
          Высота, % карты
          <input class="admin-input admin-job-height" type="number" min="0.8" max="30" step="0.1" value="8" inputmode="decimal" />
        </label>
      </div>
      <small class="admin-help">Размер рабочей зоны используется для лавки и будущих крупных рабочих объектов.</small>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-place-here" type="button">Поставить тут</button>
      <button class="admin-btn admin-move-selected-here" type="button">Перенести сюда</button>
    </div>

    <div class="admin-separator"></div>

    <div class="admin-editor-title">Выбранный объект</div>

    <div class="admin-selected">
      <span class="admin-selected-name">нет</span>
    </div>

    <div class="admin-object-list"></div>

    <div class="admin-row">
      <button class="admin-btn admin-start-move" type="button">Двигать</button>
      <button class="admin-btn admin-save-selected" type="button">Сохранить</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-delete-selected" type="button">Удалить</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-copy-coords" type="button">Копировать JSON</button>
      <button class="admin-btn admin-clear-all" type="button">Очистить</button>
    </div>

    <div class="admin-coords">
      Курсор: X <b class="admin-x">0</b> · Y <b class="admin-y">0</b>
    </div>
  `;

  root.appendChild(panel);

  const btnClose = panel.querySelector('.admin-close');
  const btnTeleport = panel.querySelector('.admin-toggle-teleport');
  const btnPlace = panel.querySelector('.admin-toggle-place');
  const btnPlaceHere = panel.querySelector('.admin-place-here');
  const btnMoveSelectedHere = panel.querySelector('.admin-move-selected-here');
  const btnStartMove = panel.querySelector('.admin-start-move');
  const btnSaveSelected = panel.querySelector('.admin-save-selected');
  const btnDeleteSelected = panel.querySelector('.admin-delete-selected');
  const btnClearAll = panel.querySelector('.admin-clear-all');
  const btnCopy = panel.querySelector('.admin-copy-coords');

  const typeSelect = panel.querySelector('.admin-object-type');
  const objectSectionButtons = [...panel.querySelectorAll('[data-admin-object-section]')];
  const houseClassWrap = panel.querySelector('.admin-house-class-wrap');
  const houseClassSelect = panel.querySelector('.admin-house-class');
  const nameInput = panel.querySelector('.admin-object-name');
  const jobSizeWrap = panel.querySelector('.admin-job-size-wrap');
  const jobWidthInput = panel.querySelector('.admin-job-width');
  const jobHeightInput = panel.querySelector('.admin-job-height');

  const xEl = panel.querySelector('.admin-x');
  const yEl = panel.querySelector('.admin-y');
  const selectedNameEl = panel.querySelector('.admin-selected-name');
  const objectListEl = panel.querySelector('.admin-object-list');

  typeSelect.value = selectedType;
  houseClassSelect.value = selectedVariant;

  function getObjects() {
    return objects;
  }

  function setObjects(nextObjects) {
    objects = Array.isArray(nextObjects) ? nextObjects : [];
  }

  function getSelectedObjectId() {
    return selectedObjectId;
  }

  function setSelectedObjectId(objectId) {
    selectedObjectId = objectId ? String(objectId) : null;
  }

  function getObjectById(objectId) {
    if (!objectId) return null;
    return objects.find((object) => String(object.id) === String(objectId)) || null;
  }

  function getSelectedObject() {
    return getObjectById(selectedObjectId);
  }

  function setObjectSection(sectionKey, { preserveType = false } = {}) {
    selectedObjectSection = ADMIN_OBJECT_SECTIONS[sectionKey] ? sectionKey : 'property';
    objectSectionButtons.forEach((button) => {
      button.dataset.active = button.dataset.adminObjectSection === selectedObjectSection ? 'true' : 'false';
    });

    const currentType = preserveType ? selectedType : '';
    typeSelect.innerHTML = createObjectOptionsHtml(selectedObjectSection);
    const allowedTypes = [...typeSelect.options].map((option) => option.value);
    selectedType = allowedTypes.includes(currentType) ? currentType : (allowedTypes[0] || 'marker');
    typeSelect.value = selectedType;
    updateVariantVisibility();
  }

  function normalizeJobDimension(value, fallback) {
    const number = Number(value);
    return Math.round(Math.min(30, Math.max(0.8, Number.isFinite(number) ? number : fallback)) * 10) / 10;
  }

  function hasEditableJobFootprint(type = selectedType) {
    const config = getMapObjectType(type);
    return config.category === 'job' && Number.isFinite(Number(config.defaultWidth)) && Number.isFinite(Number(config.defaultHeight));
  }

  function syncJobSizeInputs(object = null) {
    const config = getMapObjectType(selectedType);
    const payload = object?.payload || {};
    const fallbackWidth = Number(config.defaultWidth || 2.6);
    const fallbackHeight = Number(config.defaultHeight || 2.2);
    if (jobWidthInput) jobWidthInput.value = String(normalizeJobDimension(payload.renderWidth, fallbackWidth));
    if (jobHeightInput) jobHeightInput.value = String(normalizeJobDimension(payload.renderHeight, fallbackHeight));
  }

  function updateVariantVisibility() {
    const config = getMapObjectType(selectedType);
    const isHouse = config.type === 'house';
    const isJob = config.category === 'job';
    const isSizedJob = hasEditableJobFootprint(config.type);

    houseClassWrap.hidden = !isHouse;
    if (jobSizeWrap) jobSizeWrap.hidden = !isSizedJob;

    if (!isHouse) {
      selectedVariant = '';
    } else if (!selectedVariant) {
      selectedVariant = 'standard';
      houseClassSelect.value = selectedVariant;
    }

    if (isJob && isSizedJob && !getSelectedObject()) syncJobSizeInputs(null);
  }

  function updateCoords(x, y) {
    xEl.textContent = String(round(x));
    yEl.textContent = String(round(y));
  }

  function setTeleportMode(next) {
    teleportMode = Boolean(next);
    placeMode = false;

    btnTeleport.textContent = teleportMode ? 'Телепорт: ON' : 'Телепорт: OFF';
    btnPlace.textContent = 'Клик: OFF';

    if (teleportMode) {
      enabled = false;

      enableAdminModeClass();

      root.dataset.adminMode = 'disabled';
      root.dataset.adminTeleportMode = 'enabled';

      panel.hidden = true;

      objectMover?.resetMoveMode();
      syncAdminObjectsLayerVisibility();

      showAdminNotice(
        'Режим телепорта включен. Чтобы телепортироваться, нажмите правой кнопкой мыши по месту на карте.'
      );
      return;
    }

    delete root.dataset.adminTeleportMode;
    root.dataset.adminMode = enabled ? 'enabled' : 'disabled';

    if (enabled) {
      panel.hidden = false;
      enableAdminModeClass();
    } else {
      disableAdminModeClass();
    }

    syncAdminObjectsLayerVisibility();
    showAdminNotice('Режим телепорта выключен.');
  }

  function setPlaceMode(next) {
    placeMode = Boolean(next);

    if (placeMode) {
      setTeleportMode(false);
    }

    btnPlace.textContent = placeMode ? 'Клик: ON' : 'Клик: OFF';
  }

  function fillEditor(object) {
    if (!object) {
      selectedNameEl.textContent = 'нет';
      nameInput.value = '';
      updateVariantVisibility();
      syncJobSizeInputs(null);
      return;
    }

    selectedNameEl.textContent = `${object.icon || '◆'} ${object.name || object.type} #${String(object.id || '').slice(-6)}`;

    nameInput.value = object.name || '';
    selectedType = object.type || 'marker';
    selectedObjectSection = getAdminObjectSectionForCategory(object.category || object.payload?.category || getMapObjectType(selectedType).category);
    setObjectSection(selectedObjectSection, { preserveType: true });
    typeSelect.value = selectedType;

    if (object.type === 'house') {
      selectedVariant = object.variant || object.payload?.houseClass || 'standard';
      houseClassSelect.value = selectedVariant;
    }

    updateVariantVisibility();
    if (hasEditableJobFootprint(selectedType)) syncJobSizeInputs(object);
  }

  function renderObjectList() {
    if (!objectListEl) return;

    if (!objects.length) {
      objectListEl.innerHTML = '<div class="admin-object-empty">Объектов нет</div>';
      return;
    }

    objectListEl.innerHTML = objects
      .map((object, index) => {
        const id = String(object.id || '');
        const shortId = id.slice(-6) || String(index + 1);
        const selectedClass = String(selectedObjectId) === id ? ' is-selected' : '';
        const baseLabel = object.name || object.type || 'Объект';
        const label = baseLabel;

        return `
          <button
            class="admin-object-item${selectedClass}"
            type="button"
            data-admin-object-id="${escapeHtml(id)}"
            title="${escapeHtml(label)} #${escapeHtml(shortId)}"
          >
            <span>${escapeHtml(object.icon || '◆')} ${escapeHtml(label)}</span>
            <b>#${escapeHtml(shortId)}</b>
          </button>
        `;
      })
      .join('');
  }

  function shouldRenderAdminObjectsLayer() {
    return enabled || root.dataset.adminMoveMode === 'enabled';
  }

  function syncAdminObjectsLayerVisibility() {
    const visible = shouldRenderAdminObjectsLayer();

    objectsLayer.hidden = !visible;
    objectsLayer.style.display = visible ? 'block' : 'none';

    if (!visible) {
      clearMapObjectsLayer(objectsLayer);
    }

    return visible;
  }

  function markSelectedObject() {
    objects = objects.map((object) => ({
      ...object,
      selected: Boolean(selectedObjectId) && String(object.id) === String(selectedObjectId),
    }));

    if (syncAdminObjectsLayerVisibility()) {
      renderMapObjects(objectsLayer, objects);
    }

    if (enabled || panel.hidden === false) {
      renderObjectList();
    }
  }

  function updateSelectedObject(objectId) {
    selectedObjectId = objectId ? String(objectId) : null;
    markSelectedObject();
    fillEditor(getSelectedObject());
  }

  async function reloadObjects() {
    const freshObjects = await getMapObjects(cityId);

    objects = freshObjects.map((object) => ({
      ...object,
      selected: Boolean(selectedObjectId) && String(object.id) === String(selectedObjectId),
    }));

    const selectedStillExists = objects.some(
      (object) => String(object.id) === String(selectedObjectId)
    );

    if (selectedObjectId && !selectedStillExists) {
      selectedObjectId = null;
    }

    markSelectedObject();
    fillEditor(getSelectedObject());
    notifyMapObjectsChanged(cityId);
  }

  objectMover = createAdminObjectMover({
    root,
    panel,
    cityId,
    objectsLayer,
    getObjects,
    setObjects,
    getSelectedObjectId,
    setSelectedObjectId,
    reloadObjects,
    renderObjectList,
    canShowPanel: () => enabled && !teleportMode,
  });

function setEnabled(next) {
  enabled = Boolean(next);

  if (teleportMode) {
    root.dataset.adminMode = 'disabled';
    panel.hidden = true;
    enableAdminModeClass();
    return;
  }

  root.dataset.adminMode = enabled ? 'enabled' : 'disabled';
  panel.hidden = !enabled;

  if (enabled) {
    enableAdminModeClass();
    syncAdminObjectsLayerVisibility();

    const point = getCurrentPlayerPoint(playerMarker, playerPosition);
    updateCoords(point.x, point.y);

    reloadObjects();
    return;
  }

  disableAdminModeClass();

  placeMode = false;

  objectMover?.resetMoveMode();
  syncAdminObjectsLayerVisibility();

  btnPlace.textContent = 'Клик: OFF';
}

  function togglePanel() {
    setEnabled(!enabled);
  }

  async function addObjectAt(x, y) {
    const selectedConfig = getMapObjectType(selectedType);
    const draftPayload = hasEditableJobFootprint(selectedType)
      ? {
          renderWidth: normalizeJobDimension(jobWidthInput?.value, selectedConfig.defaultWidth || 2.6),
          renderHeight: normalizeJobDimension(jobHeightInput?.value, selectedConfig.defaultHeight || 2.2),
        }
      : {};

    const draft = createMapObjectDraft({
      cityId,
      type: selectedType,
      variant: selectedVariant,
      x,
      y,
      name: nameInput.value.trim(),
      payload: draftPayload,
    });

    const createdObject = await addMapObject(cityId, draft);
    selectedObjectId = createdObject.id;
    await reloadObjects();
  }

  async function addObjectAtPlayerPosition() {
    const point = getCurrentPlayerPoint(playerMarker, playerPosition);
    updateCoords(point.x, point.y);
    await addObjectAt(point.x, point.y);
  }

  async function saveSelectedObject(patch = {}) {
    const object = getSelectedObject();
    if (!object) return;

    const selectedConfig = getMapObjectType(selectedType);
    const jobPayload = hasEditableJobFootprint(selectedType)
      ? {
          ...(object.payload || {}),
          renderWidth: normalizeJobDimension(jobWidthInput?.value, selectedConfig.defaultWidth || 2.6),
          renderHeight: normalizeJobDimension(jobHeightInput?.value, selectedConfig.defaultHeight || 2.2),
        }
      : null;

    await saveAdminObject({
      cityId,
      object,
      selectedType,
      selectedVariant,
      name: nameInput.value.trim(),
      patch: jobPayload ? { ...patch, payload: { ...(patch.payload || {}), ...jobPayload } } : patch,
    });

    await reloadObjects();
  }

  async function moveSelectedToPlayer() {
    const object = getSelectedObject();
    if (!object) return;

    const point = getCurrentPlayerPoint(playerMarker, playerPosition);

    object.x = point.x;
    object.y = point.y;

    if (syncAdminObjectsLayerVisibility()) {
      renderMapObjects(objectsLayer, objects);
    }

    await updateMapObject(cityId, object.id, {
      x: point.x,
      y: point.y,
    });

    await reloadObjects();
  }

  function onMapClick(event) {
    if (!enabled) return;
    if (event.target.closest('.admin-panel')) return;
    if (teleportMode) return;

    const clickedObjectId = getMapObjectIdFromEvent(event);

    if (clickedObjectId) {
      event.preventDefault();
      event.stopPropagation();
      updateSelectedObject(clickedObjectId);
      return;
    }

    if (!placeMode) return;

    event.preventDefault();
    event.stopPropagation();

    const point = getPointFromEvent(event, viewport);
    updateCoords(point.x, point.y);

    addObjectAt(point.x, point.y);
  }

  async function onMapContextMenu(event) {
    if (!teleportMode) return;
    if (event.target.closest('.admin-panel')) return;

    event.preventDefault();
    event.stopPropagation();

    const point = getPointFromEvent(event, viewport);
    updateCoords(point.x, point.y);

    playerPosition.x = point.x;
    playerPosition.y = point.y;

    if (playerMarker) {
      playerMarker.dataset.x = String(point.x);
      playerMarker.dataset.y = String(point.y);
      playerMarker.style.left = `${point.x}%`;
      playerMarker.style.top = `${point.y}%`;
    }

    await teleportPlayerTo({
      playerMarker,
      playerPosition,
      cityId,
      nickname,
      mapControls,
      movementChannel,
      x: point.x,
      y: point.y,
    });

    mapControls?.focusOnPlayer?.(point.x, point.y);

    window.dispatchEvent(new CustomEvent('mn:player-teleported', {
      detail: {
        cityId,
        x: point.x,
        y: point.y,
      },
    }));
  }

  function onMouseMove(event) {
    if (!enabled && !teleportMode) return;

    const point = getPointFromEvent(event, viewport);
    updateCoords(point.x, point.y);
  }

  function onKeyDown(event) {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const isFormField =
      activeTag === 'input' ||
      activeTag === 'textarea' ||
      activeTag === 'select';

    const key = String(event.key || '').toLowerCase();
    const code = String(event.code || '');

    const teleportHotkey = String(getAdminTeleportHotkey()).toLowerCase();

    if (key === teleportHotkey && !event.repeat && !isFormField) {
      event.preventDefault();
      event.stopPropagation();
      setTeleportMode(!teleportMode);
      return;
    }

    if (event?.[ADMIN_HOTKEY_EVENT_FLAG] === true) return;

    if (isAdminPanelHotkey(event) && !event.repeat && !isFormField) {
      event[ADMIN_HOTKEY_EVENT_FLAG] = true;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      togglePanel();
      return;
    }

    if (event.key === 'Escape' && !isFormField) {
      event.preventDefault();

      if (teleportMode) {
        setTeleportMode(false);
        return;
      }

      if (enabled) {
        setEnabled(false);
      }

      return;
    }

    if (!enabled) return;

    if (objectMover?.isMoveMode()) {
      let dx = 0;
      let dy = 0;

      if (event.key === 'ArrowLeft' || key === 'a' || key === 'ф') dx = -0.3;
      if (event.key === 'ArrowRight' || key === 'd' || key === 'в') dx = 0.3;
      if (event.key === 'ArrowUp' || key === 'w' || key === 'ц') dy = -0.3;
      if (event.key === 'ArrowDown' || key === 's' || key === 'ы') dy = 0.3;

      if (dx || dy) {
        event.preventDefault();
        objectMover.moveSelectedVisual(dx, dy);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        objectMover.saveMoveMode();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        objectMover.cancelMoveMode();
        return;
      }
    }

    if (event.key === 'Enter' && !isFormField) {
      event.preventDefault();

      if (selectedObjectId) {
        saveSelectedObject();
      } else {
        addObjectAtPlayerPosition();
      }
    }
  }

  function onAdminToggle() {
    togglePanel();
  }

  btnClose.addEventListener('click', () => setEnabled(false));

  btnTeleport.addEventListener('click', () => {
    setTeleportMode(!teleportMode);
  });

  btnPlace.addEventListener('click', () => {
    setPlaceMode(!placeMode);
  });

  btnPlaceHere.addEventListener('click', addObjectAtPlayerPosition);
  btnMoveSelectedHere.addEventListener('click', moveSelectedToPlayer);
  btnStartMove.addEventListener('click', () => objectMover?.startMoveSelected());
  btnSaveSelected.addEventListener('click', () => saveSelectedObject());

  btnCopy.addEventListener('click', async () => {
    const object = getSelectedObject();
    const text = object ? JSON.stringify(object, null, 2) : '{}';

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.log(text);
    }
  });

  btnDeleteSelected.addEventListener('click', async () => {
    if (!selectedObjectId) return;

    const objectIdToDelete = selectedObjectId;

    try {
      await deleteMapObject(cityId, objectIdToDelete, {
        adminNickname: nickname,
      });

      selectedObjectId = null;
      await reloadObjects();
      showAdminNotice('Объект удалён из БД и с карты.');
    } catch (error) {
      console.error('[adminPanel] delete selected object failed:', error);
      showAdminNotice(`Удаление не прошло: ${error?.message || error}`);
      await reloadObjects();
    }
  });

  btnClearAll.addEventListener('click', async () => {
    if (!window.confirm('Удалить все объекты на этой карте?')) return;

    try {
      await clearMapObjects(cityId, {
        adminNickname: nickname,
      });

      selectedObjectId = null;
      objects = [];
      clearMapObjectsLayer(objectsLayer);
      renderObjectList();
      fillEditor(null);
      notifyMapObjectsChanged(cityId);
      showAdminNotice('Карта очищена: объекты удалены из БД.');
    } catch (error) {
      console.error('[adminPanel] clear map objects failed:', error);
      showAdminNotice(`Очистка не прошла: ${error?.message || error}`);
      await reloadObjects();
    }
  });

  objectListEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-object-id]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    updateSelectedObject(button.dataset.adminObjectId);
  });

  objectSectionButtons.forEach((button) => {
    button.addEventListener('click', () => setObjectSection(button.dataset.adminObjectSection));
  });

  typeSelect.addEventListener('change', () => {
    selectedType = typeSelect.value;
    updateVariantVisibility();
    if (hasEditableJobFootprint(selectedType)) syncJobSizeInputs(null);
  });

  houseClassSelect.addEventListener('change', () => {
    selectedVariant = houseClassSelect.value;
  });

  function previewSelectedJobSize() {
    const object = getSelectedObject();
    if (!object || !hasEditableJobFootprint(object.type || selectedType)) return;
    const config = getMapObjectType(object.type || selectedType);
    object.payload = {
      ...(object.payload || {}),
      renderWidth: normalizeJobDimension(jobWidthInput?.value, config.defaultWidth || 2.6),
      renderHeight: normalizeJobDimension(jobHeightInput?.value, config.defaultHeight || 2.2),
    };
    if (syncAdminObjectsLayerVisibility()) renderMapObjects(objectsLayer, objects);
  }

  jobWidthInput?.addEventListener('input', previewSelectedJobSize);
  jobHeightInput?.addEventListener('input', previewSelectedJobSize);
  function onMapPointerDown(event) {
    if (!enabled) return;
    if (event.target.closest('.admin-panel')) return;
    if (objectMover?.isMoveMode()) return;
    if (teleportMode) return;

    const resizeHandle = event.target.closest?.('[data-admin-job-resize]');
    if (resizeHandle) {
      const objectId = String(resizeHandle.dataset.adminJobResize || '');
      const object = getObjectById(objectId);
      if (!object || !hasEditableJobFootprint(object.type)) return;
      event.preventDefault();
      event.stopPropagation();
      updateSelectedObject(objectId);
      jobResizePointerId = event.pointerId;
      jobResizeObjectId = objectId;
      viewport.setPointerCapture?.(event.pointerId);
      return;
    }

    const clickedObjectId = getMapObjectIdFromEvent(event);
    if (!clickedObjectId) return;

    event.preventDefault();
    event.stopPropagation();

    updateSelectedObject(clickedObjectId);
  }

  function onMapPointerMove(event) {
    if (!enabled || jobResizePointerId !== event.pointerId || !jobResizeObjectId) return;
    const object = getObjectById(jobResizeObjectId);
    if (!object) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPointFromEvent(event, viewport);
    const width = normalizeJobDimension(Math.abs(point.x - Number(object.x || 50)) * 2, Number(object.payload?.renderWidth || 8));
    const height = normalizeJobDimension(Math.abs(point.y - Number(object.y || 50)) * 2, Number(object.payload?.renderHeight || 8));
    object.payload = { ...(object.payload || {}), renderWidth: width, renderHeight: height };
    if (jobWidthInput) jobWidthInput.value = String(width);
    if (jobHeightInput) jobHeightInput.value = String(height);
    if (syncAdminObjectsLayerVisibility()) renderMapObjects(objectsLayer, objects);
  }

  function onMapPointerUp(event) {
    if (jobResizePointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    viewport.releasePointerCapture?.(event.pointerId);
    jobResizePointerId = null;
    jobResizeObjectId = null;
    showAdminNotice('Размер рабочей зоны изменён. Нажмите «Сохранить», чтобы записать его для всех игроков.');
  }

  viewport.addEventListener('pointerdown', onMapPointerDown, true);
  viewport.addEventListener('pointermove', onMapPointerMove, true);
  viewport.addEventListener('pointerup', onMapPointerUp, true);
  viewport.addEventListener('pointercancel', onMapPointerUp, true);
  viewport.addEventListener('click', onMapClick, true);
  viewport.addEventListener('contextmenu', onMapContextMenu, true);
  viewport.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('mn:admin-toggle', onAdminToggle);
  window.addEventListener('mn:toast', (event) => {
  const message = event.detail?.message;

  if (!message) return;

  let notice = document.querySelector('.admin-floating-notice');

  if (!notice) {
    notice = document.createElement('div');

    notice.className = 'admin-floating-notice';

    notice.style.cssText = `
      position: fixed;
      left: 50%;
      top: 18px;
      z-index: 100000;
      transform: translateX(-50%);
      max-width: min(520px, calc(100vw - 24px));
      padding: 10px 14px;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 14px;
      background: rgba(8, 12, 18, 0.92);
      color: #fff;
      font: 800 12px/1.35 system-ui, sans-serif;
      box-shadow: 0 12px 36px rgba(0,0,0,0.45);
      backdrop-filter: blur(12px);
      pointer-events: none;
      text-align: center;
    `;

    document.body.appendChild(notice);
  }

  notice.textContent = message;

  clearTimeout(notice._hideTimer);

  notice._hideTimer = setTimeout(() => {
    notice?.remove();
  }, 3000);
 });

  updateVariantVisibility();
  reloadObjects();
  setEnabled(false);

  return () => {
    viewport.removeEventListener('pointerdown', onMapPointerDown, true);
    viewport.removeEventListener('pointermove', onMapPointerMove, true);
    viewport.removeEventListener('pointerup', onMapPointerUp, true);
    viewport.removeEventListener('pointercancel', onMapPointerUp, true);
    viewport.removeEventListener('click', onMapClick, true);
    viewport.removeEventListener('contextmenu', onMapContextMenu, true);
    viewport.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('mn:admin-toggle', onAdminToggle);

    objectMover?.cleanup();

    panel.remove();
    objectsLayer.remove();

    delete root.dataset.adminMode;
    delete root.dataset.adminMoveMode;
    delete root.dataset.adminTeleportMode;

    disableAdminModeClass();

    document.querySelector('.admin-floating-notice')?.remove();
    document.querySelector('.mn-admin-toast')?.remove();
  };
}
