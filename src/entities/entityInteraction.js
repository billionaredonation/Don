import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

import {
  createMapObjectsLayer,
  renderMapObjects,
  getMapObjectIdFromEvent,
} from '../mapObjects/mapObjectsRenderer.js';

import { dispatchEntityAction } from './entityActions.js';
import { renderEntityPanelContent } from './panels/entityPanelView.js';

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

  object.owner_id = ownerId;
  object.ownerName = ownerName;

  object.payload = {
    ...(object.payload || {}),
    ownerId,
    ownerName,
    owned: true,
  };

  return object;
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

    markObjectAsPurchased(selectedObject, ownerId, ownerName);
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
}) {
  if (!root || !viewport || !cityId || !panel) return null;

  const layer = createMapObjectsLayer();
  layer.classList.add('map-objects-layer-public');
  layer.dataset.cityId = String(cityId);

  viewport.appendChild(layer);

  let mapObjects = [];
  let reloadTimer = null;
  let destroyed = false;

  async function reloadObjects() {
    if (destroyed) return;

    const objects = await getMapObjects(cityId);

    if (destroyed) return;

    mapObjects = Array.isArray(objects) ? objects.filter(Boolean) : [];

    renderMapObjects(layer, mapObjects);

    window.dispatchEvent(new CustomEvent('mn:map-objects-rendered', {
      detail: {
        cityId,
        count: mapObjects.length,
      },
    }));
  }

  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reloadObjects, 250);
  }

  function onClick(event) {
    const clickedObjectId = getMapObjectIdFromEvent(event);
    if (!clickedObjectId) return;

    const object = mapObjects.find((item) => String(item.id) === String(clickedObjectId));
    if (!object) return;

    event.preventDefault();
    event.stopPropagation();

    panel.open(object);
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

  layer.addEventListener('click', onClick);
  layer.addEventListener('pointerdown', onClick);

  window.addEventListener('mn:map-objects-changed', onObjectsChanged);
  window.addEventListener('mn:house-purchased-local', onHousePurchased);

  reloadObjects();

  return () => {
    destroyed = true;
    clearTimeout(reloadTimer);

    layer.removeEventListener('click', onClick);
    layer.removeEventListener('pointerdown', onClick);

    window.removeEventListener('mn:map-objects-changed', onObjectsChanged);
    window.removeEventListener('mn:house-purchased-local', onHousePurchased);

    layer.remove();
  };
}
