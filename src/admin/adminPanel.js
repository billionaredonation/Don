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
  getMapObjectIdFromEvent,
} from '../mapObjects/mapObjectsRenderer.js';

import {
  teleportPlayerTo,
  getCurrentPlayerPoint,
} from './adminTeleport.js';

import { createAdminObjectMover } from './adminObjectMover.js';
import { saveAdminObject } from './adminObjectEditor.js';

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

function createObjectOptionsHtml() {
  return getMapObjectTypesList()
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
  let selectedVariant = 'standard';
  let objects = [];
  let selectedObjectId = null;
  let objectMover = null;

  const objectsLayer = createMapObjectsLayer();
  objectsLayer.classList.add('map-objects-layer-admin');
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

    <label class="admin-label">
      Тип объекта
      <select class="admin-select admin-object-type">
        ${createObjectOptionsHtml()}
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
  const houseClassWrap = panel.querySelector('.admin-house-class-wrap');
  const houseClassSelect = panel.querySelector('.admin-house-class');
  const nameInput = panel.querySelector('.admin-object-name');

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

  function updateVariantVisibility() {
    const config = getMapObjectType(selectedType);
    const isHouse = config.type === 'house';

    houseClassWrap.hidden = !isHouse;

    if (!isHouse) {
      selectedVariant = '';
    } else if (!selectedVariant) {
      selectedVariant = 'standard';
      houseClassSelect.value = selectedVariant;
    }
  }

  function updateCoords(x, y) {
    xEl.textContent = String(round(x));
    yEl.textContent = String(round(y));
  }

  function fillEditor(object) {
    if (!object) {
      selectedNameEl.textContent = 'нет';
      nameInput.value = '';
      return;
    }

    selectedNameEl.textContent = `${object.icon || '◆'} ${object.name || object.type} #${String(object.id || '').slice(-6)}`;

    nameInput.value = object.name || '';
    typeSelect.value = object.type || 'marker';
    selectedType = typeSelect.value;

    if (object.type === 'house') {
      selectedVariant = object.variant || object.payload?.houseClass || 'standard';
      houseClassSelect.value = selectedVariant;
    }

    updateVariantVisibility();
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
        const label = object.name || object.type || 'Объект';

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

  function markSelectedObject() {
    objects = objects.map((object) => ({
      ...object,
      selected: Boolean(selectedObjectId) && String(object.id) === String(selectedObjectId),
    }));

    renderMapObjects(objectsLayer, objects);
    renderObjectList();
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
    canShowPanel: () => enabled,
  });

  function setEnabled(next) {
    enabled = Boolean(next);
    root.dataset.adminMode = enabled ? 'enabled' : 'disabled';
    panel.hidden = !enabled;

    if (!enabled) {
      teleportMode = false;
      placeMode = false;

      objectMover?.resetMoveMode();

      btnTeleport.textContent = 'Телепорт: OFF';
      btnPlace.textContent = 'Клик: OFF';
    } else {
      const point = getCurrentPlayerPoint(playerMarker, playerPosition);
      updateCoords(point.x, point.y);
    }
  }

  function togglePanel() {
    setEnabled(!enabled);
  }

  async function addObjectAt(x, y) {
    const draft = createMapObjectDraft({
      cityId,
      type: selectedType,
      variant: selectedVariant,
      x,
      y,
      name: nameInput.value.trim(),
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

    await saveAdminObject({
      cityId,
      object,
      selectedType,
      selectedVariant,
      name: nameInput.value.trim(),
      patch,
    });

    await reloadObjects();
  }

  async function moveSelectedToPlayer() {
    const object = getSelectedObject();
    if (!object) return;

    const point = getCurrentPlayerPoint(playerMarker, playerPosition);

    object.x = point.x;
    object.y = point.y;

    renderMapObjects(objectsLayer, objects);

    await updateMapObject(cityId, object.id, {
      x: point.x,
      y: point.y,
    });

    await reloadObjects();
  }

  function onMapClick(event) {
    if (!enabled) return;
    if (event.target.closest('.admin-panel')) return;

    const clickedObjectId = getMapObjectIdFromEvent(event);

    if (clickedObjectId) {
      event.preventDefault();
      event.stopPropagation();
      updateSelectedObject(clickedObjectId);
      return;
    }

    if (!teleportMode && !placeMode) return;

    event.preventDefault();
    event.stopPropagation();

    const point = getPointFromEvent(event, viewport);
    updateCoords(point.x, point.y);

    if (teleportMode) {
      teleportPlayerTo({
        playerMarker,
        playerPosition,
        cityId,
        nickname,
        mapControls,
        movementChannel,
        x: point.x,
        y: point.y,
      });
      return;
    }

    if (placeMode) {
      addObjectAt(point.x, point.y);
    }
  }

  function onMouseMove(event) {
    if (!enabled) return;

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

    const isAdminHotkey =
      code === 'KeyP' ||
      key === 'p' ||
      key === 'з';

    if (isAdminHotkey && !event.repeat && !isFormField) {
      event.preventDefault();
      event.stopPropagation();
      togglePanel();
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

    if (event.key === 'Escape' && !isFormField) {
      event.preventDefault();
      setEnabled(false);
      return;
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
    teleportMode = !teleportMode;
    placeMode = false;
    btnTeleport.textContent = teleportMode ? 'Телепорт: ON' : 'Телепорт: OFF';
    btnPlace.textContent = 'Клик: OFF';
  });

  btnPlace.addEventListener('click', () => {
    placeMode = !placeMode;
    teleportMode = false;
    btnPlace.textContent = placeMode ? 'Клик: ON' : 'Клик: OFF';
    btnTeleport.textContent = 'Телепорт: OFF';
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

    await deleteMapObject(cityId, selectedObjectId);

    selectedObjectId = null;
    await reloadObjects();
  });

  btnClearAll.addEventListener('click', async () => {
    if (!window.confirm('Удалить все объекты на этой карте?')) return;

    await clearMapObjects(cityId);

    selectedObjectId = null;
    await reloadObjects();
  });

  objectListEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-object-id]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    updateSelectedObject(button.dataset.adminObjectId);
  });

  typeSelect.addEventListener('change', () => {
    selectedType = typeSelect.value;
    updateVariantVisibility();
  });

  houseClassSelect.addEventListener('change', () => {
    selectedVariant = houseClassSelect.value;
  });

  function onMapPointerDown(event) {
    if (!enabled) return;
    if (event.target.closest('.admin-panel')) return;
    if (objectMover?.isMoveMode()) return;

    const clickedObjectId = getMapObjectIdFromEvent(event);
    if (!clickedObjectId) return;

    event.preventDefault();
    event.stopPropagation();

    updateSelectedObject(clickedObjectId);
  }

  viewport.addEventListener('pointerdown', onMapPointerDown, true);
  viewport.addEventListener('click', onMapClick, true);
  viewport.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('mn:admin-toggle', onAdminToggle);

  updateVariantVisibility();
  reloadObjects();
  setEnabled(false);

  return () => {
    viewport.removeEventListener('pointerdown', onMapPointerDown, true);
    viewport.removeEventListener('click', onMapClick, true);
    viewport.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('mn:admin-toggle', onAdminToggle);

    objectMover?.cleanup();

    panel.remove();
    objectsLayer.remove();

    delete root.dataset.adminMode;
    delete root.dataset.adminMoveMode;
  };
}
