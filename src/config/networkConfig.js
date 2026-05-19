export const NETWORK_CONFIG = {
  movement: {
    broadcastInterval: 50,
    dbSaveInterval: 1200,
    heartbeatDelay: 1500,

    staleAfter: 12000,
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
