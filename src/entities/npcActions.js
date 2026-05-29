export function handleNpcAction(object) {
  if (!object) return;

  window.dispatchEvent(new CustomEvent('mn:npc-selected', {
    detail: {
      npc: object,
      action: 'talk',
    },
  }));
}
