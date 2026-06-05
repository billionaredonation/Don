// src/telegram/telegramGameShell.js

const SHELL_CLASS = 'mn-telegram-game-shell';
const IOS_CLASS = 'mn-ios-telegram';

function safeCall(callback) {
  try {
    if (typeof callback === 'function') {
      callback();
    }
  } catch (error) {
    console.warn('[telegram-game-shell]', error);
  }
}

function isVersionAtLeast(webApp, version) {
  try {
    return typeof webApp?.isVersionAtLeast === 'function' &&
      webApp.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

function isIosTelegram(webApp) {
  const platform = String(webApp?.platform || '').toLowerCase();
  const ua = String(navigator.userAgent || '').toLowerCase();

  return platform === 'ios' || /iphone|ipad|ipod/.test(ua);
}

function syncViewportCssVars() {
  const apply = () => {
    const visualWidth =
      window.visualViewport?.width ||
      window.innerWidth ||
      document.documentElement.clientWidth;

    const visualHeight =
      window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight;

    document.documentElement.style.setProperty('--mn-vw', `${visualWidth}px`);
    document.documentElement.style.setProperty('--mn-vh', `${visualHeight}px`);
  };

  apply();

  window.addEventListener('resize', apply, { passive: true });
  window.addEventListener('orientationchange', apply, { passive: true });

  window.visualViewport?.addEventListener?.('resize', apply, { passive: true });
  window.visualViewport?.addEventListener?.('scroll', apply, { passive: true });

  return () => {
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);

    window.visualViewport?.removeEventListener?.('resize', apply);
    window.visualViewport?.removeEventListener?.('scroll', apply);
  };
}

function setupTelegramApi(webApp) {
  safeCall(() => webApp?.ready?.());
  safeCall(() => webApp?.expand?.());

  safeCall(() => webApp?.setHeaderColor?.('#050607'));
  safeCall(() => webApp?.setBackgroundColor?.('#050607'));
  safeCall(() => webApp?.setBottomBarColor?.('#050607'));

  safeCall(() => webApp?.disableVerticalSwipes?.());
  safeCall(() => webApp?.enableClosingConfirmation?.());

  if (isVersionAtLeast(webApp, '8.0')) {
    safeCall(() => webApp?.requestFullscreen?.());
    safeCall(() => webApp?.lockOrientation?.('landscape'));
  }
}

function setupTouchGuards() {
  const allowScrollInside = (target) => {
    return Boolean(
      target?.closest?.(
        [
          'input',
          'textarea',
          'select',
          '[contenteditable="true"]',
          '.houses-panel',
          '.house-details-panel',
          '.admin-panel',
          '.admin-object-list',
          '.houses-list',
          '.house-list'
        ].join(',')
      )
    );
  };

  const preventGlobalTouchMove = (event) => {
    if (allowScrollInside(event.target)) {
      return;
    }

    event.preventDefault();
  };

  const preventGesture = (event) => {
    event.preventDefault();
  };

  document.addEventListener('touchmove', preventGlobalTouchMove, {
    passive: false,
  });

  document.addEventListener('gesturestart', preventGesture, {
    passive: false,
  });

  document.addEventListener('gesturechange', preventGesture, {
    passive: false,
  });

  document.addEventListener('gestureend', preventGesture, {
    passive: false,
  });

  return () => {
    document.removeEventListener('touchmove', preventGlobalTouchMove);
    document.removeEventListener('gesturestart', preventGesture);
    document.removeEventListener('gesturechange', preventGesture);
    document.removeEventListener('gestureend', preventGesture);
  };
}

export function setupTelegramGameShell() {
  const webApp = window.Telegram?.WebApp;

  document.documentElement.classList.add(SHELL_CLASS);
  document.body?.classList.add(SHELL_CLASS);

  if (isIosTelegram(webApp)) {
    document.documentElement.classList.add(IOS_CLASS);
    document.body?.classList.add(IOS_CLASS);
  }

  const cleanupViewport = syncViewportCssVars();
  const cleanupTouches = setupTouchGuards();

  const refreshTelegramShell = () => {
    setupTelegramApi(webApp);
  };

  refreshTelegramShell();

  document.addEventListener('visibilitychange', refreshTelegramShell);
  window.addEventListener('focus', refreshTelegramShell);
  window.addEventListener('pageshow', refreshTelegramShell);
  window.addEventListener('orientationchange', refreshTelegramShell);

  setTimeout(refreshTelegramShell, 250);
  setTimeout(refreshTelegramShell, 900);
  setTimeout(refreshTelegramShell, 1600);

  return () => {
    cleanupViewport();
    cleanupTouches();

    document.removeEventListener('visibilitychange', refreshTelegramShell);
    window.removeEventListener('focus', refreshTelegramShell);
    window.removeEventListener('pageshow', refreshTelegramShell);
    window.removeEventListener('orientationchange', refreshTelegramShell);
  };
}
