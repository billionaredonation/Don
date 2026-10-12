import { supabase as __workplaceTheftSupabase } from '../supabaseClient.js';

const __WORKPLACE_THEFT_FUNCTION = 'workplace-theft';

function __workplaceTheftInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function __workplaceTheftInvoke(action, payload = {}) {
  const initData = __workplaceTheftInitData();
  if (!initData) throw new Error('TELEGRAM_SESSION_REQUIRED');

  const { data, error } = await __workplaceTheftSupabase.functions.invoke(__WORKPLACE_THEFT_FUNCTION, {
    body: { initData, action, ...payload },
  });

  if (error) {
    let remote = '';
    const source = error?.context || error;

    if (typeof source?.clone === 'function') {
      try {
        const body = await source.clone().json();
        remote = [body?.error, body?.message, body?.reason].filter(Boolean).join(' ');
      } catch {}
    }

    throw new Error(
      [remote, error?.message, error?.details, source?.message].filter(Boolean).join(' ')
      || 'WORKPLACE_THEFT_FAILED',
    );
  }

  if (!data?.ok) throw new Error(data?.error || data?.reason || 'WORKPLACE_THEFT_FAILED');
  return data.result;
}

function __workplaceTheftError(error) {
  const raw = String(error?.message || error || 'WORKPLACE_THEFT_FAILED');

  const messages = {
    TELEGRAM_SESSION_REQUIRED: 'Откройте игру через Telegram.',
    TELEGRAM_SESSION_INVALID: 'Сессия Telegram устарела. Перезапустите игру.',
    WORKPLACE_THEFT_INVALID_REQUEST: 'Не удалось создать попытку кражи для этой продукции.',
    WORKPLACE_THEFT_ACCESS_DENIED: 'У вас нет доступа к рабочей операции этого предприятия.',
    WORKPLACE_THEFT_PRODUCT_NOT_FOUND: 'Готовая продукция уже не находится на складе предприятия.',
    WORKPLACE_THEFT_OFFER_NOT_FOUND: 'Попытка кражи больше недоступна.',
    WORKPLACE_THEFT_OFFER_ALREADY_RESOLVED: 'Эта попытка уже обработана.',
    WORKPLACE_THEFT_OFFER_EXPIRED: 'Вы слишком долго думали. Продукция уже ушла дальше.',
  };

  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : raw;
}

function __ensureWorkplaceTheftStyles() {
  if (document.getElementById('mn-workplace-theft-dialog-v2-style')) return;

  const style = document.createElement('style');
  style.id = 'mn-workplace-theft-dialog-v2-style';
  style.textContent = `
    .mn-workplace-theft.mn-workplace-theft-v2{position:fixed;inset:0;margin:0;width:100vw;height:100dvh;max-width:none;max-height:none;border:0;box-sizing:border-box;z-index:2147483000;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.76);backdrop-filter:blur(6px)}
    .mn-workplace-theft[hidden]{display:none!important}
    .mn-workplace-theft__panel{width:min(460px,100%);display:grid;gap:12px;padding:18px;border:1px solid rgba(235,87,87,.3);border-radius:16px;background:linear-gradient(180deg,#17100f,#0d0b0b);box-shadow:0 24px 70px rgba(0,0,0,.68)}
    .mn-workplace-theft__panel small{color:#dc8f72;font-size:9px;font-weight:900;letter-spacing:.14em}
    .mn-workplace-theft__panel h2{margin:0;color:#fff;font-size:18px}
    .mn-workplace-theft__item,.mn-workplace-theft__rules p{margin:0;color:rgba(255,255,255,.68);font-size:11px;line-height:1.5}
    .mn-workplace-theft__rules{display:grid;gap:5px;padding:11px;border-radius:12px;background:rgba(255,255,255,.035)}
    .mn-workplace-theft__rules strong{color:#ffd7b2;font-size:11px}
    .mn-workplace-theft__actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .mn-workplace-theft__actions button{min-height:42px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.06);color:#fff;font-weight:800;cursor:pointer}
    .mn-workplace-theft__actions button.is-danger{border-color:rgba(235,87,87,.34);background:rgba(145,28,28,.42);color:#ffd3d3}
    .mn-workplace-theft.is-busy{pointer-events:none;opacity:.78}
    @media(max-width:560px){.mn-workplace-theft__actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

let __workplaceTheftRoot = null;
let __workplaceTheftOffer = null;
let __workplaceTheftResolve = null;
let __workplaceTheftBusy = false;

function __workplaceTheftToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('mn:toast', { detail: { message, type } }));
  window.dispatchEvent(new CustomEvent('mn:game-toast', { detail: { message, type } }));
}

function __ensureWorkplaceTheftDialog() {
  __ensureWorkplaceTheftStyles();

  if (__workplaceTheftRoot?.isConnected) return __workplaceTheftRoot;

  const host = document.createElement('div');
  host.innerHTML = `
    <dialog class="mn-workplace-theft mn-workplace-theft-v2" data-workplace-theft-inline hidden>
      <section class="mn-workplace-theft__panel">
        <small>РИСКОВАННОЕ ДЕЙСТВИЕ</small>
        <h2>Попробовать украсть готовую продукцию?</h2>
        <p class="mn-workplace-theft__item" data-workplace-theft-inline-item>Только что изготовлена продукция.</p>
        <div class="mn-workplace-theft__rules">
          <strong>Что произойдёт:</strong>
          <p>• «Нет» — продукция остаётся предприятию.</p>
          <p>• «Да» — сервер проводит попытку кражи.</p>
          <p>• Шанс успеха: <b>10%</b>.</p>
          <p>• Успех — 1 единица продукции становится вашей; автомобиль появляется в «Мои машины».</p>
          <p>• Провал — запись о попытке кражи; сотрудник также теряет работу. Владелец сохраняет предприятие.</p>
        </div>
        <div class="mn-workplace-theft__actions">
          <button type="button" data-workplace-theft-inline-no>Нет, оставить предприятию</button>
          <button type="button" class="is-danger" data-workplace-theft-inline-yes>Да, попробовать · 10%</button>
        </div>
      </section>
    </dialog>
  `;

  __workplaceTheftRoot = host.firstElementChild;
  __workplaceTheftRoot.style.zIndex = '2147483000';
  document.body.appendChild(__workplaceTheftRoot);
  __workplaceTheftRoot.addEventListener('cancel', event => { event.preventDefault(); void __resolveWorkplaceTheft(false); });

  __workplaceTheftRoot.querySelector('[data-workplace-theft-inline-no]').onclick = () => {
    void __resolveWorkplaceTheft(false);
  };
  __workplaceTheftRoot.querySelector('[data-workplace-theft-inline-yes]').onclick = () => {
    void __resolveWorkplaceTheft(true);
  };

  return __workplaceTheftRoot;
}

function __closeWorkplaceTheft(result = null) {
  const dialog = __ensureWorkplaceTheftDialog();
  dialog.close();
  dialog.hidden = true;
  __workplaceTheftOffer = null;
  __workplaceTheftBusy = false;

  if (__workplaceTheftResolve) {
    __workplaceTheftResolve(result);
    __workplaceTheftResolve = null;
  }
}

async function __resolveWorkplaceTheft(trySteal) {
  if (__workplaceTheftBusy || !__workplaceTheftOffer?.id) return;

  __workplaceTheftBusy = true;
  const dialog = __ensureWorkplaceTheftDialog();
  dialog.classList.add('is-busy');

  try {
    if (!trySteal) {
      const result = await __workplaceTheftInvoke('decline', { offerId: __workplaceTheftOffer.id });
      __workplaceTheftToast('Продукция оставлена предприятию.', 'success');
      __closeWorkplaceTheft({ ...result, declined: true });
      return;
    }

    const result = await __workplaceTheftInvoke('attempt', { offerId: __workplaceTheftOffer.id });

    if (result?.success) {
      __workplaceTheftToast(
        result.vehicleId ? 'Кража удалась. Собранный автомобиль теперь ваш.' : `Кража удалась. ${result.itemLabel || 'Продукция'} ×1 добавлена в ваш инвентарь.`,
        'success',
      );

      window.dispatchEvent(new CustomEvent('mn:business-inventory-changed', {
        detail: {
          itemType: result.itemType,
          quantity: result.inventoryQuantity,
          source: 'workplace_theft',
        },
      }));
      window.dispatchEvent(new CustomEvent('mn:inventory-refresh'));
    } else {
      __workplaceTheftToast(
        result?.dismissed
          ? 'Вас поймали: вы уволены, а в уголовную книжку добавлена попытка кражи.'
          : 'Кража провалилась. В уголовную книжку добавлена попытка кражи.',
        'error',
      );
    }

    __closeWorkplaceTheft(result);
  } catch (error) {
    __workplaceTheftToast(__workplaceTheftError(error), 'error');
    __closeWorkplaceTheft({ error });
  } finally {
    dialog.classList.remove('is-busy');
    __workplaceTheftBusy = false;
  }
}

export async function askWorkplaceTheft({
  offer: suppliedOffer = null,
  enterpriseKind,
  enterpriseId,
  cityId,
  itemType,
  itemLabel,
  producedQuantity = 1,
} = {}) {
  try {
    const offer = suppliedOffer || await __workplaceTheftInvoke('prepare', {
      enterpriseKind,
      enterpriseId,
      cityId,
      itemType,
      itemLabel,
      producedQuantity,
    });

    if (!offer?.id) return null;
    if (__workplaceTheftOffer?.id === offer.id) return null;

    __workplaceTheftOffer = offer;

    const dialog = __ensureWorkplaceTheftDialog();
    const item = dialog.querySelector('[data-workplace-theft-inline-item]');
    item.textContent = `Изготовлено: ${itemLabel || offer.itemLabel || itemType} · произведено ${Number(producedQuantity || 1)} ед. Украсть можно 1 единицу.`;
    dialog.hidden = false;
    if (!dialog.open) dialog.showModal();

    return await new Promise((resolve) => {
      __workplaceTheftResolve = resolve;
    });
  } catch (error) {
    __workplaceTheftToast(__workplaceTheftError(error), 'error');
    return null;
  }
}
