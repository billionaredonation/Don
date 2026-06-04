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
  return String(
    object?.payload?.houseClass ||
    object?.payload?.houseClassLabel ||
    object?.variant ||
    object?.class ||
    'standard'
  ).toLowerCase();
}

function getHousePrice(object) {
  return object?.price || object?.payload?.price || 0;
}

function getHouseState(object) {
  if (getHouseOwnerId(object) || object?.payload?.owned) return 'owned';
  if (object?.payload?.locked) return 'locked';

  return 'free';
}

function normalizeHouseClass(value) {
  const raw = String(value || '').toLowerCase();

  if (raw === 'std' || raw === 'standard' || raw === 'стандарт') return 'standard';
  if (raw === 'comfort' || raw === 'комфорт') return 'comfort';
  if (raw === 'lux' || raw === 'luxe' || raw === 'luxury' || raw === 'люкс') return 'lux';

  return 'standard';
}

function renderHouseSvgIcon(houseClass, state) {
  const normalizedClass = normalizeHouseClass(houseClass);
  const isOwned = state === 'owned';
  const isLocked = state === 'locked';

  const main = isLocked ? '#9ca3af' : isOwned ? '#ff4d5e' : '#35e985';
  const dark = isLocked ? '#4b5563' : isOwned ? '#8f1d2d' : '#0f8f52';
  const soft = isLocked ? '#d1d5db' : isOwned ? '#ff9aaa' : '#93ffc4';
  const roof = isLocked ? '#6b7280' : isOwned ? '#ff3148' : '#20d977';

  if (normalizedClass === 'lux') {
    return `
      <svg class="map-house-svg map-house-svg-lux" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M8 54h48" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        <path d="M16 28L32 12l16 16v26H16V28z" fill="${main}" stroke="${soft}" stroke-width="3"/>
        <path d="M12 29L32 8l20 21" fill="none" stroke="${roof}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M24 54V36h16v18" fill="${dark}"/>
        <path d="M21 31h8v8h-8zM35 31h8v8h-8z" fill="#ffffff" opacity="0.88"/>
        <path d="M32 8l5 10h-10l5-10z" fill="${soft}"/>
        <circle cx="32" cy="26" r="4" fill="#ffffff" opacity="0.9"/>
      </svg>
    `;
  }

  if (normalizedClass === 'comfort') {
    return `
      <svg class="map-house-svg map-house-svg-comfort" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M10 54h44" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        <path d="M14 30L32 14l18 16v24H14V30z" fill="${main}" stroke="${soft}" stroke-width="3"/>
        <path d="M10 31L32 11l22 20" fill="none" stroke="${roof}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M25 54V38h14v16" fill="${dark}"/>
        <path d="M19 34h9v8h-9zM36 34h9v8h-9z" fill="#ffffff" opacity="0.9"/>
        <path d="M45 22v-8h7v15" fill="${dark}"/>
      </svg>
    `;
  }

  return `
    <svg class="map-house-svg map-house-svg-standard" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M12 54h40" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
      <path d="M18 31L32 18l14 13v23H18V31z" fill="${main}" stroke="${soft}" stroke-width="3"/>
      <path d="M14 32L32 15l18 17" fill="none" stroke="${roof}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M26 54V39h12v15" fill="${dark}"/>
      <path d="M21 35h8v8h-8zM36 35h8v8h-8z" fill="#ffffff" opacity="0.88"/>
    </svg>
  `;
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
      visualClass: normalizeHouseClass(houseClass),
      state,
      ownerId,
      iconHtml: renderHouseSvgIcon(houseClass, state),
    };
  }

  return {
    title: object.name || 'Маркер',
    visualClass: object.type || 'marker',
    state: 'default',
    ownerId: null,
    iconHtml: `<span class="map-object-icon">${escapeHtml(object.icon || '◆')}</span>`,
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

      return `
        <button
          class="map-object map-object-${escapeHtml(object.category)} map-object-type-${escapeHtml(object.type)} map-object-visual-${escapeHtml(meta.visualClass)} map-object-state-${escapeHtml(meta.state)} ${selectedClass}"
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
          ${meta.iconHtml}
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
