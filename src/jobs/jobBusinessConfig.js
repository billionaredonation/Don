export const JOB_BUSINESS_TYPES = Object.freeze({
  lumber: Object.freeze({
    jobType: 'lumber',
    stationType: 'lumber_station',
    label: 'Лесозаготовительное предприятие',
    shortLabel: 'Лесозаготовка',
    icon: '🪵',
    purchasePrice: 1_000_000,
    warehouseCapacity: 400,
    unitLabel: 'ед.',
  }),
  mine: Object.freeze({
    jobType: 'mine',
    stationType: 'mine_station',
    label: 'Горнодобывающее предприятие',
    shortLabel: 'Шахта',
    icon: '⛏️',
    purchasePrice: 1_000_000,
    warehouseCapacity: 1_500,
    unitLabel: 'кг',
  }),
});

export function getJobBusinessConfig(jobType) {
  return JOB_BUSINESS_TYPES[String(jobType || '').trim().toLowerCase()] || null;
}

export function formatJobBusinessMoney(value) {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`;
}
