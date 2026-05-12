import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';
import { getCityWeather } from '../../src/weather/weather.js';
import {
  getLocalPlayerId,
  getOrCreatePlayerPosition,
  getCityPlayers,
  updatePlayerPosition,
  subscribeCityPlayers,
  createCityMovementChannel,
  setPlayerOffline,
} from '../../src/player/playerPosition.js';

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function isLowPowerDevice() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const isSmallScreen = window.matchMedia('(max-width: 520px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return reducedMotion || memory <= 3 || cores <= 4 || isSmallScreen;
}

function enableMapControls(stage, viewport) {
  const lowPower = isLowPowerDevice();

  const MIN_SCALE = lowPower ? 0.82 : 0.9;
  const MAX_SCALE = lowPower ? 5.5 : 8;
  const WORLD_FACTOR = lowPower ? 1.38 : 1.55;

  let scale = 1;
  let x = 0;
  let y = 0;
  let worldWidth = 0;
  let worldHeight = 0;

  let isDragging = false;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let startMapX = 0;
  let startMapY = 0;

  let ticking = false;
  let pendingApply = false;

  const pointers = new Map();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchCenter = { x: 0, y: 0 };

  function measureWorld() {
    const rect = stage.getBoundingClientRect();

    worldWidth = Math.max(rect.width, rect.height) * WORLD_FACTOR;
    worldHeight = worldWidth * 0.72;

    viewport.style.width = `${worldWidth}px`;
    viewport.style.height = `${worldHeight}px`;
  }

  function getLimits() {
    const rect = stage.getBoundingClientRect();

    const w = worldWidth * scale;
    const h = worldHeight * scale;

    return {
      maxX: Math.max(0, (w - rect.width) / 2),
      maxY: Math.max(0, (h - rect.height) / 2),
    };
  }

  function applyTransformNow() {
    const limits = getLimits();

    x = clamp(x, -limits.maxX, limits.maxX);
    y = clamp(y, -limits.maxY, limits.maxY);

    viewport.style.transform =
      `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) scale(${scale})`;

    stage.style.setProperty('--zoom', scale.toFixed(2));
  }

  function applyTransform() {
    if (!lowPower) {
      applyTransformNow();
      return;
    }

    pendingApply = true;

    if (ticking) return;

    ticking = true;

    requestAnimationFrame(() => {
      if (pendingApply) {
        applyTransformNow();
        pendingApply = false;
      }

      ticking = false;
    });
  }

  function zoomAt(clientX, clientY, nextScale) {
    const rect = stage.getBoundingClientRect();

    const pointX = clientX - rect.left - rect.width / 2;
    const pointY = clientY - rect.top - rect.height / 2;

    const oldScale = scale;
    scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);

    const factor = scale / oldScale;

    x = pointX - (pointX - x) * factor;
    y = pointY - (pointY - y) * factor;

    applyTransform();
  }

  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.gta-map-header')) return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);

    if (pointers.size === 1) {
      isDragging = true;
      activePointerId = event.pointerId;

      startX = event.clientX;
      startY = event.clientY;
      startMapX = x;
      startMapY = y;
    } else if (pointers.size === 2) {
      isDragging = false;
      activePointerId = null;

      const [p1, p2] = [...pointers.values()];

      pinchStartDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchStartScale = scale;
      pinchCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };
    }
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (pinchStartDist > 0) {
        zoomAt(pinchCenter.x, pinchCenter.y, pinchStartScale * (dist / pinchStartDist));
      }

      return;
    }

    if (isDragging && event.pointerId === activePointerId) {
      x = startMapX + event.clientX - startX;
      y = startMapY + event.clientY - startY;
      applyTransform();
    }
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);

    if (pointers.size < 2) {
      pinchStartDist = 0;
    }

    if (pointers.size === 1) {
      const [remainingId] = [...pointers.keys()];
      const p = pointers.get(remainingId);

      isDragging = true;
      activePointerId = remainingId;

      startX = p.x;
      startY = p.y;
      startMapX = x;
      startMapY = y;
    }

    if (pointers.size === 0) {
      isDragging = false;
      activePointerId = null;
    }
  }

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', endPointer);

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();

    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    zoomAt(event.clientX, event.clientY, scale * (1 + delta));
  }, { passive: false });

  stage.addEventListener('dblclick', (event) => {
    if (scale > 1.1) {
      scale = 1;
      x = 0;
      y = 0;
      applyTransform();
      return;
    }

    zoomAt(event.clientX, event.clientY, lowPower ? 2 : 2.35);
  });

  window.addEventListener('resize', () => {
    measureWorld();
    applyTransform();
  });

  measureWorld();
  applyTransform();
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

function enableKeyboardPlayerMovement(marker, playerPosition, cityId, nickname, movementChannel) {
  if (!marker || !playerPosition) return;

  const keys = new Set();

  const SPEED = 0.12;
  const BROADCAST_INTERVAL = 45;
  const DB_SAVE_INTERVAL = 1200;
  const HEARTBEAT_DELAY = 1000;

  let x = Number(playerPosition.x) || 50;
  let y = Number(playerPosition.y) || 50;

  let animationId = null;
  let heartbeatTimer = null;
  let destroyed = false;

  let lastBroadcastAt = 0;
  let lastDbSaveAt = 0;
  let dbSaveInFlight = false;
  let dbSavePending = false;

  function renderPlayer() {
    x = clamp(x, 0, 100);
    y = clamp(y, 0, 100);

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
  }

  function broadcastMove() {
    const now = Date.now();

    if (now - lastBroadcastAt < BROADCAST_INTERVAL) return;

    lastBroadcastAt = now;

    movementChannel?.sendMove({
      playerId: getLocalPlayerId(),
      nickname,
      cityId,
      x,
      y,
      updatedAt: new Date().toISOString(),
    });
  }

  async function savePositionToDb(force = false) {
    const now = Date.now();

    if (!force && now - lastDbSaveAt < DB_SAVE_INTERVAL) {
      dbSavePending = true;
      return;
    }

    if (dbSaveInFlight) {
      dbSavePending = true;
      return;
    }

    dbSaveInFlight = true;
    dbSavePending = false;

    try {
      await updatePlayerPosition({
        cityId,
        nickname,
        x,
        y,
      });

      lastDbSaveAt = Date.now();
    } catch (error) {
      console.warn('[home] player position update failed:', error);
    } finally {
      dbSaveInFlight = false;

      if (dbSavePending && !destroyed) {
        savePositionToDb(false);
      }
    }
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {
      savePositionToDb(true);
      broadcastMove();
    }, HEARTBEAT_DELAY);
  }

  function loop() {
    if (destroyed) return;

    let moved = false;

    if (keys.has('w') || keys.has('ц')) {
      y -= SPEED;
      moved = true;
    }

    if (keys.has('s') || keys.has('ы')) {
      y += SPEED;
      moved = true;
    }

    if (keys.has('a') || keys.has('ф')) {
      x -= SPEED;
      moved = true;
    }

    if (keys.has('d') || keys.has('в')) {
      x += SPEED;
      moved = true;
    }

    if (moved) {
      renderPlayer();
      broadcastMove();
      savePositionToDb(false);
    }

    animationId = requestAnimationFrame(loop);
  }

  function onKeyDown(event) {
    const tag = document.activeElement?.tagName?.toLowerCase();

    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const key = event.key.toLowerCase();

    if (['w', 'a', 's', 'd', 'ц', 'ф', 'ы', 'в'].includes(key)) {
      event.preventDefault();
      keys.add(key);

      if (!animationId) {
        animationId = requestAnimationFrame(loop);
      }
    }
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());

    if (keys.size === 0 && animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;

      broadcastMove();
      savePositionToDb(true);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  renderPlayer();
  savePositionToDb(true);
  startHeartbeat();

  return () => {
    destroyed = true;
    clearInterval(heartbeatTimer);

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    broadcastMove();
    savePositionToDb(true);
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

  const cleanupStalePlayers = startStalePlayersCleanup(entities);
  const cleanupOffline = enableOfflineOnExit();

  let cleanupRealtime = null;

  try {
    cleanupRealtime = subscribeCityPlayers(cityId, {
      onInsert(player) {
        upsertPlayerMarker(entities, player, localPlayerId);
      },

      onUpdate(player) {
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
    cleanupRealtime?.();
    cleanupStalePlayers?.();
    cleanupOffline?.();
    movementChannel?.unsubscribe?.();
  };

  enableMapControls(stage, viewport);
});
