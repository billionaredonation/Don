import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

import {
  createMapObjectsLayer,
  renderMapObjects,
  getMapObjectIdFromEvent,
} from '../mapObjects/mapObjectsRenderer.js';

import {
  getEntityKindLabel,
  getEntityMetaText,
  getEntityPrimaryActionLabel,
  dispatchEntityAction,
} from './entityActions.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

  function close() {
    selectedObject = null;
    panel.hidden = true;
  }

  function open(object) {
    selectedObject = object;

    const kindLabel = getEntityKindLabel(object);

    iconEl.textContent = object?.icon || '◆';
    titleEl.textContent = object?.name || kindLabel;
    metaEl.innerHTML = escapeHtml(getEntityMetaText(object));
    actionButton.textContent = getEntityPrimaryActionLabel(object);

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
  viewport.appendChild(layer);

  let mapObjects = [];

  async function reloadObjects() {
    const objects = await getMapObjects(cityId);

    mapObjects = Array.isArray(objects)
      ? objects.filter(Boolean)
      : [];

    renderMapObjects(layer, mapObjects);
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
    reloadObjects();
  }

  layer.addEventListener('click', onClick);
  window.addEventListener('mn:map-objects-changed', onObjectsChanged);

  reloadObjects();

  return () => {
    layer.removeEventListener('click', onClick);
    window.removeEventListener('mn:map-objects-changed', onObjectsChanged);
    layer.remove();
  };
}
