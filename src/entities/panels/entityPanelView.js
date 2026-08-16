import { getHousePanelData } from '../../houses/housePanelData.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return '';
  }

  return `${number.toLocaleString('ru-RU')} ₴`;
}



export function getBusinessPanelData(object) {
  const price = formatMoney(object?.payload?.price);
  const income = Number(object?.payload?.incomePerHour || 0);
  const ownerId = object?.owner_id || object?.ownerId || object?.payload?.ownerId || object?.payload?.owner_id || '';
  const locked = Boolean(object?.payload?.locked);

  const incomeText = income > 0
    ? `${income.toLocaleString('ru-RU')} $/час`
    : '';

  return {
    icon: object?.icon || '🏪',
    title: object?.name || 'Бизнес',
    meta: [
      object?.payload?.businessLabel || object?.type || 'business',
      ownerId ? 'занят' : locked ? 'закрыт' : 'свободен',
      price,
      incomeText,
    ].filter(Boolean).join(' · '),
    actionLabel: ownerId ? 'Войти в магазин' : locked ? 'Закрыто' : 'Купить бизнес',
  };
}

export function getNpcPanelData(object) {
  return {
    icon: object?.icon || '●',
    title: object?.name || 'NPC',
    meta: object?.payload?.dialogLabel || object?.payload?.role || 'Персонаж',
    actionLabel: 'Говорить',
  };
}

export function getDecorPanelData(object) {
  return {
    icon: object?.icon || '◆',
    title: object?.name || 'Декор',
    meta: object?.type || 'decor',
    actionLabel: 'Осмотреть',
  };
}

export function getMarkerPanelData(object) {
  return {
    icon: object?.icon || '◆',
    title: object?.name || 'Маркер',
    meta: object?.type || 'marker',
    actionLabel: 'Выбрать',
  };
}

export function getEntityPanelData(object) {
  const kind = object?.category || object?.payload?.kind || object?.type;

  if (kind === 'house') return getHousePanelData(object);
  if (kind === 'business') return getBusinessPanelData(object);
  if (kind === 'npc') return getNpcPanelData(object);
  if (kind === 'decor') return getDecorPanelData(object);
  if (kind === 'marker') return getMarkerPanelData(object);

  return {
    icon: object?.icon || '◆',
    title: object?.name || 'Сущность',
    meta: object?.type || 'object',
    actionLabel: 'Выбрать',
  };
}

export function renderEntityPanelContent({
  iconEl,
  titleEl,
  metaEl,
  actionButton,
  object,
}) {
  const data = getEntityPanelData(object);

  iconEl.textContent = data.icon;
  titleEl.textContent = data.title;
  metaEl.innerHTML = escapeHtml(data.meta);
  actionButton.textContent = data.actionLabel;
}
