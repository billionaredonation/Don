export const CONSTRUCTION_FACTORY_CONFIG = Object.freeze({
  purchasePrice: 4_200_000,
  rawCapacity: 2_500,
  productCapacity: 1_800,
  legalForms: Object.freeze(['ТОВ', 'АТ', 'Кооператив']),
});

export const CONSTRUCTION_RECIPES = Object.freeze({
  construction_board: Object.freeze({ id: 'construction_board', label: 'Обрезная доска', icon: '🪚', input: 'lumber_beam', inputLabel: 'Брус лесоруба', inputIcon: '▰', inputQty: 1, outputQty: 4, seconds: 75, wage: 70, suggestedPrice: 95 }),
  construction_timber: Object.freeze({ id: 'construction_timber', label: 'Строительный брус', icon: '▰', input: 'lumber_beam', inputLabel: 'Брус лесоруба', inputIcon: '▰', inputQty: 4, outputQty: 3, seconds: 60, wage: 60, suggestedPrice: 145 }),
  construction_plywood: Object.freeze({ id: 'construction_plywood', label: 'Фанерный лист', icon: '🟫', input: 'lumber_log', inputLabel: 'Брёвна', inputIcon: '🪵', inputQty: 3, outputQty: 5, seconds: 90, wage: 85, suggestedPrice: 125 }),
});

export const CONSTRUCTION_RAW_ITEMS = Object.freeze([
  { itemType: 'lumber_log', label: 'Брёвна', icon: '🪵' },
  { itemType: 'lumber_beam', label: 'Брус лесоруба', icon: '▰' },
]);

export const formatConstructionMoney = (value) => `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`;
