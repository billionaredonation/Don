import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'vinnytsia',
  name: 'Винница',
  region: 'Агро и сервис',
  map: './VinitsaMap.png',
  tagline: 'Спокойный старт, агробизнес и местный сервис.',
  economyType: 'agro',
  startMoney: 1250,
  profileTitle: 'Местный предприниматель',
  profileText: 'Винница подходит для аккуратного развития без резких рисков.',
  specialty: {
    label: 'Бонус',
    value: '+9% к агроработам',
    description: 'Фермы и переработка дают стабильную прибыль.'
  },
  jobs: [
    { id: 'farm', title: 'Ферма', pay: 820, description: 'Надежная базовая смена.' },
    { id: 'bakery', title: 'Пекарня', pay: 880, description: 'Сервис и производство в одном.' },
    { id: 'delivery', title: 'Доставка', pay: 850, description: 'Быстрые городские заказы.' }
  ],
  housing: {
    title: 'Дом на окраине',
    minPrice: 1050,
    description: 'Недорогое жилье для спокойного старта.',
    bonus: '+3% к агроработам'
  }
});
