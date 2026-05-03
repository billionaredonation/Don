import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'donetsk',
  name: 'Донецк',
  region: 'Металл и шахты',
  map: './DonetskMap.png',
  tagline: 'Тяжелая промышленность с высокой оплатой.',
  economyType: 'heavy-industry',
  startMoney: 1200,
  profileTitle: 'Промышленный рабочий',
  profileText: 'Донецк платит больше за тяжелые смены, но требует больше вложений в развитие.',
  specialty: {
    label: 'Бонус',
    value: '+17% к шахтам',
    description: 'Добыча и металлургия становятся основой заработка.'
  },
  jobs: [
    { id: 'mine', title: 'Шахта', pay: 1180, description: 'Высокая оплата за тяжелый труд.' },
    { id: 'metal', title: 'Метзавод', pay: 1210, description: 'Производственная смена с повышенным доходом.' },
    { id: 'repair', title: 'СТО', pay: 920, description: 'Быстрый технический доход.' }
  ],
  housing: {
    title: 'Квартира у промзоны',
    minPrice: 1000,
    description: 'Дешевле центра, ближе к работам.',
    bonus: '+4% к промышленным работам'
  }
});
