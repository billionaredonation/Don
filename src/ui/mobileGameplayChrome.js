const MOBILE_MEDIA_QUERY = '(hover: none) and (pointer: coarse)';

const ACTION_SELECTORS = Object.freeze([
  '.entity-interaction-hint',
  '.mn-player-interaction-hint',
  '.mn-interior-door-action',
]);

const NOTICE_SELECTORS = Object.freeze([
  '.mn-vital-notice',
]);

const BOTTOM_NOTICE_SELECTORS = Object.freeze([
  '.entity-interaction-notice',
  '.mn-farm-progress',
  '.admin-floating-notice',
  '.mn-player-trade-success-toast',
  '.mn-interior-action-toast',
]);

function createLayer(className, liveMode = 'polite') {
  const layer = document.createElement('div');

  layer.className = className;
  layer.hidden = true;
  layer.setAttribute('aria-live', liveMode);
  layer.setAttribute('aria-atomic', 'false');
  document.body.appendChild(layer);

  return layer;
}

function createInteriorInventoryButton(parent) {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = 'mn-interior-inventory-toggle';
  button.setAttribute('aria-label', 'Открыть инвентарь');
  button.innerHTML = '<span aria-hidden="true">🎒</span>';
  parent.appendChild(button);

  return button;
}

function isMobileGameplay(mediaQuery) {
  return Boolean(
    mediaQuery.matches ||
    document.body?.classList.contains('mn-mobile-game-enabled') ||
    document.body?.classList.contains('mn-landscape-game') ||
    document.documentElement?.classList.contains('mn-mobile-device-detected')
  );
}

export function enableMobileGameplayChrome() {
  document.querySelectorAll(
    '.mn-mobile-action-dock, .mn-mobile-notice-lane, .mn-mobile-feedback-lane, .mn-interior-inventory-toggle'
  ).forEach((element) => element.remove());

  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
  const actionDock = createLayer('mn-mobile-action-dock');
  const noticeLane = createLayer('mn-mobile-notice-lane', 'assertive');
  const feedbackLane = createLayer('mn-mobile-feedback-lane');
  const inventoryButton = createInteriorInventoryButton(actionDock);
  const origins = new Map();

  let destroyed = false;
  let syncFrame = 0;
  let interiorEntered = false;

  function rememberOrigin(element) {
    if (origins.has(element)) return;

    origins.set(element, {
      parent: element.parentNode,
      nextSibling: element.nextSibling,
    });
  }

  function moveMatches(selectors, destination) {
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (element === destination || destination.contains(element)) return;

        rememberOrigin(element);
        destination.appendChild(element);
      });
    });
  }

  function restoreElement(element, origin) {
    if (!element.isConnected || !origin?.parent?.isConnected) return;

    if (origin.nextSibling?.parentNode === origin.parent) {
      origin.parent.insertBefore(element, origin.nextSibling);
    } else {
      origin.parent.appendChild(element);
    }
  }

  function restoreAll() {
    origins.forEach((origin, element) => restoreElement(element, origin));
    origins.clear();
  }

  function sync() {
    syncFrame = 0;
    if (destroyed) return;

    const mobile = isMobileGameplay(mediaQuery);

    actionDock.hidden = !mobile;
    noticeLane.hidden = !mobile;
    feedbackLane.hidden = !mobile;
    const inventoryAvailable = mobile && interiorEntered;
    inventoryButton.hidden = !inventoryAvailable;
    inventoryButton.disabled = !inventoryAvailable;
    inventoryButton.setAttribute('aria-hidden', inventoryAvailable ? 'false' : 'true');

    if (!mobile) {
      restoreAll();
      return;
    }

    moveMatches(ACTION_SELECTORS, actionDock);
    moveMatches(NOTICE_SELECTORS, noticeLane);
    moveMatches(BOTTOM_NOTICE_SELECTORS, feedbackLane);
  }

  function scheduleSync() {
    if (destroyed || syncFrame) return;
    syncFrame = window.requestAnimationFrame(sync);
  }

  function handleInteriorEntered() {
    interiorEntered = true;
    scheduleSync();
  }

  function handleInteriorExited() {
    interiorEntered = false;
    scheduleSync();
  }

  function openInteriorInventory(event) {
    if (
      window.__MN_INTERIOR_ACTIVE__ !== true ||
      !document.body?.classList.contains('mn-interior-open')
    ) return;

    event.preventDefault();
    event.stopPropagation();

    window.dispatchEvent(new CustomEvent('mn:inventory-toggle-request', {
      detail: { source: 'interior-mobile-control' },
    }));
  }

  const observer = new MutationObserver(scheduleSync);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'data-state', 'data-visible'],
  });

  mediaQuery.addEventListener?.('change', scheduleSync);
  inventoryButton.addEventListener('click', openInteriorInventory);
  window.addEventListener('mn:interior-entered', handleInteriorEntered);
  window.addEventListener('mn:interior-exited', handleInteriorExited);
  scheduleSync();

  return () => {
    destroyed = true;
    observer.disconnect();
    mediaQuery.removeEventListener?.('change', scheduleSync);
    inventoryButton.removeEventListener('click', openInteriorInventory);
    window.removeEventListener('mn:interior-entered', handleInteriorEntered);
    window.removeEventListener('mn:interior-exited', handleInteriorExited);

    if (syncFrame) {
      window.cancelAnimationFrame(syncFrame);
      syncFrame = 0;
    }

    restoreAll();
    actionDock.remove();
    noticeLane.remove();
    feedbackLane.remove();
    inventoryButton.remove();
  };
}
