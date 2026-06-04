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

  if (!Number.isFinite(number) || number <= 0) {
    return '';
  }

  return `${number.toLocaleString('ru-RU')}₴`;
}

function getHouseOwnerId(object) {
  return (
    object?.owner_id ||
    object?.ownerId ||
    object?.payload?.ownerId ||
    object?.payload?.owner_id ||
    null
  );
}

function getHouseOwnerName(object) {
  return (
    object?.ownerName ||
    object?.owner_name ||
    object?.payload?.ownerName ||
    object?.payload?.owner_name ||
    ''
  );
}

function getHouseClass(object) {
  return (
    object?.payload?.houseClassLabel ||
    object?.payload?.houseClass ||
    object?.variant ||
    'standard'
  );
}

function getHousePrice(object) {
  return object?.price || object?.payload?.price || 0;
}

function getHouseState(object) {
  if (getHouseOwnerId(object) || object?.payload?.owned) return 'owned';
  if (object?.payload?.locked) return 'locked';

  return 'free';
}

function getObjectMeta(object) {
  const payload = object.payload || {};

  if (object.category === 'house') {
    const houseClass = getHouseClass(object);
    const priceText = formatPrice(getHousePrice(object));
    const ownerId = getHouseOwnerId(object);
    const ownerName = getHouseOwnerName(object);
    const state = getHouseState(object);

    const statusText =
      state === 'owned'
        ? 'Куплен'
        : state === 'locked'
          ? 'Закрыт'
          : 'Свободен';

    return {
      title: `${object.name || 'Дом'} · ${houseClass} · ${statusText}${ownerName ? ` · ${ownerName}` : ''}${priceText ? ` · ${priceText}` : ''}`,
      visualClass: payload.visualClass || object.variant || 'standard',
      state,
      ownerId,
    };
  }

  if (object.category === 'business') {
    const priceText = formatPrice(payload.price);
    const incomeText = Number(payload.incomePerHour || 0) > 0
      ? `${Number(payload.incomePerHour).toLocaleString('ru-RU')}₴/ч`
      : '';

    return {
      title: `${object.name || 'Бизнес'} · ${payload.businessLabel || object.type}${priceText ? ` · ${priceText}` : ''}${incomeText ? ` · ${incomeText}` : ''}`,
      visualClass: object.type || 'business',
      state: 'business',
      ownerId: null,
    };
  }

  if (object.category === 'npc') {
    return {
      title: object.name || 'NPC',
      visualClass: object.type || 'npc',
      state: 'default',
      ownerId: null,
    };
  }

  if (object.category === 'decor') {
    return {
      title: object.name || 'Декор',
      visualClass: object.type || 'decor',
      state: 'default',
      ownerId: null,
    };
  }

  return {
    title: object.name || 'Маркер',
    visualClass: object.type || 'marker',
    state: 'default',
    ownerId: null,
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
      const stateClass = `map-object-state-${escapeHtml(meta.state)}`;

      return `
        <button
          class="map-object ${categoryClass} ${typeClass} ${visualClass} ${stateClass} ${selectedClass}"
          data-map-object-id="${escapeHtml(object.id)}"
          data-map-object-type="${escapeHtml(object.type)}"
          data-map-object-category="${escapeHtml(object.category)}"
          data-map-object-state="${escapeHtml(meta.state)}"
          data-map-object-owner-id="${escapeHtml(meta.ownerId || '')}"
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
