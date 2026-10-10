import { loadBusinessUtilityPortal } from '../utilities/businessUtilitiesApi.js';

export async function loadFarmUtilities(businessId) {
  if (!businessId) throw new Error('Не удалось определить фермерское предприятие.');
  const portal = await loadBusinessUtilityPortal([businessId]);
  const services = ['electricity', 'water', 'gas'];
  return {
    services: Object.fromEntries(services.map(key => [key, {
      active: portal?.[key]?.active === true,
      connected: portal?.[key]?.connected === true,
    }])),
    operational: services.every(key => portal?.[key]?.active === true),
    missing: services.filter(key => portal?.[key]?.active !== true),
  };
}

export async function requireFarmUtilities(businessId) {
  const status = await loadFarmUtilities(businessId);
  if (!status.operational) {
    throw new Error(`BUSINESS_UTILITIES_REQUIRED:${status.missing.join(',')}`);
  }
  return status;
}
