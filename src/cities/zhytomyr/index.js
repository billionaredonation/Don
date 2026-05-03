import { createCityConfig } from '../shared/createCityConfig.js';

export const city = createCityConfig({
  id: 'zhytomyr',
  name: 'Житомир',
  region: 'Камень и дерево',
  map: './ZutomyrMap.png',
  tagline: 'Карьеры, пилорамы и спокойная логистика.',
  economyType: 'materials',
  startMoney: 1180,
  profileTitle: 'Добытчик материалов',
  profileText: 'Житомир дает хороший баланс между добычей и переработкой.',
  specialty: {
    label: 'Бонус',
    value: '+12% к материалам',
    description: 'Карьеры и пилорамы платят больше стандартных смен.'
  },
  jobs: [
    { id: 'quarry', title: 'Карьер', pay: 970, description: 'Добыча камня и сырья.' },
    { id: 'sawmill', title: 'Пилорама', pay: 900, description: 'Переработка древесины.' },
    { id: 'warehouse', title: 'Склад', pay: 840, description: 'Стабильная логистика.' }
  ],
  housing: {
    title: 'Дом возле леса',
    minPrice: 920,
    description: 'Дешевый старт для добывающих работ.',
    bonus: '+3% к материалам'
  }
});
