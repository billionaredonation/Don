let largestTouchViewportHeight = 0;
let lastTouchOrientation = '';

function getViewportSize() {
  const width = Math.max(
    1,
    Math.round(
      window.visualViewport?.width ||
        window.innerWidth ||
        document.documentElement.clientWidth ||
        window.screen?.width ||
        1
    )
  );

  const height = Math.max(
    1,
    Math.round(
      window.visualViewport?.height ||
        window.innerHeight ||
        document.documentElement.clientHeight ||
        window.screen?.height ||
        1
    )
  );

  return { width, height };
}

function isTouchDevice() {
  return (
    window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ||
    navigator.maxTouchPoints > 0
  );
}

function isDesktopDevice() {
  return (
    window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches &&
    !isTouchDevice()
  );
}

function getViewportOrientation(width, height) {
  const portraitQuery = window.matchMedia?.('(orientation: portrait)');

  if (typeof portraitQuery?.matches === 'boolean') {
    return portraitQuery.matches ? 'portrait' : 'landscape';
  }

  return height > width ? 'portrait' : 'landscape';
}

function isTextEntryFocused() {
  const activeElement = document.activeElement;

  return Boolean(
    activeElement?.matches?.(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
    )
  );
}

function syncViewportState() {
  const { width, height } = getViewportSize();
  const viewportLeft = Math.max(0, Math.round(window.visualViewport?.offsetLeft || 0));
  const viewportTop = Math.max(0, Math.round(window.visualViewport?.offsetTop || 0));
  const mobile = isTouchDevice();
  const desktop = isDesktopDevice();
  const orientation = getViewportOrientation(width, height);
  const landscape = orientation === 'landscape';
  const portrait = orientation === 'portrait';
  const textEntryFocused = isTextEntryFocused();

  if (!mobile) {
    largestTouchViewportHeight = 0;
    lastTouchOrientation = '';
  } else if (lastTouchOrientation !== orientation) {
    lastTouchOrientation = orientation;
    largestTouchViewportHeight = height;
  } else if (!textEntryFocused) {
    largestTouchViewportHeight = Math.max(largestTouchViewportHeight, height);
  }

  const hiddenViewportHeight = Math.max(0, largestTouchViewportHeight - height);
  const keyboardThreshold = Math.max(110, largestTouchViewportHeight * 0.16);
  const virtualKeyboardOpen =
    mobile && textEntryFocused && hiddenViewportHeight >= keyboardThreshold;

  document.documentElement.style.setProperty('--mn-vw', `${width}px`);
  document.documentElement.style.setProperty('--mn-vh', `${height}px`);
  document.documentElement.style.setProperty('--tg-vw', `${width}px`);
  document.documentElement.style.setProperty('--tg-vh', `${height}px`);
  document.documentElement.style.setProperty('--mn-vv-left', `${viewportLeft}px`);
  document.documentElement.style.setProperty('--mn-vv-top', `${viewportTop}px`);
  document.documentElement.style.setProperty(
    '--mn-keyboard-height',
    `${hiddenViewportHeight}px`
  );

  document.documentElement.classList.toggle('mn-real-landscape', mobile && landscape);
  document.documentElement.classList.toggle('mn-force-rotate-landscape', mobile && portrait);
  document.documentElement.classList.toggle('mn-real-portrait', mobile && portrait);
  document.documentElement.classList.toggle('mn-desktop-game-enabled', desktop);
  document.documentElement.classList.toggle(
    'mn-text-entry-focused',
    mobile && textEntryFocused
  );
  document.documentElement.classList.toggle('mn-virtual-keyboard-open', virtualKeyboardOpen);

  document.body?.classList.toggle('mn-real-landscape', mobile && landscape);
  document.body?.classList.toggle('mn-force-rotate-landscape', mobile && portrait);
  document.body?.classList.toggle('mn-real-portrait', mobile && portrait);
  document.body?.classList.toggle('mn-desktop-game-enabled', desktop);
  document.body?.classList.toggle('mn-text-entry-focused', mobile && textEntryFocused);
  document.body?.classList.toggle('mn-virtual-keyboard-open', virtualKeyboardOpen);
}

async function requestFullscreenSafe(options = {}) {
  const { browserFullscreen = false } = options;
  const tg = window.Telegram?.WebApp;

  try {
    tg?.expand?.();
  } catch {
    // Telegram may reject expand in some shells.
  }

  try {
    tg?.requestFullscreen?.();
  } catch {
    // Telegram Desktop/Web can reject fullscreen depending on client/version.
  }

  if (browserFullscreen) {
    try {
      const root = document.documentElement;

      if (!document.fullscreenElement && root?.requestFullscreen) {
        await root.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // Browser fullscreen usually requires a user gesture; ignore rejection.
    }
  }

  syncViewportState();
  window.dispatchEvent(new Event('resize'));
}

function installDesktopFullscreenRetry() {
  const retry = () => {
    requestFullscreenSafe({ browserFullscreen: true });
  };

  window.addEventListener('pointerdown', retry, { passive: true, once: true });
  window.addEventListener('click', retry, { passive: true, once: true });
}

export function setupTelegramGameShell() {
  const tg = window.Telegram?.WebApp;
  const mobile = isTouchDevice();
  const desktop = isDesktopDevice();

  const safe = (callback) => {
    try {
      callback?.();
    } catch {}
  };

  if (tg) {
    safe(() => tg.ready());
    safe(() => tg.expand());

    safe(() => tg.disableVerticalSwipes?.());
    safe(() => tg.enableClosingConfirmation?.());

    if (desktop) {
      safe(() => tg.requestFullscreen?.());
      setTimeout(() => requestFullscreenSafe({ browserFullscreen: false }), 60);
      installDesktopFullscreenRetry();
    }

    safe(() => tg.setHeaderColor?.('#050607'));
    safe(() => tg.setBackgroundColor?.('#050607'));
    safe(() => tg.setBottomBarColor?.('#050607'));
  }

  document.documentElement.classList.add('mn-ios-shell');
  document.body?.classList.add('mn-ios-shell');

  document.body?.classList.toggle('mn-landscape-game', mobile);
  document.body?.classList.toggle('mn-mobile-game-enabled', mobile);
  document.body?.classList.toggle('mn-desktop-game-enabled', desktop);
  document.documentElement.classList.toggle('mn-desktop-game-enabled', desktop);

  syncViewportState();

  window.addEventListener('resize', syncViewportState, { passive: true });
  window.addEventListener('orientationchange', syncViewportState, { passive: true });

  window.visualViewport?.addEventListener?.('resize', syncViewportState, { passive: true });
  window.visualViewport?.addEventListener?.('scroll', syncViewportState, { passive: true });

  const syncFocusedViewport = () => {
    syncViewportState();
    window.requestAnimationFrame(syncViewportState);
    window.setTimeout(syncViewportState, 280);
  };

  document.addEventListener('focusin', syncFocusedViewport, true);
  document.addEventListener('focusout', syncFocusedViewport, true);

  document.addEventListener(
    'touchmove',
    (event) => {
      const target = event.target;

      const allowScroll =
        target?.closest?.('.houses-panel') ||
        target?.closest?.('.house-details-panel') ||
        target?.closest?.('.admin-panel') ||
        target?.closest?.('.houses-filter-menu') ||
        target?.closest?.('.house-trade-offer-card') ||
        target?.closest?.('.house-spawn-card') ||
        target?.closest?.('.mn-inventory-panel') ||
        target?.closest?.('.mn-inventory-content') ||
        target?.closest?.('.mn-inventory-item-menu-card') ||
        target?.closest?.('.mn-hospital-warehouse-panel') ||
        target?.closest?.('.mn-hospital-warehouse-body') ||
        target?.closest?.('.mn-hospital-cafeteria-panel') ||
        target?.closest?.('.mn-hospital-management-panel') ||
        target?.closest?.('.mn-player-interaction-panel') ||
        target?.closest?.('.map-modal-panel') ||
        target?.closest?.('.mn-interior-object-panel') ||
        target?.closest?.('.mn-interior-collider-panel');

      if (allowScroll) return;

      event.preventDefault();
    },
    { passive: false }
  );
}
