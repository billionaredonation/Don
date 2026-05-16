export function createPlayerMarkerHtml(player, localPlayerId) {
  const isSelf = player.playerId === localPlayerId;
  const updatedAt = Date.now();
  const angle = Number(player.angle || player.direction || 0);

  return `
    <div
      class="gta-player-marker ${isSelf ? 'gta-player-marker-self' : 'gta-player-marker-other'}"
      style="left: ${player.x}%; top: ${player.y}%; --player-angle: ${angle}deg;"
      data-player-id="${player.playerId}"
      data-updated-at="${updatedAt}"
      data-x="${player.x}"
      data-y="${player.y}"
      data-angle="${angle}"
    >
      <span class="gta-player-lidar"></span>
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

  const angle = Number(player.angle || player.direction || marker.dataset.angle || 0);

  marker.dataset.angle = String(angle);
  marker.style.setProperty('--player-angle', `${angle}deg`);
}
