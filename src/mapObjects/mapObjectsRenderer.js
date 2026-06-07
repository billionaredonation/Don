const HOUSE_ICON_CACHE = new Map();

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
  if (raw === 'premium' || raw === 'prem' || raw === 'премиум') return 'premium';
  if (raw === 'lux' || raw === 'luxe' || raw === 'luxury' || raw === 'люкс') return 'lux';
  if (raw === 'elite' || raw === 'vip' || raw === 'элита') return 'elite';

  return 'standard';
}

function getHouseColors(state) {
  const isOwned = state === 'owned';
  const isLocked = state === 'locked';

  return {
    main: isLocked ? '#9ca3af' : isOwned ? '#ff4d5e' : '#35e985',
    dark: isLocked ? '#4b5563' : isOwned ? '#8f1d2d' : '#0f8f52',
    soft: isLocked ? '#d1d5db' : isOwned ? '#ff9aaa' : '#93ffc4',
    roof: isLocked ? '#6b7280' : isOwned ? '#ff3148' : '#20d977',
  };
}

function createHouseSvgIcon(houseClass, state) {
  const normalizedClass = normalizeHouseClass(houseClass);
  const cacheKey = `${normalizedClass}:${state}`;

  if (HOUSE_ICON_CACHE.has(cacheKey)) {
    return HOUSE_ICON_CACHE.get(cacheKey);
  }

  const { main, dark, soft, roof } = getHouseColors(state);

  let svg = '';

  if (normalizedClass === 'elite') {
    svg = `
      <svg class="map-house-svg map-house-svg-elite" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M8 55h48" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        <path d="M15 29L32 10l17 19v26H15V29z" fill="${main}" stroke="${soft}" stroke-width="3"/>
        <path d="M10 30L32 6l22 24" fill="none" stroke="${roof}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M24 55V36h16v19" fill="${dark}"/>
        <path d="M20 32h8v8h-8zM36 32h8v8h-8z" fill="#ffffff" opacity="0.9"/>
        <path d="M32 7l6 12H26l6-12z" fill="${soft}" opacity="0.95"/>
        <circle cx="32" cy="25" r="4" fill="#ffffff" opacity="0.92"/>
      </svg>
    `;
  } else if (normalizedClass === 'premium') {
    svg = `
      <svg class="map-house-svg map-house-svg-premium" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M9 54h46" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        <path d="M15 29L32 12l17 17v25H15V29z" fill="${main}" stroke="${soft}" stroke-width="3"/>
        <path d="M11 30L32 9l21 21" fill="none" stroke="${roof}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M25 54V37h14v17" fill="${dark}"/>
        <path d="M20 33h9v8h-9zM35 33h9v8h-9z" fill="#ffffff" opacity="0.9"/>
        <path d="M45 22v-8h7v15" fill="${dark}"/>
        <circle cx="32" cy="27" r="3" fill="#ffffff" opacity="0.85"/>
      </svg>
    `;
  } else if (normalizedClass === 'lux') {
    svg = `
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
  } else if (normalizedClass === 'comfort') {
    svg = `
      <svg class="map-house-svg map-house-svg-comfort" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M10 54h44" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        <path d="M14 30L32 14l18 16v24H14V30z" fill="${main}" stroke="${soft}" stroke-width="3"/>
        <path d="M10 31L32 11l22 20" fill="none" stroke="${roof}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M25 54V38h14v16" fill="${dark}"/>
        <path d="M19 34h9v8h-9zM36 34h9v8h-9z" fill="#ffffff" opacity="0.9"/>
        <path d="M45 22v-8h7v15" fill="${dark}"/>
      </svg>
    `;
  } else {
    svg = `
      <svg class="map-house-svg map-house-svg-standard" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M12 54h40" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        <path d="M18 31L32 18l14 13v23H18V31z" fill="${main}" stroke="${soft}" stroke-width="3"/>
        <path d="M14 32L32 15l18 17" fill="none" stroke="${roof}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M26 54V39h12v15" fill="${dark}"/>
        <path d="M21 35h8v8h-8zM36 35h8v8h-8z" fill="#ffffff" opacity="0.88"/>
      </svg>
    `;
  }

  HOUSE_ICON_CACHE.set(cacheKey, svg);

  return svg;
}

function getObjectMeta(object) {
  const payload = object.payload || {};
  const category = String(object.category || payload.category || object.type || 'marker');

  if (category === 'house') {
    const houseClass = getHouseClass(object);
    const priceText = formatPrice(getHousePrice(object));
    const ownerId = getHouseOwnerId(object);
    const ownerName = getHouseOwnerName(object);
    const state = getHouseState(object);
    const normalizedClass = normalizeHouseClass(houseClass);

    const statusText =
      state === 'owned'
        ? 'Куплен'
        : state === 'locked'
          ? 'Закрыт'
          : 'Свободен';

    return {
      title: `${object.name || 'Дом'} · ${normalizedClass} · ${statusText}${ownerName ? ` · ${ownerName}` : ''}${priceText ? ` · ${priceText}` : ''}`,
      visualClass: normalizedClass,
      state,
      ownerId,
      iconHtml: createHouseSvgIcon(normalizedClass, state),
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

function createObjectHtml(object) {
  const x = Number(object.x || 50);
  const y = Number(object.y || 50);
  const scale = Number(object.scale || 1);
  const rotation = Number(object.rotation || 0);
  const category = String(object.category || object.payload?.category || object.type || 'marker');
  const type = String(object.type || object.payload?.type || category || 'marker');
  const selectedClass = object.selected ? 'map-object-selected' : '';
  const meta = getObjectMeta({
    ...object,
    category,
    type,
  });

  return `
    <button
      class="map-object map-object-${escapeHtml(category)} map-object-type-${escapeHtml(type)} map-object-visual-${escapeHtml(meta.visualClass)} map-object-state-${escapeHtml(meta.state)} ${selectedClass}"
      data-map-object-id="${escapeHtml(object.id)}"
      data-map-object-type="${escapeHtml(type)}"
      data-map-object-category="${escapeHtml(category)}"
      data-map-object-state="${escapeHtml(meta.state)}"
      data-map-object-owner-id="${escapeHtml(meta.ownerId || '')}"
      type="button"
      tabindex="-1"
      title="${escapeHtml(meta.title)}"
      style="
        position: absolute;
        left: ${Number.isFinite(x) ? x : 50}%;
        top: ${Number.isFinite(y) ? y : 50}%;
        width: 14px;
        height: 14px;
        min-width: 14px;
        min-height: 14px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 0;
        background: transparent;
        transform:
          translate(-50%, -50%)
          rotate(${Number.isFinite(rotation) ? rotation : 0}deg)
          scale(${Number.isFinite(scale) ? scale : 1});
        transform-origin: center center;
        z-index: 10;
        pointer-events: auto;
        cursor: pointer;
      "
    >
      ${meta.iconHtml}
    </button>
  `;
}

function getObjectSignature(object) {
  const payload = object?.payload || {};

  return [
    object?.id,
    object?.x,
    object?.y,
    object?.scale,
    object?.rotation,
    object?.type,
    object?.category,
    object?.variant,
    object?.selected ? 'selected' : 'idle',
    payload.price,
    payload.houseClass,
    payload.houseClassLabel,
    payload.ownerId,
    payload.owner_id,
    payload.ownerName,
    payload.owner_name,
    payload.owned,
    payload.locked,
    object?.owner_id,
    object?.ownerId,
    object?.ownerName,
  ].join('|');
}

function applyLayerBaseStyle(layer) {
  if (!layer) return;

  layer.style.position = 'absolute';
  layer.style.inset = '0';
  layer.style.display = 'block';
  layer.style.width = '100%';
  layer.style.height = '100%';
  layer.style.overflow = 'visible';
  layer.style.visibility = 'visible';
  layer.style.opacity = '1';
  layer.style.pointerEvents = 'none';
  layer.style.zIndex = '220';
}

export function createMapObjectsLayer() {
  const layer = document.createElement('div');

  layer.className = 'map-objects-layer';
  layer.__mnObjectSignatures = new Map();

  applyLayerBaseStyle(layer);

  return layer;
}

export function renderMapObjects(layer, objects = []) {
  if (!layer) return;

  applyLayerBaseStyle(layer);

  if (!layer.__mnObjectSignatures) {
    layer.__mnObjectSignatures = new Map();
  }

  const signatures = layer.__mnObjectSignatures;
  const nextIds = new Set();

  const safeObjects = Array.isArray(objects)
    ? objects.filter(Boolean)
    : [];

  layer.dataset.objectsCount = String(safeObjects.length);

  safeObjects.forEach((object) => {
    const id = String(object.id || '');
    if (!id) return;

    nextIds.add(id);

    const nextSignature = getObjectSignature(object);
    const oldSignature = signatures.get(id);

    if (oldSignature === nextSignature) return;

    const oldElement = layer.querySelector(`[data-map-object-id="${CSS.escape(id)}"]`);
    const wrapper = document.createElement('div');

    wrapper.innerHTML = createObjectHtml(object).trim();

    const nextElement = wrapper.firstElementChild;

    if (!nextElement) return;

    if (oldElement) {
      oldElement.replaceWith(nextElement);
    } else {
      layer.appendChild(nextElement);
    }

    signatures.set(id, nextSignature);
  });

  Array.from(signatures.keys()).forEach((id) => {
    if (nextIds.has(id)) return;

    layer.querySelector(`[data-map-object-id="${CSS.escape(id)}"]`)?.remove();
    signatures.delete(id);
  });

  window.dispatchEvent(
    new CustomEvent('mn:map-objects-dom-rendered', {
      detail: {
        count: safeObjects.length,
        layerChildren: layer.children.length,
      },
    })
  );
}

export function clearMapObjectsLayer(layer) {
  if (!layer) return;

  layer.innerHTML = '';
  layer.__mnObjectSignatures?.clear?.();
  layer.dataset.objectsCount = '0';
}

export function findMapObjectElement(layer, objectId) {
  if (!layer || !objectId) return null;

  return layer.querySelector(`[data-map-object-id="${CSS.escape(String(objectId))}"]`);
}

export function getMapObjectIdFromEvent(event) {
  return event.target?.closest?.('[data-map-object-id]')?.dataset?.mapObjectId || null;
}
