import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'lviv',
  name: 'Львов',
  region: 'Туристический центр',
  map: './Lviv.png',
  tagline: 'Кофейни, отели и сервис с хорошими чаевыми.',
  economyType: 'tourism',
  startMoney: 1400,
  profileTitle: 'Городской сервисник',
  profileText: 'Львов хорош для стабильного роста через сервис и туризм.',
  specialty: {
    label: 'Бонус',
    value: '+12% к сервису',
    description: 'Работы в кафе и отелях чаще дают бонусные выплаты.'
  },
  jobs: [
    { id: 'coffee', title: 'Кофейня', pay: 920, description: 'Стабильная смена с чаевыми.' },
    { id: 'hotel', title: 'Отель', pay: 1030, description: 'Сервисная работа с хорошим графиком.' },
    { id: 'guide', title: 'Гид', pay: 1100, description: 'Больше платит при развитом профиле.' }
  ],
  housing: {
    title: 'Квартира в старом районе',
    minPrice: 1700,
    description: 'Комфортный старт для сервисных работ.',
    bonus: '+3% к чаевым'
  }
});
