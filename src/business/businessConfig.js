export const BUSINESS_TYPE_GROCERY = 'grocery';
export const BUSINESS_TYPE_TOOL_STORE = 'tool_store';

export const BUSINESS_LEGAL_FORMS = Object.freeze({
  fop: Object.freeze({
    value: 'fop',
    label: 'ФОП',
    title: 'Физическое лицо-предприниматель',
    description: 'Простая форма для небольшого бизнеса. Владелец отвечает лично и сдаёт недельную декларацию.',
    responsibility: 'Личная ответственность владельца',
    accounting: 'Упрощённая бухгалтерия',
    taxGroups: Object.freeze([2, 3]),
  }),
  tov: Object.freeze({
    value: 'tov',
    label: 'ТОВ',
    title: 'Товариство з обмеженою відповідальністю',
    description: 'Украинское юридическое лицо с отдельной ответственностью и более строгим учётом.',
    responsibility: 'Ответственность ограничена имуществом компании',
    accounting: 'Полная бухгалтерия и отдельный счёт',
    taxGroups: Object.freeze([3]),
  }),
  ooo: Object.freeze({
    value: 'ooo',
    label: 'ООО',
    title: 'Общество с ограниченной ответственностью',
    description: 'Юридическое лицо другого формата. Для текущей игровой налоговой используется корпоративная модель 3 группы.',
    responsibility: 'Ответственность отделена от владельца',
    accounting: 'Расширенная бухгалтерия',
    taxGroups: Object.freeze([3]),
  }),
  other: Object.freeze({
    value: 'other',
    label: 'Иная форма',
    title: 'Другая организационно-правовая форма',
    description: 'Свободное название для будущих государственных, кооперативных и специальных организаций.',
    responsibility: 'Определяется правилами проекта',
    accounting: 'Корпоративная модель учёта',
    taxGroups: Object.freeze([3]),
  }),
});

export const BUSINESS_TAX_GROUP_LABELS = Object.freeze({
  fop: Object.freeze({
    2: '2 группа · фиксированные платежи',
    3: '3 группа · 6% оборота + ЕСВ',
  }),
  company: Object.freeze({
    3: '3 группа · 5% оборота',
  }),
});

export function normalizeBusinessLegalForm(value) {
  const key = String(value || '').trim().toLowerCase();
  return BUSINESS_LEGAL_FORMS[key] ? key : 'fop';
}

export function getBusinessLegalForm(value) {
  return BUSINESS_LEGAL_FORMS[normalizeBusinessLegalForm(value)];
}

export function getBusinessTaxGroups(legalForm) {
  return [...getBusinessLegalForm(legalForm).taxGroups];
}

export function normalizeBusinessTaxGroup(legalForm, taxGroup) {
  const groups = getBusinessTaxGroups(legalForm);
  const value = Number(taxGroup);
  return groups.includes(value) ? value : groups[0];
}

export function getBusinessTaxGroupLabel(legalForm, taxGroup) {
  const form = normalizeBusinessLegalForm(legalForm);
  const group = normalizeBusinessTaxGroup(form, taxGroup);
  return form === 'fop'
    ? BUSINESS_TAX_GROUP_LABELS.fop[group]
    : BUSINESS_TAX_GROUP_LABELS.company[group];
}

export function getBusinessLegalPayload(source = {}) {
  const legalForm = normalizeBusinessLegalForm(source.legalForm || source.legal_form);
  const form = getBusinessLegalForm(legalForm);
  const taxGroup = normalizeBusinessTaxGroup(legalForm, source.taxGroup ?? source.tax_group);
  const customLabel = String(source.legalFormLabel || source.legal_form_label || '').trim().slice(0, 48);
  const legalFormLabel = legalForm === 'other' && customLabel ? customLabel : form.label;
  return {
    legalForm,
    legalFormLabel,
    taxGroup,
    taxGroupLabel: getBusinessTaxGroupLabel(legalForm, taxGroup),
    taxConfiguredByAdmin: true,
  };
}

export const BUSINESS_ROLE_LABELS = Object.freeze({
  owner: 'Владелец',
  accountant: 'Бухгалтер',
  merchandiser: 'Товаровед',
  customer: 'Покупатель',
});

export const BUSINESS_PRODUCTS = Object.freeze([
  { itemType: 'grocery_apple_juice', factoryProduct: 'apple_juice', label: 'Яблочный сок', icon: '🧃', foodRestore: 4, waterRestore: 24, suggestedPrice: 58 },
  { itemType: 'grocery_orange_juice', factoryProduct: 'orange_juice', label: 'Апельсиновый сок', icon: '🥤', foodRestore: 5, waterRestore: 26, suggestedPrice: 68 },
  { itemType: 'grocery_fruit_puree', factoryProduct: 'fruit_puree', label: 'Фруктовое пюре', icon: '🥫', foodRestore: 22, waterRestore: 5, suggestedPrice: 72 },
]);

export const BUSINESS_TOOL_PRODUCTS = Object.freeze([
  { itemType: 'farm_rake', label: 'Грабли', icon: '🧹', suggestedPrice: 240, kind: 'tool', permanent: true },
  { itemType: 'farm_scissors', label: 'Садовые ножницы', icon: '✂️', suggestedPrice: 260, kind: 'tool', permanent: true },
  { itemType: 'mine_tool_pickaxe', label: 'Шахтёрская кирка', icon: '⛏️', suggestedPrice: 650, kind: 'tool', permanent: true },
  { itemType: 'lumber_tool_axe', label: 'Топор лесоруба', icon: '🪓', suggestedPrice: 520, kind: 'tool', permanent: true },
  { itemType: 'lumber_tool_chainsaw', label: 'Бензопила', icon: '🪚', suggestedPrice: 1800, kind: 'tool', permanent: true },
]);

export const BUSINESS_PRODUCTS_BY_TYPE = Object.freeze({
  [BUSINESS_TYPE_GROCERY]: BUSINESS_PRODUCTS,
  shop: BUSINESS_PRODUCTS,
  [BUSINESS_TYPE_TOOL_STORE]: BUSINESS_TOOL_PRODUCTS,
});

export const BUSINESS_PRODUCT_BY_TYPE = Object.freeze(
  Object.fromEntries([...BUSINESS_PRODUCTS, ...BUSINESS_TOOL_PRODUCTS].map((product) => [product.itemType, product])),
);

export function getBusinessProducts(businessType = BUSINESS_TYPE_GROCERY) {
  return BUSINESS_PRODUCTS_BY_TYPE[String(businessType || '').trim().toLowerCase()] || BUSINESS_PRODUCTS;
}

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

