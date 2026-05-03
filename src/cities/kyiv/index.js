import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'kyiv',
  name: 'Киев',
  region: 'Столица',
  map: './KiyvMap.png',
  tagline: 'Офисы, доставка и самые дорогие смены.',
  economyType: 'capital',
  startMoney: 1800,
  profileTitle: 'Столичный игрок',
  profileText: 'В Киеве больше конкуренции, но выше потолок заработка и быстрее открываются сервисы.',
  specialty: {
    label: 'Бонус',
    value: '+18% к офисным работам',
    description: 'Столица лучше подходит для быстрых денег через сервис, доставку и офисные задачи.'
  },
  jobs: [
    { id: 'courier', title: 'Курьер', pay: 980, description: 'Быстрая смена с частыми заказами.' },
    { id: 'office', title: 'Офис', pay: 1320, description: 'Стабильная работа с высоким доходом.' },
    { id: 'taxi', title: 'Такси', pay: 1160, description: 'Доход зависит от активности города.' }
  ],
  housing: {
    title: 'Микроапартаменты',
    minPrice: 2600,
    description: 'Дорогое жилье, зато рядом с работами и сервисами.',
    bonus: '+5% к доходу офисных смен'
  }
});
