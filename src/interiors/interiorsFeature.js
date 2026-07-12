import { supabase } from '../supabaseClient.js';
import { state } from '../state.js';
import './interiors.css';

const TEMPLATES = {
  standard: { id: 'standard', file: 'standart_interior.png', rooms: 1, kitchen: 1, bathroom: 1, spawn: { x: 50, y: 82 } },
  premium: { id: 'premium', file: 'premium_interior.png', rooms: 2, kitchen: 2, bathroom: 2, spawn: { x: 50, y: 86 } },
  ultra_lux: { id: 'ultra_lux', file: 'luxe_interior.png', rooms: 4, kitchen: 3, bathroom: 3, spawn: { x: 50, y: 90 } },
};

function playerTgId() {
  return String(state.telegramId || state.player?.tg_id || state.player?.telegramId || '').trim();
}

function normalizeClass(value) {
  const key = String(value || 'standard').trim().toLowerCase();
  if (['premium', 'prem', 'премиум'].includes(key)) return 'premium';
  if (['ultra_lux', 'ultra-lux', 'ultra', 'lux', 'luxe', 'luxury', 'vip'].includes(key)) return 'ultra_lux';
  return 'standard';
}

function houseId(house) {
  const p = house?.payload || {};
  return String(house?.mapObjectId || house?.objectId || house?.dbId || house?.id || p.mapObjectId || p.objectId || p.houseId || '').trim();
}

function templateAsset(file) {
  return new URL(file, document.baseURI).href;
}

function markup() {
  return `
    <div class="mn-interior" hidden data-mn-interior>
      <div class="mn-interior-loading" data-interior-loading>
        <span class="mn-interior-spinner"></span>
        <strong>Загрузка интерьера…</strong>
        <small data-interior-loading-text>Подготавливаем помещение</small>
      </div>
      <main class="mn-interior-scene" hidden data-interior-scene>
        <div class="mn-interior-map" data-interior-map></div>
        <div class="mn-interior-shade"></div>
        <div class="mn-interior-player" data-interior-player><i></i><span>${String(state.nickname || 'Игрок')}</span></div>
        <button type="button" class="mn-interior-exit" data-interior-exit>🚪 Выйти из дома</button>
        <div class="mn-interior-info">
          <b data-interior-title>Интерьер</b>
          <span data-interior-meta></span>
        </div>
        <div class="mn-interior-joystick" data-interior-joystick>
          <div class="mn-interior-joystick-stick" data-interior-stick></div>
        </div>
      </main>
      <div class="mn-interior-error" hidden data-interior-error>
        <strong>Интерьер пока не загружен</strong>
        <p data-interior-error-text></p>
        <button type="button" data-interior-error-close>Вернуться в город</button>
      </div>
    </div>`;
}

export function enableInteriorsFeature() {
  document.querySelectorAll('[data-mn-interior]').forEach((el) => el.remove());
  document.body.insertAdjacentHTML('beforeend', markup());

  const overlay = document.querySelector('[data-mn-interior]');
  const loading = overlay.querySelector('[data-interior-loading]');
  const loadingText = overlay.querySelector('[data-interior-loading-text]');
  const scene = overlay.querySelector('[data-interior-scene]');
  const map = overlay.querySelector('[data-interior-map]');
  const marker = overlay.querySelector('[data-interior-player]');
  const title = overlay.querySelector('[data-interior-title]');
  const meta = overlay.querySelector('[data-interior-meta]');
  const exitButton = overlay.querySelector('[data-interior-exit]');
  const errorBox = overlay.querySelector('[data-interior-error]');
  const errorText = overlay.querySelector('[data-interior-error-text]');
  const errorClose = overlay.querySelector('[data-interior-error-close]');
  const joystick = overlay.querySelector('[data-interior-joystick]');
  const stick = overlay.querySelector('[data-interior-stick]');

  let active = false;
  let destroyed = false;
  let raf = 0;
  let lastFrame = 0;
  let position = { x: 50, y: 82 };
  let joystickVector = { x: 0, y: 0 };
  let joystickPointer = null;
  const keys = new Set();

  function setPaused(value) {
    window.__MN_INTERIOR_ACTIVE__ = value;
    document.body.classList.toggle('mn-interior-open', value);
    document.documentElement.classList.toggle('mn-interior-open', value);
  }

  function renderPosition() {
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
  }

  function movementVector() {
    let x = joystickVector.x;
    let y = joystickVector.y;
    if (keys.has('arrowleft') || keys.has('a') || keys.has('ф')) x -= 1;
    if (keys.has('arrowright') || keys.has('d') || keys.has('в')) x += 1;
    if (keys.has('arrowup') || keys.has('w') || keys.has('ц')) y -= 1;
    if (keys.has('arrowdown') || keys.has('s') || keys.has('ы')) y += 1;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  function frame(time) {
    if (!active || destroyed) return;
    const dt = Math.min(0.04, Math.max(0, (time - (lastFrame || time)) / 1000));
    lastFrame = time;
    const vector = movementVector();
    const sprint = keys.has('shift');
    const speed = sprint ? 23 : 15;
    position.x = Math.min(96, Math.max(4, position.x + vector.x * speed * dt));
    position.y = Math.min(96, Math.max(4, position.y + vector.y * speed * dt));
    renderPosition();
    raf = requestAnimationFrame(frame);
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }

  function showError(text) {
    active = false;
    loading.hidden = true;
    scene.hidden = true;
    errorText.textContent = text;
    errorBox.hidden = false;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => reject(new Error('INTERIOR_LOAD_TIMEOUT')), 12000);
      image.onload = () => { clearTimeout(timeout); resolve(src); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error('INTERIOR_IMAGE_NOT_FOUND')); };
      image.src = src;
    });
  }

  async function enter(house) {
    const id = houseId(house);
    if (!id) throw new Error('HOUSE_ID_INVALID');

    overlay.hidden = false;
    errorBox.hidden = true;
    scene.hidden = true;
    loading.hidden = false;
    loadingText.textContent = 'Проверяем доступ к дому';
    setPaused(true);

    try {
      const { data, error } = await supabase.rpc('get_house_interior_access', {
        p_house_id: id,
        p_tg_id: playerTgId(),
      });
      if (error) throw error;
      if (!data?.allowed) throw new Error(data?.reason || 'INTERIOR_ACCESS_DENIED');

      const template = TEMPLATES[normalizeClass(data.houseClass || house?.payload?.houseClass || house?.variant)];
      const src = templateAsset(template.file);
      loadingText.textContent = `Загружаем ${template.file}`;
      await loadImage(src);

      map.style.backgroundImage = `url("${src}")`;
      overlay.dataset.template = template.id;
      overlay.dataset.houseId = id;
      title.textContent = `Дом · ${data.houseClassLabel || template.id}`;
      meta.textContent = `${template.rooms} комн. · кухня ${template.kitchen} · санузел ${template.bathroom}`;
      position = { ...template.spawn };
      renderPosition();
      loading.hidden = true;
      scene.hidden = false;
      active = true;
      startLoop();
      window.dispatchEvent(new CustomEvent('mn:interior-entered', { detail: { houseId: id, template: template.id } }));
    } catch (error) {
      const code = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
      if (code.includes('INTERIOR_NOT_OWNER')) showError('Вход доступен только владельцу дома.');
      else if (code.includes('INTERIOR_IMAGE_NOT_FOUND')) showError('PNG интерьера не найден. Добавьте нужный файл в корень проекта.');
      else showError(`Не удалось открыть интерьер: ${code || 'неизвестная ошибка'}`);
    }
  }

  function exit() {
    active = false;
    cancelAnimationFrame(raf);
    keys.clear();
    joystickVector = { x: 0, y: 0 };
    stick.style.transform = 'translate3d(0,0,0)';
    overlay.hidden = true;
    scene.hidden = true;
    loading.hidden = false;
    errorBox.hidden = true;
    setPaused(false);
    window.dispatchEvent(new CustomEvent('mn:interior-exited', { detail: { houseId: overlay.dataset.houseId || null } }));
    delete overlay.dataset.houseId;
  }

  function keyDown(event) {
    if (!active) return;
    if (event.key === 'Escape' || String(event.key).toLowerCase() === 'e' || String(event.key).toLowerCase() === 'у') {
      event.preventDefault(); exit(); return;
    }
    keys.add(String(event.key).toLowerCase());
    event.preventDefault();
  }

  function keyUp(event) {
    if (!active) return;
    keys.delete(String(event.key).toLowerCase());
  }

  function updateJoystick(event) {
    if (event.pointerId !== joystickPointer) return;
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.32;
    const screenDx = event.clientX - cx;
    const screenDy = event.clientY - cy;
    const forceRotated = document.documentElement.classList.contains('mn-force-rotate-landscape') &&
      window.matchMedia?.('(orientation: portrait)')?.matches;
    const dx = forceRotated ? screenDy : screenDx;
    const dy = forceRotated ? -screenDx : screenDy;
    const length = Math.hypot(dx, dy);
    const scale = length > max ? max / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    joystickVector = { x: x / max, y: y / max };
    stick.style.transform = `translate3d(${x}px,${y}px,0)`;
  }

  joystick.addEventListener('pointerdown', (event) => {
    if (!active) return;
    joystickPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  joystick.addEventListener('pointermove', updateJoystick);
  const stopJoystick = (event) => {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    joystickVector = { x: 0, y: 0 };
    stick.style.transform = 'translate3d(0,0,0)';
  };
  joystick.addEventListener('pointerup', stopJoystick);
  joystick.addEventListener('pointercancel', stopJoystick);
  exitButton.addEventListener('click', exit);
  errorClose.addEventListener('click', exit);
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);

  return {
    enter,
    exit,
    cleanup() {
      destroyed = true;
      exit();
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      overlay.remove();
    },
  };
}

