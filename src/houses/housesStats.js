export function normalizeHousesState(rawState = {}) {
  const housesTotal = Number(rawState.housesTotal || 0);
  const housesFree = Number(rawState.housesFree || 0);
  const businessTotal = Number(rawState.businessTotal || 0);
  const businessFree = Number(rawState.businessFree || 0);

  const freeSlots = housesFree + businessFree;
  const totalSlots = housesTotal + businessTotal;

  return {
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
