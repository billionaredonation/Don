import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';
import { getCityWeather } from '../../src/weather/weather.js';
import {
  getLocalPlayerId,a
} from '../../src/player/playerPosition.js';

import { setupMobileControlPrompt } from '../../src/controls/mobileControlPrompt.js';

import { enableMapControls, isLowPowerDevice } from '../../src/controls/mapControls.js';
import { enableKeyboardPlayerMovement } from '../../src/controls/keyboardMovement.js';
import { enableMobileJoystick } from '../../src/controls/mobileJoystick.js';

import { setupPlayerNetwork } from '../../src/network/playerNetwork.js';
import { renderPlayersHtml } from '../../src/player/playerMarkerView.js';
import { enableFogOfWar } from '../../src/map/fogOfWar.js';

const MAP_FILES = import.meta.glob('../../*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

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
  } catch (error) {
    console.warn('[home] player position loading failed:', error);

    playerPosition = {
      playerId: localPlayerId,
      x: 50,
      y: 50,
      nickname,
    };
  }

  let cityPlayers = [];

  try {
    cityPlayers = await getCityPlayers(cityId);
  } catch (error) {
    console.warn('[home] city players loading failed:', error);
    cityPlayers = [playerPosition];
  }

  const hasSelf = cityPlayers.some((player) => player.playerId === localPlayerId);

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

  const network = setupPlayerNetwork({
    cityId,
    entities,
    localPlayerId,
  });

  const cleanupMovement = enableKeyboardPlayerMovement(
    playerMarker,
    playerPosition,
    cityId,
    nickname,
    mapControls,
    network.movementChannel
  );

const cleanupMobilePrompt = setupMobileControlPrompt({
  root,
  layer: mobileControlsLayer,
  enableJoystick() {
    return enableMobileJoystick(
      mobileControlsLayer,
      playerMarker,
      playerPosition,
      cityId,
      nickname,
      network.movementChannel
    );
  },
});
const mapControls = enableMapControls(stage, viewport, {
  focusX: playerPosition.x,
  focusY: playerPosition.y,
 startScale: isLowPowerDevice() ? 2.55 : 3.25,
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
    cleanupMovement?.();
    cleanupMobilePrompt?.();
    cleanupMapControls?.();
    cleanupFogOfWar?.();
    network.cleanup?.();
  };
});
