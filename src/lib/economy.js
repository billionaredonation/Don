const clamp = (v) => +(Math.max(0, Math.min(v || 0, 50)).toFixed(1));

export const getInflation = ({ moneySupply, gdp }) => {
  const delta = moneySupply && moneySupply.delta ? moneySupply.delta : 0;
  const gdpValue = gdp && gdp.value ? gdp.value : 1;

  return clamp(100 * (delta / gdpValue));
};

export const getDevaluation = ({ reserves, tradeBalance }) =>
  clamp(100 * (-(tradeBalance || 0) / (reserves || 1)));

export const getStateAssetsShare = ({ stateAssets, totalAssets }) =>
  clamp(100 * ((stateAssets || 0) / (totalAssets || 1)));
