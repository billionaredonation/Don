import './bank.css';
import {
  bankDepositTopup,
  bankDepositWithdraw,
  bankLookupRecipient,
  bankOpenAccount,
  bankSalaryToDebit,
  bankSnapshot,
  bankStatement,
  bankTransferPlayer,
} from './bankApi.js';

const ACCOUNT_META = {
  debit: { label: 'Дебетовая карта', icon: '💳', note: 'Покупки, коммуналка, счета и переводы.' },
  salary: { label: 'Зарплатная карта', icon: '💼', note: 'Сюда будут приходить игровые заработки.' },
  deposit: { label: 'Депозит', icon: '🏦', note: '0,01% от основной суммы за каждый полный час.' },
};

const ERROR_TEXT = {
  BANK_TELEGRAM_SESSION_REQUIRED: 'Банк доступен только из Telegram Mini App.',
  TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапусти Mini App.',
  BANK_PLAYER_NOT_FOUND: 'Игрок не найден.',
  BANK_ACCOUNT_ALREADY_OPEN: 'Этот счёт уже открыт.',
  BANK_ACCOUNT_NOT_OPEN: 'Сначала открой нужный счёт.',
  BANK_ACCOUNT_TYPE_INVALID: 'Некорректный тип счёта.',
  BANK_BALANCE_NOT_ENOUGH: 'Недостаточно средств.',
  BANK_AMOUNT_INVALID: 'Укажи корректную сумму.',
  BANK_TRANSFER_INVALID: 'Проверь номер счёта и сумму.',
  BANK_RECIPIENT_ACCOUNT_INVALID: 'Номер получателя должен иметь вид MN-D-00000000.',
  BANK_RECIPIENT_NOT_FOUND: 'Дебетовый счёт получателя не найден.',
  BANK_SELF_TRANSFER_NOT_ALLOWED: 'Нельзя переводить самому себе.',
  BANK_OWN_TRANSFER_NOT_ALLOWED: 'Такой перевод между своими счетами запрещён.',
};

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const money = (value) => `${Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
const account = (snapshot, type) => (snapshot?.accounts || []).find((item) => item?.type === type) || null;

function bankObjectType(object) {
  return String(
    object?.payload?.jobType ||
    object?.payload?.type ||
    object?.type ||
    object?.category ||
    ''
  ).trim().toLowerCase();
}

export function isBankMapObject(object) {
  const type = bankObjectType(object);
  const name = String(object?.name || object?.payload?.name || '').trim().toLowerCase();
  return ['bank', 'bank_branch', 'mn_bank', 'bank_office'].includes(type) || name === 'банк' || name.includes('банк mn');
}

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
}

function errorText(error) {
  const raw = String(error?.message || error || 'BANK_REQUEST_FAILED');
  const code = raw.match(/BANK_[A-Z0-9_]+/)?.[0] || raw;
  return ERROR_TEXT[code] || raw;
}

function markup() {
  return `<div class="mn-bank-backdrop" data-bank-modal hidden>
    <section class="mn-bank-panel" role="dialog" aria-modal="true" aria-label="Банк MN">
      <header class="mn-bank-header">
        <div><small>ФИНАНСОВАЯ СИСТЕМА</small><h2>MN Bank</h2><p data-bank-branch>Отделение банка</p></div>
        <button type="button" class="mn-bank-close" data-bank-close aria-label="Закрыть">×</button>
      </header>
      <nav class="mn-bank-tabs">
        <button type="button" class="is-active" data-bank-tab="accounts">Счета</button>
        <button type="button" data-bank-tab="transfer">Переводы</button>
        <button type="button" data-bank-tab="history">История</button>
      </nav>
      <main class="mn-bank-body">
        <section data-bank-page="accounts">
          <div class="mn-bank-total"><small>Все средства</small><strong data-bank-total>0,00 ₴</strong><span data-bank-holder>Игрок</span></div>
          <div class="mn-bank-accounts" data-bank-accounts></div>
          <div class="mn-bank-own-actions" data-bank-own-actions></div>
        </section>
        <section data-bank-page="transfer" hidden>
          <article class="mn-bank-form-card">
            <div class="mn-bank-form-title"><span>↗</span><div><strong>Перевод игроку</strong><small>Перевод выполняется только с дебетовой карты на дебетовую карту.</small></div></div>
            <label>Дебетовый номер получателя<input data-bank-recipient maxlength="13" autocomplete="off" spellcheck="false" placeholder="MN-D-00100000"></label>
            <div class="mn-bank-recipient-result" data-bank-recipient-result hidden></div>
            <div class="mn-bank-inline"><button type="button" data-bank-lookup>Проверить получателя</button><input data-bank-transfer-amount type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Сумма"></div>
            <button type="button" class="mn-bank-primary" data-bank-transfer>Перевести</button>
          </article>
          <div class="mn-bank-transfer-hint"><strong>Важно</strong><p>Для перевода используется публичный номер дебетовой карты вида <b>MN-D-XXXXXXXX</b>. Telegram ID и внутренние UUID не принимаются.</p></div>
        </section>
        <section data-bank-page="history" hidden>
          <div class="mn-bank-history-head"><div><strong>История операций</strong><small>Последние банковские движения</small></div><button type="button" data-bank-refresh-history>Обновить</button></div>
          <div class="mn-bank-history" data-bank-history><div class="mn-bank-empty">Операций пока нет.</div></div>
        </section>
      </main>
      <div class="mn-bank-loading" data-bank-loading hidden><span></span><b>Банк обрабатывает запрос…</b></div>
    </section>
  </div>`;
}

function accountCard(type, data) {
  const meta = ACCOUNT_META[type];
  if (!data) {
    return `<article class="mn-bank-account is-closed" data-bank-card="${type}">
      <div class="mn-bank-account-icon">${meta.icon}</div><div class="mn-bank-account-main"><small>${meta.label}</small><strong>Не открыта</strong><p>${meta.note}</p></div>
      <button type="button" data-bank-open="${type}">Открыть карту</button>
    </article>`;
  }
  const deposit = type === 'deposit' ? data.deposit || {} : null;
  const extra = type === 'deposit'
    ? `<div class="mn-bank-deposit-info"><span>Основная сумма <b>${money(deposit?.principal)}</b></span><span>Начислено <b>+${money(Number(deposit?.accruedInterest || 0) + Number(deposit?.pendingInterest || 0))}</b></span><span>Полных часов <b>${Number(deposit?.fullHoursPending || 0)}</b></span></div>`
    : '';
  return `<article class="mn-bank-account" data-bank-card="${type}">
    <div class="mn-bank-account-icon">${meta.icon}</div><div class="mn-bank-account-main"><small>${meta.label}</small><strong>${money(data.balance)}</strong><code>${esc(data.publicAccountId)}</code><p>${meta.note}</p>${extra}</div>
    <button type="button" data-bank-copy="${esc(data.publicAccountId)}">Копировать</button>
  </article>`;
}

function ownActions(snapshot) {
  const debit = account(snapshot, 'debit');
  const salary = account(snapshot, 'salary');
  const deposit = account(snapshot, 'deposit');
  if (!debit && !salary && !deposit) return `<div class="mn-bank-empty">Открой хотя бы одну карту. Дебетовая при открытии подхватит текущий игровой баланс.</div>`;
  const blocks = [];
  if (salary && debit) blocks.push(`<article><div><strong>Зарплата → дебет</strong><small>Переведи заработанные деньги на основную карту.</small></div><div><input data-bank-own-amount="salary" type="number" min="0.01" step="0.01" placeholder="Сумма"><button type="button" data-bank-own="salary_to_debit">Перевести</button></div></article>`);
  if (debit && deposit) blocks.push(`<article><div><strong>Пополнить депозит</strong><small>С дебетовой карты. После пополнения новый час считается от новой основной суммы.</small></div><div><input data-bank-own-amount="deposit_topup" type="number" min="0.01" step="0.01" placeholder="Сумма"><button type="button" data-bank-own="deposit_topup">Пополнить</button></div></article>`);
  if (deposit && debit) blocks.push(`<article><div><strong>Снять с депозита</strong><small>Накопленные проценты сначала фиксируются, затем сумма переводится на дебет.</small></div><div><input data-bank-own-amount="deposit_withdraw" type="number" min="0.01" step="0.01" placeholder="Сумма"><button type="button" data-bank-own="deposit_withdraw">Снять</button></div></article>`);
  return blocks.join('') || `<div class="mn-bank-empty">Открой недостающие карты, чтобы появились переводы между своими счетами.</div>`;
}

function transactionRow(tx) {
  const direction = tx?.direction || 'unknown';
  const sign = direction === 'incoming' ? '+' : direction === 'outgoing' ? '−' : '↔';
  const cls = direction === 'incoming' ? 'is-in' : direction === 'outgoing' ? 'is-out' : 'is-own';
  const when = tx?.createdAt ? new Date(tx.createdAt).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const label = tx?.description || tx?.type || 'Операция';
  const counterpart = direction === 'incoming' ? (tx?.fromNickname || tx?.fromPublicAccountId || '') : direction === 'outgoing' ? (tx?.toNickname || tx?.toPublicAccountId || '') : '';
  return `<article class="mn-bank-history-row ${cls}"><div><strong>${esc(label)}</strong><small>${esc(counterpart)}${counterpart ? ' · ' : ''}${esc(when)}</small></div><b>${sign}${money(tx?.amount)}</b></article>`;
}

export function enableBankFeature({ root } = {}) {
  if (!root) return () => {};
  root.insertAdjacentHTML('beforeend', markup());
  const modal = root.querySelector('[data-bank-modal]');
  const q = (s) => modal.querySelector(s);
  const qa = (s) => [...modal.querySelectorAll(s)];
  let snapshot = null;
  let history = [];
  let busy = false;
  let selectedRecipient = null;
  let branchObject = null;

  function setBusy(value) {
    busy = Boolean(value);
    q('[data-bank-loading]').hidden = !busy;
    qa('button,input').forEach((el) => { if (!el.matches('[data-bank-close]')) el.disabled = busy; });
  }

  function emitDebitBalance() {
    const debit = account(snapshot, 'debit');
    if (!debit) return;
    window.dispatchEvent(new CustomEvent('mn:player-balance-changed', { detail: { balance: Number(debit.balance || 0), source: 'bank' } }));
  }

  function render() {
    q('[data-bank-total]').textContent = money(snapshot?.totalFunds || 0);
    q('[data-bank-holder]').textContent = snapshot?.player?.nickname || 'Игрок';
    q('[data-bank-accounts]').innerHTML = ['debit','salary','deposit'].map((type) => accountCard(type, account(snapshot, type))).join('');
    q('[data-bank-own-actions]').innerHTML = ownActions(snapshot);
    q('[data-bank-history]').innerHTML = history.length ? history.map(transactionRow).join('') : `<div class="mn-bank-empty">Операций пока нет.</div>`;
    q('[data-bank-branch]').textContent = branchObject?.name || 'Отделение банка';
    bindDynamic();
  }

  async function refresh({ withHistory = false } = {}) {
    snapshot = await bankSnapshot();
    if (withHistory) {
      const statement = await bankStatement(50);
      history = Array.isArray(statement?.transactions) ? statement.transactions : [];
    }
    render();
    emitDebitBalance();
  }

  async function run(task, success = '') {
    if (busy) return;
    setBusy(true);
    try {
      const result = await task();
      if (result?.accounts) snapshot = result;
      else await refresh();
      await refresh({ withHistory: true });
      if (success) toast(success, 'success');
    } catch (error) {
      toast(errorText(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function tab(name) {
    qa('[data-bank-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.bankTab === name));
    qa('[data-bank-page]').forEach((page) => { page.hidden = page.dataset.bankPage !== name; });
    if (name === 'history') run(async () => { const s = await bankStatement(50); history = s?.transactions || []; render(); });
  }

  function bindDynamic() {
    qa('[data-bank-open]').forEach((button) => { button.onclick = () => run(() => bankOpenAccount(button.dataset.bankOpen), `${ACCOUNT_META[button.dataset.bankOpen]?.label || 'Счёт'} открыт.`); });
    qa('[data-bank-copy]').forEach((button) => { button.onclick = async () => { try { await navigator.clipboard.writeText(button.dataset.bankCopy || ''); toast('Номер карты скопирован.', 'success'); } catch { toast(button.dataset.bankCopy || '', 'info'); } }; });
    qa('[data-bank-own]').forEach((button) => { button.onclick = () => {
      const action = button.dataset.bankOwn;
      const input = q(`[data-bank-own-amount="${action}"]`) || q(`[data-bank-own-amount="salary"]`);
      const amount = Number(input?.value || 0);
      if (!(amount > 0)) { toast('Укажи сумму.', 'error'); return; }
      const task = action === 'salary_to_debit' ? () => bankSalaryToDebit(amount) : action === 'deposit_topup' ? () => bankDepositTopup(amount) : () => bankDepositWithdraw(amount);
      run(task, action === 'salary_to_debit' ? 'Деньги переведены на дебетовую карту.' : action === 'deposit_topup' ? 'Депозит пополнен.' : 'Деньги сняты с депозита.');
    }; });
  }

  async function openBank(object) {
    branchObject = object || null;
    modal.hidden = false;
    document.body.classList.add('mn-bank-open');
    tab('accounts');
    setBusy(true);
    try {
      const [s, st] = await Promise.all([bankSnapshot(), bankStatement(50)]);
      snapshot = s;
      history = st?.transactions || [];
      render();
      emitDebitBalance();
    } catch (error) {
      toast(errorText(error), 'error');
      render();
    } finally {
      setBusy(false);
    }
  }

  function closeBank() {
    modal.hidden = true;
    document.body.classList.remove('mn-bank-open');
    selectedRecipient = null;
  }

  q('[data-bank-close]').onclick = closeBank;
  modal.addEventListener('click', (event) => { if (event.target === modal) closeBank(); });
  qa('[data-bank-tab]').forEach((button) => { button.onclick = () => tab(button.dataset.bankTab); });
  q('[data-bank-lookup]').onclick = async () => {
    const id = String(q('[data-bank-recipient]').value || '').trim().toUpperCase();
    if (!id) return toast('Введи номер дебетовой карты.', 'error');
    setBusy(true);
    try {
      selectedRecipient = await bankLookupRecipient(id);
      const box = q('[data-bank-recipient-result]');
      box.hidden = false;
      box.innerHTML = `<strong>${esc(selectedRecipient?.nickname || 'Игрок')}</strong><small>${esc(selectedRecipient?.publicAccountId || id)}</small>`;
    } catch (error) {
      selectedRecipient = null;
      q('[data-bank-recipient-result]').hidden = true;
      toast(errorText(error), 'error');
    } finally { setBusy(false); }
  };
  q('[data-bank-transfer]').onclick = () => {
    const id = String(q('[data-bank-recipient]').value || '').trim().toUpperCase();
    const amount = Number(q('[data-bank-transfer-amount]').value || 0);
    if (!(amount > 0)) return toast('Укажи сумму перевода.', 'error');
    if (!selectedRecipient || selectedRecipient.publicAccountId !== id) return toast('Сначала проверь получателя.', 'error');
    run(() => bankTransferPlayer(id, amount), `Перевод ${money(amount)} отправлен игроку ${selectedRecipient.nickname || id}.`);
  };
  q('[data-bank-refresh-history]').onclick = () => run(async () => { const st = await bankStatement(50); history = st?.transactions || []; render(); });

  const onBankAction = (event) => {
    const object = event?.detail?.object;
    if (!isBankMapObject(object)) return;
    openBank(object);
  };
  const onGenericSelected = (event) => {
    const object = event?.detail?.object;
    if (!isBankMapObject(object)) return;
    openBank(object);
  };
  const onKey = (event) => { if (event.key === 'Escape' && !modal.hidden) closeBank(); };
  window.addEventListener('mn:bank-object-action', onBankAction);
  window.addEventListener('mn:map-object-selected', onGenericSelected);
  window.addEventListener('keydown', onKey, true);

  render();
  return () => {
    window.removeEventListener('mn:bank-object-action', onBankAction);
    window.removeEventListener('mn:map-object-selected', onGenericSelected);
    window.removeEventListener('keydown', onKey, true);
    document.body.classList.remove('mn-bank-open');
    modal.remove();
  };
}
