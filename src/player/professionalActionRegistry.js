const actionDefinitions = new Map();
const accessCache = new Map();

const DEFAULT_ACCESS_CACHE_MS = 15_000;

function cleanId(value) {
  return String(value || '').trim();
}

function cacheKey(action, context = {}) {
  const actorTgId = cleanId(context.actorTgId);
  return `${action.id}:${actorTgId || 'anonymous'}`;
}

function normalizeAccess(access) {
  if (!access) return null;
  if (access === true) return {};
  if (typeof access !== 'object') return null;
  if (access.available === false) return null;
  return access;
}

export function registerProfessionalPlayerAction(action) {
  const id = cleanId(action?.id);

  if (!id) {
    throw new Error('Professional player action requires a stable id');
  }

  if (typeof action?.resolveAccess !== 'function') {
    throw new Error(`Professional player action "${id}" requires resolveAccess()`);
  }

  if (typeof action?.render !== 'function') {
    throw new Error(`Professional player action "${id}" requires render()`);
  }

  const definition = {
    ...action,
    id,
    order: Number.isFinite(Number(action.order)) ? Number(action.order) : 100,
    accessCacheMs: Math.max(
      0,
      Number.isFinite(Number(action.accessCacheMs))
        ? Number(action.accessCacheMs)
        : DEFAULT_ACCESS_CACHE_MS
    ),
  };

  actionDefinitions.set(id, definition);
  invalidateProfessionalPlayerActions(id);

  return () => {
    if (actionDefinitions.get(id) !== definition) return;
    actionDefinitions.delete(id);
    invalidateProfessionalPlayerActions(id);
  };
}

export function invalidateProfessionalPlayerActions(actionId = '') {
  const cleanActionId = cleanId(actionId);

  for (const key of accessCache.keys()) {
    if (!cleanActionId || key.startsWith(`${cleanActionId}:`)) {
      accessCache.delete(key);
    }
  }
}

async function resolveActionAccess(action, context, force) {
  const key = cacheKey(action, context);
  const cached = accessCache.get(key);
  const now = Date.now();

  if (!force && cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = Promise.resolve(action.resolveAccess(context))
    .then(normalizeAccess)
    .catch((error) => {
      accessCache.delete(key);
      console.warn(`[professionalActions] Access check failed for ${action.id}:`, error);
      return null;
    });

  accessCache.set(key, {
    promise,
    expiresAt: now + action.accessCacheMs,
  });

  return promise;
}

export async function loadAvailableProfessionalPlayerActions(context = {}, { force = false } = {}) {
  const definitions = [...actionDefinitions.values()]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

  const resolved = await Promise.all(
    definitions.map(async (action) => {
      const access = await resolveActionAccess(action, context, force);
      return access ? { action, access } : null;
    })
  );

  return resolved.filter(Boolean);
}
