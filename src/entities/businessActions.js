export function handleBusinessAction(object) {
  if (!object) return;

  window.dispatchEvent(new CustomEvent('mn:business-selected', {
    detail: {
      business: object,
      action: getBusinessActionType(object),
    },
  }));
}

export function getBusinessActionType(object) {
  if (object?.owner_id || object?.ownerId || object?.payload?.ownerId || object?.payload?.owner_id) return 'info';
  if (object?.payload?.locked) return 'locked';
  return 'buy';
}
