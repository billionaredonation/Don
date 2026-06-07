function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getSafePlayerId(player) {
  return String(
    player?.playerId ||
    player?.player_id ||
    player?.id ||
    ''
  );
}

function getSafeNickname(player) {
  return String(
    player?.nickname ||
    player?.name ||
    'Игрок'
  ).trim();
}

function isSameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function isLocalDuplicate(player, localPlayerId, localNickname) {
  const playerId = getSafePlayerId(player);
  const nickname = getSafeNickname(player);

  if (playerId && String(playerId) === String(localPlayerId || '')) {
    return false;
  }

  /*
    Если в БД остался старый player_id, но ник тот же,
    это твой же старый двойник. Его не рисуем.
  */
  if (localNickname && nickname && isSameText(nickname, localNickname)) {
    return true;
  }

  return false;
}

function normalizePlayersForRender(players = [], localPlayerId, localNickname) {
  const result = [];
  const seenIds = new Set();
  const seenNicknames = new Set();

  let selfPlayer = null;

  for (const player of players || []) {
    if (!player || player.isOnline === false) continue;

    const playerId = getSafePlayerId(player);
    const nickname = getSafeNickname(player);

    if (!playerId) continue;

    if (String(playerId) === String(localPlayerId || '')) {
      selfPlayer = {
        ...player,
        playerId: localPlayerId,
        nickname: localNickname || nickname || 'Игрок',
      };

      continue;
    }

    if (isLocalDuplicate(player, localPlayerId, localNickname)) {
      continue;
    }

    const idKey = String(playerId);
    const nicknameKey = nickname.toLowerCase();

    if (seenIds.has(idKey)) continue;
    if (nicknameKey && seenNicknames.has(nicknameKey)) continue;

    seenIds.add(idKey);

    if (nicknameKey) {
      seenNicknames.add(nicknameKey);
    }

    result.push(player);
  }

  if (selfPlayer) {
    return [selfPlayer, ...result];
  }

  return result;
}

export function createPlayerMarkerHtml(player, localPlayerId) {
  const playerId = getSafePlayerId(player);
  const localId = String(localPlayerId || '');

  const isSelf = playerId === localId;

  const x = Number(player?.x ?? 50);
  const y = Number(player?.y ?? 50);

  const angle = Number(
    player?.angle ??
    player?.direction ??
    0
  );

  const nickname = getSafeNickname(player);

  return `
    <div
      class="gta-player-marker ${isSelf ? 'gta-player-marker-self' : 'gta-player-marker-other'}"
      data-player-id="${escapeHtml(playerId)}"
      data-nickname="${escapeHtml(nickname)}"
      data-x="${Number.isFinite(x) ? x : 50}"
      data-y="${Number.isFinite(y) ? y : 50}"
      data-angle="${Number.isFinite(angle) ? angle : 0}"
      data-updated-at="${Date.now()}"
      style="
        left: ${Number.isFinite(x) ? x : 50}%;
        top: ${Number.isFinite(y) ? y : 50}%;
        --player-angle: ${Number.isFinite(angle) ? angle : 0}deg;
      "
    >
      <div class="gta-player-marker-dot"></div>
      <div class="gta-player-marker-name">${escapeHtml(nickname)}</div>
    </div>
  `;
}

export function renderPlayersHtml(players, localPlayerId, localNickname = '') {
  return normalizePlayersForRender(players, localPlayerId, localNickname)
    .map((player) => createPlayerMarkerHtml(player, localPlayerId))
    .join('');
}

export function updatePlayerMarkerView(marker, player) {
  if (!marker || !player) return;

  const x = Number(player.x ?? marker.dataset.x ?? 50);
  const y = Number(player.y ?? marker.dataset.y ?? 50);

  marker.dataset.x = String(Number.isFinite(x) ? x : 50);
  marker.dataset.y = String(Number.isFinite(y) ? y : 50);

  marker.style.left = `${Number.isFinite(x) ? x : 50}%`;
  marker.style.top = `${Number.isFinite(y) ? y : 50}%`;

  const angle = Number(
    player.angle ??
    player.direction ??
    marker.dataset.angle ??
    0
  );

  const safeAngle = Number.isFinite(angle) ? angle : 0;

  marker.dataset.angle = String(safeAngle);
  marker.style.setProperty('--player-angle', `${safeAngle}deg`);

  const nickname = getSafeNickname(player);
  marker.dataset.nickname = nickname;
  marker.dataset.updatedAt = String(Date.now());

  const name = marker.querySelector('.gta-player-marker-name');

  if (name) {
    name.textContent = nickname;
  }
}
