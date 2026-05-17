const FOG_KEY_PREFIX = 'mn_fog_v1';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
    localStorage.setItem(
      getFogKey(cityId, playerId),
      JSON.stringify([...cells])
    );
  } catch {}
}

function cellKey(x, y) {
  return `${x}:${y}`;
}

function revealAround(cells, playerX, playerY, gridSize, radius) {
  const cx = Math.round((playerX / 100) * gridSize);
  const cy = Math.round((playerY / 100) * gridSize);

  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x < 0 || y < 0 || x > gridSize || y > gridSize) continue;

      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= radius) {
        cells.add(cellKey(x, y));
      }
    }
  }
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

  const GRID_SIZE = 46;
  const REVEAL_RADIUS = 4;
  const VISION_RADIUS = 15;

  const canvas = document.createElement('canvas');
  canvas.className = 'fog-of-war-canvas';

  viewport.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const revealedCells = loadRevealedCells(cityId, playerId);

  let animationId = null;
  let destroyed = false;
  let lastX = null;
  let lastY = null;

  function resizeCanvas() {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawFog() {
    resizeCanvas();

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(5, 8, 12, 0.88)';
    ctx.fillRect(0, 0, w, h);

    const cellW = w / GRID_SIZE;
    const cellH = h / GRID_SIZE;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    for (const key of revealedCells) {
      const [gx, gy] = key.split(':').map(Number);
      const px = gx * cellW;
      const py = gy * cellH;

      const gradient = ctx.createRadialGradient(
        px,
        py,
        0,
        px,
        py,
        Math.max(cellW, cellH) * 2.2
      );

      gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.55, 'rgba(255,255,255,0.45)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(cellW, cellH) * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const playerX = clamp(Number(playerPosition.x) || 50, 0, 100);
    const playerY = clamp(Number(playerPosition.y) || 50, 0, 100);

    const px = (playerX / 100) * w;
    const py = (playerY / 100) * h;

    const liveGradient = ctx.createRadialGradient(
      px,
      py,
      0,
      px,
      py,
      Math.max(w, h) * (VISION_RADIUS / 100)
    );

    liveGradient.addColorStop(0, 'rgba(255,255,255,1)');
    liveGradient.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    liveGradient.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    liveGradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = liveGradient;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(w, h) * (VISION_RADIUS / 100), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    const cloudGradient = ctx.createRadialGradient(
      px,
      py,
      Math.max(w, h) * 0.08,
      px,
      py,
      Math.max(w, h) * 0.45
    );

    cloudGradient.addColorStop(0, 'rgba(255,255,255,0)');
    cloudGradient.addColorStop(0.55, 'rgba(160,180,200,0.06)');
    cloudGradient.addColorStop(1, 'rgba(210,225,240,0.14)');

    ctx.fillStyle = cloudGradient;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }

  function tick() {
    if (destroyed) return;

    const x = clamp(Number(playerPosition.x) || 50, 0, 100);
    const y = clamp(Number(playerPosition.y) || 50, 0, 100);

    const moved =
      lastX === null ||
      lastY === null ||
      Math.hypot(x - lastX, y - lastY) >= 0.25;

    if (moved) {
      revealAround(revealedCells, x, y, GRID_SIZE, REVEAL_RADIUS);
      saveRevealedCells(cityId, playerId, revealedCells);
      drawFog();
      lastX = x;
      lastY = y;
    }

    animationId = requestAnimationFrame(tick);
  }

  revealAround(
    revealedCells,
    Number(playerPosition.x) || 50,
    Number(playerPosition.y) || 50,
    GRID_SIZE,
    REVEAL_RADIUS
  );

  drawFog();
  tick();

  return () => {
    destroyed = true;
    if (animationId) cancelAnimationFrame(animationId);
    canvas.remove();
  };
}
