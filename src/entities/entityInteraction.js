import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

import {
  createMapObjectsLayer,
  renderMapObjects,
  getMapObjectIdFromEvent,
} from '../mapObjects/mapObjectsRenderer.js';

import { dispatchEntityAction } from './entityActions.js';
import { renderEntityPanelContent } from './panels/entityPanelView.js';

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

  function close() {
    selectedObject = null;
    panel.hidden = true;
  }

  function open(object) {
    selectedObject = object;

    renderEntityPanelContent({
      iconEl,
      titleEl,
      metaEl,
      actionButton,
      object,
    });

    panel.hidden = false;
  }

  closeButton.addEventListener('click', close);

  actionButton.addEventListener('click', () => {
    if (!selectedObject) return;
    dispatchEntityAction(selectedObject);
  });

  return {
    open,
    close,
    cleanup() {
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

  layer.addEventListener('click', onClick);
  layer.addEventListener('pointerdown', onClick);
  window.addEventListener('mn:map-objects-changed', onObjectsChanged);

  reloadObjects();

  return () => {
    destroyed = true;
    clearTimeout(reloadTimer);

    layer.removeEventListener('click', onClick);
    layer.removeEventListener('pointerdown', onClick);
    window.removeEventListener('mn:map-objects-changed', onObjectsChanged);
    layer.remove();
  };
}
