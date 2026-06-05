export function setupTelegramGameShell() {
  const tg = window.Telegram?.WebApp;

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

    safe(() => tg.requestFullscreen?.());
    safe(() => tg.lockOrientation?.('landscape'));

    safe(() => tg.setHeaderColor?.('#050607'));
    safe(() => tg.setBackgroundColor?.('#050607'));
    safe(() => tg.setBottomBarColor?.('#050607'));
  }

  document.documentElement.classList.add('mn-ios-shell');
  document.body.classList.add('mn-ios-shell');

  const updateViewport = () => {
    const width =
      window.visualViewport?.width ||
      window.innerWidth ||
      document.documentElement.clientWidth;

    const height =
      window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight;

    document.documentElement.style.setProperty('--mn-vw', `${width}px`);
    document.documentElement.style.setProperty('--mn-vh', `${height}px`);
    document.documentElement.style.setProperty('--tg-vw', `${width}px`);
    document.documentElement.style.setProperty('--tg-vh', `${height}px`);
  };

  updateViewport();

  window.addEventListener('resize', updateViewport, {
    passive: true,
  });

  window.addEventListener('orientationchange', updateViewport, {
    passive: true,
  });

  window.visualViewport?.addEventListener?.('resize', updateViewport, {
    passive: true,
  });

  window.visualViewport?.addEventListener?.('scroll', updateViewport, {
    passive: true,
  });

  document.addEventListener(
    'touchmove',
    (event) => {
      const target = event.target;

      const allowScroll =
        target?.closest?.('.houses-panel') ||
        target?.closest?.('.house-details-panel') ||
        target?.closest?.('.admin-panel');

      if (allowScroll) {
        return;
      }

      event.preventDefault();
    },
    {
      passive: false,
    }
  );
}
