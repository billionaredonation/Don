const PLAYER_SKILLS_KEY = '__MN_PLAYER_SKILLS__';

const CROP_META = Object.freeze({
  apple: Object.freeze({ label: 'Яблоко', icon: '🍎', unlockLevel: 1 }),
  orange: Object.freeze({ label: 'Апельсин', icon: '🍊', unlockLevel: 2 }),
  wheat: Object.freeze({ label: 'Пшеница', icon: '🌾', unlockLevel: 3 }),
  corn: Object.freeze({ label: 'Кукуруза', icon: '🌽', unlockLevel: 4 }),
});

function normalizeLevel(value) {
  return Math.max(1, Math.min(5, Math.floor(Number(value) || 1)));
}

function normalizeSkill(skill = {}, fallback = {}) {
  const level = normalizeLevel(skill.level);
  return {
    ...fallback,
    ...skill,
    level,
    maxLevel: 5,
    xp: Math.max(0, Number(skill.xp) || 0),
    levelStartXp: Math.max(0, Number(skill.levelStartXp) || 0),
    nextLevelXp: skill.nextLevelXp == null ? null : Math.max(0, Number(skill.nextLevelXp) || 0),
    bonusPercent: Math.max(0, Number(skill.bonusPercent) || 0),
  };
}

function normalizeSnapshot(payload = {}) {
  const previous = window[PLAYER_SKILLS_KEY] || {};
  const farmer = normalizeSkill(payload?.skills?.farmer || previous?.skills?.farmer, {
    key: 'farmer', label: 'Фермер', icon: '👨‍🌾', description: 'Открывает новые культуры',
  });
  const running = normalizeSkill(payload?.skills?.running || previous?.skills?.running, {
    key: 'running', label: 'Бег', icon: '🏃', description: 'Снижает расход стамины и воды',
  });
  const sourceCrops = Array.isArray(payload.crops) ? payload.crops : previous.crops || [];
  const crops = Object.entries(CROP_META).map(([cropType, meta]) => {
    const source = sourceCrops.find((crop) => String(crop?.cropType || '') === cropType) || {};
    return normalizeSkill(source, {
      key: `crop_${cropType}`,
      cropType,
      itemType: `farm_${cropType}`,
      ...meta,
      unlocked: farmer.level >= meta.unlockLevel,
    });
  }).map((crop) => ({
    ...crop,
    unlocked: typeof crop.unlocked === 'boolean'
      ? crop.unlocked
      : farmer.level >= Number(crop.unlockLevel || 1),
  }));

  return {
    overallLevel: Math.max(1, Math.floor(Number(payload.overallLevel ?? previous.overallLevel) || 1)),
    skills: { farmer, running },
    crops,
    loaded: payload.loaded !== false,
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

export function getPlayerSkillsSnapshot() {
  if (!window[PLAYER_SKILLS_KEY]) {
    window[PLAYER_SKILLS_KEY] = normalizeSnapshot({ loaded: false });
  }
  return window[PLAYER_SKILLS_KEY];
}

export function publishPlayerSkills(result = {}, { levelUps = null } = {}) {
  const payload = result?.skills?.skills && Array.isArray(result?.skills?.crops)
    ? result.skills
    : result;
  const next = normalizeSnapshot(payload);
  window[PLAYER_SKILLS_KEY] = next;

  window.dispatchEvent(new CustomEvent('mn:player-skills-changed', {
    detail: { skills: next },
  }));

  const announcements = Array.isArray(levelUps)
    ? levelUps
    : Array.isArray(result?.levelUps)
      ? result.levelUps
      : [];
  announcements.forEach((levelUp) => {
    window.dispatchEvent(new CustomEvent('mn:player-skill-level-up', {
      detail: { ...levelUp, skills: next },
    }));
  });

  return next;
}

export function getCropSkillStatus(cropType) {
  const cleanType = String(cropType || '').trim().toLowerCase();
  const snapshot = getPlayerSkillsSnapshot();
  const crop = snapshot.crops.find((item) => item.cropType === cleanType);
  const meta = CROP_META[cleanType];
  if (crop) return snapshot.loaded === false ? { ...crop, unlocked: true, checking: true } : crop;
  return {
    cropType: cleanType,
    label: meta?.label || cleanType,
    icon: meta?.icon || '🌱',
    unlockLevel: meta?.unlockLevel || 1,
    unlocked: (snapshot.skills?.farmer?.level || 1) >= (meta?.unlockLevel || 1),
    level: 1,
  };
}

export function getRunningSkillModifiers() {
  const level = normalizeLevel(getPlayerSkillsSnapshot()?.skills?.running?.level);
  const reductionPercent = (level - 1) * 5;
  return {
    level,
    reductionPercent,
    staminaMultiplier: 1 - reductionPercent / 100,
    waterMultiplier: 1 - reductionPercent / 100,
  };
}
