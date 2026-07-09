import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

import {
  createMapObjectsLayer,
  renderMapObjects,
  clearMapObjectsLayer,
  getMapObjectIdFromEvent,
  findMapObjectElement,
} from '../mapObjects/mapObjectsRenderer.js';

import { dispatchEntityAction } from './entityActions.js';

const INTERACTION_RADIUS_PX = 86;
const MOBILE_INTERACTION_RADIUS_PX = 112;
const DIRECT_TAP_RADIUS_PX = 132;
const MOBILE_FREE_TAP_RADIUS_PX = 150;
const INTERACTION_HINT_VISIBLE_MS = 2200;
const MAP_OBJECTS_SNAPSHOT_INTERVAL_MS = isMobileGameplayDevice() ? 75000 : 8500;
const INTERACTION_SCAN_INTERVAL_MS = isMobileGameplayDevice() ? 760 : 320;

/*
  ПК оставляем широким: там железо выдерживает много DOM-объектов.
  Мобилка работает через streaming-window вокруг игрока:
  - в DOM попадают только ближайшие объекты;
  - из БД/кеша подтягивается только небольшой запас вокруг игрока;
  - всё вне окна не рендерится и не висит в DOM.
*/
const OBJECT_RENDER_RADIUS_PERCENT = 9;
const OBJECT_LOAD_RADIUS_PERCENT = 18;

const MOBILE_OBJECT_RENDER_RADIUS_PX = 360;
const MOBILE_OBJECT_LOAD_RADIUS_PX = 840;
const MOBILE_OBJECT_REGION_RELOAD_SHIFT_PX = 520;
const MOBILE_OBJECT_RENDER_MOVE_EPSILON_PX = 260;

const MOBILE_OBJECT_RENDER_RADIUS_MIN_PERCENT = 7;
const MOBILE_OBJECT_RENDER_RADIUS_MAX_PERCENT = 18;
const MOBILE_OBJECT_LOAD_RADIUS_MIN_PERCENT = 17;
const MOBILE_OBJECT_LOAD_RADIUS_MAX_PERCENT = 36;
const OBJECT_REGION_RELOAD_SHIFT_PERCENT = 8;
const OBJECT_RENDER_MOVE_EPSILON_PERCENT = 1.8;
const OBJECT_GRID_CELL_PERCENT = 4;

const MOBILE_MAX_RENDERED_OBJECTS = 28;
const DESKTOP_MAX_RENDERED_OBJECTS = 90;

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

function isPlayerBusy() {
  const now = performance.now();
  const mobilePauseUntil = Number(window.__MN_MOBILE_NETWORK_PAUSE_UNTIL__ || 0);

  return (
    window.__MN_MOBILE_PLAYER_MOVING__ === true ||
    window.__MN_DESKTOP_PLAYER_MOVING__ === true ||
    mobilePauseUntil > now
  );
}

function isMobilePlayerBusy() {
  if (!isMobileGameplayDevice()) return false;

  return isPlayerBusy();
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) return min;

  return Math.min(max, Math.max(min, number));
}

function getViewportPercentRadiusFromPx(
  viewport,
  radiusPx,
  fallbackPercent,
  { minPercent = 1, maxPercent = 100 } = {}
) {
  if (!isMobileGameplayDevice()) return fallbackPercent;

  const rect = viewport?.getBoundingClientRect?.();
  const width = Number(rect?.width);
  const height = Number(rect?.height);

  if (width > 0 && height > 0) {
    /*
      getBoundingClientRect() уже учитывает текущий zoom карты.
      Поэтому 92px реально остаются около 92 экранных пикселей,
      а не превращаются в огромный процент карты.
    */
    const minSide = Math.max(1, Math.min(width, height));
    const percent = (Number(radiusPx) / minSide) * 100;

    return clampNumber(percent, minPercent, maxPercent);
  }

  return clampNumber(fallbackPercent, minPercent, maxPercent);
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
  /*
    Быстрый путь для игры: объект и игрок уже имеют координаты в процентах карты.
    Не дёргаем getBoundingClientRect() у каждого домика каждый тик — на iPhone/Android
    это даёт микрофризы при движении.
  */
  if (object && playerPosition && viewport) {
    const rect = viewport.getBoundingClientRect();

    if (rect.width > 0 && rect.height > 0) {
      const objectX = Number(object.x || 50);
      const objectY = Number(object.y || 50);
      const playerX = Number(playerPosition.x || 50);
      const playerY = Number(playerPosition.y || 50);

      const dx = ((objectX - playerX) / 100) * rect.width;
      const dy = ((objectY - playerY) / 100) * rect.height;

      return Math.hypot(dx, dy);
    }
  }

  const playerCenter = getElementCenter(playerMarker);
  const objectCenter = getObjectScreenCenter(object, objectElement, viewport);

  if (playerCenter && objectCenter) {
    return Math.hypot(
      objectCenter.x - playerCenter.x,
      objectCenter.y - playerCenter.y
    );
  }

  return Number.POSITIVE_INFINITY;
}

function getPercentDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;

  const ax = Number(a.x);
  const ay = Number(a.y);
  const bx = Number(b.x);
  const by = Number(b.y);

  if (
    !Number.isFinite(ax) ||
    !Number.isFinite(ay) ||
    !Number.isFinite(bx) ||
    !Number.isFinite(by)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.hypot(ax - bx, ay - by);
}

function getCurrentPlayerPercent(playerPosition) {
  return {
    x: Number(playerPosition?.x || 50),
    y: Number(playerPosition?.y || 50),
  };
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
      // На мобилке тоже оставляем две кнопки: I открыть / N закрыть.
      cancelButton.hidden = false;
      cancelButton.textContent = 'N';
      cancelButton.setAttribute('aria-label', 'Нет, закрыть подсказку');
    }

    renderCountdown();
  }


  function applyPromptInlinePlacement() {
    const mobile = isMobileGameplayDevice();

    panel.style.removeProperty('position');
    panel.style.removeProperty('left');
    panel.style.removeProperty('top');
    panel.style.removeProperty('right');
    panel.style.removeProperty('bottom');
    panel.style.removeProperty('transform');
    panel.style.removeProperty('transform-origin');
    panel.style.removeProperty('background');
    panel.style.removeProperty('border-color');
    panel.style.removeProperty('box-shadow');
    panel.style.removeProperty('backdrop-filter');
    panel.style.removeProperty('-webkit-backdrop-filter');

    if (!mobile) return;

    const rootElement = document.documentElement;
    const forcedLandscape =
      rootElement?.classList?.contains('mn-force-rotate-landscape') ||
      document.body?.classList?.contains('mn-force-rotate-landscape');

    panel.style.setProperty('position', 'fixed', 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
    panel.style.setProperty('transform-origin', 'center center', 'important');
    // Финальная мобилка: без фоновой карточки. Только текст + две кнопки.
    panel.style.setProperty('background', 'transparent', 'important');
    panel.style.setProperty('border-color', 'transparent', 'important');
    panel.style.setProperty('box-shadow', 'none', 'important');
    panel.style.setProperty('backdrop-filter', 'none', 'important');
    panel.style.setProperty('-webkit-backdrop-filter', 'none', 'important');

    if (forcedLandscape) {
      // Центр экрана и чуть ниже игрока. Без ухода к балансу/джойстику.
      panel.style.setProperty('left', '50%', 'important');
      panel.style.setProperty('top', '56.5%', 'important');
      panel.style.setProperty(
        'transform',
        'translate3d(-50%, -50%, 0) rotate(90deg)',
        'important'
      );
      return;
    }

    panel.style.setProperty('left', '50%', 'important');
    panel.style.setProperty('top', '56.5%', 'important');
    panel.style.setProperty('transform', 'translate3d(-50%, -50%, 0)', 'important');
  }

  function open(object) {
    if (!object) return;

    selectedObject = object;
    openedAt = Date.now();

    renderPrompt(object);
    applyPromptInlinePlacement();

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
  let renderedObjects = [];
  let reloadTimer = null;
  let snapshotTimer = null;
  let destroyed = false;
  let nearestObjectId = null;
  let lastHintObjectId = null;
  let hintHideTimer = null;
  let interactionTimer = 0;
  let lastRenderX = Number.NaN;
  let lastRenderY = Number.NaN;
  let lastRenderedIdsKey = '';
  let loadedRegion = null;
  let lastMovingObjectsRenderAt = 0;
  let pendingRenderAfterMovement = false;
  let pendingReloadAfterMovement = false;
  let objectById = new Map();
  let objectGrid = new Map();

  function getGridCell(value) {
    const number = Number(value);
    return Math.floor((Number.isFinite(number) ? number : 0) / OBJECT_GRID_CELL_PERCENT);
  }

  function getGridKey(cellX, cellY) {
    return `${cellX}:${cellY}`;
  }

  function rebuildObjectIndex() {
    objectById = new Map();
    objectGrid = new Map();

    mapObjects.forEach((object) => {
      if (!object?.id) return;

      const id = String(object.id);
      objectById.set(id, object);

      const x = Number(object.x);
      const y = Number(object.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      const key = getGridKey(getGridCell(x), getGridCell(y));
      const bucket = objectGrid.get(key);

      if (bucket) {
        bucket.push(object);
      } else {
        objectGrid.set(key, [object]);
      }
    });
  }

  function getObjectsAroundPosition(position, radius) {
    if (!objectGrid.size) return [];

    const minCellX = getGridCell(Math.max(0, position.x - radius));
    const maxCellX = getGridCell(Math.min(100, position.x + radius));
    const minCellY = getGridCell(Math.max(0, position.y - radius));
    const maxCellY = getGridCell(Math.min(100, position.y + radius));
    const result = [];
    const seen = new Set();

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = objectGrid.get(getGridKey(cellX, cellY));
        if (!bucket) continue;

        bucket.forEach((object) => {
          const id = object?.id ? String(object.id) : '';
          if (!id || seen.has(id)) return;

          if (getPercentDistance(object, position) > radius) return;

          seen.add(id);
          result.push(object);
        });
      }
    }

    return result;
  }

  function getRenderRadiusPercent() {
    return isMobileGameplayDevice()
      ? getViewportPercentRadiusFromPx(
          viewport,
          MOBILE_OBJECT_RENDER_RADIUS_PX,
          MOBILE_OBJECT_RENDER_RADIUS_MIN_PERCENT,
          {
            minPercent: MOBILE_OBJECT_RENDER_RADIUS_MIN_PERCENT,
            maxPercent: MOBILE_OBJECT_RENDER_RADIUS_MAX_PERCENT,
          }
        )
      : OBJECT_RENDER_RADIUS_PERCENT;
  }

  function getLoadRadiusPercent() {
    return isMobileGameplayDevice()
      ? getViewportPercentRadiusFromPx(
          viewport,
          MOBILE_OBJECT_LOAD_RADIUS_PX,
          MOBILE_OBJECT_LOAD_RADIUS_MIN_PERCENT,
          {
            minPercent: MOBILE_OBJECT_LOAD_RADIUS_MIN_PERCENT,
            maxPercent: MOBILE_OBJECT_LOAD_RADIUS_MAX_PERCENT,
          }
        )
      : OBJECT_LOAD_RADIUS_PERCENT;
  }


  function getMaxRenderedObjects() {
    return isMobileGameplayDevice()
      ? MOBILE_MAX_RENDERED_OBJECTS
      : DESKTOP_MAX_RENDERED_OBJECTS;
  }

  function sortObjectsByDistance(objects, position) {
    return objects
      .slice()
      .sort((a, b) => getPercentDistance(a, position) - getPercentDistance(b, position));
  }

  function pauseObjectLayerForMovement() {
    if (!layer || !isMobileGameplayDevice()) return;

    if (layer.dataset.motionPaused === 'true') return;

    /*
      Не скрываем дома display:none во время движения. Старый вариант убирал слой,
      потом после остановки заново включал/перерисовывал DOM — отсюда визуальная
      «прорисовка» и резкие лаги. Теперь слой остаётся на экране, но не получает
      pointer-events до пересчёта окна объектов.
    */
    layer.dataset.motionPaused = 'true';
    layer.classList.add('map-objects-layer-motion-paused');
    layer.style.pointerEvents = 'none';
  }

  function resumeObjectLayerAfterMovement() {
    if (!layer) return;

    if (layer.dataset.motionPaused !== 'true') return;

    layer.dataset.motionPaused = 'false';
    layer.classList.remove('map-objects-layer-motion-paused');
    layer.style.removeProperty('pointer-events');
    moveLayerAboveMap(viewport, layer);
  }

  function getRegionReloadShiftPercent() {
    return isMobileGameplayDevice()
      ? getViewportPercentRadiusFromPx(
          viewport,
          MOBILE_OBJECT_REGION_RELOAD_SHIFT_PX,
          3.6,
          { minPercent: 2.2, maxPercent: 8 }
        )
      : OBJECT_REGION_RELOAD_SHIFT_PERCENT;
  }

  function getRenderMoveEpsilonPercent() {
    return isMobileGameplayDevice()
      ? getViewportPercentRadiusFromPx(
          viewport,
          MOBILE_OBJECT_RENDER_MOVE_EPSILON_PX,
          0.9,
          { minPercent: 0.45, maxPercent: 2 }
        )
      : OBJECT_RENDER_MOVE_EPSILON_PERCENT;
  }

  function getObjectQueryOptions() {
    const position = getCurrentPlayerPercent(playerPosition);

    return {
      centerX: position.x,
      centerY: position.y,
      radiusPercent: getLoadRadiusPercent(),
    };
  }

  function rememberLoadedRegion() {
    const position = getCurrentPlayerPercent(playerPosition);

    loadedRegion = {
      x: position.x,
      y: position.y,
      radius: getLoadRadiusPercent(),
    };
  }

  function shouldReloadRegion() {
    if (!loadedRegion) return true;

    const position = getCurrentPlayerPercent(playerPosition);
    const shift = getPercentDistance(position, loadedRegion);

    const reloadShift = getRegionReloadShiftPercent();

    return shift >= Math.min(
      reloadShift,
      Math.max(2.2, loadedRegion.radius * 0.42)
    );
  }

  function getRenderableObjects() {
    const position = getCurrentPlayerPercent(playerPosition);
    const radius = getRenderRadiusPercent();
    const keepIds = new Set();
    const resultById = new Map();
    const maxRenderedObjects = getMaxRenderedObjects();

    if (nearestObjectId) keepIds.add(String(nearestObjectId));

    const selectedObject = panel?.getSelectedObject?.();

    if (selectedObject?.id) keepIds.add(String(selectedObject.id));

    const nearbyObjects = sortObjectsByDistance(
      getObjectsAroundPosition(position, radius),
      position
    );

    nearbyObjects.slice(0, maxRenderedObjects).forEach((object) => {
      if (!object?.id) return;
      resultById.set(String(object.id), object);
    });

    keepIds.forEach((id) => {
      const object = objectById.get(String(id));
      if (object?.id) resultById.set(String(object.id), object);
    });

    return Array.from(resultById.values());
  }

  function renderNearbyMapObjects(force = false) {
    if (!layer) return;

    if (isMobileGameplayDevice() && isPlayerBusy()) {
      pauseObjectLayerForMovement();
      pendingRenderAfterMovement = true;
      return;
    }

    resumeObjectLayerAfterMovement();

    const position = getCurrentPlayerPercent(playerPosition);
    const renderMoveEpsilon = getRenderMoveEpsilonPercent();
    const movedEnough =
      Math.abs(position.x - lastRenderX) >= renderMoveEpsilon ||
      Math.abs(position.y - lastRenderY) >= renderMoveEpsilon;

    const nextObjects = getRenderableObjects();
    const nextIdsKey = nextObjects
      .map((object) => String(object.id || ''))
      .filter(Boolean)
      .sort()
      .join('|');

    if (!force && !movedEnough && nextIdsKey === lastRenderedIdsKey) {
      return;
    }

    renderedObjects = nextObjects;
    lastRenderX = position.x;
    lastRenderY = position.y;
    lastRenderedIdsKey = nextIdsKey;

    moveLayerAboveMap(viewport, layer);
    renderMapObjects(layer, renderedObjects);

    window.dispatchEvent(new CustomEvent('mn:map-objects-rendered', {
      detail: {
        cityId,
        count: mapObjects.length,
        renderedCount: renderedObjects.length,
        layerChildren: layer.children.length,
        renderRadiusPercent: getRenderRadiusPercent(),
        loadRadiusPercent: getLoadRadiusPercent(),
        mobileRenderRadiusPx: isMobileGameplayDevice() ? MOBILE_OBJECT_RENDER_RADIUS_PX : null,
        mobileLoadRadiusPx: isMobileGameplayDevice() ? MOBILE_OBJECT_LOAD_RADIUS_PX : null,
      },
    }));
  }

  async function reloadObjects() {
    if (destroyed) return;

    let objects = [];

    try {
      objects = await getMapObjects(cityId, getObjectQueryOptions());
    } catch (error) {
      console.warn('[entityInteraction] map objects load failed:', error);
      objects = [];
    }

    if (destroyed) return;

    mapObjects = Array.isArray(objects)
      ? objects.filter(Boolean)
      : [];

    rebuildObjectIndex();
    rememberLoadedRegion();

    if (isPlayerBusy()) {
      pauseObjectLayerForMovement();
      pendingRenderAfterMovement = true;
      return;
    }

    renderNearbyMapObjects(true);
  }

  function scheduleReload(delay = 250) {
    if (destroyed || reloadTimer) return;

    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      reloadObjects();
    }, delay);
  }

  function getObjectById(objectId) {
    if (!objectId) return null;

    return (
      renderedObjects.find((item) => String(item.id) === String(objectId)) ||
      objectById.get(String(objectId)) ||
      null
    );
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
    const radius = getInteractionRadius();
    const position = getCurrentPlayerPercent(playerPosition);
    const rect = viewport?.getBoundingClientRect?.();
    const width = Number(rect?.width);
    const height = Number(rect?.height);

    /*
      Взаимодействие не должно зависеть от того, попал ли дом прямо сейчас в DOM-window.
      Поэтому E/У на ПК и ближайший дом на мобилке ищутся по spatial-grid, а не только
      по renderedObjects. Так можно агрессивно оптимизировать прорисовку и не ломать логику.
    */
    const percentRadius = width > 0 && height > 0
      ? Math.max((radius / width) * 100, (radius / height) * 100) + OBJECT_GRID_CELL_PERCENT
      : getRenderRadiusPercent();

    const candidates = getObjectsAroundPosition(position, percentRadius);

    candidates.forEach((object) => {
      if (!object) return;

      let distance = Number.POSITIVE_INFINITY;

      if (width > 0 && height > 0) {
        const objectX = Number(object.x || 50);
        const objectY = Number(object.y || 50);

        distance = Math.hypot(
          ((objectX - position.x) / 100) * width,
          ((objectY - position.y) / 100) * height
        );
      } else {
        distance = getDistanceToObject(object);
      }

      if (distance <= radius && distance < bestDistance) {
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

    renderedObjects.forEach((object) => {
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

  function scheduleInteractionHintUpdate(delay = null) {
    if (destroyed) return;

    clearTimeout(interactionTimer);

    interactionTimer = setTimeout(updateInteractionHint, delay ?? INTERACTION_SCAN_INTERVAL_MS);
  }

  function updateInteractionHint() {
    if (destroyed) return;

    if (shouldReloadRegion()) {
      if (isMobileGameplayDevice() && isPlayerBusy()) {
        pendingReloadAfterMovement = true;
      } else {
        scheduleReload(260);
      }
    }

    if (isPlayerBusy()) {
      /*
        Во время движения НЕ трогаем DOM домов вообще — ни на телефоне, ни на ПК.
        Большое количество объектов само по себе не страшно; дорогая часть — пересборка
        DOM/hover/hitbox прямо во время кадра движения. Слой остаётся видимым, а
        окно объектов пересчитывается после остановки.
      */
      pauseObjectLayerForMovement();
      pendingRenderAfterMovement = true;
      hideInteractionHint();
      scheduleInteractionHintUpdate(isMobileGameplayDevice() ? 620 : 360);
      return;
    }

    resumeObjectLayerAfterMovement();

    if (pendingReloadAfterMovement) {
      pendingReloadAfterMovement = false;
      scheduleReload(0);
    }

    if (pendingRenderAfterMovement) {
      pendingRenderAfterMovement = false;
      lastMovingObjectsRenderAt = performance.now();
      renderNearbyMapObjects(true);
    } else {
      renderNearbyMapObjects(false);
    }

    if (panel?.isOpen?.()) {
      hideInteractionHint();
      scheduleInteractionHintUpdate();
      return;
    }

    const nearest = getNearestInteractableObject();

    setNearestVisual(nearest);

    if (!nearest) {
      hideInteractionHint({ reset: true });
      scheduleInteractionHintUpdate();
      return;
    }

    showInteractionHintOnce(nearest);
    scheduleInteractionHintUpdate();
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

  function isCurrentCityEvent(event) {
    return !event?.detail?.cityId || String(event.detail.cityId) === String(cityId);
  }

  function resetRenderedObjectState() {
    nearestObjectId = null;
    lastHintObjectId = null;
    lastRenderedIdsKey = '';
    lastRenderX = Number.NaN;
    lastRenderY = Number.NaN;
    loadedRegion = null;
    pendingRenderAfterMovement = false;
    pendingReloadAfterMovement = false;
    objectById = new Map();
    objectGrid = new Map();
    renderedObjects = [];
    hideInteractionHint({ reset: true });
  }

  function onObjectsChanged(event) {
    if (!isCurrentCityEvent(event)) return;

    scheduleReload();
  }

  function onAdminObjectsCleared(event) {
    if (!isCurrentCityEvent(event)) return;

    mapObjects = [];
    resetRenderedObjectState();
    clearMapObjectsLayer(layer);

    window.dispatchEvent(new CustomEvent('mn:map-objects-rendered', {
      detail: {
        cityId,
        count: 0,
        renderedCount: 0,
        layerChildren: 0,
        adminCleared: true,
      },
    }));
  }

  function onAdminObjectDeleted(event) {
    if (!isCurrentCityEvent(event)) return;

    const objectId = String(event?.detail?.objectId || '').trim();
    if (!objectId) return;

    mapObjects = mapObjects.filter((object) => String(object?.id || '') !== objectId);
    renderedObjects = renderedObjects.filter((object) => String(object?.id || '') !== objectId);

    rebuildObjectIndex();
    lastRenderedIdsKey = '';
    renderNearbyMapObjects(true);
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

    rebuildObjectIndex();
    renderNearbyMapObjects(true);

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
  window.addEventListener('mn:map-objects-admin-cleared', onAdminObjectsCleared);
  window.addEventListener('mn:map-objects-admin-deleted', onAdminObjectDeleted);
  window.addEventListener('mn:house-purchased-local', onHousePurchased);

  snapshotTimer = setInterval(() => {
    if (isMobileGameplayDevice() && isPlayerBusy()) {
      pendingReloadAfterMovement = true;
      return;
    }

    scheduleReload(0);
  }, MAP_OBJECTS_SNAPSHOT_INTERVAL_MS);

  reloadObjects();
  scheduleInteractionHintUpdate(120);

  return () => {
    destroyed = true;
    clearTimeout(reloadTimer);
    clearInterval(snapshotTimer);
    clearTimeout(hintHideTimer);
    clearTimeout(interactionTimer);

    layer.removeEventListener('click', onObjectClick, true);
    layer.removeEventListener('pointerdown', onObjectClick, true);

    viewport.removeEventListener('pointerdown', onViewportPointer, true);
    viewport.removeEventListener('touchstart', onViewportPointer, true);

    window.removeEventListener('keydown', onKeyDown, true);

    window.removeEventListener('mn:map-objects-changed', onObjectsChanged);
    window.removeEventListener('mn:map-objects-admin-cleared', onAdminObjectsCleared);
    window.removeEventListener('mn:map-objects-admin-deleted', onAdminObjectDeleted);
    window.removeEventListener('mn:house-purchased-local', onHousePurchased);

    clearNearestVisual();

    hint.remove();
    layer.remove();
  };
}

