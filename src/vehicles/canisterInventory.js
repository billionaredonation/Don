const fuelLabels = { petrol: 'А-95', petrol92: 'А-92', diesel: 'Дизель' };
let provider = null;
let cached = [];
export function registerCanisterInventory(next) {
  provider = next;
  return () => { if (provider === next) { provider = null; publishCanisters([]); } };
}
export function canisterItems(canisters = []) {
  return canisters.map(c => ({ itemType: 'fuel_canister', inventoryItemId: c.id,
    source: 'personal', quantity: 1, liters: Number(c.liters), fuelType: c.fuel_type,
    label: `Канистра · ${Number(c.liters)} / 20 л · ${fuelLabels[c.fuel_type] || 'пустая'}` }));
}
export function publishCanisters(canisters) {
  const items = canisterItems(canisters);
  if (JSON.stringify(items) === JSON.stringify(cached)) return;
  cached = items;
  window.dispatchEvent(new CustomEvent('mn:canister-inventory-changed', { detail: { items } }));
}
export async function loadCanisterInventory() {
  if (provider) return canisterItems(await provider.load());
  return cached;
}
export async function useInventoryCanister(id) {
  if (!provider) throw Error('Дождитесь загрузки карты.');
  return provider.use(id);
}
export function planCanisterPour(snapshot, canisterId, actor, cityId, position) {
  const c = snapshot.canisters?.find(c => c.id === canisterId);
  if (!c) throw Error('Канистра недоступна. Обновите инвентарь.');
  if (Number(c.liters) <= 0) throw Error('Канистра пуста. Наполните её на АЗС.');
  const car = snapshot.vehicles.filter(v => v.owner_id === actor && v.city_id === cityId && !v.transit_ready)
    .map(v => ({ v, distance: Math.hypot(Number(v.x) - position.x, Number(v.y) - position.y) }))
    .filter(v => v.distance <= 2).sort((a,b) => a.distance - b.distance)[0]?.v;
  if (!car) throw Error('Подойдите к своей машине, чтобы заправить её из канистры.');
  const model = snapshot.models.find(m => m.id === car.model);
  if (model?.fuel_type !== c.fuel_type) throw Error('Топливо в канистре не подходит ближайшей машине.');
  const liters = Math.floor((Math.min(Number(c.liters), Number(model.tank) - Number(car.fuel)) + 1e-8) * 100) / 100;
  if (liters < 0.01) throw Error('Бак ближайшей машины уже полный.');
  return { vehicle: car.id, canister: c.id, liters, x: position.x, y: position.y };
}
