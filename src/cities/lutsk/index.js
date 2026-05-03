import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'lutsk',
  name: 'Луцк',
  region: 'Лес и ремесло',
  map: './LutskMap.png',
  tagline: 'Деревообработка, склады и тихий рост.',
  economyType: 'wood',
  startMoney: 1200,
  profileTitle: 'Мастер ремесла',
  profileText: 'Луцк хорош для неспешного накопления через ремесло и склады.',
  specialty: {
    label: 'Бонус',
    value: '+11% к деревообработке',
    description: 'Местные мастерские дают повышенную оплату.'
  },
  jobs: [
    { id: 'sawmill', title: 'Лесопилка', pay: 900, description: 'Производственная работа с ровным доходом.' },
    { id: 'warehouse', title: 'Склад', pay: 820, description: 'Низкий риск и стабильные смены.' },
    { id: 'craft', title: 'Мастерская', pay: 940, description: 'Лучше раскрывается после улучшений.' }
  ],
  housing: {
    title: 'Малый дом',
    minPrice: 980,
    description: 'Доступное жилье для старта.',
    bonus: '+3% к ремесленным работам'
  }
});
