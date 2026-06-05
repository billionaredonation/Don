export function setupTelegramGameShell() {
  const tg = window.Telegram?.WebApp;

  if (!tg) return;

  try {
    tg.ready();
  } catch {}

  try {
    tg.expand();
  } catch {}

  try {
    tg.disableVerticalSwipes();
  } catch {}

  try {
    tg.enableClosingConfirmation();
  } catch {}

  try {
    tg.requestFullscreen?.();
  } catch {}

  try {
    tg.lockOrientation?.('landscape');
  } catch {}

  try {
    tg.setHeaderColor?.('#050607');
    tg.setBackgroundColor?.('#050607');
    tg.setBottomBarColor?.('#050607');
  } catch {}

  document.documentElement.classList.add('mn-ios-shell');
  document.body.classList.add('mn-ios-shell');

  const updateViewport = () => {
    const vh =
      window.visualViewport?.height ||
      window.innerHeight;

    document.documentElement.style.setProperty(
      '--tg-vh',
      `${vh}px`
    );
  };

  updateViewport();

  window.addEventListener('resize', updateViewport, {
    passive: true,
  });

  window.addEventListener('orientationchange', updateViewport, {
    passive: true,
  });

  document.addEventListener(
    'touchmove',
    (event) => {
      const target = event.target;

      const allowScroll =
        target.closest('.houses-panel') ||
        target.closest('.house-details-panel');

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
