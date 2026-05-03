import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'zaporizhzhia',
  name: 'Запорожье',
  region: 'Индустриальный регион',
  map: './Zaporozya.png',
  tagline: 'Металлургия, заводы и мощный старт.',
  economyType: 'industrial',
  startMoney: 1300,
  profileTitle: 'Рабочий индустрии',
  profileText: 'Запорожье дает крепкий старт через производство и ремонт.',
  specialty: {
    label: 'Бонус',
    value: '+13% к заводам',
    description: 'Производственные смены платят стабильнее и открывают будущие улучшения.'
  },
  jobs: [
    { id: 'plant', title: 'Завод', pay: 1080, description: 'Основной заработок индустриального города.' },
    { id: 'metallurgy', title: 'Металлургия', pay: 1190, description: 'Тяжелая, но более прибыльная смена.' },
    { id: 'repair', title: 'СТО', pay: 930, description: 'Быстрая техническая работа.' }
  ],
  housing: {
    title: 'Рабочее общежитие',
    minPrice: 1100,
    description: 'Дешевый старт рядом с производством.',
    bonus: '+4% к заводским работам'
  }
});
