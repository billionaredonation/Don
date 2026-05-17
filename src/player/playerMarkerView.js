export function createPlayerMarkerHtml(player, localPlayerId) {
  const isSelf = player.playerId === localPlayerId;
  const updatedAt = Date.now();
  const angle = Number(player.angle || player.direction || 0);

  return `
    <div
      class="gta-player-marker ${isSelf ? 'gta-player-marker-self' : 'gta-player-marker-other'}"
      data-player-id="${player.playerId}"
      data-x="${Number(player.x || 50)}"
      data-y="${Number(player.y || 50)}"
      data-updated-at="${updatedAt}"
      data-angle="${angle}"
      style="
        left: ${Number(player.x || 50)}%;
        top: ${Number(player.y || 50)}%;
        --player-angle: ${angle}deg;
      "
    >
      <div class="gta-player-dot"></div>

      <div
        class="gta-player-marker-name"
        style="${isSelf ? 'display:none;' : ''}"
      >
        ${player.nickname || 'Игрок'}
      </div>
    </div>
  `;
}

export function renderPlayersHtml(players, localPlayerId) {
  return players
    .filter((player) => player?.isOnline !== false)
    .map((player) => createPlayerMarkerHtml(player, localPlayerId))
    .join('');
}

export function updatePlayerMarkerView(marker, player, localPlayerId) {
  if (!marker || !player) return;

  const isSelf =
    player.playerId === localPlayerId;

  const name = marker.querySelector(
    '.gta-player-marker-name'
  );

  if (name) {
    name.style.display = isSelf
      ? 'none'
      : '';

    name.textContent =
      player.nickname || 'Игрок';
  }

  const angle = Number(
    player.angle ||
    player.direction ||
    marker.dataset.angle ||
    0
  );

  marker.dataset.angle = String(angle);

  marker.style.setProperty(
    '--player-angle',
    `${angle}deg`
  );
}
