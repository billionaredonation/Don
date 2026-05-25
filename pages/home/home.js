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
import { getMapObjects } from '../../src/mapObjects/mapObjectsRepository.js';
import {
  createMapObjectsLayer,
  renderMapObjects,
  getMapObjectIdFromEvent,
} from '../../src/mapObjects/mapObjectsRenderer.js';
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isHouseObject(object) {
  return object?.type === 'house' || object?.category === 'house' || object?.payload?.kind === 'house';
}

function createHouseSelectionPanel(root) {
  const panel = document.createElement('section');
  panel.className = 'house-selection-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <button class="house-selection-close" type="button" aria-label="Закрыть">×</button>
    <div class="house-selection-icon">🏠</div>
    <div class="house-selection-body">
      <strong class="house-selection-title">Дом</strong>
      <span class="house-selection-meta"></span>
    </div>
    <button class="house-selection-action" type="button">Выбрать</button>
  `;

  root.appendChild(panel);

  const closeButton = panel.querySelector('.house-selection-close');
  const titleEl = panel.querySelector('.house-selection-title');
  const metaEl = panel.querySelector('.house-selection-meta');
  const iconEl = panel.querySelector('.house-selection-icon');
  const actionButton = panel.querySelector('.house-selection-action');

  let selectedHouse = null;

  function close() {
    selectedHouse = null;
    panel.hidden = true;
  }

  function open(object) {
    selectedHouse = object;

    const houseClass = object?.payload?.houseClassLabel || object?.payload?.houseClass || object?.variant || 'standard';
    const price = Number(object?.payload?.price || 0);
    const ownerId = object?.payload?.ownerId || '';
    const ownerText = ownerId ? 'занят' : 'свободен';
    const priceText = price > 0 ? ` · ${price.toLocaleString('ru-RU')} $` : '';

    iconEl.textContent = object?.icon || '🏠';
    titleEl.textContent = object?.name || 'Дом';
    metaEl.innerHTML = `${escapeHtml(houseClass)} · ${escapeHtml(ownerText)}${escapeHtml(priceText)}`;
    panel.hidden = false;
  }

  closeButton.addEventListener('click', close);

  actionButton.addEventListener('click', () => {
    if (!selectedHouse) return;

    window.dispatchEvent(new CustomEvent('mn:house-selected', {
      detail: { house: selectedHouse },
    }));
  });

  return {
    open,
    close,
    cleanup() {
      panel.remove();
    },
  };
}

function enablePublicHouseSelection({ root, viewport, cityId, houseSelectionPanel }) {
  if (!root || !viewport || !cityId || !houseSelectionPanel) return null;

  const layer = createMapObjectsLayer();
  layer.classList.add('map-objects-layer-public');
  viewport.appendChild(layer);

  let houses = [];

  async function reloadHouses() {
    const objects = await getMapObjects(cityId);
    houses = objects.filter(isHouseObject);
    renderMapObjects(layer, houses);
  }

  function onClick(event) {
    const clickedObjectId = getMapObjectIdFromEvent(event);
    if (!clickedObjectId) return;

    const house = houses.find((object) => String(object.id) === String(clickedObjectId));
    if (!house) return;

    event.preventDefault();
    event.stopPropagation();
    houseSelectionPanel.open(house);
  }

  function onObjectsChanged(event) {
    if (event?.detail?.cityId && String(event.detail.cityId) !== String(cityId)) return;
    reloadHouses();
  }

  layer.addEventListener('click', onClick);
  window.addEventListener('mn:map-objects-changed', onObjectsChanged);
  reloadHouses();

  return () => {
    layer.removeEventListener('click', onClick);
    window.removeEventListener('mn:map-objects-changed', onObjectsChanged);
    layer.remove();
  };
}

register('home', async (root) => {
  root._cleanupHome?.();

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
      isAdmin: isAdmin,
    };

    state.is_admin = isAdmin;
    state.isAdmin = isAdmin;

    save();

    console.log('[home] admin check:', {
      nickname,
      playerPosition,
      statePlayer: state.player,
      stateIsAdmin: state.is_admin,
    });
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

        <header class="gta-map-header">
          <div class="gta-map-title">
            <span class="gta-time-badge">
              ${dayMode === 'day' ? '☀ День' : '☾ Ночь'}
            </span>

            <span class="gta-weather-badge">
              ${displayWeather.icon} ${displayWeather.label} · ${displayWeather.temperature}°C
            </span>

            <strong>${city.name}</strong>
          </div>

          <div class="gta-map-player">
            ${nickname}
          </div>
        </header>

        <div class="mobile-controls-layer"></div>
      </section>
    </main>
  `;

  const stage = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');
  const entities = root.querySelector('.gta-map-entities');
  const playerMarker = root.querySelector(`[data-player-id="${localPlayerId}"]`);
  const mobileControlsLayer = root.querySelector('.mobile-controls-layer');
  const houseSelectionPanel = createHouseSelectionPanel(root);

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
  let cleanupPublicHouseSelection = null;

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

  const canUseAdminPanel = true;

  console.log('[home] admin panel gate:', {
    canUseAdminPanel,
    playerPositionIsAdmin: playerPosition?.is_admin,
    playerPositionIsAdminAlt: playerPosition?.isAdmin,
    stateIsAdmin: state.is_admin,
  });

  cleanupPublicHouseSelection = enablePublicHouseSelection({
    root,
    viewport,
    cityId,
    houseSelectionPanel,
  });

  if (canUseAdminPanel) {
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

    const adminOpenButton = document.createElement('button');
    adminOpenButton.type = 'button';
    adminOpenButton.textContent = 'ADMIN';
    adminOpenButton.className = 'admin-open-button';

    adminOpenButton.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('mn:admin-toggle'));
    });

    root.appendChild(adminOpenButton);

    cleanupAdminPanel = () => {
      adminOpenButton.remove();
      panelCleanup?.();
    };

    console.log('[home] admin panel initialized');
  }

  const cleanupFogOfWar = enableFogOfWar({
    stage,
    viewport,
    playerMarker,
    playerPosition,
    cityId,
    playerId: localPlayerId,
  });

  root._cleanupHome = () => {
    cleanupMovement?.();
    cleanupMobileJoystick?.();
    cleanupMobilePrompt?.();
    cleanupAdminPanel?.();
    cleanupPublicHouseSelection?.();
    houseSelectionPanel.cleanup();
    cleanupSessionGuard?.();
    mapControls?.cleanup?.();
    cleanupFogOfWar?.();
    network.cleanup?.();

    delete root.dataset.mobileControls;
  };
});
