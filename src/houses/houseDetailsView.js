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
    premium: 'Премиум',
    luxe: 'Люкс',
    luxury: 'Люкс',
  };

  return labels[houseClass] || String(houseClass);
}

function getHousePrice(house) {
  return house?.price || house?.payload?.price || 0;
}

function getHouseOwnerId(house) {
  return house?.owner_id || house?.payload?.ownerId || null;
}

function getHouseStatus(house) {
  if (getHouseOwnerId(house)) return 'Куплен';
  if (house?.payload?.locked) return 'Закрыт';
  return 'Свободен';
}

function applyPurchasedState(house, result = {}) {
  const ownerId = result?.ownerId || result?.playerId || house?.owner_id || house?.payload?.ownerId || 'player';
  const ownerName = result?.ownerName || 'Игрок';

  house.owner_id = ownerId;
  house.ownerName = ownerName;

  house.payload = {
    ...(house.payload || {}),
    ownerId,
    ownerName,
    owned: true,
  };

  return ownerName;
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

  function open(house) {
    if (!modal || !house) return;

    activeHouse = house;
    setMessage('');

    const ownerId = getHouseOwnerId(house);
    const isOwned = Boolean(ownerId);
    const isLocked = Boolean(house?.payload?.locked);

    title.textContent = house?.name || `Дом · ${getHouseClass(house)}`;
    icon.textContent = house?.icon || '🏠';
    price.textContent = formatMoney(getHousePrice(house));
    status.textContent = getHouseStatus(house);
    houseClass.textContent = getHouseClass(house);
    owner.textContent = isOwned ? String(ownerId) : 'Государство';

    if (buyButton) {
      buyButton.hidden = isOwned || isLocked;
      buyButton.disabled = isOwned || isLocked;
    }

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
      const ownerId = applyPurchasedState(activeHouse, result);

      status.textContent = 'Куплен';
      owner.textContent = String(ownerId);

      setMessage('Дом успешно куплен.', 'success');

      buyButton.hidden = true;
      buyButton.disabled = true;

      window.dispatchEvent(new CustomEvent('mn:house-purchased-local', {
        detail: {
          houseId: activeHouse.id,
          house: activeHouse,
          ownerId,
          result,
        },
    }));
    } catch (error) {
      console.error('[houses] buy failed:', error);

      const code = error?.message || error?.details || error?.hint || '';

      if (code.includes('NOT_ENOUGH_MONEY')) {
        setMessage('Недостаточно денег для покупки дома.', 'error');
      } else if (code.includes('HOUSE_ALREADY_OWNED')) {
        setMessage('Этот дом уже куплен.', 'error');
      } else if (code.includes('HOUSE_NOT_FOUND')) {
        setMessage('Дом не найден в базе данных.', 'error');
      } else if (code.includes('PLAYER_NOT_FOUND')) {
        setMessage('Игрок не найден в базе данных.', 'error');
      } else {
        setMessage(`Не удалось купить дом: ${code || 'неизвестная ошибка'}`, 'error');
      }

      buyButton.disabled = false;
    }
  }

  buyButton?.addEventListener('click', handleBuy);

  closeButtons.forEach((button) => {
    button.addEventListener('click', close);
  });

  return {
    open,
    close,

    cleanup() {
      close();

      buyButton?.removeEventListener('click', handleBuy);

      closeButtons.forEach((button) => {
        button.removeEventListener('click', close);
      });

      modal?.remove();
      modal = null;
    },
  };
}
