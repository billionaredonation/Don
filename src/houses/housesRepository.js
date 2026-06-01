import { supabase } from '../supabaseClient.js';

export async function fetchCityHousesState(cityId) {
  const dbCityId = Number(cityId);

  const { data, error } = await supabase
    .from('houses')
    .select('*')
    .eq('city_id', dbCityId)
    .order('id');

  if (error) throw error;

  const houses = data || [];
  const housesFree = houses.filter((house) => !house.owner_id);
  const housesOwned = houses.filter((house) => Boolean(house.owner_id));

  return {
    houses,
    housesTotal: houses.length,
    housesFree: housesFree.length,
    housesOwned: housesOwned.length,
  };
}

export async function buyHouseFromState({ houseId, playerId }) {
  const { data, error } = await supabase.rpc('buy_house_from_state', {
    p_house_id: Number(houseId),
    p_player_id: Number(playerId),
  });

  if (error) {
    console.error('[houses] buyHouseFromState failed:', error);
    throw error;
  }

  return data;
}
