import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'dnipro',
  name: 'Днепр',
  region: 'Логистический узел',
  map: './DneprMap.png',
  tagline: 'Склады, доставка и промышленность.',
  economyType: 'logistics',
  startMoney: 1350,
  profileTitle: 'Логист',
  profileText: 'Днепр удобен для стабильного заработка через склады и доставку.',
  specialty: {
    label: 'Бонус',
    value: '+10% к логистике',
    description: 'Складские и транспортные работы быстрее окупаются.'
  },
  jobs: [
    { id: 'warehouse', title: 'Склад', pay: 960, description: 'Ровный доход без сильных рисков.' },
    { id: 'logistics', title: 'Логистика', pay: 1120, description: 'Маршруты и перевозки по городу.' },
    { id: 'service', title: 'СТО', pay: 1010, description: 'Ремонт транспорта и мелкие заказы.' }
  ],
  housing: {
    title: 'Жилье у склада',
    minPrice: 1350,
    description: 'Дешевле столицы, удобно для логистики.',
    bonus: '+3% к складским сменам'
  }
});
