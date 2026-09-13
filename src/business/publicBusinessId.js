export function getPublicBusinessId(value = {}) {
  const payload = value?.payload && typeof value.payload === 'object' ? value.payload : {};
  const raw = value?.publicBusinessId
    || value?.public_business_id
    || payload.publicBusinessId
    || payload.public_business_id
    || '';
  return String(raw).trim() || '—';
}
