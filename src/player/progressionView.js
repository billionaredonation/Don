// Pure view model: never derives server XP from client activity or money.
export function progressionView(progress) {
  if (!progress || progress.version !== 2) return null;
  const level = Math.max(1, Math.min(78, Math.floor(Number(progress.level) || 1)));
  const xp = Math.max(0, Number(progress.xp) || 0);
  const start = Math.max(0, Number(progress.levelStartXp) || 0);
  const next = progress.nextLevelXp == null ? null : Number(progress.nextLevelXp);
  const dailyCap = Math.max(0, Number(progress.dailyCap) || 0);
  const earnedToday = Math.min(dailyCap, Math.max(0, Number(progress.earnedToday) || 0));
  return {
    level, xp, start, next, dailyCap, earnedToday,
    percent: level === 78 ? 100 : next > start ? Math.max(0, Math.min(100, (xp-start)/(next-start)*100)) : 0,
    remaining: next == null ? 0 : Math.max(0,next-xp),
    canOwnCar: progress.canOwnCar === true,
    sources: Array.isArray(progress.sources) ? progress.sources.map(String) : [],
  };
}
