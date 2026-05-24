import { updatePlayerPosition, getLocalPlayerId } from '../player/playerPosition.js';

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function getPointFromEvent(event, viewport) {
  const rect = viewport.getBoundingClientRect();

  return {
    x: round(clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)),
    y: round(clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)),
  };
}

function getCurrentPlayerPoint(playerMarker, playerPosition) {
  const markerX = Number(playerMarker?.dataset?.x);
  const markerY = Number(playerMarker?.dataset?.y);

  return {
    x: round(Number.isFinite(markerX) ? markerX : Number(playerPosition?.x || 50)),
    y: round(Number.isFinite(markerY) ? markerY : Number(playerPosition?.y || 50)),
  };
}

function applyMarkerPosition(marker, x, y, angle = 0) {
  marker.style.left = `${x}%`;
  marker.style.top = `${y}%`;
  marker.dataset.x = String(x);
  marker.dataset.y = String(y);
  marker.dataset.angle = String(angle);
  marker.style.setProperty('--player-angle', `${angle}deg`);
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

  const objectsLayer = createMapObjectsLayer();
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

    <div class="admin-grid-2">
      <label class="admin-label">
        X
        <input class="admin-input admin-edit-x" type="number" step="0.1" min="0" max="100" />
      </label>

      <label class="admin-label">
        Y
        <input class="admin-input admin-edit-y" type="number" step="0.1" min="0" max="100" />
      </label>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-nudge-left" type="button">←</button>
      <button class="admin-btn admin-nudge-up" type="button">↑</button>
      <button class="admin-btn admin-nudge-down" type="button">↓</button>
      <button class="admin-btn admin-nudge-right" type="button">→</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-save-selected" type="button">Сохранить</button>
      <button class="admin-btn admin-delete-selected" type="button">Удалить</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-copy-coords" type="button">Копировать XY</button>
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
  const btnSaveSelected = panel.querySelector('.admin-save-selected');
  const btnDeleteSelected = panel.querySelector('.admin-delete-selected');
  const btnClearAll = panel.querySelector('.admin-clear-all');
  const btnCopy = panel.querySelector('.admin-copy-coords');

  const btnLeft = panel.querySelector('.admin-nudge-left');
  const btnRight = panel.querySelector('.admin-nudge-right');
  const btnUp = panel.querySelector('.admin-nudge-up');
  const btnDown = panel.querySelector('.admin-nudge-down');

  const typeSelect = panel.querySelector('.admin-object-type');
  const houseClassWrap = panel.querySelector('.admin-house-class-wrap');
  const houseClassSelect = panel.querySelector('.admin-house-class');
  const nameInput = panel.querySelector('.admin-object-name');

  const editXInput = panel.querySelector('.admin-edit-x');
  const editYInput = panel.querySelector('.admin-edit-y');

  const xEl = panel.querySelector('.admin-x');
  const yEl = panel.querySelector('.admin-y');
  const selectedNameEl = panel.querySelector('.admin-selected-name');

  typeSelect.value = selectedType;
  houseClassSelect.value = selectedVariant;

  function getSelectedObject() {
    return objects.find((object) => object.id === selectedObjectId) || null;
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
      editXInput.value = '';
      editYInput.value = '';
      return;
    }

    selectedNameEl.textContent = `${object.icon || '◆'} ${object.name || object.type}`;
    nameInput.value = object.name || '';
    typeSelect.value = object.type || 'marker';
    selectedType = typeSelect.value;

    if (object.type === 'house') {
      selectedVariant = object.variant || object.payload?.houseClass || 'standard';
      houseClassSelect.value = selectedVariant;
    }

    editXInput.value = String(round(object.x));
    editYInput.value = String(round(object.y));

    updateVariantVisibility();
  }

  function updateSelectedObject(objectId) {
    selectedObjectId = objectId || null;
    fillEditor(getSelectedObject());
  }

  async function reloadObjects() {
    objects = await getMapObjects(cityId);
    renderMapObjects(objectsLayer, objects);
    fillEditor(getSelectedObject());
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    root.dataset.adminMode = enabled ? 'enabled' : 'disabled';
    panel.hidden = !enabled;

    if (!enabled) {
      teleportMode = false;
      placeMode = false;
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

  async function teleportTo(x, y) {
    const angle = Number(playerPosition.angle || playerMarker.dataset.angle || 0);

    playerPosition.x = x;
    playerPosition.y = y;
    playerPosition.angle = angle;

    applyMarkerPosition(playerMarker, x, y, angle);
    mapControls?.focusOnPlayer?.(x, y);

    window.dispatchEvent(new CustomEvent('mn:player-teleport', {
      detail: { x, y, angle },
    }));

    movementChannel?.sendMove?.({
      playerId: getLocalPlayerId(),
      nickname,
      cityId,
      x,
      y,
      angle,
      updatedAt: new Date().toISOString(),
    });

    try {
      await updatePlayerPosition({ cityId, nickname, x, y, angle });
    } catch (error) {
      console.warn('[adminPanel] teleport save failed:', error);
    }
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

    const x = clamp(Number(editXInput.value || object.x), 0, 100);
    const y = clamp(Number(editYInput.value || object.y), 0, 100);

    const config = getMapObjectType(selectedType);

    const nextPatch = {
      ...patch,
      name: nameInput.value.trim() || object.name,
      type: selectedType,
      category: config.category,
      variant: selectedType === 'house' ? selectedVariant : '',
      x: round(x),
      y: round(y),
      updatedAt: new Date().toISOString(),
    };

    if (selectedType === 'house') {
      nextPatch.payload = {
        ...(object.payload || {}),
        houseClass: selectedVariant,
      };
    }

    await updateMapObject(cityId, object.id, nextPatch);
    await reloadObjects();
  }

  async function moveSelectedBy(dx, dy) {
    const object = getSelectedObject();
    if (!object) return;

    const x = round(clamp(Number(object.x) + dx, 0, 100));
    const y = round(clamp(Number(object.y) + dy, 0, 100));

    editXInput.value = String(x);
    editYInput.value = String(y);

    await saveSelectedObject({ x, y });
  }

  async function moveSelectedToPlayer() {
    const object = getSelectedObject();
    if (!object) return;

    const point = getCurrentPlayerPoint(playerMarker, playerPosition);

    editXInput.value = String(point.x);
    editYInput.value = String(point.y);

    await saveSelectedObject({ x: point.x, y: point.y });
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
      teleportTo(point.x, point.y);
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
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isFormField = tag === 'input' || tag === 'textarea' || tag === 'select';

    const isAdminHotkey =
      event.code === 'KeyP' ||
      event.key?.toLowerCase() === 'p' ||
      event.key?.toLowerCase() === 'з';

    if (isAdminHotkey && !isFormField) {
      event.preventDefault();
      togglePanel();
      return;
    }

    if (!enabled) return;

    if (event.key === 'Escape' && !isFormField) {
      event.preventDefault();
      setEnabled(false);
      return;
    }

    if (event.key === 'Enter') {
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
  btnSaveSelected.addEventListener('click', () => saveSelectedObject());

  btnLeft.addEventListener('click', () => moveSelectedBy(-0.5, 0));
  btnRight.addEventListener('click', () => moveSelectedBy(0.5, 0));
  btnUp.addEventListener('click', () => moveSelectedBy(0, -0.5));
  btnDown.addEventListener('click', () => moveSelectedBy(0, 0.5));

  btnCopy.addEventListener('click', async () => {
    const object = getSelectedObject();
    const text = object
      ? JSON.stringify(object, null, 2)
      : `{ x: ${xEl.textContent}, y: ${yEl.textContent} }`;

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

  typeSelect.addEventListener('change', () => {
    selectedType = typeSelect.value;
    updateVariantVisibility();
  });

  houseClassSelect.addEventListener('change', () => {
    selectedVariant = houseClassSelect.value;
  });

  editXInput.addEventListener('change', () => saveSelectedObject());
  editYInput.addEventListener('change', () => saveSelectedObject());

  viewport.addEventListener('click', onMapClick, true);
  viewport.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('mn:admin-toggle', onAdminToggle);

  updateVariantVisibility();
  reloadObjects();
  setEnabled(false);

  return () => {
    viewport.removeEventListener('click', onMapClick, true);
    viewport.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('mn:admin-toggle', onAdminToggle);

    panel.remove();
    objectsLayer.remove();

    delete root.dataset.adminMode;
  };
}
