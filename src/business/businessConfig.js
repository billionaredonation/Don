export const BUSINESS_TYPE_GROCERY = 'grocery';

export const BUSINESS_ROLE_LABELS = Object.freeze({
  owner: 'Владелец',
  accountant: 'Бухгалтерия',
  merchandiser: 'Расстановка товара',
  customer: 'Покупатель',
});

export const BUSINESS_PRODUCTS = Object.freeze([
  { itemType: 'grocery_bread', label: 'Хлеб', icon: '🍞', foodRestore: 18, waterRestore: 0, suggestedPrice: 32 },
  { itemType: 'grocery_milk', label: 'Молоко', icon: '🥛', foodRestore: 8, waterRestore: 15, suggestedPrice: 46 },
  { itemType: 'grocery_apple', label: 'Яблоко', icon: '🍎', foodRestore: 12, waterRestore: 4, suggestedPrice: 24 },
  { itemType: 'grocery_canned_food', label: 'Консервы', icon: '🥫', foodRestore: 30, waterRestore: 0, suggestedPrice: 78 },
  { itemType: 'grocery_water', label: 'Вода', icon: '💧', foodRestore: 0, waterRestore: 28, suggestedPrice: 28 },
  { itemType: 'grocery_snack', label: 'Снеки', icon: '🍪', foodRestore: 14, waterRestore: 0, suggestedPrice: 38 },
]);

export const BUSINESS_PRODUCT_BY_TYPE = Object.freeze(
  Object.fromEntries(BUSINESS_PRODUCTS.map((product) => [product.itemType, product])),
);

// Реальные показатели ФОП Украины на 2026 год. В игре месячные платежи
// пересчитываются в недельный эквивалент, потому что декларационный цикл — 7 дней.
export const BUSINESS_TAX_2026 = Object.freeze({
  effectiveYear: 2026,
  minimumSalary: 8647,
  monthlyMinimumSocialContribution: 1902.34,
  groups: {
    2: {
      label: 'ФОП 2 группа',
      monthlySingleTax: 1729.40,
      monthlyMilitaryLevy: 864.70,
      turnoverRate: 0,
      annualIncomeLimit: 7211598,
    },
    3: {
      label: 'ФОП 3 группа',
      monthlySingleTax: 0,
      monthlyMilitaryLevy: 0,
      turnoverRate: 0.06,
      annualIncomeLimit: 10091049,
    },
  },
});

export function getBusinessProduct(itemType) {
  return BUSINESS_PRODUCT_BY_TYPE[String(itemType || '').trim()] || null;
}

export function getBusinessRoleLabel(role) {
  return BUSINESS_ROLE_LABELS[String(role || '').trim()] || BUSINESS_ROLE_LABELS.customer;
}

export function formatBusinessMoney(value) {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU')} ₴`;
}

export function getWeeklyTaxPreview(group, turnover = 0) {
  const taxGroup = Number(group) === 3 ? 3 : 2;
  const config = BUSINESS_TAX_2026.groups[taxGroup];
  const monthlyFixed = BUSINESS_TAX_2026.monthlyMinimumSocialContribution
    + config.monthlySingleTax
    + config.monthlyMilitaryLevy;
  const fixedWeekly = Math.round((monthlyFixed * 12) / 52);
  const turnoverTax = Math.round(Math.max(0, Number(turnover) || 0) * config.turnoverRate);
  return {
    fixedWeekly,
    turnoverTax,
    total: fixedWeekly + turnoverTax,
    group: taxGroup,
  };
}
