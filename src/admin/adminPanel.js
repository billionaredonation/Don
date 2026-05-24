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

  const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
  const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

  return {
    x: round(x),
    y: round(y),
  };
}

function getCurrentPlayerPoint(playerMarker, playerPosition) {
  const markerX = Number(playerMarker?.dataset?.x);
  const markerY = Number(playerMarker?.dataset?.y);

  const x = Number.isFinite(markerX) ? markerX : Number(playerPosition?.x || 50);
  const y = Number.isFinite(markerY) ? markerY : Number(playerPosition?.y || 50);

  return {
    x: round(x),
    y: round(y),
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
    .map((type) => `
      <option value="${type.type}">
        ${type.icon} ${type.label}
      </option>
    `)
    .join('');
}

function createHouseClassOptionsHtml() {
  return getHouseClassesList()
    .map((item) => `
      <option value="${item.value}">
        ${item.icon} ${item.label}
      </option>
    `)
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

    <div class="admin-hint">
      P — открыть/закрыть. Enter — поставить объект на позицию игрока. ESC — закрыть.
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-toggle-teleport" type="button">Телепорт: OFF</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-copy-coords" type="button">Скопировать координаты</button>
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
      <input class="admin-input admin-object-name" placeholder="Например: дом у вокзала" />
    </label>

    <div class="admin-row">
      <button class="admin-btn admin-place-here" type="button">Поставить на моей позиции</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-toggle-place" type="button">Добавление кликом: OFF</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-delete-selected" type="button">Удалить выбранный</button>
      <button class="admin-btn admin-clear-all" type="button">Очистить</button>
    </div>

    <div class="admin-separator"></div>

    <div class="admin-coords">
      X: <b class="admin-x">0</b> · Y: <b class="admin-y">0</b>
    </div>

    <div class="admin-selected">
      Выбран: <b class="admin-selected-id">нет</b>
    </div>
  `;

  root.appendChild(panel);

  const btnClose = panel.querySelector('.admin-close');
  const btnTeleport = panel.querySelector('.admin-toggle-teleport');
  const btnCopy = panel.querySelector('.admin-copy-coords');
  const btnPlace = panel.querySelector('.admin-toggle-place');
  const btnPlaceHere = panel.querySelector('.admin-place-here');
  const btnDeleteSelected = panel.querySelector('.admin-delete-selected');
  const btnClearAll = panel.querySelector('.admin-clear-all');

  const typeSelect = panel.querySelector('.admin-object-type');
  const houseClassWrap = panel.querySelector('.admin-house-class-wrap');
  const houseClassSelect = panel.querySelector('.admin-house-class');
  const nameInput = panel.querySelector('.admin-object-name');

  const xEl = panel.querySelector('.admin-x');
  const yEl = panel.querySelector('.admin-y');
  const selectedIdEl = panel.querySelector('.admin-selected-id');

  let selectedObjectId = null;

  typeSelect.value = selectedType;
  houseClassSelect.value = selectedVariant;

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

  function updateSelectedObject(objectId) {
    selectedObjectId = objectId || null;
    selectedIdEl.textContent = selectedObjectId || 'нет';
  }

  async function reloadObjects() {
    objects = await getMapObjects(cityId);
    renderMapObjects(objectsLayer, objects);
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    root.dataset.adminMode = enabled ? 'enabled' : 'disabled';
    panel.hidden = !enabled;

    if (!enabled) {
      teleportMode = false;
      placeMode = false;
      btnTeleport.textContent = 'Телепорт: OFF';
      btnPlace.textContent = 'Добавление кликом: OFF';
    } else {
      const point = getCurrentPlayerPoint(playerMarker, playerPosition);
      updateCoords(point.x, point.y);
    }
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
      await updatePlayerPosition({
        cityId,
        nickname,
        x,
        y,
        angle,
      });
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

    updateSelectedObject(createdObject.id);
    await reloadObjects();
  }

  async function addObjectAtPlayerPosition() {
    const point = getCurrentPlayerPoint(playerMarker, playerPosition);
    updateCoords(point.x, point.y);
    await addObjectAt(point.x, point.y);
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

    if (event.key.toLowerCase() === 'p' && !isFormField) {
      event.preventDefault();
      setEnabled(!enabled);
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
      addObjectAtPlayerPosition();
    }
  }

  btnClose.addEventListener('click', () => setEnabled(false));

  btnTeleport.addEventListener('click', () => {
    teleportMode = !teleportMode;
    placeMode = false;

    btnTeleport.textContent = teleportMode ? 'Телепорт: ON' : 'Телепорт: OFF';
    btnPlace.textContent = 'Добавление кликом: OFF';
  });

  btnPlace.addEventListener('click', () => {
    placeMode = !placeMode;
    teleportMode = false;

    btnPlace.textContent = placeMode ? 'Добавление кликом: ON' : 'Добавление кликом: OFF';
    btnTeleport.textContent = 'Телепорт: OFF';
  });

  btnPlaceHere.addEventListener('click', () => {
    addObjectAtPlayerPosition();
  });

  btnCopy.addEventListener('click', async () => {
    const text = `{ x: ${xEl.textContent}, y: ${yEl.textContent} }`;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.log(text);
    }
  });

  btnDeleteSelected.addEventListener('click', async () => {
    if (!selectedObjectId) return;

    await deleteMapObject(cityId, selectedObjectId);
    updateSelectedObject(null);
    await reloadObjects();
  });

  btnClearAll.addEventListener('click', async () => {
    const confirmed = window.confirm('Удалить все объекты на этой карте?');
    if (!confirmed) return;

    await clearMapObjects(cityId);
    updateSelectedObject(null);
    await reloadObjects();
  });

  typeSelect.addEventListener('change', () => {
    selectedType = typeSelect.value;
    updateVariantVisibility();
  });

  houseClassSelect.addEventListener('change', () => {
    selectedVariant = houseClassSelect.value;
  });

  viewport.addEventListener('click', onMapClick, true);
  viewport.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);

  updateVariantVisibility();
  reloadObjects();
  setEnabled(false);

  return () => {
    viewport.removeEventListener('click', onMapClick, true);
    viewport.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);

    panel.remove();
    objectsLayer.remove();

    delete root.dataset.adminMode;
  };
}
