import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'odesa',
  name: 'Одесса',
  region: 'Портовый город',
  map: './Odessa.png',
  tagline: 'Порт, торговля и туристические деньги.',
  economyType: 'trade',
  startMoney: 1500,
  profileTitle: 'Портовый предприниматель',
  profileText: 'Одесса дает хороший старт через торговлю и сезонные работы.',
  specialty: {
    label: 'Бонус',
    value: '+15% к торговле',
    description: 'Портовые сделки платят больше, но иногда требуют больше времени.'
  },
  jobs: [
    { id: 'port', title: 'Порт', pay: 1180, description: 'Разгрузка и логистика товаров.' },
    { id: 'market', title: 'Торговля', pay: 1040, description: 'Покупка, продажа и быстрый оборот.' },
    { id: 'taxi', title: 'Такси у моря', pay: 930, description: 'Доход выше в туристические часы.' }
  ],
  housing: {
    title: 'Комната у центра',
    minPrice: 1900,
    description: 'Средняя цена и быстрый доступ к порту.',
    bonus: '+4% к торговым работам'
  }
});
