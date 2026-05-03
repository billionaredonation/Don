import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'kharkiv',
  name: 'Харьков',
  region: 'Наука и производство',
  map: './Kharkiv.png',
  tagline: 'IT, заводы и технические смены.',
  economyType: 'tech',
  startMoney: 1450,
  profileTitle: 'Технический специалист',
  profileText: 'Харьков дает сильные работы для тех, кто хочет развиваться через технологии.',
  specialty: {
    label: 'Бонус',
    value: '+14% к техработам',
    description: 'Технические работы платят выше после первых улучшений.'
  },
  jobs: [
    { id: 'factory', title: 'Завод', pay: 1050, description: 'Производственная смена с надежным доходом.' },
    { id: 'it', title: 'IT-аутсорс', pay: 1240, description: 'Высокая зарплата, но выше требования.' },
    { id: 'repair', title: 'Ремонт техники', pay: 990, description: 'Быстрые заказы по району.' }
  ],
  housing: {
    title: 'Студия у транспорта',
    minPrice: 1550,
    description: 'Недорогое жилье рядом с работами.',
    bonus: '+4% к техработам'
  }
});
