import '../styles/modalHudVisibility.css';

// Both legacy overlays and native dialogs are used throughout the game.
const MODALS = 'dialog[open], [aria-modal="true"], [role="dialog"], [class$="-modal"], [class*="-modal "], [class$="-backdrop"], [class*="-backdrop "]';
const ACTIVE_CLASS = 'mn-modal-hud-hidden';

export function isVisibleGameModal(element) {
  if (!element.isConnected || element.closest('[hidden]')) return false;
  const dialog = element.closest('dialog');
  if (dialog && !dialog.open) return false;
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  }
  return element.getClientRects().length > 0;
}

export function enableModalHudVisibility() {
  const balance = document.createElement('div');
  balance.className = 'mn-modal-money';
  balance.hidden = true;
  balance.setAttribute('aria-label', 'Баланс игрока');
  balance.setAttribute('popover', 'manual');
  document.body.append(balance);
  const supportsPopover = typeof balance.showPopover === 'function';
  let frame = 0, destroyed = false, previousDialogs = [];

  function sync() {
    frame = 0;
    if (destroyed) return;
    const blocked = document.querySelector('html.mn-session-blocked, body.mn-session-blocked');
    const modals = blocked ? [] : [...document.querySelectorAll(MODALS)].filter(isVisibleGameModal);
    const active = modals.length > 0;
    if (document.body.classList.contains(ACTIVE_CLASS) !== active) document.body.classList.toggle(ACTIVE_CLASS, active);
    const source = (document.body.classList.contains('mn-interior-open') && document.querySelector('[data-interior-balance]')) || document.querySelector('[data-player-balance]');
    if (!active || !source) {
      if (supportsPopover && balance.matches(':popover-open')) balance.hidePopover();
      if (!balance.hidden) balance.hidden = true;
      previousDialogs = [];
      return;
    }
    const text = source.textContent.trim();
    if (balance.textContent !== text) balance.textContent = text;
    if (balance.title !== (source.title || text)) balance.title = source.title || text;
    if (balance.hidden) balance.hidden = false;
    const dialogs = modals.filter(node => node.tagName === 'DIALOG');
    const changed = dialogs.length !== previousDialogs.length || dialogs.some((node, i) => node !== previousDialogs[i]);
    // A manual popover is non-interactive and can sit above native modal dialogs.
    if (supportsPopover) {
      if (changed && balance.matches(':popover-open')) balance.hidePopover();
      if (!balance.matches(':popover-open')) balance.showPopover();
    } else {
      const parent = dialogs.at(-1) || document.body;
      if (balance.parentElement !== parent) parent.append(balance);
    }
    previousDialogs = dialogs;
  }
  function schedule() {
    if (!destroyed && !frame) frame = requestAnimationFrame(sync);
  }
  function concernsModal(node) {
    return node?.nodeType === 1 && (node.matches(MODALS + ', dialog') || Boolean(node.querySelector(MODALS + ', dialog')));
  }
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => {
      if (record.target === balance || balance.contains(record.target)) return false;
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest('[data-player-balance], [data-interior-balance]')) return true;
      if (record.type === 'attributes') return target === document.body || concernsModal(target);
      if (record.type === 'childList') return [...record.addedNodes, ...record.removedNodes].some(concernsModal);
      return false;
    });
    if (relevant) schedule();
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'open', 'class', 'style', 'aria-hidden', 'aria-modal'] });
  document.addEventListener('close', schedule, true);
  document.addEventListener('transitionend', schedule, true);
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    destroyed = true;
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    document.removeEventListener('close', schedule, true);
    document.removeEventListener('transitionend', schedule, true);
    window.removeEventListener('resize', schedule);
    document.body.classList.remove(ACTIVE_CLASS);
    balance.remove();
  };
}
