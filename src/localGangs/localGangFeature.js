import {
  loadLocalGang,
  createLocalGang,
  inviteLocalGangPlayer,
  answerLocalGangInvite,
  kickLocalGangMember,
  transferLocalGangOwner,
  leaveLocalGang,
  localGangError,
} from './localGangApi.js';

import './localGang.css';

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

function dateLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day:'2-digit',
    month:'2-digit',
    year:'numeric',
    hour:'2-digit',
    minute:'2-digit',
  });
}

function cooldownLabel(seconds) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.ceil((total % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours} ч ${minutes} мин`;
  if (hours > 0) return `${hours} ч`;
  return `${Math.max(1, minutes)} мин`;
}

export function enableLocalGangFeature({ root } = {}) {
  const modal = document.querySelector('[data-player-profile-modal]');
  const overview = modal?.querySelector('[data-profile-page="overview"]');
  const panel = modal?.querySelector('.mn-player-profile-panel');

  if (!modal || !overview || !panel) return () => {};

  modal.querySelector('[data-profile-open-local-gang]')?.remove();
  modal.querySelector('[data-profile-page="local-gang"]')?.remove();

  overview.insertAdjacentHTML('beforeend', `
    <button class="mn-profile-skills-button mn-profile-local-gang-button" type="button" data-profile-open-local-gang>
      <span>
        <i>◆</i>
        <b>Местная банда</b>
        <small>2–3 человека · мелкий уличный криминал</small>
      </span>
      <strong>Открыть ›</strong>
    </button>
  `);

  panel.insertAdjacentHTML('beforeend', `
    <div class="mn-profile-page mn-local-gang-page" data-profile-page="local-gang" hidden>
      <button class="mn-profile-back" type="button" data-local-gang-back>‹ Назад в профиль</button>
      <div class="mn-local-gang-content" data-local-gang-content>
        <div class="mn-skills-loading">Загружаем данные…</div>
      </div>
    </div>
  `);

  const page = modal.querySelector('[data-profile-page="local-gang"]');
  const content = modal.querySelector('[data-local-gang-content]');

  let destroyed = false;
  let busy = false;
  let snapshot = null;

  function showGang() {
    modal.querySelectorAll('[data-profile-page]').forEach((node) => { node.hidden = true; });
    page.hidden = false;
    void refresh();
  }

  function showOverview() {
    page.hidden = true;
    const profile = modal.querySelector('[data-profile-page="overview"]');
    if (profile) profile.hidden = false;
  }

  function lore() {
    return `
      <section class="mn-local-gang-lore">
        <article>
          <strong>2–3 участника</strong>
          <span>Мелкая местная компания. Для совместных криминальных действий нужно минимум 2 человека.</span>
        </article>
        <article>
          <strong>Улица и небольшие магазины</strong>
          <span>Нападения на прохожих, драки и мелкие налёты — предел возможностей такой группы.</span>
        </article>
        <article class="is-denied">
          <strong>Не ОПГ</strong>
          <span>Заводы, электростанции и крупные предприятия грабить нельзя: такую группу просто скрутят.</span>
        </article>
      </section>
    `;
  }

  function invitesMarkup(invites = []) {
    if (!invites.length) return '';

    return `
      <section class="mn-local-gang-card">
        <header><strong>Приглашения</strong><small>${invites.length}</small></header>
        <div class="mn-local-gang-list">
          ${invites.map((invite) => `
            <article>
              <span>
                <b>${esc(invite.name)}</b>
                <small>${esc(invite.publicId)} · от ${esc(invite.invitedByNickname)}</small>
              </span>
              <div>
                <button type="button" data-local-gang-answer="${esc(invite.id)}" data-accept="false">Отклонить</button>
                <button type="button" data-local-gang-answer="${esc(invite.id)}" data-accept="true">Принять</button>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function crimeBook(records = []) {
    return `
      <section class="mn-local-gang-card">
        <header>
          <strong>Уголовная книжка</strong>
          <small>${records.length ? `${records.length} запис.` : 'чисто'}</small>
        </header>
        ${
          records.length
            ? `<div class="mn-local-gang-crimes">
                ${records.map((record) => `
                  <article>
                    <span>
                      <b>${esc(record.title)}</b>
                      <small>${esc(record.place || 'Место не указано')} · ${esc(dateLabel(record.createdAt))}</small>
                    </span>
                    <i>ур. ${Number(record.severity || 1)}</i>
                  </article>
                `).join('')}
              </div>`
            : '<p class="mn-local-gang-empty">Записей нет. Для работодателей история чистая.</p>'
        }
      </section>
    `;
  }

  function render() {
    if (!content || destroyed) return;

    const data = snapshot || {};
    const membership = data.membership;
    const invites = Array.isArray(data.invites) ? data.invites : [];
    const crimes = Array.isArray(data.crimeRecords) ? data.crimeRecords : [];
    const createCooldown = data.createCooldown?.active ? data.createCooldown : null;

    if (!membership) {
      content.innerHTML = `
        ${lore()}
        ${invitesMarkup(invites)}
        ${createCooldown ? `
          <section class="mn-local-gang-status is-waiting">
            <strong>Создание новой банды на КД</strong>
            <span>После выхода или удаления банды новую можно создать через ${esc(cooldownLabel(createCooldown.remainingSeconds))}.</span>
          </section>
        ` : ''}
        <section class="mn-local-gang-card">
          <header>
            <strong>Создать местную банду</strong>
            <small>${createCooldown ? `КД ${esc(cooldownLabel(createCooldown.remainingSeconds))}` : 'максимум 3 человека'}</small>
          </header>
          <p>Создатель становится главой. Полноценной группой банда считается после вступления второго игрока.</p>
          <input type="text" maxlength="28" placeholder="Название банды" data-local-gang-name ${createCooldown ? 'disabled' : ''}>
          <button type="button" data-local-gang-create ${createCooldown ? 'disabled' : ''}>
            ${createCooldown ? `Доступно через ${esc(cooldownLabel(createCooldown.remainingSeconds))}` : 'Создать'}
          </button>
        </section>
        ${crimeBook(crimes)}
      `;
      return;
    }

    const members = Array.isArray(data.members) ? data.members : [];
    const isOwner = membership.role === 'owner';
    const active = membership.active === true;

    content.innerHTML = `
      <section class="mn-local-gang-hero ${active ? 'is-active' : 'is-inactive'}">
        <span>
          <small>МЕСТНАЯ БАНДА</small>
          <strong>${esc(membership.name)}</strong>
          <em>${esc(membership.publicId)}</em>
        </span>
        <b>${Number(membership.memberCount || members.length)}/3</b>
      </section>

      <section class="mn-local-gang-status ${active ? 'is-active' : 'is-waiting'}">
        <strong>${active ? 'Группа активна' : 'Нужен ещё один участник'}</strong>
        <span>${
          active
            ? '2+ участника: совместные уличные действия доступны системе.'
            : 'Один игрок — это пока не банда. Пригласите второго участника.'
        }</span>
      </section>

      ${lore()}

      ${isOwner && members.length < 3 ? `
        <section class="mn-local-gang-card">
          <header><strong>Пригласить игрока</strong><small>по нику или Telegram ID</small></header>
          <div class="mn-local-gang-invite-row">
            <input type="text" maxlength="80" placeholder="Ник или Telegram ID" data-local-gang-target>
            <button type="button" data-local-gang-invite>Пригласить</button>
          </div>
        </section>
      ` : ''}

      <section class="mn-local-gang-card">
        <header><strong>Участники</strong><small>${members.length}/3</small></header>
        <div class="mn-local-gang-list">
          ${members.map((member) => `
            <article>
              <span>
                <b>${esc(member.nickname)} ${member.role === 'owner' ? '★' : ''}</b>
                <small>Уровень ${Number(member.level || 1)}</small>
              </span>
              ${
                isOwner && member.role !== 'owner'
                  ? `<div>
                      <button type="button" data-local-gang-transfer="${esc(member.tgId)}">Передать главу</button>
                      <button type="button" data-local-gang-kick="${esc(member.tgId)}">Исключить</button>
                    </div>`
                  : ''
              }
            </article>
          `).join('')}
        </div>
      </section>

      ${crimeBook(crimes)}

      <section class="mn-local-gang-actions">
        <button type="button" data-local-gang-leave>
          ${isOwner && members.length === 1 ? 'Удалить банду' : 'Выйти из банды'}
        </button>
      </section>
    `;
  }

  async function refresh() {
    if (busy || destroyed || page.hidden) return;

    busy = true;

    try {
      snapshot = await loadLocalGang();
      render();
    } catch (error) {
      content.innerHTML = `<div class="mn-local-gang-error">${esc(localGangError(error))}</div>`;
    } finally {
      busy = false;
    }
  }

  async function run(task, success = '') {
    if (busy) return;
    busy = true;

    try {
      await task();
      if (success) toast(success, 'success');
      snapshot = await loadLocalGang();
      render();
    } catch (error) {
      toast(localGangError(error), 'error');
    } finally {
      busy = false;
    }
  }

  function onClick(event) {
    const target = event.target;

    if (target.closest('[data-profile-open-local-gang]')) {
      showGang();
      return;
    }

    if (target.closest('[data-local-gang-back]')) {
      showOverview();
      return;
    }

    if (target.closest('[data-local-gang-create]')) {
      const name = content.querySelector('[data-local-gang-name]')?.value || '';
      void run(() => createLocalGang(name), 'Местная банда создана.');
      return;
    }

    if (target.closest('[data-local-gang-invite]')) {
      const value = content.querySelector('[data-local-gang-target]')?.value || '';
      void run(() => inviteLocalGangPlayer(value), 'Приглашение отправлено.');
      return;
    }

    const answer = target.closest('[data-local-gang-answer]');
    if (answer) {
      const accepted = answer.dataset.accept === 'true';
      void run(
        () => answerLocalGangInvite(answer.dataset.localGangAnswer, accepted),
        accepted ? 'Вы вступили в местную банду.' : 'Приглашение отклонено.',
      );
      return;
    }

    const kick = target.closest('[data-local-gang-kick]');
    if (kick) {
      void run(() => kickLocalGangMember(kick.dataset.localGangKick), 'Игрок исключён.');
      return;
    }

    const transfer = target.closest('[data-local-gang-transfer]');
    if (transfer) {
      void run(() => transferLocalGangOwner(transfer.dataset.localGangTransfer), 'Глава банды изменён.');
      return;
    }

    if (target.closest('[data-local-gang-leave]')) {
      const deleting = snapshot?.membership?.role === 'owner'
        && Number(snapshot?.membership?.memberCount || 0) === 1;

      void run(
        () => leaveLocalGang(),
        deleting
          ? 'Местная банда удалена. Новую можно создать через 3 часа.'
          : 'Вы вышли из местной банды. Новую можно создать через 3 часа.',
      );
    }
  }

  modal.addEventListener('click', onClick);

  return () => {
    destroyed = true;
    modal.removeEventListener('click', onClick);
    modal.querySelector('[data-profile-open-local-gang]')?.remove();
    modal.querySelector('[data-profile-page="local-gang"]')?.remove();
  };
}
