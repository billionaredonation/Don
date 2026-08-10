const DEFAULT_HOUSE_COLORS = Object.freeze({
  free: Object.freeze({ main: '#35e985', dark: '#0f8f52', soft: '#93ffc4', roof: '#20d977' }),
  owned: Object.freeze({ main: '#ff4d5e', dark: '#8f1d2d', soft: '#ff9aaa', roof: '#ff3148' }),
  locked: Object.freeze({ main: '#9ca3af', dark: '#4b5563', soft: '#d1d5db', roof: '#6b7280' }),
  default: Object.freeze({ main: '#35e985', dark: '#0f8f52', soft: '#93ffc4', roof: '#20d977' }),
});

const DEFAULT_SERVICE_COLORS = Object.freeze({
  hospital: Object.freeze({ main: '#f8fafc', dark: '#c91d32', soft: '#ff7789', roof: '#ef3347' }),
  default: Object.freeze({ main: '#f8fafc', dark: '#2563eb', soft: '#93c5fd', roof: '#38bdf8' }),
});

const HOUSE_CLASS_ALIASES = Object.freeze({
  std: 'standard',
  standard: 'standard',
  'стандарт': 'standard',
  comfort: 'standard',
  'комфорт': 'standard',
  premium: 'premium',
  prem: 'premium',
  'премиум': 'premium',
  lux: 'ultra_lux',
  luxe: 'ultra_lux',
  luxury: 'ultra_lux',
  ultra: 'ultra_lux',
  ultra_lux: 'ultra_lux',
  'ультра': 'ultra_lux',
  'ультра люкс': 'ultra_lux',
  'люкс': 'ultra_lux',
  elite: 'ultra_lux',
  vip: 'ultra_lux',
  'элита': 'ultra_lux',
});

const MOBILE_RENDER_RADIUS = 30;
const MOBILE_KEEP_RADIUS = 38;
const MOBILE_RENDER_BUDGET = 28;
const MOBILE_IDLE_BUDGET_MS = 120;
const MOBILE_CAMERA_RENDER_INTERVAL_MS = 520;
const MOBILE_CAMERA_MOVE_EPSILON_PERCENT = 1.25;
const MOBILE_CAMERA_BUSY_RETRY_MS = 620;
const MOBILE_GRID_CELL_PERCENT = 5;
const MOBILE_MAX_VISIBLE_OBJECTS = 96;
const DESKTOP_MAX_VISIBLE_OBJECTS = 720;
const DETACHED_OBJECT_POOL_LIMIT = 180;

const layerStates = new Set();
let globalCameraListenerEnabled = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

function safeClassName(value, fallback = 'default') {
  const safe = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, '-');

  return safe || fallback;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isMobileDevice() {
  return (
    window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ||
    navigator.maxTouchPoints > 0
  );
}

function isMobilePlayerBusy() {
  if (!isMobileDevice()) return false;

  const now = performance.now();
  const pauseUntil = Number(window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ || 0);

  return (
    window.__MN_MOBILE_PLAYER_MOVING__ === true ||
    pauseUntil > now
  );
}

function scheduleIdle(callback, timeout = MOBILE_IDLE_BUDGET_MS) {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout });
  }

  return window.setTimeout(callback, Math.min(timeout, 80));
}

function cancelIdle(id) {
  if (!id) return;

  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(id);
    return;
  }

  window.clearTimeout(id);
}

function getPayload(object) {
  return object && typeof object.payload === 'object' && object.payload !== null
    ? object.payload
    : {};
}

function getObjectId(object) {
  return String(object?.id ?? object?.object_id ?? object?.mapObjectId ?? '').trim();
}

function getCategory(object) {
  const payload = getPayload(object);

  return String(
    object?.category ||
      payload.category ||
      payload.kind ||
      object?.kind ||
      object?.type ||
      'marker'
  );
}

function getType(object, category) {
  const payload = getPayload(object);
  return String(object?.type || payload.type || category || 'marker');
}

function normalizeHouseClass(value) {
  const raw = String(value || '').trim().toLowerCase();
  return HOUSE_CLASS_ALIASES[raw] || 'standard';
}

function getHouseClass(object) {
  const payload = getPayload(object);

  return normalizeHouseClass(
    payload.houseClass ||
      payload.houseClassLabel ||
      object?.variant ||
      object?.class ||
      'standard'
  );
}

function getHouseOwnerId(object) {
  const payload = getPayload(object);

  return (
    object?.owner_id ||
    object?.ownerId ||
    payload.owner_id ||
    payload.ownerId ||
    null
  );
}

function getHouseOwnerName(object) {
  const payload = getPayload(object);

  return String(
    object?.owner_name ||
      object?.ownerName ||
      payload.owner_name ||
      payload.ownerName ||
      ''
  );
}

function getHousePrice(object) {
  const payload = getPayload(object);
  return toFiniteNumber(object?.price ?? payload.price, 0);
}

function formatPrice(value) {
  const number = toFiniteNumber(value, 0);
  if (number <= 0) return '';
  return `${number.toLocaleString('ru-RU')}₴`;
}

function getHouseState(object) {
  const payload = getPayload(object);

  if (getHouseOwnerId(object) || payload.owned === true) return 'owned';
  if (payload.locked === true || object?.locked === true) return 'locked';

  return 'free';
}

function getHouseColors(state) {
  return DEFAULT_HOUSE_COLORS[state] || DEFAULT_HOUSE_COLORS.default;
}

function getHouseTitle(object, houseClass, state) {
  const ownerName = getHouseOwnerName(object);
  const price = formatPrice(getHousePrice(object));
  const status = state === 'owned'
    ? 'Куплен'
    : state === 'locked'
      ? 'Закрыт'
      : 'Свободен';

  return [object?.name || 'Дом', houseClass, status, ownerName, price]
    .filter(Boolean)
    .join(' · ');
}

function getObjectMeta(object) {
  const category = getCategory(object);
  const type = getType(object, category);

  if (category === 'house') {
    const houseClass = getHouseClass(object);
    const state = getHouseState(object);
    const colors = getHouseColors(state);

    return {
      category,
      type: getType(object, category),
      title: getHouseTitle(object, houseClass, state),
      visualClass: houseClass,
      state,
      ownerId: getHouseOwnerId(object),
      colors,
      icon: '⌂',
    };
  }

  if (category === 'service' || type === 'hospital') {
    const payload = getPayload(object);
    const serviceType = String(payload.serviceType || type || 'service');
    const locked = payload.locked === true || object?.locked === true;
    const colors = DEFAULT_SERVICE_COLORS[serviceType] || DEFAULT_SERVICE_COLORS.default;

    return {
      category: 'service',
      type: serviceType,
      title: object?.name || payload.serviceLabel || 'Больница',
      visualClass: serviceType,
      state: locked ? 'locked' : 'open',
      ownerId: null,
      colors,
      icon: object?.icon || payload.icon || (serviceType === 'hospital' ? '🏥' : '✚'),
    };
  }

  return {
    category,
    type,
    title: object?.name || 'Маркер',
    visualClass: type,
    state: 'default',
    ownerId: null,
    colors: DEFAULT_HOUSE_COLORS.default,
    icon: object?.icon || '◆',
  };
}

function getObjectRenderSize(category, visualClass) {
  if (category === 'service') {
    return visualClass === 'hospital' ? 28 : 24;
  }

  if (category !== 'house') return 18;

  const normalized = normalizeHouseClass(visualClass);
  if (normalized === 'ultra_lux') return 26;
  if (normalized === 'premium') return 24;
  if (normalized === 'comfort') return 23;

  return 22;
}

function getObjectSignature(object) {
  const payload = getPayload(object);
  const meta = getObjectMeta(object);

  return [
    getObjectId(object),
    toFiniteNumber(object?.x, 50),
    toFiniteNumber(object?.y, 50),
    toFiniteNumber(object?.scale, 1),
    toFiniteNumber(object?.rotation, 0),
    meta.category,
    meta.type,
    meta.visualClass,
    meta.state,
    meta.ownerId || '',
    getHousePrice(object),
    getHouseOwnerName(object),
    payload.locked === true ? 'locked' : 'open',
    toFiniteNumber(payload.renderWidth, 0),
    toFiniteNumber(payload.renderHeight, 0),
    String(payload.fieldCrop || payload.cropType || payload.farmCrop || ''),
    object?.selected === true ? 'selected' : 'idle',
    object?.icon || '',
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
  layer.style.zIndex = layer.classList.contains('map-objects-layer-admin') ? '260' : '220';
  layer.style.contain = 'layout style paint';
}

function applyObjectStyle(element, object, meta) {
  const x = clamp(toFiniteNumber(object?.x, 50), 0, 100);
  const y = clamp(toFiniteNumber(object?.y, 50), 0, 100);
  const rotation = toFiniteNumber(object?.rotation, 0);
  const objectScale = Math.max(0.4, toFiniteNumber(object?.scale, 1));
  const size = getObjectRenderSize(meta.category, meta.visualClass);
  const payload = getPayload(object);
  const jobWidth = clamp(toFiniteNumber(payload.renderWidth, meta.type === 'farm_field' ? 8 : 2.6), 0.8, 30);
  const jobHeight = clamp(toFiniteNumber(payload.renderHeight, meta.type === 'farm_field' ? 8 : 2.2), 0.8, 30);
  const customJobSize = meta.category === 'job' && (meta.type === 'farm_field' || meta.type === 'farm_station');

  element.style.position = 'absolute';
  element.style.left = `${x}%`;
  element.style.top = `${y}%`;
  element.style.width = customJobSize ? `${jobWidth}%` : `${size}px`;
  element.style.height = customJobSize ? `${jobHeight}%` : `${size}px`;
  element.style.minWidth = customJobSize ? '0' : `${size}px`;
  element.style.minHeight = customJobSize ? '0' : `${size}px`;
  if (customJobSize) {
    element.style.setProperty('--mn-job-width', String(jobWidth));
    element.style.setProperty('--mn-job-height', String(jobHeight));
  }
  element.style.border = '0';
  element.style.padding = '0';
  element.style.margin = '0';
  element.style.background = 'transparent';
  // Jobs such as farm fields/stations are physical world objects with dimensions in map percent.
  // Do not counter-scale them like icon markers: their visual size must grow/shrink with the camera
  // and stay equal to the real work area configured in the admin editor.
  element.style.transform = customJobSize
    ? `translate(-50%, -50%) rotate(${rotation}deg) scale(${objectScale})`
    : `translate(-50%, -50%) rotate(${rotation}deg) scale(${objectScale}) scale(var(--map-entity-scale, 1))`;
  element.style.transformOrigin = 'center center';
  element.style.pointerEvents = 'auto';
  element.style.cursor = ['house', 'business', 'npc', 'service', 'job'].includes(meta.category) ? 'pointer' : 'default';
  element.style.zIndex = meta.category === 'service' ? '245' : meta.category === 'job' ? '242' : meta.category === 'house' ? '240' : '230';
  element.style.contain = 'layout style paint';
  element.style.willChange = 'transform';

  element.style.setProperty('--map-house-main', meta.colors?.main || DEFAULT_HOUSE_COLORS.default.main);
  element.style.setProperty('--map-house-dark', meta.colors?.dark || DEFAULT_HOUSE_COLORS.default.dark);
  element.style.setProperty('--map-house-soft', meta.colors?.soft || DEFAULT_HOUSE_COLORS.default.soft);
  element.style.setProperty('--map-house-roof', meta.colors?.roof || DEFAULT_HOUSE_COLORS.default.roof);
}

function createHouseIcon(meta) {
  const icon = document.createElement('span');

  icon.className = [
    'map-house-clean',
    'map-house-lite',
    `map-house-clean-${safeClassName(meta.visualClass)}`,
    `map-house-lite-${safeClassName(meta.visualClass)}`,
    `map-house-clean-${safeClassName(meta.state)}`,
    `map-house-lite-${safeClassName(meta.state)}`,
  ].join(' ');

  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⌂';
  icon.style.display = 'grid';
  icon.style.placeItems = 'center';
  icon.style.width = '100%';
  icon.style.height = '100%';
  icon.style.lineHeight = '1';
  icon.style.fontSize = '18px';
  icon.style.fontWeight = '900';
  icon.style.color = meta.colors?.main || '#35e985';
  icon.style.textShadow = 'none';

  return icon;
}

function createServiceIcon(meta) {
  const icon = document.createElement('span');

  icon.className = [
    'map-service-icon',
    `map-service-icon-${safeClassName(meta.visualClass)}`,
    `map-service-icon-${safeClassName(meta.state)}`,
  ].join(' ');

  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = String(meta.icon || '🏥');
  icon.style.display = 'grid';
  icon.style.placeItems = 'center';
  icon.style.width = '100%';
  icon.style.height = '100%';
  icon.style.borderRadius = '9px';
  icon.style.background = 'rgba(248,250,252,0.94)';
  icon.style.boxShadow = '0 2px 7px rgba(0,0,0,0.28), 0 0 0 2px rgba(239,51,71,0.72)';
  icon.style.lineHeight = '1';
  icon.style.fontSize = '18px';
  icon.style.transform = 'translateZ(0)';

  return icon;
}

function createMarkerIcon(meta) {
  const icon = document.createElement('span');

  icon.className = 'map-object-icon';
  icon.textContent = String(meta.icon || '◆');
  icon.style.pointerEvents = 'none';
  icon.style.lineHeight = '1';

  return icon;
}

function updateObjectIcon(element, meta) {
  const nextIconKey = `${meta.category}:${meta.visualClass}:${meta.state}:${meta.icon}`;

  if (element.dataset.iconKey === nextIconKey && element.firstElementChild) {
    return;
  }

  element.dataset.iconKey = nextIconKey;
  element.textContent = '';
  element.appendChild(
    meta.category === 'house'
      ? createHouseIcon(meta)
      : meta.category === 'service'
        ? createServiceIcon(meta)
        : createMarkerIcon(meta)
  );
}

function createObjectElement(object, state = null) {
  const element = state?.pool?.pop?.() || document.createElement('button');

  element.type = 'button';
  element.tabIndex = -1;
  element.hidden = false;

  updateObjectElement(element, object);

  return element;
}

function updateObjectElement(element, object) {
  const id = getObjectId(object);
  const meta = getObjectMeta(object);
  const categoryClass = safeClassName(meta.category, 'marker');
  const typeClass = safeClassName(meta.type, categoryClass);
  const visualClass = safeClassName(meta.visualClass, 'default');
  const stateClass = safeClassName(meta.state, 'default');
  const selectedClass = object?.selected === true ? ' map-object-selected' : '';
  const payload = getPayload(object);
  const farmCrop = meta.type === 'farm_field'
    ? (String(payload.fieldCrop || payload.cropType || payload.farmCrop || 'wheat').toLowerCase() === 'apple' ? 'apple' : 'wheat')
    : '';
  const farmCropClass = farmCrop ? ` map-object-farm-crop-${farmCrop}` : '';

  element.className = `map-object map-object-${categoryClass} map-object-type-${typeClass} map-object-visual-${visualClass} map-object-state-${stateClass}${farmCropClass}${selectedClass}`;
  element.dataset.mapObjectId = id;
  element.dataset.mapObjectType = meta.type;
  element.dataset.mapObjectCategory = meta.category;
  element.dataset.mapObjectState = meta.state;
  element.dataset.mapObjectOwnerId = String(meta.ownerId || '');
  if (farmCrop) element.dataset.farmCrop = farmCrop;
  else delete element.dataset.farmCrop;
  element.title = escapeHtml(meta.title);
  element.setAttribute('aria-label', meta.title);

  applyObjectStyle(element, object, meta);
  updateObjectIcon(element, meta);

  element.querySelector(':scope > .map-object-admin-resize-handle')?.remove();
  if (object?.selected === true && meta.type === 'farm_field') {
    const handle = document.createElement('span');
    handle.className = 'map-object-admin-resize-handle';
    handle.dataset.adminJobResize = id;
    handle.setAttribute('aria-hidden', 'true');
    element.appendChild(handle);
  }
}

function getCachedElement(layer, id) {
  const cached = layer?.__mnObjectElements?.get?.(id);
  if (cached?.isConnected) return cached;

  const children = layer?.children || [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child?.dataset?.mapObjectId === id) return child;
  }

  return null;
}

function getDistance(object, focusX, focusY) {
  const x = clamp(toFiniteNumber(object?.x, 50), 0, 100);
  const y = clamp(toFiniteNumber(object?.y, 50), 0, 100);

  return Math.hypot(x - focusX, y - focusY);
}

function getSpatialCell(value) {
  return Math.floor(clamp(toFiniteNumber(value, 0), 0, 100) / MOBILE_GRID_CELL_PERCENT);
}

function getSpatialKey(cellX, cellY) {
  return `${cellX}:${cellY}`;
}

function getSpatialSignature(objects) {
  if (!Array.isArray(objects) || objects.length === 0) return '0';

  /*
    Signature is intentionally compact. It changes when the object set, position,
    ownership or visual state changes, but it does not include transient DOM-only data.
  */
  return `${objects.length}|${objects.map((object) => getObjectSignature(object)).join('~')}`;
}

function rebuildSpatialIndex(state) {
  const nextSignature = getSpatialSignature(state.objects);

  if (state.spatialSignature === nextSignature && state.spatialIndex) {
    return;
  }

  const index = new Map();

  state.objects.forEach((object) => {
    const id = getObjectId(object);
    if (!id) return;

    const cellX = getSpatialCell(object?.x);
    const cellY = getSpatialCell(object?.y);
    const key = getSpatialKey(cellX, cellY);
    const bucket = index.get(key);

    if (bucket) {
      bucket.push(object);
    } else {
      index.set(key, [object]);
    }
  });

  state.spatialSignature = nextSignature;
  state.spatialIndex = index;
}

function getObjectsFromSpatialIndex(state, focusX, focusY, radius) {
  if (!state.spatialIndex?.size) return [];

  const minCellX = getSpatialCell(focusX - radius);
  const maxCellX = getSpatialCell(focusX + radius);
  const minCellY = getSpatialCell(focusY - radius);
  const maxCellY = getSpatialCell(focusY + radius);
  const seen = new Set();
  const result = [];

  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      const bucket = state.spatialIndex.get(getSpatialKey(cellX, cellY));
      if (!bucket) continue;

      bucket.forEach((object) => {
        const id = getObjectId(object);
        if (!id || seen.has(id)) return;

        const distance = getDistance(object, focusX, focusY);
        if (distance > radius) return;

        seen.add(id);
        result.push({ object, distance });
      });
    }
  }

  result.sort((a, b) => a.distance - b.distance);

  return result.map((entry) => entry.object);
}

function getObjectById(state, id) {
  const objectId = String(id || '').trim();
  if (!objectId) return null;

  return state.objects.find((object) => getObjectId(object) === objectId) || null;
}

function isAdminLayer(layer) {
  return (
    layer?.classList?.contains('map-objects-layer-admin') ||
    layer?.closest?.('.home')?.dataset?.adminMode === 'enabled' ||
    document.querySelector?.('.home')?.dataset?.adminMode === 'enabled'
  );
}

function readPlayerFocus(layer) {
  const scope = layer?.closest?.('.gta-map-viewport') || document;
  const player =
    scope.querySelector?.('[data-player-id][data-x][data-y]') ||
    document.querySelector('[data-player-id][data-x][data-y]');

  return {
    x: clamp(toFiniteNumber(player?.dataset?.x, 50), 0, 100),
    y: clamp(toFiniteNumber(player?.dataset?.y, 50), 0, 100),
  };
}

function getObjectsToRender(state) {
  const fullRender = !state.mobile || state.forceFullRender || isAdminLayer(state.layer);

  if (fullRender) {
    return state.objects.slice(0, DESKTOP_MAX_VISIBLE_OBJECTS);
  }

  rebuildSpatialIndex(state);

  const renderRadius = state.renderRadius || MOBILE_RENDER_RADIUS;
  const keepRadius = Math.max(renderRadius, state.keepRadius || MOBILE_KEEP_RADIUS);
  const nextById = new Map();

  getObjectsFromSpatialIndex(state, state.focusX, state.focusY, renderRadius)
    .slice(0, MOBILE_MAX_VISIBLE_OBJECTS)
    .forEach((object) => {
      const id = getObjectId(object);
      if (id) nextById.set(id, object);
    });

  /*
    Keep already visible objects a little longer. This prevents flashing on the
    border of the render window while the player is walking.
  */
  state.elements.forEach((element, id) => {
    if (nextById.has(id)) return;

    const object = getObjectById(state, id);
    if (!object) return;

    if (getDistance(object, state.focusX, state.focusY) <= keepRadius) {
      nextById.set(id, object);
    }
  });

  return Array.from(nextById.values())
    .sort((a, b) => getDistance(a, state.focusX, state.focusY) - getDistance(b, state.focusX, state.focusY))
    .slice(0, MOBILE_MAX_VISIBLE_OBJECTS);
}

function removeObjectElement(state, id) {
  const element = state.elements.get(id);

  if (element) {
    element.remove();

    if (state.pool.length < DETACHED_OBJECT_POOL_LIMIT) {
      element.textContent = '';
      element.removeAttribute('class');
      element.removeAttribute('style');
      element.removeAttribute('title');
      element.removeAttribute('aria-label');
      Object.keys(element.dataset || {}).forEach((key) => {
        delete element.dataset[key];
      });
      state.pool.push(element);
    }
  }

  state.elements.delete(id);
  state.signatures.delete(id);
}

function renderObjectBatch(state, objects, startIndex = 0, nextIds = new Set()) {
  if (!state.layer?.isConnected) {
    layerStates.delete(state);
    return;
  }

  const fragment = document.createDocumentFragment();
  const budget = state.mobile && !state.forceFullRender && !isAdminLayer(state.layer)
    ? MOBILE_RENDER_BUDGET
    : objects.length;

  let index = startIndex;
  let count = 0;

  for (; index < objects.length && count < budget; index += 1, count += 1) {
    const object = objects[index];
    const id = getObjectId(object);

    if (!id) continue;

    nextIds.add(id);

    const nextSignature = getObjectSignature(object);
    let element = getCachedElement(state.layer, id);

    if (!element) {
      element = createObjectElement(object, state);
      fragment.appendChild(element);
      state.elements.set(id, element);
      state.signatures.set(id, nextSignature);
      continue;
    }

    if (state.signatures.get(id) !== nextSignature) {
      updateObjectElement(element, object);
      state.signatures.set(id, nextSignature);
    }

    state.elements.set(id, element);
  }

  if (fragment.childNodes.length) {
    state.layer.appendChild(fragment);
  }

  if (index < objects.length) {
    state.idleId = scheduleIdle(() => {
      state.idleId = 0;
      renderObjectBatch(state, objects, index, nextIds);
    });

    return;
  }

  Array.from(state.elements.keys()).forEach((id) => {
    if (nextIds.has(id)) return;
    removeObjectElement(state, id);
  });

  state.layer.dataset.renderedCount = String(nextIds.size);
  state.layer.dataset.totalCount = String(state.objects.length);
  state.layer.dataset.virtualized = state.mobile && !state.forceFullRender && !isAdminLayer(state.layer)
    ? 'true'
    : 'false';
}

function clearPendingCameraPaint(state) {
  if (!state?.cameraTimerId) return;

  window.clearTimeout(state.cameraTimerId);
  state.cameraTimerId = 0;
}

function scheduleCameraPaintAfterBusy(state) {
  if (!state || state.cameraTimerId) return;

  state.cameraTimerId = window.setTimeout(() => {
    state.cameraTimerId = 0;

    if (!state.layer?.isConnected) return;

    if (isMobilePlayerBusy()) {
      scheduleCameraPaintAfterBusy(state);
      return;
    }

    paintLayerState(state, { fromCamera: true, force: true });
  }, MOBILE_CAMERA_BUSY_RETRY_MS);
}

function shouldSkipMobileCameraPaint(state, focusX, focusY, force = false) {
  if (force || !state.mobile || state.forceFullRender || isAdminLayer(state.layer)) return false;

  if (isMobilePlayerBusy()) {
    scheduleCameraPaintAfterBusy(state);
    return true;
  }

  const now = performance.now();
  const moved = Math.hypot(
    focusX - state.lastCameraPaintFocusX,
    focusY - state.lastCameraPaintFocusY
  );

  if (
    Number.isFinite(state.lastCameraPaintAt) &&
    now - state.lastCameraPaintAt < MOBILE_CAMERA_RENDER_INTERVAL_MS &&
    moved < MOBILE_CAMERA_MOVE_EPSILON_PERCENT
  ) {
    return true;
  }

  return false;
}

function paintLayerState(state, options = {}) {
  if (!state.layer?.isConnected) {
    layerStates.delete(state);
    return;
  }

  if (state.rafId) return;

  state.rafId = requestAnimationFrame(() => {
    state.rafId = 0;

    if (state.idleId) {
      cancelIdle(state.idleId);
      state.idleId = 0;
    }

    clearPendingCameraPaint(state);

    if (options.fromCamera) {
      state.lastCameraPaintAt = performance.now();
      state.lastCameraPaintFocusX = state.focusX;
      state.lastCameraPaintFocusY = state.focusY;
    }

    const objects = getObjectsToRender(state);
    renderObjectBatch(state, objects);
  });
}

function ensureGlobalCameraListener() {
  if (globalCameraListenerEnabled) return;

  globalCameraListenerEnabled = true;

  window.addEventListener('mn:map-camera-focus', (event) => {
    const detail = event?.detail || {};
    const focusX = clamp(toFiniteNumber(detail.x, 50), 0, 100);
    const focusY = clamp(toFiniteNumber(detail.y, 50), 0, 100);

    layerStates.forEach((state) => {
      if (!state.layer?.isConnected) {
        layerStates.delete(state);
        return;
      }

      if (detail.cityId && state.cityId && String(detail.cityId) !== String(state.cityId)) {
        return;
      }

      state.focusX = focusX;
      state.focusY = focusY;

      if (shouldSkipMobileCameraPaint(state, focusX, focusY, false)) {
        return;
      }

      paintLayerState(state, { fromCamera: true });
    });
  }, { passive: true });
}

function getOrCreateLayerState(layer, options = {}) {
  let state = layer.__mnObjectRendererState;

  if (!state) {
    const focus = readPlayerFocus(layer);

    state = {
      layer,
      objects: [],
      elements: new Map(),
      signatures: new Map(),
      mobile: isMobileDevice(),
      forceFullRender: false,
      focusX: focus.x,
      focusY: focus.y,
      cityId: '',
      renderRadius: MOBILE_RENDER_RADIUS,
      keepRadius: MOBILE_KEEP_RADIUS,
      spatialIndex: new Map(),
      spatialSignature: '',
      pool: [],
      rafId: 0,
      idleId: 0,
      cameraTimerId: 0,
      lastCameraPaintAt: Number.NEGATIVE_INFINITY,
      lastCameraPaintFocusX: focus.x,
      lastCameraPaintFocusY: focus.y,
    };

    layer.__mnObjectRendererState = state;
    layer.__mnObjectElements = state.elements;
    layerStates.add(state);
    ensureGlobalCameraListener();
  }

  state.mobile = isMobileDevice();
  state.forceFullRender = Boolean(options.forceFullRender || options.fullRender || isAdminLayer(layer));
  state.cityId = options.cityId || layer.dataset.cityId || state.cityId || '';
  state.renderRadius = Number(options.renderRadius || MOBILE_RENDER_RADIUS);
  state.keepRadius = Number(options.keepRadius || MOBILE_KEEP_RADIUS);

  return state;
}

export function createMapObjectsLayer() {
  const layer = document.createElement('div');

  layer.className = 'map-objects-layer';
  layer.setAttribute('aria-hidden', 'false');
  applyLayerBaseStyle(layer);

  return layer;
}

export function renderMapObjects(layer, objects = [], options = {}) {
  if (!layer) return;

  applyLayerBaseStyle(layer);

  const state = getOrCreateLayerState(layer, options);

  state.objects = Array.isArray(objects)
    ? objects.filter(Boolean)
    : [];

  rebuildSpatialIndex(state);
  clearPendingCameraPaint(state);
  paintLayerState(state, { force: true });
}


export function clearMapObjectsLayer(layer) {
  if (!layer) return;

  const state = layer.__mnObjectRendererState;

  if (state?.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  if (state?.idleId) {
    cancelIdle(state.idleId);
    state.idleId = 0;
  }

  if (state?.cameraTimerId) {
    window.clearTimeout(state.cameraTimerId);
    state.cameraTimerId = 0;
  }

  if (state) {
    state.objects = [];
    state.elements.clear();
    state.signatures.clear();
    state.spatialIndex?.clear?.();
    state.spatialSignature = '';
    state.pool.length = 0;
    layerStates.delete(state);
  }

  if (layer.__mnObjectElements?.clear) {
    layer.__mnObjectElements.clear();
  }

  delete layer.__mnObjectRendererState;
  delete layer.__mnObjectElements;

  layer.replaceChildren();
  layer.dataset.renderedCount = '0';
  layer.dataset.totalCount = '0';
  layer.dataset.virtualized = 'false';
}

export function findMapObjectElement(layerOrObjectId, maybeObjectId) {
  const hasExplicitLayer = maybeObjectId !== undefined;
  const layer = hasExplicitLayer ? layerOrObjectId : null;
  const objectId = String(hasExplicitLayer ? maybeObjectId : layerOrObjectId || '').trim();

  if (!objectId) return null;

  const findInLayer = (targetLayer) => {
    if (!targetLayer) return null;

    const cached = targetLayer.__mnObjectElements?.get?.(objectId);
    if (cached?.isConnected) return cached;

    const children = targetLayer.children || [];

    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child?.dataset?.mapObjectId === objectId) return child;
    }

    return null;
  };

  if (layer?.querySelector || layer?.children) {
    return findInLayer(layer);
  }

  for (const state of layerStates) {
    const element = findInLayer(state.layer);
    if (element) return element;
  }

  const layers = document.querySelectorAll?.('.map-objects-layer, .map-objects-layer-admin') || [];

  for (let index = 0; index < layers.length; index += 1) {
    const element = findInLayer(layers[index]);
    if (element) return element;
  }

  for (const state of layerStates) {
    if (layer && state.layer !== layer) continue;

    const object = getObjectById(state, objectId);
    if (!object) continue;

    const element = createObjectElement(object, state);
    state.elements.set(objectId, element);
    state.signatures.set(objectId, getObjectSignature(object));
    state.layer?.appendChild?.(element);
    return element;
  }

  return null;
}

export function getMapObjectIdFromEvent(event) {
  const target = event?.target;
  const element = target?.closest?.('[data-map-object-id]');

  return element?.dataset?.mapObjectId || null;
}

