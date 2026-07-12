import { state } from '../state.js';

function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return 'Цена не указана';
  }

  return `${number.toLocaleString('ru-RU')} ₴`;
}

function getHouseClass(house) {
  const rawClass = house?.class || house?.payload?.houseClass || house?.variant || 'standard';
  const houseClass = String(rawClass || 'standard').trim().toLowerCase();

  const labels = {
    standard: 'Стандарт',
    std: 'Стандарт',
    comfort: 'Стандарт',
    premium: 'Премиум',
    prem: 'Премиум',
    ultra_lux: 'Ультра люкс',
    ultra: 'Ультра люкс',
    'ultra-lux': 'Ультра люкс',
    lux: 'Ультра люкс',
    luxe: 'Ультра люкс',
    luxury: 'Ультра люкс',
    elite: 'Ультра люкс',
    vip: 'Ультра люкс',
  };

  return labels[houseClass] || String(rawClass || 'Стандарт');
}

function getHousePrice(house) {
  return house?.price || house?.payload?.price || 0;
}

function formatPurchaseSplit(price, result = {}) {
  const rawPrice = Number(price || result?.price || result?.housePrice || 0);

  if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
    return '';
  }

  const cityIncome = Number.isFinite(Number(result?.cityIncome))
    ? Number(result.cityIncome)
    : Math.round(rawPrice * 0.8);

  const taxBurned = Number.isFinite(Number(result?.taxBurned ?? result?.tax_burned))
    ? Number(result.taxBurned ?? result.tax_burned)
    : Math.max(0, rawPrice - cityIncome);

  return ` В бюджет города: ${formatMoney(cityIncome)}. Налог 20% сожжён: ${formatMoney(taxBurned)}.`;
}

function getStateSaleTerms(house, result = {}) {
  const grossPrice = Math.max(0, Math.round(Number(
    result.salePrice ?? result.price ?? getHousePrice(house) ?? 0
  )));
  const tax = Math.max(0, Math.round(Number(
    result.tax ?? result.cityTax ?? grossPrice * 0.2
  )));
  const payout = Math.max(0, Math.round(Number(
    result.payout ?? result.playerPayout ?? grossPrice - tax
  )));

  return { grossPrice, tax, payout };
}

function getHouseOwnerId(house) {
  return (
    house?.owner_id ||
    house?.ownerId ||
    house?.payload?.ownerId ||
    house?.payload?.owner_id ||
    null
  );
}

function getHouseOwnerName(house) {
  return (
    house?.ownerName ||
    house?.owner_name ||
    house?.payload?.ownerName ||
    house?.payload?.owner_name ||
    null
  );
}

function getCurrentPlayerId() {
  return (
    state.telegramId ||
    state.player?.tg_id ||
    state.player?.telegramId ||
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
    null
  );
}

function isCurrentPlayerHouseOwner(house) {
  const ownerId = getHouseOwnerId(house);
  const playerId = getCurrentPlayerId();

  return Boolean(ownerId && playerId && String(ownerId) === String(playerId));
}

function looksLikeLocalHouseId(value) {
  return /^house[_-]/i.test(String(value || '').trim());
}

function getHouseId(house) {
  const stableId =
    house?.mapObjectId ||
    house?.objectId ||
    house?.dbId ||
    house?.id ||
    null;

  // Для новых домов из map_objects покупать нужно по реальному id строки БД.
  // payload.houseId вида house_1783... оставляем только как запасной legacy-id.
  if (stableId && !looksLikeLocalHouseId(stableId)) {
    return stableId;
  }

  return (
    stableId ||
    house?.payload?.mapObjectId ||
    house?.payload?.objectId ||
    house?.payload?.houseId ||
    house?.payload?.house_id ||
    house?.houseId ||
    house?.house_id ||
    null
  );
}

function getRealMapObjectId(house) {
  return (
    house?.mapObjectId ||
    house?.objectId ||
    house?.dbId ||
    house?.payload?.mapObjectId ||
    house?.payload?.objectId ||
    house?.payload?.id ||
    house?.id ||
    null
  );
}

function getHouseNumber(house) {
  const explicitNumber = (
    house?.payload?.houseNumber ||
    house?.payload?.house_number ||
    house?.payload?.number ||
    house?.number ||
    null
  );

  if (explicitNumber !== null && explicitNumber !== undefined && explicitNumber !== '') {
    return `№ ${String(explicitNumber).slice(0, 12)}`;
  }

  const realId = String(getRealMapObjectId(house) || '').trim();

  if (!realId) {
    return '—';
  }

  // Это только отображаемый короткий номер, не id для покупки.
  return `№ ${realId.replace(/-/g, '').slice(-6).toUpperCase()}`;
}


function getHouseStatus(house) {
  if (getHouseOwnerId(house) || house?.payload?.owned) return 'Куплен';
  if (house?.payload?.locked) return 'Закрыт';

  return 'Свободен';
}

function isHouseOwned(house) {
  return getHouseStatus(house) === 'Куплен';
}

function isHouseLocked(house) {
  return Boolean(house?.payload?.locked);
}

function applyPurchasedState(house, result = {}) {
  const ownerId =
    result?.ownerId ||
    result?.playerId ||
    house?.owner_id ||
    house?.ownerId ||
    house?.payload?.ownerId ||
    'player';

  const ownerName =
    result?.ownerName ||
    house?.ownerName ||
    house?.owner_name ||
    house?.payload?.ownerName ||
    'Игрок';

  house.owner_id = ownerId;
  house.ownerId = ownerId;
  house.ownerName = ownerName;

  house.payload = {
    ...(house.payload || {}),
    ownerId,
    ownerName,
    owned: true,
  };

  return {
    ownerId,
    ownerName,
  };
}

function applyStateSale(house) {
  if (!house) return;

  house.owner_id = null;
  house.ownerId = null;
  house.ownerName = null;
  house.owner_name = null;
  house.payload = {
    ...(house.payload || {}),
    ownerId: null,
    owner_id: null,
    ownerName: null,
    owner_name: null,
    owned: false,
    locked: false,
    buyable: true,
  };
}

function mergeRealtimeRowIntoHouse(house, row = {}) {
  if (!house || !row) return house;

  const payload = row.payload && typeof row.payload === 'object'
    ? row.payload
    : {};

  house.id = row.id || house.id;
  house.name = row.name || house.name;
  house.icon = row.icon || house.icon;
  house.price = row.price || payload.price || house.price;
  house.class = row.class || payload.houseClass || house.class;
  house.variant = row.variant || house.variant;

  const ownerId =
    row.owner_id ||
    row.ownerId ||
    payload.ownerId ||
    payload.owner_id ||
    null;

  const ownerName =
    row.ownerName ||
    row.owner_name ||
    payload.ownerName ||
    payload.owner_name ||
    null;

  house.owner_id = ownerId;
  house.ownerId = ownerId;
  house.ownerName = ownerName;

  house.payload = {
    ...(house.payload || {}),
    ...payload,
    ownerId,
    ownerName,
    owned: Boolean(ownerId || payload.owned),
  };

  return house;
}

function isSameHouse(activeHouse, row = {}) {
  if (!activeHouse || !row) return false;

  const activeObjectId = String(activeHouse.id || '');
  const rowObjectId = String(row.id || '');

  const activeHouseId = String(getHouseId(activeHouse) || '');
  const rowPayload = row.payload && typeof row.payload === 'object'
    ? row.payload
    : {};

  const rowHouseId = String(
    rowPayload.houseId ||
    rowPayload.house_id ||
    row.houseId ||
    row.house_id ||
    ''
  );

  return Boolean(
    (activeObjectId && rowObjectId && activeObjectId === rowObjectId) ||
    (activeHouseId && rowHouseId && activeHouseId === rowHouseId)
  );
}

export function renderHouseDetailsModal() {
  return `
    <div class="house-details-modal" hidden data-house-details-modal>
      <div class="house-details-backdrop" data-house-details-close></div>

      <section class="house-details-panel">
        <header class="house-details-header">
          <div>
            <span class="house-details-kicker">Недвижимость</span>
            <h3 data-house-details-title>Дом</h3>
          </div>

          <button type="button" data-house-details-close>×</button>
        </header>

        <div class="house-details-hero">
          <span class="house-details-icon" data-house-details-icon>🏠</span>

          <div>
            <strong data-house-details-price>0 ₴</strong>
            <small data-house-details-status>Свободен</small>
          </div>
        </div>

        <div class="house-details-grid">
          <article>
            <span>Номер дома</span>
            <strong data-house-details-number>№ —</strong>
          </article>

          <article>
            <span>Класс</span>
            <strong data-house-details-class>Стандарт</strong>
          </article>

          <article>
            <span>Владелец</span>
            <strong data-house-details-owner>Государство</strong>
          </article>
        </div>

        <p class="house-details-text">
          Этот дом можно купить у государства. После покупки недвижимость будет закреплена за твоим игровым аккаунтом.
        </p>

        <div class="house-details-message" hidden data-house-details-message></div>

        <section class="house-state-sale-confirm" hidden data-house-state-sale-confirm>
          <span>Продажа государству</span>
          <strong>Ты уверен, что хочешь продать этот дом?</strong>

          <div class="house-state-sale-breakdown">
            <p><span>Стоимость дома</span><b data-house-sale-gross>0 ₴</b></p>
            <p><span>Налог в бюджет города (20%)</span><b data-house-sale-tax>0 ₴</b></p>
            <p class="is-payout"><span>Ты получишь</span><b data-house-sale-payout>0 ₴</b></p>
          </div>

          <div class="house-state-sale-actions">
            <button type="button" class="house-secondary-button" data-house-sale-cancel>Отмена</button>
            <button type="button" class="house-sale-confirm-button" data-house-sale-confirm>Подтвердить продажу</button>
          </div>
        </section>

        <footer class="house-details-actions" data-house-details-actions>
          <button type="button" class="house-secondary-button" data-house-details-close>
            Назад
          </button>

          <button type="button" class="house-buy-button" data-house-buy-button>
            Купить дом
          </button>

          <button type="button" class="house-enter-button" data-house-enter-button hidden>
            Войти в дом
          </button>

          <button type="button" class="house-locked-button" data-house-sell-player-button hidden disabled>
            Продать игроку
          </button>

          <button type="button" class="house-sell-state-button" data-house-sell-state-button hidden>
            Продать в госс
          </button>
        </footer>
      </section>
    </div>
  `;
}

export function createHouseDetailsController(root, { onBuy, onSellToState } = {}) {
  let modal = root.querySelector('[data-house-details-modal]');

  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  const closeButtons = modal?.querySelectorAll('[data-house-details-close]') || [];
  const buyButton = modal?.querySelector('[data-house-buy-button]');
  const enterButton = modal?.querySelector('[data-house-enter-button]');
  const sellPlayerButton = modal?.querySelector('[data-house-sell-player-button]');
  const sellStateButton = modal?.querySelector('[data-house-sell-state-button]');
  const actions = modal?.querySelector('[data-house-details-actions]');
  const saleConfirm = modal?.querySelector('[data-house-state-sale-confirm]');
  const saleCancelButton = modal?.querySelector('[data-house-sale-cancel]');
  const saleConfirmButton = modal?.querySelector('[data-house-sale-confirm]');
  const saleGross = modal?.querySelector('[data-house-sale-gross]');
  const saleTax = modal?.querySelector('[data-house-sale-tax]');
  const salePayout = modal?.querySelector('[data-house-sale-payout]');
  const message = modal?.querySelector('[data-house-details-message]');

  const title = modal?.querySelector('[data-house-details-title]');
  const icon = modal?.querySelector('[data-house-details-icon]');
  const price = modal?.querySelector('[data-house-details-price]');
  const status = modal?.querySelector('[data-house-details-status]');
  const houseNumber = modal?.querySelector('[data-house-details-number]');
  const houseClass = modal?.querySelector('[data-house-details-class]');
  const owner = modal?.querySelector('[data-house-details-owner]');

  let activeHouse = null;

  function hideSaleConfirmation() {
    if (saleConfirm) saleConfirm.hidden = true;
    if (actions) actions.hidden = false;
  }

  function setMessage(text, type = 'info') {
    if (!message) return;

    message.hidden = !text;
    message.textContent = text || '';
    message.dataset.type = type;
  }

  function renderActiveHouse() {
    if (!modal || !activeHouse) return;

    const ownerId = getHouseOwnerId(activeHouse);
    const ownerName = getHouseOwnerName(activeHouse);
    const owned = isHouseOwned(activeHouse);
    const locked = isHouseLocked(activeHouse);
    const ownerIsCurrentPlayer = isCurrentPlayerHouseOwner(activeHouse);
    const houseNumberText = getHouseNumber(activeHouse);
    const classText = getHouseClass(activeHouse);
    const priceText = formatMoney(getHousePrice(activeHouse));

    modal.dataset.mode = owned ? 'cef' : 'purchase';

    title.textContent = owned
      ? `${houseNumberText} · ${classText}`
      : `Дом · ${classText}`;

    const kicker = modal.querySelector('.house-details-kicker');
    if (kicker) {
      kicker.textContent = owned ? 'CEF · Недвижимость' : 'Недвижимость';
    }

    icon.textContent = activeHouse?.icon || '🏠';
    price.textContent = owned ? 'Дом куплен' : priceText;
    status.textContent = owned
      ? `Владелец: ${String(ownerName || ownerId || 'Игрок')}`
      : getHouseStatus(activeHouse);

    houseNumber.textContent = houseNumberText;
    houseClass.textContent = classText;
    owner.textContent = owned ? String(ownerName || ownerId || 'Игрок') : 'Государство';

    const textEl = modal.querySelector('.house-details-text');
    if (textEl) {
      if (owned) {
        textEl.textContent = ownerIsCurrentPlayer
          ? 'Кратко: это твой дом. Его можно продать государству по указанной стоимости. При продаже 20% уйдёт в бюджет города, а 80% поступит на твой баланс.'
          : 'Кратко: дом уже куплен другим игроком. Войти в дом пока недоступно — функционал интерьера будет добавлен позже.';
      } else if (locked) {
        textEl.textContent = 'Этот дом сейчас закрыт. Покупка недоступна.';
      } else {
        textEl.textContent = 'Этот дом можно купить у государства. После покупки недвижимость будет закреплена за твоим игровым аккаунтом.';
      }
    }

    if (buyButton) {
      buyButton.hidden = owned || locked;
      buyButton.disabled = owned || locked;
    }

    if (enterButton) {
      enterButton.hidden = !owned;
      enterButton.disabled = false;
      enterButton.title = 'Вход в дом пока недоступен';
    }

    if (sellPlayerButton) {
      sellPlayerButton.hidden = !owned || !ownerIsCurrentPlayer;
      sellPlayerButton.disabled = true;
      sellPlayerButton.title = 'Продажа игроку пока заблокирована';
    }

    if (sellStateButton) {
      sellStateButton.hidden = !owned || !ownerIsCurrentPlayer;
      sellStateButton.disabled = !owned || !ownerIsCurrentPlayer;
      sellStateButton.title = ownerIsCurrentPlayer ? 'Продать дом государству' : '';
    }
  }

  function markAsOwned(result = {}) {
    if (!activeHouse) return;

    const purchaseState = applyPurchasedState(activeHouse, result);

    renderActiveHouse();

    setMessage(
      result?.alreadyOwned
        ? 'Этот дом уже куплен.'
        : `Дом успешно куплен.${formatPurchaseSplit(getHousePrice(activeHouse), result)}`,
      result?.alreadyOwned ? 'error' : 'success'
    );

    if (buyButton) {
      buyButton.hidden = true;
      buyButton.disabled = true;
    }

    window.dispatchEvent(new CustomEvent('mn:house-purchased-local', {
      detail: {
        houseId: getHouseId(activeHouse),
        mapObjectId: getRealMapObjectId(activeHouse),
        house: activeHouse,
        ownerId: purchaseState.ownerId,
        ownerName: purchaseState.ownerName,
        result,
      },
    }));
  }

  function open(house) {
    if (!modal || !house) return;

    activeHouse = house;
    setMessage('');
    hideSaleConfirmation();

    renderActiveHouse();

    modal.hidden = false;
    modal.removeAttribute('aria-hidden');

    document.body.classList.add('mn-houses-modal-open');
    document.body.classList.add('mn-house-details-open');

    window.dispatchEvent(new CustomEvent('mn:house-details-opened', {
      detail: {
        house: activeHouse,
      },
    }));
  }

  function close(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (!modal) return;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');

    activeHouse = null;
    setMessage('');
    hideSaleConfirmation();

    document.body.classList.remove('mn-house-details-open');
    document.body.classList.remove('mn-houses-modal-open');

    window.dispatchEvent(new CustomEvent('mn:house-details-closed'));
  }

  function handleEnter(event) {
    event.preventDefault();
    event.stopPropagation();

    setMessage('Войти в дом пока недоступно. Интерьер и вход будем доделывать отдельно.', 'info');
  }

  async function handleBuy(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!activeHouse || !onBuy || !buyButton) return;

    try {
      buyButton.disabled = true;
      setMessage('Покупка выполняется...', 'info');

      const result = await onBuy(activeHouse);

      markAsOwned(result);
    } catch (error) {
      console.error('[houses] buy failed:', error);

      const code = error?.message || error?.details || error?.hint || '';

      if (code.includes('NOT_ENOUGH_MONEY')) {
        setMessage('Недостаточно денег для покупки дома.', 'error');
        buyButton.disabled = false;
        return;
      }

      if (
        code.includes('HOUSE_ALREADY_OWNED') ||
        code.includes('ASSET_ALREADY_OWNED') ||
        code.includes('already owned') ||
        code.includes('already_owned')
      ) {
        markAsOwned({
          alreadyOwned: true,
        });

        return;
      }

      if (code.includes('HOUSE_NOT_FOUND') || code.includes('ASSET_NOT_FOUND')) {
        setMessage('Дом не найден в базе данных.', 'error');
        buyButton.disabled = false;
        return;
      }

      if (code.includes('HOUSE_ID_INVALID') || code.includes('ASSET_ID_INVALID')) {
        setMessage('Ошибка дома: некорректный houseId.', 'error');
        buyButton.disabled = false;
        return;
      }

      if (code.includes('PLAYER_NOT_FOUND')) {
        setMessage('Игрок не найден в базе данных.', 'error');
        buyButton.disabled = false;
        return;
      }

      setMessage(`Не удалось купить дом: ${code || 'неизвестная ошибка'}`, 'error');
      buyButton.disabled = false;
    }
  }

  function handleSellStateRequest(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!activeHouse || !isCurrentPlayerHouseOwner(activeHouse) || !onSellToState) return;

    const terms = getStateSaleTerms(activeHouse);
    if (!terms.grossPrice) {
      setMessage('Для этого дома не указана цена продажи.', 'error');
      return;
    }

    saleGross.textContent = formatMoney(terms.grossPrice);
    saleTax.textContent = `− ${formatMoney(terms.tax)}`;
    salePayout.textContent = formatMoney(terms.payout);
    setMessage('');

    if (actions) actions.hidden = true;
    if (saleConfirm) saleConfirm.hidden = false;
  }

  function handleSellStateCancel(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    hideSaleConfirmation();
  }

  async function handleSellStateConfirm(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!activeHouse || !onSellToState || !saleConfirmButton) return;

    try {
      saleConfirmButton.disabled = true;
      if (saleCancelButton) saleCancelButton.disabled = true;
      setMessage('Продажа выполняется...', 'info');

      const soldHouse = activeHouse;
      const result = await onSellToState(soldHouse);
      const terms = getStateSaleTerms(soldHouse, result);

      applyStateSale(soldHouse);
      hideSaleConfirmation();
      renderActiveHouse();
      setMessage(
        `Дом продан государству. На баланс зачислено ${formatMoney(terms.payout)}. Налог ${formatMoney(terms.tax)} перечислен в бюджет города.`,
        'success'
      );

      window.dispatchEvent(new CustomEvent('mn:house-sold-to-state-local', {
        detail: {
          houseId: result?.houseId || getHouseId(soldHouse),
          mapObjectId: result?.mapObjectId || getRealMapObjectId(soldHouse),
          house: soldHouse,
          result,
        },
      }));
    } catch (error) {
      console.error('[houses] state sale failed:', error);
      const code = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');

      if (code.includes('HOUSE_NOT_OWNED_BY_PLAYER')) {
        setMessage('Продажа отменена: этот дом уже не принадлежит тебе.', 'error');
      } else if (code.includes('HOUSE_NOT_FOUND') || code.includes('ASSET_NOT_FOUND')) {
        setMessage('Дом не найден в базе данных.', 'error');
      } else if (code.includes('PLAYER_NOT_FOUND')) {
        setMessage('Игрок не найден в базе данных.', 'error');
      } else if (code.includes('HOUSE_PRICE_INVALID')) {
        setMessage('У дома не указана корректная цена.', 'error');
      } else {
        setMessage(`Не удалось продать дом: ${code || 'неизвестная ошибка'}`, 'error');
      }
    } finally {
      if (saleConfirmButton) saleConfirmButton.disabled = false;
      if (saleCancelButton) saleCancelButton.disabled = false;
    }
  }

  function handleRealtimeHouseChanged(event) {
    if (!activeHouse || !event?.detail?.payload) return;

    const payload = event.detail.payload;
    const row = payload.new || payload.old || null;

    if (!row || !isSameHouse(activeHouse, row)) return;

    if (payload.eventType === 'DELETE') {
      close();
      return;
    }

    mergeRealtimeRowIntoHouse(activeHouse, row);
    renderActiveHouse();
  }

  buyButton?.addEventListener('click', handleBuy);
  enterButton?.addEventListener('click', handleEnter);
  enterButton?.addEventListener('pointerup', handleEnter);
  sellStateButton?.addEventListener('click', handleSellStateRequest);
  saleCancelButton?.addEventListener('click', handleSellStateCancel);
  saleConfirmButton?.addEventListener('click', handleSellStateConfirm);

  window.addEventListener('mn:houses-realtime-changed', handleRealtimeHouseChanged);
  window.addEventListener('mn:map-objects-changed', handleRealtimeHouseChanged);

  closeButtons.forEach((button) => {
    button.addEventListener('click', close);
    button.addEventListener('pointerup', close);
    button.addEventListener('touchend', close, { passive: false });
  });

  return {
    open,
    close,

    cleanup() {
      close();

      buyButton?.removeEventListener('click', handleBuy);
      enterButton?.removeEventListener('click', handleEnter);
      enterButton?.removeEventListener('pointerup', handleEnter);
      sellStateButton?.removeEventListener('click', handleSellStateRequest);
      saleCancelButton?.removeEventListener('click', handleSellStateCancel);
      saleConfirmButton?.removeEventListener('click', handleSellStateConfirm);

      window.removeEventListener('mn:houses-realtime-changed', handleRealtimeHouseChanged);
      window.removeEventListener('mn:map-objects-changed', handleRealtimeHouseChanged);

      closeButtons.forEach((button) => {
        button.removeEventListener('click', close);
        button.removeEventListener('pointerup', close);
        button.removeEventListener('touchend', close);
      });

      modal?.remove();
      modal = null;
    },
  };
}
