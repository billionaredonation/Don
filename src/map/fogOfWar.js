const FOG_KEY_PREFIX = 'mn_fog_v2';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isMobileGameplayDevice() {
  const hasTouch = navigator.maxTouchPoints > 0;
  const minSide = Math.min(
    window.visualViewport?.width || window.innerWidth || 9999,
    window.visualViewport?.height || window.innerHeight || 9999,
  );

  return hasTouch && minSide <= 920;
}

function getFogKey(cityId, playerId) {
  return `${FOG_KEY_PREFIX}_${cityId}_${playerId}`;
}

function loadRevealedCells(cityId, playerId) {
  try {
    const raw = localStorage.getItem(getFogKey(cityId, playerId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveRevealedCells(cityId, playerId, cells) {
  try {
    localStorage.setItem(getFogKey(cityId, playerId), JSON.stringify([...cells]));
  } catch {
    // localStorage can fail in WebView private/cache modes; fog must not break movement.
  }
}

function getViewportCssSize(viewport, fallbackWidth = 1024, fallbackHeight = 768) {
  const styleWidth = Number.parseFloat(viewport?.style?.width || '');
  const styleHeight = Number.parseFloat(viewport?.style?.height || '');

  const width =
    (Number.isFinite(styleWidth) && styleWidth > 0 ? styleWidth : 0) ||
    viewport?.clientWidth ||
    viewport?.offsetWidth ||
    fallbackWidth;

  const height =
    (Number.isFinite(styleHeight) && styleHeight > 0 ? styleHeight : 0) ||
    viewport?.clientHeight ||
    viewport?.offsetHeight ||
    fallbackHeight;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function cellKey(x, y) {
  return `${x}:${y}`;
}

function parseCellKey(key) {
  const [x, y] = String(key).split(':').map(Number);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

function revealAround(cells, playerX, playerY, gridSize, radius) {
  const cx = Math.round((playerX / 100) * gridSize);
  const cy = Math.round((playerY / 100) * gridSize);
  let changed = false;

  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x < 0 || y < 0 || x > gridSize || y > gridSize) continue;
      if (Math.hypot(x - cx, y - cy) > radius) continue;

      const key = cellKey(x, y);

      if (!cells.has(key)) {
        cells.add(key);
        changed = true;
      }
    }
  }

  return changed;
}

export function enableFogOfWar({
  stage,
  viewport,
  playerMarker,
  playerPosition,
  cityId,
  playerId,
}) {
  if (!stage || !viewport || !playerMarker || !playerPosition) return null;

  const mobile = isMobileGameplayDevice();

  /*
    Старый fog лагал накопительно: каждый шаг писал localStorage и перерисовывал
    сотни/тысячи radial-gradient на canvas размером с getBoundingClientRect(),
    который уже учитывал transform карты. Через пару минут это превращалось в
    тяжёлый GPU/CPU ком. Здесь fog работает в низком разрешении, сохраняется
    дебаунсом и не крутит бесконечный requestAnimationFrame на 60fps.
  */
  const GRID_SIZE = mobile ? 28 : 42;
  const REVEAL_RADIUS = mobile ? 2 : 3;
  const VISION_RADIUS = mobile ? 17 : 15;
  const LOOP_DELAY_MS = mobile ? 320 : 120;
  const SAVE_DELAY_MS = mobile ? 1800 : 900;
  const MIN_MOVE_PERCENT = mobile ? 0.85 : 0.28;
  const MAX_CANVAS_SIDE = mobile ? 560 : 1280;

  const canvas = document.createElement('canvas');

  canvas.className = 'fog-of-war-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '35';
  canvas.style.contain = 'strict';

  viewport.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  const revealedCells = loadRevealedCells(cityId, playerId);

  let destroyed = false;
  let loopTimer = 0;
  let saveTimer = 0;
  let lastX = null;
  let lastY = null;
  let lastCanvasWidth = 0;
  let lastCanvasHeight = 0;
  let lastDrawKey = '';

  function resizeCanvas() {
    const cssSize = getViewportCssSize(viewport);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 0.7 : 1.25);
    const capScale = Math.min(1, MAX_CANVAS_SIDE / Math.max(cssSize.width, cssSize.height));
    const internalScale = Math.max(0.35, pixelRatio * capScale);

    const nextWidth = Math.max(1, Math.round(cssSize.width * internalScale));
    const nextHeight = Math.max(1, Math.round(cssSize.height * internalScale));

    if (canvas.width === nextWidth && canvas.height === nextHeight) {
      return false;
    }

    canvas.width = nextWidth;
    canvas.height = nextHeight;
    lastCanvasWidth = nextWidth;
    lastCanvasHeight = nextHeight;
    lastDrawKey = '';

    return true;
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);

    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      saveRevealedCells(cityId, playerId, revealedCells);
    }, SAVE_DELAY_MS);
  }

  function drawRevealedCells(w, h) {
    const cellW = w / GRID_SIZE;
    const cellH = h / GRID_SIZE;
    const radius = Math.max(cellW, cellH) * (mobile ? 1.45 : 1.75);

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    if (mobile) {
      ctx.fillStyle = 'rgba(255,255,255,0.82)';

      for (const key of revealedCells) {
        const cell = parseCellKey(key);
        if (!cell) continue;

        const px = cell.x * cellW;
        const py = cell.y * cellH;

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      return;
    }

    for (const key of revealedCells) {
      const cell = parseCellKey(key);
      if (!cell) continue;

      const px = cell.x * cellW;
      const py = cell.y * cellH;
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);

      gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.7, 'rgba(255,255,255,0.45)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawLiveVision(w, h, playerX, playerY) {
    const px = (playerX / 100) * w;
    const py = (playerY / 100) * h;
    const visionRadius = Math.max(w, h) * (VISION_RADIUS / 100);

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    const gradient = ctx.createRadialGradient(px, py, 0, px, py, visionRadius);

    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.82)');
    gradient.addColorStop(0.78, 'rgba(255,255,255,0.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, visionRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFog(force = false) {
    if (!ctx || destroyed) return;

    resizeCanvas();

    const playerX = clamp(toFiniteNumber(playerPosition.x, 50), 0, 100);
    const playerY = clamp(toFiniteNumber(playerPosition.y, 50), 0, 100);
    const w = canvas.width;
    const h = canvas.height;
    const drawKey = [
      Math.round(playerX * 10) / 10,
      Math.round(playerY * 10) / 10,
      revealedCells.size,
      w,
      h,
    ].join('|');

    if (!force && drawKey === lastDrawKey) return;

    lastDrawKey = drawKey;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = mobile ? 'rgba(5, 8, 12, 0.72)' : 'rgba(5, 8, 12, 0.84)';
    ctx.fillRect(0, 0, w, h);

    drawRevealedCells(w, h);
    drawLiveVision(w, h, playerX, playerY);
  }

  function tick() {
    if (destroyed) return;

    if (document.hidden) {
      loopTimer = window.setTimeout(tick, 1000);
      return;
    }

    const x = clamp(toFiniteNumber(playerPosition.x, 50), 0, 100);
    const y = clamp(toFiniteNumber(playerPosition.y, 50), 0, 100);
    const resized = resizeCanvas();
    const moved =
      lastX === null ||
      lastY === null ||
      Math.hypot(x - lastX, y - lastY) >= MIN_MOVE_PERCENT;

    if (moved) {
      const changed = revealAround(revealedCells, x, y, GRID_SIZE, REVEAL_RADIUS);

      if (changed) scheduleSave();

      lastX = x;
      lastY = y;
      drawFog(true);
    } else if (resized || lastCanvasWidth !== canvas.width || lastCanvasHeight !== canvas.height) {
      drawFog(true);
    }

    loopTimer = window.setTimeout(tick, LOOP_DELAY_MS);
  }

  function onResize() {
    drawFog(true);
  }

  revealAround(
    revealedCells,
    toFiniteNumber(playerPosition.x, 50),
    toFiniteNumber(playerPosition.y, 50),
    GRID_SIZE,
    REVEAL_RADIUS,
  );

  drawFog(true);
  scheduleSave();
  loopTimer = window.setTimeout(tick, LOOP_DELAY_MS);

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.visualViewport?.addEventListener?.('resize', onResize, { passive: true });

  return () => {
    destroyed = true;
    window.clearTimeout(loopTimer);
    window.clearTimeout(saveTimer);
    saveRevealedCells(cityId, playerId, revealedCells);

    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.visualViewport?.removeEventListener?.('resize', onResize);

    canvas.remove();
  };
}
