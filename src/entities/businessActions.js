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
  if (object?.payload?.ownerId) return 'info';
  if (object?.payload?.locked) return 'locked';
  return 'buy';
}
