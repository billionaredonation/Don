function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function createMapObjectsLayer() {
  const layer = document.createElement('div');
  layer.className = 'map-objects-layer';
  return layer;
}

export function renderMapObjects(layer, objects = []) {
  if (!layer) return;

  layer.innerHTML = objects
    .map((object) => {
      const x = Number(object.x || 50);
      const y = Number(object.y || 50);
      const scale = Number(object.scale || 1);
      const rotation = Number(object.rotation || 0);
      const selectedClass = object.selected ? 'map-object-selected' : '';

          return `
            <button
              class="map-object map-object-${escapeHtml(object.category)} map-object-type-${escapeHtml(object.type)} ${selectedClass}"
              data-map-object-id="${escapeHtml(object.id)}"
              data-map-object-type="${escapeHtml(object.type)}"
              data-map-object-category="${escapeHtml(object.category)}"
              type="button"
              tabindex="-1"
              title="${escapeHtml(object.name)}"
              style="
              left: ${x}%;
              top: ${y}%;
              --map-object-scale: ${scale};
              --map-object-rotation: ${rotation}deg;
                "
              >
          <span class="map-object-icon">${escapeHtml(object.icon || '◆')}</span>
        </button>
      `;
    })
    .join('');
}

export function findMapObjectElement(layer, objectId) {
  if (!layer || !objectId) return null;
  return layer.querySelector(`[data-map-object-id="${CSS.escape(String(objectId))}"]`);
}

export function getMapObjectIdFromEvent(event) {
  return event.target?.closest?.('[data-map-object-id]')?.dataset?.mapObjectId || null;
}
