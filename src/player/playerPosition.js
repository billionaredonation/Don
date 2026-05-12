import { supabase } from '../supabaseClient.js';
import { getRandomSpawnPoint } from '../spawn/spawnPoints.js';

const PLAYER_ID_KEY = 'mn_player_id';

function createLocalPlayerId() {
  return `player_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getLocalPlayerId() {
  let playerId = localStorage.getItem(PLAYER_ID_KEY);

  if (!playerId) {
    playerId = createLocalPlayerId();
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  }

  return playerId;
}

function normalizePosition(row) {
  return {
    playerId: row.player_id,
    nickname: row.nickname,
    cityId: row.city_id,
    x: Number(row.x),
    y: Number(row.y),
    updatedAt: row.updated_at,
  };
}

export async function getOrCreatePlayerPosition(cityId, nickname) {
  const playerId = getLocalPlayerId();

  const { data: currentPosition, error: selectError } = await supabase
    .from('player_positions')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();

  if (!selectError && currentPosition && currentPosition.city_id === cityId) {
    return normalizePosition(currentPosition);
  }

  const spawn = getRandomSpawnPoint(cityId);

  const nextPosition = {
    player_id: playerId,
    nickname: nickname || 'Игрок',
    city_id: cityId,
    x: spawn.x,
    y: spawn.y,
    updated_at: new Date().toISOString(),
  };

  const { data: savedPosition, error: upsertError } = await supabase
    .from('player_positions')
    .upsert(nextPosition, {
      onConflict: 'player_id',
    })
    .select('*')
    .single();

  if (upsertError) {
    console.warn('[playerPosition] upsert failed:', upsertError);

    return {
      playerId,
      nickname: nickname || 'Игрок',
      cityId,
      x: spawn.x,
      y: spawn.y,
      updatedAt: new Date().toISOString(),
    };
  }

  return normalizePosition(savedPosition);
}


export async function updatePlayerPosition({ cityId, nickname, x, y }) {
  const playerId = getLocalPlayerId();

  const nextPosition = {
    player_id: playerId,
    nickname: nickname || 'Игрок',
    city_id: cityId,
    x,
    y,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('player_positions')
    .upsert(nextPosition, {
      onConflict: 'player_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return normalizePosition(data);
}
