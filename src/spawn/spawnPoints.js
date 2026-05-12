export const CITY_SPAWN_POINTS = {
  zaporizhzhia: [
    { x: 48, y: 52, type: 'center' },
    { x: 43, y: 47, type: 'station' },
    { x: 56, y: 58, type: 'district' },
  ],

  kyiv: [
    { x: 50, y: 50, type: 'center' },
    { x: 45, y: 55, type: 'station' },
    { x: 58, y: 46, type: 'district' },
  ],

  odesa: [
    { x: 52, y: 54, type: 'center' },
    { x: 47, y: 49, type: 'port' },
    { x: 60, y: 58, type: 'district' },
  ],

  kharkiv: [
    { x: 50, y: 50, type: 'center' },
    { x: 44, y: 52, type: 'station' },
    { x: 57, y: 45, type: 'district' },
  ],

  dnipro: [
    { x: 50, y: 52, type: 'center' },
    { x: 45, y: 48, type: 'station' },
    { x: 58, y: 57, type: 'district' },
  ],
};

const DEFAULT_SPAWNS = [
  { x: 50, y: 50, type: 'center' },
  { x: 46, y: 54, type: 'default' },
  { x: 55, y: 48, type: 'default' },
];

export function getSpawnPoints(cityId) {
  return CITY_SPAWN_POINTS[cityId] || DEFAULT_SPAWNS;
}

export function getRandomSpawnPoint(cityId) {
  const points = getSpawnPoints(cityId);
  return points[Math.floor(Math.random() * points.length)];
}
