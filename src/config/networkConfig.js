export const NETWORK_CONFIG = {
  movement: {
    broadcastInterval: 35,
    dbSaveInterval: 1500,
    heartbeatDelay: 1000,

    staleAfter: 10000,
    staleCheckInterval: 2000,

    remoteSmoothing: 0.18,
    remoteSnapDistance: 45,
    remoteIdleThreshold: 0.35,
  },

  limits: {
    maxCityPlayers: 50,
  },

  channels: {
    cityPlayersPrefix: 'city_players',
    cityMovementPrefix: 'city_movement',
  },
};
