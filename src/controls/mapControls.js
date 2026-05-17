function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isPortraitScreen() {
  return window.matchMedia('(orientation: portrait)').matches;
}

function isRotatedMobileScene() {
  const home = document.querySelector('.home');

  return (
    home?.dataset.mobileControls === 'enabled' &&
    isPortraitScreen()
  );
}

function rotateDelta(dx, dy) {
  if (!isRotatedMobileScene()) {
    return {
      x: dx,
      y: dy,
    };
  }

  return {
    x: dy,
    y: -dx,
  };
}

export function isLowPowerDevice() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;

  const isSmallScreen =
    window.matchMedia('(max-width: 520px)').matches;

  const reducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    reducedMotion ||
    memory <= 3 ||
    cores <= 4 ||
    isSmallScreen
  );
}

export function enableMapControls(stage, viewport, options = {}) {
  const lowPower = isLowPowerDevice();

  const MIN_SCALE = lowPower ? 0.82 : 0.9;
  const MAX_SCALE = lowPower ? 5.5 : 8;
  const WORLD_FACTOR = lowPower ? 1.38 : 1.55;

  let scale = Number(options.startScale) || 1;
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

  let pinchCenter = {
    x: 0,
    y: 0,
  };

  function measureWorld() {
    const rect = stage.getBoundingClientRect();

    worldWidth =
      Math.max(rect.width, rect.height) * WORLD_FACTOR;

    worldHeight = worldWidth * 0.72;

    viewport.style.width = `${worldWidth}px`;
    viewport.style.height = `${worldHeight}px`;

    if (options.focusX !== undefined && options.focusY !== undefined) {
      const focusX = Number(options.focusX);
      const focusY = Number(options.focusY);

      if (Number.isFinite(focusX) && Number.isFinite(focusY)) {
        const fx = (focusX / 100 - 0.5) * worldWidth * scale;
        const fy = (focusY / 100 - 0.5) * worldHeight * scale;

        x = -fx;
        y = -fy;
      }
    }
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

    const pointX =
      clientX - rect.left - rect.width / 2;

    const pointY =
      clientY - rect.top - rect.height / 2;

    const oldScale = scale;

    scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);

    const factor = scale / oldScale;

    x = pointX - (pointX - x) * factor;
    y = pointY - (pointY - y) * factor;

    applyTransform();
  }

  function onPointerDown(event) {
    if (
      event.target.closest('.gta-map-header') ||
      event.target.closest('.mobile-controls-layer') ||
      event.target.closest('.mobile-joystick')
    ) {
      return;
    }

    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

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

      pinchStartDist = Math.hypot(
        p2.x - p1.x,
        p2.y - p1.y
      );

      pinchStartScale = scale;

      pinchCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return;

    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];

      const dist = Math.hypot(
        p2.x - p1.x,
        p2.y - p1.y
      );

      if (pinchStartDist > 0) {
        zoomAt(
          pinchCenter.x,
          pinchCenter.y,
          pinchStartScale * (dist / pinchStartDist)
        );
      }

      return;
    }

    if (isDragging && event.pointerId === activePointerId) {
      const rawDx = event.clientX - startX;
      const rawDy = event.clientY - startY;

      const rotated = rotateDelta(rawDx, rawDy);

      x = startMapX + rotated.x;
      y = startMapY + rotated.y;

      applyTransform();
    }
  }

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

  function onWheel(event) {
    event.preventDefault();

    const delta =
      event.deltaY > 0 ? -0.12 : 0.12;

    zoomAt(
      event.clientX,
      event.clientY,
      scale * (1 + delta)
    );
  }

  function onDoubleClick() {
    scale = Number(options.startScale) || 2.35;
    applyTransform();
  }

  function onResize() {
    measureWorld();
    applyTransform();
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', endPointer);

  stage.addEventListener('wheel', onWheel, {
    passive: false,
  });

  stage.addEventListener('dblclick', onDoubleClick);

  window.addEventListener('resize', onResize);

  measureWorld();
  applyTransform();

  return () => {
    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointermove', onPointerMove);

    stage.removeEventListener('pointerup', endPointer);
    stage.removeEventListener('pointercancel', endPointer);
    stage.removeEventListener('pointerleave', endPointer);

    stage.removeEventListener('wheel', onWheel);
    stage.removeEventListener('dblclick', onDoubleClick);

    window.removeEventListener('resize', onResize);
  };

}
