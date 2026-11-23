// Central asset loader. Preferred: src/assets/loading/cities/<city>/1.webp.
// Compatibility: old loading-<city>-1.png files in repository root.
const IMAGES = import.meta.glob('./**/*.{webp,avif,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});
const LEGACY = import.meta.glob('../../../loading-*.{webp,avif,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});
const EXTENSIONS = ['avif', 'webp', 'png', 'jpg', 'jpeg', 'svg'];

function getFrame(folder, frame) {
  for (const ext of EXTENSIONS) {
    const found = IMAGES[`./${folder}/${frame}.${ext}`];
    if (found) return found;
  }
  const prefix = folder === 'default' ? 'loading' : `loading-${folder.slice(7)}`;
  for (const ext of EXTENSIONS) {
    const found = LEGACY[`../../../${prefix}-${frame}.${ext}`];
    if (found) return found;
  }
  return null;
}

function listFrames(folder, count) {
  const frames = [];
  const max = Math.min(99, Math.max(0, Math.floor(Number(count) || 0)));
  for (let index = 1; index <= max; index++) {
    const url = getFrame(folder, index);
    if (url) frames.push(url);
  }
  return frames;
}

export function getCityLoadingImages(cityId, count = 3) {
  const id = String(cityId || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(id)) return [];
  return listFrames(`cities/${id}`, count);
}

export function getDefaultLoadingImages(count = 3) {
  return listFrames('default', count);
}
