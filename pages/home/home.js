import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { supabase } from '../../src/supabaseClient.js';
import { getPlayer } from '../../src/api/playerApi.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';
import { getCityWeather } from '../../src/weather/weather.js';
import { setupSessionGuard } from '../../src/network/sessionGuard.js';
import { setupGameRealtime } from '../../src/realtime/gameRealtime.js';

import {
  getLocalPlayerId,
  getOrCreatePlayerPosition,
  getCityPlayers,
  setPlayerOffline,
  updatePlayerPosition,
} from '../../src/player/playerPosition.js';

import { setupMobileControlPrompt } from '../../src/controls/mobileControlPrompt.js';

import { enableMapControls, isLowPowerDevice } from '../../src/controls/mapControls.js';
import { getStreetCameraStartScale } from '../../src/config/cameraTuning.js';
import { enableKeyboardPlayerMovement } from '../../src/controls/keyboardMovement.js';
import { enableMobileJoystick } from '../../src/controls/mobileJoystick.js';

import { setupPlayerNetwork } from '../../src/network/playerNetwork.js';
import { renderPlayersHtml } from '../../src/player/playerMarkerView.js';
import { enableFogOfWar } from '../../src/map/fogOfWar.js';

import { enableAdminPanel } from '../../src/admin/adminPanel.js';
import { isCurrentPlayerAdmin } from '../../src/admin/adminAccess.js';

import {
  createEntityInteractionPanel,
  enableEntityInteraction,
} from '../../src/entities/entityInteraction.js';

import { enableHousesFeature } from '../../src/houses/housesFeature.js';
import { enableInventoryFeature } from '../../src/inventory/inventoryFeature.js';
import { enableHospitalManagementFeature } from '../../src/hospital/hospitalManagementFeature.js';
import { enablePlayerInteractionFeature } from '../../src/player/playerInteractionFeature.js';
import { enablePlayerStatusEffects } from '../../src/player/playerStatusEffects.js';
import { enablePlayerSurvivalFeature } from '../../src/player/playerSurvivalFeature.js';
import {
  enablePlayerKnockoutFeature,
  HOSPITAL_EXIT_HEALTH,
  loadPlayerKnockoutState,
} from '../../src/player/playerKnockoutFeature.js';
import { enableMobileGameplayChrome } from '../../src/ui/mobileGameplayChrome.js';
import {
  fetchPlayerOwnedHouses,
  PLAYER_HOUSE_SLOT_LIMIT,
} from '../../src/houses/housesRepository.js';
import { getPlayerVitalsConfig } from '../../src/player/playerStatsConfig.js';

import '../../src/admin/adminPanel.css';
import '../../src/houses/houses.css';
import '../../src/styles/modal-responsive-final.css';
import '../../src/player/playerInteractionRadial.css';
import '../../src/styles/mobileGameplayChrome.css';

const MOBILE_CONTROLS_KEY = 'mn-mobile-controls-enabled';

const BALANCE_COUNT_DURATION_MS = 1650;
const BALANCE_FEEDBACK_DURATION_MS = 1900;
const BALANCE_PULSE_DURATION_MS = 1250;
const PLAYER_VITALS_CONFIG = getPlayerVitalsConfig();
const PLAYER_HEALTH_LOW_CLASS = 'is-player-health-low';
const PLAYER_HEALTH_HIT_CLASS = 'is-player-health-hit';
const PLAYER_HEALTH_HIT_DURATION_MS = 620;
const PLAYER_VITAL_FEEDBACK_DURATION_MS = 520;

function formatFullMoney(value) {
  const number = Math.round(Number(value || 0));

  if (!Number.isFinite(number) || number <= 0) {
    return '0 ₴';
  }

  return `${number.toLocaleString('ru-RU')} ₴`;
}

function formatCompactMoneyValue(number, divider, maximumFractionDigits) {
  const factor = 10 ** maximumFractionDigits;
  const compact = Math.floor((number / divider) * factor) / factor;

  return compact.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function formatHudMoney(value) {
  // HUD показывает реальную сумму полностью. Без “млн”, без сокращений.
  return formatFullMoney(value);
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

const PLAYER_VITAL_FIELD_ALIASES = Object.freeze({
  health: ['health', 'hp', 'healthPoints', 'health_points'],
  food: ['food', 'hunger', 'satiety'],
  water: ['water', 'thirst', 'hydration'],
});

function getPlayerVitalValue(player = state.player, key = 'health') {
  const config = PLAYER_VITALS_CONFIG[key] || {};
  const aliases = PLAYER_VITAL_FIELD_ALIASES[key] || [key];

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
  const aliases = PLAYER_VITAL_FIELD_ALIASES[key] || [key];

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
  const config = PLAYER_VITALS_CONFIG[key] || {};
  const max = Number.isFinite(Number(config.max)) ? Number(config.max) : 100;
  const fill = max > 0 ? (clampVitalValue(value, config) / max) * 100 : 0;

  return `--mn-vital-fill: ${Math.round(fill)}%`;
}

const MAP_FILES = import.meta.glob('../../*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const CITY_MAP_RATIOS = {
  vinnytsia: 1,
  lutsk: 1,
  luhansk: 1,
  dnipro: 1,
  donetsk: 1,
  zhytomyr: 1,
  uzhhorod: 1,
  zaporizhzhia: 0.632213,
  'ivano-frankivsk': 1,
  kyiv: 1,
  kropyvnytskyi: 1,
  crimea: 1,
  lviv: 1,
  mykolaiv: 1,
  odesa: 0.75,
  poltava: 0.615385,
  rivne: 0.666667,
  sumy: 0.666667,
  ternopil: 0.666667,
  kharkiv: 0.666667,
  kherson: 0.666667,
  khmelnytskyi: 0.666667,
  cherkasy: 0.666667,
  chernihiv: 0.666667,
  chernivtsi: 0.666667,
};

function isTruthyAdmin(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCurrentHousePlayerTgId() {
  return String(
    state.telegramId ||
      state.player?.tg_id ||
      state.player?.telegramId ||
      window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
      ''
  ).trim();
}

function clampPercent(value, fallback = 50) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(100, Math.max(0, number));
}

function getHouseSpawnPoint(house = {}) {
  const payload = house?.payload || {};
  const x = clampPercent(house.x ?? payload.x, 50);
  const y = clampPercent(house.y ?? payload.y, 50);
  const angle = Number(house.rotation ?? payload.rotation ?? 0);

  return {
    x,
    y,
    angle: Number.isFinite(angle) ? angle : 0,
  };
}

function getHouseNumberLabel(house = {}) {
  const payload = house?.payload || {};
  const raw =
    payload.houseNumber ||
    payload.house_number ||
    payload.shortId ||
    payload.houseId ||
    payload.house_id ||
    house.id ||
    house.mapObjectId ||
    '';

  const text = String(raw || '').trim();

  return text ? `№ ${text.slice(-6).toUpperCase()}` : 'Дом';
}

function getHouseClassLabel(house = {}) {
  const payload = house?.payload || {};
  const raw = String(house.class || payload.houseClass || house.variant || 'standard').toLowerCase();

  if (raw.includes('premium') || raw.includes('премиум')) return 'Премиум';
  if (raw.includes('lux') || raw.includes('vip') || raw.includes('люкс')) return 'Люкс';

  return 'Стандарт';
}

function renderHouseSpawnPickerHtml({ houses, cityName }) {
  const occupiedCount = Math.min(houses.length, PLAYER_HOUSE_SLOT_LIMIT);
  const cityLabel = escapeHtml(cityName || 'Город');
  const slotCards = Array.from({ length: PLAYER_HOUSE_SLOT_LIMIT }, (_, index) => {
    const house = houses[index];

    if (!house) {
      return `
        <div class="house-spawn-option house-spawn-option-empty" aria-disabled="true">
          <span class="house-spawn-slot-badge">Слот ${index + 1}</span>
          <span class="house-spawn-option-icon">＋</span>
          <span class="house-spawn-option-main">
            <b>Свободный слот</b>
            <small>Можно занять ещё одним домом</small>
          </span>
          <span class="house-spawn-option-state">Пусто</span>
        </div>
      `;
    }

    const spawn = getHouseSpawnPoint(house);

    return `
      <button type="button" class="house-spawn-option" data-house-spawn-index="${index}">
        <span class="house-spawn-slot-badge">Слот ${index + 1}</span>
        <span class="house-spawn-option-icon">🏠</span>
        <span class="house-spawn-option-main">
          <b>${escapeHtml(getHouseNumberLabel(house))} · ${escapeHtml(getHouseClassLabel(house))}</b>
          <small>${cityLabel} · вход у двери X ${spawn.x.toFixed(1)} / Y ${spawn.y.toFixed(1)}</small>
        </span>
        <span class="house-spawn-option-cta">Войти</span>
      </button>
    `;
  }).join('');

  return `
    <div class="house-spawn-picker" data-house-spawn-picker role="dialog" aria-modal="true">
      <div class="house-spawn-backdrop" data-house-spawn-stay></div>
      <section class="house-spawn-card">
        <div class="house-spawn-hero">
          <span class="house-spawn-kicker">CEF · недвижимость</span>
          <h3>Выбор точки входа</h3>
          <p>Найдено ${occupiedCount}/${PLAYER_HOUSE_SLOT_LIMIT} слота домов в городе ${cityLabel}. Выбери дом — появление сразу откроет его интерьер.</p>
          <div class="house-spawn-stats" aria-label="Статус недвижимости">
            <span><b>${occupiedCount}</b><small>домов</small></span>
            <span><b>${PLAYER_HOUSE_SLOT_LIMIT - occupiedCount}</b><small>свободно</small></span>
            <span><b>${cityLabel}</b><small>город</small></span>
          </div>
        </div>
        <div class="house-spawn-progress" aria-hidden="true">
          <i style="width:${Math.round((occupiedCount / PLAYER_HOUSE_SLOT_LIMIT) * 100)}%"></i>
        </div>
        <div class="house-spawn-list">
          ${slotCards}
        </div>
        <div class="house-spawn-actions">
          <button type="button" data-house-spawn-stay>Остаться в городе</button>
        </div>
      </section>
    </div>
  `;
}

function setupHouseSpawnPicker({
  root,
  cityId,
  city,
  playerPosition,
  nickname,
  mapControls,
  movementChannel,
  onGameplayEntered,
} = {}) {
  const playerTgId = getCurrentHousePlayerTgId();

  if (!root || !cityId || !playerTgId) return () => {};
  if (window.__MN_PLAYER_CONTROLS_LOCKED__ === true) return () => {};

  let disposed = false;
  let overlay = null;
  let ownedHouses = [];
  let pendingHouseEntry = false;

  function completeGameplayEntry(source) {
    if (disposed) return;
    onGameplayEntered?.(source);
  }

  function setPickerGate(open) {
    const isOpen = Boolean(open);

    window.__MN_HOUSE_SPAWN_PICKER_ACTIVE__ = isOpen;
    document.body?.classList.toggle('mn-house-spawn-open', isOpen);
    document.documentElement?.classList.toggle('mn-house-spawn-open', isOpen);

    window.dispatchEvent(new CustomEvent(
      isOpen ? 'mn:house-spawn-picker-opened' : 'mn:house-spawn-picker-closed',
      { detail: { cityId, source: 'house_spawn_picker' } }
    ));

    if (isOpen) {
      window.__MN_MOBILE_PLAYER_MOVING__ = false;
      window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ = performance.now() + 800;
    }
  }

  function close() {
    overlay?.remove();
    overlay = null;
    setPickerGate(false);
  }

  function enterHouseFromPicker(house) {
    if (!house) return;

    pendingHouseEntry = true;
    close();

    window.dispatchEvent(new CustomEvent('mn:house-spawn-enter-request', {
      detail: {
        house,
        houseId: house.id || house.mapObjectId || house.objectId || house?.payload?.houseId || null,
        cityId,
        playerId: getLocalPlayerId(),
        nickname,
        source: 'house_spawn_picker',
      },
    }));
  }

  function handleInteriorEntered() {
    if (!pendingHouseEntry) return;
    pendingHouseEntry = false;
    completeGameplayEntry('house_spawn');
  }

  function handleClick(event) {
    const option = event.target?.closest?.('[data-house-spawn-index]');

    if (option) {
      event.preventDefault();
      event.stopPropagation();
      enterHouseFromPicker(ownedHouses[Number(option.dataset.houseSpawnIndex)]);
      return;
    }

    if (event.target?.closest?.('[data-house-spawn-stay]')) {
      event.preventDefault();
      event.stopPropagation();
      close();
      completeGameplayEntry('city_spawn');
    }
  }

  function handleKeyDown(event) {
    if (!overlay) return;

    const key = String(event.key || '').toLowerCase();

    if (event.code === 'Escape' || event.code === 'KeyN' || key === 'n' || key === 'т') {
      event.preventDefault();
      event.stopPropagation();
      close();
      completeGameplayEntry('city_spawn');
      return;
    }

    if (event.code === 'Enter' || event.code === 'KeyY' || key === 'y' || key === 'н') {
      event.preventDefault();
      event.stopPropagation();
      enterHouseFromPicker(ownedHouses[0]);
    }
  }

  async function openSpawnDestination() {
    try {
      const medical = await loadPlayerKnockoutState();
      const health = Number(medical?.health);
      const knockState = String(medical?.knockState || medical?.knock_state || 'conscious');

      if (
        (Number.isFinite(health) && health < HOSPITAL_EXIT_HEALTH) ||
        knockState === 'countdown' ||
        knockState === 'hospitalized'
      ) {
        completeGameplayEntry('hospital_reconnect');
        return;
      }
    } catch (error) {
      console.warn('[home] medical check before spawn picker failed:', error);

      const localHealth = Number(playerPosition?.health ?? state.player?.health);
      if (Number.isFinite(localHealth) && localHealth < HOSPITAL_EXIT_HEALTH) {
        completeGameplayEntry('hospital_reconnect_local');
        return;
      }
    }

    const houses = await fetchPlayerOwnedHouses({ playerId: playerTgId, cityId });

      if (disposed || root.dataset.destroyed === 'true') return;

      ownedHouses = Array.isArray(houses) ? houses.slice(0, PLAYER_HOUSE_SLOT_LIMIT) : [];

      if (!ownedHouses.length) {
        completeGameplayEntry('city_spawn_no_houses');
        return;
      }

      root.insertAdjacentHTML('beforeend', renderHouseSpawnPickerHtml({
        houses: ownedHouses,
        cityName: city?.name || cityId,
      }));

      overlay = root.querySelector('[data-house-spawn-picker]');
      if (!overlay) {
        completeGameplayEntry('city_spawn_picker_unavailable');
        return;
      }
      overlay?.addEventListener('click', handleClick);
      window.addEventListener('keydown', handleKeyDown, true);
      setPickerGate(true);
  }

  openSpawnDestination().catch((error) => {
      console.warn('[home] house spawn picker failed:', error);
      completeGameplayEntry('city_spawn_picker_failed');
    });

  window.addEventListener('mn:interior-entered', handleInteriorEntered);

  return () => {
    disposed = true;
    overlay?.removeEventListener('click', handleClick);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('mn:interior-entered', handleInteriorEntered);
    close();
  };
}

function getInteriorExitPoint(detail = {}) {
  const exitSpawn = detail.exitSpawn || {};
  const fallback = getHouseSpawnPoint(detail.house || {});
  const rawX = exitSpawn.x ?? detail.x ?? fallback.x;
  const rawY = exitSpawn.y ?? detail.y ?? fallback.y;
  const rawAngle = exitSpawn.angle ?? detail.angle ?? fallback.angle;
  const angle = Number(rawAngle);

  return {
    x: clampPercent(rawX, fallback.x),
    y: clampPercent(rawY, fallback.y),
    angle: Number.isFinite(angle) ? angle : 0,
  };
}

function setupInteriorExitReturn({
  root,
  cityId,
  nickname,
  playerPosition,
  mapControls,
  movementChannel,
} = {}) {
  if (!root || !playerPosition) return () => {};

  function handleInteriorEntered(event) {
    if (root.dataset.destroyed === 'true') return;

    const detail = event?.detail || {};
    const updatedAt = new Date().toISOString();
    const playerId = getLocalPlayerId();
    const offlinePacket = {
      playerId,
      nickname,
      cityId,
      x: playerPosition.x,
      y: playerPosition.y,
      angle: playerPosition.angle || 0,
      isOnline: false,
      is_online: false,
      locationType: 'interior',
      interiorKind: detail.kind || 'house',
      interiorId: detail.houseId || detail.serviceId || null,
      updatedAt,
    };

    playerPosition.isOnline = false;
    playerPosition.updatedAt = updatedAt;
    state.player = {
      ...(state.player || {}),
      isOnline: false,
      is_online: false,
      locationType: 'interior',
      updatedAt,
    };
    save();

    movementChannel?.sendPresence?.(offlinePacket, false);
    if (!movementChannel?.sendPresence) movementChannel?.sendMove?.(offlinePacket);

    setPlayerOffline().catch((error) => {
      console.warn('[home] interior enter city offline failed:', error);
    });
  }

  function handleInteriorExited(event) {
    if (root.dataset.destroyed === 'true') return;

    const detail = event?.detail || {};
    const point = getInteriorExitPoint(detail);
    const updatedAt = new Date().toISOString();
    const playerId = getLocalPlayerId();

    playerPosition.x = point.x;
    playerPosition.y = point.y;
    playerPosition.angle = point.angle;
    playerPosition.isOnline = true;
    playerPosition.updatedAt = updatedAt;

    state.player = {
      ...(state.player || {}),
      x: point.x,
      y: point.y,
      angle: point.angle,
      isOnline: true,
      is_online: true,
      locationType: 'city',
      updatedAt,
    };
    save();

    mapControls?.focusOnPlayer?.(point.x, point.y);

    window.dispatchEvent(new CustomEvent('mn:player-teleported', {
      detail: {
        playerId,
        nickname,
        cityId,
        x: point.x,
        y: point.y,
        angle: point.angle,
        updatedAt,
        houseId: detail.houseId || null,
        source: 'interior_exit',
      },
    }));

    const onlinePacket = {
      playerId,
      nickname,
      cityId,
      x: point.x,
      y: point.y,
      angle: point.angle,
      isOnline: true,
      is_online: true,
      locationType: 'city',
      updatedAt,
    };

    movementChannel?.sendPresence?.(onlinePacket, true);
    if (!movementChannel?.sendPresence) movementChannel?.sendMove?.(onlinePacket);

    updatePlayerPosition({
      cityId,
      nickname,
      x: point.x,
      y: point.y,
      angle: point.angle,
    }).catch((error) => {
      console.warn('[home] interior exit position save failed:', error);
    });
  }

  window.addEventListener('mn:interior-entered', handleInteriorEntered);
  window.addEventListener('mn:interior-exited', handleInteriorExited);

  return () => {
    window.removeEventListener('mn:interior-entered', handleInteriorEntered);
    window.removeEventListener('mn:interior-exited', handleInteriorExited);
  };
}

function getMapByFileName(fileName) {
  const entry = Object.entries(MAP_FILES).find(([path]) => path.endsWith(`/${fileName}`));
  return entry?.[1] || null;
}

function getOptimizedMapByFileName(fileName) {
  const cleanName = String(fileName || '').trim();
  const dotIndex = cleanName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? cleanName.slice(0, dotIndex) : cleanName;

  for (const extension of ['avif', 'webp']) {
    const optimized = getMapByFileName(`${baseName}.${extension}`);

    if (optimized) {
      return optimized;
    }
  }

  return null;
}

function getCityMap(city) {
  const mapPath = String(city.map || '').replace(/^\.?\//, '');
  const mapFileName = mapPath.split('/').pop();

  return (
    getOptimizedMapByFileName(mapFileName) ||
    getMapByFileName(mapFileName) ||
    getOptimizedMapByFileName('UkraineMap.png') ||
    getMapByFileName('UkraineMap.png')
  );
}

function getCityMapRatio(cityId) {
  return CITY_MAP_RATIOS[normalizeCityId(cityId)] || 0.6697;
}

function getUserDayMode() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 19 ? 'day' : 'night';
}

function getFallbackWeather() {
  return {
    type: 'clear',
    icon: '☀',
    label: 'Ясно',
    temperature: 18,
  };
}

function withHomeTimeout(promise, timeoutMs, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
    }),
  ]);
}

function getDisplayWeather(weather, dayMode) {
  if (weather.type !== 'hot') return weather;

  if (dayMode === 'night') {
    return {
      ...weather,
      label: 'Тёплая ночь',
      icon: '🌙',
      temperature: Math.min(weather.temperature - 5, 25),
    };
  }

  return {
    ...weather,
    temperature: Math.min(weather.temperature, 32),
  };
}

function isMobileGameplayDevice() {
  const width = Math.min(window.innerWidth || 9999, window.screen?.width || 9999);
  const height = Math.min(window.innerHeight || 9999, window.screen?.height || 9999);
  const hasTouch = navigator.maxTouchPoints > 0;

  return hasTouch && Math.min(width, height) <= 768;
}

function isMobilePlayerBusy() {
  if (!isMobileGameplayDevice()) return false;

  const now = performance.now();
  const pauseUntil = Number(window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ || 0);

  return window.__MN_MOBILE_PLAYER_MOVING__ === true || pauseUntil > now;
}

function hasMobileControlsAccepted() {
  try {
    return localStorage.getItem(MOBILE_CONTROLS_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMobileControlsAccepted() {
  try {
    localStorage.setItem(MOBILE_CONTROLS_KEY, '1');
  } catch {
    // localStorage может быть недоступен, но игра не должна падать
  }
}

const ADMIN_HOTKEY_EVENT_FLAG = '__mnAdminHotkeyHandled';

function isDesktopDevice() {
  return !isMobileGameplayDevice();
}

function isAdminHotkey(event) {
  if (!isDesktopDevice()) return false;

  const key = String(event?.key || '').trim().toLowerCase();
  const code = String(event?.code || '').trim();

  return (
    code === 'KeyP' ||
    key === 'p' ||
    key === 'з'
  );
}

function isTypingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();

  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target?.isContentEditable === true
  );
}

function createMobileSelfMarkerHardOverlay() {
  if (window.__MN_SESSION_BLOCKED === true ||
      document.documentElement?.classList?.contains('mn-session-blocked') ||
      document.body?.classList?.contains('mn-session-blocked')) {
    document.querySelector('[data-mobile-self-marker-hard="true"]')?.remove();
    return () => {};
  }

  const oldMarker = document.querySelector('[data-mobile-self-marker-hard="true"]');

  if (oldMarker) {
    oldMarker.remove();
  }

  const marker = document.createElement('div');

  marker.dataset.mobileSelfMarkerHard = 'true';

  marker.style.position = 'fixed';
  marker.style.left = '50%';
  marker.style.top = '50%';
  marker.style.width = '14px';
  marker.style.height = '14px';
  marker.style.minWidth = '14px';
  marker.style.minHeight = '14px';
  marker.style.maxWidth = '14px';
  marker.style.maxHeight = '14px';
  marker.style.transform = 'translate(-50%, -50%)';
  marker.style.borderRadius = '999px';
  marker.style.boxSizing = 'border-box';
  marker.style.background = '#3a2605';
  marker.style.border = '3px solid #e6b84a';
  marker.style.boxShadow = [
    '0 0 0 3px rgba(245, 252, 255, 0.82)',
    '0 0 16px rgba(165, 225, 255, 0.85)',
    '0 0 30px rgba(255, 210, 80, 0.55)',
  ].join(', ');
  marker.style.zIndex = '300';
  marker.style.pointerEvents = 'none';
  marker.style.opacity = '1';
  marker.style.visibility = 'visible';
  marker.style.display = 'block';

  const updateMarkerPosition = (event) => {
    const detail = event?.detail || {};
    const worldX = Number(detail.x || 0);
    const worldY = Number(detail.y || 0);
    const forcedLandscape =
      document.documentElement?.classList?.contains('mn-force-rotate-landscape') ||
      document.body?.classList?.contains('mn-force-rotate-landscape');

    const screenX = forcedLandscape ? -worldY : worldX;
    const screenY = forcedLandscape ? worldX : worldY;

    marker.style.setProperty('left', `calc(50% + ${screenX}px)`, 'important');
    marker.style.setProperty('top', `calc(50% + ${screenY}px)`, 'important');
  };

  const removeMarker = () => {
    marker.remove();
  };

  window.addEventListener('mn:session-blocked', removeMarker, { once: true });
  window.addEventListener('mn:mobile-player-screen-offset', updateMarkerPosition);
  document.body.appendChild(marker);
  updateMarkerPosition({ detail: window.__MN_MOBILE_PLAYER_SCREEN_OFFSET__ });

  return () => {
    window.removeEventListener('mn:session-blocked', removeMarker);
    window.removeEventListener('mn:mobile-player-screen-offset', updateMarkerPosition);
    marker.remove();
  };
}

function isVisibleHouseModal(element) {
  if (!element) return false;
  if (element.hidden) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  const styles = window.getComputedStyle(element);

  return (
    styles.display !== 'none' &&
    styles.visibility !== 'hidden' &&
    Number(styles.opacity || 1) !== 0
  );
}

function hideHouseModal(element) {
  if (!element) return;

  element.hidden = true;
  element.setAttribute('aria-hidden', 'true');

  element.classList.remove(
    'is-open',
    'is-visible',
    'active',
    'open',
    'show'
  );
}

function showHouseModal(element) {
  if (!element) return;

  element.hidden = false;
  element.removeAttribute('aria-hidden');
}

function closeHouseDetailsModals() {
  document
    .querySelectorAll('.house-details-modal')
    .forEach((modal) => hideHouseModal(modal));
}

function closeHouseSelectionPanels() {
  document
    .querySelectorAll('.house-selection-panel')
    .forEach((panel) => hideHouseModal(panel));
}

function getVisibleHouseListModal() {
  return Array
    .from(document.querySelectorAll('.houses-modal'))
    .find(isVisibleHouseModal) || null;
}

function getVisibleHouseDetailsModal() {
  return Array
    .from(document.querySelectorAll('.house-details-modal'))
    .find(isVisibleHouseModal) || null;
}

function resetHouseModalsOnHomeEnter() {
  document
    .querySelectorAll('.houses-modal, .house-details-modal, .house-selection-panel')
    .forEach((modal) => {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');

      modal.classList.remove(
        'is-open',
        'is-visible',
        'active',
        'open',
        'show'
      );

      modal.style.removeProperty('display');
      modal.style.removeProperty('visibility');
      modal.style.removeProperty('opacity');
      modal.style.removeProperty('pointer-events');
    });

  document.body?.classList.remove('mn-houses-modal-open');
  document.body?.classList.remove('mn-house-details-open');
}

function hasVisibleHouseModal() {
  return Array
    .from(document.querySelectorAll('.houses-modal, .house-details-modal'))
    .some((modal) => isVisibleHouseModal(modal));
}

function cleanupStuckHouseBackdrop() {
  if (hasVisibleHouseModal()) return;

  document.body?.classList.remove('mn-houses-modal-open');
  document.body?.classList.remove('mn-house-details-open');

  document
    .querySelectorAll('.houses-modal, .house-details-modal, .house-selection-panel')
    .forEach((modal) => {
      if (isVisibleHouseModal(modal)) return;

      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');

      modal.classList.remove(
        'is-open',
        'is-visible',
        'active',
        'open',
        'show'
      );
    });
}

function enableSingleHouseModalMode(root) {
  if (!root) return null;

  let lastIntent = 'list';
  let frameId = 0;
  let timeoutId = 0;

  function enforceSingleModal() {
    const listModal = getVisibleHouseListModal();
    const detailsModal = getVisibleHouseDetailsModal();

    if (!listModal || !detailsModal) return;

    if (lastIntent === 'list') {
      hideHouseModal(detailsModal);
      showHouseModal(listModal);
      return;
    }

    hideHouseModal(listModal);
    showHouseModal(detailsModal);
  }

  function scheduleEnforce() {
    cancelAnimationFrame(frameId);
    clearTimeout(timeoutId);

    frameId = requestAnimationFrame(() => {
      enforceSingleModal();
      cleanupStuckHouseBackdrop();
    });

    timeoutId = setTimeout(() => {
      enforceSingleModal();
      cleanupStuckHouseBackdrop();
    }, 80);
  }

  function handleClick(event) {
    const target = event.target;

    /*
      Клик по городу = нужен только список домов.
      Старая карточка дома должна закрыться.
    */
    if (target?.closest?.('.player-city-button')) {
      lastIntent = 'list';

      closeHouseDetailsModals();
      closeHouseSelectionPanels();

      scheduleEnforce();
      return;
    }

    /*
      Клик внутри списка домов = нужна только карточка выбранного дома.
      Список после открытия карточки не должен висеть вторым слоем.
    */
    if (
      target?.closest?.('.house-list') ||
      target?.closest?.('.houses-list') ||
      target?.closest?.('.house-section-card') ||
      target?.closest?.('.house-card') ||
      target?.closest?.('[data-house-id]')
    ) {
      lastIntent = 'details';
      scheduleEnforce();
    }
  }

  function handleHouseDetailsIntent() {
    lastIntent = 'details';
    scheduleEnforce();
  }

  function handleHouseListIntent() {
    lastIntent = 'list';
    closeHouseDetailsModals();
    closeHouseSelectionPanels();
    scheduleEnforce();
  }

  const observer = new MutationObserver(scheduleEnforce);

  root.addEventListener('click', handleClick, true);

  window.addEventListener('mn:house-details-open', handleHouseDetailsIntent);
  window.addEventListener('mn:house-details-opened', handleHouseDetailsIntent);
  window.addEventListener('mn:houses-list-open', handleHouseListIntent);
  window.addEventListener('mn:houses-list-opened', handleHouseListIntent);

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'hidden',
      'class',
      'style',
      'aria-hidden',
    ],
  });

  return () => {
    cancelAnimationFrame(frameId);
    clearTimeout(timeoutId);

    root.removeEventListener('click', handleClick, true);

    window.removeEventListener('mn:house-details-open', handleHouseDetailsIntent);
    window.removeEventListener('mn:house-details-opened', handleHouseDetailsIntent);
    window.removeEventListener('mn:houses-list-open', handleHouseListIntent);
    window.removeEventListener('mn:houses-list-opened', handleHouseListIntent);

    observer.disconnect();
  };
}

register('home', async (root) => {
  root._cleanupHome?.();

  resetHouseModalsOnHomeEnter();

  window.__MN_GAMEPLAY_ENTERED__ = false;
  window.__MN_PLAYER_CONTROLS_LOCKED__ = false;
  document.body?.classList.remove('mn-player-controls-locked');
  document.documentElement?.classList.remove('mn-player-controls-locked');

  delete root.dataset.destroyed;

  root.className = 'page home';

  root.innerHTML = `
    <main style="
      position:fixed;
      inset:0;
      display:grid;
      place-items:center;
      background:#050607;
      color:rgba(255,255,255,.9);
      font:900 13px/1 system-ui,-apple-system,sans-serif;
      letter-spacing:.08em;
    ">ЗАГРУЗКА…</main>
  `;

  const cityId = normalizeCityId(state.city);
  const city = getCityConfig(cityId);
  const dayMode = getUserDayMode();
  const nickname = state.nickname || 'Игрок';
  const localPlayerId = getLocalPlayerId();

  const [weatherResult, playerPositionResult, cityPlayersResult] = await Promise.allSettled([
    withHomeTimeout(getCityWeather(cityId), 5200, 'weather'),
    withHomeTimeout(getOrCreatePlayerPosition(cityId, nickname), 5200, 'player_position'),
    withHomeTimeout(getCityPlayers(cityId), 5200, 'city_players'),
  ]);

  let weather = weatherResult.status === 'fulfilled'
    ? weatherResult.value
    : getFallbackWeather();

  if (weatherResult.status === 'rejected') {
    console.warn('[home] weather loading failed:', weatherResult.reason);
  }

  const displayWeather = getDisplayWeather(weather, dayMode);

  let playerPosition = null;

  if (playerPositionResult.status === 'fulfilled' && playerPositionResult.value) {
    playerPosition = playerPositionResult.value;

    const isAdmin = isTruthyAdmin(playerPosition?.is_admin) || isTruthyAdmin(playerPosition?.isAdmin);

    state.player = {
      ...(state.player || {}),
      ...playerPosition,
      is_admin: isAdmin,
      isAdmin,
    };

    state.is_admin = isAdmin;
    state.isAdmin = isAdmin;

    save();
  } else {
    console.warn('[home] player position loading failed:', playerPositionResult.reason);

    playerPosition = {
      playerId: localPlayerId,
      x: 50,
      y: 50,
      nickname,
      is_admin: false,
      isAdmin: false,
    };

    state.player = {
      ...(state.player || {}),
      ...playerPosition,
      is_admin: false,
      isAdmin: false,
    };

    state.is_admin = false;
    state.isAdmin = false;

    save();
  }

  const cityPlayers = cityPlayersResult.status === 'fulfilled' && Array.isArray(cityPlayersResult.value)
    ? cityPlayersResult.value
    : [playerPosition];

  if (cityPlayersResult.status === 'rejected') {
    console.warn('[home] city players loading failed:', cityPlayersResult.reason);
  }

  const hasSelf = cityPlayers.some((player) => String(player.playerId) === String(localPlayerId));

  if (!hasSelf) {
    cityPlayers.unshift({
      ...playerPosition,
      playerId: localPlayerId,
      nickname,
    });
  }

  const playersHtml = renderPlayersHtml(cityPlayers, localPlayerId, nickname);

  if (state.city !== cityId) {
    state.city = cityId;
    state.cityName = city.name;
    save();
  }

  const mapSrc = getCityMap(city);
  const isMobileGameplay = isMobileGameplayDevice();
  const cityMapRatio = getCityMapRatio(cityId);

  document.body?.classList.toggle('mn-desktop-game-enabled', !isMobileGameplay);
  document.documentElement?.classList.toggle('mn-desktop-game-enabled', !isMobileGameplay);
  document.body?.classList.toggle('mn-mobile-device-detected', isMobileGameplay);
  document.documentElement?.classList.toggle('mn-mobile-device-detected', isMobileGameplay);

  const mapLayerHtml = isMobileGameplay
    ? `
          <div
            class="gta-map-image gta-map-mobile-placeholder"
            data-map-src="${mapSrc}"
            aria-hidden="true"
          ></div>
        `
    : `
          <img
            class="gta-map-image gta-map-glow"
            src="${mapSrc}"
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="async"
          />

          <img
            class="gta-map-image"
            src="${mapSrc}"
            alt="${city.name}"
            loading="eager"
            decoding="async"
            fetchpriority="high"
          />
        `;

  const telegramId =
    state.telegramId ||
    state.player?.telegramId ||
    state.player?.tg_id ||
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
    null;

  const playerBalance = Number(state.player?.balance || 0);
  const playerHealth = getPlayerVitalValue(state.player, 'health');
  const playerFood = getPlayerVitalValue(state.player, 'food');
  const playerWater = getPlayerVitalValue(state.player, 'water');

  root.dataset.city = cityId;
  root.dataset.time = dayMode;
  root.dataset.weather = weather.type;
  root.dataset.performance = isLowPowerDevice() || isMobileGameplay ? 'low' : 'normal';
  root.dataset.weatherFx = isLowPowerDevice() || isMobileGameplay ? 'lite' : 'normal';
  root.dataset.objectLoad = 'normal';

  let cleanupRenderPerformanceGuards = null;

  function setRenderPressureMode(detail = {}) {
    if (detail.cityId && String(detail.cityId) !== String(cityId)) return;

    const totalCount = Number(detail.count || 0);
    const renderedCount = Number(detail.renderedCount ?? detail.layerChildren ?? 0);
    const highObjectPressure = renderedCount >= 90 || totalCount >= 500;
    const lowMode = isLowPowerDevice() || isMobileGameplay || highObjectPressure;

    root.dataset.objectLoad = highObjectPressure ? 'high' : 'normal';
    root.dataset.performance = lowMode ? 'low' : 'normal';
    root.dataset.weatherFx = lowMode ? 'lite' : 'normal';
  }

  function setupRenderPerformanceGuards() {
    const handleObjectsRendered = (event) => {
      setRenderPressureMode(event?.detail || {});
    };

    const handleObjectsLoaded = (event) => {
      setRenderPressureMode(event?.detail || {});
    };

    window.addEventListener('mn:map-objects-rendered', handleObjectsRendered);
    window.addEventListener('mn:map-objects-loaded', handleObjectsLoaded);

    return () => {
      window.removeEventListener('mn:map-objects-rendered', handleObjectsRendered);
      window.removeEventListener('mn:map-objects-loaded', handleObjectsLoaded);
    };
  }

  cleanupRenderPerformanceGuards = setupRenderPerformanceGuards();

  delete root.dataset.mobileControls;

  root.innerHTML = `
    <main class="home-gameplay">
      <section class="gta-map-stage">
        <div class="gta-map-bg"></div>
        <div class="gta-stars"></div>
        <div class="gta-sky-light"></div>

        <div class="gta-water">
          <div class="gta-water-soft"></div>
        </div>

        <div class="gta-map-viewport" data-city-id="${cityId}" data-map-src="${mapSrc}" data-map-ratio="${cityMapRatio}">
          <div class="gta-map-weather">
            <div class="gta-weather-sun"></div>
            <div class="gta-weather-clouds"></div>
            <div class="gta-weather-rain"></div>
            <div class="gta-weather-heat"></div>
          </div>

          <div class="gta-map-entities">
            ${playersHtml}
          </div>

          ${mapLayerHtml}
        </div>


        <div class="mobile-self-player-indicator" aria-hidden="true">
          <div class="mobile-self-player-dot"></div>
        </div>
      </section>
    </main>

    <section class="player-glass-hud" aria-label="Игровой HUD">
      <div class="player-hud-left">
        <button class="player-city-button" type="button" aria-label="Открыть недвижимость города">
          <span>${city.name}</span>
          <b>›</b>
        </button>

        <div class="player-weather-mini" aria-label="Погода">
          <span>${dayMode === 'day' ? '☀' : '☾'}</span>
          <i></i>
          <span>${displayWeather.icon}</span>
          <i></i>
          <span>${displayWeather.temperature}°</span>
        </div>
      </div>

      <button class="player-profile-card" type="button" aria-label="Профиль игрока">
        <span class="player-avatar">${String(nickname).charAt(0).toUpperCase()}</span>

        <span class="player-profile-info">
          <strong>${nickname}</strong>
          <small>ID: ${telegramId}</small>
        </span>

        <span class="player-profile-arrow">›</span>
      </button>

      <div class="player-balance-card has-player-vitals" aria-label="Баланс игрока" data-player-balance-card>
        <span class="player-card-icon player-card-icon-green">₴</span>
        <strong data-player-balance title="${formatFullMoney(playerBalance)}">${formatHudMoney(playerBalance)}</strong>
        <span class="player-balance-change" data-player-balance-change hidden></span>
        <div class="player-vitals-row" aria-label="Показатели игрока">
          <div
            class="player-vital-pill player-vital-health"
            data-player-health
            role="meter"
            aria-label="Здоровье"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${Math.round(playerHealth)}"
            style="${getVitalFillStyle(playerHealth, 'health')}"
          >
            <span class="player-vital-icon" aria-hidden="true">🫀</span>
            <b data-player-health-value>${Math.round(playerHealth)}</b>
          </div>
          <div
            class="player-vital-pill player-vital-food"
            data-player-food
            role="meter"
            aria-label="Еда"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${Math.round(playerFood)}"
            style="${getVitalFillStyle(playerFood, 'food')}"
          >
            <span class="player-vital-icon" aria-hidden="true">🍽</span>
            <b data-player-food-value>${Math.round(playerFood)}</b>
          </div>
          <div
            class="player-vital-pill player-vital-water"
            data-player-water
            role="meter"
            aria-label="Вода"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${Math.round(playerWater)}"
            style="${getVitalFillStyle(playerWater, 'water')}"
          >
            <span class="player-vital-icon" aria-hidden="true">🥛</span>
            <b data-player-water-value>${Math.round(playerWater)}</b>
          </div>
        </div>
      </div>
    </section>

    <div class="player-health-edge" data-player-health-edge aria-hidden="true"></div>

    <div class="mobile-controls-layer"></div>
  `;

  /*
    On desktop the balance must use the viewport as its positioning frame,
    exactly like the interior balance. Keeping it inside the grid HUD lets
    Telegram Desktop pull it back toward the nickname card in some viewports.
    Mobile keeps the original HUD structure and is not changed here.
  */
  if (!isMobileGameplay) {
    const desktopBalanceCard = root.querySelector('[data-player-balance-card]');

    if (desktopBalanceCard) {
      root.append(desktopBalanceCard);

      /*
        Telegram Desktop keeps several legacy HUD rules with !important.
        Set the final PC anchor directly on the detached card so those rules
        cannot pull it down or place it underneath Telegram's own controls.
      */
      const desktopBalancePosition = {
        position: 'fixed',
        left: 'auto',
        right: 'max(104px, calc(env(safe-area-inset-right) + 104px))',
        top: 'max(16px, calc(env(safe-area-inset-top) + 16px))',
        bottom: 'auto',
        margin: '0',
        transform: 'none',
        translate: '0 0',
        rotate: '0deg',
        width: '170px',
        minWidth: '170px',
        maxWidth: '170px',
        overflow: 'visible',
        zIndex: '2147481700',
      };

      Object.entries(desktopBalancePosition).forEach(([property, value]) => {
        const cssProperty = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        desktopBalanceCard.style.setProperty(cssProperty, value, 'important');
      });
    }
  }

  resetHouseModalsOnHomeEnter();

  const stage = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');
  const entities = root.querySelector('.gta-map-entities');
  const playerMarker = root.querySelector(`[data-player-id="${CSS.escape(String(localPlayerId))}"]`);
  const mobileControlsLayer = root.querySelector('.mobile-controls-layer');
  const cleanupMobileGameplayChrome = enableMobileGameplayChrome();
  const entityInteractionPanel = createEntityInteractionPanel(root);
  const cleanupInventoryFeature = enableInventoryFeature();
  const cleanupHospitalManagement = enableHospitalManagementFeature();
  const cleanupPlayerInteraction = enablePlayerInteractionFeature({ playerPosition });
  const cleanupPlayerStatusEffects = enablePlayerStatusEffects();
  const cleanupPlayerSurvival = enablePlayerSurvivalFeature();

  const cleanupHousesFeature = enableHousesFeature(root, {
    cityId,
    city,
  });

  resetHouseModalsOnHomeEnter();

  setTimeout(() => {
    resetHouseModalsOnHomeEnter();
  }, 120);

  setTimeout(() => {
    cleanupStuckHouseBackdrop();
  }, 450);

  // Вся логика домов теперь живёт в housesFeature.
  // Второй guard из home конфликтовал с мобильными модалками и открывал два слоя.
  const cleanupSingleHouseModalMode = null;

  const mapControls = enableMapControls(stage, viewport, {
    cityId,
    mapSrc,
    focusX: playerPosition.x,
    focusY: playerPosition.y,

    /*
      Camera tuning is centralized in src/config/cameraTuning.js.
      We only change the visual zoom here; map limits, movement and player
      coordinates continue to be handled by mapControls.
    */
    startScale: getStreetCameraStartScale({
      mobile: isMobileGameplay,
      lowPower: isLowPowerDevice(),
    }),
  });

  const network = setupPlayerNetwork({
    cityId,
    playerId: localPlayerId,
    localPlayerId,
    localNickname: nickname,
    entities,
    playerPosition,
  });

  const cleanupSessionGuard = setupSessionGuard(root);

  let cleanupMovement = null;
  let cleanupMobilePrompt = null;
  let cleanupMobileJoystick = null;
  let cleanupAdminPanel = null;
  let cleanupEntityInteraction = null;
  let cleanupGameRealtime = null;
  let cleanupMobileSelfMarker = null;
  let cleanupBalanceDatabaseSync = null;
  let cleanupHouseSpawnPicker = null;
  let cleanupInteriorExitReturn = null;
  let cleanupPlayerKnockout = null;
  let gameplayEntered = false;

  function markGameplayEntered(source = 'city_spawn') {
    if (gameplayEntered || root.dataset.destroyed === 'true') return;
    gameplayEntered = true;
    window.__MN_GAMEPLAY_ENTERED__ = true;
    window.dispatchEvent(new CustomEvent('mn:gameplay-entered', {
      detail: { cityId, source },
    }));
  }

  const balanceCard = root.querySelector('[data-player-balance-card]');
  const balanceEl = root.querySelector('[data-player-balance]');
  const balanceChangeEl = root.querySelector('[data-player-balance-change]');
  const healthEl = root.querySelector('[data-player-health]');
  const healthValueEl = root.querySelector('[data-player-health-value]');
  const foodEl = root.querySelector('[data-player-food]');
  const foodValueEl = root.querySelector('[data-player-food-value]');
  const waterEl = root.querySelector('[data-player-water]');
  const waterValueEl = root.querySelector('[data-player-water-value]');

  let currentBalance = Number(playerBalance || 0);
  let renderedBalance = currentBalance;
  const vitalElements = {
    health: { el: healthEl, valueEl: healthValueEl },
    food: { el: foodEl, valueEl: foodValueEl },
    water: { el: waterEl, valueEl: waterValueEl },
  };
  const currentVitals = {
    health: playerHealth,
    food: playerFood,
    water: playerWater,
  };
  let balanceFrame = null;
  let balancePulseTimer = null;
  let balanceChangeTimer = null;
  let balanceSyncTimer = null;
  let playerStatsSyncTimer = null;
  let balanceSyncInFlight = false;
  let balanceSyncTransport = 'direct';
  let healthHitTimer = null;
  const vitalFeedbackTimers = new Map();

  function formatBalance(value) {
    return formatHudMoney(value);
  }

  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function setBalanceText(value) {
    if (!balanceEl) return;

    const numericValue = Number(value || 0);

    if (Number.isFinite(numericValue)) {
      renderedBalance = numericValue;
    }

    const fullBalanceLabel = formatFullMoney(value);

    balanceEl.textContent = formatBalance(value);
    balanceEl.title = fullBalanceLabel;
    balanceCard?.setAttribute('aria-label', `Баланс игрока: ${fullBalanceLabel}`);
  }

  function showBalanceChange(delta, source = 'realtime') {
    if (!balanceCard || !balanceChangeEl || !Number.isFinite(delta) || delta === 0) {
      return;
    }

    const isPlus = delta > 0;
    const absDelta = Math.abs(Math.round(delta));

    balanceCard.classList.remove(
      'is-balance-plus',
      'is-balance-minus',
      'is-balance-pulse'
    );

    balanceChangeEl.hidden = true;
    balanceChangeEl.textContent = '';
    delete balanceChangeEl.dataset.type;

    balanceCard.style.setProperty('--mn-balance-pulse-ms', `${BALANCE_PULSE_DURATION_MS}ms`);
    balanceChangeEl.style.setProperty('--mn-balance-change-ms', `${BALANCE_FEEDBACK_DURATION_MS}ms`);

    // Перезапускаем CSS-анимации даже при серии быстрых операций.
    void balanceCard.offsetWidth;
    void balanceChangeEl.offsetWidth;

    balanceCard.dataset.balanceSource = source || 'realtime';
    balanceCard.classList.add(
      isPlus ? 'is-balance-plus' : 'is-balance-minus',
      'is-balance-pulse'
    );

    balanceChangeEl.textContent = `${isPlus ? '+' : '−'} ${absDelta.toLocaleString('ru-RU')} ₴`;
    balanceChangeEl.dataset.type = isPlus ? 'plus' : 'minus';
    balanceChangeEl.hidden = false;

    clearTimeout(balancePulseTimer);
    clearTimeout(balanceChangeTimer);

    balancePulseTimer = setTimeout(() => {
      balanceCard.classList.remove(
        'is-balance-plus',
        'is-balance-minus',
        'is-balance-pulse'
      );
    }, BALANCE_PULSE_DURATION_MS + 120);

    balanceChangeTimer = setTimeout(() => {
      balanceChangeEl.hidden = true;
      balanceChangeEl.textContent = '';
      delete balanceChangeEl.dataset.type;
      delete balanceCard.dataset.balanceSource;
      balanceChangeEl.style.removeProperty('--mn-balance-change-ms');
      balanceCard.style.removeProperty('--mn-balance-pulse-ms');
    }, BALANCE_FEEDBACK_DURATION_MS + 180);
  }

  function animateBalanceNumber(from, to, options = {}) {
    if (!balanceEl) return;

    cancelAnimationFrame(balanceFrame);

    const startValue = Number(from);
    const finishValue = Number(to);
    const duration = Number(options.durationMs || BALANCE_COUNT_DURATION_MS);

    if (!Number.isFinite(startValue) || !Number.isFinite(finishValue)) {
      setBalanceText(finishValue);
      return;
    }

    const delta = finishValue - startValue;

    if (!Number.isFinite(delta) || delta === 0) {
      setBalanceText(finishValue);
      return;
    }

    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / Math.max(duration, 1));
      const eased = easeInOutCubic(progress);
      const value = startValue + delta * eased;

      setBalanceText(value);

      if (progress < 1) {
        balanceFrame = requestAnimationFrame(tick);
        return;
      }

      setBalanceText(finishValue);
      balanceFrame = null;
    };

    balanceFrame = requestAnimationFrame(tick);
  }

  function updateBalance(balance, options = {}) {
    const nextBalance = Number(balance || 0);

    if (!Number.isFinite(nextBalance)) return;

    const previousBalance = currentBalance;
    const visualStartBalance = Number.isFinite(renderedBalance) ? renderedBalance : previousBalance;
    const explicitDelta = Number(options.delta);
    const delta = Number.isFinite(explicitDelta) && explicitDelta !== 0
      ? explicitDelta
      : nextBalance - previousBalance;

    currentBalance = nextBalance;

    state.player = {
      ...(state.player || {}),
      balance: nextBalance,
    };

    save();

    if (delta !== 0) {
      animateBalanceNumber(visualStartBalance, nextBalance, {
        durationMs: options.durationMs || BALANCE_COUNT_DURATION_MS,
      });
      showBalanceChange(delta, options.source || 'realtime');
      return;
    }

    setBalanceText(nextBalance);
  }

  function setVitalVisual(key, value, options = {}) {
    const entry = vitalElements[key];
    const vitalEl = entry?.el;

    if (!vitalEl) return;

    const config = PLAYER_VITALS_CONFIG[key] || {};
    const previousValue = currentVitals[key];
    const maxValue = Number.isFinite(Number(config.max)) ? Number(config.max) : 100;
    const nextValue = clampVitalValue(value, config);
    const roundedValue = Math.round(nextValue);
    const visualValueChanged = Math.round(previousValue) !== roundedValue;
    const fillPercent = maxValue > 0
      ? Math.round((nextValue / maxValue) * 100)
      : 0;

    currentVitals[key] = nextValue;
    vitalEl.style.setProperty('--mn-vital-fill', `${fillPercent}%`);
    vitalEl.setAttribute('aria-valuenow', String(roundedValue));

    if (entry.valueEl) {
      entry.valueEl.textContent = String(roundedValue);
    }

    if (options.animateChange !== false && visualValueChanged) {
      vitalEl.classList.remove('is-vital-changing');

      void vitalEl.offsetWidth;

      vitalEl.classList.add('is-vital-changing');
      clearTimeout(vitalFeedbackTimers.get(key));
      vitalFeedbackTimers.set(key, setTimeout(() => {
        vitalEl.classList.remove('is-vital-changing');
        vitalFeedbackTimers.delete(key);
      }, PLAYER_VITAL_FEEDBACK_DURATION_MS));
    }

    if (key === 'health') {
      const lowThreshold = Number.isFinite(Number(config.lowThreshold))
        ? Number(config.lowThreshold)
        : 50;

      vitalEl.classList.toggle('is-health-low', nextValue < lowThreshold);
      root.classList.toggle(PLAYER_HEALTH_LOW_CLASS, nextValue < lowThreshold);

      const tookDamage = nextValue < previousValue;

      if (options.animateDamage !== false && tookDamage) {
        vitalEl.classList.remove('is-health-draining');
        root.classList.remove(PLAYER_HEALTH_HIT_CLASS);

        void vitalEl.offsetWidth;

        vitalEl.classList.add('is-health-draining');
        root.classList.add(PLAYER_HEALTH_HIT_CLASS);

        clearTimeout(healthHitTimer);
        healthHitTimer = setTimeout(() => {
          vitalEl.classList.remove('is-health-draining');
          root.classList.remove(PLAYER_HEALTH_HIT_CLASS);
        }, PLAYER_HEALTH_HIT_DURATION_MS);
      }
    }

    if (options.save !== false) {
      state.player = {
        ...(state.player || {}),
        [key]: nextValue,
      };
      save();
    }
  }

  function setHealthVisual(health, options = {}) {
    setVitalVisual('health', health, options);
  }

  function updatePlayerHealth(health, options = {}) {
    const nextHealth = clampVitalValue(health, PLAYER_VITALS_CONFIG.health || {});

    if (!Number.isFinite(nextHealth)) return;

    setHealthVisual(nextHealth, options);
  }

  function updatePlayerVitalsFromSnapshot(playerSnapshot = {}, options = {}) {
    let changed = false;

    ['health', 'food', 'water'].forEach((key) => {
      if (!hasPlayerVitalValue(playerSnapshot, key)) return;

      const nextValue = getPlayerVitalValue(playerSnapshot, key);

      setVitalVisual(key, nextValue, {
        animateDamage: options.animateDamage,
        save: false,
      });

      state.player = {
        ...(state.player || {}),
        [key]: nextValue,
      };
      changed = true;
    });

    if (changed) {
      save();
    }

    return changed;
  }

  function handleBalanceChanged(event) {
    const nextBalance =
      event?.detail?.balance ??
      event?.detail?.player?.balance;

    if (nextBalance === undefined || nextBalance === null) return;

    const statsSnapshot = getPlayerStatsSnapshotFromEvent(event);
    const vitalsChanged = updatePlayerVitalsFromSnapshot(statsSnapshot, {
      animateDamage: true,
    });

    updateBalance(nextBalance, {
      delta: event?.detail?.delta,
      source: event?.detail?.source,
      durationMs: BALANCE_COUNT_DURATION_MS,
    });

    if (!vitalsChanged) {
      schedulePlayerStatsDatabaseSync();
    }
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

    updatePlayerHealth(nextHealth, {
      animateDamage: event?.detail?.animateDamage !== false,
      save: event?.detail?.save !== false,
    });
  }

  function handleVitalsChanged(event) {
    const playerSnapshot = getPlayerStatsSnapshotFromEvent(event);
    const vitalsChanged = updatePlayerVitalsFromSnapshot(playerSnapshot, {
      animateDamage: event?.detail?.animateDamage !== false,
    });

    if (!vitalsChanged || event?.detail?.source === 'realtime_broadcast') {
      schedulePlayerStatsDatabaseSync();
    }
  }

  setHealthVisual(currentVitals.health, {
    animateDamage: false,
    save: false,
  });
  setVitalVisual('food', currentVitals.food, { save: false });
  setVitalVisual('water', currentVitals.water, { save: false });

  async function loadPositionVitalsSnapshot() {
    const playerIds = Array.from(new Set([
      localPlayerId,
      telegramId ? `tg_${telegramId}` : null,
    ].filter(Boolean).map(String)));

    for (const playerId of playerIds) {
      const { data, error } = await supabase
        .from('player_positions')
        .select('player_id, health, food, water, updated_at')
        .eq('player_id', playerId)
        .maybeSingle();

      if (!error && data) {
        return data;
      }

      const missingVitalsColumns = error && /health|food|water|column|schema cache/i.test(
        `${error.message || ''} ${error.details || ''} ${error.hint || ''}`
      );

      if (missingVitalsColumns) {
        return null;
      }
    }

    return null;
  }

  async function attachPositionVitals(playerSnapshot) {
    const positionVitals = await loadPositionVitalsSnapshot();

    if (!positionVitals) return playerSnapshot;

    // player_positions is the source of truth for survival. The later source
    // wins in mergeDefinedSnapshot, so it must be merged after players.
    return mergeDefinedSnapshot(playerSnapshot, positionVitals);
  }

  async function loadBalanceSnapshot() {
    if (balanceSyncTransport === 'direct') {
      const { data, error } = await supabase
        .from('players')
        .select('id, tg_id, balance, health, food, water, updated_at')
        .eq('tg_id', String(telegramId))
        .maybeSingle();

      if (!error && data) {
        return attachPositionVitals(data);
      }

      const missingVitalsColumns = error && /health|food|water|column|schema cache/i.test(
        `${error.message || ''} ${error.details || ''} ${error.hint || ''}`
      );

      if (missingVitalsColumns) {
        const fallback = await supabase
          .from('players')
          .select('id, tg_id, balance, updated_at')
          .eq('tg_id', String(telegramId))
          .maybeSingle();

        if (!fallback.error && fallback.data) {
          return attachPositionVitals(fallback.data);
        }
      }

      // При custom Telegram auth браузер остаётся anon для Supabase.
      // Если RLS не разрешает SELECT players, переключаемся на уже
      // существующую get-player Edge Function с service-role на сервере.
      balanceSyncTransport = 'edge';

      if (error) {
        console.warn('[home] direct balance sync unavailable, using edge fallback:', error);
      }
    }

    const result = await getPlayer(String(telegramId));
    return attachPositionVitals(result?.player || null);
  }

  async function syncBalanceFromDatabase({ silent = false } = {}) {
    if (balanceSyncInFlight || !telegramId) return;

    balanceSyncInFlight = true;

    try {
      const playerSnapshot = await loadBalanceSnapshot();

      if (!playerSnapshot) {
        return;
      }

      const resolvedPlayerId = playerSnapshot.id
        ? String(playerSnapshot.id)
        : null;
      const resolvedTelegramId = playerSnapshot.tg_id
        ? String(playerSnapshot.tg_id)
        : String(telegramId);
      const identityChanged =
        (resolvedPlayerId && String(state.player?.id || '') !== resolvedPlayerId) ||
        String(state.player?.tg_id || state.player?.telegramId || '') !== resolvedTelegramId;

      if (identityChanged) {
        state.player = {
          ...(state.player || {}),
          id: resolvedPlayerId || state.player?.id,
          tg_id: resolvedTelegramId,
          telegramId: resolvedTelegramId,
        };
        state.telegramId = resolvedTelegramId;
        save();
      }

      const nextBalance = Number(playerSnapshot.balance || 0);

      if (Number.isFinite(nextBalance) && nextBalance !== currentBalance) {
        updateBalance(nextBalance, {
          source: silent ? 'db_sync' : 'db_poll',
          durationMs: BALANCE_COUNT_DURATION_MS,
        });
      }

      updatePlayerVitalsFromSnapshot(playerSnapshot, {
        animateDamage: true,
      });
    } catch (error) {
      console.warn('[home] player stats db sync failed:', error);
    } finally {
      balanceSyncInFlight = false;
    }
  }

  function schedulePlayerStatsDatabaseSync(delayMs = 180) {
    clearTimeout(playerStatsSyncTimer);

    playerStatsSyncTimer = window.setTimeout(() => {
      playerStatsSyncTimer = null;
      syncBalanceFromDatabase({ silent: true });
    }, delayMs);
  }

  function startBalanceDatabaseSync() {
    clearInterval(balanceSyncTimer);

    /*
      Realtime/Broadcast остаётся основным мгновенным путём. Резервная
      проверка раз в 2 секунды сначала использует прямой SELECT, а при RLS-
      блокировке автоматически переходит на get-player Edge Function.
      Запрос не запускается параллельно сам с собой и не трогает карту/DOM.
    */
    const balanceSyncInterval = 2000;

    balanceSyncTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;

      syncBalanceFromDatabase({ silent: true });
    }, balanceSyncInterval);

    const syncOnFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if (isMobileGameplay && isMobilePlayerBusy()) return;

      syncBalanceFromDatabase({ silent: false });
    };

    const syncAfterRealtimeSubscribe = (event) => {
      const eventTelegramId = event?.detail?.telegramId;

      if (
        eventTelegramId &&
        String(eventTelegramId) !== String(telegramId)
      ) {
        return;
      }

      syncBalanceFromDatabase({ silent: true });
    };

    window.addEventListener('focus', syncOnFocus);
    window.addEventListener('online', syncOnFocus);
    window.addEventListener('mn:realtime-subscribed', syncAfterRealtimeSubscribe);
    document.addEventListener('visibilitychange', syncOnFocus);

    window.setTimeout(() => {
      if (!isMobileGameplay || !isMobilePlayerBusy()) {
        syncBalanceFromDatabase({ silent: true });
      }
    }, isMobileGameplay ? 1800 : 0);

    return () => {
      clearInterval(balanceSyncTimer);
      window.removeEventListener('focus', syncOnFocus);
      window.removeEventListener('online', syncOnFocus);
      window.removeEventListener('mn:realtime-subscribed', syncAfterRealtimeSubscribe);
      document.removeEventListener('visibilitychange', syncOnFocus);
    };
  }

  function enableMobileGameplayMode() {
    root.dataset.mobileControls = 'enabled';
    document.body?.classList.add('mn-landscape-game');

    cleanupMobileJoystick?.();

    cleanupMobileJoystick = enableMobileJoystick(
      mobileControlsLayer,
      playerMarker,
      playerPosition,
      cityId,
      nickname,
      mapControls,
      network.movementChannel
    );

    return cleanupMobileJoystick;
  }

  if (isMobileGameplay) {
    cleanupMobileSelfMarker = createMobileSelfMarkerHardOverlay();

    if (hasMobileControlsAccepted()) {
      enableMobileGameplayMode();
    } else {
      cleanupMobilePrompt = setupMobileControlPrompt({
        root,
        layer: mobileControlsLayer,
        enableJoystick() {
          saveMobileControlsAccepted();
          return enableMobileGameplayMode();
        },
      });
    }
  } else {
    cleanupMovement = enableKeyboardPlayerMovement(
      playerMarker,
      playerPosition,
      cityId,
      nickname,
      mapControls,
      network.movementChannel
    );
  }

  cleanupEntityInteraction = enableEntityInteraction({
    root,
    viewport,
    cityId,
    panel: entityInteractionPanel,
    playerMarker,
    playerPosition,
  });

  cleanupHouseSpawnPicker = setupHouseSpawnPicker({
    root,
    cityId,
    city,
    playerPosition,
    nickname,
    mapControls,
    movementChannel: network.movementChannel,
    onGameplayEntered: markGameplayEntered,
  });

  cleanupInteriorExitReturn = setupInteriorExitReturn({
    root,
    cityId,
    nickname,
    playerPosition,
    mapControls,
    movementChannel: network.movementChannel,
  });

  cleanupPlayerKnockout = enablePlayerKnockoutFeature({
    playerPosition,
    cityId,
  });

  const handleSessionBlocked = () => {
    cleanupMobileSelfMarker?.();
    cleanupMobileSelfMarker = null;
    document.querySelector('[data-mobile-self-marker-hard="true"]')?.remove();
  };

  window.addEventListener('mn:session-blocked', handleSessionBlocked);
  window.addEventListener('mn:player-balance-changed', handleBalanceChanged);
  window.addEventListener('mn:player-health-changed', handleHealthChanged);
  window.addEventListener('mn:player-vitals-changed', handleVitalsChanged);
  cleanupBalanceDatabaseSync = startBalanceDatabaseSync();

  cleanupGameRealtime = setupGameRealtime({
    cityId,
    telegramId,
    playerRowId: state.player?.id,
    positionPlayerId: localPlayerId,
  });

  let adminPanelReady = false;

  function emitAdminBlockedToast(reason = 'is_admin не найден в БД') {
    if (!isDesktopDevice()) return;

    window.dispatchEvent(new CustomEvent('mn:toast', {
      detail: { message: `Админка не доступна: ${reason}` },
    }));
  }

  const handleEarlyAdminHotkey = async (event) => {
    if (adminPanelReady) return;
    if (!isAdminHotkey(event)) return;
    if (event.repeat) return;
    if (isTypingTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    try {
      const canUseAdminPanel = await isCurrentPlayerAdmin();

      if (!canUseAdminPanel) {
        emitAdminBlockedToast('поставь is_admin=true в players или player_positions');
      }
    } catch (error) {
      console.warn('[home] admin recheck failed:', error);
      emitAdminBlockedToast('ошибка проверки is_admin');
    }
  };

  window.addEventListener('keydown', handleEarlyAdminHotkey, true);

  isCurrentPlayerAdmin()
    .then((canUseAdminPanel) => {
      if (!canUseAdminPanel || root.dataset.destroyed === 'true') {
        cleanupAdminPanel = () => {
          window.removeEventListener('keydown', handleEarlyAdminHotkey, true);
        };
        return;
      }

      const panelCleanup = enableAdminPanel({
        root,
        stage,
        viewport,
        playerMarker,
        playerPosition,
        cityId,
        nickname,
        mapControls,
        movementChannel: network.movementChannel,
      });

      function toggleAdminPanel() {
        if (!isDesktopDevice()) return;

        window.dispatchEvent(new CustomEvent('mn:admin-toggle'));
      }

      if (!panelCleanup) {
        const adminStatusButton = document.createElement('button');
        adminStatusButton.type = 'button';
        adminStatusButton.textContent = '👤';
        adminStatusButton.title = 'Админка не запустилась';
        adminStatusButton.className = 'admin-status-dot admin-status-dot-error';


        root.appendChild(adminStatusButton);

        cleanupAdminPanel = () => adminStatusButton.remove();
        return;
      }

      adminPanelReady = true;

      const adminStatusButton = document.createElement('button');
      adminStatusButton.type = 'button';
      adminStatusButton.textContent = '👤';
      adminStatusButton.title = 'Админка активна';
      adminStatusButton.className = 'admin-status-dot admin-status-dot-ok';


      root.appendChild(adminStatusButton);

      const handleAdminHotkey = (event) => {
        if (event?.[ADMIN_HOTKEY_EVENT_FLAG] === true) return;
        if (!isAdminHotkey(event)) return;
        if (event.repeat) return;
        if (isTypingTarget(event.target)) return;

        event[ADMIN_HOTKEY_EVENT_FLAG] = true;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        toggleAdminPanel();
      };

      window.addEventListener('keydown', handleAdminHotkey, true);

      cleanupAdminPanel = () => {
        adminPanelReady = false;
        window.removeEventListener('keydown', handleAdminHotkey, true);
        window.removeEventListener('keydown', handleEarlyAdminHotkey, true);
        adminStatusButton.remove();
        panelCleanup?.();
      };
    })
    .catch((error) => {
      console.warn('[home] admin panel disabled:', error);
    });

  const cleanupFogOfWar = enableFogOfWar({
    stage,
    viewport,
    playerMarker,
    playerPosition,
    cityId,
    playerId: localPlayerId,
  });

  root._cleanupHome = () => {
    root.dataset.destroyed = 'true';
    window.__MN_GAMEPLAY_ENTERED__ = false;

    window.removeEventListener('mn:session-blocked', handleSessionBlocked);
    window.removeEventListener('mn:player-balance-changed', handleBalanceChanged);
    window.removeEventListener('mn:player-health-changed', handleHealthChanged);
    window.removeEventListener('mn:player-vitals-changed', handleVitalsChanged);
    cancelAnimationFrame(balanceFrame);
    clearTimeout(balancePulseTimer);
    clearTimeout(balanceChangeTimer);
    clearTimeout(playerStatsSyncTimer);
    clearTimeout(healthHitTimer);
    vitalFeedbackTimers.forEach((timer) => clearTimeout(timer));
    vitalFeedbackTimers.clear();
    clearInterval(balanceSyncTimer);
    cleanupBalanceDatabaseSync?.();
    cleanupRenderPerformanceGuards?.();

    cleanupInventoryFeature?.();
    cleanupHospitalManagement?.();
    cleanupPlayerInteraction?.();
    cleanupPlayerStatusEffects?.();
    cleanupPlayerSurvival?.();
    cleanupPlayerKnockout?.();
    cleanupHousesFeature?.();
    cleanupSingleHouseModalMode?.();
    cleanupMovement?.();
    cleanupMobileJoystick?.();
    cleanupMobilePrompt?.();
    cleanupAdminPanel?.();
    cleanupEntityInteraction?.();
    cleanupInteriorExitReturn?.();
    cleanupHouseSpawnPicker?.();
    cleanupGameRealtime?.();
    cleanupMobileSelfMarker?.();
    entityInteractionPanel.cleanup();
    cleanupMobileGameplayChrome?.();
    cleanupSessionGuard?.();
    mapControls?.cleanup?.();
    cleanupFogOfWar?.();
    network.cleanup?.();

    resetHouseModalsOnHomeEnter();

    delete root.dataset.mobileControls;
    document.body?.classList.remove(
      'mn-landscape-game',
      'mn-mobile-game-enabled',
      'mn-desktop-game-enabled',
      'mn-mobile-device-detected',
      'mn-player-moving',
      'mn-force-rotate-landscape',
      'mn-real-landscape'
    );
    document.documentElement?.classList.remove(
      'mn-desktop-game-enabled',
      'mn-mobile-device-detected',
      'mn-player-moving',
      'mn-force-rotate-landscape',
      'mn-real-landscape'
    );
    root.classList.remove(PLAYER_HEALTH_LOW_CLASS, PLAYER_HEALTH_HIT_CLASS);
  };
});
