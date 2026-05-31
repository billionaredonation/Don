export function getHouseActionType(object) {
  if (object?.payload?.ownerId) return 'info';
  if (object?.payload?.locked) return 'locked';
  return 'buy';
}

export function handleHouseAction(object) {
  if (!object) return;

  window.dispatchEvent(new CustomEvent('mn:house-selected', {
    detail: {
      house: object,
      action: getHouseActionType(object),
    },
  }));
}
