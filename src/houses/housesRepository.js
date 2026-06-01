import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

function isHouseObject(object) {
  return object?.category === 'house' || object?.type === 'house';
}

export async function fetchCityHousesState(cityId) {
  const objects = await getMapObjects(cityId);
  const houses = objects.filter(isHouseObject);

  const housesFree = houses.filter((house) => {
    return !house?.payload?.ownerId && !house?.payload?.locked;
  });

  const housesOwned = houses.filter((house) => {
    return house?.payload?.ownerId || house?.payload?.locked;
  });

  return {
    houses,
    housesTotal: houses.length,
    housesFree: housesFree.length,
    housesOwned: housesOwned.length,
  };
}
