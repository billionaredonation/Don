function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return 'Цена не указана';
  }

  return `${number.toLocaleString('ru-RU')} ₴`;
}

function getHouseClass(house) {
  const houseClass = house?.class || house?.payload?.houseClass || house?.variant || 'standard';

  const labels = {
    standard: 'Стандарт',
    std: 'Стандарт',
    comfort: 'Комфорт',
    premium: 'Премиум',
    luxe: 'Люкс',
    lux: 'Люкс',
    luxury: 'Люкс',
  };

  return labels[houseClass] || String(houseClass);
}

function getHousePrice(house) {
  return house?.price || house?.payload?.price || 0;
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

function getHouseId(house) {
  return (
    house?.payload?.houseId ||
    house?.payload?.house_id ||
    house?.houseId ||
    house?.house_id ||
    house?.id ||
    null
  );
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

        <footer class="house-details-actions">
          <button type="button" class="house-secondary-button" data-house-details-close>
            Назад
          </button>

          <button type="button" class="house-buy-button" data-house-buy-button>
            Купить дом
          </button>
        </footer>
      </section>
    </div>
  `;
}

export function createHouseDetailsController(root, { onBuy } = {}) {
  let modal = root.querySelector('[data-house-details-modal]');

  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  const closeButtons = modal?.querySelectorAll('[data-house-details-close]') || [];
  const buyButton = modal?.querySelector('[data-house-buy-button]');
  const message = modal?.querySelector('[data-house-details-message]');

  const title = modal?.querySelector('[data-house-details-title]');
  const icon = modal?.querySelector('[data-house-details-icon]');
  const price = modal?.querySelector('[data-house-details-price]');
  const status = modal?.querySelector('[data-house-details-status]');
  const houseClass = modal?.querySelector('[data-house-details-class]');
  const owner = modal?.querySelector('[data-house-details-owner]');

  let activeHouse = null;

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

    title.textContent = activeHouse?.name || `Дом · ${getHouseClass(activeHouse)}`;
    icon.textContent = activeHouse?.icon || '🏠';
    price.textContent = formatMoney(getHousePrice(activeHouse));
    status.textContent = getHouseStatus(activeHouse);
    houseClass.textContent = getHouseClass(activeHouse);
    owner.textContent = owned ? String(ownerName || ownerId || 'Игрок') : 'Государство';

    if (buyButton) {
      buyButton.hidden = owned || locked;
      buyButton.disabled = owned || locked;
    }
  }

  function markAsOwned(result = {}) {
    if (!activeHouse) return;

    const purchaseState = applyPurchasedState(activeHouse, result);

    renderActiveHouse();

    setMessage(
      result?.alreadyOwned
        ? 'Этот дом уже куплен.'
        : 'Дом успешно куплен.',
      result?.alreadyOwned ? 'error' : 'success'
    );

    if (buyButton) {
      buyButton.hidden = true;
      buyButton.disabled = true;
    }

    window.dispatchEvent(new CustomEvent('mn:house-purchased-local', {
      detail: {
        houseId: getHouseId(activeHouse),
        mapObjectId: activeHouse.id,
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

    renderActiveHouse();

    modal.hidden = false;
    document.body.classList.add('mn-house-details-open');
  }

  function close(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (!modal) return;

    modal.hidden = true;
    activeHouse = null;
    setMessage('');
    document.body.classList.remove('mn-house-details-open');
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
        code.includes('already owned') ||
        code.includes('already_owned')
      ) {
        markAsOwned({
          alreadyOwned: true,
        });

        return;
      }

      if (code.includes('HOUSE_NOT_FOUND')) {
        setMessage('Дом не найден в базе данных.', 'error');
        buyButton.disabled = false;
        return;
      }

      if (code.includes('HOUSE_ID_INVALID')) {
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
  window.addEventListener('mn:houses-realtime-changed', handleRealtimeHouseChanged);
  window.addEventListener('mn:map-objects-changed', handleRealtimeHouseChanged);

  closeButtons.forEach((button) => {
    button.addEventListener('click', close);
  });

  return {
    open,
    close,

    cleanup() {
      close();

      buyButton?.removeEventListener('click', handleBuy);
      window.removeEventListener('mn:houses-realtime-changed', handleRealtimeHouseChanged);
      window.removeEventListener('mn:map-objects-changed', handleRealtimeHouseChanged);

      closeButtons.forEach((button) => {
        button.removeEventListener('click', close);
      });

      modal?.remove();
      modal = null;
    },
  };
}
