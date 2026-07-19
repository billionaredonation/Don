import './inventory.css';

export const INVENTORY_ROWS = 10;
export const INVENTORY_COLUMNS = 10;
export const INVENTORY_SLOT_COUNT = INVENTORY_ROWS * INVENTORY_COLUMNS;

const INVENTORY_HOTKEY_CODE = 'KeyI';
const INVENTORY_OPEN_CLASS = 'mn-inventory-open';

function isTypingTarget(target) {
  const element = target instanceof Element ? target : document.activeElement;

  return Boolean(
    element?.closest?.('input, textarea, select, [contenteditable="true"]') ||
    element?.isContentEditable
  );
}

function isVisible(element) {
  if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  const style = window.getComputedStyle(element);

  return style.display !== 'none' && style.visibility !== 'hidden';
}

function hasBlockingInterface() {
  if (
    window.__MN_HOUSE_SPAWN_PICKER_ACTIVE__ === true ||
    document.body.classList.contains('mn-house-trade-open') ||
    document.body.classList.contains('mn-houses-modal-open') ||
    document.body.classList.contains('mn-house-details-open') ||
    document.body.classList.contains('mn-house-spawn-open') ||
    document.body.classList.contains('admin-mode') ||
    document.body.classList.contains('mn-interior-collider-editor-open') ||
    document.body.classList.contains('mn-interior-object-editor-open')
  ) {
    return true;
  }

  return Array.from(document.querySelectorAll([
    '[data-house-trade-offer]',
    '.houses-modal',
    '.house-details-modal',
    '.house-selection-panel',
    '.admin-panel',
    '[data-interior-collider-panel]',
    '[data-interior-object-panel]',
  ].join(','))).some(isVisible);
}

function renderSlots() {
  return Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => {
    const slotNumber = index + 1;
    const row = Math.floor(index / INVENTORY_COLUMNS) + 1;
    const column = (index % INVENTORY_COLUMNS) + 1;

    return `
      <div
        class="mn-inventory-slot"
        role="gridcell"
        aria-label="Пустая ячейка ${slotNumber}"
        data-inventory-slot="${index}"
        data-inventory-row="${row}"
        data-inventory-column="${column}"
      ></div>`;
  }).join('');
}

function inventoryMarkup() {
  return `
    <div class="mn-inventory" data-mn-inventory hidden aria-hidden="true">
      <button
        class="mn-inventory-backdrop"
        type="button"
        tabindex="-1"
        aria-label="Закрыть инвентарь"
        data-inventory-close
      ></button>

      <section
        class="mn-inventory-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mn-inventory-title"
        aria-describedby="mn-inventory-description"
      >
        <header class="mn-inventory-header">
          <span class="mn-inventory-emblem" aria-hidden="true">
            <span></span>
          </span>

          <span class="mn-inventory-heading">
            <span class="mn-inventory-kicker">Снаряжение игрока</span>
            <strong id="mn-inventory-title">Инвентарь</strong>
          </span>

          <span class="mn-inventory-capacity" aria-label="Занято ноль из ста ячеек">
            <b>0</b><i>/</i><span>${INVENTORY_SLOT_COUNT}</span>
          </span>

          <button
            class="mn-inventory-close"
            type="button"
            aria-label="Закрыть инвентарь"
            title="Закрыть (I / Ш)"
            data-inventory-close
          >
            <span aria-hidden="true"></span>
          </button>
        </header>

        <p class="mn-inventory-description" id="mn-inventory-description">
          Первая страница · ${INVENTORY_ROWS} × ${INVENTORY_COLUMNS} ячеек
        </p>

        <div
          class="mn-inventory-grid"
          role="grid"
          aria-label="Ячейки инвентаря"
          aria-rowcount="${INVENTORY_ROWS}"
          aria-colcount="${INVENTORY_COLUMNS}"
          data-inventory-grid
        >
          ${renderSlots()}
        </div>

        <footer class="mn-inventory-footer">
          <span class="mn-inventory-page-label">Страница</span>
          <strong class="mn-inventory-page">1 <i>/</i> 1</strong>
          <span class="mn-inventory-hotkey"><kbd>I</kbd><i>/</i><kbd>Ш</kbd> закрыть</span>
        </footer>
      </section>
    </div>`;
}

export function enableInventoryFeature() {
  document.querySelectorAll('[data-mn-inventory]').forEach((element) => element.remove());
  document.body.insertAdjacentHTML('beforeend', inventoryMarkup());

  const overlay = document.querySelector('[data-mn-inventory]');
  const panel = overlay?.querySelector('.mn-inventory-panel');
  const closeButton = overlay?.querySelector('.mn-inventory-close');
  const closeTargets = Array.from(overlay?.querySelectorAll('[data-inventory-close]') || []);

  if (!overlay || !panel || !closeButton) {
    return () => {};
  }

  let open = false;
  let previousFocus = null;

  function publishState(nextOpen) {
    window.__MN_INVENTORY_OPEN__ = nextOpen;
    document.body.classList.toggle(INVENTORY_OPEN_CLASS, nextOpen);
    document.documentElement.classList.toggle(INVENTORY_OPEN_CLASS, nextOpen);
    window.dispatchEvent(new CustomEvent(
      nextOpen ? 'mn:inventory-opened' : 'mn:inventory-closed',
      { detail: { open: nextOpen, rows: INVENTORY_ROWS, columns: INVENTORY_COLUMNS } }
    ));
  }

  function showInventory() {
    if (open || hasBlockingInterface()) return false;

    previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    open = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.dataset.state = 'opening';
    publishState(true);

    window.requestAnimationFrame(() => {
      if (!open) return;
      overlay.dataset.state = 'open';
      closeButton.focus({ preventScroll: true });
    });

    return true;
  }

  function hideInventory({ restoreFocus = true } = {}) {
    if (!open) return false;

    open = false;
    overlay.dataset.state = 'closing';
    overlay.setAttribute('aria-hidden', 'true');
    publishState(false);

    const finish = () => {
      if (open) return;
      overlay.hidden = true;
      delete overlay.dataset.state;

      if (restoreFocus && previousFocus?.isConnected) {
        previousFocus.focus?.({ preventScroll: true });
      }

      previousFocus = null;
    };

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      finish();
    } else {
      window.setTimeout(finish, 150);
    }

    return true;
  }

  function handleKeyDown(event) {
    const isInventoryHotkey = event.code === INVENTORY_HOTKEY_CODE;

    if (open) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if ((isInventoryHotkey || event.code === 'Escape') && !event.repeat) {
        hideInventory();
        return;
      }

      if (event.code === 'Tab') {
        closeButton.focus({ preventScroll: true });
      }

      return;
    }

    if (!isInventoryHotkey || event.repeat || isTypingTarget(event.target)) return;
    if (hasBlockingInterface()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    showInventory();
  }

  function handleCloseClick(event) {
    event.preventDefault();
    event.stopPropagation();
    hideInventory();
  }

  closeTargets.forEach((target) => target.addEventListener('click', handleCloseClick));
  window.addEventListener('keydown', handleKeyDown, true);

  const bodyClassObserver = new MutationObserver(() => {
    if (open && hasBlockingInterface()) {
      hideInventory({ restoreFocus: false });
    }
  });

  bodyClassObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  publishState(false);

  return () => {
    bodyClassObserver.disconnect();
    closeTargets.forEach((target) => target.removeEventListener('click', handleCloseClick));
    window.removeEventListener('keydown', handleKeyDown, true);
    open = false;
    publishState(false);
    overlay.remove();
  };
}
