import { updatePlayerPosition, getLocalPlayerId } from '../player/playerPosition.js';

import { getMapObjectTypesList, createMapObjectDraft } from '../mapObjects/mapObjectTypes.js';
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
  let selectedType = 'tree';
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
      P — открыть/закрыть. ESC — закрыть.
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

    <label class="admin-label">
      Название
      <input class="admin-input admin-object-name" placeholder="Например: дерево / дом / магазин" />
    </label>

    <div class="admin-row">
      <button class="admin-btn admin-toggle-place" type="button">Добавление: OFF</button>
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
  const btnDeleteSelected = panel.querySelector('.admin-delete-selected');
  const btnClearAll = panel.querySelector('.admin-clear-all');
  const typeSelect = panel.querySelector('.admin-object-type');
  const nameInput = panel.querySelector('.admin-object-name');
  const xEl = panel.querySelector('.admin-x');
  const yEl = panel.querySelector('.admin-y');
  const selectedIdEl = panel.querySelector('.admin-selected-id');

  let selectedObjectId = null;

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
      btnPlace.textContent = 'Добавление: OFF';
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
      x,
      y,
      name: nameInput.value.trim(),
    });

    const createdObject = await addMapObject(cityId, draft);

    updateSelectedObject(createdObject.id);
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

    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (event.key.toLowerCase() === 'p') {
      event.preventDefault();
      setEnabled(!enabled);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setEnabled(false);
    }
  }

  btnClose.addEventListener('click', () => setEnabled(false));

  btnTeleport.addEventListener('click', () => {
    teleportMode = !teleportMode;
    placeMode = false;

    btnTeleport.textContent = teleportMode ? 'Телепорт: ON' : 'Телепорт: OFF';
    btnPlace.textContent = 'Добавление: OFF';
  });

  btnPlace.addEventListener('click', () => {
    placeMode = !placeMode;
    teleportMode = false;

    btnPlace.textContent = placeMode ? 'Добавление: ON' : 'Добавление: OFF';
    btnTeleport.textContent = 'Телепорт: OFF';
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
  });

  viewport.addEventListener('click', onMapClick, true);
  viewport.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);

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
