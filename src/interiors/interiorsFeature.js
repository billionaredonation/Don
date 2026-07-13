import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import { getStaminaConfig } from '../player/playerStaminaConfig.js';
import standardInteriorUrl from '../../standart_interior.png?url';
import premiumInteriorUrl from '../../premium_interior.png?url';
import luxeInteriorUrl from '../../luxe_interior.png?url';
import './interiors.css';

const INTERIOR_COLLISION_FALLBACK_RADIUS = 0.8;
const INTERIOR_COLLISION_STORAGE_KEY = 'mn-interior-colliders-v1';
const INTERIOR_COLLIDER_MIN_SIZE = 0.7;

function collisionRect(x, y, width, height) {
  return {
    x1: x,
    y1: y,
    x2: x + width,
    y2: y + height,
  };
}

const INTERIOR_COLLISION_PROFILES = {
  standard: {
    radius: 0.8,
    bounds: [
      collisionRect(22.9, 13.1, 40.2, 74.0),
      collisionRect(58.0, 41.9, 19.0, 44.5),
      collisionRect(61.8, 13.6, 14.6, 27.0),
      collisionRect(58.1, 28.0, 5.0, 10.6),
    ],
    blocked: [
      collisionRect(22.9, 27.9, 10.0, 44.2),
      collisionRect(35.3, 55.2, 9.8, 14.7),
      collisionRect(53.3, 57.8, 6.5, 12.0),
      collisionRect(63.9, 51.2, 11.8, 25.2),
      collisionRect(68.2, 77.2, 7.5, 6.8),
      collisionRect(55.6, 13.2, 5.5, 15.4),
      collisionRect(60.4, 13.3, 2.1, 14.9),
      collisionRect(60.4, 37.7, 2.1, 5.1),
      collisionRect(60.7, 40.5, 16.0, 2.4),
      collisionRect(65.2, 14.9, 10.5, 10.8),
      collisionRect(68.2, 27.0, 7.2, 6.1),
      collisionRect(71.3, 35.0, 4.5, 5.6),
    ],
  },

  premium: {
    radius: 0.76,
    bounds: [
      collisionRect(10.6, 10.2, 78.2, 39.8),
      collisionRect(9.9, 43.2, 7.8, 9.4),
      collisionRect(9.7, 53.4, 8.9, 12.0),
      collisionRect(18.0, 60.2, 31.2, 28.5),
      collisionRect(34.9, 50.0, 24.0, 15.6),
      collisionRect(56.6, 50.0, 32.2, 38.7),
    ],
    blocked: [
      collisionRect(10.7, 15.5, 7.1, 24.4),
      collisionRect(24.9, 27.4, 14.4, 9.3),
      collisionRect(40.3, 14.8, 12.0, 11.2),
      collisionRect(58.4, 15.8, 8.6, 21.9),
      collisionRect(71.2, 20.9, 6.7, 15.2),
      collisionRect(72.0, 37.8, 7.2, 7.3),
      collisionRect(83.4, 18.1, 5.4, 21.6),
      collisionRect(45.1, 49.4, 8.8, 2.5),
      collisionRect(60.5, 49.4, 28.3, 2.5),
      collisionRect(27.4, 50.5, 8.6, 10.0),
      collisionRect(9.8, 53.5, 8.7, 11.7),
      collisionRect(19.9, 61.0, 12.7, 14.0),
      collisionRect(20.8, 81.0, 14.3, 7.6),
      collisionRect(36.6, 75.5, 6.1, 9.7),
      collisionRect(43.5, 62.6, 5.6, 20.7),
      collisionRect(61.5, 59.7, 16.4, 17.6),
      collisionRect(76.8, 56.5, 5.0, 4.6),
      collisionRect(76.8, 75.2, 5.0, 4.7),
      collisionRect(50.5, 83.6, 38.4, 5.2),
    ],
  },

  ultra_lux: {
    radius: 0.72,
    bounds: [
      collisionRect(5.2, 8.6, 25.2, 28.4),
      collisionRect(28.6, 28.0, 4.2, 9.5),
      collisionRect(4.4, 38.2, 23.8, 30.2),
      collisionRect(22.0, 43.0, 10.2, 15.0),
      collisionRect(4.6, 69.2, 26.7, 14.7),
      collisionRect(31.0, 8.1, 38.7, 68.2),
      collisionRect(34.5, 73.3, 30.0, 18.0),
      collisionRect(68.6, 28.0, 4.1, 9.8),
      collisionRect(69.6, 8.6, 25.4, 28.4),
      collisionRect(68.6, 40.5, 5.3, 15.0),
      collisionRect(70.0, 38.7, 24.8, 22.0),
      collisionRect(68.4, 69.3, 5.7, 8.4),
      collisionRect(70.0, 68.8, 25.0, 20.8),
    ],
    blocked: [
      collisionRect(8.2, 14.0, 13.4, 15.8),
      collisionRect(5.4, 51.1, 8.1, 11.0),
      collisionRect(4.5, 64.2, 19.8, 5.0),
      collisionRect(5.0, 70.5, 6.1, 12.2),
      collisionRect(14.8, 75.7, 5.4, 7.6),
      collisionRect(22.2, 76.2, 8.8, 7.5),
      collisionRect(5.0, 84.2, 26.4, 6.1),
      collisionRect(29.4, 45.1, 6.1, 24.6),
      collisionRect(40.8, 17.0, 10.6, 20.0),
      collisionRect(49.8, 20.0, 10.6, 15.0),
      collisionRect(49.6, 23.2, 6.8, 8.2),
      collisionRect(53.8, 30.2, 4.7, 5.0),
      collisionRect(42.0, 45.5, 20.0, 10.4),
      collisionRect(43.2, 61.0, 16.8, 9.2),
      collisionRect(40.0, 76.2, 5.0, 10.0),
      collisionRect(47.6, 79.4, 6.5, 6.9),
      collisionRect(65.6, 14.0, 4.7, 24.0),
      collisionRect(78.5, 20.2, 5.7, 10.3),
      collisionRect(88.9, 10.8, 5.7, 25.8),
      collisionRect(70.0, 47.2, 6.4, 13.2),
      collisionRect(81.5, 47.5, 7.0, 10.2),
      collisionRect(90.5, 39.5, 4.2, 20.9),
      collisionRect(70.0, 71.4, 4.3, 16.5),
      collisionRect(79.3, 70.3, 15.2, 12.1),
      collisionRect(71.0, 88.0, 23.4, 4.5),
    ],
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

function cloneCollisionRect(rect) {
  return normalizeCollisionRect(rect);
}

function normalizeCollisionProfile(profile, fallbackProfile = null) {
  const fallback = fallbackProfile || {};
  const radius = Number(profile?.radius ?? fallback.radius ?? INTERIOR_COLLISION_FALLBACK_RADIUS);
  const bounds = (Array.isArray(profile?.bounds) ? profile.bounds : fallback.bounds || [])
    .map(normalizeCollisionRect)
    .filter(Boolean);
  const blocked = (Array.isArray(profile?.blocked) ? profile.blocked : fallback.blocked || [])
    .map(normalizeCollisionRect)
    .filter(Boolean);

  return {
    radius: Number.isFinite(radius) ? Math.max(0.1, Math.min(4, roundPercent(radius))) : INTERIOR_COLLISION_FALLBACK_RADIUS,
    bounds,
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
  const radius = profile.radius || INTERIOR_COLLISION_FALLBACK_RADIUS;
  const safePoint = sanitizeInteriorPosition(point);
  const insideBounds = profile.bounds.some((box) => insideCollisionRect(safePoint, box, radius));

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

function resolveInteriorMovement(templateId, current, delta) {
  const start = snapInteriorPosition(templateId, current);
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
        <button type="button" class="mn-interior-collider-toggle" hidden data-interior-collider-toggle>Коллайдеры</button>
        <section class="mn-interior-collider-panel" hidden data-interior-collider-panel>
          <div class="mn-interior-collider-head">
            <b>Редактор коллайдеров</b>
            <button type="button" data-interior-collider-close>×</button>
          </div>
          <div class="mn-interior-collider-mode">
            <button type="button" data-interior-collider-mode="bounds">Проход</button>
            <button type="button" data-interior-collider-mode="blocked">Блок</button>
          </div>
          <div class="mn-interior-collider-hint">
            Тяни по интерьеру, чтобы создать зону. Зелёное — где можно ходить, красное — стены и мебель.
          </div>
          <div class="mn-interior-collider-actions">
            <button type="button" data-interior-collider-save>Сохранить</button>
            <button type="button" data-interior-collider-delete>Удалить</button>
            <button type="button" data-interior-collider-clear>Очистить</button>
            <button type="button" data-interior-collider-reset>Сброс</button>
          </div>
          <div class="mn-interior-collider-actions">
            <button type="button" data-interior-collider-export>Экспорт</button>
            <button type="button" data-interior-collider-import>Импорт</button>
          </div>
          <textarea data-interior-collider-json spellcheck="false" placeholder="JSON коллайдеров"></textarea>
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

  function setColliderStatus(text) {
    colliderStatus.textContent = text || '';
  }

  function setColliderEditorMode(mode) {
    colliderEditorMode = mode === 'bounds' ? 'bounds' : 'blocked';
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

  function removeRuntimeEditorProfile() {
    const nextProfiles = { ...customCollisionProfiles };
    delete nextProfiles[activeTemplateId];
    customCollisionProfiles = nextProfiles;
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
    const boundsCount = profile?.bounds?.length || 0;
    const blockedCount = profile?.blocked?.length || 0;
    return `${activeTemplateId}: проход ${boundsCount} · блок ${blockedCount}`;
  }

  function renderColliderEditorLayer() {
    if (!colliderEditorOpen || !colliderEditorProfile) {
      colliderLayer.replaceChildren();
      return;
    }

    const fragments = [];
    ['bounds', 'blocked'].forEach((kind) => {
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

    if (persist) {
      const saved = writeStoredCollisionProfiles(customCollisionProfiles);
      setColliderStatus(saved ? `Сохранено · ${editorCountsText(normalized)}` : 'Не удалось сохранить');
      return saved;
    }

    setColliderStatus(`Изменено · ${editorCountsText(normalized)}`);
    return true;
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
      setColliderStatus('Импортировано и сохранено');
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
      const src = template.url;
      loadingText.textContent = `Загружаем ${template.file}`;
      await loadTemplateImage(template);

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
    removeRuntimeEditorProfile();
    writeStoredCollisionProfiles(customCollisionProfiles);
    colliderEditorProfile = editorProfileForCurrentTemplate();
    colliderEditorSelected = null;
    renderColliderEditorLayer();
    setColliderStatus(`Сброшено · ${editorCountsText()}`);
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
      exit();
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      overlay.remove();
    },
  };
}
