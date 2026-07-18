import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import { getStaminaConfig } from '../player/playerStaminaConfig.js';
import { getPlayerVitalsConfig } from '../player/playerStatsConfig.js';
import { getLocalPlayerId, getSessionId } from '../player/playerPosition.js';
import {
  claimInteriorSeat,
  createInteriorRealtimeRoom,
  heartbeatInteriorSeat,
  loadInteriorSeatStates,
  releaseInteriorSeat,
  subscribeInteriorSeatStates,
} from './interiorRealtime.js';
import standardInteriorUrl from '../../standart_interior.png?url';
import premiumInteriorUrl from '../../premium_interior.png?url';
import luxeInteriorUrl from '../../luxe_interior.png?url';
import hospitalInteriorUrl from '../../ambulance_interior.png?url';
import './interiors.css';

const INTERIOR_COLLISION_TABLE = 'interior_collision_profiles';
const INTERIOR_MAPPED_OBJECT_TABLE = 'interior_mapped_objects';
const INTERIOR_DOOR_STATE_TABLE = 'interior_door_states';
const INTERIOR_COLLISION_FALLBACK_RADIUS = 0;
const INTERIOR_COLLISION_STORAGE_KEY = 'mn-interior-colliders-v1';
const INTERIOR_COLLIDER_PANEL_POSITION_KEY = 'mn-interior-collider-panel-position-v1';
const INTERIOR_COLLIDER_MIN_SIZE = 0.7;
const INTERIOR_DESIGN_ASPECT = 16 / 9;
const INTERIOR_MAPPED_OBJECT_LIMIT = 300;
const INTERIOR_DOOR_INTERACTION_RADIUS = 7.5;
const INTERIOR_EXIT_INTERACTION_RADIUS = 6.5;
const INTERIOR_CHAIR_INTERACTION_RADIUS = 6.5;
const INTERIOR_DOOR_RADIUS_HYSTERESIS = 1.4;
const INTERIOR_PRESENCE_REFRESH_MS = 2200;
const INTERIOR_SEAT_HEARTBEAT_MS = 8000;
const INTERIOR_SEAT_STALE_MS = 32000;
const INTERIOR_REMOTE_PLAYER_STALE_MS = 18000;
const INTERIOR_MAPPED_OBJECT_TYPES = Object.freeze({
  bed: Object.freeze({
    label: 'Кровать', defaultWidth: 11, defaultHeight: 6,
    minWidth: 1.5, maxWidth: 24, minHeight: 1, maxHeight: 18,
  }),
  chair: Object.freeze({
    label: 'Стул', defaultWidth: 4, defaultHeight: 4,
    minWidth: 1, maxWidth: 10, minHeight: 1, maxHeight: 12,
  }),
  table: Object.freeze({
    label: 'Стол', defaultWidth: 8, defaultHeight: 6,
    minWidth: 1.5, maxWidth: 24, minHeight: 1, maxHeight: 18,
  }),
  door: Object.freeze({
    label: 'Дверь', defaultWidth: 4.2, defaultHeight: 1.15,
    minWidth: 1.4, maxWidth: 12, minHeight: 0.45, maxHeight: 4,
  }),
  exit: Object.freeze({
    label: 'Выход', defaultWidth: 3.2, defaultHeight: 5.4,
    minWidth: 1.4, maxWidth: 10, minHeight: 2.4, maxHeight: 16,
  }),
});
const INTERIOR_VITALS_CONFIG = getPlayerVitalsConfig();
const INTERIOR_HEALTH_LOW_CLASS = 'is-interior-health-low';
const INTERIOR_HEALTH_HIT_CLASS = 'is-interior-health-hit';
const INTERIOR_HEALTH_HIT_DURATION_MS = 620;
const INTERIOR_VITAL_FEEDBACK_DURATION_MS = 520;

const INTERIOR_COLLISION_PROFILES = {
  standard: {
    radius: 0,
    bounds: [],
    blocked: [],
    objects: [],
  },

  premium: {
    radius: 0,
    bounds: [],
    blocked: [],
    objects: [],
  },

  ultra_lux: {
    radius: 0,
    bounds: [],
    blocked: [],
    objects: [],
  },

  hospital: {
    radius: 0,
    bounds: [],
    blocked: [],
    objects: [],
  },
};

const TEMPLATES = {
  standard: { id: 'standard', label: 'Стандарт', file: 'standart_interior.png', url: standardInteriorUrl, rooms: 1, kitchen: 1, bathroom: 1, spawn: { x: 50, y: 82 } },
  premium: { id: 'premium', label: 'Премиум', file: 'premium_interior.png', url: premiumInteriorUrl, rooms: 2, kitchen: 2, bathroom: 2, spawn: { x: 58, y: 82 } },
  ultra_lux: { id: 'ultra_lux', label: 'Ультра-люкс', file: 'luxe_interior.png', url: luxeInteriorUrl, rooms: 4, kitchen: 3, bathroom: 3, spawn: { x: 50, y: 90 } },
  hospital: { id: 'hospital', label: 'Больница', file: 'ambulance_interior.png', url: hospitalInteriorUrl, rooms: 18, kitchen: 0, bathroom: 6, spawn: { x: 50, y: 61 } },
};

function roundPercent(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isTruthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function isInteriorColliderAdmin() {
  return isTruthy(state.is_admin) ||
    isTruthy(state.isAdmin) ||
    isTruthy(state.player?.is_admin) ||
    isTruthy(state.player?.isAdmin);
}

function readJsonLocalStorage(key, fallback = null) {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeTelegramId(value) {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) ? text : null;
}

function getInteriorColliderAdminIdentity() {
  const savedState = readJsonLocalStorage('mn-game-state', null);
  const savedAuth = readJsonLocalStorage('mn_auth_player', null);
  const playerId =
    state.player?.id ||
    state.playerId ||
    state.player?.playerId ||
    state.player?.player_id ||
    savedState?.player?.id ||
    savedState?.playerId ||
    savedState?.player?.playerId ||
    savedState?.player?.player_id ||
    savedAuth?.id ||
    window.localStorage?.getItem('mn_player_id') ||
    null;
  const telegramId =
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
    state.telegramId ||
    state.tg_id ||
    state.player?.tg_id ||
    state.player?.telegramId ||
    savedState?.telegramId ||
    savedState?.player?.tg_id ||
    savedState?.player?.telegramId ||
    window.localStorage?.getItem('mn_player_tg_id') ||
    window.localStorage?.getItem('mn_tg_id') ||
    null;
  const nickname = String(
    state.nickname ||
      state.player?.nickname ||
      state.player?.name ||
      savedAuth?.nickname ||
      savedState?.nickname ||
      savedState?.player?.nickname ||
      window.localStorage?.getItem('mn_player_nickname') ||
      window.localStorage?.getItem('mn_nickname') ||
      ''
  ).trim();

  return {
    adminPlayerId: playerId ? String(playerId).trim() : null,
    adminTgId: normalizeTelegramId(telegramId) || normalizeTelegramId(playerId),
    adminNickname: nickname || null,
  };
}

function playerTgId() {
  return String(state.telegramId || state.player?.tg_id || state.player?.telegramId || '').trim();
}

function normalizeClass(value) {
  const key = String(value || 'standard').trim().toLowerCase().replace(/\s+/g, '_');
  if (['premium', 'prem', 'премиум', 'прем'].includes(key)) return 'premium';
  if ([
    'ultra_lux', 'ultra-lux', 'ultralux', 'ultra', 'lux', 'luxe', 'luxury', 'vip',
    'люкс', 'ультра_люкс', 'ультра-люкс', 'ультралюкс',
  ].includes(key)) return 'ultra_lux';
  return 'standard';
}

function houseId(house) {
  const p = house?.payload || {};
  return String(house?.mapObjectId || house?.objectId || house?.dbId || house?.id || p.mapObjectId || p.objectId || p.houseId || '').trim();
}

function houseOwnerId(house) {
  const payload = house?.payload || {};
  return String(
    house?.owner_id ||
      house?.ownerId ||
      payload.ownerId ||
      payload.owner_id ||
      ''
  ).trim();
}

function houseOwnerName(house) {
  const payload = house?.payload || {};
  return String(
    house?.ownerName ||
      house?.owner_name ||
      payload.ownerName ||
      payload.owner_name ||
      ''
  ).trim();
}

function localHouseAccessSnapshot(house) {
  const ownerId = houseOwnerId(house);
  if (!ownerId) return null;

  const houseClass = normalizeClass(
    house?.class || house?.payload?.houseClass || house?.variant
  );
  const labels = {
    standard: 'Стандарт',
    premium: 'Премиум',
    ultra_lux: 'Ультра-люкс',
  };
  const currentTgId = playerTgId();

  return {
    allowed: true,
    role: currentTgId && currentTgId === ownerId ? 'owner' : 'guest',
    ownerId,
    ownerName: houseOwnerName(house) || null,
    houseClass,
    houseClassLabel: labels[houseClass],
    source: 'map_object_snapshot',
  };
}

async function getSharedHouseInteriorAccess(id, house) {
  const tgId = playerTgId();
  const sharedResult = await supabase.rpc('get_shared_house_interior_access', {
    p_house_id: id,
    p_tg_id: tgId || null,
  });

  if (!sharedResult.error && sharedResult.data?.allowed) {
    return sharedResult.data;
  }

  const legacyResult = await supabase.rpc('get_house_interior_access', {
    p_house_id: id,
    p_tg_id: tgId,
  });

  if (!legacyResult.error && legacyResult.data?.allowed) {
    return legacyResult.data;
  }

  // Старый RPC разрешал вход только владельцу. Карточка дома уже получена из
  // map_objects, поэтому для купленного чужого дома разрешаем гостевой вход и
  // используем серверную миграцию как окончательный источник после деплоя SQL.
  const localAccess = localHouseAccessSnapshot(house);
  if (localAccess) return localAccess;

  throw sharedResult.error || legacyResult.error || new Error(
    sharedResult.data?.reason || legacyResult.data?.reason || 'INTERIOR_ACCESS_DENIED'
  );
}

function mapObjectId(object) {
  const p = object?.payload || {};
  return String(
    object?.mapObjectId ||
      object?.objectId ||
      object?.dbId ||
      object?.id ||
      p.mapObjectId ||
      p.objectId ||
      p.serviceId ||
      p.id ||
      ''
  ).trim();
}

function ensureTemplatePreloadLinks() {
  if (typeof document === 'undefined') return;

  Object.values(TEMPLATES).forEach((template) => {
    const id = `mn-interior-preload-${template.id}`;
    if (document.getElementById(id)) return;

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'preload';
    link.as = 'image';
    link.href = template.url;
    link.fetchPriority = 'high';
    document.head?.appendChild(link);
  });
}

function formatMoney(value) {
  const amount = Math.max(0, Math.round(Number(value || 0)));
  return `${amount.toLocaleString('ru-RU')} ₴`;
}

function clampVitalValue(value, config = {}) {
  const min = Number.isFinite(Number(config.min)) ? Number(config.min) : 0;
  const max = Number.isFinite(Number(config.max)) ? Number(config.max) : 100;
  const fallback = Number.isFinite(Number(config.defaultValue))
    ? Number(config.defaultValue)
    : max;
  const number = Number(value);
  const resolved = Number.isFinite(number) ? number : fallback;

  return Math.min(max, Math.max(min, resolved));
}

const INTERIOR_VITAL_FIELD_ALIASES = Object.freeze({
  health: ['health', 'hp', 'healthPoints', 'health_points'],
  food: ['food', 'hunger', 'satiety'],
  water: ['water', 'thirst', 'hydration'],
});

function getPlayerVitalValue(player = state.player, key = 'health') {
  const config = INTERIOR_VITALS_CONFIG[key] || {};
  const aliases = INTERIOR_VITAL_FIELD_ALIASES[key] || [key];

  for (const field of aliases) {
    const candidate = player?.[field];

    if (candidate === undefined || candidate === null || candidate === '') continue;

    const number = Number(candidate);

    if (Number.isFinite(number)) {
      return clampVitalValue(number, config);
    }
  }

  return clampVitalValue(config.defaultValue, config);
}

function hasPlayerVitalValue(player = {}, key = 'health') {
  const aliases = INTERIOR_VITAL_FIELD_ALIASES[key] || [key];

  return aliases.some((field) => {
    const value = player?.[field];
    return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
  });
}

function mergeDefinedSnapshot(...sources) {
  return sources.reduce((snapshot, source) => {
    if (!source || typeof source !== 'object') return snapshot;

    Object.entries(source).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        snapshot[key] = value;
      }
    });

    return snapshot;
  }, {});
}

function getPlayerStatsSnapshotFromEvent(event) {
  const detail = event?.detail || {};
  const payload = detail.payload || {};

  return mergeDefinedSnapshot(
    payload.record,
    payload.new_record,
    payload.new,
    detail.player,
    detail.vitals,
    detail
  );
}

function getVitalFillStyle(value, key = 'health') {
  const config = INTERIOR_VITALS_CONFIG[key] || {};
  const max = Number.isFinite(Number(config.max)) ? Number(config.max) : 100;
  const fill = max > 0 ? (clampVitalValue(value, config) / max) * 100 : 0;

  return `--mn-interior-vital-fill: ${Math.round(fill)}%`;
}

function clampPercent(value, fallback = 50) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(100, Math.max(0, number));
}

function normalizeCollisionRect(rect) {
  const rawX1 = Number(rect?.x1 ?? rect?.left ?? rect?.x ?? 0);
  const rawY1 = Number(rect?.y1 ?? rect?.top ?? rect?.y ?? 0);
  const rawX2 = Number(rect?.x2 ?? (Number(rect?.x ?? rect?.left ?? 0) + Number(rect?.width ?? rect?.w ?? 0)));
  const rawY2 = Number(rect?.y2 ?? (Number(rect?.y ?? rect?.top ?? 0) + Number(rect?.height ?? rect?.h ?? 0)));

  if (![rawX1, rawY1, rawX2, rawY2].every(Number.isFinite)) return null;

  const x1 = clampPercent(Math.min(rawX1, rawX2), 0);
  const y1 = clampPercent(Math.min(rawY1, rawY2), 0);
  const x2 = clampPercent(Math.max(rawX1, rawX2), 100);
  const y2 = clampPercent(Math.max(rawY1, rawY2), 100);

  if (x2 - x1 < 0.1 || y2 - y1 < 0.1) return null;

  return {
    x1: roundPercent(x1),
    y1: roundPercent(y1),
    x2: roundPercent(x2),
    y2: roundPercent(y2),
  };
}

function normalizeMappedInteriorObject(object, index = 0) {
  const rawType = String(object?.type || object?.object_type || object?.kind || '').trim().toLowerCase();
  const type = INTERIOR_MAPPED_OBJECT_TYPES[rawType] ? rawType : null;
  if (!type) return null;

  const x = Number(object?.x);
  const y = Number(object?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const rawRotation = Number(object?.rotation ?? object?.angle ?? 0);
  const rotation = Number.isFinite(rawRotation)
    ? ((Math.round(rawRotation / 90) * 90 % 360) + 360) % 360
    : 0;
  const fallbackId = `mapped-${type}-${index}-${roundPercent(x)}-${roundPercent(y)}`;
  const id = String(object?.id || fallbackId).trim().slice(0, 96) || fallbackId;
  const properties = object?.properties &&
    typeof object.properties === 'object' &&
    !Array.isArray(object.properties)
    ? { ...object.properties }
    : {};
  const size = mappedInteriorObjectSize({ type, properties });
  properties.width = size.width;
  properties.height = size.height;
  if (type === 'door') properties.depth = size.height;

  return {
    id,
    type,
    x: roundPercent(clampPercent(x, 50)),
    y: roundPercent(clampPercent(y, 50)),
    rotation,
    properties,
  };
}

function mappedInteriorObjectSize(object) {
  const type = String(object?.type || '').trim().toLowerCase();
  const meta = INTERIOR_MAPPED_OBJECT_TYPES[type] || INTERIOR_MAPPED_OBJECT_TYPES.chair;
  const rawWidth = Number(object?.properties?.width);
  const rawHeight = Number(
    object?.properties?.height ??
    (type === 'door' ? object?.properties?.depth : undefined)
  );
  const width = Number.isFinite(rawWidth) ? rawWidth : meta.defaultWidth;
  const height = Number.isFinite(rawHeight) ? rawHeight : meta.defaultHeight;

  return {
    width: roundPercent(Math.max(meta.minWidth, Math.min(meta.maxWidth, width))),
    height: roundPercent(Math.max(meta.minHeight, Math.min(meta.maxHeight, height))),
  };
}

function createMappedInteriorObjectProperties(type) {
  const size = mappedInteriorObjectSize({ type, properties: {} });
  if (type === 'door') {
    return {
      width: size.width,
      height: size.height,
      depth: size.height,
      interactionRadius: INTERIOR_DOOR_INTERACTION_RADIUS,
    };
  }
  if (type === 'exit') {
    return {
      width: size.width,
      height: size.height,
      interactionRadius: INTERIOR_EXIT_INTERACTION_RADIUS,
    };
  }
  return { width: size.width, height: size.height };
}

function normalizeMappedInteriorObjects(objects) {
  return (Array.isArray(objects) ? objects : [])
    .slice(0, INTERIOR_MAPPED_OBJECT_LIMIT)
    .map(normalizeMappedInteriorObject)
    .filter(Boolean);
}

function createMappedInteriorObjectId(type) {
  if (globalThis.crypto?.randomUUID) return `${type}-${globalThis.crypto.randomUUID()}`;
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCollisionProfile(profile, fallbackProfile = null) {
  const fallback = fallbackProfile || {};
  const radius = Number(profile?.radius ?? fallback.radius ?? INTERIOR_COLLISION_FALLBACK_RADIUS);
  const blocked = (Array.isArray(profile?.blocked) ? profile.blocked : fallback.blocked || [])
    .map(normalizeCollisionRect)
    .filter(Boolean);
  const objects = normalizeMappedInteriorObjects(
    Array.isArray(profile?.objects) ? profile.objects : fallback.objects || []
  );

  return {
    radius: Number.isFinite(radius) ? Math.max(0, Math.min(4, roundPercent(radius))) : INTERIOR_COLLISION_FALLBACK_RADIUS,
    bounds: [],
    blocked,
    objects,
  };
}

function cloneCollisionProfile(profile) {
  return normalizeCollisionProfile(profile, profile);
}

function readStoredCollisionProfiles() {
  try {
    const raw = window.localStorage?.getItem(INTERIOR_COLLISION_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    const source = parsed?.profiles && typeof parsed.profiles === 'object'
      ? parsed.profiles
      : parsed && typeof parsed === 'object'
        ? parsed
        : {};

    return Object.keys(TEMPLATES).reduce((profiles, templateId) => {
      if (source[templateId]) {
        profiles[templateId] = normalizeCollisionProfile(source[templateId], INTERIOR_COLLISION_PROFILES[templateId]);
      }
      return profiles;
    }, {});
  } catch (error) {
    console.warn('[interiors] collider profiles load failed:', error);
    return {};
  }
}

function writeStoredCollisionProfiles(profiles) {
  try {
    const payload = {
      version: 2,
      updatedAt: new Date().toISOString(),
      profiles,
    };
    window.localStorage?.setItem(INTERIOR_COLLISION_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('[interiors] collider profiles save failed:', error);
    return false;
  }
}

let customCollisionProfiles = readStoredCollisionProfiles();
let remoteCollisionProfilesPromise = null;
let mappedInteriorObjectsByTemplate = {};
let remoteMappedInteriorObjectsPromise = null;
let interiorDoorStatesByInstanceAndObject = {};
const remoteInteriorDoorStatePromisesByInstance = new Map();
let activeInteriorDoorInstanceId = null;

function createInteriorDoorInstanceId(kind, id) {
  const safeKind = kind === 'hospital' ? 'hospital' : 'house';
  const safeId = String(id || '').trim();
  return safeId ? `${safeKind}:${safeId}`.slice(0, 160) : null;
}

function interiorDoorStateKey(instanceId, objectId) {
  const safeInstanceId = String(instanceId || '').trim();
  const safeObjectId = String(objectId || '').trim();
  return safeInstanceId && safeObjectId ? `${safeInstanceId}\u0000${safeObjectId}` : '';
}

function setMappedObjectsForTemplate(templateId, objects) {
  if (!TEMPLATES[templateId]) return [];

  const normalizedObjects = normalizeMappedInteriorObjects(objects);
  mappedInteriorObjectsByTemplate = {
    ...mappedInteriorObjectsByTemplate,
    [templateId]: normalizedObjects,
  };

  const currentProfile = customCollisionProfiles[templateId] || INTERIOR_COLLISION_PROFILES[templateId];
  customCollisionProfiles = {
    ...customCollisionProfiles,
    [templateId]: normalizeCollisionProfile(
      { ...currentProfile, objects: normalizedObjects },
      INTERIOR_COLLISION_PROFILES[templateId]
    ),
  };
  writeStoredCollisionProfiles(customCollisionProfiles);
  return normalizedObjects;
}

async function loadRemoteMappedInteriorObjects({ force = false } = {}) {
  if (remoteMappedInteriorObjectsPromise && !force) return remoteMappedInteriorObjectsPromise;

  remoteMappedInteriorObjectsPromise = (async () => {
    const { data, error } = await supabase
      .from(INTERIOR_MAPPED_OBJECT_TABLE)
      .select('id, template_id, object_type, x, y, rotation, properties, created_at, updated_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const nextObjects = Object.keys(TEMPLATES).reduce((result, templateId) => {
      result[templateId] = [];
      return result;
    }, {});

    (Array.isArray(data) ? data : []).forEach((row, index) => {
      const templateId = String(row?.template_id || '').trim();
      if (!TEMPLATES[templateId]) return;
      const object = normalizeMappedInteriorObject(row, index);
      if (object) nextObjects[templateId].push(object);
    });

    Object.entries(nextObjects).forEach(([templateId, objects]) => {
      setMappedObjectsForTemplate(templateId, objects);
    });

    return nextObjects;
  })();

  try {
    return await remoteMappedInteriorObjectsPromise;
  } catch (error) {
    remoteMappedInteriorObjectsPromise = null;
    console.warn('[interiors] remote mapped objects load failed:', error);
    return null;
  }
}

async function saveRemoteMappedInteriorObjects(templateId, objects) {
  const normalizedObjects = normalizeMappedInteriorObjects(objects);
  const identity = getInteriorColliderAdminIdentity();
  const { data, error } = await supabase.rpc('admin_replace_interior_mapped_objects', {
    p_template_id: templateId,
    p_objects: normalizedObjects,
    p_admin_player_id: identity.adminPlayerId,
    p_admin_tg_id: identity.adminTgId,
    p_admin_nickname: identity.adminNickname,
  });

  if (error) throw error;
  if (data?.ok === false) throw new Error(data?.reason || 'INTERIOR_OBJECT_SAVE_FAILED');

  const savedObjects = normalizeMappedInteriorObjects(data?.objects || normalizedObjects);
  setMappedObjectsForTemplate(templateId, savedObjects);
  return data || { ok: true, objects: savedObjects };
}

function isInteriorDoorOpen(objectId, instanceId = activeInteriorDoorInstanceId) {
  const key = interiorDoorStateKey(instanceId, objectId);
  return key ? interiorDoorStatesByInstanceAndObject[key]?.isOpen === true : false;
}

function applyRemoteInteriorDoorState(row) {
  const objectId = String(row?.object_id || row?.objectId || '').trim();
  const templateId = String(row?.template_id || row?.templateId || '').trim();
  const instanceId = String(row?.instance_id || row?.instanceId || '').trim();
  const key = interiorDoorStateKey(instanceId, objectId);
  if (!key || !TEMPLATES[templateId]) return false;

  interiorDoorStatesByInstanceAndObject = {
    ...interiorDoorStatesByInstanceAndObject,
    [key]: {
      objectId,
      templateId,
      instanceId,
      isOpen: row?.is_open === true || row?.isOpen === true,
      updatedAt: row?.updated_at || row?.updatedAt || null,
    },
  };
  return true;
}

function removeInteriorDoorState(instanceId, objectId) {
  const key = interiorDoorStateKey(instanceId, objectId);
  if (!key || !interiorDoorStatesByInstanceAndObject[key]) return;
  const nextStates = { ...interiorDoorStatesByInstanceAndObject };
  delete nextStates[key];
  interiorDoorStatesByInstanceAndObject = nextStates;
}

function setLocalInteriorDoorState(objectId, templateId, instanceId, isOpen) {
  return applyRemoteInteriorDoorState({
    object_id: objectId,
    template_id: templateId,
    instance_id: instanceId,
    is_open: isOpen === true,
    updated_at: new Date().toISOString(),
  });
}

async function loadRemoteInteriorDoorStates({
  force = false,
  instanceId = activeInteriorDoorInstanceId,
} = {}) {
  const safeInstanceId = String(instanceId || '').trim();
  if (!safeInstanceId) return null;

  const currentPromise = remoteInteriorDoorStatePromisesByInstance.get(safeInstanceId);
  if (currentPromise && !force) return currentPromise;

  const request = (async () => {
    const { data, error } = await supabase
      .from(INTERIOR_DOOR_STATE_TABLE)
      .select('instance_id, object_id, template_id, is_open, updated_at')
      .eq('instance_id', safeInstanceId);

    if (error) throw error;

    const nextStates = Object.entries(interiorDoorStatesByInstanceAndObject)
      .reduce((result, [key, stateRow]) => {
        if (stateRow?.instanceId !== safeInstanceId) result[key] = stateRow;
        return result;
      }, {});
    (Array.isArray(data) ? data : []).forEach((row) => {
      const objectId = String(row?.object_id || '').trim();
      const templateId = String(row?.template_id || '').trim();
      const instanceId = String(row?.instance_id || '').trim();
      const key = interiorDoorStateKey(instanceId, objectId);
      if (!key || !TEMPLATES[templateId]) return;
      nextStates[key] = {
        objectId,
        templateId,
        instanceId,
        isOpen: row?.is_open === true,
        updatedAt: row?.updated_at || null,
      };
    });
    interiorDoorStatesByInstanceAndObject = nextStates;
    return nextStates;
  })();
  remoteInteriorDoorStatePromisesByInstance.set(safeInstanceId, request);

  try {
    return await request;
  } catch (error) {
    console.warn('[interiors] remote door states load failed:', error);
    return null;
  } finally {
    if (remoteInteriorDoorStatePromisesByInstance.get(safeInstanceId) === request) {
      remoteInteriorDoorStatePromisesByInstance.delete(safeInstanceId);
    }
  }
}

async function toggleRemoteInteriorDoorState(templateId, instanceId, objectId) {
  const identity = getInteriorColliderAdminIdentity();
  const { data, error } = await supabase.rpc('toggle_interior_door_state', {
    p_template_id: templateId,
    p_instance_id: instanceId,
    p_object_id: objectId,
    p_player_id: identity.adminPlayerId,
    p_tg_id: identity.adminTgId,
    p_nickname: identity.adminNickname,
  });

  if (error) throw error;
  if (data?.ok === false) throw new Error(data?.reason || 'INTERIOR_DOOR_TOGGLE_FAILED');

  applyRemoteInteriorDoorState({
    object_id: data?.objectId || objectId,
    template_id: data?.templateId || templateId,
    instance_id: data?.instanceId || instanceId,
    is_open: data?.isOpen === true,
    updated_at: data?.updatedAt || new Date().toISOString(),
  });
  return data;
}

function applyRemoteCollisionRow(row) {
  const templateId = String(row?.template_id || row?.templateId || '').trim();
  if (!TEMPLATES[templateId]) return false;

  const profile = normalizeCollisionProfile(
    row?.profile || row,
    customCollisionProfiles[templateId] || INTERIOR_COLLISION_PROFILES[templateId]
  );
  customCollisionProfiles = {
    ...customCollisionProfiles,
    [templateId]: profile,
  };
  writeStoredCollisionProfiles(customCollisionProfiles);
  return true;
}

async function loadRemoteCollisionProfiles({ force = false } = {}) {
  if (remoteCollisionProfilesPromise && !force) return remoteCollisionProfilesPromise;

  remoteCollisionProfilesPromise = (async () => {
    const { data, error } = await supabase
      .from(INTERIOR_COLLISION_TABLE)
      .select('template_id, profile, updated_at');

    if (error) throw error;

    const nextProfiles = {};
    (Array.isArray(data) ? data : []).forEach((row) => {
      const templateId = String(row?.template_id || '').trim();
      if (TEMPLATES[templateId]) {
        nextProfiles[templateId] = normalizeCollisionProfile(
          row.profile,
          customCollisionProfiles[templateId] || INTERIOR_COLLISION_PROFILES[templateId]
        );
      }
    });

    customCollisionProfiles = {
      ...customCollisionProfiles,
      ...nextProfiles,
    };
    writeStoredCollisionProfiles(customCollisionProfiles);
    return nextProfiles;
  })();

  try {
    return await remoteCollisionProfilesPromise;
  } catch (error) {
    remoteCollisionProfilesPromise = null;
    console.warn('[interiors] remote collider profiles load failed:', error);
    return {};
  }
}

async function saveRemoteCollisionProfile(templateId, profile) {
  const normalized = normalizeCollisionProfile(profile, INTERIOR_COLLISION_PROFILES[templateId]);
  const identity = getInteriorColliderAdminIdentity();

  const { data, error } = await supabase.rpc('admin_upsert_interior_collision_profile', {
    p_template_id: templateId,
    p_profile: normalized,
    p_admin_player_id: identity.adminPlayerId,
    p_admin_tg_id: identity.adminTgId,
    p_admin_nickname: identity.adminNickname,
  });

  if (error) throw error;
  if (data?.ok === false) throw new Error(data?.reason || 'INTERIOR_COLLISION_SAVE_FAILED');

  const savedProfile = data?.profile || data?.row?.profile || normalized;
  customCollisionProfiles = {
    ...customCollisionProfiles,
    [templateId]: normalizeCollisionProfile(savedProfile, normalized),
  };
  writeStoredCollisionProfiles(customCollisionProfiles);
  return data || { ok: true, profile: savedProfile };
}

function collisionSaveErrorMessage(error) {
  const raw = [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');
  const normalized = raw.toLowerCase();
  let projectRef = '';

  try {
    projectRef = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0] || '';
  } catch {
    projectRef = '';
  }
  const projectLabel = projectRef ? ` [${projectRef}]` : '';

  if (normalized.includes('pgrst202') || normalized.includes('could not find the function')) {
    return `Supabase${projectLabel}: RPC не найдена — выполни repair SQL`;
  }
  if (normalized.includes('pgrst205') || normalized.includes('schema cache')) {
    return `Supabase${projectLabel}: старый schema cache — выполни repair SQL`;
  }
  if (normalized.includes('42p01') || normalized.includes('does not exist')) {
    return `Supabase${projectLabel}: таблица стен отсутствует — выполни repair SQL`;
  }
  if (normalized.includes('admin_required')) {
    return `Supabase${projectLabel}: игрок не подтверждён как администратор`;
  }
  if (normalized.includes('permission denied') || normalized.includes('42501')) {
    return `Supabase${projectLabel}: нет разрешения на сохранение стен`;
  }

  const message = String(error?.message || error?.code || 'неизвестная ошибка').trim();
  return `Supabase${projectLabel}: ${message.slice(0, 140)}`;
}

function collisionProfileFor(templateId) {
  const profile = customCollisionProfiles[templateId] ||
    INTERIOR_COLLISION_PROFILES[templateId] ||
    INTERIOR_COLLISION_PROFILES.standard;
  const hasRemoteObjectState = Object.prototype.hasOwnProperty.call(
    mappedInteriorObjectsByTemplate,
    templateId
  );

  return hasRemoteObjectState
    ? { ...profile, objects: mappedInteriorObjectsByTemplate[templateId] }
    : profile;
}

function insideCollisionRect(point, box, padding = 0) {
  return (
    point.x >= box.x1 + padding &&
    point.x <= box.x2 - padding &&
    point.y >= box.y1 + padding &&
    point.y <= box.y2 - padding
  );
}

function hitsCollisionRect(point, box, padding = 0) {
  return (
    point.x >= box.x1 - padding &&
    point.x <= box.x2 + padding &&
    point.y >= box.y1 - padding &&
    point.y <= box.y2 + padding
  );
}

function sanitizeInteriorPosition(point) {
  return {
    x: clampPercent(point?.x),
    y: clampPercent(point?.y),
  };
}

function mappedDoorCollisionRect(object) {
  if (object?.type !== 'door') return null;

  const configuredWidth = Number(object?.properties?.width);
  const configuredDepth = Number(object?.properties?.depth);
  const width = Number.isFinite(configuredWidth) ? Math.max(1.4, Math.min(9, configuredWidth)) : 4.2;
  const depth = Number.isFinite(configuredDepth) ? Math.max(0.45, Math.min(3, configuredDepth)) : 1.15;
  const quarterTurn = Math.abs(Math.round(Number(object.rotation || 0) / 90)) % 2 === 1;
  const halfX = (quarterTurn ? depth : width) / 2;
  const halfY = (quarterTurn ? width : depth) / 2;

  return {
    x1: Number(object.x) - halfX,
    y1: Number(object.y) - halfY,
    x2: Number(object.x) + halfX,
    y2: Number(object.y) + halfY,
  };
}

function isInteriorPointWalkable(templateId, point) {
  const profile = collisionProfileFor(templateId);
  const radius = Number(profile.radius ?? INTERIOR_COLLISION_FALLBACK_RADIUS);
  const safePoint = sanitizeInteriorPosition(point);
  const bounds = Array.isArray(profile.bounds) ? profile.bounds : [];
  const insideBounds = bounds.length > 0
    ? bounds.some((box) => insideCollisionRect(safePoint, box, radius))
    : true;

  if (!insideBounds) return false;
  if (profile.blocked.some((box) => hitsCollisionRect(safePoint, box, radius))) return false;

  const hitsClosedDoor = normalizeMappedInteriorObjects(profile.objects).some((object) => {
    if (object.type !== 'door' || isInteriorDoorOpen(object.id)) return false;
    const doorRect = mappedDoorCollisionRect(object);
    return doorRect ? hitsCollisionRect(safePoint, doorRect, radius) : false;
  });

  return !hitsClosedDoor;
}

function snapInteriorPosition(templateId, point) {
  const base = sanitizeInteriorPosition(point);

  if (isInteriorPointWalkable(templateId, base)) return base;

  for (let distance = 0.5; distance <= 8; distance += 0.5) {
    const candidates = [
      { x: base.x + distance, y: base.y },
      { x: base.x - distance, y: base.y },
      { x: base.x, y: base.y + distance },
      { x: base.x, y: base.y - distance },
      { x: base.x + distance, y: base.y + distance },
      { x: base.x - distance, y: base.y + distance },
      { x: base.x + distance, y: base.y - distance },
      { x: base.x - distance, y: base.y - distance },
    ].map(sanitizeInteriorPosition);

    const valid = candidates.find((candidate) => isInteriorPointWalkable(templateId, candidate));
    if (valid) return valid;
  }

  return base;
}

function resolveInteriorMovementStep(templateId, start, delta) {
  const move = {
    x: Number(delta?.x) || 0,
    y: Number(delta?.y) || 0,
  };

  if (Math.abs(move.x) < 0.001 && Math.abs(move.y) < 0.001) {
    return start;
  }

  const direct = sanitizeInteriorPosition({
    x: start.x + move.x,
    y: start.y + move.y,
  });

  if (isInteriorPointWalkable(templateId, direct)) return direct;

  const horizontal = sanitizeInteriorPosition({
    x: start.x + move.x,
    y: start.y,
  });
  const vertical = sanitizeInteriorPosition({
    x: start.x,
    y: start.y + move.y,
  });

  let resolved = start;

  if (isInteriorPointWalkable(templateId, horizontal)) {
    resolved = horizontal;
  }

  const verticalFromResolved = sanitizeInteriorPosition({
    x: resolved.x,
    y: start.y + move.y,
  });

  if (isInteriorPointWalkable(templateId, verticalFromResolved)) {
    return verticalFromResolved;
  }

  if (resolved !== start) return resolved;

  return isInteriorPointWalkable(templateId, vertical) ? vertical : start;
}

function resolveInteriorMovement(templateId, current, delta) {
  const move = {
    x: Number(delta?.x) || 0,
    y: Number(delta?.y) || 0,
  };
  const length = Math.hypot(move.x, move.y);
  const steps = Math.max(1, Math.ceil(length / 0.25));
  const step = {
    x: move.x / steps,
    y: move.y / steps,
  };
  let resolved = snapInteriorPosition(templateId, current);

  for (let i = 0; i < steps; i += 1) {
    const next = resolveInteriorMovementStep(templateId, resolved, step);
    if (next.x === resolved.x && next.y === resolved.y) break;
    resolved = next;
  }

  return resolved;
}

function houseExteriorSpawn(house = {}) {
  const AUTO_EXIT_OFFSET_X = 0.34;
  const AUTO_EXIT_OFFSET_Y = 0.38;
  const payload = house?.payload || {};
  const baseX = clampPercent(
    payload.exitX ??
      payload.exit_x ??
      house.exitX ??
      house.x ??
      payload.x ??
      payload.mapX ??
      payload.map_x,
    50
  );
  const baseY = clampPercent(
    payload.exitY ??
      payload.exit_y ??
      house.exitY ??
      house.y ??
      payload.y ??
      payload.mapY ??
      payload.map_y,
    50
  );
  const angle = Number(
    payload.exitAngle ??
      payload.exit_angle ??
      house.exitAngle ??
      house.rotation ??
      payload.rotation ??
      0
  );

  /*
    Выход из интерьера должен ставить игрока не в центр маркера дома, а рядом
    с ним — визуально “у двери”. Если позже в БД появятся exitX/exitY, они
    будут иметь приоритет над автоматическим смещением.
  */
  const hasExplicitExit =
    payload.exitX !== undefined ||
    payload.exit_x !== undefined ||
    house.exitX !== undefined ||
    payload.exitY !== undefined ||
    payload.exit_y !== undefined ||
    house.exitY !== undefined;

  return {
    x: hasExplicitExit ? baseX : clampPercent(baseX + AUTO_EXIT_OFFSET_X, baseX),
    y: hasExplicitExit ? baseY : clampPercent(baseY + AUTO_EXIT_OFFSET_Y, baseY),
    angle: Number.isFinite(angle) ? angle : 0,
  };
}

function markup() {
  const playerHealth = getPlayerVitalValue(state.player, 'health');
  const playerFood = getPlayerVitalValue(state.player, 'food');
  const playerWater = getPlayerVitalValue(state.player, 'water');

  return `
    <div class="mn-interior" hidden data-mn-interior>
      <div class="mn-interior-loading" data-interior-loading data-visible="false" aria-hidden="true">
        <div class="mn-interior-loader-card" aria-hidden="true">
          <span class="mn-interior-loader-ring">
            <i></i><i></i><i></i>
          </span>
          <span class="mn-interior-loader-line"><i></i></span>
        </div>
        <small data-interior-loading-text hidden></small>
      </div>
      <main class="mn-interior-scene" hidden data-interior-scene>
        <div class="mn-interior-world" data-interior-world>
          <div class="mn-interior-map" data-interior-map>
            <img
              data-interior-image
              alt=""
              draggable="false"
              decoding="async"
              fetchpriority="high"
              style="display:block;width:100%;height:100%;object-fit:contain;user-select:none;pointer-events:none"
            />
          </div>
          <div class="mn-interior-shade"></div>
          <div class="mn-interior-object-layer" data-interior-object-layer></div>
          <div class="mn-interior-collider-layer" hidden data-interior-collider-layer></div>
          <div class="mn-interior-players-layer" data-interior-players-layer></div>
          <div class="mn-interior-player" data-interior-player><i></i><span>${String(state.nickname || 'Игрок')}</span></div>
        </div>
      </main>
      <div class="mn-interior-controls" hidden data-interior-controls>
        <div class="mn-interior-joystick" data-interior-joystick data-active="false">
          <div class="mn-interior-stamina-ring" data-interior-stamina-ring></div>
          <div class="mn-interior-joystick-base">
            <div class="mn-interior-joystick-stick" data-interior-stick></div>
          </div>
        </div>
        <div class="mn-interior-stamina" data-interior-stamina data-visible="false">
          <span>STAMINA</span>
          <i><b data-interior-stamina-fill></b></i>
        </div>
      </div>
      <div class="mn-interior-ui" hidden data-interior-ui>
        <button type="button" class="mn-interior-collider-toggle" hidden data-interior-collider-toggle>Стены</button>
        <button type="button" class="mn-interior-object-toggle" hidden data-interior-object-toggle>Объекты</button>
        <section class="mn-interior-collider-panel" hidden data-interior-collider-panel>
          <div class="mn-interior-collider-head" data-interior-collider-drag title="Перетащить окно">
            <span class="mn-interior-collider-drag-icon" aria-hidden="true">⠿</span>
            <b>Стены интерьера</b>
            <button type="button" data-interior-collider-close>×</button>
          </div>
          <div class="mn-interior-collider-hint">
            Тяни по интерьеру, чтобы нарисовать красную стенку. Игроки не смогут проходить через красное.
            Клик по стенке выбирает её, Delete удаляет. Само окно можно двигать за заголовок.
          </div>
          <div class="mn-interior-collider-actions">
            <button type="button" class="mn-interior-collider-primary" data-interior-collider-save>Сохранить всем</button>
            <button type="button" data-interior-collider-delete>Удалить</button>
          </div>
          <div class="mn-interior-collider-actions">
            <button type="button" data-interior-collider-clear>Очистить всё</button>
            <button type="button" data-interior-collider-reset>Сброс</button>
          </div>
          <details class="mn-interior-collider-json-wrap">
            <summary>JSON импорт / экспорт</summary>
            <div class="mn-interior-collider-actions">
              <button type="button" data-interior-collider-export>Экспорт</button>
              <button type="button" data-interior-collider-import>Импорт</button>
            </div>
            <textarea data-interior-collider-json spellcheck="false" placeholder="JSON стен"></textarea>
          </details>
          <small data-interior-collider-status></small>
        </section>
        <section class="mn-interior-object-panel" hidden data-interior-object-panel>
          <div class="mn-interior-object-head">
            <b>Объекты интерьера</b>
            <button type="button" data-interior-object-close>×</button>
          </div>
          <div class="mn-interior-object-hint">
            Выбери тип и нажми на план, чтобы поставить объект. Готовый объект можно перетащить,
            повернуть или удалить. Потяни жёлтый угол выбранного объекта, чтобы изменить его размер.
            Раскладка общая для всех игроков.
          </div>
          <div class="mn-interior-object-types">
            <button type="button" data-interior-object-type="bed">Кровать</button>
            <button type="button" data-interior-object-type="chair">Стул</button>
            <button type="button" data-interior-object-type="table">Стол</button>
            <button type="button" data-interior-object-type="door">Дверь</button>
            <button type="button" data-interior-object-type="exit">Выход</button>
          </div>
          <div class="mn-interior-object-actions">
            <button type="button" class="mn-interior-object-primary" data-interior-object-save>Сохранить всем</button>
            <button type="button" data-interior-object-rotate>Повернуть 90°</button>
          </div>
          <div class="mn-interior-object-actions">
            <button type="button" data-interior-object-delete>Удалить</button>
            <button type="button" data-interior-object-clear>Очистить всё</button>
          </div>
          <small data-interior-object-status></small>
        </section>
        <button type="button" class="mn-interior-door-action" hidden data-interior-door-action>
          <span>E / У</span>
          <b data-interior-door-action-label>Открыть дверь</b>
        </button>
        <div class="mn-interior-hud">
          <div class="mn-interior-info">
            <b data-interior-title>Интерьер</b>
            <span data-interior-meta></span>
          </div>
          <div class="mn-interior-profile">
            <i>${String(state.nickname || 'И').charAt(0).toUpperCase()}</i>
            <span><b>${String(state.nickname || 'Игрок')}</b><small>Внутри дома</small></span>
          </div>
          <div class="mn-interior-balance has-interior-vitals">
            <i>₴</i><b data-interior-balance>${formatMoney(state.player?.balance)}</b>
            <div class="mn-interior-vitals-row" aria-label="Показатели игрока в интерьере">
              <div
                class="mn-interior-vital-pill mn-interior-vital-health"
                data-interior-health
                role="meter"
                aria-label="Здоровье"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${Math.round(playerHealth)}"
                style="${getVitalFillStyle(playerHealth, 'health')}"
              >
                <span class="mn-interior-vital-icon" aria-hidden="true">🫀</span>
                <b data-interior-health-value>${Math.round(playerHealth)}</b>
              </div>
              <div
                class="mn-interior-vital-pill mn-interior-vital-food"
                data-interior-food
                role="meter"
                aria-label="Еда"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${Math.round(playerFood)}"
                style="${getVitalFillStyle(playerFood, 'food')}"
              >
                <span class="mn-interior-vital-icon" aria-hidden="true">🍽</span>
                <b data-interior-food-value>${Math.round(playerFood)}</b>
              </div>
              <div
                class="mn-interior-vital-pill mn-interior-vital-water"
                data-interior-water
                role="meter"
                aria-label="Вода"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${Math.round(playerWater)}"
                style="${getVitalFillStyle(playerWater, 'water')}"
              >
                <span class="mn-interior-vital-icon" aria-hidden="true">🥛</span>
                <b data-interior-water-value>${Math.round(playerWater)}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="mn-interior-health-edge" data-interior-health-edge aria-hidden="true"></div>
      <div class="mn-interior-error" hidden data-interior-error>
        <strong>Интерьер пока не загружен</strong>
        <p data-interior-error-text></p>
        <button type="button" data-interior-error-close>Вернуться в город</button>
      </div>
    </div>`;
}

export function enableInteriorsFeature() {
  document.querySelectorAll('[data-mn-interior]').forEach((el) => el.remove());
  document.body.insertAdjacentHTML('beforeend', markup());

  const overlay = document.querySelector('[data-mn-interior]');
  const loading = overlay.querySelector('[data-interior-loading]');
  const loadingText = overlay.querySelector('[data-interior-loading-text]');
  const scene = overlay.querySelector('[data-interior-scene]');
  const controls = overlay.querySelector('[data-interior-controls]');
  const ui = overlay.querySelector('[data-interior-ui]');
  const world = overlay.querySelector('[data-interior-world]');
  const map = overlay.querySelector('[data-interior-map]');
  const interiorImage = overlay.querySelector('[data-interior-image]');
  const marker = overlay.querySelector('[data-interior-player]');
  const remotePlayersLayer = overlay.querySelector('[data-interior-players-layer]');
  const objectLayer = overlay.querySelector('[data-interior-object-layer]');
  const objectToggle = overlay.querySelector('[data-interior-object-toggle]');
  const objectPanel = overlay.querySelector('[data-interior-object-panel]');
  const objectClose = overlay.querySelector('[data-interior-object-close]');
  const objectTypeButtons = [...overlay.querySelectorAll('[data-interior-object-type]')];
  const objectSave = overlay.querySelector('[data-interior-object-save]');
  const objectRotate = overlay.querySelector('[data-interior-object-rotate]');
  const objectDelete = overlay.querySelector('[data-interior-object-delete]');
  const objectClear = overlay.querySelector('[data-interior-object-clear]');
  const objectStatus = overlay.querySelector('[data-interior-object-status]');
  const doorAction = overlay.querySelector('[data-interior-door-action]');
  const doorActionLabel = overlay.querySelector('[data-interior-door-action-label]');
  const colliderLayer = overlay.querySelector('[data-interior-collider-layer]');
  const colliderToggle = overlay.querySelector('[data-interior-collider-toggle]');
  const colliderPanel = overlay.querySelector('[data-interior-collider-panel]');
  const colliderPanelDragHandle = overlay.querySelector('[data-interior-collider-drag]');
  const colliderClose = overlay.querySelector('[data-interior-collider-close]');
  const colliderModeButtons = [...overlay.querySelectorAll('[data-interior-collider-mode]')];
  const colliderSave = overlay.querySelector('[data-interior-collider-save]');
  const colliderDelete = overlay.querySelector('[data-interior-collider-delete]');
  const colliderClear = overlay.querySelector('[data-interior-collider-clear]');
  const colliderReset = overlay.querySelector('[data-interior-collider-reset]');
  const colliderExport = overlay.querySelector('[data-interior-collider-export]');
  const colliderImport = overlay.querySelector('[data-interior-collider-import]');
  const colliderJson = overlay.querySelector('[data-interior-collider-json]');
  const colliderStatus = overlay.querySelector('[data-interior-collider-status]');
  const title = overlay.querySelector('[data-interior-title]');
  const meta = overlay.querySelector('[data-interior-meta]');
  const balance = overlay.querySelector('[data-interior-balance]');
  const healthEl = overlay.querySelector('[data-interior-health]');
  const healthValueEl = overlay.querySelector('[data-interior-health-value]');
  const foodEl = overlay.querySelector('[data-interior-food]');
  const foodValueEl = overlay.querySelector('[data-interior-food-value]');
  const waterEl = overlay.querySelector('[data-interior-water]');
  const waterValueEl = overlay.querySelector('[data-interior-water-value]');
  const errorBox = overlay.querySelector('[data-interior-error]');
  const errorText = overlay.querySelector('[data-interior-error-text]');
  const errorClose = overlay.querySelector('[data-interior-error-close]');
  const joystick = overlay.querySelector('[data-interior-joystick]');
  const stick = overlay.querySelector('[data-interior-stick]');
  const staminaBox = overlay.querySelector('[data-interior-stamina]');
  const staminaFill = overlay.querySelector('[data-interior-stamina-fill]');
  const staminaRing = overlay.querySelector('[data-interior-stamina-ring]');

  let active = false;
  let destroyed = false;
  let raf = 0;
  let worldLayoutRaf = 0;
  let lastFrame = 0;
  let position = { x: 50, y: 82 };
  let activeTemplateId = 'standard';
  let activeInteriorKind = 'house';
  let activeHouse = null;
  let activeHouseId = null;
  let activeService = null;
  let activeServiceId = null;
  let colliderEditorOpen = false;
  let colliderEditorMode = 'blocked';
  let colliderEditorProfile = null;
  let colliderEditorSelected = null;
  let colliderEditorPointer = null;
  let colliderEditorStart = null;
  let colliderEditorDraft = null;
  let colliderSaveTimer = 0;
  let colliderSaveSequence = 0;
  let colliderPanelDrag = null;
  let colliderPanelLayoutRaf = 0;
  let objectEditorOpen = false;
  let objectEditorTemplateId = 'hospital';
  let objectEditorType = 'bed';
  let objectEditorProfile = null;
  let objectEditorSelectedId = null;
  let objectEditorPointer = null;
  let objectEditorDraggingId = null;
  let objectEditorDragOffset = null;
  let objectEditorResizeId = null;
  let objectEditorResizeStart = null;
  let objectEditorResizeOrigin = null;
  let collisionProfilesChannel = null;
  let mappedObjectsChannel = null;
  let doorStatesChannel = null;
  let interiorRoom = null;
  let cleanupSeatStatesSubscription = null;
  let interiorPresenceTimer = 0;
  let interiorSeatHeartbeatTimer = 0;
  let interiorRemoteStaleTimer = 0;
  let mappedObjectsReloadTimer = 0;
  let nearestDoorId = null;
  let nearestExitId = null;
  let nearestChairId = null;
  let doorTogglePending = false;
  let seatActionPending = false;
  let activeSeatObjectId = null;
  let seatStatesByObjectId = new Map();
  const remoteInteriorPlayers = new Map();
  let joystickVector = { x: 0, y: 0 };
  let joystickPointer = null;
  const staminaConfig = getStaminaConfig();
  let stamina = staminaConfig.max;
  let sprintLocked = false;
  let warmupTimer = 0;
  let loadingRevealTimer = 0;
  let interiorHudRefreshTimer = 0;
  let interiorHealthHitTimer = 0;
  const vitalFeedbackTimers = new Map();
  const keys = new Set();
  const templateImageCache = new Map();
  const vitalElements = {
    health: { el: healthEl, valueEl: healthValueEl },
    food: { el: foodEl, valueEl: foodValueEl },
    water: { el: waterEl, valueEl: waterValueEl },
  };
  const currentVitals = {
    health: getPlayerVitalValue(state.player, 'health'),
    food: getPlayerVitalValue(state.player, 'food'),
    water: getPlayerVitalValue(state.player, 'water'),
  };

  function setPaused(value) {
    window.__MN_INTERIOR_ACTIVE__ = value;
    document.body.classList.toggle('mn-interior-open', value);
    document.documentElement.classList.toggle('mn-interior-open', value);
  }

  function colliderPanelMode() {
    const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;
    const portrait = window.matchMedia?.('(orientation: portrait)')?.matches;
    const forcedLandscape = document.documentElement.classList.contains('mn-force-rotate-landscape');

    if (!coarsePointer) return 'desktop';
    return portrait && forcedLandscape ? 'mobile-forced-landscape' : 'mobile-landscape';
  }

  function colliderPanelMetrics() {
    const rootRect = ui.getBoundingClientRect();
    const panelRect = colliderPanel.getBoundingClientRect();
    const margin = Math.min(8, Math.max(0, rootRect.width / 2), Math.max(0, rootRect.height / 2));
    const minLeft = margin;
    const minTop = margin;
    const maxLeft = Math.max(minLeft, rootRect.width - panelRect.width - margin);
    const maxTop = Math.max(minTop, rootRect.height - panelRect.height - margin);

    return { rootRect, panelRect, minLeft, minTop, maxLeft, maxTop };
  }

  function setColliderPanelPosition(left, top, metrics = colliderPanelMetrics()) {
    const safeLeft = Math.max(metrics.minLeft, Math.min(metrics.maxLeft, Number(left) || 0));
    const safeTop = Math.max(metrics.minTop, Math.min(metrics.maxTop, Number(top) || 0));

    colliderPanel.style.left = `${Math.round(safeLeft)}px`;
    colliderPanel.style.top = `${Math.round(safeTop)}px`;
    colliderPanel.style.right = 'auto';
    colliderPanel.style.bottom = 'auto';
    return { left: safeLeft, top: safeTop };
  }

  function readColliderPanelPositions() {
    const stored = readJsonLocalStorage(INTERIOR_COLLIDER_PANEL_POSITION_KEY, {});
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  }

  function saveColliderPanelPosition() {
    if (colliderPanel.hidden) return;

    const metrics = colliderPanelMetrics();
    const panelRect = colliderPanel.getBoundingClientRect();
    const current = setColliderPanelPosition(
      panelRect.left - metrics.rootRect.left,
      panelRect.top - metrics.rootRect.top,
      metrics
    );
    const horizontalRange = metrics.maxLeft - metrics.minLeft;
    const verticalRange = metrics.maxTop - metrics.minTop;
    const mode = colliderPanelMode();
    const positions = readColliderPanelPositions();
    positions[mode] = {
      x: horizontalRange > 0 ? (current.left - metrics.minLeft) / horizontalRange : 0,
      y: verticalRange > 0 ? (current.top - metrics.minTop) / verticalRange : 0,
    };

    try {
      window.localStorage?.setItem(INTERIOR_COLLIDER_PANEL_POSITION_KEY, JSON.stringify(positions));
    } catch (error) {
      console.warn('[interiors] collider panel position save failed:', error);
    }
  }

  function restoreColliderPanelPosition() {
    if (colliderPanel.hidden) return;

    const mode = colliderPanelMode();
    const saved = readColliderPanelPositions()[mode];
    colliderPanel.style.removeProperty('left');
    colliderPanel.style.removeProperty('right');
    colliderPanel.style.removeProperty('top');
    colliderPanel.style.removeProperty('bottom');

    const metrics = colliderPanelMetrics();
    if (Number.isFinite(Number(saved?.x)) && Number.isFinite(Number(saved?.y))) {
      const horizontalRange = metrics.maxLeft - metrics.minLeft;
      const verticalRange = metrics.maxTop - metrics.minTop;
      setColliderPanelPosition(
        metrics.minLeft + horizontalRange * Math.max(0, Math.min(1, Number(saved.x))),
        metrics.minTop + verticalRange * Math.max(0, Math.min(1, Number(saved.y))),
        metrics
      );
    } else {
      const panelRect = colliderPanel.getBoundingClientRect();
      setColliderPanelPosition(
        panelRect.left - metrics.rootRect.left,
        panelRect.top - metrics.rootRect.top,
        metrics
      );
    }
  }

  function scheduleColliderPanelLayout() {
    window.cancelAnimationFrame(colliderPanelLayoutRaf);
    colliderPanelLayoutRaf = window.requestAnimationFrame(() => {
      colliderPanelLayoutRaf = 0;
      if (!colliderEditorOpen || colliderPanelDrag) return;
      restoreColliderPanelPosition();
    });
  }

  function handleColliderPanelPointerDown(event) {
    if (!colliderEditorOpen || event.button !== 0 || event.target.closest?.('button, input, textarea, summary')) return;

    const metrics = colliderPanelMetrics();
    const panelRect = colliderPanel.getBoundingClientRect();
    const current = setColliderPanelPosition(
      panelRect.left - metrics.rootRect.left,
      panelRect.top - metrics.rootRect.top,
      metrics
    );
    colliderPanelDrag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: current.left,
      startTop: current.top,
    };
    colliderPanel.dataset.dragging = 'true';
    colliderPanelDragHandle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handleColliderPanelPointerMove(event) {
    if (!colliderPanelDrag || event.pointerId !== colliderPanelDrag.pointerId) return;

    setColliderPanelPosition(
      colliderPanelDrag.startLeft + event.clientX - colliderPanelDrag.startClientX,
      colliderPanelDrag.startTop + event.clientY - colliderPanelDrag.startClientY
    );
    event.preventDefault();
  }

  function handleColliderPanelPointerEnd(event) {
    if (!colliderPanelDrag || event.pointerId !== colliderPanelDrag.pointerId) return;

    try {
      if (colliderPanelDragHandle.hasPointerCapture?.(event.pointerId)) {
        colliderPanelDragHandle.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture may already be released by the browser.
    }
    colliderPanelDrag = null;
    colliderPanel.dataset.dragging = 'false';
    saveColliderPanelPosition();
    event.preventDefault();
  }

  function layoutInteriorWorld() {
    if (!scene || !world) return;

    const sceneWidth = Math.max(0, Number(scene.clientWidth || 0));
    const sceneHeight = Math.max(0, Number(scene.clientHeight || 0));
    if (sceneWidth <= 0 || sceneHeight <= 0) return;

    let width = sceneWidth;
    let height = width / INTERIOR_DESIGN_ASPECT;

    if (height > sceneHeight) {
      height = sceneHeight;
      width = height * INTERIOR_DESIGN_ASPECT;
    }

    world.style.width = `${Math.round(width * 100) / 100}px`;
    world.style.height = `${Math.round(height * 100) / 100}px`;
  }

  function scheduleInteriorWorldLayout() {
    window.cancelAnimationFrame(worldLayoutRaf);
    worldLayoutRaf = window.requestAnimationFrame(() => {
      worldLayoutRaf = 0;
      layoutInteriorWorld();
    });
  }

  function renderPosition() {
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    marker.classList.toggle('is-seated', Boolean(activeSeatObjectId));
    marker.dataset.seated = activeSeatObjectId ? 'true' : 'false';
  }

  function localInteriorIdentity() {
    return {
      playerId: getLocalPlayerId(),
      tgId: playerTgId() || null,
      nickname: String(state.nickname || state.player?.nickname || 'Игрок').trim() || 'Игрок',
      sessionId: getSessionId(),
    };
  }

  function localInteriorSnapshot() {
    const identity = localInteriorIdentity();
    return {
      ...identity,
      instanceId: activeInteriorDoorInstanceId,
      templateId: activeTemplateId,
      x: position.x,
      y: position.y,
      seatedObjectId: activeSeatObjectId,
      updatedAt: new Date().toISOString(),
    };
  }

  function sendLocalInteriorPosition(force = false) {
    interiorRoom?.sendPosition?.(localInteriorSnapshot(), { force });
  }

  function removeRemoteInteriorPlayer(playerId) {
    const safePlayerId = String(playerId || '').trim();
    const entry = remoteInteriorPlayers.get(safePlayerId);
    entry?.element?.remove();
    remoteInteriorPlayers.delete(safePlayerId);
  }

  function upsertRemoteInteriorPlayer(player = {}) {
    const safePlayerId = String(player.playerId || '').trim();
    const identity = localInteriorIdentity();

    if (
      !active ||
      !safePlayerId ||
      String(player.instanceId || '') !== String(activeInteriorDoorInstanceId || '') ||
      (safePlayerId === String(identity.playerId) &&
        (!player.sessionId || String(player.sessionId) === String(identity.sessionId)))
    ) return;

    let entry = remoteInteriorPlayers.get(safePlayerId);

    if (!entry) {
      const element = document.createElement('div');
      const dot = document.createElement('i');
      const name = document.createElement('span');
      element.className = 'mn-interior-remote-player';
      element.dataset.playerId = safePlayerId;
      element.append(dot, name);
      remotePlayersLayer.appendChild(element);
      entry = { element, name, updatedAt: 0 };
      remoteInteriorPlayers.set(safePlayerId, entry);
    }

    const x = clampPercent(player.x, 50);
    const y = clampPercent(player.y, 50);
    const seatedObjectId = String(player.seatedObjectId || '').trim();

    entry.element.style.left = `${x}%`;
    entry.element.style.top = `${y}%`;
    entry.element.classList.toggle('is-seated', Boolean(seatedObjectId));
    entry.element.dataset.seated = seatedObjectId ? 'true' : 'false';
    entry.element.dataset.seatedObjectId = seatedObjectId;
    entry.name.textContent = String(player.nickname || 'Игрок').slice(0, 32);
    entry.updatedAt = Date.now();
  }

  function clearRemoteInteriorPlayers() {
    remoteInteriorPlayers.forEach((entry) => entry.element?.remove());
    remoteInteriorPlayers.clear();
    remotePlayersLayer.replaceChildren();
  }

  function seatStateBelongsToLocalPlayer(seatState) {
    if (!seatState) return false;
    const identity = localInteriorIdentity();
    return String(seatState.playerId || '') === String(identity.playerId || '') &&
      (!seatState.sessionId || String(seatState.sessionId) === String(identity.sessionId));
  }

  function seatOccupantForObject(objectId) {
    const safeObjectId = String(objectId || '').trim();
    const seatState = seatStatesByObjectId.get(safeObjectId);
    if (!seatState) return null;

    const heartbeatAt = Date.parse(seatState.heartbeatAt || seatState.occupiedAt || '');
    if (Number.isFinite(heartbeatAt) && heartbeatAt < Date.now() - INTERIOR_SEAT_STALE_MS) {
      seatStatesByObjectId.delete(safeObjectId);
      return null;
    }

    return seatState;
  }

  function applySeatState(seatState) {
    if (
      !seatState?.objectId ||
      String(seatState.instanceId || '') !== String(activeInteriorDoorInstanceId || '')
    ) return false;

    seatStatesByObjectId.set(String(seatState.objectId), seatState);

    if (
      activeSeatObjectId === String(seatState.objectId) &&
      !seatStateBelongsToLocalPlayer(seatState)
    ) {
      activeSeatObjectId = null;
      position = snapInteriorPosition(activeTemplateId, position);
      renderPosition();
      sendLocalInteriorPosition(true);
    }

    renderInteriorObjects();
    return true;
  }

  function removeSeatState(seatState) {
    const objectId = String(seatState?.objectId || '').trim();
    if (!objectId) return;

    seatStatesByObjectId.delete(objectId);
    if (activeSeatObjectId === objectId) {
      activeSeatObjectId = null;
      position = snapInteriorPosition(activeTemplateId, position);
      renderPosition();
      sendLocalInteriorPosition(true);
    }
    renderInteriorObjects();
  }

  async function refreshSeatStates(instanceId = activeInteriorDoorInstanceId) {
    const safeInstanceId = String(instanceId || '').trim();
    if (!safeInstanceId) return [];

    try {
      const rows = await loadInteriorSeatStates(safeInstanceId);
      if (
        destroyed ||
        !active ||
        safeInstanceId !== String(activeInteriorDoorInstanceId || '')
      ) return rows;

      seatStatesByObjectId = new Map(rows.map((row) => [String(row.objectId), row]));

      if (activeSeatObjectId) {
        const activeSeat = seatStatesByObjectId.get(String(activeSeatObjectId));
        if (!activeSeat || !seatStateBelongsToLocalPlayer(activeSeat)) {
          activeSeatObjectId = null;
          position = snapInteriorPosition(activeTemplateId, position);
          renderPosition();
          sendLocalInteriorPosition(true);
        }
      }

      renderInteriorObjects();
      return rows;
    } catch (error) {
      console.warn('[interiors] seat states load failed:', error);
      return [];
    }
  }

  function disconnectInteriorSession({ releaseSeatState = true } = {}) {
    const instanceId = activeInteriorDoorInstanceId;
    const objectId = activeSeatObjectId;
    const identity = localInteriorIdentity();

    activeSeatObjectId = null;
    marker.classList.remove('is-seated');
    marker.dataset.seated = 'false';

    if (releaseSeatState && instanceId && objectId) {
      void releaseInteriorSeat({
        instanceId,
        objectId,
        playerId: identity.playerId,
        sessionId: identity.sessionId,
      }).catch((error) => {
        console.warn('[interiors] seat release on exit failed:', error);
      });
    }

    interiorRoom?.destroy?.();
    interiorRoom = null;
    cleanupSeatStatesSubscription?.();
    cleanupSeatStatesSubscription = null;
    window.clearInterval(interiorPresenceTimer);
    window.clearInterval(interiorSeatHeartbeatTimer);
    window.clearInterval(interiorRemoteStaleTimer);
    interiorPresenceTimer = 0;
    interiorSeatHeartbeatTimer = 0;
    interiorRemoteStaleTimer = 0;
    seatStatesByObjectId.clear();
    clearRemoteInteriorPlayers();
  }

  function connectInteriorSession() {
    disconnectInteriorSession({ releaseSeatState: false });

    const instanceId = activeInteriorDoorInstanceId;
    if (!instanceId) return;

    const identity = localInteriorIdentity();

    cleanupSeatStatesSubscription = subscribeInteriorSeatStates(instanceId, {
      onChange: applySeatState,
      onDelete: removeSeatState,
      onError(error) {
        console.warn('[interiors] seat realtime subscription failed:', error);
      },
    });

    interiorRoom = createInteriorRealtimeRoom({
      instanceId,
      templateId: activeTemplateId,
      ...identity,
      getLocalState: localInteriorSnapshot,
      onRemotePlayer: upsertRemoteInteriorPlayer,
      onRemoteLeave: removeRemoteInteriorPlayer,
      onStatus(status, error) {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[interiors] room realtime subscription failed:', error || status);
        }
      },
    });

    void refreshSeatStates(instanceId);
    sendLocalInteriorPosition(true);

    interiorPresenceTimer = window.setInterval(() => {
      if (!active) return;
      interiorRoom?.refreshPresence?.(localInteriorSnapshot());
    }, INTERIOR_PRESENCE_REFRESH_MS);

    interiorSeatHeartbeatTimer = window.setInterval(() => {
      if (!active || !activeSeatObjectId) return;
      const currentIdentity = localInteriorIdentity();
      void heartbeatInteriorSeat({
        instanceId: activeInteriorDoorInstanceId,
        objectId: activeSeatObjectId,
        playerId: currentIdentity.playerId,
        sessionId: currentIdentity.sessionId,
      })
        .then((result) => {
          if (result?.ok === false || !activeSeatObjectId) return;
          const seatState = seatStatesByObjectId.get(String(activeSeatObjectId));
          if (seatState && seatStateBelongsToLocalPlayer(seatState)) {
            seatStatesByObjectId.set(String(activeSeatObjectId), {
              ...seatState,
              heartbeatAt: new Date().toISOString(),
            });
          }
        })
        .catch((error) => {
          console.warn('[interiors] seat heartbeat failed:', error);
          void refreshSeatStates();
        });
    }, INTERIOR_SEAT_HEARTBEAT_MS);

    interiorRemoteStaleTimer = window.setInterval(() => {
      const staleBefore = Date.now() - INTERIOR_REMOTE_PLAYER_STALE_MS;
      remoteInteriorPlayers.forEach((entry, playerId) => {
        if (entry.updatedAt < staleBefore) removeRemoteInteriorPlayer(playerId);
      });

      let removedStaleSeat = false;
      seatStatesByObjectId.forEach((_seatState, objectId) => {
        if (!seatOccupantForObject(objectId)) removedStaleSeat = true;
      });
      if (removedStaleSeat) renderInteriorObjects();
    }, 5000);
  }

  async function releaseActiveSeat() {
    const objectId = activeSeatObjectId;
    const instanceId = activeInteriorDoorInstanceId;
    if (!objectId || !instanceId || seatActionPending) return false;

    const identity = localInteriorIdentity();
    const chair = normalizeMappedInteriorObjects(collisionProfileFor(activeTemplateId)?.objects)
      .find((object) => object.id === objectId && object.type === 'chair');

    seatActionPending = true;
    activeSeatObjectId = null;
    seatStatesByObjectId.delete(String(objectId));
    position = snapInteriorPosition(activeTemplateId, chair || position);
    renderPosition();
    renderInteriorObjects();
    sendLocalInteriorPosition(true);

    try {
      await releaseInteriorSeat({
        instanceId,
        objectId,
        playerId: identity.playerId,
        sessionId: identity.sessionId,
      });
      return true;
    } catch (error) {
      console.warn('[interiors] seat release failed:', error);
      void refreshSeatStates(instanceId);
      return false;
    } finally {
      seatActionPending = false;
      refreshDoorInteraction();
    }
  }

  async function claimChair(chair) {
    const instanceId = activeInteriorDoorInstanceId;
    if (!chair || !instanceId || seatActionPending) return false;

    if (activeSeatObjectId === chair.id) return releaseActiveSeat();

    const occupied = seatOccupantForObject(chair.id);
    if (occupied && !seatStateBelongsToLocalPlayer(occupied)) return false;

    const identity = localInteriorIdentity();
    seatActionPending = true;
    refreshDoorInteraction();

    try {
      const result = await claimInteriorSeat({
        instanceId,
        templateId: activeTemplateId,
        objectId: chair.id,
        ...identity,
      });

      if (!result?.ok || !result?.seat) {
        if (result?.seat) applySeatState(result.seat);
        return false;
      }

      applySeatState(result.seat);
      activeSeatObjectId = String(chair.id);
      position = { x: Number(chair.x), y: Number(chair.y) };
      renderPosition();
      renderInteriorObjects();
      sendLocalInteriorPosition(true);
      interiorRoom?.refreshPresence?.(localInteriorSnapshot());
      return true;
    } catch (error) {
      console.warn('[interiors] seat claim failed:', error);
      void refreshSeatStates(instanceId);
      return false;
    } finally {
      seatActionPending = false;
      refreshDoorInteraction();
    }
  }

  function renderStamina() {
    const percent = Math.max(0, Math.min(100, (stamina / staminaConfig.max) * 100));
    staminaFill.style.width = `${percent}%`;
    staminaRing.style.setProperty('--mn-interior-stamina', `${percent * 3.6}deg`);
    staminaFill.dataset.state = sprintLocked ? 'locked' : percent < 30 ? 'low' : 'normal';
  }

  function renderBalance() {
    balance.textContent = formatMoney(state.player?.balance);
  }

  function setVitalVisual(key, value, options = {}) {
    const entry = vitalElements[key];
    const vitalEl = entry?.el;

    if (!vitalEl) return;

    const config = INTERIOR_VITALS_CONFIG[key] || {};
    const previousValue = currentVitals[key];
    const maxValue = Number.isFinite(Number(config.max)) ? Number(config.max) : 100;
    const nextValue = clampVitalValue(value, config);
    const roundedValue = Math.round(nextValue);
    const visualValueChanged = Math.round(previousValue) !== roundedValue;
    const fillPercent = maxValue > 0
      ? Math.round((nextValue / maxValue) * 100)
      : 0;

    currentVitals[key] = nextValue;
    vitalEl.style.setProperty('--mn-interior-vital-fill', `${fillPercent}%`);
    vitalEl.setAttribute('aria-valuenow', String(roundedValue));

    if (entry.valueEl) {
      entry.valueEl.textContent = String(roundedValue);
    }

    if (options.animateChange !== false && visualValueChanged) {
      vitalEl.classList.remove('is-interior-vital-changing');

      void vitalEl.offsetWidth;

      vitalEl.classList.add('is-interior-vital-changing');
      clearTimeout(vitalFeedbackTimers.get(key));
      vitalFeedbackTimers.set(key, setTimeout(() => {
        vitalEl.classList.remove('is-interior-vital-changing');
        vitalFeedbackTimers.delete(key);
      }, INTERIOR_VITAL_FEEDBACK_DURATION_MS));
    }

    if (key === 'health') {
      const lowThreshold = Number.isFinite(Number(config.lowThreshold))
        ? Number(config.lowThreshold)
        : 50;
      const isLow = nextValue < lowThreshold;
      const tookDamage = nextValue < previousValue;

      vitalEl.classList.toggle('is-interior-health-low', isLow);
      overlay.classList.toggle(INTERIOR_HEALTH_LOW_CLASS, isLow);

      if (options.animateDamage !== false && tookDamage) {
        vitalEl.classList.remove('is-interior-health-draining');
        overlay.classList.remove(INTERIOR_HEALTH_HIT_CLASS);

        void vitalEl.offsetWidth;

        vitalEl.classList.add('is-interior-health-draining');
        overlay.classList.add(INTERIOR_HEALTH_HIT_CLASS);

        clearTimeout(interiorHealthHitTimer);
        interiorHealthHitTimer = setTimeout(() => {
          vitalEl.classList.remove('is-interior-health-draining');
          overlay.classList.remove(INTERIOR_HEALTH_HIT_CLASS);
        }, INTERIOR_HEALTH_HIT_DURATION_MS);
      }
    }
  }

  function updateVitalsFromSnapshot(playerSnapshot = {}, options = {}) {
    let changed = false;

    ['health', 'food', 'water'].forEach((key) => {
      if (!hasPlayerVitalValue(playerSnapshot, key)) return;

      const nextValue = getPlayerVitalValue(playerSnapshot, key);

      setVitalVisual(key, nextValue, {
        animateChange: options.animateChange,
        animateDamage: options.animateDamage,
      });
      changed = true;
    });

    return changed;
  }

  function refreshHudFromState(options = {}) {
    renderBalance();

    ['health', 'food', 'water'].forEach((key) => {
      setVitalVisual(key, getPlayerVitalValue(state.player, key), {
        animateChange: options.animateChange,
        animateDamage: options.animateDamage,
      });
    });
  }

  function handleBalanceChanged(event) {
    const nextBalance =
      event?.detail?.balance ??
      event?.detail?.player?.balance;

    if (nextBalance !== undefined && nextBalance !== null) {
      balance.textContent = formatMoney(nextBalance);
    } else {
      renderBalance();
    }

    updateVitalsFromSnapshot(getPlayerStatsSnapshotFromEvent(event), {
      animateChange: true,
      animateDamage: true,
    });
  }

  function handleHealthChanged(event) {
    const explicitHealth =
      event?.detail?.health ??
      event?.detail?.hp ??
      event?.detail?.value;
    const delta = Number(event?.detail?.delta);
    const nextHealth = explicitHealth !== undefined && explicitHealth !== null
      ? explicitHealth
      : Number.isFinite(delta)
        ? currentVitals.health + delta
        : undefined;

    if (nextHealth === undefined || nextHealth === null) return;

    setVitalVisual('health', nextHealth, {
      animateChange: true,
      animateDamage: event?.detail?.animateDamage !== false,
    });
  }

  function handleVitalsChanged(event) {
    const changed = updateVitalsFromSnapshot(getPlayerStatsSnapshotFromEvent(event), {
      animateChange: true,
      animateDamage: event?.detail?.animateDamage !== false,
    });

    if (!changed) {
      refreshHudFromState({
        animateChange: true,
        animateDamage: true,
      });
    }
  }

  function refreshPositionAfterCollisionChange(templateId) {
    if (!active || templateId !== activeTemplateId) return;

    renderInteriorObjects();
    if (colliderEditorOpen || objectEditorOpen) return;

    if (!activeSeatObjectId) position = snapInteriorPosition(activeTemplateId, position);
    renderPosition();
  }

  function handleRemoteCollisionChange(payload) {
    const row = payload?.new || payload?.old;
    const templateId = String(row?.template_id || row?.templateId || '').trim();
    if (!TEMPLATES[templateId]) return;

    if (payload?.eventType === 'DELETE') {
      const nextProfiles = { ...customCollisionProfiles };
      delete nextProfiles[templateId];
      customCollisionProfiles = nextProfiles;
      writeStoredCollisionProfiles(customCollisionProfiles);
    } else {
      applyRemoteCollisionRow(row);
    }

    if (templateId === activeTemplateId) {
      if (!colliderEditorOpen && !objectEditorOpen) {
        refreshPositionAfterCollisionChange(templateId);
      } else if (!colliderEditorPointer) {
        if (colliderEditorOpen) setColliderStatus('Сервер обновил профиль интерьера');
        if (objectEditorOpen && !objectEditorPointer) setObjectStatus('Сервер обновил объекты');
      }
    }
  }

  function subscribeRemoteCollisionProfiles() {
    if (collisionProfilesChannel) return;

    collisionProfilesChannel = supabase
      .channel('mn-interior-colliders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: INTERIOR_COLLISION_TABLE },
        handleRemoteCollisionChange
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[interiors] collider realtime subscription failed:', error || status);
        }
      });
  }

  function handleRemoteMappedObjectsChange(payload) {
    const row = payload?.new || payload?.old;
    const templateId = String(row?.template_id || '').trim();
    if (!TEMPLATES[templateId]) return;

    window.clearTimeout(mappedObjectsReloadTimer);
    mappedObjectsReloadTimer = window.setTimeout(async () => {
      const loaded = await loadRemoteMappedInteriorObjects({ force: true });
      if (!loaded || destroyed) return;

      if (active && templateId === activeTemplateId) {
        renderInteriorObjects();
        if (objectEditorOpen && !objectEditorPointer) {
          setObjectStatus('Сервер обновил раскладку объектов');
        }
      }
    }, 140);
  }

  function handleRemoteInteriorDoorStateChange(payload) {
    const row = payload?.new || payload?.old;
    const templateId = String(row?.template_id || '').trim();
    const objectId = String(row?.object_id || '').trim();
    const instanceId = String(row?.instance_id || '').trim();
    if (!objectId || !instanceId || !TEMPLATES[templateId]) return;

    if (payload?.eventType === 'DELETE') removeInteriorDoorState(instanceId, objectId);
    else applyRemoteInteriorDoorState(row);

    if (
      active &&
      templateId === activeTemplateId &&
      instanceId === activeInteriorDoorInstanceId
    ) {
      if (!activeSeatObjectId) position = snapInteriorPosition(activeTemplateId, position);
      renderPosition();
      renderInteriorObjects();
    }
  }

  function subscribeRemoteMappedInteriorObjects() {
    if (mappedObjectsChannel) return;

    mappedObjectsChannel = supabase
      .channel('mn-interior-mapped-objects')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: INTERIOR_MAPPED_OBJECT_TABLE },
        handleRemoteMappedObjectsChange
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[interiors] mapped objects realtime subscription failed:', error || status);
        }
      });
  }

  function subscribeRemoteInteriorDoorStates() {
    if (doorStatesChannel) return;

    doorStatesChannel = supabase
      .channel('mn-interior-door-states')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: INTERIOR_DOOR_STATE_TABLE },
        handleRemoteInteriorDoorStateChange
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[interiors] door states realtime subscription failed:', error || status);
        }
      });
  }

  function setColliderStatus(text) {
    colliderStatus.textContent = text || '';
  }

  function setColliderEditorMode(mode) {
    colliderEditorMode = 'blocked';
    colliderModeButtons.forEach((button) => {
      button.dataset.active = button.dataset.interiorColliderMode === colliderEditorMode ? 'true' : 'false';
    });
  }

  function editorProfileForCurrentTemplate() {
    return cloneCollisionProfile(collisionProfileFor(activeTemplateId));
  }

  function setRuntimeEditorProfile(profile, templateId = activeTemplateId) {
    customCollisionProfiles = {
      ...customCollisionProfiles,
      [templateId]: normalizeCollisionProfile(profile, INTERIOR_COLLISION_PROFILES[templateId]),
    };
  }

  function interiorLayerPoint(event, layer) {
    const rect = layer.getBoundingClientRect();
    const forceRotated = document.documentElement.classList.contains('mn-force-rotate-landscape') &&
      window.matchMedia?.('(orientation: portrait)')?.matches;
    const x = forceRotated
      ? ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100
      : ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = forceRotated
      ? ((rect.right - event.clientX) / Math.max(1, rect.width)) * 100
      : ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;

    return {
      x: clampPercent(x, 0),
      y: clampPercent(y, 0),
    };
  }

  function colliderLayerPoint(event) {
    return interiorLayerPoint(event, colliderLayer);
  }

  function rectFromPoints(start, end) {
    return normalizeCollisionRect({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    });
  }

  function rectToStyle(rect) {
    const safe = normalizeCollisionRect(rect) || { x1: 0, y1: 0, x2: 0, y2: 0 };
    return `left:${safe.x1}%;top:${safe.y1}%;width:${safe.x2 - safe.x1}%;height:${safe.y2 - safe.y1}%`;
  }

  function editorCountsText(profile = colliderEditorProfile) {
    const blockedCount = profile?.blocked?.length || 0;
    return `${activeTemplateId}: стен ${blockedCount}`;
  }

  function renderColliderEditorLayer() {
    if (!colliderEditorOpen || !colliderEditorProfile) {
      colliderLayer.replaceChildren();
      return;
    }

    const fragments = [];
    ['blocked'].forEach((kind) => {
      (colliderEditorProfile[kind] || []).forEach((rect, index) => {
        const selected = colliderEditorSelected?.kind === kind && colliderEditorSelected?.index === index;
        fragments.push(`
          <button
            type="button"
            class="mn-interior-collider-rect mn-interior-collider-rect-${kind}${selected ? ' is-selected' : ''}"
            data-collider-kind="${kind}"
            data-collider-index="${index}"
            style="${rectToStyle(rect)}"
            aria-label="${kind} ${index + 1}"
          ></button>
        `);
      });
    });

    if (colliderEditorDraft) {
      fragments.push(`
        <div
          class="mn-interior-collider-rect mn-interior-collider-rect-${colliderEditorMode} is-draft"
          style="${rectToStyle(colliderEditorDraft)}"
        ></div>
      `);
    }

    colliderLayer.innerHTML = fragments.join('');
    setColliderStatus(editorCountsText());
  }

  function applyColliderEditorProfile({ persist = false } = {}) {
    if (!colliderEditorProfile) return false;

    const normalized = normalizeCollisionProfile(colliderEditorProfile, INTERIOR_COLLISION_PROFILES[activeTemplateId]);
    colliderEditorProfile = normalized;
    setRuntimeEditorProfile(normalized);
    writeStoredCollisionProfiles(customCollisionProfiles);

    if (persist) {
      void persistColliderEditorProfile();
      return true;
    }

    scheduleColliderEditorProfileSave();
    return true;
  }

  async function persistColliderEditorProfile() {
    if (!colliderEditorProfile) return false;

    window.clearTimeout(colliderSaveTimer);
    const saveId = ++colliderSaveSequence;
    const profile = normalizeCollisionProfile(colliderEditorProfile, INTERIOR_COLLISION_PROFILES[activeTemplateId]);
    setRuntimeEditorProfile(profile);
    writeStoredCollisionProfiles(customCollisionProfiles);
    setColliderStatus(`Сохраняю для всех · ${editorCountsText(profile)}`);

    try {
      await saveRemoteCollisionProfile(activeTemplateId, profile);
      if (saveId === colliderSaveSequence) {
        setColliderStatus(`Сохранено для всех · ${editorCountsText(profile)}`);
      }
      return true;
    } catch (error) {
      console.warn('[interiors] collider profile save failed:', error);
      if (saveId === colliderSaveSequence) {
        setColliderStatus(collisionSaveErrorMessage(error));
      }
      return false;
    }
  }

  function scheduleColliderEditorProfileSave() {
    window.clearTimeout(colliderSaveTimer);
    setColliderStatus(`Изменено, автосохраняю · ${editorCountsText()}`);
    colliderSaveTimer = window.setTimeout(() => {
      void persistColliderEditorProfile();
    }, 450);
  }

  function openColliderEditor() {
    if (!active || !isInteriorColliderAdmin()) return;
    if (objectEditorOpen) closeObjectEditor();

    colliderEditorOpen = true;
    colliderEditorProfile = editorProfileForCurrentTemplate();
    colliderEditorSelected = null;
    colliderEditorPointer = null;
    colliderEditorStart = null;
    colliderEditorDraft = null;
    keys.clear();
    joystickVector = { x: 0, y: 0 };
    joystick.dataset.active = 'false';
    stick.style.transform = 'translate3d(0,0,0)';
    colliderLayer.hidden = false;
    colliderPanel.hidden = false;
    scheduleColliderPanelLayout();
    overlay.dataset.colliderEditor = 'enabled';
    document.body.classList.add('mn-interior-collider-editor-open');
    document.documentElement.classList.add('mn-interior-collider-editor-open');
    setColliderEditorMode(colliderEditorMode);
    renderColliderEditorLayer();
  }

  function closeColliderEditor() {
    try {
      if (colliderPanelDrag && colliderPanelDragHandle.hasPointerCapture?.(colliderPanelDrag.pointerId)) {
        colliderPanelDragHandle.releasePointerCapture(colliderPanelDrag.pointerId);
      }
    } catch {
      // Pointer capture may already be released by the browser.
    }
    colliderPanelDrag = null;
    colliderPanel.dataset.dragging = 'false';
    colliderEditorOpen = false;
    colliderEditorPointer = null;
    colliderEditorStart = null;
    colliderEditorDraft = null;
    colliderEditorSelected = null;
    colliderLayer.hidden = true;
    colliderPanel.hidden = true;
    overlay.dataset.colliderEditor = 'disabled';
    document.body.classList.remove('mn-interior-collider-editor-open');
    document.documentElement.classList.remove('mn-interior-collider-editor-open');
    renderColliderEditorLayer();
  }

  function toggleColliderEditor() {
    if (colliderEditorOpen) closeColliderEditor();
    else openColliderEditor();
  }

  function isColliderEditorHotkey(event) {
    const key = String(event.key || '').toLowerCase();
    return key === 'c' || key === 'с';
  }

  function handleColliderPointerDown(event) {
    if (!colliderEditorOpen || !colliderEditorProfile) return;

    event.preventDefault();
    event.stopPropagation();

    const rectButton = event.target.closest?.('[data-collider-kind]');
    if (rectButton) {
      colliderEditorSelected = {
        kind: rectButton.dataset.colliderKind,
        index: Number(rectButton.dataset.colliderIndex),
      };
      renderColliderEditorLayer();
      return;
    }

    colliderEditorPointer = event.pointerId;
    colliderEditorStart = colliderLayerPoint(event);
    colliderEditorDraft = null;
    colliderEditorSelected = null;
    colliderLayer.setPointerCapture?.(event.pointerId);
    renderColliderEditorLayer();
  }

  function handleColliderPointerMove(event) {
    if (!colliderEditorOpen || event.pointerId !== colliderEditorPointer || !colliderEditorStart) return;

    event.preventDefault();
    event.stopPropagation();
    colliderEditorDraft = rectFromPoints(colliderEditorStart, colliderLayerPoint(event));
    renderColliderEditorLayer();
  }

  function handleColliderPointerEnd(event) {
    if (!colliderEditorOpen || event.pointerId !== colliderEditorPointer) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = colliderEditorDraft || rectFromPoints(colliderEditorStart, colliderLayerPoint(event));
    colliderEditorPointer = null;
    colliderEditorStart = null;
    colliderEditorDraft = null;

    if (
      rect &&
      rect.x2 - rect.x1 >= INTERIOR_COLLIDER_MIN_SIZE &&
      rect.y2 - rect.y1 >= INTERIOR_COLLIDER_MIN_SIZE
    ) {
      const list = colliderEditorProfile[colliderEditorMode] || [];
      list.push(rect);
      colliderEditorProfile[colliderEditorMode] = list;
      colliderEditorSelected = {
        kind: colliderEditorMode,
        index: list.length - 1,
      };
      applyColliderEditorProfile();
    }

    renderColliderEditorLayer();
  }

  function deleteSelectedCollider() {
    const selected = colliderEditorSelected;
    if (!selected || !colliderEditorProfile?.[selected.kind]) return;

    colliderEditorProfile[selected.kind].splice(selected.index, 1);
    colliderEditorSelected = null;
    applyColliderEditorProfile();
    renderColliderEditorLayer();
  }

  function setObjectStatus(text) {
    objectStatus.textContent = text || '';
  }

  function objectCountsText(profile = objectEditorProfile) {
    const objects = profile?.objects || [];
    const beds = objects.filter((object) => object.type === 'bed').length;
    const chairs = objects.filter((object) => object.type === 'chair').length;
    const tables = objects.filter((object) => object.type === 'table').length;
    const doors = objects.filter((object) => object.type === 'door').length;
    const exits = objects.filter((object) => object.type === 'exit').length;
    return `Кровати ${beds} · стулья ${chairs} · столы ${tables} · двери ${doors} · выходы ${exits}`;
  }

  function setObjectEditorType(type) {
    if (!INTERIOR_MAPPED_OBJECT_TYPES[type]) return;
    objectEditorType = type;
    objectTypeButtons.forEach((button) => {
      button.dataset.active = button.dataset.interiorObjectType === objectEditorType ? 'true' : 'false';
    });
    setObjectStatus(`${INTERIOR_MAPPED_OBJECT_TYPES[type].label}: нажми на план для установки`);
  }

  function renderInteriorObjects() {
    const profile = objectEditorOpen && objectEditorProfile
      ? objectEditorProfile
      : collisionProfileFor(activeTemplateId);
    const fragment = document.createDocumentFragment();

    normalizeMappedInteriorObjects(profile?.objects).forEach((object) => {
      const element = document.createElement('button');
      const meta = INTERIOR_MAPPED_OBJECT_TYPES[object.type];
      const size = mappedInteriorObjectSize(object);
      const selected = objectEditorOpen && object.id === objectEditorSelectedId;

      element.type = 'button';
      element.tabIndex = -1;
      element.className = `mn-interior-mapped-object mn-interior-mapped-object-${object.type}`;
      element.dataset.interiorObjectId = object.id;
      element.dataset.interiorObjectType = object.type;
      element.dataset.selected = selected ? 'true' : 'false';
      if (object.type === 'door') {
        const isOpen = isInteriorDoorOpen(object.id);
        element.dataset.open = isOpen ? 'true' : 'false';
        element.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
      }
      if (object.type === 'chair') {
        const occupant = seatOccupantForObject(object.id);
        const occupied = Boolean(occupant);
        element.dataset.occupied = occupied ? 'true' : 'false';
        element.setAttribute('aria-pressed', occupied ? 'true' : 'false');

        if (occupied) {
          const occupantBadge = document.createElement('span');
          occupantBadge.className = 'mn-interior-chair-occupant';
          occupantBadge.textContent = seatStateBelongsToLocalPlayer(occupant)
            ? 'Вы'
            : String(occupant.nickname || 'Занято').slice(0, 18);
          element.appendChild(occupantBadge);
        }
      }
      element.style.left = `${object.x}%`;
      element.style.top = `${object.y}%`;
      element.style.width = `${size.width}%`;
      element.style.height = `${size.height}%`;
      element.style.transform = `translate(-50%, -50%) rotate(${object.rotation}deg)`;
      element.setAttribute(
        'aria-label',
        `${meta?.label || object.type} · ${object.rotation}° · ${size.width} × ${size.height}`
      );
      if (selected) {
        const resizeHandle = document.createElement('span');
        resizeHandle.className = 'mn-interior-object-resize-handle';
        resizeHandle.dataset.interiorObjectResize = object.id;
        resizeHandle.setAttribute('aria-hidden', 'true');
        element.appendChild(resizeHandle);
      }
      fragment.appendChild(element);
    });

    objectLayer.dataset.editor = objectEditorOpen ? 'enabled' : 'disabled';
    objectLayer.replaceChildren(fragment);
    objectRotate.disabled = !objectEditorSelectedId;
    objectDelete.disabled = !objectEditorSelectedId;

    if (objectEditorOpen) setObjectStatus(objectCountsText(profile));
    refreshDoorInteraction();
  }

  function nearestInteractiveDoor() {
    if (!active || colliderEditorOpen || objectEditorOpen) return null;

    let nearest = null;
    normalizeMappedInteriorObjects(collisionProfileFor(activeTemplateId)?.objects)
      .filter((object) => object.type === 'door')
      .forEach((door) => {
        const dx = (Number(door.x) - Number(position.x)) * INTERIOR_DESIGN_ASPECT;
        const dy = Number(door.y) - Number(position.y);
        const distance = Math.hypot(dx, dy);
        const configuredRadius = Number(door?.properties?.interactionRadius);
        const radius = Number.isFinite(configuredRadius)
          ? Math.max(3, Math.min(14, configuredRadius))
          : INTERIOR_DOOR_INTERACTION_RADIUS;
        const size = mappedInteriorObjectSize(door);
        const sizeAllowance = Math.max(0, (size.width - 4.2) / 2);
        const movementAllowance = door.id === nearestDoorId
          ? INTERIOR_DOOR_RADIUS_HYSTERESIS
          : 0;
        const effectiveRadius = radius + sizeAllowance + movementAllowance;
        if (distance > effectiveRadius || (nearest && distance >= nearest.distance)) return;
        nearest = { door, distance };
      });

    return nearest;
  }

  function nearestInteractiveExit() {
    if (!active || colliderEditorOpen || objectEditorOpen) return null;

    let nearest = null;
    normalizeMappedInteriorObjects(collisionProfileFor(activeTemplateId)?.objects)
      .filter((object) => object.type === 'exit')
      .forEach((exitMarker) => {
        const dx = (Number(exitMarker.x) - Number(position.x)) * INTERIOR_DESIGN_ASPECT;
        const dy = Number(exitMarker.y) - Number(position.y);
        const distance = Math.hypot(dx, dy);
        const configuredRadius = Number(exitMarker?.properties?.interactionRadius);
        const radius = Number.isFinite(configuredRadius)
          ? Math.max(3, Math.min(14, configuredRadius))
          : INTERIOR_EXIT_INTERACTION_RADIUS;
        const size = mappedInteriorObjectSize(exitMarker);
        const sizeAllowance = Math.max(0, (size.width - 3.2) / 2);
        const movementAllowance = exitMarker.id === nearestExitId
          ? INTERIOR_DOOR_RADIUS_HYSTERESIS
          : 0;
        const effectiveRadius = radius + sizeAllowance + movementAllowance;
        if (distance > effectiveRadius || (nearest && distance >= nearest.distance)) return;
        nearest = { exitMarker, distance };
      });

    return nearest;
  }

  function nearestInteractiveChair() {
    if (!active || colliderEditorOpen || objectEditorOpen) return null;

    let nearest = null;
    normalizeMappedInteriorObjects(collisionProfileFor(activeTemplateId)?.objects)
      .filter((object) => object.type === 'chair')
      .forEach((chair) => {
        const dx = (Number(chair.x) - Number(position.x)) * INTERIOR_DESIGN_ASPECT;
        const dy = Number(chair.y) - Number(position.y);
        const distance = Math.hypot(dx, dy);
        const configuredRadius = Number(chair?.properties?.interactionRadius);
        const radius = Number.isFinite(configuredRadius)
          ? Math.max(3, Math.min(12, configuredRadius))
          : INTERIOR_CHAIR_INTERACTION_RADIUS;
        const movementAllowance = chair.id === nearestChairId
          ? INTERIOR_DOOR_RADIUS_HYSTERESIS
          : 0;
        if (distance > radius + movementAllowance || (nearest && distance >= nearest.distance)) return;
        nearest = { chair, distance };
      });

    return nearest;
  }

  function nearestInteriorInteraction() {
    const doorTarget = nearestInteractiveDoor();
    const exitTarget = nearestInteractiveExit();
    const chairTarget = nearestInteractiveChair();

    const candidates = [
      doorTarget ? { kind: 'door', object: doorTarget.door, distance: doorTarget.distance } : null,
      exitTarget ? { kind: 'exit', object: exitTarget.exitMarker, distance: exitTarget.distance } : null,
      chairTarget ? { kind: 'chair', object: chairTarget.chair, distance: chairTarget.distance } : null,
    ].filter(Boolean);

    if (!candidates.length) return null;
    return candidates.sort((a, b) => a.distance - b.distance)[0];
  }

  function refreshDoorInteraction() {
    const nearest = nearestInteriorInteraction();
    nearestDoorId = nearest?.kind === 'door' ? nearest.object.id : null;
    nearestExitId = nearest?.kind === 'exit' ? nearest.object.id : null;
    nearestChairId = nearest?.kind === 'chair' ? nearest.object.id : null;

    if (!nearest) {
      doorAction.hidden = true;
      doorAction.disabled = false;
      delete doorAction.dataset.kind;
      delete doorAction.dataset.open;
      delete doorAction.dataset.occupied;
      return null;
    }

    doorAction.hidden = false;
    doorAction.dataset.kind = nearest.kind;

    if (nearest.kind === 'chair') {
      const occupant = seatOccupantForObject(nearest.object.id);
      const isLocalOccupant = seatStateBelongsToLocalPlayer(occupant);
      const occupiedByAnother = Boolean(occupant && !isLocalOccupant);

      doorAction.disabled = seatActionPending || occupiedByAnother;
      doorAction.dataset.open = 'false';
      doorAction.dataset.occupied = occupiedByAnother ? 'true' : 'false';
      doorActionLabel.textContent = seatActionPending
        ? 'Подождите…'
        : isLocalOccupant || activeSeatObjectId === nearest.object.id
          ? 'Встать со стула'
          : occupiedByAnother
            ? `Занято: ${String(occupant.nickname || 'игрок').slice(0, 18)}`
            : 'Сесть на стул';
      return nearest;
    }

    delete doorAction.dataset.occupied;

    if (nearest.kind === 'exit') {
      doorAction.disabled = false;
      doorAction.dataset.open = 'false';
      doorActionLabel.textContent = activeInteriorKind === 'hospital'
        ? 'Выйти из больницы'
        : 'Выйти из дома';
      return nearest;
    }

    const isOpen = isInteriorDoorOpen(nearestDoorId);
    doorAction.disabled = doorTogglePending;
    doorAction.dataset.open = isOpen ? 'true' : 'false';
    doorActionLabel.textContent = doorTogglePending
      ? 'Подождите…'
      : isOpen
        ? 'Закрыть дверь'
        : 'Открыть дверь';
    return nearest;
  }

  async function toggleNearestInteriorDoor(doorCandidate = null) {
    if (doorTogglePending || colliderEditorOpen || objectEditorOpen) return false;
    const nearest = doorCandidate ? null : nearestInteractiveDoor();
    const door = doorCandidate || nearest?.door;
    const instanceId = activeInteriorDoorInstanceId;
    if (!door || !instanceId) return false;

    const wasOpen = isInteriorDoorOpen(door.id);
    doorTogglePending = true;
    setLocalInteriorDoorState(door.id, activeTemplateId, instanceId, !wasOpen);
    renderInteriorObjects();

    try {
      await toggleRemoteInteriorDoorState(activeTemplateId, instanceId, door.id);
      if (!activeSeatObjectId) position = snapInteriorPosition(activeTemplateId, position);
      renderPosition();
      renderInteriorObjects();
      return true;
    } catch (error) {
      console.warn('[interiors] door toggle failed:', error);
      setLocalInteriorDoorState(door.id, activeTemplateId, instanceId, wasOpen);
      renderInteriorObjects();
      return false;
    } finally {
      doorTogglePending = false;
      refreshDoorInteraction();
    }
  }

  function activateNearestInteriorInteraction() {
    const nearest = nearestInteriorInteraction();
    if (!nearest) return false;

    if (nearest.kind === 'exit') {
      exit();
      return true;
    }

    if (nearest.kind === 'chair') {
      void claimChair(nearest.object);
      return true;
    }

    void toggleNearestInteriorDoor(nearest.object);
    return true;
  }

  function applyObjectEditorProfile({ persist = false } = {}) {
    if (!objectEditorProfile) return false;

    objectEditorProfile = normalizeCollisionProfile(
      objectEditorProfile,
      INTERIOR_COLLISION_PROFILES[objectEditorTemplateId]
    );
    setRuntimeEditorProfile(objectEditorProfile, objectEditorTemplateId);
    setMappedObjectsForTemplate(objectEditorTemplateId, objectEditorProfile.objects);
    renderInteriorObjects();

    if (persist) {
      void persistObjectEditorProfile();
      return true;
    }

    scheduleObjectEditorProfileSave();
    return true;
  }

  async function persistObjectEditorProfile() {
    if (!objectEditorProfile) return false;

    window.clearTimeout(colliderSaveTimer);
    const saveId = ++colliderSaveSequence;
    const profile = normalizeCollisionProfile(
      objectEditorProfile,
      INTERIOR_COLLISION_PROFILES[objectEditorTemplateId]
    );
    setRuntimeEditorProfile(profile, objectEditorTemplateId);
    setMappedObjectsForTemplate(objectEditorTemplateId, profile.objects);
    setObjectStatus(`Сохраняю для всех · ${objectCountsText(profile)}`);

    try {
      await saveRemoteMappedInteriorObjects(objectEditorTemplateId, profile.objects);
      if (saveId === colliderSaveSequence) {
        setObjectStatus(`Сохранено для всех · ${objectCountsText(profile)}`);
      }
      return true;
    } catch (error) {
      console.warn('[interiors] mapped objects save failed:', error);
      if (saveId === colliderSaveSequence) {
        setObjectStatus('Локально работает, но в Supabase не сохранилось');
      }
      return false;
    }
  }

  function scheduleObjectEditorProfileSave() {
    window.clearTimeout(colliderSaveTimer);
    setObjectStatus(`Изменено, автосохраняю · ${objectCountsText()}`);
    colliderSaveTimer = window.setTimeout(() => {
      void persistObjectEditorProfile();
    }, 450);
  }

  function openObjectEditor() {
    if (!active || !isInteriorColliderAdmin()) return;
    if (colliderEditorOpen) closeColliderEditor();

    objectEditorOpen = true;
    objectEditorTemplateId = activeTemplateId;
    objectEditorProfile = editorProfileForCurrentTemplate();
    objectEditorSelectedId = null;
    objectEditorPointer = null;
    objectEditorDraggingId = null;
    objectEditorDragOffset = null;
    objectEditorResizeId = null;
    objectEditorResizeStart = null;
    objectEditorResizeOrigin = null;
    keys.clear();
    joystickVector = { x: 0, y: 0 };
    joystick.dataset.active = 'false';
    stick.style.transform = 'translate3d(0,0,0)';
    objectPanel.hidden = false;
    overlay.dataset.objectEditor = 'enabled';
    document.body.classList.add('mn-interior-object-editor-open');
    document.documentElement.classList.add('mn-interior-object-editor-open');
    setObjectEditorType(objectEditorType);
    renderInteriorObjects();
  }

  function closeObjectEditor() {
    objectEditorOpen = false;
    objectEditorSelectedId = null;
    objectEditorPointer = null;
    objectEditorDraggingId = null;
    objectEditorDragOffset = null;
    objectEditorResizeId = null;
    objectEditorResizeStart = null;
    objectEditorResizeOrigin = null;
    objectPanel.hidden = true;
    overlay.dataset.objectEditor = 'disabled';
    document.body.classList.remove('mn-interior-object-editor-open');
    document.documentElement.classList.remove('mn-interior-object-editor-open');
    renderInteriorObjects();
  }

  function toggleObjectEditor() {
    if (objectEditorOpen) closeObjectEditor();
    else openObjectEditor();
  }

  function isObjectEditorHotkey(event) {
    const key = String(event.key || '').toLowerCase();
    return key === 'o' || key === 'щ';
  }

  function handleObjectPointerDown(event) {
    if (!objectEditorOpen || !objectEditorProfile) return;

    event.preventDefault();
    event.stopPropagation();

    const point = interiorLayerPoint(event, objectLayer);
    const objectButton = event.target.closest?.('[data-interior-object-id]');
    const resizeHandle = event.target.closest?.('[data-interior-object-resize]');

    if (objectButton) {
      const objectId = String(objectButton.dataset.interiorObjectId || '');
      const object = objectEditorProfile.objects.find((item) => item.id === objectId);
      if (!object) return;

      objectEditorSelectedId = objectId;
      objectEditorPointer = event.pointerId;
      if (resizeHandle) {
        objectEditorDraggingId = null;
        objectEditorDragOffset = null;
        objectEditorResizeId = objectId;
        objectEditorResizeStart = point;
        objectEditorResizeOrigin = mappedInteriorObjectSize(object);
      } else {
        objectEditorResizeId = null;
        objectEditorResizeStart = null;
        objectEditorResizeOrigin = null;
        objectEditorDraggingId = objectId;
        objectEditorDragOffset = {
          x: point.x - object.x,
          y: point.y - object.y,
        };
      }
      objectLayer.setPointerCapture?.(event.pointerId);
      renderInteriorObjects();
      return;
    }

    if (objectEditorProfile.objects.length >= INTERIOR_MAPPED_OBJECT_LIMIT) {
      setObjectStatus(`Достигнут лимит ${INTERIOR_MAPPED_OBJECT_LIMIT} объектов`);
      return;
    }

    const object = {
      id: createMappedInteriorObjectId(objectEditorType),
      type: objectEditorType,
      x: roundPercent(point.x),
      y: roundPercent(point.y),
      rotation: 0,
      properties: createMappedInteriorObjectProperties(objectEditorType),
    };
    objectEditorProfile.objects.push(object);
    objectEditorSelectedId = object.id;
    applyObjectEditorProfile();
  }

  function handleObjectPointerMove(event) {
    if (
      !objectEditorOpen ||
      event.pointerId !== objectEditorPointer ||
      (!objectEditorDraggingId && !objectEditorResizeId)
    ) return;

    event.preventDefault();
    event.stopPropagation();

    const point = interiorLayerPoint(event, objectLayer);
    const activeObjectId = objectEditorResizeId || objectEditorDraggingId;
    const object = objectEditorProfile?.objects?.find((item) => item.id === activeObjectId);
    if (!object) return;

    if (objectEditorResizeId && objectEditorResizeStart && objectEditorResizeOrigin) {
      const screenDx = Number(point.x) - Number(objectEditorResizeStart.x);
      const screenDy = Number(point.y) - Number(objectEditorResizeStart.y);
      const angle = Number(object.rotation || 0) * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const aspectDx = screenDx * INTERIOR_DESIGN_ASPECT;
      const localDx = (aspectDx * cos + screenDy * sin) / INTERIOR_DESIGN_ASPECT;
      const localDy = -aspectDx * sin + screenDy * cos;
      const nextSize = mappedInteriorObjectSize({
        ...object,
        properties: {
          ...object.properties,
          width: objectEditorResizeOrigin.width + localDx * 2,
          height: objectEditorResizeOrigin.height + localDy * 2,
        },
      });
      object.properties = {
        ...object.properties,
        width: nextSize.width,
        height: nextSize.height,
        ...(object.type === 'door' ? { depth: nextSize.height } : {}),
      };
      renderInteriorObjects();
      setObjectStatus(`Размер ${nextSize.width} × ${nextSize.height} · отпусти для сохранения`);
      return;
    }

    object.x = roundPercent(clampPercent(point.x - Number(objectEditorDragOffset?.x || 0), object.x));
    object.y = roundPercent(clampPercent(point.y - Number(objectEditorDragOffset?.y || 0), object.y));
    renderInteriorObjects();
  }

  function handleObjectPointerEnd(event) {
    if (!objectEditorOpen || event.pointerId !== objectEditorPointer) return;

    event.preventDefault();
    event.stopPropagation();
    objectEditorPointer = null;
    objectEditorDraggingId = null;
    objectEditorDragOffset = null;
    objectEditorResizeId = null;
    objectEditorResizeStart = null;
    objectEditorResizeOrigin = null;
    applyObjectEditorProfile();
  }

  function rotateSelectedObject() {
    const object = objectEditorProfile?.objects?.find((item) => item.id === objectEditorSelectedId);
    if (!object) return;
    object.rotation = (Number(object.rotation || 0) + 90) % 360;
    applyObjectEditorProfile();
  }

  function deleteSelectedObject() {
    if (!objectEditorProfile || !objectEditorSelectedId) return;
    objectEditorProfile.objects = objectEditorProfile.objects.filter(
      (object) => object.id !== objectEditorSelectedId
    );
    objectEditorSelectedId = null;
    applyObjectEditorProfile();
  }

  function exportColliderProfile() {
    const profile = normalizeCollisionProfile(
      colliderEditorProfile || collisionProfileFor(activeTemplateId),
      INTERIOR_COLLISION_PROFILES[activeTemplateId]
    );
    const payload = {
      version: 2,
      template: activeTemplateId,
      profile,
      profiles: {
        ...customCollisionProfiles,
        [activeTemplateId]: profile,
      },
    };
    const text = JSON.stringify(payload, null, 2);
    colliderJson.value = text;
    navigator.clipboard?.writeText(text).then(
      () => setColliderStatus('JSON скопирован'),
      () => setColliderStatus('JSON готов в поле ниже')
    );
  }

  function importColliderProfile() {
    try {
      const parsed = JSON.parse(colliderJson.value || '{}');
      const sourceProfiles = parsed?.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : null;

      if (sourceProfiles) {
        const nextProfiles = { ...customCollisionProfiles };
        Object.keys(TEMPLATES).forEach((templateId) => {
          if (sourceProfiles[templateId]) {
            nextProfiles[templateId] = normalizeCollisionProfile(
              sourceProfiles[templateId],
              customCollisionProfiles[templateId] || INTERIOR_COLLISION_PROFILES[templateId]
            );
          }
        });
        customCollisionProfiles = nextProfiles;
        colliderEditorProfile = editorProfileForCurrentTemplate();
      } else {
        const templateId = parsed?.template && TEMPLATES[parsed.template] ? parsed.template : activeTemplateId;
        const sourceProfile = parsed?.profile || parsed;
        const normalized = normalizeCollisionProfile(
          sourceProfile,
          customCollisionProfiles[templateId] || INTERIOR_COLLISION_PROFILES[templateId]
        );
        customCollisionProfiles = {
          ...customCollisionProfiles,
          [templateId]: normalized,
        };
        if (templateId === activeTemplateId) colliderEditorProfile = cloneCollisionProfile(normalized);
      }

      writeStoredCollisionProfiles(customCollisionProfiles);
      renderColliderEditorLayer();
      setColliderStatus('Импортировано, сохраняю для всех');
      void persistColliderEditorProfile();
    } catch (error) {
      setColliderStatus('JSON не прочитался');
      console.warn('[interiors] collider import failed:', error);
    }
  }

  function movementVector() {
    if (colliderEditorOpen || objectEditorOpen || activeSeatObjectId) return { x: 0, y: 0 };

    let x = joystickVector.x;
    let y = joystickVector.y;
    if (keys.has('arrowleft') || keys.has('a') || keys.has('ф')) x -= 1;
    if (keys.has('arrowright') || keys.has('d') || keys.has('в')) x += 1;
    if (keys.has('arrowup') || keys.has('w') || keys.has('ц')) y -= 1;
    if (keys.has('arrowdown') || keys.has('s') || keys.has('ы')) y += 1;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  function frame(time) {
    if (!active || destroyed) return;
    const dt = Math.min(0.04, Math.max(0, (time - (lastFrame || time)) / 1000));
    lastFrame = time;
    const vector = movementVector();
    const moving = Math.hypot(vector.x, vector.y) > 0.04;
    const wantsSprint = moving && (keys.has('shift') || Math.hypot(joystickVector.x, joystickVector.y) >= 0.62);
    const frameScale = dt * 60;

    if (wantsSprint && !sprintLocked) {
      stamina = Math.max(staminaConfig.emptyAt, stamina - staminaConfig.drainPerFrame * frameScale);
      if (stamina <= staminaConfig.emptyAt) sprintLocked = true;
    } else {
      stamina = Math.min(staminaConfig.max, stamina + staminaConfig.recoverPerFrame * frameScale);
      if (sprintLocked && stamina >= staminaConfig.recoveredAt) sprintLocked = false;
    }

    const sprint = wantsSprint && !sprintLocked;
    const speed = sprint ? 23 : 15;
    position = resolveInteriorMovement(activeTemplateId, position, {
      x: vector.x * speed * dt,
      y: vector.y * speed * dt,
    });
    staminaBox.dataset.visible = moving ? 'true' : 'false';
    renderStamina();
    renderPosition();
    refreshDoorInteraction();
    sendLocalInteriorPosition();
    raf = requestAnimationFrame(frame);
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }

  function showLoading(delayMs = 420) {
    window.clearTimeout(loadingRevealTimer);
    loading.dataset.visible = 'false';
    loadingText.textContent = '';
    loading.hidden = false;

    loadingRevealTimer = window.setTimeout(() => {
      if (destroyed || loading.hidden) return;
      loading.dataset.visible = 'true';
    }, delayMs);
  }

  function hideLoading() {
    window.clearTimeout(loadingRevealTimer);
    loadingRevealTimer = 0;
    loading.dataset.visible = 'false';
    loading.hidden = true;
  }

  function showError(text) {
    disconnectInteriorSession();
    active = false;
    activeInteriorDoorInstanceId = null;
    activeHouse = null;
    activeHouseId = null;
    activeService = null;
    activeServiceId = null;
    activeInteriorKind = 'house';
    activeTemplateId = 'standard';
    if (colliderEditorOpen) closeColliderEditor();
    if (objectEditorOpen) closeObjectEditor();
    hideLoading();
    scene.hidden = true;
    controls.hidden = true;
    ui.hidden = true;
    errorText.textContent = text;
    errorBox.hidden = false;
  }

  function preloadTemplateImage(template) {
    const cached = templateImageCache.get(template.id);
    if (cached) return cached.promise;

    // Keep every template image inside the DOM. Telegram/embedded WebViews can
    // deprioritize a detached Image object, especially while the city map is active.
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.loading = 'eager';
    image.fetchPriority = 'high';
    image.dataset.interiorPreload = template.id;
    image.style.cssText = 'position:fixed;left:-2px;top:-2px;width:1px;height:1px;opacity:.001;pointer-events:none';
    overlay.appendChild(image);

    const promise = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        image.onload = null;
        image.onerror = null;
        if (error) reject(error);
        else resolve(template.url);
      };

      image.onload = () => {
        if (typeof image.decode === 'function') {
          image.decode().then(() => finish()).catch(() => finish());
          return;
        }
        finish();
      };
      image.onerror = () => {
        templateImageCache.delete(template.id);
        image.remove();
        finish(new Error('INTERIOR_IMAGE_NOT_FOUND'));
      };
      image.src = template.url;

      if (image.complete) {
        queueMicrotask(() => {
          if (image.naturalWidth > 0) finish();
        });
      }
    });

    templateImageCache.set(template.id, { image, promise });
    return promise;
  }

  async function loadTemplateImage(template) {
    preloadTemplateImage(template).catch(() => {});

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        interiorImage.onload = null;
        interiorImage.onerror = null;
        if (error) reject(error);
        else resolve(template.url);
      };

      interiorImage.onload = () => finish();
      interiorImage.onerror = () => finish(new Error('INTERIOR_IMAGE_NOT_FOUND'));
      interiorImage.src = template.url;

      if (typeof interiorImage.decode === 'function') {
        interiorImage.decode()
          .then(() => finish())
          .catch(() => {
            if (interiorImage.naturalWidth > 0) finish();
          });
      }

      if (interiorImage.complete) {
        queueMicrotask(() => {
          if (interiorImage.naturalWidth > 0) finish();
          else finish(new Error('INTERIOR_IMAGE_NOT_FOUND'));
        });
      }
    });
  }

  ensureTemplatePreloadLinks();

  // Warm up interiors immediately in the background. Entering a house or
  // hospital then reuses the browser cache instead of starting from zero.
  warmupTimer = window.setTimeout(() => {
    if (destroyed) return;
    Promise.allSettled(Object.values(TEMPLATES).map(preloadTemplateImage));
  }, 40);
  subscribeRemoteCollisionProfiles();
  subscribeRemoteMappedInteriorObjects();
  subscribeRemoteInteriorDoorStates();
  loadRemoteCollisionProfiles({ force: false }).catch((error) => {
    console.warn('[interiors] background collider profiles load failed:', error);
  });
  loadRemoteMappedInteriorObjects({ force: false }).catch((error) => {
    console.warn('[interiors] background mapped objects load failed:', error);
  });
  async function enter(house) {
    const id = houseId(house);
    if (!id) throw new Error('HOUSE_ID_INVALID');

    overlay.hidden = false;
    errorBox.hidden = true;
    scene.hidden = true;
    controls.hidden = true;
    ui.hidden = true;
    showLoading();
    setPaused(true);

    try {
      const data = await getSharedHouseInteriorAccess(id, house);
      if (!data?.allowed) throw new Error(data?.reason || 'INTERIOR_ACCESS_DENIED');

      const template = TEMPLATES[normalizeClass(data.houseClass || house?.payload?.houseClass || house?.variant)];
      await loadTemplateImage(template);

      map.style.backgroundImage = 'none';
      overlay.dataset.template = template.id;
      overlay.dataset.interiorKind = 'house';
      overlay.dataset.houseId = id;
      delete overlay.dataset.serviceId;
      activeTemplateId = template.id;
      colliderToggle.hidden = !isInteriorColliderAdmin();
      objectToggle.hidden = !isInteriorColliderAdmin();
      activeHouse = house;
      activeHouseId = id;
      activeService = null;
      activeServiceId = null;
      activeInteriorKind = 'house';
      activeInteriorDoorInstanceId = createInteriorDoorInstanceId('house', id);
      title.textContent = `Дом · ${data.houseClassLabel || template.label}`;
      meta.textContent = `${template.rooms} комн. · кухня ${template.kitchen} · санузел ${template.bathroom}`;
      refreshHudFromState({
        animateChange: false,
        animateDamage: false,
      });
      position = snapInteriorPosition(template.id, template.spawn);
      stamina = staminaConfig.max;
      sprintLocked = false;
      renderStamina();
      renderPosition();
      renderInteriorObjects();
      Promise.allSettled([
        loadRemoteCollisionProfiles({ force: false }),
        loadRemoteMappedInteriorObjects({ force: false }),
        loadRemoteInteriorDoorStates({
          force: true,
          instanceId: activeInteriorDoorInstanceId,
        }),
      ])
        .then(() => refreshPositionAfterCollisionChange(template.id))
        .catch((error) => console.warn('[interiors] interior profiles refresh failed:', error));
      hideLoading();
      scene.hidden = false;
      layoutInteriorWorld();
      scheduleInteriorWorldLayout();
      controls.hidden = false;
      ui.hidden = false;
      active = true;
      connectInteriorSession();
      refreshDoorInteraction();
      startLoop();
      window.dispatchEvent(new CustomEvent('mn:interior-entered', {
        detail: {
          houseId: id,
          house,
          template: template.id,
          exitSpawn: houseExteriorSpawn(house),
        },
      }));
    } catch (error) {
      const code = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
      console.warn('[interiors] house enter failed:', error);
      if (code.includes('INTERIOR_HOUSE_UNOWNED')) showError('У этого дома пока нет владельца — гостевой интерьер недоступен.');
      else if (code.includes('INTERIOR_IMAGE_NOT_FOUND')) showError('PNG интерьера не найден. Добавьте нужный файл в корень проекта.');
      else showError('Не удалось открыть интерьер. Попробуйте ещё раз через пару секунд.');
    }
  }

  async function enterHospital(hospital) {
    const id = mapObjectId(hospital);
    if (!id) throw new Error('HOSPITAL_ID_INVALID');

    overlay.hidden = false;
    errorBox.hidden = true;
    scene.hidden = true;
    controls.hidden = true;
    ui.hidden = true;
    showLoading();
    setPaused(true);

    try {
      const template = TEMPLATES.hospital;
      await loadTemplateImage(template);

      map.style.backgroundImage = 'none';
      overlay.dataset.template = template.id;
      overlay.dataset.interiorKind = 'hospital';
      overlay.dataset.serviceId = id;
      delete overlay.dataset.houseId;
      activeTemplateId = template.id;
      colliderToggle.hidden = !isInteriorColliderAdmin();
      objectToggle.hidden = !isInteriorColliderAdmin();
      activeHouse = null;
      activeHouseId = null;
      activeService = hospital;
      activeServiceId = id;
      activeInteriorKind = 'hospital';
      activeInteriorDoorInstanceId = createInteriorDoorInstanceId('hospital', id);
      title.textContent = hospital?.name || hospital?.payload?.serviceLabel || 'Больница';
      meta.textContent = 'Палаты · процедурные · стерильная зона';
      refreshHudFromState({
        animateChange: false,
        animateDamage: false,
      });
      position = snapInteriorPosition(template.id, template.spawn);
      stamina = staminaConfig.max;
      sprintLocked = false;
      renderStamina();
      renderPosition();
      renderInteriorObjects();
      Promise.allSettled([
        loadRemoteCollisionProfiles({ force: false }),
        loadRemoteMappedInteriorObjects({ force: false }),
        loadRemoteInteriorDoorStates({
          force: true,
          instanceId: activeInteriorDoorInstanceId,
        }),
      ])
        .then(() => refreshPositionAfterCollisionChange(template.id))
        .catch((error) => console.warn('[interiors] interior profiles refresh failed:', error));
      hideLoading();
      scene.hidden = false;
      layoutInteriorWorld();
      scheduleInteriorWorldLayout();
      controls.hidden = false;
      ui.hidden = false;
      active = true;
      connectInteriorSession();
      refreshDoorInteraction();
      startLoop();
      window.dispatchEvent(new CustomEvent('mn:interior-entered', {
        detail: {
          kind: 'hospital',
          serviceId: id,
          object: hospital,
          hospital,
          template: template.id,
          exitSpawn: houseExteriorSpawn(hospital),
        },
      }));
    } catch (error) {
      const code = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
      console.warn('[interiors] hospital enter failed:', error);
      if (code.includes('INTERIOR_IMAGE_NOT_FOUND')) showError('PNG больницы не найден. Добавьте ambulance_interior.png в корень проекта.');
      else showError('Не удалось открыть больницу. Попробуйте ещё раз через пару секунд.');
    }
  }

  function exit() {
    const exitedKind = activeInteriorKind;
    const exitedHouse = activeHouse;
    const exitedService = activeService;
    const exitedHouseId = overlay.dataset.houseId || activeHouseId || null;
    const exitedServiceId = overlay.dataset.serviceId || activeServiceId || null;
    const exitedObject = exitedKind === 'hospital' ? exitedService : exitedHouse;
    const exitSpawn = exitedObject ? houseExteriorSpawn(exitedObject) : null;

    disconnectInteriorSession();
    if (colliderEditorOpen) closeColliderEditor();
    if (objectEditorOpen) closeObjectEditor();
    active = false;
    activeHouse = null;
    activeHouseId = null;
    activeService = null;
    activeServiceId = null;
    activeInteriorKind = 'house';
    activeTemplateId = 'standard';
    activeInteriorDoorInstanceId = null;
    nearestDoorId = null;
    nearestExitId = null;
    nearestChairId = null;
    doorTogglePending = false;
    seatActionPending = false;
    doorAction.hidden = true;
    cancelAnimationFrame(raf);
    keys.clear();
    joystickVector = { x: 0, y: 0 };
    joystick.dataset.active = 'false';
    staminaBox.dataset.visible = 'false';
    stick.style.transform = 'translate3d(0,0,0)';
    overlay.hidden = true;
    scene.hidden = true;
    controls.hidden = true;
    ui.hidden = true;
    hideLoading();
    errorBox.hidden = true;
    setPaused(false);
    if ((exitedHouseId || exitedServiceId) && exitSpawn) {
      window.dispatchEvent(new CustomEvent('mn:interior-exited', {
        detail: {
          kind: exitedKind,
          houseId: exitedKind === 'house' ? exitedHouseId : null,
          serviceId: exitedKind === 'hospital' ? exitedServiceId : null,
          house: exitedHouse,
          object: exitedObject,
          hospital: exitedService,
          exitSpawn,
          x: exitSpawn.x,
          y: exitSpawn.y,
          angle: exitSpawn.angle,
        },
      }));
    }
    delete overlay.dataset.houseId;
    delete overlay.dataset.serviceId;
    delete overlay.dataset.interiorKind;
  }

  function keyDown(event) {
    if (!active) return;

    const target = event.target;
    const isFormField = Boolean(target?.closest?.('input, textarea, select'));

    if (!isFormField && isInteriorColliderAdmin() && isColliderEditorHotkey(event)) {
      event.preventDefault();
      event.stopPropagation();
      toggleColliderEditor();
      return;
    }

    if (
      !isFormField &&
      isInteriorColliderAdmin() &&
      isObjectEditorHotkey(event)
    ) {
      event.preventDefault();
      event.stopPropagation();
      toggleObjectEditor();
      return;
    }

    if (colliderEditorOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeColliderEditor();
        return;
      }

      if (!isFormField && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        event.stopPropagation();
        deleteSelectedCollider();
        return;
      }

      if (!isFormField) {
        event.preventDefault();
        event.stopPropagation();
      }

      return;
    }

    if (objectEditorOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeObjectEditor();
        return;
      }

      if (!isFormField && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        event.stopPropagation();
        deleteSelectedObject();
        return;
      }

      if (!isFormField && String(event.key || '').toLowerCase() === 'r') {
        event.preventDefault();
        event.stopPropagation();
        rotateSelectedObject();
        return;
      }

      if (!isFormField) {
        event.preventDefault();
        event.stopPropagation();
      }

      return;
    }

    const pressedKey = String(event.key || '').toLowerCase();
    if (pressedKey === 'e' || pressedKey === 'у') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (event.repeat) return;
      activateNearestInteriorInteraction();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    keys.add(String(event.key).toLowerCase());
    event.preventDefault();
  }

  function keyUp(event) {
    if (!active) return;
    keys.delete(String(event.key).toLowerCase());
  }

  function updateJoystick(event) {
    if (event.pointerId !== joystickPointer) return;
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.32;
    const screenDx = event.clientX - cx;
    const screenDy = event.clientY - cy;
    const forceRotated = document.documentElement.classList.contains('mn-force-rotate-landscape') &&
      window.matchMedia?.('(orientation: portrait)')?.matches;
    const screenLength = Math.hypot(screenDx, screenDy);

    if (screenLength <= 0.001) {
      joystickVector = { x: 0, y: 0 };
      stick.style.transform = 'translate3d(0,0,0)';
      return;
    }

    const screenScale = screenLength > max ? max / screenLength : 1;
    const stickX = screenDx * screenScale;
    const stickY = screenDy * screenScale;
    const screenX = screenDx / screenLength;
    const screenY = screenDy / screenLength;
    const power = Math.min(1, screenLength / max);

    joystickVector = forceRotated
      ? { x: screenY * power, y: -screenX * power }
      : { x: screenX * power, y: screenY * power };

    stick.style.transform = `translate3d(${stickX}px,${stickY}px,0)`;
  }

  async function handleHospitalEnterRequest(event) {
    if (destroyed) return;

    const detail = event?.detail || {};
    const hospital = detail.hospital || detail.object;

    if (!hospital) return;

    try {
      await enterHospital(hospital);
    } catch (error) {
      console.warn('[interiors] hospital enter failed:', error);
    }
  }

  joystick.addEventListener('pointerdown', (event) => {
    if (!active) return;
    joystickPointer = event.pointerId;
    joystick.dataset.active = 'true';
    staminaBox.dataset.visible = 'true';
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  joystick.addEventListener('pointermove', updateJoystick);
  const stopJoystick = (event) => {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    joystickVector = { x: 0, y: 0 };
    joystick.dataset.active = 'false';
    staminaBox.dataset.visible = 'false';
    stick.style.transform = 'translate3d(0,0,0)';
  };
  joystick.addEventListener('pointerup', stopJoystick);
  joystick.addEventListener('pointercancel', stopJoystick);
  colliderToggle.addEventListener('click', toggleColliderEditor);
  objectToggle.addEventListener('click', toggleObjectEditor);
  doorAction.addEventListener('click', activateNearestInteriorInteraction);
  objectClose.addEventListener('click', closeObjectEditor);
  objectTypeButtons.forEach((button) => {
    button.addEventListener('click', () => setObjectEditorType(button.dataset.interiorObjectType));
  });
  objectSave.addEventListener('click', () => applyObjectEditorProfile({ persist: true }));
  objectRotate.addEventListener('click', rotateSelectedObject);
  objectDelete.addEventListener('click', deleteSelectedObject);
  objectClear.addEventListener('click', () => {
    if (!objectEditorProfile) return;
    objectEditorProfile.objects = [];
    objectEditorSelectedId = null;
    applyObjectEditorProfile();
    setObjectStatus(`Очищено · ${objectCountsText()}`);
  });
  objectLayer.addEventListener('pointerdown', handleObjectPointerDown);
  objectLayer.addEventListener('pointermove', handleObjectPointerMove);
  objectLayer.addEventListener('pointerup', handleObjectPointerEnd);
  objectLayer.addEventListener('pointercancel', handleObjectPointerEnd);
  colliderClose.addEventListener('click', closeColliderEditor);
  colliderPanelDragHandle.addEventListener('pointerdown', handleColliderPanelPointerDown);
  colliderPanelDragHandle.addEventListener('pointermove', handleColliderPanelPointerMove);
  colliderPanelDragHandle.addEventListener('pointerup', handleColliderPanelPointerEnd);
  colliderPanelDragHandle.addEventListener('pointercancel', handleColliderPanelPointerEnd);
  colliderModeButtons.forEach((button) => {
    button.addEventListener('click', () => setColliderEditorMode(button.dataset.interiorColliderMode));
  });
  colliderSave.addEventListener('click', () => applyColliderEditorProfile({ persist: true }));
  colliderDelete.addEventListener('click', deleteSelectedCollider);
  colliderClear.addEventListener('click', () => {
    const current = normalizeCollisionProfile(colliderEditorProfile, INTERIOR_COLLISION_PROFILES[activeTemplateId]);
    colliderEditorProfile = {
      radius: current.radius,
      bounds: [],
      blocked: [],
      objects: current.objects,
    };
    colliderEditorSelected = null;
    applyColliderEditorProfile();
    renderColliderEditorLayer();
    setColliderStatus(`Очищено · ${editorCountsText()}`);
  });
  colliderReset.addEventListener('click', () => {
    const current = normalizeCollisionProfile(colliderEditorProfile, INTERIOR_COLLISION_PROFILES[activeTemplateId]);
    colliderEditorProfile = {
      ...cloneCollisionProfile(INTERIOR_COLLISION_PROFILES[activeTemplateId]),
      objects: current.objects,
    };
    colliderEditorSelected = null;
    applyColliderEditorProfile({ persist: true });
    renderColliderEditorLayer();
  });
  colliderExport.addEventListener('click', exportColliderProfile);
  colliderImport.addEventListener('click', importColliderProfile);
  colliderLayer.addEventListener('pointerdown', handleColliderPointerDown);
  colliderLayer.addEventListener('pointermove', handleColliderPointerMove);
  colliderLayer.addEventListener('pointerup', handleColliderPointerEnd);
  colliderLayer.addEventListener('pointercancel', handleColliderPointerEnd);
  errorClose.addEventListener('click', exit);
  window.addEventListener('mn:player-balance-changed', handleBalanceChanged);
  window.addEventListener('mn:player-health-changed', handleHealthChanged);
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  window.addEventListener('mn:hospital-enter-request', handleHospitalEnterRequest);
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);
  window.addEventListener('resize', scheduleInteriorWorldLayout);
  window.addEventListener('resize', scheduleColliderPanelLayout);
  window.addEventListener('orientationchange', scheduleInteriorWorldLayout);
  window.addEventListener('orientationchange', scheduleColliderPanelLayout);
  const interiorWorldResizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(scheduleInteriorWorldLayout)
    : null;
  interiorWorldResizeObserver?.observe(scene);
  interiorHudRefreshTimer = window.setInterval(() => {
    if (!active) return;

    refreshHudFromState({
      animateChange: true,
      animateDamage: true,
    });
  }, 2000);

  return {
    enter,
    enterHospital,
    exit,
    cleanup() {
      destroyed = true;
      window.clearTimeout(warmupTimer);
      window.clearTimeout(loadingRevealTimer);
      window.clearTimeout(colliderSaveTimer);
      window.clearTimeout(mappedObjectsReloadTimer);
      window.clearInterval(interiorHudRefreshTimer);
      window.clearTimeout(interiorHealthHitTimer);
      window.cancelAnimationFrame(worldLayoutRaf);
      window.cancelAnimationFrame(colliderPanelLayoutRaf);
      vitalFeedbackTimers.forEach((timer) => window.clearTimeout(timer));
      vitalFeedbackTimers.clear();
      exit();
      window.removeEventListener('mn:player-balance-changed', handleBalanceChanged);
      window.removeEventListener('mn:player-health-changed', handleHealthChanged);
      window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
      window.removeEventListener('mn:hospital-enter-request', handleHospitalEnterRequest);
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('resize', scheduleInteriorWorldLayout);
      window.removeEventListener('resize', scheduleColliderPanelLayout);
      window.removeEventListener('orientationchange', scheduleInteriorWorldLayout);
      window.removeEventListener('orientationchange', scheduleColliderPanelLayout);
      interiorWorldResizeObserver?.disconnect();
      if (collisionProfilesChannel) {
        supabase.removeChannel(collisionProfilesChannel);
        collisionProfilesChannel = null;
      }
      if (mappedObjectsChannel) {
        supabase.removeChannel(mappedObjectsChannel);
        mappedObjectsChannel = null;
      }
      if (doorStatesChannel) {
        supabase.removeChannel(doorStatesChannel);
        doorStatesChannel = null;
      }
      overlay.remove();
    },
  };
}
