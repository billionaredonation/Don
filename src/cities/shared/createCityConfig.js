import { getCityMapUrl, getCityRoadsUrl } from '../../map/cityMapAssets.js';
export function createCityConfig(config) {
  return {
    startMoney: 1200,
    economyType: 'mixed',
    profileTitle: 'Новый житель',
    profileText: 'Город только открывается для игрока. Возможности будут расширяться по мере развития меню.',
    housing: {
      title: 'Базовая аренда',
      minPrice: 800,
      description: 'Недорогое жилье для старта.',
      bonus: 'Без бонуса'
    },
    ...config,
    map: getCityMapUrl(config.id),
    ...(getCityRoadsUrl(config.id) ? { roadsMap: getCityRoadsUrl(config.id), roadMap: getCityRoadsUrl(config.id) } : {}),
  };
}
