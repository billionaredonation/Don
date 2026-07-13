import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import { getStaminaConfig } from '../player/playerStaminaConfig.js';
import standardInteriorUrl from '../../standart_interior.png?url';
import premiumInteriorUrl from '../../premium_interior.png?url';
import luxeInteriorUrl from '../../luxe_interior.png?url';
import './interiors.css';

const INTERIOR_COLLISION_TABLE = 'interior_collision_profiles';
const INTERIOR_COLLISION_FALLBACK_RADIUS = 0;
const INTERIOR_COLLISION_STORAGE_KEY = 'mn-interior-colliders-v1';
const INTERIOR_COLLIDER_MIN_SIZE = 0.7;

const INTERIOR_COLLISION_PROFILES = {
  standard: {
    radius: 0,
    bounds: [],
    blocked: [],
  },

  premium: {
    radius: 0,
    bounds: [],
    blocked: [],
  },

  ultra_lux: {
    radius: 0,
    bounds: [],
    blocked: [],
  },
};

const TEMPLATES = {
  standard: { id: 'standard', label: 'Стандарт', file: 'standart_interior.png', url: standardInteriorUrl, rooms: 1, kitchen: 1, bathroom: 1, spawn: { x: 50, y: 82 } },
  premium: { id: 'premium', label: 'Премиум', file: 'premium_interior.png', url: premiumInteriorUrl, rooms: 2, kitchen: 2, bathroom: 2, spawn: { x: 58, y: 82 } },
  ultra_lux: { id: 'ultra_lux', label: 'Ультра-люкс', file: 'luxe_interior.png', url: luxeInteriorUrl, rooms: 4, kitchen: 3, bathroom: 3, spawn: { x: 50, y: 90 } },
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

function formatMoney(value) {
  const amount = Math.max(0, Math.round(Number(value || 0)));
  return `${amount.toLocaleString('ru-RU')} ₴`;
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

function normalizeCollisionProfile(profile, fallbackProfile = null) {
  const fallback = fallbackProfile || {};
  const radius = Number(profile?.radius ?? fallback.radius ?? INTERIOR_COLLISION_FALLBACK_RADIUS);
  const blocked = (Array.isArray(profile?.blocked) ? profile.blocked : fallback.blocked || [])
    .map(normalizeCollisionRect)
    .filter(Boolean);

  return {
    radius: Number.isFinite(radius) ? Math.max(0, Math.min(4, roundPercent(radius))) : INTERIOR_COLLISION_FALLBACK_RADIUS,
    bounds: [],
    blocked,
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
      version: 1,
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

  const profile = normalizeCollisionProfile(row?.profile || row, INTERIOR_COLLISION_PROFILES[templateId]);
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
        nextProfiles[templateId] = normalizeCollisionProfile(row.profile, INTERIOR_COLLISION_PROFILES[templateId]);
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
      [templateId]: normalizeCollisionProfile(savedProfile, INTERIOR_COLLISION_PROFILES[templateId]),
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
    x: hasExplicitExit ? baseX : clampPercent(baseX + 1.15, baseX),
    y: hasExplicitExit ? baseY : clampPercent(baseY + 1.25, baseY),
    angle: Number.isFinite(angle) ? angle : 0,
  };
}

function markup() {
  return `
    <div class="mn-interior" hidden data-mn-interior>
      <div class="mn-interior-loading" data-interior-loading>
        <span class="mn-interior-spinner"></span>
        <strong>Загрузка интерьера…</strong>
        <small data-interior-loading-text>Подготавливаем помещение</small>
      </div>
      <main class="mn-interior-scene" hidden data-interior-scene>
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
        <div class="mn-interior-collider-layer" hidden data-interior-collider-layer></div>
        <div class="mn-interior-player" data-interior-player><i></i><span>${String(state.nickname || 'Игрок')}</span></div>
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
        <div class="mn-interior-hud">
          <div class="mn-interior-info">
            <b data-interior-title>Интерьер</b>
            <span data-interior-meta></span>
          </div>
          <div class="mn-interior-profile">
            <i>${String(state.nickname || 'И').charAt(0).toUpperCase()}</i>
            <span><b>${String(state.nickname || 'Игрок')}</b><small>Внутри дома</small></span>
          </div>
          <div class="mn-interior-balance">
            <i>₴</i><b data-interior-balance>${formatMoney(state.player?.balance)}</b>
          </div>
        </div>
      </div>
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
  const map = overlay.querySelector('[data-interior-map]');
  const interiorImage = overlay.querySelector('[data-interior-image]');
  const marker = overlay.querySelector('[data-interior-player]');
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
  let lastFrame = 0;
  let position = { x: 50, y: 82 };
  let activeTemplateId = 'standard';
  let activeHouse = null;
  let activeHouseId = null;
  let colliderEditorOpen = false;
  let colliderEditorMode = 'blocked';
  let colliderEditorProfile = null;
  let colliderEditorSelected = null;
  let colliderEditorPointer = null;
  let colliderEditorStart = null;
  let colliderEditorDraft = null;
  let colliderSaveTimer = 0;
  let colliderSaveSequence = 0;
  let collisionProfilesChannel = null;
  let joystickVector = { x: 0, y: 0 };
  let joystickPointer = null;
  const staminaConfig = getStaminaConfig();
  let stamina = staminaConfig.max;
  let sprintLocked = false;
  let warmupTimer = 0;
  const keys = new Set();
  const templateImageCache = new Map();

  function setPaused(value) {
    window.__MN_INTERIOR_ACTIVE__ = value;
    document.body.classList.toggle('mn-interior-open', value);
    document.documentElement.classList.toggle('mn-interior-open', value);
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

  function refreshPositionAfterCollisionChange(templateId) {
    if (!active || templateId !== activeTemplateId || colliderEditorOpen) return;

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
      if (!colliderEditorOpen) {
        refreshPositionAfterCollisionChange(templateId);
      } else if (!colliderEditorPointer) {
        setColliderStatus('Сервер обновил стены');
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

  function setRuntimeEditorProfile(profile) {
    customCollisionProfiles = {
      ...customCollisionProfiles,
      [activeTemplateId]: normalizeCollisionProfile(profile, INTERIOR_COLLISION_PROFILES[activeTemplateId]),
    };
  }

  function colliderLayerPoint(event) {
    const rect = colliderLayer.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;

    return {
      x: clampPercent(x, 0),
      y: clampPercent(y, 0),
    };
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

  function exportColliderProfile() {
    const profile = normalizeCollisionProfile(
      colliderEditorProfile || collisionProfileFor(activeTemplateId),
      INTERIOR_COLLISION_PROFILES[activeTemplateId]
    );
    const payload = {
      version: 1,
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
            nextProfiles[templateId] = normalizeCollisionProfile(sourceProfiles[templateId], INTERIOR_COLLISION_PROFILES[templateId]);
          }
        });
        customCollisionProfiles = nextProfiles;
        colliderEditorProfile = editorProfileForCurrentTemplate();
      } else {
        const templateId = parsed?.template && TEMPLATES[parsed.template] ? parsed.template : activeTemplateId;
        const sourceProfile = parsed?.profile || parsed;
        const normalized = normalizeCollisionProfile(sourceProfile, INTERIOR_COLLISION_PROFILES[templateId]);
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
    if (colliderEditorOpen) return { x: 0, y: 0 };

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

  function showError(text) {
    active = false;
    activeHouse = null;
    activeHouseId = null;
    activeTemplateId = 'standard';
    if (colliderEditorOpen) closeColliderEditor();
    loading.hidden = true;
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
    image.dataset.interiorPreload = template.id;
    image.style.cssText = 'position:fixed;left:-2px;top:-2px;width:1px;height:1px;opacity:.001;pointer-events:none';
    overlay.appendChild(image);

    const promise = new Promise((resolve, reject) => {
      image.onload = () => resolve(template.url);
      image.onerror = () => {
        templateImageCache.delete(template.id);
        image.remove();
        reject(new Error('INTERIOR_IMAGE_NOT_FOUND'));
      };
      image.src = template.url;

      if (image.complete) {
        queueMicrotask(() => {
          if (image.naturalWidth > 0) resolve(template.url);
        });
      }
    });

    templateImageCache.set(template.id, { image, promise });
    return promise;
  }

  async function loadTemplateImage(template) {
    await preloadTemplateImage(template);

    return new Promise((resolve, reject) => {
      const finish = (error = null) => {
        interiorImage.onload = null;
        interiorImage.onerror = null;
        if (error) reject(error);
        else resolve(template.url);
      };

      interiorImage.onload = () => finish();
      interiorImage.onerror = () => finish(new Error('INTERIOR_IMAGE_NOT_FOUND'));
      interiorImage.src = template.url;

      if (interiorImage.complete) {
        queueMicrotask(() => {
          if (interiorImage.naturalWidth > 0) finish();
          else finish(new Error('INTERIOR_IMAGE_NOT_FOUND'));
        });
      }
    });
  }

  // Warm up Standard, Premium and Ultra-Lux in parallel once the city screen
  // has settled. Entering any house then reuses the browser cache immediately.
  warmupTimer = window.setTimeout(() => {
    if (destroyed) return;
    Promise.allSettled(Object.values(TEMPLATES).map(preloadTemplateImage));
  }, 900);
  subscribeRemoteCollisionProfiles();

  async function enter(house) {
    const id = houseId(house);
    if (!id) throw new Error('HOUSE_ID_INVALID');

    overlay.hidden = false;
    errorBox.hidden = true;
    scene.hidden = true;
    controls.hidden = true;
    ui.hidden = true;
    loading.hidden = false;
    loadingText.textContent = 'Проверяем доступ к дому';
    setPaused(true);

    try {
      const { data, error } = await supabase.rpc('get_house_interior_access', {
        p_house_id: id,
        p_tg_id: playerTgId(),
      });
      if (error) throw error;
      if (!data?.allowed) throw new Error(data?.reason || 'INTERIOR_ACCESS_DENIED');

      const template = TEMPLATES[normalizeClass(data.houseClass || house?.payload?.houseClass || house?.variant)];
      loadingText.textContent = `Загружаем ${template.file}`;
      await loadTemplateImage(template);
      loadingText.textContent = 'Загружаем стены интерьера';
      await loadRemoteCollisionProfiles({ force: true });

      map.style.backgroundImage = 'none';
      overlay.dataset.template = template.id;
      overlay.dataset.houseId = id;
      activeTemplateId = template.id;
      colliderToggle.hidden = !isInteriorColliderAdmin();
      activeHouse = house;
      activeHouseId = id;
      title.textContent = `Дом · ${data.houseClassLabel || template.label}`;
      meta.textContent = `${template.rooms} комн. · кухня ${template.kitchen} · санузел ${template.bathroom}`;
      balance.textContent = formatMoney(state.player?.balance);
      position = snapInteriorPosition(template.id, template.spawn);
      stamina = staminaConfig.max;
      sprintLocked = false;
      renderStamina();
      renderPosition();
      loading.hidden = true;
      scene.hidden = false;
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
      if (code.includes('INTERIOR_NOT_OWNER')) showError('Вход доступен только владельцу дома.');
      else if (code.includes('INTERIOR_IMAGE_NOT_FOUND')) showError('PNG интерьера не найден. Добавьте нужный файл в корень проекта.');
      else showError(`Не удалось открыть интерьер: ${code || 'неизвестная ошибка'}`);
    }
  }

  function exit() {
    const exitedHouse = activeHouse;
    const exitedHouseId = overlay.dataset.houseId || activeHouseId || null;
    const exitSpawn = exitedHouse ? houseExteriorSpawn(exitedHouse) : null;

    if (colliderEditorOpen) closeColliderEditor();
    active = false;
    activeHouse = null;
    activeHouseId = null;
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
    loading.hidden = false;
    errorBox.hidden = true;
    setPaused(false);
    if (exitedHouseId && exitSpawn) {
      window.dispatchEvent(new CustomEvent('mn:interior-exited', {
        detail: {
          houseId: exitedHouseId,
          house: exitedHouse,
          exitSpawn,
          x: exitSpawn.x,
          y: exitSpawn.y,
          angle: exitSpawn.angle,
        },
      }));
    }
    delete overlay.dataset.houseId;
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
    };
    colliderEditorSelected = null;
    applyColliderEditorProfile();
    renderColliderEditorLayer();
    setColliderStatus(`Очищено · ${editorCountsText()}`);
  });
  colliderReset.addEventListener('click', () => {
    colliderEditorProfile = cloneCollisionProfile(INTERIOR_COLLISION_PROFILES[activeTemplateId]);
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
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);

  return {
    enter,
    exit,
    cleanup() {
      destroyed = true;
      window.clearTimeout(warmupTimer);
      window.clearTimeout(colliderSaveTimer);
      exit();
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      if (collisionProfilesChannel) {
        supabase.removeChannel(collisionProfilesChannel);
        collisionProfilesChannel = null;
      }
      overlay.remove();
    },
  };
}
