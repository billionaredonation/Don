function isBusinessObject(object) {
  return object?.category === 'business';
}

  const businesses = objects.filter(isBusinessObject);

  const housesFree = houses.filter((house) => {
    return !house?.payload?.ownerId && !house?.payload?.locked;
  });

  const businessFree = businesses.filter((business) => {
    return !business?.payload?.ownerId && !business?.payload?.locked;
  });

  return {
    houses,
    housesTotal: houses.length,
    housesFree: housesFree.length,
    businessTotal: businesses.length,
    businessFree: businessFree.length,
  };
}
