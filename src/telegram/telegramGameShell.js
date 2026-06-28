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

function syncViewportState() {
  const { width, height } = getViewportSize();
  const mobile = isTouchDevice();
  const desktop = isDesktopDevice();
  const landscape = width >= height;
  const portrait = height > width;

  document.documentElement.style.setProperty('--mn-vw', `${width}px`);
  document.documentElement.style.setProperty('--mn-vh', `${height}px`);
  document.documentElement.style.setProperty('--tg-vw', `${width}px`);
  document.documentElement.style.setProperty('--tg-vh', `${height}px`);

  document.documentElement.classList.toggle('mn-real-landscape', mobile && landscape);
  document.documentElement.classList.toggle('mn-force-rotate-landscape', mobile && portrait);
  document.documentElement.classList.toggle('mn-real-portrait', mobile && portrait);
  document.documentElement.classList.toggle('mn-desktop-game-enabled', desktop);

  document.body?.classList.toggle('mn-real-landscape', mobile && landscape);
  document.body?.classList.toggle('mn-force-rotate-landscape', mobile && portrait);
  document.body?.classList.toggle('mn-real-portrait', mobile && portrait);
  document.body?.classList.toggle('mn-desktop-game-enabled', desktop);
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

  document.addEventListener(
    'touchmove',
    (event) => {
      const target = event.target;

      const allowScroll =
        target?.closest?.('.houses-panel') ||
        target?.closest?.('.house-details-panel') ||
        target?.closest?.('.admin-panel') ||
        target?.closest?.('.houses-filter-menu');

      if (allowScroll) return;

      event.preventDefault();
    },
    { passive: false }
  );
}
