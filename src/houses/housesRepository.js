import { fetchCityStats } from '../api/cityStats.js';

export async function fetchCityHousesState(cityId) {
  const stats = await fetchCityStats(cityId);

  return {
    housesTotal: Number(stats?.houses_total || 0),
    housesFree: Number(stats?.houses_free || 0),
    businessTotal: Number(stats?.biz_total || 0),
    businessFree: Number(stats?.biz_free || 0),
  };
}
