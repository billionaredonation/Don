const FALLBACK_RADIUS = 1.35;

const PROFILES = {
  standard: {
    radius: 1.35,
    bounds: [
      rect(22.4, 13.2, 55.2, 74.2),
    ],
    blocked: [
      rect(22.4, 28.2, 10.8, 43.8),
      rect(35.0, 55.0, 9.8, 16.0),
      rect(49.7, 54.0, 12.8, 21.6),
      rect(64.2, 51.0, 11.8, 22.2),
      rect(68.4, 15.1, 8.1, 26.6),
      rect(78.0, 13.8, 12.0, 28.5),
      rect(69.6, 75.2, 6.8, 9.9),
    ],
  },

  premium: {
    radius: 1.28,
    bounds: [
      rect(10.5, 10.1, 78.8, 41.5),
      rect(10.0, 41.8, 26.6, 24.0),
      rect(18.0, 58.0, 31.2, 31.5),
      rect(36.0, 50.0, 23.0, 39.5),
      rect(57.0, 50.0, 31.8, 39.5),
    ],
    blocked: [
      rect(10.5, 11.2, 8.0, 28.4),
      rect(24.8, 26.5, 14.5, 17.0),
      rect(40.8, 15.3, 10.4, 11.5),
      rect(58.5, 16.0, 8.4, 24.8),
      rect(71.4, 21.0, 7.4, 17.6),
      rect(72.2, 38.2, 6.7, 8.7),
      rect(83.6, 16.0, 5.8, 24.5),
      rect(61.6, 57.8, 16.8, 18.6),
      rect(77.3, 55.2, 8.0, 7.0),
      rect(19.8, 63.2, 11.6, 13.0),
      rect(20.6, 78.2, 14.1, 10.6),
      rect(43.6, 63.0, 5.6, 21.0),
      rect(37.8, 78.0, 4.8, 9.8),
    ],
  },

  ultra_lux: {
    radius: 1.18,
    bounds: [
      rect(4.3, 6.7, 27.0, 31.5),
      rect(4.4, 37.5, 23.5, 45.8),
      rect(27.4, 8.0, 43.7, 75.6),
      rect(30.6, 69.0, 33.7, 24.5),
      rect(69.5, 6.7, 26.5, 31.5),
      rect(69.5, 38.0, 26.6, 27.2),
      rect(69.5, 65.2, 26.6, 27.9),
    ],
    blocked: [
      rect(8.4, 13.8, 13.0, 16.6),
      rect(11.3, 69.0, 8.4, 12.8),
      rect(3.8, 51.1, 13.5, 16.4),
      rect(29.6, 48.0, 6.1, 28.0),
      rect(41.8, 45.7, 18.4, 10.0),
      rect(42.0, 61.6, 17.6, 9.0),
      rect(40.8, 18.2, 9.6, 21.5),
      rect(49.8, 20.0, 10.5, 19.5),
      rect(50.0, 27.7, 7.2, 9.8),
      rect(66.0, 15.0, 4.6, 24.0),
      rect(78.5, 21.5, 8.1, 17.6),
      rect(89.4, 12.0, 5.3, 26.0),
      rect(75.6, 49.5, 18.8, 14.5),
      rect(78.8, 73.0, 13.8, 15.8),
      rect(40.0, 79.8, 5.0, 9.0),
      rect(48.0, 81.8, 10.0, 8.0),
    ],
  },
};

function rect(x, y, width, height) {
  return {
    x1: x,
    y1: y,
    x2: x + width,
    y2: y + height,
  };
}

function clampPercent(value, fallback = 50) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(100, Math.max(0, number));
}

function profileFor(templateId) {
  return PROFILES[templateId] || PROFILES.standard;
}

function insideRect(point, box, padding = 0) {
  return (
    point.x >= box.x1 + padding &&
    point.x <= box.x2 - padding &&
    point.y >= box.y1 + padding &&
    point.y <= box.y2 - padding
  );
}

function hitsRect(point, box, padding = 0) {
  return (
    point.x >= box.x1 - padding &&
    point.x <= box.x2 + padding &&
    point.y >= box.y1 - padding &&
    point.y <= box.y2 + padding
  );
}

function isWalkable(templateId, point) {
  const profile = profileFor(templateId);
  const radius = profile.radius || FALLBACK_RADIUS;
  const safePoint = {
    x: clampPercent(point.x),
    y: clampPercent(point.y),
  };
  const insideBounds = profile.bounds.some((box) => insideRect(safePoint, box, radius));

  if (!insideBounds) return false;

  return !profile.blocked.some((box) => hitsRect(safePoint, box, radius));
}

function sanitizePosition(point) {
  return {
    x: clampPercent(point?.x),
    y: clampPercent(point?.y),
  };
}

export function snapInteriorPosition(templateId, point) {
  const base = sanitizePosition(point);

  if (isWalkable(templateId, base)) return base;

  for (let distance = 0.5; distance <= 8; distance += 0.5) {
    const candidates = [
      { x: base.x + distance, y: base.y },
      { x: base.x - distance, y: base.y },
      { x: base.x, y: base.y + distance },
      { x: base.x, y: base.y - distance },
      { x: base.x + distance, y: base.y + distance },
      { x: base.x - distance, y: base.y + distance },
      { x: base.x + distance, y: base.y - distance },
      { x: base.x - distance, y: base.y - distance },
    ].map(sanitizePosition);

    const valid = candidates.find((candidate) => isWalkable(templateId, candidate));
    if (valid) return valid;
  }

  return base;
}

export function resolveInteriorMovement(templateId, current, delta) {
  const start = snapInteriorPosition(templateId, current);
  const move = {
    x: Number(delta?.x) || 0,
    y: Number(delta?.y) || 0,
  };

  if (Math.abs(move.x) < 0.001 && Math.abs(move.y) < 0.001) {
    return start;
  }

  const direct = sanitizePosition({
    x: start.x + move.x,
    y: start.y + move.y,
  });

  if (isWalkable(templateId, direct)) return direct;

  const horizontal = sanitizePosition({
    x: start.x + move.x,
    y: start.y,
  });
  const vertical = sanitizePosition({
    x: start.x,
    y: start.y + move.y,
  });

  let resolved = start;

  if (isWalkable(templateId, horizontal)) {
    resolved = horizontal;
  }

  const verticalFromResolved = sanitizePosition({
    x: resolved.x,
    y: start.y + move.y,
  });

  if (isWalkable(templateId, verticalFromResolved)) {
    return verticalFromResolved;
  }

  if (resolved !== start) return resolved;

  return isWalkable(templateId, vertical) ? vertical : start;
}

export function isInteriorPointWalkable(templateId, point) {
  return isWalkable(templateId, point);
}
