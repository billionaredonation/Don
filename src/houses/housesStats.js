export function normalizeHousesState(rawState = {}) {
  const houses = Array.isArray(rawState.houses) ? rawState.houses : [];

  const housesTotal = Number(rawState.housesTotal || houses.length || 0);

  const housesFree = houses.filter((house) => {
    return !house?.payload?.ownerId && !house?.payload?.locked;
  }).length;

  const housesOwned = housesTotal - housesFree;

  return {
    houses,

    housesTotal,
    housesFree,
    housesOwned,

    housesFreePercent: Math.round((housesFree / housesTotal) * 100 || 0),
    housesOwnedPercent: Math.round((housesOwned / housesTotal) * 100 || 0),
  };
}

export function getEmptyHousesState() {
  return normalizeHousesState();
}
