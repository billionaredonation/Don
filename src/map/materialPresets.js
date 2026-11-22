/** Visual materials only. Gameplay rules and fauna belong to a separate simulation. */
export const MATERIAL_PRESETS = Object.freeze({
  water: Object.freeze({ color: [0.035, 0.29, 0.42], waveSpeed: 0.8, rippleStrength: 0.7, opacity: 1 }),
  acid: Object.freeze({ color: [0.20, 0.42, 0.025], waveSpeed: 0.65, rippleStrength: 1.0, opacity: 1 }),
  lava: Object.freeze({ color: [0.53, 0.10, 0.012], waveSpeed: 0.25, rippleStrength: 1.5, opacity: 1 }),
});

export function resolveMaterialPreset(value = 'water') {
  const name = typeof value === 'string' ? value : 'water';
  return MATERIAL_PRESETS[name] || MATERIAL_PRESETS.water;
}

