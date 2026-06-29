import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

import {
  createMapObjectsLayer,
  renderMapObjects,
  getMapObjectIdFromEvent,
  findMapObjectElement,
} from '../mapObjects/mapObjectsRenderer.js';

import { dispatchEntityAction } from './entityActions.js';

const INTERACTION_RADIUS_PX = 86;
const MOBILE_INTERACTION_RADIUS_PX = 154;
const DIRECT_TAP_RADIUS_PX = 220;
const MOBILE_FREE_TAP_RADIUS_PX = 240;
const INTERACTION_HINT_VISIBLE_MS = 2200;
const MAP_OBJECTS_SNAPSHOT_INTERVAL_MS = 1400;

function getPurchasedHouseId(detail = {}) {
  return detail.houseId || detail.result?.houseId || detail.house?.payload?.houseId || null;
}

function getPurchasedMapObjectId(detail = {}) {
  return detail.mapObjectId || detail.house?.id || null;
}

function getPurchasedOwnerId(detail = {}) {
  return detail.ownerId || detail.result?.ownerId || detail.result?.playerId || null;
}

function getPurchasedOwnerName(detail = {}) {
  return detail.ownerName || detail.result?.ownerName || 'Игрок';
}

function getMapObjectHouseId(object) {
  return object?.payload?.houseId || object?.houseId || null;
}

function isSameHouseObject(object, purchasedHouseId, purchasedMapObjectId) {
  if (!object) return false;

  if (purchasedMapObjectId && String(object.id) === String(purchasedMapObjectId)) {
    return true;
  }

  if (purchasedHouseId && String(getMapObjectHouseId(object)) === String(purchasedHouseId)) {
    return true;
  }

  return false;
}

function markObjectAsPurchased(object, ownerId, ownerName) {
  if (!object || !ownerId) return object;

  return {
    ...object,
    owner_id: ownerId,
    ownerName,
    payload: {
      ...(object.payload || {}),
      ownerId,
      ownerName,
      owned: true,
    },
  };
}

function isTypingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();

  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target?.isContentEditable === true
  );
}

function isInteractKey(event) {
  const key = String(event.key || '').toLowerCase();

  return (
    event.code === 'KeyE' ||
    key === 'e' ||
    key === 'у'
  );
}

function isMobileGameplayDevice() {
  const hasTouch = navigator.maxTouchPoints > 0;
  const narrowScreen =
    Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 920;

  return hasTouch && narrowScreen;
}

function isMobilePointerEvent(event) {
  if (event?.pointerType === 'touch') return true;
  if (event?.pointerType === 'pen') return true;

  return isMobileGameplayDevice();
}

function getGameplayRoot(root) {
  return (
    document.querySelector('.gta-map-stage') ||
    document.querySelector('.home-gameplay') ||
    root ||
    document.body
  );
}

function getElementCenter(element) {
  if (!element) return null;

  const rect = element.getBoundingClientRect();

  if (!rect.width && !rect.height) return null;

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function getObjectCenterFromPercent(object, viewport) {
  if (!object || !viewport) return null;

  const rect = viewport.getBoundingClientRect();

  if (!rect.width || !rect.height) return null;

  const objectX = Number(object.x || 50);
  const objectY = Number(object.y || 50);

  return {
    x: rect.left + (objectX / 100) * rect.width,
    y: rect.top + (objectY / 100) * rect.height,
  };
}

function getObjectScreenCenter(object, objectElement, viewport) {
  return (
    getElementCenter(objectElement) ||
    getObjectCenterFromPercent(object, viewport)
  );
}

function getObjectDistancePx({
  object,
  objectElement,
  playerMarker,
  playerPosition,
  viewport,
}) {
  const playerCenter = getElementCenter(playerMarker);
  const objectCenter = getObjectScreenCenter(object, objectElement, viewport);

  if (playerCenter && objectCenter) {
    return Math.hypot(
      objectCenter.x - playerCenter.x,
      objectCenter.y - playerCenter.y
    );
  }

  if (!object || !playerPosition || !viewport) {
    return Number.POSITIVE_INFINITY;
  }

  const rect = viewport.getBoundingClientRect();

  const objectX = Number(object.x || 50);
  const objectY = Number(object.y || 50);
  const playerX = Number(playerPosition.x || 50);
  const playerY = Number(playerPosition.y || 50);

  const dx = ((objectX - playerX) / 100) * rect.width;
  const dy = ((objectY - playerY) / 100) * rect.height;

  return Math.hypot(dx, dy);
}

function getPointerPoint(event) {
  const touch =
    event?.changedTouches?.[0] ||
    event?.touches?.[0] ||
    null;

  if (touch) {
    return {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  if (
    Number.isFinite(event?.clientX) &&
    Number.isFinite(event?.clientY)
  ) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return null;
}

function showInteractionNotice(root, message) {
  if (!root || !message) return;

  let notice = root.querySelector('.entity-interaction-notice');

  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'entity-interaction-notice';
    getGameplayRoot(root).appendChild(notice);
  }

  notice.textContent = message;
  notice.hidden = false;

  clearTimeout(notice._hideTimer);

  notice._hideTimer = setTimeout(() => {
    notice.hidden = true;
  }, 1400);
}

function createInteractionHint(root) {
  const hint = document.createElement('div');

  hint.className = 'entity-interaction-hint';
  hint.hidden = true;
  hint.innerHTML = `
    <b data-interaction-hint-key>E</b>
    <span data-interaction-hint-text>Взаимодействовать</span>
  `;

  getGameplayRoot(root).appendChild(hint);

  return hint;
}

function moveLayerAboveMap(viewport, layer) {
  if (!viewport || !layer) return;

  viewport.appendChild(layer);

  layer.style.position = 'absolute';
  layer.style.inset = '0';
  layer.style.display = 'block';
  layer.style.width = '100%';
  layer.style.height = '100%';
  layer.style.overflow = 'visible';
  layer.style.visibility = 'visible';
  layer.style.opacity = '1';
  layer.style.zIndex = '240';
  layer.style.pointerEvents = 'none';
}

export function createEntityInteractionPanel(root) {
  const CONFIRM_VISIBLE_MS = 6000;

  const panel = document.createElement('section');
  panel.className = 'house-selection-panel house-info-prompt';
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-live', 'polite');

  panel.innerHTML = `
    <div class="house-selection-body">
      <strong class="house-selection-title">Информация о доме</strong>
      <span class="house-selection-meta">Чтобы узнать информацию про дом, нажмите на I</span>
      <span class="house-selection-timer" data-house-selection-timer>6 сек</span>
    </div>

    <div class="house-selection-keys">
      <button class="house-selection-action" type="button" data-house-selection-confirm>I</button>
      <button class="house-selection-cancel" type="button" data-house-selection-cancel hidden>N</button>
    </div>
  `;

  root.appendChild(panel);

  const titleEl = panel.querySelector('.house-selection-title');
  const metaEl = panel.querySelector('.house-selection-meta');
  const timerEl = panel.querySelector('[data-house-selection-timer]');
  const confirmButton = panel.querySelector('[data-house-selection-confirm]');
  const cancelButton = panel.querySelector('[data-house-selection-cancel]');

  let selectedObject = null;
  let hideTimer = null;
  let countdownTimer = null;
  let openedAt = 0;

  function setHouseSelectionOpen(isOpen) {
    document.body?.classList.toggle('mn-house-selection-open', Boolean(isOpen));
  }

  function isYesKey(event) {
    const key = String(event.key || '').toLowerCase();

    return (
      event.code === 'KeyY' ||
      key === 'y' ||
      key === 'н'
    );
  }

  function isNoKey(event) {
    const key = String(event.key || '').toLowerCase();

    return (
      event.code === 'KeyN' ||
      key === 'n' ||
      key === 'т'
    );
  }

  function getObjectKind(object) {
    return object?.category || object?.payload?.kind || object?.type || 'object';
  }

  function isHouseObject(object) {
    return getObjectKind(object) === 'house';
  }

  function getOwnerId(object) {
    return (
      object?.owner_id ||
      object?.ownerId ||
      object?.payload?.ownerId ||
      object?.payload?.owner_id ||
      null
    );
  }

  function isHouseOwned(object) {
    return Boolean(
      getOwnerId(object) ||
      object?.payload?.owned
    );
  }

  function isHouseLocked(object) {
    return Boolean(object?.payload?.locked);
  }

  function shouldSkipPrompt(object) {
    if (isMobileGameplayDevice()) return false;
    if (!isHouseObject(object)) return false;

    return isHouseOwned(object) || isHouseLocked(object);
  }

  function clearTimers() {
    clearTimeout(hideTimer);
    clearInterval(countdownTimer);
    hideTimer = null;
    countdownTimer = null;
  }

  function renderCountdown() {
    if (!timerEl || !openedAt) return;

    const elapsed = Date.now() - openedAt;
    const leftMs = Math.max(0, CONFIRM_VISIBLE_MS - elapsed);
    const secondsLeft = Math.max(0, Math.ceil(leftMs / 1000));

    timerEl.textContent = `${secondsLeft} сек`;
  }

  function close() {
    clearTimers();

    selectedObject = null;
    openedAt = 0;

    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.classList.remove('is-visible');

    setHouseSelectionOpen(false);
  }

  function confirm() {
    if (!selectedObject) return;

    const object = selectedObject;

    close();
    dispatchEntityAction(object);
  }

  function renderPrompt(object) {
    const mobile = isMobileGameplayDevice();
    const house = isHouseObject(object);
    const owned = house && isHouseOwned(object);
    const locked = house && isHouseLocked(object);
    const free = house && !owned && !locked;

    panel.dataset.device = mobile ? 'mobile' : 'pc';
    panel.dataset.kind = house ? 'house' : 'object';
    panel.dataset.state = owned ? 'owned' : locked ? 'locked' : 'free';

    if (titleEl) {
      if (free) titleEl.textContent = 'Покупка дома';
      else if (owned) titleEl.textContent = 'Дом уже куплен';
      else if (locked) titleEl.textContent = 'Дом закрыт';
      else titleEl.textContent = 'Информация об объекте';
    }

    if (metaEl) {
      if (mobile) {
        metaEl.textContent = free
          ? 'Чтобы открыть покупку дома, нажмите на I'
          : 'Чтобы узнать информацию про дом, нажмите на I';
      } else if (free) {
        metaEl.textContent = 'Дом свободен. Открыть покупку — Y / Н. Отмена — N / Т';
      } else {
        metaEl.textContent = 'Открыть информацию — Y / Н. Отмена — N / Т';
      }
    }

    if (confirmButton) {
      confirmButton.textContent = mobile ? 'I' : 'Y';
      confirmButton.setAttribute(
        'aria-label',
        free ? 'Открыть покупку дома' : 'Показать информацию о доме'
      );
    }

    if (cancelButton) {
      cancelButton.hidden = mobile;
      cancelButton.textContent = 'N';
      cancelButton.setAttribute('aria-label', 'Нет, закрыть подсказку');
    }

    renderCountdown();
  }

  function open(object) {
    if (!object) return;

    selectedObject = object;
    openedAt = Date.now();

    renderPrompt(object);

    panel.hidden = false;
    panel.removeAttribute('aria-hidden');
    panel.classList.add('is-visible');

    setHouseSelectionOpen(true);

    clearTimers();
    renderCountdown();

    countdownTimer = setInterval(renderCountdown, 250);
    hideTimer = setTimeout(() => {
      close();
    }, CONFIRM_VISIBLE_MS);
  }

  function handleHousePurchased(event) {
    const purchasedHouseId = getPurchasedHouseId(event.detail);
    const purchasedMapObjectId = getPurchasedMapObjectId(event.detail);
    const ownerId = getPurchasedOwnerId(event.detail);
    const ownerName = getPurchasedOwnerName(event.detail);

    if (!selectedObject || !isSameHouseObject(selectedObject, purchasedHouseId, purchasedMapObjectId)) {
      return;
    }

    selectedObject = markObjectAsPurchased(selectedObject, ownerId, ownerName);
    renderPrompt(selectedObject);
  }

  function handleConfirmClick(event) {
    event.preventDefault();
    event.stopPropagation();

    confirm();
  }

  function handleCancelClick(event) {
    event.preventDefault();
    event.stopPropagation();

    close();
  }

  function handleKeyDown(event) {
    if (!selectedObject || panel.hidden) return false;
    if (isTypingTarget(event.target)) return false;

    if (isYesKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      confirm();
      return true;
    }

    if (isNoKey(event) || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return true;
    }

    return false;
  }

  confirmButton?.addEventListener('click', handleConfirmClick);
  confirmButton?.addEventListener('pointerup', handleConfirmClick);
  cancelButton?.addEventListener('click', handleCancelClick);
  cancelButton?.addEventListener('pointerup', handleCancelClick);

  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('mn:house-purchased-local', handleHousePurchased);

  return {
    open,
    close,
    handleKeyDown,

    shouldSkipPrompt,

    isOpen() {
      return Boolean(selectedObject) && panel.hidden === false;
    },

    getSelectedObject() {
      return selectedObject;
    },

    updateSelectedObject(updater) {
      if (!selectedObject || typeof updater !== 'function') return;

      selectedObject = updater(selectedObject) || selectedObject;
      renderPrompt(selectedObject);
    },

    cleanup() {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mn:house-purchased-local', handleHousePurchased);

      clearTimers();
      setHouseSelectionOpen(false);
      panel.remove();
    },
  };
}

export function enableEntityInteraction({
  root,
  viewport,
  cityId,
  panel,
  playerMarker,
  playerPosition,
}) {
  if (!root || !viewport || !cityId || !panel) return null;

  const layer = createMapObjectsLayer();

  layer.classList.add('map-objects-layer-public');
  layer.dataset.cityId = String(cityId);

  moveLayerAboveMap(viewport, layer);

  const hint = createInteractionHint(root);

  let mapObjects = [];
  let reloadTimer = null;
  let snapshotTimer = null;
  let destroyed = false;
  let nearestObjectId = null;
  let lastHintObjectId = null;
  let hintHideTimer = null;
  let rafId = 0;

  async function reloadObjects() {
    if (destroyed) return;

    let objects = [];

    try {
      objects = await getMapObjects(cityId);
    } catch (error) {
      console.warn('[entityInteraction] map objects load failed:', error);
      objects = [];
    }

    if (destroyed) return;

    mapObjects = Array.isArray(objects)
      ? objects.filter(Boolean)
      : [];

    moveLayerAboveMap(viewport, layer);
    renderMapObjects(layer, mapObjects);

    console.log('[entityInteraction] rendered map objects:', {
      cityId,
      count: mapObjects.length,
      layerChildren: layer.children.length,
    });

    window.dispatchEvent(new CustomEvent('mn:map-objects-rendered', {
      detail: {
        cityId,
        count: mapObjects.length,
        layerChildren: layer.children.length,
      },
    }));
  }

  function scheduleReload(delay = 250) {
    if (destroyed) return;

    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reloadObjects, delay);
  }

  function getObjectById(objectId) {
    if (!objectId) return null;

    return mapObjects.find((item) => String(item.id) === String(objectId)) || null;
  }

  function getDistanceToObject(object) {
    if (!object) return Number.POSITIVE_INFINITY;

    const objectElement = findMapObjectElement(layer, object.id);

    return getObjectDistancePx({
      object,
      objectElement,
      playerMarker,
      playerPosition,
      viewport,
    });
  }

  function getInteractionRadius() {
    return isMobileGameplayDevice()
      ? MOBILE_INTERACTION_RADIUS_PX
      : INTERACTION_RADIUS_PX;
  }

  function isObjectInInteractionRange(object, { directTap = false } = {}) {
    const radius = directTap && isMobileGameplayDevice()
      ? DIRECT_TAP_RADIUS_PX
      : getInteractionRadius();

    return getDistanceToObject(object) <= radius;
  }

  function getNearestInteractableObject() {
    let bestObject = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    mapObjects.forEach((object) => {
      if (!object) return;

      const distance = getDistanceToObject(object);

      if (distance <= getInteractionRadius() && distance < bestDistance) {
        bestObject = object;
        bestDistance = distance;
      }
    });

    return bestObject;
  }

  function getNearestObjectToPoint(point, radius = MOBILE_FREE_TAP_RADIUS_PX) {
    if (!point) return null;

    let bestObject = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    mapObjects.forEach((object) => {
      if (!object) return;

      const element = findMapObjectElement(layer, object.id);
      const center = getObjectScreenCenter(object, element, viewport);

      if (!center) return;

      const distance = Math.hypot(
        center.x - point.x,
        center.y - point.y
      );

      if (distance <= radius && distance < bestDistance) {
        bestObject = object;
        bestDistance = distance;
      }
    });

    return bestObject;
  }

  function clearNearestVisual() {
    if (!nearestObjectId) return;

    findMapObjectElement(layer, nearestObjectId)?.classList.remove('map-object-nearby');
    nearestObjectId = null;
  }

  function setNearestVisual(object) {
    const nextId = object?.id ? String(object.id) : null;

    if (nearestObjectId === nextId) return;

    clearNearestVisual();

    nearestObjectId = nextId;

    if (nearestObjectId) {
      findMapObjectElement(layer, nearestObjectId)?.classList.add('map-object-nearby');
    }
  }

  function hideInteractionHint({ reset = false } = {}) {
    clearTimeout(hintHideTimer);
    hintHideTimer = null;

    hint.hidden = true;
    hint.classList.remove('is-visible');

    if (reset) {
      lastHintObjectId = null;
    }
  }

  function showInteractionHintOnce(object) {
    if (!object?.id) return;

    const objectId = String(object.id);

    if (lastHintObjectId === objectId) return;

    lastHintObjectId = objectId;

    const keyEl = hint.querySelector('[data-interaction-hint-key]');
    const textEl = hint.querySelector('[data-interaction-hint-text]');

    if (isMobileGameplayDevice()) {
      if (keyEl) keyEl.textContent = '🏠';
      if (textEl) textEl.textContent = 'Нажми на дом';
    } else {
      if (keyEl) keyEl.textContent = 'E';
      if (textEl) textEl.textContent = 'Взаимодействовать';
    }

    hint.hidden = false;
    hint.classList.add('is-visible');

    clearTimeout(hintHideTimer);

    hintHideTimer = setTimeout(() => {
      hideInteractionHint();
    }, INTERACTION_HINT_VISIBLE_MS);
  }

  function updateInteractionHint() {
    if (destroyed) return;

    if (panel?.isOpen?.()) {
      hideInteractionHint();
      rafId = requestAnimationFrame(updateInteractionHint);
      return;
    }

    const nearest = getNearestInteractableObject();

    setNearestVisual(nearest);

    if (!nearest) {
      hideInteractionHint({ reset: true });
      rafId = requestAnimationFrame(updateInteractionHint);
      return;
    }

    showInteractionHintOnce(nearest);

    rafId = requestAnimationFrame(updateInteractionHint);
  }

  function tryOpenObject(object, { silent = false, directTap = false, ignoreRange = false } = {}) {
    if (!object) return false;

    if (!ignoreRange && !isObjectInInteractionRange(object, { directTap })) {
      if (!silent) {
        showInteractionNotice(root, 'Подойди ближе');
      }

      return false;
    }

    hideInteractionHint();

    if (panel?.shouldSkipPrompt?.(object)) {
      dispatchEntityAction(object);
      return true;
    }

    panel.open(object);
    return true;
  }

  function onObjectClick(event) {
    const clickedObjectId = getMapObjectIdFromEvent(event);
    if (!clickedObjectId) return;

    const object = getObjectById(clickedObjectId);
    if (!object) return;

    // На ПК дом открывается только через E/У, не кликом по карте.
    // Это убирает случайное постоянное появление нижнего prompt.
    if (!isMobilePointerEvent(event)) return;

    event.preventDefault();
    event.stopPropagation();

    tryOpenObject(object, {
      directTap: true,
    });
  }

  function onViewportPointer(event) {
    if (!isMobilePointerEvent(event)) return;
    if (panel?.isOpen?.()) return;

    const target = event.target;

    if (
      target?.closest?.('.houses-modal') ||
      target?.closest?.('.house-details-modal') ||
      target?.closest?.('.house-selection-panel') ||
      target?.closest?.('.mobile-joystick') ||
      target?.closest?.('.mobile-control-toggle') ||
      target?.closest?.('.admin-panel') ||
      target?.closest?.('.admin-status-dot') ||
      target?.closest?.('.player-glass-hud')
    ) {
      return;
    }

    const point = getPointerPoint(event);
    const nearest = getNearestObjectToPoint(point, 86);

    if (!nearest) return;

    // Не открываем модалки от случайного тапа по экрану/старту Telegram.
    // Мобильная логика срабатывает только возле самой иконки и в радиусе взаимодействия.
    if (!isObjectInInteractionRange(nearest, { directTap: true })) return;

    event.preventDefault();
    event.stopPropagation();

    tryOpenObject(nearest, {
      directTap: true,
    });
  }

  function onKeyDown(event) {
    if (!isInteractKey(event)) return;
    if (event.repeat) return;
    if (isTypingTarget(event.target)) return;

    const nearest = getNearestInteractableObject();

    if (!nearest) return;

    event.preventDefault();
    event.stopPropagation();

    tryOpenObject(nearest, { silent: true });
  }

  function onObjectsChanged(event) {
    if (event?.detail?.cityId && String(event.detail.cityId) !== String(cityId)) return;

    scheduleReload();
  }

  function onHousePurchased(event) {
    const purchasedHouseId = getPurchasedHouseId(event.detail);
    const purchasedMapObjectId = getPurchasedMapObjectId(event.detail);
    const ownerId = getPurchasedOwnerId(event.detail);
    const ownerName = getPurchasedOwnerName(event.detail);

    if (!ownerId) return;

    let changed = false;

    mapObjects = mapObjects.map((object) => {
      if (!isSameHouseObject(object, purchasedHouseId, purchasedMapObjectId)) return object;

      changed = true;
      return markObjectAsPurchased(object, ownerId, ownerName);
    });

    if (!changed) return;

    renderMapObjects(layer, mapObjects);

    if (typeof panel.updateSelectedObject === 'function') {
      panel.updateSelectedObject((selectedObject) => {
        if (!isSameHouseObject(selectedObject, purchasedHouseId, purchasedMapObjectId)) {
          return selectedObject;
        }

        return markObjectAsPurchased(selectedObject, ownerId, ownerName);
      });
    }

    scheduleReload();
  }

  layer.addEventListener('click', onObjectClick, true);
  layer.addEventListener('pointerdown', onObjectClick, true);

  /*
    Главный фикс для мобилки:
    слушаем весь viewport, а не только маленькую иконку дома.
  */
  viewport.addEventListener('pointerdown', onViewportPointer, true);
  viewport.addEventListener('touchstart', onViewportPointer, true);

  window.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('mn:map-objects-changed', onObjectsChanged);
  window.addEventListener('mn:house-purchased-local', onHousePurchased);

  snapshotTimer = setInterval(() => {
    scheduleReload(0);
  }, MAP_OBJECTS_SNAPSHOT_INTERVAL_MS);

  reloadObjects();
  rafId = requestAnimationFrame(updateInteractionHint);

  return () => {
    destroyed = true;
    clearTimeout(reloadTimer);
    clearInterval(snapshotTimer);
    clearTimeout(hintHideTimer);
    cancelAnimationFrame(rafId);

    layer.removeEventListener('click', onObjectClick, true);
    layer.removeEventListener('pointerdown', onObjectClick, true);

    viewport.removeEventListener('pointerdown', onViewportPointer, true);
    viewport.removeEventListener('touchstart', onViewportPointer, true);

    window.removeEventListener('keydown', onKeyDown, true);

    window.removeEventListener('mn:map-objects-changed', onObjectsChanged);
    window.removeEventListener('mn:house-purchased-local', onHousePurchased);

    clearNearestVisual();

    hint.remove();
    layer.remove();
  };
}
