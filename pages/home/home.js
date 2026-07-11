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
} from '../../src/player/playerPosition.js';

import { setupMobileControlPrompt } from '../../src/controls/mobileControlPrompt.js';

import { enableMapControls, isLowPowerDevice } from '../../src/controls/mapControls.js';
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

import '../../src/admin/adminPanel.css';
import '../../src/houses/houses.css';

const MOBILE_CONTROLS_KEY = 'mn-mobile-controls-enabled';

const BALANCE_COUNT_DURATION_MS = 1650;
const BALANCE_FEEDBACK_DURATION_MS = 1900;
const BALANCE_PULSE_DURATION_MS = 1250;

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

      <div class="player-balance-card" aria-label="Баланс игрока" data-player-balance-card>
        <span class="player-card-icon player-card-icon-green">₴</span>
        <strong data-player-balance title="${formatFullMoney(playerBalance)}">${formatHudMoney(playerBalance)}</strong>
        <span class="player-balance-change" data-player-balance-change hidden></span>
      </div>
    </section>

    <div class="mobile-controls-layer"></div>
  `;

  resetHouseModalsOnHomeEnter();

  const stage = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');
  const entities = root.querySelector('.gta-map-entities');
  const playerMarker = root.querySelector(`[data-player-id="${CSS.escape(String(localPlayerId))}"]`);
  const mobileControlsLayer = root.querySelector('.mobile-controls-layer');
  const entityInteractionPanel = createEntityInteractionPanel(root);

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
      Камера ближе к игроку на обоих устройствах. Размер мира ниже всё равно
      вычисляется от viewport и пропорций исходной карты, поэтому разные города
      не растягиваются и доступные границы карты не обрезаются.
    */
    startScale: isMobileGameplay ? 1.72 : 1.74,
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

  const balanceCard = root.querySelector('[data-player-balance-card]');
  const balanceEl = root.querySelector('[data-player-balance]');
  const balanceChangeEl = root.querySelector('[data-player-balance-change]');

  let currentBalance = Number(playerBalance || 0);
  let renderedBalance = currentBalance;
  let balanceFrame = null;
  let balancePulseTimer = null;
  let balanceChangeTimer = null;
  let balanceSyncTimer = null;
  let balanceSyncInFlight = false;
  let balanceSyncTransport = 'direct';

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

  function handleBalanceChanged(event) {
    const nextBalance =
      event?.detail?.balance ??
      event?.detail?.player?.balance;

    if (nextBalance === undefined || nextBalance === null) return;

    updateBalance(nextBalance, {
      delta: event?.detail?.delta,
      source: event?.detail?.source,
      durationMs: BALANCE_COUNT_DURATION_MS,
    });
  }

  async function loadBalanceSnapshot() {
    if (balanceSyncTransport === 'direct') {
      const { data, error } = await supabase
        .from('players')
        .select('id, tg_id, balance, updated_at')
        .eq('tg_id', String(telegramId))
        .maybeSingle();

      if (!error && data) {
        return data;
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
    return result?.player || null;
  }

  async function syncBalanceFromDatabase({ silent = false } = {}) {
    if (balanceSyncInFlight || !telegramId) return;

    balanceSyncInFlight = true;

    try {
      const playerSnapshot = await loadBalanceSnapshot();

      if (
        !playerSnapshot ||
        playerSnapshot.balance === undefined ||
        playerSnapshot.balance === null
      ) {
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

      if (!Number.isFinite(nextBalance) || nextBalance === currentBalance) {
        return;
      }

      updateBalance(nextBalance, {
        source: silent ? 'db_sync' : 'db_poll',
        durationMs: BALANCE_COUNT_DURATION_MS,
      });
    } catch (error) {
      console.warn('[home] balance db sync failed:', error);
    } finally {
      balanceSyncInFlight = false;
    }
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

  const handleSessionBlocked = () => {
    cleanupMobileSelfMarker?.();
    cleanupMobileSelfMarker = null;
    document.querySelector('[data-mobile-self-marker-hard="true"]')?.remove();
  };

  window.addEventListener('mn:session-blocked', handleSessionBlocked);
  window.addEventListener('mn:player-balance-changed', handleBalanceChanged);
  cleanupBalanceDatabaseSync = startBalanceDatabaseSync();

  cleanupGameRealtime = setupGameRealtime({
    cityId,
    telegramId,
    playerRowId: state.player?.id,
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

    window.removeEventListener('mn:session-blocked', handleSessionBlocked);
    window.removeEventListener('mn:player-balance-changed', handleBalanceChanged);
    cancelAnimationFrame(balanceFrame);
    clearTimeout(balancePulseTimer);
    clearTimeout(balanceChangeTimer);
    clearInterval(balanceSyncTimer);
    cleanupBalanceDatabaseSync?.();
    cleanupRenderPerformanceGuards?.();

    cleanupHousesFeature?.();
    cleanupSingleHouseModalMode?.();
    cleanupMovement?.();
    cleanupMobileJoystick?.();
    cleanupMobilePrompt?.();
    cleanupAdminPanel?.();
    cleanupEntityInteraction?.();
    cleanupGameRealtime?.();
    cleanupMobileSelfMarker?.();
    entityInteractionPanel.cleanup();
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
  };
});
