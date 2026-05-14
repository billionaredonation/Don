export const NETWORK_CONFIG = {
  movement: {
    broadcastInterval: 25,
    dbSaveInterval: 1200,
    heartbeatDelay: 1000,
    staleAfter: 5000,
  },

  limits: {
    maxCityPlayers: 50,
  },

  channels: {
    cityPlayersPrefix: 'city_players',
    cityMovementPrefix: 'city_movement',
  },
};
