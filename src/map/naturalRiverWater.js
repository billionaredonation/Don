/**
 * Procedural river water for the in-game terrain layer.
 * Produces broad smooth eddies and hundreds of short CURVED highlights, NOT stripes.
 * Uses a low-resolution off-screen surface that is scaled together with the map;
 * PNG mask stays attached to the world map, never the screen/camera.
 */
export function enableNaturalRiverWater(viewport) {
  const canvas = viewport?.querySelector('.gta-map-animated-water .gta-water-surface');
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return () => {};

  const mobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The physical map is ~1671 x 941; ~0.5x is sufficient for this subtle water.
  const width = mobile ? 620 : 940;
  const height = Math.round(width * (941 / 1671));
  canvas.width = width;
  canvas.height = height;

  const TAU = Math.PI * 2;
  let seed = 0x2ce47d5;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const background = document.createElement('canvas');
  background.width = width;
  background.height = height;
  const bgCtx = background.getContext('2d', { alpha: false });
  if (!bgCtx) return () => {};
  const image = bgCtx.createImageData(width, height);
  // Fine organic noise plus large turbulent swirls; precomputed ONCE, not per frame.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xx = x / width, yy = y / height;
      const warp = Math.sin(xx * 29 + Math.sin(yy * 18) * 1.2) * 0.06;
      const v = Math.sin(xx * 24 + yy * 15 + warp * 24) * 5
        + Math.sin(xx * 57 - yy * 37 + Math.cos(xx * 11) * 1.7) * 3
        + Math.sin(xx * 9 + yy * 17) * 4 + (rand() - .5) * 2.3;
      const i = (y * width + x) * 4;
      image.data[i] = Math.max(0, 10 + v * .6);
      image.data[i + 1] = Math.max(0, 78 + v * 1.2);
      image.data[i + 2] = Math.max(0, 100 + v * 1.5);
      image.data[i + 3] = 255;
    }
  }
  bgCtx.putImageData(image, 0, 0);

  const ripples = Array.from({ length: mobile ? 200 : 390 }, (_, i) => ({
    x: rand() * width, y: rand() * height,
    len: (3 + rand() * 15) * (i % 7 === 0 ? 1.6 : 1),
    bend: (rand() * 2 - 1) * 5,
    speed: .09 + rand() * .36,
    phase: rand() * TAU,
    width: .35 + rand() * 1.15,
    opacity: .055 + rand() * .17,
    pale: rand() > .18,
  }));
  const pools = Array.from({ length: mobile ? 14 : 24 }, () => ({
    x: rand() * width, y: rand() * height,
    rad: 22 + rand() * 60, phase: rand() * TAU,
    opacity: .025 + rand() * .035,
  }));

  let frameId = 0;
  let stopped = false;
  let last = -1000;
  const targetInterval = mobile ? 1000 / 18 : 1000 / 25;
  const paint = (milliseconds) => {
    if (stopped) return;
    if (!reduced) frameId = requestAnimationFrame(paint);
    if (document.hidden || (milliseconds - last) < targetInterval) return;
    last = milliseconds;
    const t = reduced ? 0 : milliseconds / 1000;
    ctx.drawImage(background, 0, 0);

    // Slowly moving soft pools, like rolling gradients beneath the surface.
    ctx.globalCompositeOperation = 'screen';
    for (const p of pools) {
      const px = p.x + Math.sin(t * .1 + p.phase) * 16;
      const py = p.y + Math.cos(t * .13 + p.phase) * 10;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, p.rad);
      grad.addColorStop(0, `rgba(65,155,162,${p.opacity})`);
      grad.addColorStop(1, 'rgba(65,155,162,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();ctx.arc(px, py, p.rad, 0, TAU);ctx.fill();
    }

    // Curved mini-ripples with independent directions and speeds.
    // Each fades gently as it travels; nothing repeats in parallel rows.
    ctx.lineCap = 'round';
    for (const p of ripples) {
      const drift = t * p.speed;
      const px = (p.x + drift * 8 + Math.sin(p.phase + t * .18) * 2) % width;
      const py = (p.y + drift * 3 + Math.cos(p.phase + t * .24) * 2) % height;
      const pulse = .55 + .45 * Math.sin(t * (.33 + p.speed) + p.phase);
      ctx.strokeStyle = p.pale
        ? `rgba(190,241,226,${p.opacity * pulse})`
        : `rgba(5,40,61,${p.opacity * pulse})`;
      ctx.lineWidth = p.width;
      ctx.beginPath();
      ctx.moveTo(px - p.len * .5, py + p.bend * .4);
      ctx.quadraticCurveTo(px + p.bend * .65, py - p.bend, px + p.len * .5, py + p.bend * .2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  if (reduced) paint(0);
  else frameId = requestAnimationFrame(paint);
  return () => { stopped = true; cancelAnimationFrame(frameId); canvas.width = 0; canvas.height = 0; };
}
