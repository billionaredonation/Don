import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

import {
  createMapObjectsLayer,
  renderMapObjects,
  getMapObjectIdFromEvent,
} from '../mapObjects/mapObjectsRenderer.js';

import { dispatchEntityAction } from './entityActions.js';
import { renderEntityPanelContent } from './panels/entityPanelView.js';

function getPurchasedHouseId(detail = {}) {
  return (
    detail.houseId ||
    detail.house?.id ||
    detail.house?.payload?.houseId ||
    detail.result?.houseId ||
    null
  );
}

function getPurchasedOwnerId(detail = {}) {
  return (
    detail.ownerId ||
    detail.result?.ownerId ||
    detail.result?.playerId ||
    detail.house?.owner_id ||
    detail.house?.payload?.ownerId ||
    null
  );
}

function getMapObjectHouseId(object) {
  return (
    object?.payload?.houseId ||
    object?.houseId ||
    object?.id ||
    null
  );
}

function markObjectAsPurchased(object, ownerId) {
  if (!object || !ownerId) return object;

  object.owner_id = ownerId;
  object.payload = {
    ...(object.payload || {}),
    ownerId,
  };

  return object;
}

function isSameHouseObject(object, purchasedHouseId) {
  if (!object || !purchasedHouseId) return false;

  return String(getMapObjectHouseId(object)) === String(purchasedHouseId);
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
    const ownerId = getPurchasedOwnerId(event.detail);

    if (!selectedObject || !isSameHouseObject(selectedObject, purchasedHouseId)) {
      return;
    }

    markObjectAsPurchased(selectedObject, ownerId);
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

    mapObjects = Array.isArray(objects)
      ? objects.filter(Boolean)
      : [];

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
    reloadTimer = setTimeout(reloadObjects, 150);
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
    const ownerId = getPurchasedOwnerId(event.detail);

    if (!purchasedHouseId || !ownerId) return;

    let changed = false;

    mapObjects = mapObjects.map((object) => {
      if (!isSameHouseObject(object, purchasedHouseId)) return object;

      changed = true;
      return markObjectAsPurchased(object, ownerId);
    });

    if (!changed) return;

    renderMapObjects(layer, mapObjects);

    if (typeof panel.updateSelectedObject === 'function') {
      panel.updateSelectedObject((selectedObject) => {
        if (!isSameHouseObject(selectedObject, purchasedHouseId)) {
          return selectedObject;
        }

        return markObjectAsPurchased(selectedObject, ownerId);
      });
    }

    window.dispatchEvent(new CustomEvent('mn:map-objects-changed', {
      detail: {
        cityId,
        reason: 'house-purchased',
        houseId: purchasedHouseId,
      },
    }));
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
