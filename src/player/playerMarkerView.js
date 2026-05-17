function getSafePlayerId(player) {
  return String(
    player?.playerId ||
    player?.player_id ||
    player?.id ||
    ''
  );
}

function getSafeNickname(player) {
  return (
    player?.nickname ||
    player?.name ||
    'Игрок'
  );
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
      data-player-id="${playerId}"
      data-x="${x}"
      data-y="${y}"
      data-angle="${angle}"
      style="
        left: ${x}%;
        top: ${y}%;
        --player-angle: ${angle}deg;
      "
    >
      <div class="gta-player-marker-dot"></div>
      <div class="gta-player-marker-name">${nickname}</div>
    </div>
  `;
}

export function renderPlayersHtml(players, localPlayerId) {
  return (players || [])
    .filter((player) => player?.isOnline !== false)
    .map((player) => createPlayerMarkerHtml(player, localPlayerId))
    .join('');
}

export function updatePlayerMarkerView(marker, player) {
  if (!marker || !player) return;

  const x = Number(player.x ?? marker.dataset.x ?? 50);
  const y = Number(player.y ?? marker.dataset.y ?? 50);

  marker.dataset.x = String(x);
  marker.dataset.y = String(y);

  marker.style.left = `${x}%`;
  marker.style.top = `${y}%`;

  const angle = Number(
    player.angle ??
    player.direction ??
    marker.dataset.angle ??
    0
  );

  marker.dataset.angle = String(angle);
  marker.style.setProperty('--player-angle', `${angle}deg`);

  const name = marker.querySelector('.gta-player-marker-name');

  if (name) {
    name.textContent = getSafeNickname(player);
  }
}
