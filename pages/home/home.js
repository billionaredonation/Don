import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';
import { getCityWeather } from '../../src/weather/weather.js';
import { setupSessionGuard } from '../../src/network/sessionGuard.js';

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

import '../../src/admin/adminPanel.css';

const MOBILE_CONTROLS_KEY = 'mn-mobile-controls-enabled';

const MAP_FILES = import.meta.glob('../../*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

function isTruthyAdmin(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function getMapByFileName(fileName) {
  const entry = Object.entries(MAP_FILES).find(([path]) => path.endsWith(`/${fileName}`));
  return entry?.[1] || null;
}

function getCityMap(city) {
  const mapPath = String(city.map || '').replace(/^\.?\//, '');
  const mapFileName = mapPath.split('/').pop();

  return getMapByFileName(mapFileName) || getMapByFileName('UkraineMap.png');
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

function isAdminHotkey(event) {
  return (
    event.code === 'KeyP' ||
    event.key === 'p' ||
    event.key === 'P' ||
    event.key === 'з' ||
    event.key === 'З'
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

register('home', async (root) => {
  root._cleanupHome?.();

  delete root.dataset.destroyed;

  root.className = 'page home';

  const cityId = normalizeCityId(state.city);
  const city = getCityConfig(cityId);
  const dayMode = getUserDayMode();
  const nickname = state.nickname || 'Игрок';
  const localPlayerId = getLocalPlayerId();

  let weather = getFallbackWeather();

  try {
    weather = await getCityWeather(cityId);
  } catch (error) {
    console.warn('[home] weather loading failed:', error);
  }

  const displayWeather = getDisplayWeather(weather, dayMode);

  let playerPosition = null;

  try {
    playerPosition = await getOrCreatePlayerPosition(cityId, nickname);

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
  } catch (error) {
    console.warn('[home] player position loading failed:', error);

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

  let cityPlayers = [];

  try {
    cityPlayers = await getCityPlayers(cityId);
  } catch (error) {
    console.warn('[home] city players loading failed:', error);
    cityPlayers = [playerPosition];
  }

  const hasSelf = cityPlayers.some((player) => String(player.playerId) === String(localPlayerId));

  if (!hasSelf) {
    cityPlayers.unshift({
      ...playerPosition,
      playerId: localPlayerId,
      nickname,
    });
  }

  const playersHtml = renderPlayersHtml(cityPlayers, localPlayerId);

  if (state.city !== cityId) {
    state.city = cityId;
    state.cityName = city.name;
    save();
  }

  const mapSrc = getCityMap(city);

  const telegramId =
    state.telegramId ||
    state.player?.telegramId ||
    state.player?.tg_id ||
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
    '123456789';

  const playerBalance = Number(state.player?.balance || 0);

  const cityStats = {
    housesTotal: 128,
    housesFree: 42,
    businessTotal: 56,
    businessFree: 18,
    freeSlots: 60,
    online: cityPlayers.length || 1,
    ping: 42,
  };

  const housesFreePercent = Math.round((cityStats.housesFree / cityStats.housesTotal) * 100);
  const businessFreePercent = Math.round((cityStats.businessFree / cityStats.businessTotal) * 100);
  const freeSlotsPercent = Math.round(
    (cityStats.freeSlots / (cityStats.housesTotal + cityStats.businessTotal)) * 100
  );

  root.dataset.city = cityId;
  root.dataset.time = dayMode;
  root.dataset.weather = weather.type;
  root.dataset.performance = isLowPowerDevice() ? 'low' : 'normal';

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

        <div class="gta-map-viewport">
          <div class="gta-map-weather">
            <div class="gta-weather-sun"></div>
            <div class="gta-weather-clouds"></div>
            <div class="gta-weather-rain"></div>
            <div class="gta-weather-heat"></div>
          </div>

          <div class="gta-map-entities">
            ${playersHtml}
          </div>

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
        </div>

        <section class="player-glass-hud" aria-label="Игровой HUD">
          <div class="player-hud-left">
            <button class="player-city-button" type="button" aria-label="Открыть статистику города">
              <span>${city.name}</span>
              <b>›</b>
            </button>

            <div class="player-weather-mini">
              <span>${dayMode === 'day' ? '☀' : '☾'}</span>
              <span>${displayWeather.icon}</span>
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


          <div class="player-balance-card" aria-label="Баланс игрока">
            <span class="player-card-icon player-card-icon-green">₴</span>
            <strong>${playerBalance.toLocaleString('ru-RU')} ₴</strong>

              <span class="player-balance-info">
                <em>Баланс</em>
                <strong>${playerBalance.toLocaleString('ru-RU')} ₴</strong>
              </span>
            </div>
          </div>



        <div class="city-stats-modal" hidden>
          <div class="city-stats-backdrop" data-city-stats-close></div>

          <section class="city-stats-panel" role="dialog" aria-modal="true" aria-label="${city.name} — статистика">
            <header class="city-stats-header">
              <strong>${city.name} — статистика</strong>
              <button type="button" data-city-stats-close>×</button>
            </header>

            <div class="city-stats-grid">
              <article class="city-stat-card city-stat-purple">
                <span class="city-stat-icon">▥</span>
                <em>Дома</em>
                <strong>${cityStats.housesTotal}</strong>
                <small>Свободно: ${cityStats.housesFree}</small>
                <div class="city-stat-progress">
                  <i style="width:${housesFreePercent}%"></i>
                </div>
                <b>${housesFreePercent}%</b>
              </article>

              <article class="city-stat-card city-stat-green">
                <span class="city-stat-icon">▤</span>
                <em>Бизнесы</em>
                <strong>${cityStats.businessTotal}</strong>
                <small>Свободно: ${cityStats.businessFree}</small>
                <div class="city-stat-progress">
                  <i style="width:${businessFreePercent}%"></i>
                </div>
                <b>${businessFreePercent}%</b>
              </article>

              <article class="city-stat-card city-stat-orange">
                <span class="city-stat-icon">◎</span>
                <em>Свободные слоты</em>
                <strong>${cityStats.freeSlots}</strong>
                <small>дома + бизнесы</small>
                <div class="city-stat-progress">
                  <i style="width:${freeSlotsPercent}%"></i>
                </div>
                <b>${freeSlotsPercent}%</b>
              </article>

              <article class="city-stat-card city-stat-blue">
                <span class="city-stat-icon">●●</span>
                <em>Пользователей</em>
                <strong>${cityStats.online}</strong>
                <small>Онлайн</small>
                <div class="city-stat-progress">
                  <i style="width:68%"></i>
                </div>
                <b>live</b>
              </article>
            </div>

            <button class="city-stats-close-button" type="button" data-city-stats-close>
              Закрыть
            </button>
          </section>
        </div>

        <div class="mobile-controls-layer"></div>
      </section>
    </main>
  `;

  const stage = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');
  const entities = root.querySelector('.gta-map-entities');
  const playerMarker = root.querySelector(`[data-player-id="${localPlayerId}"]`);
  const mobileControlsLayer = root.querySelector('.mobile-controls-layer');
  const entityInteractionPanel = createEntityInteractionPanel(root);

  const cityStatsModal = root.querySelector('.city-stats-modal');
  const cityButton = root.querySelector('.player-city-button');
  const cityStatsCloseButtons = root.querySelectorAll('[data-city-stats-close]');

  function openCityStats() {
    if (!cityStatsModal) return;

    cityStatsModal.hidden = false;
    root.dataset.cityStatsOpen = 'true';
  }

  function closeCityStats() {
    if (!cityStatsModal) return;

    cityStatsModal.hidden = true;
    delete root.dataset.cityStatsOpen;
  }

  cityButton?.addEventListener('click', openCityStats);

  cityStatsCloseButtons.forEach((button) => {
    button.addEventListener('click', closeCityStats);
  });

  const mapControls = enableMapControls(stage, viewport, {
    focusX: playerPosition.x,
    focusY: playerPosition.y,
    startScale: isLowPowerDevice() ? 2.65 : 4.95,
  });

  const network = setupPlayerNetwork({
    cityId,
    playerId: localPlayerId,
    localPlayerId,
    entities,
  });

  const cleanupSessionGuard = setupSessionGuard(root);
  const isMobileGameplay = isMobileGameplayDevice();

  let cleanupMovement = null;
  let cleanupMobilePrompt = null;
  let cleanupMobileJoystick = null;
  let cleanupAdminPanel = null;
  let cleanupEntityInteraction = null;

  function enableMobileGameplayMode() {
    root.dataset.mobileControls = 'enabled';

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
  });

  isCurrentPlayerAdmin()
    .then((canUseAdminPanel) => {
      if (!canUseAdminPanel || root.dataset.destroyed === 'true') {
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

      if (!panelCleanup) {
        const fail = document.createElement('div');
        fail.textContent = 'ADMIN PANEL INIT FAILED';
        fail.style.cssText = `
          position: fixed;
          right: 12px;
          bottom: 12px;
          z-index: 999999;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(160, 20, 20, 0.95);
          color: #fff;
          font: 900 12px system-ui;
        `;
        document.body.appendChild(fail);

        cleanupAdminPanel = () => fail.remove();
        return;
      }

      function setAdminPanelVisible(nextVisible) {
        const panel = root.querySelector('.admin-panel');
        if (!panel) return false;

        panel.hidden = !nextVisible;
        root.dataset.adminMode = nextVisible ? 'enabled' : 'disabled';

        if (nextVisible) {
          delete root.dataset.adminTeleportMode;
        }

        return true;
      }

      function toggleAdminPanel() {
        const panel = root.querySelector('.admin-panel');

        if (panel) {
          setAdminPanelVisible(panel.hidden);
          return;
        }

        window.dispatchEvent(new CustomEvent('mn:admin-toggle'));
      }

      const adminOpenButton = document.createElement('button');
      adminOpenButton.type = 'button';
      adminOpenButton.textContent = 'ADMIN';
      adminOpenButton.className = 'admin-open-button';
      adminOpenButton.style.zIndex = '999999';
      adminOpenButton.addEventListener('click', toggleAdminPanel);

      root.appendChild(adminOpenButton);

      const handleAdminHotkey = (event) => {
        if (!isAdminHotkey(event)) return;
        if (isTypingTarget(event.target)) return;

        event.preventDefault();
        event.stopPropagation();

        toggleAdminPanel();
      };

      window.addEventListener('keydown', handleAdminHotkey, true);
      document.addEventListener('keydown', handleAdminHotkey, true);

      cleanupAdminPanel = () => {
        window.removeEventListener('keydown', handleAdminHotkey, true);
        document.removeEventListener('keydown', handleAdminHotkey, true);
        adminOpenButton.remove();
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

    closeCityStats();

    cleanupMovement?.();
    cleanupMobileJoystick?.();
    cleanupMobilePrompt?.();
    cleanupAdminPanel?.();
    cleanupEntityInteraction?.();
    entityInteractionPanel.cleanup();
    cleanupSessionGuard?.();
    mapControls?.cleanup?.();
    cleanupFogOfWar?.();
    network.cleanup?.();

    delete root.dataset.mobileControls;
  };
});
