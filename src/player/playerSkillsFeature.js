import { state } from '../state.js';
import { addRunningSkillXp, loadPlayerSkills } from '../farm/farmApi.js';
import { loadMineSkills } from '../mine/mineApi.js';
import { getPlayerSkillsSnapshot, publishPlayerSkills } from './playerSkillState.js';
import './playerSkills.css';

const RUNNING_XP_BATCH = 10;
const RUNNING_XP_FLUSH_MS = 8000;

function money(value) {
  return `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')} ₴`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function progressPercent(skill = {}) {
  if (Number(skill.level) >= 5 || skill.nextLevelXp == null) return 100;
  const start = Math.max(0, Number(skill.levelStartXp) || 0);
  const next = Math.max(start + 1, Number(skill.nextLevelXp) || start + 1);
  return Math.max(0, Math.min(100, ((Number(skill.xp) - start) / (next - start)) * 100));
}

function progressCaption(skill = {}) {
  if (Number(skill.level) >= 5 || skill.nextLevelXp == null) return 'Максимальный уровень';
  const start = Math.max(0, Number(skill.levelStartXp) || 0);
  const next = Math.max(start + 1, Number(skill.nextLevelXp) || start + 1);
  return `${Math.max(0, Number(skill.xp) - start).toLocaleString('ru-RU')} / ${(next - start).toLocaleString('ru-RU')} XP`;
}

function levelDots(level) {
  return Array.from({ length: 5 }, (_, index) => (
    `<i data-filled="${index < Number(level) ? 'true' : 'false'}"></i>`
  )).join('');
}

function skillCard(skill, extra = '') {
  return `
    <article class="mn-skill-card">
      <div class="mn-skill-icon" aria-hidden="true">${escapeHtml(skill.icon || '✦')}</div>
      <div class="mn-skill-main">
        <header><strong>${escapeHtml(skill.label)}</strong><span>Уровень ${Number(skill.level) || 1}/5</span></header>
        <div class="mn-skill-level-dots" aria-hidden="true">${levelDots(skill.level)}</div>
        <div class="mn-skill-progress"><i style="width:${progressPercent(skill).toFixed(2)}%"></i></div>
        <footer><small>${progressCaption(skill)}</small>${extra}</footer>
      </div>
    </article>`;
}

function profileMarkup() {
  return `
    <div class="mn-player-profile-modal" data-player-profile-modal hidden aria-hidden="true">
      <button class="mn-player-profile-backdrop" type="button" data-profile-close aria-label="Закрыть"></button>
      <section class="mn-player-profile-panel" role="dialog" aria-modal="true" aria-labelledby="mn-profile-title">
        <header class="mn-profile-header">
          <span><small>Игрок</small><strong id="mn-profile-title" data-profile-title>Профиль</strong></span>
          <button type="button" data-profile-close aria-label="Закрыть">×</button>
        </header>

        <div class="mn-profile-page" data-profile-page="overview">
          <div class="mn-profile-identity">
            <i data-profile-avatar>И</i>
            <span><strong data-profile-nickname>Игрок</strong><small data-profile-id>ID: —</small></span>
          </div>
          <div class="mn-profile-stats">
            <article><i>₴</i><span><small>На руках</small><strong data-profile-balance>0 ₴</strong></span></article>
            <article><i>★</i><span><small>Уровень игрока</small><strong data-profile-level>1</strong></span></article>
          </div>
          <p class="mn-profile-level-note">Общий уровень уже подключён к профилю. Полную систему прогресса добавим следующим этапом.</p>
          <button class="mn-profile-skills-button" type="button" data-profile-open-skills>
            <span><i>✦</i><b>Навыки</b><small>Профессии, ресурсы и физическая форма</small></span><strong>Открыть ›</strong>
          </button>
        </div>

        <div class="mn-profile-page" data-profile-page="skills" hidden>
          <button class="mn-profile-back" type="button" data-profile-back>‹ Назад в профиль</button>
          <div class="mn-skills-content" data-skills-content>
            <div class="mn-skills-loading">Загружаем навыки…</div>
          </div>
        </div>
      </section>
    </div>`;
}

function showLevelToast(detail = {}) {
  document.querySelectorAll('.mn-skill-level-toast').forEach((element) => element.remove());
  const toast = document.createElement('div');
  toast.className = 'mn-skill-level-toast';
  toast.innerHTML = `
    <i>${escapeHtml(detail.icon || '🏆')}</i>
    <span><small>Новый уровень</small><strong>${escapeHtml(detail.message || `Навык повышен до ${detail.level} уровня!`)}</strong></span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.dataset.visible = 'true'; });
  window.setTimeout(() => {
    toast.dataset.visible = 'false';
    window.setTimeout(() => toast.remove(), 350);
  }, 6500);
}

export function enablePlayerSkillsFeature({ root } = {}) {
  if (!root) return () => {};

  document.querySelector('[data-player-profile-modal]')?.remove();
  document.body.insertAdjacentHTML('beforeend', profileMarkup());

  const modal = document.querySelector('[data-player-profile-modal]');
  const profileButton = root.querySelector('.player-profile-card');
  const content = modal?.querySelector('[data-skills-content]');
  const skillsPage = modal?.querySelector('[data-profile-page="skills"]');
  let destroyed = false;
  let loadPromise = null;
  let runningXpPending = 0;
  let runningXpInFlight = false;
  let flushTimer = 0;
  let skillsTouch = null;

  function usesForcedMobileRotation() {
    return Boolean(
      window.matchMedia?.('(orientation: portrait)')?.matches &&
      (
        document.documentElement.classList.contains('mn-force-rotate-landscape') ||
        document.body.classList.contains('mn-force-rotate-landscape')
      )
    );
  }

  function handleSkillsTouchStart(event) {
    if (!skillsPage || skillsPage.hidden || !usesForcedMobileRotation() || event.touches.length !== 1) {
      skillsTouch = null;
      return;
    }

    const touch = event.touches[0];
    skillsTouch = {
      identifier: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
      scrollTop: skillsPage.scrollTop,
    };
  }

  function handleSkillsTouchMove(event) {
    if (!skillsPage || !skillsTouch) return;
    const touch = Array.from(event.touches).find((item) => item.identifier === skillsTouch.identifier);
    if (!touch) return;

    const deltaX = touch.clientX - skillsTouch.clientX;
    const deltaY = touch.clientY - skillsTouch.clientY;
    const scrollDelta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : -deltaY;
    if (Math.abs(scrollDelta) < 3) return;

    const maximum = Math.max(0, skillsPage.scrollHeight - skillsPage.clientHeight);
    skillsPage.scrollTop = Math.max(0, Math.min(maximum, skillsTouch.scrollTop + scrollDelta));
    event.preventDefault();
  }

  function handleSkillsTouchEnd() {
    skillsTouch = null;
  }

  function renderOverview() {
    const snapshot = getPlayerSkillsSnapshot();
    const nickname = String(state.nickname || state.player?.nickname || 'Игрок');
    const telegramId = String(state.telegramId || state.player?.tg_id || '—');
    const avatar = modal?.querySelector('[data-profile-avatar]');
    if (avatar) avatar.textContent = nickname.charAt(0).toUpperCase() || 'И';
    const name = modal?.querySelector('[data-profile-nickname]');
    if (name) name.textContent = nickname;
    const id = modal?.querySelector('[data-profile-id]');
    if (id) id.textContent = `ID: ${telegramId}`;
    const balance = modal?.querySelector('[data-profile-balance]');
    if (balance) balance.textContent = money(state.player?.balance);
    const level = modal?.querySelector('[data-profile-level]');
    if (level) level.textContent = String(snapshot.overallLevel || state.player?.level || 1);
  }

  function renderSkills() {
    if (!content) return;
    const openedDetails = new Set(
      [...content.querySelectorAll('details[open][data-skill-details]')]
        .map((element) => element.dataset.skillDetails),
    );
    const snapshot = getPlayerSkillsSnapshot();
    const farmer = snapshot.skills?.farmer || {};
    const running = snapshot.skills?.running || {};
    const miner = snapshot.skills?.miner || {};
    const crops = Array.isArray(snapshot.crops) ? snapshot.crops : [];
    const mineResources = Array.isArray(snapshot.mineResources) ? snapshot.mineResources : [];
    const mineSubtypes = Array.isArray(snapshot.mineSubtypes) ? snapshot.mineSubtypes : [];
    const cropCards = crops.map((crop) => {
      if (crop.unlocked === false) {
        return `
          <article class="mn-crop-skill-card is-locked">
            <i>${escapeHtml(crop.icon)}</i>
            <span><strong>${escapeHtml(crop.label)}</strong><small>Откроется на ${crop.unlockLevel} уровне фермера</small></span>
            <b>🔒</b>
          </article>`;
      }
      return `
        <article class="mn-crop-skill-card">
          <i>${escapeHtml(crop.icon)}</i>
          <span><strong>${escapeHtml(crop.label)}</strong><small>${progressCaption(crop)}</small><em><u style="width:${progressPercent(crop).toFixed(2)}%"></u></em></span>
          <b>${crop.level}/5</b>
        </article>`;
    }).join('');

    const mineResourceBranches = mineResources.map((resource) => {
      const subtypes = mineSubtypes.filter((subtype) => subtype.resourceType === resource.resourceType);
      const locked = resource.unlocked === false;
      const subtypeCards = subtypes.map((subtype) => {
        if (locked || subtype.unlocked === false) {
          return `
            <article class="mn-mine-subtype-card is-locked">
              <i>${escapeHtml(subtype.icon || resource.icon)}</i>
              <span><strong>${escapeHtml(subtype.label)}</strong><small>${locked
                ? `Сначала откройте ${String(resource.label || '').toLowerCase()}`
                : `Откроется на ${subtype.unlockLevel} уровне ветки`}</small></span>
              <b>🔒</b>
            </article>`;
        }
        return `
          <article class="mn-mine-subtype-card">
            <i>${escapeHtml(subtype.icon || resource.icon)}</i>
            <span>
              <strong>${escapeHtml(subtype.label)}</strong>
              <small>${escapeHtml(subtype.qualityLabel || 'Грязное сырьё')} · очистка ${Number(subtype.purityPercent) || 10}%</small>
              <em><u style="width:${progressPercent(subtype).toFixed(2)}%"></u></em>
              <mark>${escapeHtml(subtype.useLabel || 'Продажа и будущие крафты')}</mark>
            </span>
            <b>${Number(subtype.level) || 1}/5</b>
          </article>`;
      }).join('');

      return `
        <details class="mn-mine-resource-branch${locked ? ' is-locked' : ''}" data-skill-details="mine-${escapeHtml(resource.resourceType)}">
          <summary>
            <i>${escapeHtml(resource.icon || '⛏️')}</i>
            <span><strong>${escapeHtml(resource.label)}</strong><small>${locked
              ? `Откроется на ${resource.unlockLevel} уровне шахтёра`
              : `Ветка ${Number(resource.level) || 1}/5 · подтипов ${subtypes.filter((item) => item.unlocked !== false).length}/${subtypes.length}`}</small></span>
            <b>${locked ? '🔒' : `${Number(resource.level) || 1}/5`}</b>
          </summary>
          <div>
            ${locked ? '<p>Сначала повышайте общий навык шахтёра на уже доступных месторождениях.</p>' : skillCard(resource, '<b>Открывает подтипы</b>')}
            <div class="mn-mine-subtype-grid">${subtypeCards}</div>
          </div>
        </details>`;
    }).join('');

    function overviewCard(skill, eyebrow, accent) {
      return `
        <article class="mn-skill-overview-card" data-accent="${accent}">
          <i>${escapeHtml(skill.icon || '✦')}</i>
          <span><small>${eyebrow}</small><strong>${escapeHtml(skill.label)}</strong><em><u style="width:${progressPercent(skill).toFixed(2)}%"></u></em></span>
          <b>${Number(skill.level) || 1}/5</b>
        </article>`;
    }

    content.innerHTML = `
      <section class="mn-skill-section mn-skill-hub">
        <header><span><small>Прогресс игрока</small><strong>Дерево навыков</strong></span><b>Открывайте только нужную ветку — без стены из карточек</b></header>
        <div class="mn-skill-overview-grid">
          ${overviewCard(farmer, 'Работа', 'farm')}
          ${overviewCard(miner, 'Работа', 'mine')}
          ${overviewCard(running, 'Форма', 'running')}
        </div>
      </section>

      <details class="mn-skill-profession" data-skill-details="farmer">
        <summary><i>👨‍🌾</i><span><small>Профессия</small><strong>Фермерское дело</strong></span><b>${Number(farmer.level) || 1}/5</b></summary>
        <div class="mn-skill-profession-body">
          ${skillCard(farmer, '<b>Открытие культур</b>')}
          <div class="mn-crop-skill-grid">${cropCards}</div>
        </div>
      </details>

      <details class="mn-skill-profession is-mine" data-skill-details="miner">
        <summary><i>⛏️</i><span><small>Профессия</small><strong>Шахтёрское дело</strong></span><b>${Number(miner.level) || 1}/5</b></summary>
        <div class="mn-skill-profession-body">
          ${skillCard(miner, '<b>Камень → уголь → металл → медь</b>')}
          <p class="mn-mine-tree-note">Нажмите на ресурс, чтобы увидеть только его подтипы, очистку и назначение.</p>
          <div class="mn-mine-resource-tree">${mineResourceBranches}</div>
        </div>
      </details>

      <details class="mn-skill-profession" data-skill-details="running">
        <summary><i>🏃</i><span><small>Физическая форма</small><strong>Передвижение</strong></span><b>${Number(running.level) || 1}/5</b></summary>
        <div class="mn-skill-profession-body">
          ${skillCard(running, `<b>−${Number(running.bonusPercent) || 0}% к расходу</b>`)}
        </div>
      </details>`;

    content.querySelectorAll('details[data-skill-details]').forEach((element) => {
      element.open = openedDetails.has(element.dataset.skillDetails);
    });
  }

  function setPage(page) {
    modal?.querySelectorAll('[data-profile-page]').forEach((element) => {
      element.hidden = element.dataset.profilePage !== page;
    });
    const title = modal?.querySelector('[data-profile-title]');
    if (title) title.textContent = page === 'skills' ? 'Навыки' : 'Профиль';
    if (page === 'skills') {
      renderSkills();
      if (skillsPage) skillsPage.scrollTop = 0;
    }
  }

  async function refreshSkills({ silent = true } = {}) {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const [farmResult, mineResult] = await Promise.allSettled([
        loadPlayerSkills(),
        loadMineSkills(),
      ]);

      if (!destroyed && farmResult.status === 'fulfilled') publishPlayerSkills(farmResult.value);
      if (!destroyed && mineResult.status === 'fulfilled') publishPlayerSkills(mineResult.value);

      if (farmResult.status === 'rejected' && !String(farmResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSkills] farm skills load failed:', farmResult.reason);
      }
      if (mineResult.status === 'rejected' && !String(mineResult.reason?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSkills] mine skills load failed:', mineResult.reason);
      }

      const loaded = farmResult.status === 'fulfilled' || mineResult.status === 'fulfilled';
      if (!loaded && !silent && content) {
        content.innerHTML = '<div class="mn-skills-loading is-error">Не удалось загрузить навыки. Закройте профиль и попробуйте ещё раз.</div>';
      }
      loadPromise = null;
      return loaded ? getPlayerSkillsSnapshot() : null;
    })();
    return loadPromise;
  }

  async function flushRunningXp() {
    if (runningXpInFlight || runningXpPending < 1) return;
    const amount = Math.max(1, Math.min(100, Math.floor(runningXpPending)));
    runningXpPending = Math.max(0, runningXpPending - amount);
    runningXpInFlight = true;
    try {
      const result = await addRunningSkillXp(amount);
      if (!destroyed) publishPlayerSkills(result, { levelUps: result?.levelUps });
    } catch (error) {
      runningXpPending = Math.min(200, runningXpPending + amount);
      if (!String(error?.message || '').includes('TELEGRAM_SESSION')) {
        console.warn('[playerSkills] running XP sync failed:', error);
      }
    } finally {
      runningXpInFlight = false;
      if (!destroyed && runningXpPending >= RUNNING_XP_BATCH) queueMicrotask(flushRunningXp);
    }
  }

  function scheduleRunningXpFlush() {
    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flushRunningXp, RUNNING_XP_FLUSH_MS);
  }

  function handleRunningXp(event) {
    const amount = Math.max(0, Number(event?.detail?.amount) || 0);
    if (!amount) return;
    runningXpPending = Math.min(200, runningXpPending + amount);
    if (runningXpPending >= RUNNING_XP_BATCH) void flushRunningXp();
    else scheduleRunningXpFlush();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') void flushRunningXp();
  }

  function openProfile() {
    if (!modal) return;
    renderOverview();
    setPage('overview');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mn-player-profile-open');
    void refreshSkills({ silent: false });
  }

  function closeProfile() {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mn-player-profile-open');
  }

  function handleSkillsChanged() {
    renderOverview();
    if (modal?.querySelector('[data-profile-page="skills"]')?.hidden === false) renderSkills();
  }

  function handleBalanceChanged(event) {
    const balance = Number(event?.detail?.balance);
    if (Number.isFinite(balance)) state.player = { ...(state.player || {}), balance };
    renderOverview();
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && modal?.hidden === false) closeProfile();
  }

  function handleLevelUp(event) {
    showLevelToast(event.detail);
  }

  profileButton?.addEventListener('click', openProfile);
  modal?.querySelectorAll('[data-profile-close]').forEach((button) => button.addEventListener('click', closeProfile));
  modal?.querySelector('[data-profile-open-skills]')?.addEventListener('click', () => setPage('skills'));
  modal?.querySelector('[data-profile-back]')?.addEventListener('click', () => setPage('overview'));
  skillsPage?.addEventListener('touchstart', handleSkillsTouchStart, { passive: true });
  skillsPage?.addEventListener('touchmove', handleSkillsTouchMove, { passive: false });
  skillsPage?.addEventListener('touchend', handleSkillsTouchEnd, { passive: true });
  skillsPage?.addEventListener('touchcancel', handleSkillsTouchEnd, { passive: true });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('mn:player-skills-changed', handleSkillsChanged);
  window.addEventListener('mn:player-skill-level-up', handleLevelUp);
  window.addEventListener('mn:player-balance-changed', handleBalanceChanged);
  window.addEventListener('mn:player-running-xp', handleRunningXp);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void refreshSkills({ silent: true });

  return () => {
    if (runningXpPending >= 1) void flushRunningXp();
    destroyed = true;
    window.clearTimeout(flushTimer);
    profileButton?.removeEventListener('click', openProfile);
    skillsPage?.removeEventListener('touchstart', handleSkillsTouchStart);
    skillsPage?.removeEventListener('touchmove', handleSkillsTouchMove);
    skillsPage?.removeEventListener('touchend', handleSkillsTouchEnd);
    skillsPage?.removeEventListener('touchcancel', handleSkillsTouchEnd);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('mn:player-skills-changed', handleSkillsChanged);
    window.removeEventListener('mn:player-skill-level-up', handleLevelUp);
    window.removeEventListener('mn:player-balance-changed', handleBalanceChanged);
    window.removeEventListener('mn:player-running-xp', handleRunningXp);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.body.classList.remove('mn-player-profile-open');
    modal?.remove();
    document.querySelectorAll('.mn-skill-level-toast').forEach((element) => element.remove());
  };
}
