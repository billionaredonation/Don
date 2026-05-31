import { getMapObjects } from '../mapObjects/mapObjectsRepository.js';

function isHouseObject(object) {
  return object?.category === 'house' || object?.type === 'house';
}

function isBusinessObject(object) {
  return object?.category === 'business';
}

export async function fetchCityHousesState(cityId) {
  const objects = await getMapObjects(cityId);

  const houses = objects.filter(isHouseObject);
  const businesses = objects.filter(isBusinessObject);

  const housesFree = houses.filter((house) => {
    return !house?.payload?.ownerId && !house?.payload?.locked;
  });

  const businessFree = businesses.filter((business) => {
    return !business?.payload?.ownerId && !business?.payload?.locked;
  });

  return {
    houses,
    businesses,
    housesTotal: houses.length,
    housesFree: housesFree.length,
    businessTotal: businesses.length,
    businessFree: businessFree.length,
  };
}
