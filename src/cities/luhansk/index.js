import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'luhansk',
  name: 'Луганск',
  region: 'Восстановление',
  map: './LuganskMap.png',
  tagline: 'Ремонт, добыча и тяжелые смены.',
  economyType: 'rebuild',
  startMoney: 1150,
  profileTitle: 'Специалист восстановления',
  profileText: 'Луганск сложнее на старте, но тяжелые работы платят выше.',
  specialty: {
    label: 'Бонус',
    value: '+16% к восстановлению',
    description: 'Ремонтные и добывающие смены дают повышенную оплату.'
  },
  jobs: [
    { id: 'mine', title: 'Шахта', pay: 1120, description: 'Тяжелая смена с высокой оплатой.' },
    { id: 'repair', title: 'Ремонт техники', pay: 980, description: 'Стабильная работа на восстановлении.' },
    { id: 'logistics', title: 'Логистика', pay: 930, description: 'Перевозка материалов по городу.' }
  ],
  housing: {
    title: 'Временное жилье',
    minPrice: 850,
    description: 'Дешевый старт, но без комфорта.',
    bonus: '+5% к ремонтным работам'
  }
});
