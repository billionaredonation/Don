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

    remoteSmoothing: 0.16,
    remoteSnapDistance: 18,
    remoteIdleThreshold: 0.03,
    remotePacketMaxAge: 3500,
  },

  limits: {
    maxCityPlayers: 50,
  },

  channels: {
    cityPlayersPrefix: 'city_players',
    cityMovementPrefix: 'city_movement',
  },
};
