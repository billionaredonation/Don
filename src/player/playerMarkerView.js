export function createPlayerMarkerHtml(player, localPlayerId) {
  const isSelf = player.playerId === localPlayerId;
  const updatedAt = Date.now();

  return `
    <div
      class="gta-player-marker ${isSelf ? 'gta-player-marker-self' : 'gta-player-marker-other'}"
      style="left: ${player.x}%; top: ${player.y}%;"
      data-player-id="${player.playerId}"
      data-updated-at="${updatedAt}"
      data-x="${player.x}"
      data-y="${player.y}"
    >
      <span class="gta-player-marker-dot"></span>
      <b class="gta-player-marker-name">${player.nickname || 'Игрок'}</b>
    </div>
  `;
}

export function renderPlayersHtml(players, localPlayerId) {
  return players
    .filter((player) => player?.isOnline !== false)
    .map((player) => createPlayerMarkerHtml(player, localPlayerId))
    .join('');
}

export function updatePlayerMarkerView(marker, player) {
  if (!marker || !player) return;

  const name = marker.querySelector('.gta-player-marker-name');

  if (name) {
    name.textContent = player.nickname || 'Игрок';
  }
}
