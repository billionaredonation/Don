function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatPrice(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return '';

  return `${number.toLocaleString('ru-RU')}₴`;
}
function getObjectMeta(object) {
  const payload = object.payload || {};

  if (object.category === 'house') {
    const classText = payload.houseClassShortLabel || payload.houseClassLabel || object.variant || 'HOME';
    const priceText = formatPrice(payload.price);

    const ownerId = object.owner_id || payload.ownerId;
    const statusText = ownerId
      ? 'Куплен'
      : payload.locked
        ? 'Закрыт'
        : 'Свободен';

    return {
      badge: classText,
      sub: priceText || statusText,
      title: `${object.name || 'Дом'} · ${payload.houseClassLabel || classText} · ${statusText}${priceText ? ` · ${priceText}` : ''}`,
      visualClass: payload.visualClass || object.variant || 'standard',
    };
  }

  if (object.category === 'business') {
    const priceText = formatPrice(payload.price);
    const incomeText = Number(payload.incomePerHour || 0) > 0
      ? `${Number(payload.incomePerHour).toLocaleString('ru-RU')}₴/ч`
      : '';

    return {
      badge: 'BUS',
      sub: incomeText || priceText || 'Бизнес',
      title: `${object.name || 'Бизнес'} · ${payload.businessLabel || object.type}${priceText ? ` · ${priceText}` : ''}`,
      visualClass: object.type || 'business',
    };
  }

  if (object.category === 'npc') {
    return {
      badge: 'NPC',
      sub: object.type === 'quest_npc' ? 'Квест' : '',
      title: object.name || 'NPC',
      visualClass: object.type || 'npc',
    };
  }

  if (object.category === 'decor') {
    return {
      badge: '',
      sub: '',
      title: object.name || 'Декор',
      visualClass: object.type || 'decor',
    };
  }

  return {
    badge: '',
    sub: '',
    title: object.name || 'Маркер',
    visualClass: object.type || 'marker',
  };
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
      const meta = getObjectMeta(object);

      const categoryClass = `map-object-${escapeHtml(object.category)}`;
      const typeClass = `map-object-type-${escapeHtml(object.type)}`;
      const visualClass = `map-object-visual-${escapeHtml(meta.visualClass)}`;

      const badgeHtml = meta.badge
        ? `<span class="map-object-badge">${escapeHtml(meta.badge)}</span>`
        : '';

      const subHtml = meta.sub
        ? `<span class="map-object-sub">${escapeHtml(meta.sub)}</span>`
        : '';

      return `
        <button
          class="map-object ${categoryClass} ${typeClass} ${visualClass} ${selectedClass}"
          data-map-object-id="${escapeHtml(object.id)}"
          data-map-object-type="${escapeHtml(object.type)}"
          data-map-object-category="${escapeHtml(object.category)}"
          type="button"
          tabindex="-1"
          title="${escapeHtml(meta.title)}"
          style="
            left: ${x}%;
            top: ${y}%;
            --map-object-scale: ${scale};
            --map-object-rotation: ${rotation}deg;
          "
        >
          <span class="map-object-icon">${escapeHtml(object.icon || '◆')}</span>
          ${badgeHtml}
          ${subHtml}
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
