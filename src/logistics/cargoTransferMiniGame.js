import './cargoTransferMiniGame.css';

const labels = {
  apple_juice: ['🧃', 'Яблочный сок'],
  orange_juice: ['🥤', 'Апельсиновый сок'],
  fruit_salad: ['🥗', 'Фруктовый салат'],
  bread: ['🍞', 'Хлеб'],
  corn_snack: ['🍿', 'Кукурузные снеки'],
};

let activeCargoGame = null;

export function playCargoTransferMiniGame({ direction = 'factory_to_vehicle', productType, quantity }) {
  if (activeCargoGame) return activeCargoGame;
  const amount = Math.max(1, Math.floor(Number(quantity) || 1));
  const boxCount = Math.min(8, Math.max(3, Math.ceil(amount / 5)));
  const [icon, label] = labels[productType] || ['📦', 'Готовая продукция'];
  const loading = direction === 'factory_to_vehicle';

  activeCargoGame = new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'mn-cargo-game';
    root.innerHTML = `<section><header><span><small>ПОГРУЗКА · ${amount} ЕД.</small><strong>${loading ? 'Завод → машина' : 'Машина → магазин'}</strong><em>Перетащите все коробки в ${loading ? 'грузовой отсек' : 'зону приёмки'}</em></span><button data-cargo-cancel>×</button></header><div class="mn-cargo-yard"><div class="mn-cargo-zone is-source"><b>${loading ? '🏭' : '🚚'}</b><span>${loading ? 'Склад завода' : 'Грузовой отсек'}</span><div data-cargo-boxes>${Array.from({ length: boxCount }, (_, i) => `<button class="mn-cargo-box" data-box="${i}" aria-label="Коробка ${i + 1}"><i>📦</i><small>${icon}</small></button>`).join('')}</div></div><div class="mn-cargo-road"><i>➜</i><span><b data-cargo-done>0</b> / ${boxCount}</span></div><div class="mn-cargo-zone is-target" data-cargo-target><b>${loading ? '🚚' : '🏪'}</b><span>${loading ? 'Грузовой отсек' : 'Приёмка магазина'}</span><em>${label}</em></div></div><footer>Зажмите коробку и перенесите её в подсвеченную область.</footer></section>`;
    document.body.append(root);
    document.body.classList.add('mn-cargo-game-open');
    let done = 0;
    let finished = false;
    const finish = (success) => {
      if (finished) return;
      finished = true;
      document.body.classList.remove('mn-cargo-game-open');
      root.remove();
      activeCargoGame = null;
      resolve({ success, quantity: success ? amount : 0 });
    };
    root.querySelector('[data-cargo-cancel]').onclick = () => finish(false);
    root.querySelectorAll('.mn-cargo-box').forEach((box) => {
      box.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        const rect = box.getBoundingClientRect();
        const ghost = box.cloneNode(true);
        ghost.classList.add('is-dragging');
        ghost.style.width = `${rect.width}px`; ghost.style.height = `${rect.height}px`;
        root.append(ghost); box.classList.add('is-picked');
        const move = (e) => { ghost.style.left = `${e.clientX - rect.width / 2}px`; ghost.style.top = `${e.clientY - rect.height / 2}px`; };
        move(event);
        const up = (e) => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
          ghost.remove();
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-cargo-target]');
          if (finished) return;
          if (!target) { box.classList.remove('is-picked'); return; }
          box.remove(); done += 1;
          root.querySelector('[data-cargo-done]').textContent = String(done);
          target.classList.add('is-hit'); setTimeout(() => target.classList.remove('is-hit'), 180);
          if (done >= boxCount) setTimeout(() => finish(true), 250);
        };
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up, { once: true });
      });
    });
  });
  return activeCargoGame;
}
