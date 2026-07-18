import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import { getStaminaConfig } from '../player/playerStaminaConfig.js';
import { getPlayerVitalsConfig } from '../player/playerStatsConfig.js';
import standardInteriorUrl from '../../standart_interior.png?url';
import premiumInteriorUrl from '../../premium_interior.png?url';
import luxeInteriorUrl from '../../luxe_interior.png?url';
import hospitalInteriorUrl from '../../ambulance_interior.png?url';
import './interiors.css';

const INTERIOR_COLLISION_TABLE = 'interior_collision_profiles';
const INTERIOR_COLLISION_FALLBACK_RADIUS = 0;
const INTERIOR_COLLISION_STORAGE_KEY = 'mn-interior-colliders-v1';
const INTERIOR_COLLIDER_MIN_SIZE = 0.7;
const INTERIOR_DESIGN_ASPECT = 16 / 9;
const INTERIOR_MAPPED_OBJECT_LIMIT = 300;
const INTERIOR_MAPPED_OBJECT_TYPES = Object.freeze({
  bed: Object.freeze({ label: 'Койка' }),
  chair: Object.freeze({ label: 'Стул' }),
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
    state.playerId ||
    state.player?.playerId ||
    state.player?.player_id ||
    savedState?.playerId ||
    savedState?.player?.playerId ||
    savedState?.player?.player_id ||
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
  const rawType = String(object?.type || object?.kind || '').trim().toLowerCase();
  const type = INTERIOR_MAPPED_OBJECT_TYPES[rawType] ? rawType : null;
  if (!type) return null;

  const x = Number(object?.x);
  const y = Number(object?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const rawRotation = Number(object?.rotation ?? object?.angle ?? 0);
  const rotation = Number.isFinite(rawRotation)
    ? ((Math.round(rawRotation) % 360) + 360) % 360
    : 0;
  const fallbackId = `mapped-${type}-${index}-${roundPercent(x)}-${roundPercent(y)}`;
  const id = String(object?.id || fallbackId).trim().slice(0, 96) || fallbackId;

  return {
    id,
    type,
    x: roundPercent(clampPercent(x, 50)),
    y: roundPercent(clampPercent(y, 50)),
    rotation,
  };
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

  try {
    const { data, error } = await supabase.rpc('admin_upsert_interior_collision_profile', {
      p_template_id: templateId,
      p_profile: normalized,
      p_admin_player_id: identity.adminPlayerId,
      p_admin_tg_id: identity.adminTgId,
      p_admin_nickname: identity.adminNickname,
    });

    if (error) throw error;
    if (data?.ok === false) throw new Error(data?.reason || 'admin_upsert_interior_collision_profile_failed');

    const savedProfile = data?.profile || data?.row?.profile || normalized;
    customCollisionProfiles = {
      ...customCollisionProfiles,
      [templateId]: normalizeCollisionProfile(savedProfile, normalized),
    };
    writeStoredCollisionProfiles(customCollisionProfiles);
    return data || { ok: true };
  } catch (rpcError) {
    console.warn('[interiors] collider RPC save failed, trying direct table upsert:', rpcError);
  }

  const row = {
    template_id: templateId,
    profile: normalized,
    updated_by_player_id: identity.adminPlayerId,
    updated_by_tg_id: identity.adminTgId,
    updated_by_nickname: identity.adminNickname,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from(INTERIOR_COLLISION_TABLE)
    .upsert(row, { onConflict: 'template_id' })
    .select('template_id, profile')
    .single();

  if (error) throw error;

  applyRemoteCollisionRow(data || row);
  return { ok: true, row: data || row };
}

function collisionProfileFor(templateId) {
  return customCollisionProfiles[templateId] ||
    INTERIOR_COLLISION_PROFILES[templateId] ||
    INTERIOR_COLLISION_PROFILES.standard;
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

function isInteriorPointWalkable(templateId, point) {
  const profile = collisionProfileFor(templateId);
  const radius = Number(profile.radius ?? INTERIOR_COLLISION_FALLBACK_RADIUS);
  const safePoint = sanitizeInteriorPosition(point);
  const bounds = Array.isArray(profile.bounds) ? profile.bounds : [];
  const insideBounds = bounds.length > 0
    ? bounds.some((box) => insideCollisionRect(safePoint, box, radius))
    : true;

  if (!insideBounds) return false;

  return !profile.blocked.some((box) => hitsCollisionRect(safePoint, box, radius));
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
        <button type="button" class="mn-interior-exit" data-interior-exit>🚪 Выйти из дома</button>
        <button type="button" class="mn-interior-collider-toggle" hidden data-interior-collider-toggle>Стены</button>
        <button type="button" class="mn-interior-object-toggle" hidden data-interior-object-toggle>Объекты</button>
        <section class="mn-interior-collider-panel" hidden data-interior-collider-panel>
          <div class="mn-interior-collider-head">
            <b>Стены интерьера</b>
            <button type="button" data-interior-collider-close>×</button>
          </div>
          <div class="mn-interior-collider-hint">
            Тяни по интерьеру, чтобы нарисовать красную стенку. Игроки не смогут проходить через красное.
            Клик по стенке выбирает её, Delete удаляет.
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
            <b>Объекты больницы</b>
            <button type="button" data-interior-object-close>×</button>
          </div>
          <div class="mn-interior-object-hint">
            Выбери тип и нажми на план, чтобы поставить объект. Готовый объект можно перетащить,
            повернуть или удалить. Пока это только маппинг без игровых свойств.
          </div>
          <div class="mn-interior-object-types">
            <button type="button" data-interior-object-type="bed">Койка</button>
            <button type="button" data-interior-object-type="chair">Стул</button>
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
  const colliderLayer = overlay.querySelector('[data-interior-collider-layer]');
  const colliderToggle = overlay.querySelector('[data-interior-collider-toggle]');
  const colliderPanel = overlay.querySelector('[data-interior-collider-panel]');
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
  const exitButton = overlay.querySelector('[data-interior-exit]');
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
  let objectEditorOpen = false;
  let objectEditorTemplateId = 'hospital';
  let objectEditorType = 'bed';
  let objectEditorProfile = null;
  let objectEditorSelectedId = null;
  let objectEditorPointer = null;
  let objectEditorDraggingId = null;
  let objectEditorDragOffset = null;
  let collisionProfilesChannel = null;
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

    position = snapInteriorPosition(activeTemplateId, position);
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
        setColliderStatus('Локально работает, но в Supabase не сохранилось');
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
    overlay.dataset.colliderEditor = 'enabled';
    document.body.classList.add('mn-interior-collider-editor-open');
    document.documentElement.classList.add('mn-interior-collider-editor-open');
    setColliderEditorMode(colliderEditorMode);
    renderColliderEditorLayer();
  }

  function closeColliderEditor() {
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
    return `Коек ${beds} · стульев ${chairs}`;
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

      element.type = 'button';
      element.tabIndex = -1;
      element.className = `mn-interior-mapped-object mn-interior-mapped-object-${object.type}`;
      element.dataset.interiorObjectId = object.id;
      element.dataset.interiorObjectType = object.type;
      element.dataset.selected = objectEditorOpen && object.id === objectEditorSelectedId ? 'true' : 'false';
      element.style.left = `${object.x}%`;
      element.style.top = `${object.y}%`;
      element.style.transform = `translate(-50%, -50%) rotate(${object.rotation}deg)`;
      element.setAttribute('aria-label', `${meta?.label || object.type} · ${object.rotation}°`);
      fragment.appendChild(element);
    });

    objectLayer.dataset.editor = objectEditorOpen ? 'enabled' : 'disabled';
    objectLayer.replaceChildren(fragment);
    objectRotate.disabled = !objectEditorSelectedId;
    objectDelete.disabled = !objectEditorSelectedId;

    if (objectEditorOpen) setObjectStatus(objectCountsText(profile));
  }

  function applyObjectEditorProfile({ persist = false } = {}) {
    if (!objectEditorProfile) return false;

    objectEditorProfile = normalizeCollisionProfile(
      objectEditorProfile,
      INTERIOR_COLLISION_PROFILES[objectEditorTemplateId]
    );
    setRuntimeEditorProfile(objectEditorProfile, objectEditorTemplateId);
    writeStoredCollisionProfiles(customCollisionProfiles);
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
    writeStoredCollisionProfiles(customCollisionProfiles);
    setObjectStatus(`Сохраняю для всех · ${objectCountsText(profile)}`);

    try {
      await saveRemoteCollisionProfile(objectEditorTemplateId, profile);
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
    if (!active || !isInteriorColliderAdmin() || activeTemplateId !== 'hospital') return;
    if (colliderEditorOpen) closeColliderEditor();

    objectEditorOpen = true;
    objectEditorTemplateId = activeTemplateId;
    objectEditorProfile = editorProfileForCurrentTemplate();
    objectEditorSelectedId = null;
    objectEditorPointer = null;
    objectEditorDraggingId = null;
    objectEditorDragOffset = null;
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

    if (objectButton) {
      const objectId = String(objectButton.dataset.interiorObjectId || '');
      const object = objectEditorProfile.objects.find((item) => item.id === objectId);
      if (!object) return;

      objectEditorSelectedId = objectId;
      objectEditorPointer = event.pointerId;
      objectEditorDraggingId = objectId;
      objectEditorDragOffset = {
        x: point.x - object.x,
        y: point.y - object.y,
      };
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
    };
    objectEditorProfile.objects.push(object);
    objectEditorSelectedId = object.id;
    applyObjectEditorProfile();
  }

  function handleObjectPointerMove(event) {
    if (!objectEditorOpen || event.pointerId !== objectEditorPointer || !objectEditorDraggingId) return;

    event.preventDefault();
    event.stopPropagation();

    const point = interiorLayerPoint(event, objectLayer);
    const object = objectEditorProfile?.objects?.find((item) => item.id === objectEditorDraggingId);
    if (!object) return;

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
    if (colliderEditorOpen || objectEditorOpen) return { x: 0, y: 0 };

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
    active = false;
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
  loadRemoteCollisionProfiles({ force: false }).catch((error) => {
    console.warn('[interiors] background collider profiles load failed:', error);
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
      const { data, error } = await supabase.rpc('get_house_interior_access', {
        p_house_id: id,
        p_tg_id: playerTgId(),
      });
      if (error) throw error;
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
      objectToggle.hidden = true;
      activeHouse = house;
      activeHouseId = id;
      activeService = null;
      activeServiceId = null;
      activeInteriorKind = 'house';
      title.textContent = `Дом · ${data.houseClassLabel || template.label}`;
      meta.textContent = `${template.rooms} комн. · кухня ${template.kitchen} · санузел ${template.bathroom}`;
      exitButton.textContent = '🚪 Выйти из дома';
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
      loadRemoteCollisionProfiles({ force: false })
        .then(() => refreshPositionAfterCollisionChange(template.id))
        .catch((error) => console.warn('[interiors] collider profiles refresh failed:', error));
      hideLoading();
      scene.hidden = false;
      layoutInteriorWorld();
      scheduleInteriorWorldLayout();
      controls.hidden = false;
      ui.hidden = false;
      active = true;
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
      if (code.includes('INTERIOR_NOT_OWNER')) showError('Вход доступен только владельцу дома.');
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
      title.textContent = hospital?.name || hospital?.payload?.serviceLabel || 'Больница';
      meta.textContent = 'Палаты · процедурные · стерильная зона';
      exitButton.textContent = '🚪 Выйти из больницы';
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
      loadRemoteCollisionProfiles({ force: false })
        .then(() => refreshPositionAfterCollisionChange(template.id))
        .catch((error) => console.warn('[interiors] collider profiles refresh failed:', error));
      hideLoading();
      scene.hidden = false;
      layoutInteriorWorld();
      scheduleInteriorWorldLayout();
      controls.hidden = false;
      ui.hidden = false;
      active = true;
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

    if (colliderEditorOpen) closeColliderEditor();
    if (objectEditorOpen) closeObjectEditor();
    active = false;
    activeHouse = null;
    activeHouseId = null;
    activeService = null;
    activeServiceId = null;
    activeInteriorKind = 'house';
    activeTemplateId = 'standard';
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
      activeTemplateId === 'hospital' &&
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

    if (event.key === 'Escape' || String(event.key).toLowerCase() === 'e' || String(event.key).toLowerCase() === 'у') {
      event.preventDefault(); exit(); return;
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
  exitButton.addEventListener('click', exit);
  errorClose.addEventListener('click', exit);
  window.addEventListener('mn:player-balance-changed', handleBalanceChanged);
  window.addEventListener('mn:player-health-changed', handleHealthChanged);
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  window.addEventListener('mn:hospital-enter-request', handleHospitalEnterRequest);
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);
  window.addEventListener('resize', scheduleInteriorWorldLayout);
  window.addEventListener('orientationchange', scheduleInteriorWorldLayout);
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
      window.clearInterval(interiorHudRefreshTimer);
      window.clearTimeout(interiorHealthHitTimer);
      window.cancelAnimationFrame(worldLayoutRaf);
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
      window.removeEventListener('orientationchange', scheduleInteriorWorldLayout);
      interiorWorldResizeObserver?.disconnect();
      if (collisionProfilesChannel) {
        supabase.removeChannel(collisionProfilesChannel);
        collisionProfilesChannel = null;
      }
      overlay.remove();
    },
  };
}
