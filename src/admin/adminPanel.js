import { updatePlayerPosition, getLocalPlayerId } from '../player/playerPosition.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function getPointFromEvent(event, viewport) {
  const rect = viewport.getBoundingClientRect();

  const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
  const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

  return {
    x: round(x),
    y: round(y),
  };
}

function applyMarkerPosition(marker, x, y, angle = 0) {
  marker.style.left = `${x}%`;
  marker.style.top = `${y}%`;
  marker.dataset.x = String(x);
  marker.dataset.y = String(y);
  marker.dataset.angle = String(angle);
  marker.style.setProperty('--player-angle', `${angle}deg`);
}

function saveLocalAdminEntities(cityId, entities) {
  try {
    localStorage.setItem(`mn_admin_entities_${cityId}`, JSON.stringify(entities));
  } catch {
    // ignore
  }
}

function loadLocalAdminEntities(cityId) {
  try {
    return JSON.parse(localStorage.getItem(`mn_admin_entities_${cityId}`)) || [];
  } catch {
    return [];
  }
}

function renderAdminEntities(layer, entities) {
  layer.innerHTML = entities
    .map((entity) => `
      <button
        class="admin-map-entity admin-map-entity-${entity.type}"
        data-admin-entity-id="${entity.id}"
        style="left:${entity.x}%;top:${entity.y}%"
        title="${entity.type}: ${entity.name || entity.id}"
        type="button"
      >
        ${entity.icon || '◆'}
      </button>
    `)
    .join('');
}

export function enableAdminPanel({
  root,
  stage,
  viewport,
  playerMarker,
  playerPosition,
  cityId,
  nickname,
  mapControls,
  movementChannel,
}) {
  if (!root || !stage || !viewport || !playerMarker || !playerPosition) return null;

  let enabled = false;
  let teleportMode = false;
  let placeMode = false;
  let selectedType = 'decor';

  const adminLayer = document.createElement('div');
  adminLayer.className = 'admin-map-layer';
  adminLayer.hidden = true;

  const panel = document.createElement('aside');
  panel.className = 'admin-panel';
  panel.hidden = true;

  panel.innerHTML = `
    <div class="admin-panel-head">
      <strong>ADMIN</strong>
      <button class="admin-btn admin-close" type="button">×</button>
    </div>

    <div class="admin-hint">
      P — открыть/закрыть. ESC — закрыть.
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-toggle-teleport" type="button">Телепорт: OFF</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-copy-coords" type="button">Скопировать координаты</button>
    </div>

    <div class="admin-separator"></div>

    <label class="admin-label">
      Тип объекта
      <select class="admin-select admin-entity-type">
        <option value="decor">Декор</option>
        <option value="house">Дом</option>
        <option value="business">Бизнес</option>
        <option value="npc">NPC</option>
      </select>
    </label>

    <label class="admin-label">
      Название
      <input class="admin-input admin-entity-name" placeholder="Например: дерево / дом / магазин" />
    </label>

    <div class="admin-row">
      <button class="admin-btn admin-toggle-place" type="button">Добавление: OFF</button>
    </div>

    <div class="admin-row">
      <button class="admin-btn admin-delete-last" type="button">Удалить последний</button>
      <button class="admin-btn admin-clear-all" type="button">Очистить</button>
    </div>

    <div class="admin-separator"></div>

    <div class="admin-coords">
      X: <b class="admin-x">0</b> · Y: <b class="admin-y">0</b>
    </div>
  `;

  viewport.appendChild(adminLayer);
  root.appendChild(panel);

  const btnClose = panel.querySelector('.admin-close');
  const btnTeleport = panel.querySelector('.admin-toggle-teleport');
  const btnCopy = panel.querySelector('.admin-copy-coords');
  const btnPlace = panel.querySelector('.admin-toggle-place');
  const btnDeleteLast = panel.querySelector('.admin-delete-last');
  const btnClearAll = panel.querySelector('.admin-clear-all');
  const typeSelect = panel.querySelector('.admin-entity-type');
  const nameInput = panel.querySelector('.admin-entity-name');
  const xEl = panel.querySelector('.admin-x');
  const yEl = panel.querySelector('.admin-y');

  let entities = loadLocalAdminEntities(cityId);

  function getIcon(type) {
    if (type === 'house') return '⌂';
    if (type === 'business') return '$';
    if (type === 'npc') return '●';
    return '◆';
  }

  function updateCoords(x, y) {
    xEl.textContent = String(round(x));
    yEl.textContent = String(round(y));
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    root.dataset.adminMode = enabled ? 'enabled' : 'disabled';
    panel.hidden = !enabled;
    adminLayer.hidden = !enabled;

    if (!enabled) {
      teleportMode = false;
      placeMode = false;
      btnTeleport.textContent = 'Телепорт: OFF';
      btnPlace.textContent = 'Добавление: OFF';
    }
  }

  async function teleportTo(x, y) {
    const angle = Number(playerPosition.angle || playerMarker.dataset.angle || 0);

    playerPosition.x = x;
    playerPosition.y = y;
    playerPosition.angle = angle;

    applyMarkerPosition(playerMarker, x, y, angle);
    mapControls?.focusOnPlayer?.(x, y);

    window.dispatchEvent(new CustomEvent('mn:player-teleport', {
      detail: { x, y, angle },
    }));

    movementChannel?.sendMove?.({
      playerId: getLocalPlayerId(),
      nickname,
      cityId,
      x,
      y,
      angle,
      updatedAt: new Date().toISOString(),
    });

    try {
      await updatePlayerPosition({
        cityId,
        nickname,
        x,
        y,
        angle,
      });
    } catch (error) {
      console.warn('[adminPanel] teleport save failed:', error);
    }
  }

  function addEntity(x, y) {
    const type = selectedType;

    const entity = {
      id: `${type}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type,
      name: nameInput.value.trim() || type,
      icon: getIcon(type),
      cityId,
      x,
      y,
      createdAt: new Date().toISOString(),
    };

    entities.push(entity);
    saveLocalAdminEntities(cityId, entities);
    renderAdminEntities(adminLayer, entities);
  }

  function onMapClick(event) {
    if (!enabled) return;
    if (!teleportMode && !placeMode) return;
    if (event.target.closest('.admin-panel')) return;
    if (event.target.closest('.admin-map-entity')) return;

    event.preventDefault();
    event.stopPropagation();

    const point = getPointFromEvent(event, viewport);
    updateCoords(point.x, point.y);

    if (teleportMode) {
      teleportTo(point.x, point.y);
      return;
    }

    if (placeMode) {
      addEntity(point.x, point.y);
    }
  }

  function onMouseMove(event) {
    if (!enabled) return;

    const point = getPointFromEvent(event, viewport);
    updateCoords(point.x, point.y);
  }

  function onKeyDown(event) {
    const tag = document.activeElement?.tagName?.toLowerCase();

    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (event.key.toLowerCase() === 'p') {
      event.preventDefault();
      setEnabled(!enabled);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setEnabled(false);
    }
  }

  btnClose.addEventListener('click', () => setEnabled(false));

  btnTeleport.addEventListener('click', () => {
    teleportMode = !teleportMode;
    placeMode = false;

    btnTeleport.textContent = teleportMode ? 'Телепорт: ON' : 'Телепорт: OFF';
    btnPlace.textContent = 'Добавление: OFF';
  });

  btnPlace.addEventListener('click', () => {
    placeMode = !placeMode;
    teleportMode = false;

    btnPlace.textContent = placeMode ? 'Добавление: ON' : 'Добавление: OFF';
    btnTeleport.textContent = 'Телепорт: OFF';
  });

  btnCopy.addEventListener('click', async () => {
    const text = `{ x: ${xEl.textContent}, y: ${yEl.textContent} }`;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.log(text);
    }
  });

  btnDeleteLast.addEventListener('click', () => {
    entities.pop();
    saveLocalAdminEntities(cityId, entities);
    renderAdminEntities(adminLayer, entities);
  });

  btnClearAll.addEventListener('click', () => {
    entities = [];
    saveLocalAdminEntities(cityId, entities);
    renderAdminEntities(adminLayer, entities);
  });

  typeSelect.addEventListener('change', () => {
    selectedType = typeSelect.value;
  });

  viewport.addEventListener('click', onMapClick, true);
  viewport.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);

  renderAdminEntities(adminLayer, entities);
  setEnabled(false);

  return () => {
    viewport.removeEventListener('click', onMapClick, true);
    viewport.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);

    panel.remove();
    adminLayer.remove();

    delete root.dataset.adminMode;
  };
}
