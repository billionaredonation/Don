export function normalizeHousesState(rawState = {}) {
  const houses = Array.isArray(rawState.houses) ? rawState.houses : [];
  const businesses = Array.isArray(rawState.businesses) ? rawState.businesses : [];

  const housesTotal = Number(rawState.housesTotal || houses.length || 0);
  const housesFree = Number(rawState.housesFree || 0);

  const businessTotal = Number(rawState.businessTotal || businesses.length || 0);
  const businessFree = Number(rawState.businessFree || 0);

  const freeSlots = housesFree + businessFree;
  const totalSlots = housesTotal + businessTotal;

  return {
    houses,
    businesses,

    housesTotal,
    housesFree,

    businessTotal,
    businessFree,

    freeSlots,
    totalSlots,

    housesFreePercent: Math.round((housesFree / housesTotal) * 100 || 0),
    businessFreePercent: Math.round((businessFree / businessTotal) * 100 || 0),
    freeSlotsPercent: Math.round((freeSlots / (totalSlots || 1)) * 100),
  };
}

export function getEmptyHousesState() {
  return normalizeHousesState();
}
