export const NETWORK_CONFIG = {
  movement: {
    /*
      Базовый профиль стал мягче.
      Главная причина микрофризов на телефоне — периодические Supabase-запросы
      каждые 1.5–3 сек. Для Telegram WebView это слишком часто.
    */
    broadcastInterval: 90,
    dbSaveInterval: 10000,

    // Presence / online
    heartbeatDelay: 9000,
    presenceHeartbeatInterval: 12000,
    onlineTtlMs: 45000,

    staleAfter: 60000,
    staleCheckInterval: 9000,

    // Для снимка из БД даём запас, потому что updated_at сейчас
    // пишет клиент. Жёсткие 3-18 секунд ломали видимость при рассинхроне часов.
    snapshotPlayerMaxAgeMs: 90000,
    snapshotRefreshInterval: 14000,
    idleSnapshotRefreshInterval: 22000,

    remoteSmoothing: 0.18,
    remoteSnapDistance: 18,
    remoteIdleThreshold: 0.03,

    mobile: {
      broadcastInterval: 120,
      dbSaveInterval: 12000,
      hardDbSaveInterval: 22000,
      heartbeatDelay: 9000,
      presenceHeartbeatInterval: 12000,
      staleCheckInterval: 9000,
      snapshotRefreshInterval: 14000,
      idleSnapshotRefreshInterval: 22000,
      snapshotPlayerMaxAgeMs: 90000,
      maxNearbyPlayers: 10,
      disablePostgresRealtime: true,
    },
  },

  limits: {
    maxCityPlayers: 50,
  },

  channels: {
    cityPlayersPrefix: 'city_players',
    cityMovementPrefix: 'city_movement',
  },
};
