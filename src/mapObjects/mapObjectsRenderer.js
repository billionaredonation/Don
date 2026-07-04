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

function isMobileGameplayDevice() {
  const hasTouch = navigator.maxTouchPoints > 0;
  const narrowScreen =
    Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 920;

  return hasTouch && narrowScreen;
}

function shouldUseLightweightHouseIcon() {
  return (
    isMobileGameplayDevice() ||
    document.body?.classList?.contains('mn-mobile-game-enabled') ||
    window.__MN_MAP_OBJECTS_LIGHT_MODE__ === true
  );
}

function createHouseLiteIcon(houseClass, state) {
  const normalizedClass = normalizeHouseClass(houseClass);
  const cacheKey = `${normalizedClass}:${state}:lite-v3-single-node`;

  if (HOUSE_ICON_CACHE.has(cacheKey)) {
    return HOUSE_ICON_CACHE.get(cacheKey);
  }

  /*
    Мобилка: один DOM-узел на дом.
    Старый lite-рендер создавал 4 span внутри каждого дома. На 100+ домах это уже
    сотни лишних элементов внутри движущегося слоя Telegram WebView. Форма дома
    теперь рисуется CSS/pseudo-element'ами, без SVG, drop-shadow и внутренних DOM.
  */
  const html = `
    <span class="map-house-lite map-house-lite-${normalizedClass} map-house-lite-${state}" aria-hidden="true"></span>
  `;

  HOUSE_ICON_CACHE.set(cacheKey, html);

  return html;
}

function createHouseSvgIcon(houseClass, state) {
  const normalizedClass = normalizeHouseClass(houseClass);
  const cacheKey = `${normalizedClass}:${state}:pc-v2`;

  if (HOUSE_ICON_CACHE.has(cacheKey)) {
    return HOUSE_ICON_CACHE.get(cacheKey);
  }

  const { main, dark, soft, roof } = getHouseColors(state);

  const baseShadow = `
    <ellipse cx="36" cy="60" rx="21" ry="5" fill="rgba(0,0,0,0.42)"/>
  `;

  const door = `<path d="M29 58V43c0-2.4 1.8-4.2 4.2-4.2h5.6c2.4 0 4.2 1.8 4.2 4.2v15H29z" fill="${dark}"/>`;
  const windowFill = 'rgba(255,255,255,0.92)';
  const shine = `<path d="M18 35L36 18l18 17" fill="none" stroke="rgba(255,255,255,0.34)" stroke-width="2" stroke-linecap="round"/>`;

  let svg = '';

  if (normalizedClass === 'elite') {
    svg = `
      <svg class="map-house-svg map-house-svg-elite" viewBox="0 0 72 72" aria-hidden="true">
        ${baseShadow}
        <path d="M11 34L36 9l25 25" fill="none" stroke="${dark}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 36L36 13l22 23v23H14V36z" fill="${main}" stroke="${soft}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M7 35L36 6l29 29" fill="none" stroke="${roof}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M22 29h28l-14-15-14 15z" fill="rgba(255,255,255,0.16)"/>
        <path d="M17 36h9v9h-9zM46 36h9v9h-9z" fill="${windowFill}"/>
        <path d="M28 31h16v7H28z" fill="${windowFill}" opacity="0.9"/>
        ${door}
        <path d="M36 6l6 13H30l6-13z" fill="${soft}"/>
        <circle cx="36" cy="28" r="4.3" fill="${windowFill}"/>
        ${shine}
      </svg>
    `;
  } else if (normalizedClass === 'premium') {
    svg = `
      <svg class="map-house-svg map-house-svg-premium" viewBox="0 0 72 72" aria-hidden="true">
        ${baseShadow}
        <path d="M15 36L36 15l21 21v23H15V36z" fill="${main}" stroke="${soft}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M9 36L36 10l27 26" fill="none" stroke="${roof}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M50 25v-10h8v18" fill="${dark}" stroke="${soft}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M20 39h10v8H20zM42 39h10v8H42z" fill="${windowFill}"/>
        <path d="M30 31h12v7H30z" fill="${windowFill}" opacity="0.88"/>
        ${door}
        <path d="M18 56h36" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        ${shine}
      </svg>
    `;
  } else if (normalizedClass === 'lux') {
    svg = `
      <svg class="map-house-svg map-house-svg-lux" viewBox="0 0 72 72" aria-hidden="true">
        ${baseShadow}
        <path d="M14 36L36 13l22 23v23H14V36z" fill="${main}" stroke="${soft}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M9 36L36 9l27 27" fill="none" stroke="${roof}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M36 9l5 11H31l5-11z" fill="${soft}"/>
        <path d="M19 39h10v8H19zM43 39h10v8H43z" fill="${windowFill}"/>
        <circle cx="36" cy="31" r="4" fill="${windowFill}" opacity="0.92"/>
        ${door}
        <path d="M16 56h40" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        ${shine}
      </svg>
    `;
  } else if (normalizedClass === 'comfort') {
    svg = `
      <svg class="map-house-svg map-house-svg-comfort" viewBox="0 0 72 72" aria-hidden="true">
        ${baseShadow}
        <path d="M14 38L36 17l22 21v21H14V38z" fill="${main}" stroke="${soft}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M9 38L36 13l27 25" fill="none" stroke="${roof}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M49 27v-9h8v17" fill="${dark}" stroke="${soft}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M19 41h10v8H19zM43 41h10v8H43z" fill="${windowFill}"/>
        ${door}
        <path d="M18 57h36" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        ${shine}
      </svg>
    `;
  } else {
    svg = `
      <svg class="map-house-svg map-house-svg-standard" viewBox="0 0 72 72" aria-hidden="true">
        ${baseShadow}
        <path d="M18 39L36 21l18 18v20H18V39z" fill="${main}" stroke="${soft}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M13 39L36 17l23 22" fill="none" stroke="${roof}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M22 42h9v8h-9zM41 42h9v8h-9z" fill="${windowFill}"/>
        <path d="M30 59V45h12v14H30z" fill="${dark}"/>
        <path d="M20 57h32" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        ${shine}
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

    const colors = getHouseColors(state);

    return {
      title: `${object.name || 'Дом'} · ${normalizedClass} · ${statusText}${ownerName ? ` · ${ownerName}` : ''}${priceText ? ` · ${priceText}` : ''}`,
      visualClass: normalizedClass,
      state,
      ownerId,
      colors,
      // Mobile uses the same detailed house SVG as desktop.
      // The previous lightweight CSS-only icon looked like colored blocks/blobs
      // on Telegram WebView, especially after zoom.
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

function getObjectRenderSize(category, visualClass) {
  if (category !== 'house') return 18;

  const normalizedClass = normalizeHouseClass(visualClass);

  if (normalizedClass === 'elite') return 28;
  if (normalizedClass === 'lux') return 27;
  if (normalizedClass === 'premium') return 25;
  if (normalizedClass === 'comfort') return 24;

  return 22;
}

function getSafeNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function createObjectHtml(object) {
  const x = getSafeNumber(object.x, 50);
  const y = getSafeNumber(object.y, 50);
  const scale = getSafeNumber(object.scale, 1);
  const rotation = getSafeNumber(object.rotation, 0);
  const category = String(object.category || object.payload?.category || object.type || 'marker');
  const type = String(object.type || object.payload?.type || category || 'marker');
  const selectedClass = object.selected ? 'map-object-selected' : '';
  const meta = getObjectMeta({
    ...object,
    category,
    type,
  });
  const renderSize = getObjectRenderSize(category, meta.visualClass);

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
        left: ${x}%;
        top: ${y}%;
        --map-object-scale: ${scale};
        --map-object-rotation: ${rotation}deg;
        --map-house-main: ${escapeHtml(meta.colors?.main || '#35e985')};
        --map-house-dark: ${escapeHtml(meta.colors?.dark || '#0f8f52')};
        --map-house-soft: ${escapeHtml(meta.colors?.soft || '#93ffc4')};
        --map-house-roof: ${escapeHtml(meta.colors?.roof || '#20d977')};
        width: ${renderSize}px;
        height: ${renderSize}px;
        min-width: ${renderSize}px;
        min-height: ${renderSize}px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 0;
        background: transparent;
        transform:
          translate(-50%, -50%)
          rotate(var(--map-object-rotation, 0deg))
          scale(calc(var(--map-object-scale, 1) * var(--map-entity-scale, 1)));
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
  layer.__mnObjectElements = new Map();

  applyLayerBaseStyle(layer);

  return layer;
}

export function renderMapObjects(layer, objects = []) {
  if (!layer) return;

  applyLayerBaseStyle(layer);

  if (!layer.__mnObjectSignatures) {
    layer.__mnObjectSignatures = new Map();
  }

  if (!layer.__mnObjectElements) {
    layer.__mnObjectElements = new Map();
  }

  const signatures = layer.__mnObjectSignatures;
  const elements = layer.__mnObjectElements;
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

    const oldElement = elements.get(id) || layer.querySelector(`[data-map-object-id="${CSS.escape(id)}"]`);
    const wrapper = document.createElement('div');

    wrapper.innerHTML = createObjectHtml(object).trim();

    const nextElement = wrapper.firstElementChild;

    if (!nextElement) return;

    if (oldElement) {
      oldElement.replaceWith(nextElement);
    } else {
      layer.appendChild(nextElement);
    }

    elements.set(id, nextElement);
    signatures.set(id, nextSignature);
  });

  Array.from(signatures.keys()).forEach((id) => {
    if (nextIds.has(id)) return;

    (elements.get(id) || layer.querySelector(`[data-map-object-id="${CSS.escape(id)}"]`))?.remove();
    elements.delete(id);
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
  layer.__mnObjectElements?.clear?.();
  layer.dataset.objectsCount = '0';
}

export function findMapObjectElement(layer, objectId) {
  if (!layer || !objectId) return null;

  const id = String(objectId);
  const cached = layer.__mnObjectElements?.get?.(id);

  if (cached?.isConnected) return cached;

  const found = layer.querySelector(`[data-map-object-id="${CSS.escape(id)}"]`);

  if (found) {
    layer.__mnObjectElements?.set?.(id, found);
  }

  return found;
}

export function getMapObjectIdFromEvent(event) {
  return event.target?.closest?.('[data-map-object-id]')?.dataset?.mapObjectId || null;
}
