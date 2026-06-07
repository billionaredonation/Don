import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

import {
  createMapObjectsLayer,
  renderMapObjects,
  getMapObjectIdFromEvent,
  findMapObjectElement,
} from '../mapObjects/mapObjectsRenderer.js';

import { dispatchEntityAction } from './entityActions.js';
import { renderEntityPanelContent } from './panels/entityPanelView.js';

const INTERACTION_RADIUS_PX = 64;
const MOBILE_INTERACTION_RADIUS_PX = 118;
const DIRECT_TAP_RADIUS_PX = 170;
const INTERACTION_HINT_VISIBLE_MS = 2200;

function getPurchasedHouseId(detail = {}) {
  return detail.houseId || detail.result?.houseId || detail.house?.payload?.houseId || null;
}

function getPurchasedMapObjectId(detail = {}) {
  return detail.mapObjectId || detail.house?.id || null;
}

function getPurchasedOwnerId(detail = {}) {
  return detail.ownerId || detail.result?.ownerId || detail.result?.playerId || null;
}

function getPurchasedOwnerName(detail = {}) {
  return detail.ownerName || detail.result?.ownerName || 'Игрок';
}

function getMapObjectHouseId(object) {
  return object?.payload?.houseId || object?.houseId || null;
}

function isSameHouseObject(object, purchasedHouseId, purchasedMapObjectId) {
  if (!object) return false;

  if (purchasedMapObjectId && String(object.id) === String(purchasedMapObjectId)) {
    return true;
  }

  if (purchasedHouseId && String(getMapObjectHouseId(object)) === String(purchasedHouseId)) {
    return true;
  }

  return false;
}

function markObjectAsPurchased(object, ownerId, ownerName) {
  if (!object || !ownerId) return object;

  return {
    ...object,
    owner_id: ownerId,
    ownerName,
    payload: {
      ...(object.payload || {}),
      ownerId,
      ownerName,
      owned: true,
    },
  };
}

function isTypingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();

  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target?.isContentEditable === true
  );
}

function isInteractKey(event) {
  const key = String(event.key || '').toLowerCase();

  return (
    event.code === 'KeyE' ||
    key === 'e' ||
    key === 'у'
  );
}

function isMobileGameplayDevice() {
  const hasTouch = navigator.maxTouchPoints > 0;
  const narrowScreen =
    Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 820;

  return hasTouch && narrowScreen;
}

function isMobilePointerEvent(event) {
  if (event?.pointerType === 'touch') return true;
  if (event?.pointerType === 'pen') return true;

  return isMobileGameplayDevice();
}

function getGameplayRoot(root) {
  return (
    document.querySelector('.gta-map-stage') ||
    document.querySelector('.home-gameplay') ||
    root ||
    document.body
  );
}

function getElementCenter(element) {
  if (!element) return null;

  const rect = element.getBoundingClientRect();

  if (!rect.width && !rect.height) return null;

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function getObjectDistancePx({
  object,
  objectElement,
  playerMarker,
  playerPosition,
  viewport,
}) {
  const playerCenter = getElementCenter(playerMarker);
  const objectCenter = getElementCenter(objectElement);

  if (playerCenter && objectCenter) {
    return Math.hypot(
      objectCenter.x - playerCenter.x,
      objectCenter.y - playerCenter.y
    );
  }

  if (!object || !playerPosition || !viewport) {
    return Number.POSITIVE_INFINITY;
  }

  const rect = viewport.getBoundingClientRect();

  const objectX = Number(object.x || 50);
  const objectY = Number(object.y || 50);
  const playerX = Number(playerPosition.x || 50);
  const playerY = Number(playerPosition.y || 50);

  const dx = ((objectX - playerX) / 100) * rect.width;
  const dy = ((objectY - playerY) / 100) * rect.height;

  return Math.hypot(dx, dy);
}

function showInteractionNotice(root, message) {
  if (!root || !message) return;

  let notice = root.querySelector('.entity-interaction-notice');

  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'entity-interaction-notice';
    getGameplayRoot(root).appendChild(notice);
  }

  notice.textContent = message;
  notice.hidden = false;

  clearTimeout(notice._hideTimer);

  notice._hideTimer = setTimeout(() => {
    notice.hidden = true;
  }, 1400);
}

function createInteractionHint(root) {
  const hint = document.createElement('div');

  hint.className = 'entity-interaction-hint';
  hint.hidden = true;
  hint.innerHTML = `
    <b data-interaction-hint-key>E</b>
    <span data-interaction-hint-text>Взаимодействовать</span>
  `;

  getGameplayRoot(root).appendChild(hint);

  return hint;
}

function moveLayerAboveMap(viewport, layer) {
  if (!viewport || !layer) return;

  viewport.appendChild(layer);

  layer.style.position = 'absolute';
  layer.style.inset = '0';
  layer.style.display = 'block';
  layer.style.width = '100%';
  layer.style.height = '100%';
  layer.style.overflow = 'visible';
  layer.style.visibility = 'visible';
  layer.style.opacity = '1';
  layer.style.zIndex = '240';
  layer.style.pointerEvents = 'none';
}

export function createEntityInteractionPanel(root) {
  const panel = document.createElement('section');
  panel.className = 'house-selection-panel';
  panel.hidden = true;

  panel.innerHTML = `
    <button class="house-selection-close" type="button" aria-label="Закрыть">×</button>
    <div class="house-selection-icon">◆</div>
    <div class="house-selection-body">
      <strong class="house-selection-title">Сущность</strong>
      <span class="house-selection-meta"></span>
    </div>
    <button class="house-selection-action" type="button">Выбрать</button>
  `;

  root.appendChild(panel);

  const closeButton = panel.querySelector('.house-selection-close');
  const titleEl = panel.querySelector('.house-selection-title');
  const metaEl = panel.querySelector('.house-selection-meta');
  const iconEl = panel.querySelector('.house-selection-icon');
  const actionButton = panel.querySelector('.house-selection-action');

  let selectedObject = null;

  function renderSelectedObject() {
    if (!selectedObject) return;

    renderEntityPanelContent({
      iconEl,
      titleEl,
      metaEl,
      actionButton,
      object: selectedObject,
    });
  }

  function close() {
    selectedObject = null;
    panel.hidden = true;
  }

  function open(object) {
    selectedObject = object;
    renderSelectedObject();
    panel.hidden = false;
  }

  function handleHousePurchased(event) {
    const purchasedHouseId = getPurchasedHouseId(event.detail);
    const purchasedMapObjectId = getPurchasedMapObjectId(event.detail);
    const ownerId = getPurchasedOwnerId(event.detail);
    const ownerName = getPurchasedOwnerName(event.detail);

    if (!selectedObject || !isSameHouseObject(selectedObject, purchasedHouseId, purchasedMapObjectId)) {
      return;
    }

    selectedObject = markObjectAsPurchased(selectedObject, ownerId, ownerName);
    renderSelectedObject();
  }

  closeButton.addEventListener('click', close);

  actionButton.addEventListener('click', () => {
    if (!selectedObject) return;
    dispatchEntityAction(selectedObject);
  });

  window.addEventListener('mn:house-purchased-local', handleHousePurchased);

  return {
    open,
    close,

    isOpen() {
      return Boolean(selectedObject) && panel.hidden === false;
    },

    getSelectedObject() {
      return selectedObject;
    },

    updateSelectedObject(updater) {
      if (!selectedObject || typeof updater !== 'function') return;

      selectedObject = updater(selectedObject) || selectedObject;
      renderSelectedObject();
    },

    cleanup() {
      window.removeEventListener('mn:house-purchased-local', handleHousePurchased);
      panel.remove();
    },
  };
}

export function enableEntityInteraction({
  root,
  viewport,
  cityId,
  panel,
  playerMarker,
  playerPosition,
}) {
  if (!root || !viewport || !cityId || !panel) return null;

  const layer = createMapObjectsLayer();

  layer.classList.add('map-objects-layer-public');
  layer.dataset.cityId = String(cityId);

  moveLayerAboveMap(viewport, layer);

  const hint = createInteractionHint(root);

  let mapObjects = [];
  let reloadTimer = null;
  let destroyed = false;
  let nearestObjectId = null;
  let lastHintObjectId = null;
  let hintHideTimer = null;
  let rafId = 0;

  async function reloadObjects() {
    if (destroyed) return;

    let objects = [];

    try {
      objects = await getMapObjects(cityId);
    } catch (error) {
      console.warn('[entityInteraction] map objects load failed:', error);
      objects = [];
    }

    if (destroyed) return;

    mapObjects = Array.isArray(objects)
      ? objects.filter(Boolean)
      : [];

    moveLayerAboveMap(viewport, layer);
    renderMapObjects(layer, mapObjects);

    console.log('[entityInteraction] rendered map objects:', {
      cityId,
      count: mapObjects.length,
      layerChildren: layer.children.length,
    });

    window.dispatchEvent(new CustomEvent('mn:map-objects-rendered', {
      detail: {
        cityId,
        count: mapObjects.length,
        layerChildren: layer.children.length,
      },
    }));
  }

  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reloadObjects, 250);
  }

  function getObjectById(objectId) {
    if (!objectId) return null;

    return mapObjects.find((item) => String(item.id) === String(objectId)) || null;
  }

  function getDistanceToObject(object) {
    if (!object) return Number.POSITIVE_INFINITY;

    const objectElement = findMapObjectElement(layer, object.id);

    return getObjectDistancePx({
      object,
      objectElement,
      playerMarker,
      playerPosition,
      viewport,
    });
  }

  function getInteractionRadius() {
    return isMobileGameplayDevice()
      ? MOBILE_INTERACTION_RADIUS_PX
      : INTERACTION_RADIUS_PX;
  }

  function isObjectInInteractionRange(object, { directTap = false } = {}) {
    const radius = directTap && isMobileGameplayDevice()
      ? DIRECT_TAP_RADIUS_PX
      : getInteractionRadius();

    return getDistanceToObject(object) <= radius;
  }

  function getNearestInteractableObject() {
    let bestObject = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    mapObjects.forEach((object) => {
      if (!object) return;

      const distance = getDistanceToObject(object);

      if (distance <= getInteractionRadius() && distance < bestDistance) {
        bestObject = object;
        bestDistance = distance;
      }
    });

    return bestObject;
  }

  function clearNearestVisual() {
    if (!nearestObjectId) return;

    findMapObjectElement(layer, nearestObjectId)?.classList.remove('map-object-nearby');
    nearestObjectId = null;
  }

  function setNearestVisual(object) {
    const nextId = object?.id ? String(object.id) : null;

    if (nearestObjectId === nextId) return;

    clearNearestVisual();

    nearestObjectId = nextId;

    if (nearestObjectId) {
      findMapObjectElement(layer, nearestObjectId)?.classList.add('map-object-nearby');
    }
  }

  function hideInteractionHint({ reset = false } = {}) {
    clearTimeout(hintHideTimer);
    hintHideTimer = null;

    hint.hidden = true;
    hint.classList.remove('is-visible');

    if (reset) {
      lastHintObjectId = null;
    }
  }

  function showInteractionHintOnce(object) {
    if (!object?.id) return;

    const objectId = String(object.id);

    if (lastHintObjectId === objectId) return;

    lastHintObjectId = objectId;

    const keyEl = hint.querySelector('[data-interaction-hint-key]');
    const textEl = hint.querySelector('[data-interaction-hint-text]');

    if (isMobileGameplayDevice()) {
      if (keyEl) keyEl.textContent = '🏠';
      if (textEl) textEl.textContent = 'Нажми на дом';
    } else {
      if (keyEl) keyEl.textContent = 'E';
      if (textEl) textEl.textContent = 'Взаимодействовать';
    }

    hint.hidden = false;
    hint.classList.add('is-visible');

    clearTimeout(hintHideTimer);

    hintHideTimer = setTimeout(() => {
      hideInteractionHint();
    }, INTERACTION_HINT_VISIBLE_MS);
  }

  function updateInteractionHint() {
    if (destroyed) return;

    if (panel?.isOpen?.()) {
      hideInteractionHint();
      rafId = requestAnimationFrame(updateInteractionHint);
      return;
    }

    const nearest = getNearestInteractableObject();

    setNearestVisual(nearest);

    if (!nearest) {
      hideInteractionHint({ reset: true });
      rafId = requestAnimationFrame(updateInteractionHint);
      return;
    }

    showInteractionHintOnce(nearest);

    rafId = requestAnimationFrame(updateInteractionHint);
  }

  function tryOpenObject(object, { silent = false, directTap = false } = {}) {
    if (!object) return false;

    if (!isObjectInInteractionRange(object, { directTap })) {
      if (!silent) {
        showInteractionNotice(root, 'Подойди ближе');
      }

      return false;
    }

    hideInteractionHint();

    panel.open(object);
    return true;
  }

  function onClick(event) {
    const clickedObjectId = getMapObjectIdFromEvent(event);
    if (!clickedObjectId) return;

    const object = getObjectById(clickedObjectId);
    if (!object) return;

    event.preventDefault();
    event.stopPropagation();

    tryOpenObject(object, {
      directTap: isMobilePointerEvent(event),
    });
  }

  function onKeyDown(event) {
    if (!isInteractKey(event)) return;
    if (event.repeat) return;
    if (isTypingTarget(event.target)) return;

    const nearest = getNearestInteractableObject();

    if (!nearest) return;

    event.preventDefault();
    event.stopPropagation();

    tryOpenObject(nearest, { silent: true });
  }

  function onObjectsChanged(event) {
    if (event?.detail?.cityId && String(event.detail.cityId) !== String(cityId)) return;

    scheduleReload();
  }

  function onHousePurchased(event) {
    const purchasedHouseId = getPurchasedHouseId(event.detail);
    const purchasedMapObjectId = getPurchasedMapObjectId(event.detail);
    const ownerId = getPurchasedOwnerId(event.detail);
    const ownerName = getPurchasedOwnerName(event.detail);

    if (!ownerId) return;

    let changed = false;

    mapObjects = mapObjects.map((object) => {
      if (!isSameHouseObject(object, purchasedHouseId, purchasedMapObjectId)) return object;

      changed = true;
      return markObjectAsPurchased(object, ownerId, ownerName);
    });

    if (!changed) return;

    renderMapObjects(layer, mapObjects);

    if (typeof panel.updateSelectedObject === 'function') {
      panel.updateSelectedObject((selectedObject) => {
        if (!isSameHouseObject(selectedObject, purchasedHouseId, purchasedMapObjectId)) {
          return selectedObject;
        }

        return markObjectAsPurchased(selectedObject, ownerId, ownerName);
      });
    }

    scheduleReload();
  }

  layer.addEventListener('click', onClick, true);
  layer.addEventListener('pointerdown', onClick, true);
  window.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('mn:map-objects-changed', onObjectsChanged);
  window.addEventListener('mn:house-purchased-local', onHousePurchased);

  reloadObjects();
  rafId = requestAnimationFrame(updateInteractionHint);

  return () => {
    destroyed = true;
    clearTimeout(reloadTimer);
    clearTimeout(hintHideTimer);
    cancelAnimationFrame(rafId);

    layer.removeEventListener('click', onClick, true);
    layer.removeEventListener('pointerdown', onClick, true);
    window.removeEventListener('keydown', onKeyDown, true);

    window.removeEventListener('mn:map-objects-changed', onObjectsChanged);
    window.removeEventListener('mn:house-purchased-local', onHousePurchased);

    clearNearestVisual();

    hint.remove();
    layer.remove();
  };
}
