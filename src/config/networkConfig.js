export const NETWORK_CONFIG = {
  movement: {
    broadcastInterval: 50,
    dbSaveInterval: 1200,

    // Presence / online
    heartbeatDelay: 1500,
    presenceHeartbeatInterval: 4000,
    onlineTtlMs: 18000,

    staleAfter: 18000,
    staleCheckInterval: 2000,

    // Для снимка из БД даём запас, потому что updated_at сейчас
    // пишет клиент. Жёсткие 3-18 секунд ломали видимость при рассинхроне часов.
    snapshotPlayerMaxAgeMs: 120000,

    remoteSmoothing: 0.16,
    remoteSnapDistance: 18,
    remoteIdleThreshold: 0.03,
  },

  limits: {
    maxCityPlayers: 50,
  },

  channels: {
    cityPlayersPrefix: 'city_players',
    cityMovementPrefix: 'city_movement',
  },
};
