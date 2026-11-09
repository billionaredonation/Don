import { supabase } from '../supabaseClient.js';
import './onboarding.css';

// DISPLAY ONLY: the server is authoritative for quest progress.
// This guide never sends 'complete quest' or changes XP/balance.
export function enableIntroGuide({ root } = {}) {
  if (!root) return () => {};
  const banner = document.createElement('aside');
  banner.className = 'mn-intro-guide';
  banner.setAttribute('aria-live','polite');
  banner.hidden = true;
  banner.innerHTML = `<div class="mn-intro-copy"><small>ПЕРВЫЕ ШАГИ</small><strong data-intro-title>Осмотрись в городе</strong><span data-intro-detail>Передвигайся и нажми на ближайший объект.</span></div><button type="button" data-intro-skip aria-label="Скрыть подсказку">×</button>`;
  root.append(banner);
  const title = banner.querySelector('[data-intro-title]');
  const detail = banner.querySelector('[data-intro-detail]');
  const tgId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');
  const sessionKey = `mn-intro-visited:${tgId}`;
  let sawInteraction = false;
  let activated = false;
  let dismissed = false;
  let disposed = false;
  let timer = null;
  let inFlight = false;
  let latest = [];
  const setCopy = (a,b) => { title.textContent = a;detail.textContent = b; };
  function render() {
    if (dismissed || !activated || disposed) { banner.hidden = true; return; }
    const pending = latest.find(q => !q.completed);
    // First-screen instant feedback works without a network response.
    if (!sawInteraction && !sessionStorage.getItem(sessionKey)) {
      setCopy('Исследуй город', 'Подойди к объекту и нажми E или коснись его.');
    } else if (pending) {
      setCopy(pending.title, pending.description || 'Выполни действие на работе.');
    } else if (latest.length && latest.every(q=>q.completed)) {
      setCopy('Первые шаги пройдены', 'Исследуй профессии, магазины и предприятия.');
    } else {
      setCopy('Найди первую работу', 'Ферма и шахта дают опыт. Выбирай, с чего начать.');
    }
    banner.hidden=false;
  }
  function onAction() {
    if (disposed || !activated) return;
    sawInteraction=true;
    try { sessionStorage.setItem(sessionKey,'1'); } catch {}
    render();
  }
  async function refresh() {
    if (disposed || !activated || inFlight) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    inFlight=true;
    try {
      const {data,error} = await supabase.functions.invoke('quest-snapshot',{body:{initData}});
      if (!error && data?.ok && Array.isArray(data.quests)) { latest=data.quests; render(); }
    } catch(e) { console.warn('[introGuide] quest snapshot unavailable',e); }
    finally { inFlight=false; }
  }
  function start() {
    if (disposed || activated) return;
    activated=true; render(); refresh();
    timer=window.setInterval(refresh,12000);
  }
  function onEntered() { start(); }
  function onSkip() { dismissed=true;render(); }
  banner.querySelector('[data-intro-skip]').addEventListener('click',onSkip);
  window.addEventListener('mn:gameplay-entered',onEntered);
  window.addEventListener('mn:map-object-action',onAction);
  // When mounted after gameplay-entered was dispatched, recover safely.
  if (window.__MN_GAMEPLAY_ENTERED__===true) start();
  return () => {
    disposed=true;
    window.removeEventListener('mn:gameplay-entered',onEntered);
    window.removeEventListener('mn:map-object-action',onAction);
    banner.querySelector('[data-intro-skip]')?.removeEventListener('click',onSkip);
    if(timer!==null) window.clearInterval(timer);
    banner.remove();
  };
}
