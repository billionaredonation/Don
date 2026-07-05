const DEFAULT_HOUSE_COLORS = Object.freeze({
  free: Object.freeze({ main: '#35e985', dark: '#0f8f52', soft: '#93ffc4', roof: '#20d977' }),
  owned: Object.freeze({ main: '#ff4d5e', dark: '#8f1d2d', soft: '#ff9aaa', roof: '#ff3148' }),
  locked: Object.freeze({ main: '#9ca3af', dark: '#4b5563', soft: '#d1d5db', roof: '#6b7280' }),
  default: Object.freeze({ main: '#35e985', dark: '#0f8f52', soft: '#93ffc4', roof: '#20d977' }),
});

const HOUSE_CLASS_ALIASES = Object.freeze({
  std: 'standard',
  standard: 'standard',
  'стандарт': 'standard',
  comfort: 'comfort',
  'комфорт': 'comfort',
  premium: 'premium',
  prem: 'premium',
  'премиум': 'premium',
  lux: 'lux',
  luxe: 'lux',
  luxury: 'lux',
  'люкс': 'lux',
  elite: 'elite',
  vip: 'elite',
  'элита': 'elite',
});

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

  return {
    category,
    type: getType(object, category),
    title: object?.name || 'Маркер',
    visualClass: getType(object, category),
    state: 'default',
    ownerId: null,
    colors: DEFAULT_HOUSE_COLORS.default,
    icon: object?.icon || '◆',
  };
}

function getObjectRenderSize(category, visualClass) {
  if (category !== 'house') return 18;

  const normalized = normalizeHouseClass(visualClass);
  if (normalized === 'elite') return 26;
  if (normalized === 'lux') return 25;
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
  layer.style.zIndex = '220';
  layer.style.contain = 'layout style paint';
}

function applyObjectStyle(element, object, meta) {
  const x = clamp(toFiniteNumber(object?.x, 50), -10, 110);
  const y = clamp(toFiniteNumber(object?.y, 50), -10, 110);
  const scale = clamp(toFiniteNumber(object?.scale, 1), 0.25, 3);
  const rotation = toFiniteNumber(object?.rotation, 0);
  const size = getObjectRenderSize(meta.category, meta.visualClass);
  const colors = meta.colors || DEFAULT_HOUSE_COLORS.default;

  element.style.position = 'absolute';
  element.style.left = `${x}%`;
  element.style.top = `${y}%`;
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.minWidth = `${size}px`;
  element.style.minHeight = `${size}px`;
  element.style.display = 'grid';
  element.style.placeItems = 'center';
  element.style.padding = '0';
  element.style.border = '0';
  element.style.background = 'transparent';
  element.style.transform = `translate3d(-50%, -50%, 0) rotate(${rotation}deg) scale(${scale})`;
  element.style.transformOrigin = 'center center';
  element.style.pointerEvents = 'auto';
  element.style.cursor = 'pointer';
  element.style.zIndex = '10';
  element.style.willChange = 'transform';
  element.style.setProperty('--map-object-scale', String(scale));
  element.style.setProperty('--map-object-rotation', `${rotation}deg`);
  element.style.setProperty('--map-house-main', colors.main);
  element.style.setProperty('--map-house-dark', colors.dark);
  element.style.setProperty('--map-house-soft', colors.soft);
  element.style.setProperty('--map-house-roof', colors.roof);
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
  element.appendChild(meta.category === 'house' ? createHouseIcon(meta) : createMarkerIcon(meta));
}

function createObjectElement(object) {
  const element = document.createElement('button');

  element.type = 'button';
  element.tabIndex = -1;

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

  element.className = `map-object map-object-${categoryClass} map-object-type-${typeClass} map-object-visual-${visualClass} map-object-state-${stateClass}${selectedClass}`;
  element.dataset.mapObjectId = id;
  element.dataset.mapObjectType = meta.type;
  element.dataset.mapObjectCategory = meta.category;
  element.dataset.mapObjectState = meta.state;
  element.dataset.mapObjectOwnerId = String(meta.ownerId || '');
  element.title = meta.title;

  applyObjectStyle(element, object, meta);
  updateObjectIcon(element, meta);
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

  if (!layer.__mnObjectSignatures) layer.__mnObjectSignatures = new Map();
  if (!layer.__mnObjectElements) layer.__mnObjectElements = new Map();

  const signatures = layer.__mnObjectSignatures;
  const elements = layer.__mnObjectElements;
  const nextIds = new Set();
  const safeObjects = Array.isArray(objects) ? objects.filter(Boolean) : [];

  layer.dataset.objectsCount = String(safeObjects.length);

  safeObjects.forEach((object) => {
    const id = getObjectId(object);
    if (!id) return;

    nextIds.add(id);

    const nextSignature = getObjectSignature(object);
    let element = elements.get(id);

    if (!element?.isConnected) {
      element = getCachedElement(layer, id);
    }

    if (!element) {
      element = createObjectElement(object);
      layer.appendChild(element);
      elements.set(id, element);
      signatures.set(id, nextSignature);
      return;
    }

    if (signatures.get(id) !== nextSignature) {
      updateObjectElement(element, object);
      signatures.set(id, nextSignature);
    }

    elements.set(id, element);
  });

  Array.from(signatures.keys()).forEach((id) => {
    if (nextIds.has(id)) return;

    const element = elements.get(id) || getCachedElement(layer, id);
    if (element?.parentNode === layer) {
      layer.removeChild(element);
    } else {
      element?.remove?.();
    }

    elements.delete(id);
    signatures.delete(id);
  });

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('mn:map-objects-dom-rendered', {
      detail: {
        count: safeObjects.length,
        layerChildren: layer.children.length,
      },
    }));
  }
}

export function clearMapObjectsLayer(layer) {
  if (!layer) return;

  layer.textContent = '';
  layer.__mnObjectSignatures?.clear?.();
  layer.__mnObjectElements?.clear?.();
  layer.dataset.objectsCount = '0';
}

export function findMapObjectElement(layer, objectId) {
  if (!layer || !objectId) return null;

  const id = String(objectId);
  const found = getCachedElement(layer, id);

  if (found) {
    layer.__mnObjectElements?.set?.(id, found);
  }

  return found;
}

export function getMapObjectIdFromEvent(event) {
  return event?.target?.closest?.('[data-map-object-id]')?.dataset?.mapObjectId || null;
}
