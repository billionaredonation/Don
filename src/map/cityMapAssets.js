// Единый реестр ресурсов городских карт. В исходниках игры нет путей к корневым PNG.
// Vite встраивает URL найденных ресурсов в сборку. Для нового города достаточно
// добавить src/assets/maps/<city-id>/map.svg (либо .webp/.png) и пересобрать проект.
const ASSETS = import.meta.glob('../assets/maps/**/*.{svg,avif,webp,png,jpg,jpeg}', {
  eager: true, query: '?url', import: 'default',
});
const PREFIX = '../assets/maps/';
const PRIORITY = ['svg', 'avif', 'webp', 'png', 'jpg', 'jpeg'];
const LEGACY_NAMES = {
  "VinitsaMap.png": "vinnytsia/map.png",
  "LutskMap.png": "lutsk/map.png",
  "LuganskMap.png": "luhansk/map.png",
  "DneprMap.png": "dnipro/map.png",
  "DonetskMap.png": "donetsk/map.png",
  "ZutomyrMap.png": "zhytomyr/map.png",
  "UzgorodMap.png": "uzhhorod/map.png",
  "Zaporozya.png": "zaporizhzhia/map.png",
  "IvanoFrankovsk.png": "ivano-frankivsk/map.png",
  "KiyvMap.png": "kyiv/map.png",
  "Kropivnitskyi.png": "kropyvnytskyi/map.png",
  "KrymMap.png": "crimea/map.png",
  "Lviv.png": "lviv/map.png",
  "Nikolaev.png": "mykolaiv/map.png",
  "Odessa.png": "odesa/map.png",
  "Poltava.png": "poltava/map.png",
  "Rovno.png": "rivne/map.png",
  "Sumy.png": "sumy/map.png",
  "Ternopil.png": "ternopil/map.png",
  "Kharkiv.png": "kharkiv/map.png",
  "Kherson.png": "kherson/map.png",
  "Khmelnitskiy.png": "khmelnytskyi/map.png",
  "CherkasyMap.png": "cherkasy/map.png",
  "ChernigovMap.png": "chernihiv/map.png",
  "ChernivtsiMap.png": "chernivtsi/map.png",
  "UkraineMap.png": "ukraine/map.png",
  "Zaporozya-roads.png": "zaporizhzhia/roads.png",
  "Zaporozya-water-mask.png": "zaporizhzhia/water-mask.png"
};
const URL_SET = new Set(Object.values(ASSETS));
export function isMapAssetUrl(url) { return URL_SET.has(url); }
export function getCityMapAsset(cityId, kind = 'map') {
  const name = String(cityId || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  for (const ext of PRIORITY) {
    const url = ASSETS[`${PREFIX}${name}/${kind}.${ext}`];
    if (url) return url;
  }
  return null;
}
export function getCityMapUrl(cityId) {
  return getCityMapAsset(cityId) || getCityMapAsset('ukraine');
}
export function getCityRoadsUrl(cityId) {
  return getCityMapAsset(cityId, 'roads');
}
export function getCityWaterZonesUrl(cityId) {
  return getCityMapAsset(cityId, 'water-zones');
}
// Только адаптер для старых сохранённых имён. Новые модули работают по cityId.
export function resolveLegacyMapName(value) {
  const basename = String(value || '').split('?')[0].replace(/\\/g, '/').split('/').pop();
  const mapped = LEGACY_NAMES[basename];
  return mapped ? ASSETS[PREFIX + mapped] || null : null;
}
