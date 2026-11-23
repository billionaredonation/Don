// MN-Game loading assets: Vite compiles URLs for bundled files.
// New directory structure takes priority; legacy root images remain a fallback.
const NEW_IMAGES = import.meta.glob('./**/*.{png,webp,avif,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const OLD_IMAGES = import.meta.glob('../../../loading-*.{png,webp,avif,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const EXTENSIONS = ['webp', 'avif', 'svg', 'png', 'jpg', 'jpeg'];

function findImage(city, number) {
  const base = city ? `cities/${city}/${number}` : `default/${number}`;
  for (const ext of EXTENSIONS) {
    const found = NEW_IMAGES[`./${base}.${ext}`];
    if (found) return found;
  }
  const oldBase = city ? `loading-${city}-${number}` : `loading-${number}`;
  for (const ext of EXTENSIONS) {
    const found = OLD_IMAGES[`../../../${oldBase}.${ext}`];
    if (found) return found;
  }
  return null;
}

export function getDefaultLoadingImages() {
  return [1, 2].map(number => findImage(null, number)).filter(Boolean);
}

export function getCityLoadingImages(cityId) {
  const city = String(cityId || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(city)) return [];
  return [1, 2].map(number => findImage(city, number)).filter(Boolean);
}
