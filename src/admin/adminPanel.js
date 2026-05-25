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
  let moveMode = false;
  let moveSnapshot = null;

  let selectedType = 'house';
  let selectedVariant = 'standard';
  let objects = [];
  let selectedObjectId = null;

  const objectsLayer = createMapObjectsLayer();
  objectsLayer.classList.add('map-objects-layer-admin');
  viewport.appendChild(objectsLayer);

  const panel = document.createElement('aside');
  panel.className = 'admin-panel';
  panel.hidden = true;

  panel.innerHTML = `
    <div class="admin-panel-head">
      <strong>ADMIN</strong>
      <button class="admin-btn admin-close" type="button">Ã—</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-toggle-teleport" type="button">Ð¢ÐµÐ»ÐµÐ¿Ð¾Ñ€Ñ‚: OFF</button>
      <button class="admin-btn admin-toggle-place" type="button">ÐšÐ»Ð¸Ðº: OFF</button>
    </div>

    <div class="admin-separator"></div>

    <label class="admin-label">
      Ð¢Ð¸Ð¿ Ð¾Ð±ÑŠÐµÐºÑ‚Ð°
      <select class="admin-select admin-object-type">
        ${createObjectOptionsHtml()}
      </select>
    </label>

    <label class="admin-label admin-house-class-wrap">
      ÐšÐ»Ð°ÑÑ Ð´Ð¾Ð¼Ð°
      <select class="admin-select admin-house-class">
        ${createHouseClassOptionsHtml()}
      </select>
    </label>

    <label class="admin-label">
      ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ
      <input class="admin-input admin-object-name" placeholder="ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð´Ð¾Ð¼Ð° / Ð±Ð¸Ð·Ð½ÐµÑÐ°" />
    </label>

    <div class="admin-row">
      <button class="admin-btn admin-place-here" type="button">ÐŸÐ¾ÑÑ‚Ð°Ð²Ð¸Ñ‚ÑŒ Ñ‚ÑƒÑ‚</button>
      <button class="admin-btn admin-move-selected-here" type="button">ÐŸÐµÑ€ÐµÐ½ÐµÑÑ‚Ð¸ ÑÑŽÐ´Ð°</button>
    </div>

    <div class="admin-separator"></div>

    <div class="admin-editor-title">Ð’Ñ‹Ð±Ñ€Ð°Ð½Ð½Ñ‹Ð¹ Ð¾Ð±ÑŠÐµÐºÑ‚</div>

    <div class="admin-selected">
      <span class="admin-selected-name">Ð½ÐµÑ‚</span>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-start-move" type="button">Ð”Ð²Ð¸Ð³Ð°Ñ‚ÑŒ</button>
      <button class="admin-btn admin-save-selected" type="button">Ð¡Ð¾Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑŒ</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-delete-selected" type="button">Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-copy-coords" type="button">ÐšÐ¾Ð¿Ð¸Ñ€Ð¾Ð²Ð°Ñ‚ÑŒ JSON</button>
      <button class="admin-btn admin-clear-all" type="button">ÐžÑ‡Ð¸ÑÑ‚Ð¸Ñ‚ÑŒ</button>
    </div>

    <div class="admin-coords">
      ÐšÑƒÑ€ÑÐ¾Ñ€: X <b class="admin-x">0</b> Â· Y <b class="admin-y">0</b>
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

  typeSelect.value = selectedType;
  houseClassSelect.value = selectedVariant;

  function getSelectedObject() {
    if (!selectedObjectId) return null;

    return objects.find((object) => String(object.id) === String(selectedObjectId)) || null;
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
      selectedNameEl.textContent = 'Ð½ÐµÑ‚';
      return;
    }

    selectedNameEl.textContent = `${object.icon || 'â—†'} ${object.name || object.type}`;

    nameInput.value = object.name || '';
    typeSelect.value = object.type || 'marker';
    selectedType = typeSelect.value;

    if (object.type === 'house') {
      selectedVariant = object.variant || object.payload?.houseClass || 'standard';
      houseClassSelect.value = selectedVariant;
    }

    updateVariantVisibility();
  }

  function markSelectedObject() {
    objects = objects.map((object) => ({
      ...object,
      selected: Boolean(selectedObjectId) && String(object.id) === String(selectedObjectId),
    }));

    renderMapObjects(objectsLayer, objects);
  }

  function updateSelectedObject(objectId) {
    selectedObjectId = objectId ? String(objectId) : null;

    markSelectedObject();
    fillEditor(getSelectedObject());

    console.log('[adminPanel] selected object:', {
      selectedObjectId,
      selectedObject: getSelectedObject(),
    });
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

  function setEnabled(next) {
    enabled = Boolean(next);
    root.dataset.adminMode = enabled ? 'enabled' : 'disabled';
    panel.hidden = !enabled;

    if (!enabled) {
      teleportMode = false;
      placeMode = false;
      setMoveMode(false);
      btnTeleport.textContent = 'Ð¢ÐµÐ»ÐµÐ¿Ð¾Ñ€Ñ‚: OFF';
      btnPlace.textContent = 'ÐšÐ»Ð¸Ðº: OFF';
    } else {
      const point = getCurrentPlayerPoint(playerMarker, playerPosition);
      updateCoords(point.x, point.y);
    }
  }

  function setMoveMode(next) {
    moveMode = Boolean(next);
    root.dataset.adminMoveMode = moveMode ? 'enabled' : 'disabled';

    if (moveMode) {
      panel.hidden = true;
    } else if (enabled) {
      panel.hidden = false;
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

    const config = getMapObjectType(selectedType);

    const nextPatch = {
      ...patch,
      name: nameInput.value.trim() || object.name,
      type: selectedType,
      category: config.category,
      variant: selectedType === 'house' ? selectedVariant : '',
      updatedAt: new Date().toISOString(),
    };

    if (selectedType === 'house') {
      nextPatch.payload = {
        ...(object.payload || {}),
        kind: 'house',
        houseClass: selectedVariant,
        buyable: true,
        ownerId: object.payload?.ownerId || null,
        price: object.payload?.price || 0,
        locked: object.payload?.locked || false,
      };
    }

    if (selectedType === 'business') {
      nextPatch.payload = {
        ...(object.payload || {}),
        kind: 'business',
        businessType: object.payload?.businessType || 'shop',
        ownerId: object.payload?.ownerId || null,
        incomePerHour: object.payload?.incomePerHour || 0,
        price: object.payload?.price || 0,
        buyable: true,
      };
    }

    if (config.category === 'decor') {
      nextPatch.payload = {
        ...(object.payload || {}),
        kind: 'decor',
        collision: object.payload?.collision || false,
      };
    }

    await updateMapObject(cityId, object.id, nextPatch);
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

  function startMoveSelected() {
    const object = getSelectedObject();

    if (!object) {
      console.warn('[adminPanel] move failed: no selected object');
      return;
    }

    moveSnapshot = {
      id: object.id,
      x: object.x,
      y: object.y,
    };

    console.log('[adminPanel] move started:', {
      selectedObjectId,
      object,
    });

    setMoveMode(true);
  }

  async function saveMoveMode() {
    const object = getSelectedObject();
    if (!object) return;

    await updateMapObject(cityId, object.id, {
      x: round(object.x),
      y: round(object.y),
    });

    setMoveMode(false);
    await reloadObjects();
  }

  function cancelMoveMode() {
    const object = getSelectedObject();

    if (object && moveSnapshot) {
      object.x = moveSnapshot.x;
      object.y = moveSnapshot.y;
      renderMapObjects(objectsLayer, objects);
    }

    setMoveMode(false);
    moveSnapshot = null;
  }

  function moveSelectedVisual(dx, dy) {
    const object = getSelectedObject();
    if (!object) return;

    object.x = round(clamp(Number(object.x) + dx, 0, 100));
    object.y = round(clamp(Number(object.y) + dy, 0, 100));

    renderMapObjects(objectsLayer, objects);
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
    key === 'з' ||
    key === 'З';

  if (isAdminHotkey && !event.repeat && (!isFormField || !enabled)) {
    event.preventDefault();
    event.stopPropagation();
    togglePanel();
    return;
  }

  if (!enabled) return;

  if (moveMode) {
    let dx = 0;
    let dy = 0;

    const moveKey = key;

    if (event.key === 'ArrowLeft' || moveKey === 'a' || moveKey === 'ф') dx = -0.3;
    if (event.key === 'ArrowRight' || moveKey === 'd' || moveKey === 'в') dx = 0.3;
    if (event.key === 'ArrowUp' || moveKey === 'w' || moveKey === 'ц') dy = -0.3;
    if (event.key === 'ArrowDown' || moveKey === 's' || moveKey === 'ы') dy = 0.3;

    if (dx || dy) {
      event.preventDefault();
      moveSelectedVisual(dx, dy);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      saveMoveMode();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelMoveMode();
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

    if (!enabled) return;

    if (moveMode) {
      let dx = 0;
      let dy = 0;

      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') dx = -0.3;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') dx = 0.3;
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') dy = -0.3;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') dy = 0.3;

      if (dx || dy) {
        event.preventDefault();
        moveSelectedVisual(dx, dy);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        saveMoveMode();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        cancelMoveMode();
        return;
      }
    }

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
    btnTeleport.textContent = teleportMode ? 'Ð¢ÐµÐ»ÐµÐ¿Ð¾Ñ€Ñ‚: ON' : 'Ð¢ÐµÐ»ÐµÐ¿Ð¾Ñ€Ñ‚: OFF';
    btnPlace.textContent = 'ÐšÐ»Ð¸Ðº: OFF';
  });

  btnPlace.addEventListener('click', () => {
    placeMode = !placeMode;
    teleportMode = false;
    btnPlace.textContent = placeMode ? 'ÐšÐ»Ð¸Ðº: ON' : 'ÐšÐ»Ð¸Ðº: OFF';
    btnTeleport.textContent = 'Ð¢ÐµÐ»ÐµÐ¿Ð¾Ñ€Ñ‚: OFF';
  });

  btnPlaceHere.addEventListener('click', addObjectAtPlayerPosition);
  btnMoveSelectedHere.addEventListener('click', moveSelectedToPlayer);
  btnStartMove.addEventListener('click', startMoveSelected);
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
    if (!window.confirm('Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ Ð²ÑÐµ Ð¾Ð±ÑŠÐµÐºÑ‚Ñ‹ Ð½Ð° ÑÑ‚Ð¾Ð¹ ÐºÐ°Ñ€Ñ‚Ðµ?')) return;
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

  function onMapPointerDown(event) {
    if (!enabled) return;
    if (event.target.closest('.admin-panel')) return;

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

    panel.remove();
    objectsLayer.remove();

    delete root.dataset.adminMode;
    delete root.dataset.adminMoveMode;
  };
}
