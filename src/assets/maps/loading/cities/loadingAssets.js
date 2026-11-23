// Centralised Vite loader for MN-Game preloading artwork.
// Add src/assets/loading/cities/<city-id>/1.webp etc. No JS changes needed.
const IMAGES = import.meta.glob('./**/*.{webp,avif,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const FORMAT_PRIORITY = ['avif', 'webp', 'png', 'jpg', 'jpeg', 'svg'];

function resolveFrame(folder, frame) {
  if (!/^(?:default|cities\/[a-z0-9-]+)$/.test(folder)) return null;
  if (!Number.isInteger(frame) || frame < 1 || frame > 99) return null;
  for (const ext of FORMAT_PRIORITY) {
    const url = IMAGES[`./${folder}/${frame}.${ext}`];
    if (url) return url;
  }
  return null;
}

function listFrames(folder, count = 3) {
  const result = [];
  for (let i = 1; i <= count; i += 1) {
    const url = resolveFrame(folder, i);
    if (url) result.push(url);
  }
  return result;
}

export function getCityLoadingImages(cityId, count = 3) {
  const id = String(cityId || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(id)) return [];
  return listFrames(`cities/${id}`, count);
}

export function getDefaultLoadingImages(count = 3) {
  return listFrames('default', count);
}
