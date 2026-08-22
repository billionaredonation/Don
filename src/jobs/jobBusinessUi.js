import { formatJobBusinessMoney } from './jobBusinessConfig.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function jobBusinessPageMarkup({ prefix, config, items = [] }) {
  const p = String(prefix || 'job');
  const rows = items.map((item) => `
    <span>
      <i>${esc(item.icon || '📦')}</i>
      <small>${esc(item.label || item.itemType)}</small>
      <b data-${p}-business-warehouse-item="${esc(item.itemType)}">0</b>
    </span>`).join('');

  return `
    <div class="mn-jobbiz-page" data-${p}-page="business" hidden>
      <div class="mn-jobbiz-intro">
        <span><small data-${p}-business-eyebrow>Рабочее предприятие</small><strong data-${p}-business-heading>${esc(config.shortLabel)}</strong><p data-${p}-business-description>Работа доступна всем игрокам. Владение влияет только на управление, склад и финансы.</p></span>
        <b data-${p}-business-public-state>Государственное</b>
      </div>
      <div class="mn-jobbiz-summary" data-${p}-business-private hidden>
        <article><i>👤</i><span><small>Владелец</small><strong data-${p}-business-owner>Государство</strong><em data-${p}-business-assistant>Помощник: нет</em></span></article>
        <article><i>🏢</i><span><small>Предприятие</small><strong>${esc(config.shortLabel)}</strong><em>Производственный бизнес</em></span></article>
        <article><i>💼</i><span><small>Ваша роль</small><strong data-${p}-business-role>Работник</strong><em data-${p}-business-state>Государственная точка</em></span></article>
        <article><i>📦</i><span><small>Склад</small><strong><em data-${p}-business-warehouse-used>0</em> / ${Number(config.warehouseCapacity).toLocaleString('ru-RU')}</strong><em>${esc(config.unitLabel)} сырья</em></span></article>
      </div>

      <section class="mn-jobbiz-buy" data-${p}-business-buy>
        <span>
          <small>Свободное предприятие</small>
          <strong>${formatJobBusinessMoney(config.purchasePrice)}</strong>
          <p>После покупки выплаты игрокам за принятое сырьё идут с баланса предприятия, а древесина или руда поступают на его склад.</p>
        </span>
        <button type="button" data-${p}-business-purchase>Купить предприятие</button>
      </section>

      <div class="mn-jobbiz-owned" data-${p}-business-owned hidden>
        <div class="mn-jobbiz-kpis">
          <span><small>Баланс предприятия</small><b data-${p}-business-cash>0 ₴</b></span>
          <span><small>Выплачено работникам</small><b data-${p}-business-payout>0 ₴</b></span>
          <span><small>Свободно на складе</small><b data-${p}-business-warehouse-free>${Number(config.warehouseCapacity).toLocaleString('ru-RU')}</b></span>
        </div>

        <div class="mn-jobbiz-management" data-${p}-business-management hidden>
          <section class="mn-jobbiz-card" data-${p}-business-owner-only>
            <header><i>💳</i><span><h4>Пополнить бюджет</h4><small>Средства переходят с личного баланса владельца на баланс предприятия.</small></span></header>
            <div class="mn-jobbiz-inline"><input type="number" min="1" step="1" inputmode="numeric" placeholder="Сумма" data-${p}-business-deposit-amount><button type="button" data-${p}-business-deposit>Пополнить</button></div>
          </section>

          <section class="mn-jobbiz-card" data-${p}-business-owner-only>
            <header><i>💰</i><span><h4>Снять средства</h4><small>Перевод с баланса предприятия доступен только владельцу.</small></span></header>
            <div class="mn-jobbiz-inline"><input type="number" min="1" step="1" inputmode="numeric" placeholder="Сумма" data-${p}-business-withdraw-amount><button type="button" data-${p}-business-withdraw>Снять</button><button type="button" class="is-ghost" data-${p}-business-withdraw-all>Всё</button></div>
          </section>

          <section class="mn-jobbiz-card" data-${p}-business-owner-only>
            <header><i>🧑‍💼</i><span><h4>Помощник</h4><small>Помощник видит бюджет и склад, но не может выводить деньги.</small></span></header>
            <div class="mn-jobbiz-inline"><input type="text" maxlength="64" placeholder="Ник или Telegram ID" data-${p}-business-assistant-target><button type="button" data-${p}-business-assistant-save>Назначить</button><button type="button" class="is-ghost" data-${p}-business-assistant-clear>Снять</button></div>
          </section>

          <section class="mn-jobbiz-card is-wide">
            <header><i>📦</i><span><h4>Склад предприятия</h4><small>Сюда автоматически поступает сырьё, которое предприятие выкупило у игроков.</small></span></header>
            <div class="mn-jobbiz-progress"><i data-${p}-business-warehouse-meter></i></div>
            <div class="mn-jobbiz-warehouse">${rows}</div>
          </section>
        </div>
      </div>
    </div>`;
}
