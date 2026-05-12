import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';
import { getCityWeather } from '../../src/weather/weather.js';
import {
  getLocalPlayerId,
  getOrCreatePlayerPosition,
  getCityPlayers,
  subscribeCityPlayers,
  createCityMovementChannel,
  setPlayerOffline,
} from '../../src/player/playerPosition.js';

import { enableMapControls, isLowPowerDevice } from '../../src/controls/mapControls.js';
import { enableKeyboardPlayerMovement } from '../../src/controls/keyboardMovement.js';

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
  if (weather.type !== 'hot') {
    return weather;
  }

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

function createPlayerMarkerHtml(player, localPlayerId) {
  const isSelf = player.playerId === localPlayerId;
  const updatedAt = new Date(player.updatedAt || Date.now()).getTime();

  return `
    <div
      class="gta-player-marker ${isSelf ? 'gta-player-marker-self' : 'gta-player-marker-other'}"
      style="left: ${player.x}%; top: ${player.y}%;"
      data-player-id="${player.playerId}"
      data-updated-at="${updatedAt}"
    >
      <span></span>
      <b>${player.nickname || 'Игрок'}</b>
    </div>
  `;
}

function renderPlayersHtml(players, localPlayerId) {
  return players.map((player) => createPlayerMarkerHtml(player, localPlayerId)).join('');
}

function upsertPlayerMarker(entities, player, localPlayerId) {
  if (!entities || !player?.playerId) return;

  const selector = `[data-player-id="${player.playerId}"]`;
  let marker = entities.querySelector(selector);

  if (!marker) {
    entities.insertAdjacentHTML('beforeend', createPlayerMarkerHtml(player, localPlayerId));
    return;
  }

  marker.style.left = `${player.x}%`;
  marker.style.top = `${player.y}%`;
  marker.dataset.updatedAt = String(new Date(player.updatedAt || Date.now()).getTime());

  const name = marker.querySelector('b');

  if (name) {
    name.textContent = player.nickname || 'Игрок';
  }
}

function removePlayerMarker(entities, playerId) {
  if (!entities || !playerId) return;

  const marker = entities.querySelector(`[data-player-id="${playerId}"]`);

  if (marker) {
    marker.remove();
  }
}

function startStalePlayersCleanup(entities) {
  const STALE_AFTER = 5000;

  const timer = setInterval(() => {
    const now = Date.now();

    entities.querySelectorAll('.gta-player-marker-other').forEach((marker) => {
      const updatedAt = Number(marker.dataset.updatedAt || 0);

      if (updatedAt && now - updatedAt > STALE_AFTER) {
        marker.remove();
      }
    });
  }, 1000);

  return () => clearInterval(timer);
}

function enableOfflineOnExit() {
  const goOffline = () => {
    setPlayerOffline().catch((error) => {
      console.warn('[home] set offline failed:', error);
    });
  };

  window.addEventListener('pagehide', goOffline);
  window.addEventListener('beforeunload', goOffline);

  return () => {
    window.removeEventListener('pagehide', goOffline);
    window.removeEventListener('beforeunload', goOffline);
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

  if (isLowPowerDevice()) {
    root.dataset.performance = 'low';
  } else {
    root.dataset.performance = 'normal';
  }

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
      </section>
    </main>
  `;

  const stage = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');
  const entities = root.querySelector('.gta-map-entities');
  const playerMarker = root.querySelector(`[data-player-id="${localPlayerId}"]`);

  const movementChannel = createCityMovementChannel(cityId, {
    onMove(player) {
      if (!player || player.playerId === localPlayerId) return;
      upsertPlayerMarker(entities, player, localPlayerId);
    },
  });

  const cleanupMovement = enableKeyboardPlayerMovement(
    playerMarker,
    playerPosition,
    cityId,
    nickname,
    movementChannel
  );

  const cleanupMapControls = enableMapControls(stage, viewport);
  const cleanupStalePlayers = startStalePlayersCleanup(entities);
  const cleanupOffline = enableOfflineOnExit();

  let cleanupRealtime = null;

  try {
    cleanupRealtime = subscribeCityPlayers(cityId, {
      onInsert(player) {
        upsertPlayerMarker(entities, player, localPlayerId);
      },

      onUpdate(player) {
        if (!player.isOnline) {
          removePlayerMarker(entities, player.playerId);
          return;
        }

        upsertPlayerMarker(entities, player, localPlayerId);
      },

      onDelete(playerId) {
        removePlayerMarker(entities, playerId);
      },
    });
  } catch (error) {
    console.warn('[home] realtime subscribe failed:', error);
  }

  root._cleanupHome = () => {
    cleanupMovement?.();
    cleanupMapControls?.();
    cleanupRealtime?.();
    cleanupStalePlayers?.();
    cleanupOffline?.();
    movementChannel?.unsubscribe?.();
  };
});
