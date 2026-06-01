function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return 'Цена не указана';
  }

  return `${number.toLocaleString('ru-RU')} ₴`;
}

function getHouseClass(house) {
  return (
    house?.payload?.houseClassLabel ||
    house?.payload?.houseClass ||
    house?.variant ||
    'Стандарт'
  );
}

function getHousePrice(house) {
  return house?.payload?.price || house?.price || 0;
}

function getHouseStatus(house) {
  if (house?.payload?.ownerId) return 'Куплен';
  if (house?.payload?.locked) return 'Закрыт';
  return 'Свободен';
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
  const modal = root.querySelector('[data-house-details-modal]');
  const closeButtons = root.querySelectorAll('[data-house-details-close]');
  const buyButton = root.querySelector('[data-house-buy-button]');
  const message = root.querySelector('[data-house-details-message]');

  const title = root.querySelector('[data-house-details-title]');
  const icon = root.querySelector('[data-house-details-icon]');
  const price = root.querySelector('[data-house-details-price]');
  const status = root.querySelector('[data-house-details-status]');
  const houseClass = root.querySelector('[data-house-details-class]');
  const owner = root.querySelector('[data-house-details-owner]');

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

    const isOwned = Boolean(house?.payload?.ownerId);
    const isLocked = Boolean(house?.payload?.locked);

    title.textContent = house?.name || `Дом · ${getHouseClass(house)}`;
    icon.textContent = house?.icon || '🏠';
    price.textContent = formatMoney(getHousePrice(house));
    status.textContent = getHouseStatus(house);
    houseClass.textContent = getHouseClass(house);
    owner.textContent = isOwned ? String(house.payload.ownerId) : 'Государство';

    buyButton.hidden = isOwned || isLocked;
    buyButton.disabled = isOwned || isLocked;

    modal.hidden = false;
    document.body.classList.add('mn-house-details-open');
  }

  function close() {
    if (!modal) return;

    modal.hidden = true;
    activeHouse = null;
    setMessage('');
    document.body.classList.remove('mn-house-details-open');
  }

  async function handleBuy(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!activeHouse || !onBuy) return;

    try {
      buyButton.disabled = true;
      setMessage('Покупка выполняется...', 'info');

      await onBuy(activeHouse);

      setMessage('Дом успешно куплен.', 'success');
      buyButton.hidden = true;
    } catch (error) {
      console.warn('[houses] buy failed:', error);

      const code = error?.message || error?.details || '';

      if (code.includes('NOT_ENOUGH_MONEY')) {
        setMessage('Недостаточно денег для покупки дома.', 'error');
      } else if (code.includes('HOUSE_ALREADY_OWNED')) {
        setMessage('Этот дом уже куплен.', 'error');
      } else if (code.includes('HOUSE_LOCKED')) {
        setMessage('Дом закрыт для покупки.', 'error');
      } else {
        setMessage('Не удалось купить дом.', 'error');
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
    },
  };
}
