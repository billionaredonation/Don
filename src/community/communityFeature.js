import {
  loadCommunity,
  createCommunity,
  inviteCommunityPlayer,
  answerCommunityInvite,
  leaveCommunity,
  kickCommunityMember,
  transferCommunityOwner,
  communityError,
} from './communityApi.js';
import './community.css';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

export function enableCommunityFeature({ root } = {}) {
  const modal = document.querySelector('[data-player-profile-modal]');
  const overview = modal?.querySelector('[data-profile-page="overview"]');
  const panel = modal?.querySelector('.mn-player-profile-panel');
  if (!modal || !overview || !panel) return () => {};

  modal.querySelector('[data-profile-open-community]')?.remove();
  modal.querySelector('[data-profile-page="community"]')?.remove();

  overview.insertAdjacentHTML('beforeend', `
    <button class="mn-profile-skills-button mn-profile-community-button" type="button" data-profile-open-community>
      <span><i>◉</i><b>Сообщество</b><small>До 10 игроков · совместная работа и бонусы</small></span>
      <strong>Открыть ›</strong>
    </button>
  `);

  panel.insertAdjacentHTML('beforeend', `
    <div class="mn-profile-page mn-community-page" data-profile-page="community" hidden>
      <button class="mn-profile-back" type="button" data-community-back>‹ Назад в профиль</button>
      <div class="mn-community-content" data-community-content>
        <div class="mn-skills-loading">Загружаем сообщество…</div>
      </div>
    </div>
  `);

  const button = modal.querySelector('[data-profile-open-community]');
  const page = modal.querySelector('[data-profile-page="community"]');
  const content = modal.querySelector('[data-community-content]');
  let destroyed = false;
  let busy = false;
  let snapshot = null;

  function showCommunity() {
    modal.querySelectorAll('[data-profile-page]').forEach((node) => { node.hidden = true; });
    page.hidden = false;
    void refresh();
  }

  function showOverview() {
    page.hidden = true;
    const profile = modal.querySelector('[data-profile-page="overview"]');
    if (profile) profile.hidden = false;
  }

  function benefits() {
    return `
      <section class="mn-community-benefits">
        <article><strong>+10%</strong><span>ресурсов при совместной работе</span></article>
        <article><strong>18%</strong><span>комиссия при продаже имущества государству</span></article>
        <article><strong>−3%</strong><span>на покупку имущества у государства</span></article>
        <article><strong>10</strong><span>максимум участников</span></article>
      </section>
      <p class="mn-community-note">Скидки не действуют на сделки между игроками, налоги и коммунальные услуги.</p>
    `;
  }

  function inviteMarkup(invites = []) {
    if (!invites.length) return '';
    return `
      <section class="mn-community-card">
        <header><strong>Приглашения</strong><small>${invites.length}</small></header>
        <div class="mn-community-list">
          ${invites.map((invite) => `
            <article>
              <span><b>${esc(invite.name)}</b><small>${esc(invite.publicId)} · от ${esc(invite.invitedByNickname)}</small></span>
              <div>
                <button data-community-answer="${esc(invite.id)}" data-accept="false">Отклонить</button>
                <button data-community-answer="${esc(invite.id)}" data-accept="true">Принять</button>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function render() {
    if (!content || destroyed) return;
    const data = snapshot || {};
    const membership = data.membership;
    const invites = Array.isArray(data.invites) ? data.invites : [];
    const level = Number(data.playerLevel || 1);

    if (!membership) {
      content.innerHTML = `
        ${benefits()}
        ${inviteMarkup(invites)}
        <section class="mn-community-card mn-community-create">
          <header><strong>Создать сообщество</strong><small>доступно со 2 уровня</small></header>
          <p>Объедините до 10 игроков. Название можно задать сейчас.</p>
          <input type="text" maxlength="32" placeholder="Название сообщества" data-community-name ${level < 2 ? 'disabled' : ''}>
          <button type="button" data-community-create ${level < 2 ? 'disabled' : ''}>
            ${level < 2 ? `Нужен 2 уровень · сейчас ${level}` : 'Создать сообщество'}
          </button>
        </section>
      `;
      return;
    }

    const isOwner = membership.role === 'owner';
    const members = Array.isArray(data.members) ? data.members : [];

    content.innerHTML = `
      <section class="mn-community-hero">
        <span><small>СООБЩЕСТВО</small><strong>${esc(membership.name)}</strong><em>${esc(membership.publicId)}</em></span>
        <b>${Number(membership.memberCount || members.length)}/10</b>
      </section>
      ${benefits()}
      ${isOwner ? `
        <section class="mn-community-card">
          <header><strong>Пригласить игрока</strong><small>по нику или ID</small></header>
          <div class="mn-community-invite-row">
            <input type="text" maxlength="80" placeholder="Ник или Telegram ID" data-community-target>
            <button type="button" data-community-invite>Пригласить</button>
          </div>
        </section>
      ` : ''}
      <section class="mn-community-card">
        <header><strong>Участники</strong><small>${members.length}/10</small></header>
        <div class="mn-community-list">
          ${members.map((member) => `
            <article>
              <span>
                <b>${esc(member.nickname)} ${member.role === 'owner' ? '★' : ''}</b>
                <small>Уровень ${Number(member.level || 1)}${member.working ? ' · сейчас работает' : ''}</small>
              </span>
              ${isOwner && member.role !== 'owner' ? `
                <div>
                  <button data-community-transfer="${esc(member.tgId)}">Передать главу</button>
                  <button data-community-kick="${esc(member.tgId)}">Исключить</button>
                </div>
              ` : ''}
            </article>
          `).join('')}
        </div>
      </section>
      <section class="mn-community-actions">
        <button type="button" data-community-leave>${isOwner && members.length === 1 ? 'Удалить сообщество' : 'Выйти из сообщества'}</button>
      </section>
    `;
  }

  async function run(task, success = '') {
    if (busy) return;
    busy = true;
    try {
      await task();
      if (success) toast(success, 'success');
      await refresh();
    } catch (error) {
      toast(communityError(error), 'error');
    } finally {
      busy = false;
    }
  }

  async function refresh() {
    if (busy || destroyed || page.hidden) return;
    busy = true;
    try {
      snapshot = await loadCommunity();
      render();
    } catch (error) {
      content.innerHTML = `<div class="mn-community-error">${esc(communityError(error))}</div>`;
    } finally {
      busy = false;
    }
  }

  function onClick(event) {
    const target = event.target;
    if (target.closest('[data-profile-open-community]')) {
      showCommunity();
      return;
    }
    if (target.closest('[data-community-back]')) {
      showOverview();
      return;
    }
    const create = target.closest('[data-community-create]');
    if (create) {
      const name = content.querySelector('[data-community-name]')?.value || '';
      void run(() => createCommunity(name), 'Сообщество создано.');
      return;
    }
    const invite = target.closest('[data-community-invite]');
    if (invite) {
      const value = content.querySelector('[data-community-target]')?.value || '';
      void run(() => inviteCommunityPlayer(value), 'Приглашение отправлено.');
      return;
    }
    const answer = target.closest('[data-community-answer]');
    if (answer) {
      void run(
        () => answerCommunityInvite(answer.dataset.communityAnswer, answer.dataset.accept === 'true'),
        answer.dataset.accept === 'true' ? 'Вы вступили в сообщество.' : 'Приглашение отклонено.',
      );
      return;
    }
    const kick = target.closest('[data-community-kick]');
    if (kick) {
      void run(() => kickCommunityMember(kick.dataset.communityKick), 'Игрок исключён.');
      return;
    }
    const transfer = target.closest('[data-community-transfer]');
    if (transfer) {
      void run(() => transferCommunityOwner(transfer.dataset.communityTransfer), 'Руководство передано.');
      return;
    }
    if (target.closest('[data-community-leave]')) {
      void run(() => leaveCommunity(), 'Вы вышли из сообщества.');
    }
  }

  modal.addEventListener('click', onClick);

  return () => {
    destroyed = true;
    modal.removeEventListener('click', onClick);
    modal.querySelector('[data-profile-open-community]')?.remove();
    modal.querySelector('[data-profile-page="community"]')?.remove();
  };
}
