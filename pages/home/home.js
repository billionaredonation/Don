import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
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

function createMobileSelfMarkerHardOverlay() {
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
  marker.style.zIndex = '2147483647';
  marker.style.pointerEvents = 'none';
  marker.style.opacity = '1';
  marker.style.visibility = 'visible';
  marker.style.display = 'block';

  document.body.appendChild(marker);

  return () => {
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

function closeHouseListModals() {
  document
    .querySelectorAll('.houses-modal')
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

    frameId = requestAnimationFrame(enforceSingleModal);
    timeoutId = setTimeout(enforceSingleModal, 80);
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

  const playersHtml = renderPlayersHtml(cityPlayers, localPlayerId, nickname);

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
            <strong data-player-balance>${playerBalance.toLocaleString('ru-RU')} ₴</strong>
          </div>
        </section>

        <div class="mobile-self-player-indicator" aria-hidden="true">
          <div class="mobile-self-player-dot"></div>
        </div>
      </section>
    </main>

    <div class="mobile-controls-layer"></div>
  `;

  const stage = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');
  const entities = root.querySelector('.gta-map-entities');
  const playerMarker = root.querySelector(`[data-player-id="${localPlayerId}"]`);
  const mobileControlsLayer = root.querySelector('.mobile-controls-layer');
  const entityInteractionPanel = createEntityInteractionPanel(root);
  const isMobileGameplay = isMobileGameplayDevice();

  const cleanupHousesFeature = enableHousesFeature(root, {
    cityId,
    city,
  });

  const cleanupSingleHouseModalMode = enableSingleHouseModalMode(root);

  const mapControls = enableMapControls(stage, viewport, {
    focusX: playerPosition.x,
    focusY: playerPosition.y,

    /*
      На ПК и телефоне держим карту не слишком близко.
      Если будет слишком далеко/близко — меняется только это значение.
    */
    startScale: isMobileGameplayDevice() ? 1.55 : 1.25,
  });

  const network = setupPlayerNetwork({
    cityId,
    playerId: localPlayerId,
    localPlayerId,
    localNickname: nickname,
    entities,
  });

  const cleanupSessionGuard = setupSessionGuard(root);

  let cleanupMovement = null;
  let cleanupMobilePrompt = null;
  let cleanupMobileJoystick = null;
  let cleanupAdminPanel = null;
  let cleanupEntityInteraction = null;
  let cleanupGameRealtime = null;
  let cleanupMobileSelfMarker = null;

  const balanceEl = root.querySelector('[data-player-balance]');

  function updateBalance(balance) {
    const nextBalance = Number(balance || 0);

    state.player = {
      ...(state.player || {}),
      balance: nextBalance,
    };

    save();

    if (balanceEl) {
      balanceEl.textContent = `${nextBalance.toLocaleString('ru-RU')} ₴`;
    }
  }

  function handleBalanceChanged(event) {
    const nextBalance =
      event?.detail?.balance ??
      event?.detail?.player?.balance;

    if (nextBalance === undefined || nextBalance === null) return;

    updateBalance(nextBalance);
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

  window.addEventListener('mn:player-balance-changed', handleBalanceChanged);

  cleanupGameRealtime = setupGameRealtime({
    cityId,
    telegramId,
    onBalanceChanged(player) {
      updateBalance(player?.balance);
    },
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

      if (!panelCleanup) {
        const adminStatusButton = document.createElement('button');
        adminStatusButton.type = 'button';
        adminStatusButton.textContent = '👤';
        adminStatusButton.title = 'Админка не запустилась';
        adminStatusButton.className = 'admin-status-dot admin-status-dot-error';

        adminStatusButton.addEventListener('click', toggleAdminPanel);

        root.appendChild(adminStatusButton);

        cleanupAdminPanel = () => adminStatusButton.remove();
        return;
      }

      const adminStatusButton = document.createElement('button');
      adminStatusButton.type = 'button';
      adminStatusButton.textContent = '👤';
      adminStatusButton.title = 'Админка активна';
      adminStatusButton.className = 'admin-status-dot admin-status-dot-ok';

      adminStatusButton.addEventListener('click', toggleAdminPanel);

      root.appendChild(adminStatusButton);

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

    window.removeEventListener('mn:player-balance-changed', handleBalanceChanged);

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

    delete root.dataset.mobileControls;
    document.body?.classList.remove('mn-landscape-game');
  };
});
