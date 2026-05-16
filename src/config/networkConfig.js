export const NETWORK_CONFIG = {
  movement: {
    broadcastInterval: 25,
    dbSaveInterval: 1500,
    heartbeatDelay: 1000,

    staleAfter: 8000,
    staleCheckInterval: 1500,

    remoteSmoothing: 0.28,
    remoteSnapDistance: 35,
  },

  limits: {
    maxCityPlayers: 50,
  },

  channels: {
    cityPlayersPrefix: 'city_players',
    cityMovementPrefix: 'city_movement',
  },
};
