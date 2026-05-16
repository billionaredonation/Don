export const NETWORK_CONFIG = {
  movement: {
    broadcastInterval: 25,
    dbSaveInterval: 1500,
    heartbeatDelay: 1000,

    staleAfter: 10000,
    staleCheckInterval: 2000,

    remoteSmoothing: 0.28,
    remoteSnapDistance: 35,
    remoteIdleThreshold: 0.12,
  },

  limits: {
    maxCityPlayers: 50,
  },

  channels: {
    cityPlayersPrefix: 'city_players',
    cityMovementPrefix: 'city_movement',
  },
};
