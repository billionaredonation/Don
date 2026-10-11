export function getPublicBusinessId(value = {}) {
  const payload = value?.payload && typeof value.payload === 'object' ? value.payload : {};
  const candidates = [value?.publicBusinessId, value?.public_business_id,
    payload.publicBusinessId, payload.public_business_id,
    value?.publicId, value?.public_id, payload.publicId, payload.public_id];
  return candidates.map(v => String(v ?? '').trim()).find(v => v && v !== '—') || '—';
}

export function renderPublicBusinessId(container, object) {
  if (!container) return;
  let box = container.querySelector('[data-public-business-identity]');
  if (!box) {
    box = document.createElement('div');
    box.dataset.publicBusinessIdentity = '1';
    box.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 16px;border-bottom:1px solid #385342;color:#e5eee8;font:13px/1.4 system-ui;background:#15251c';
    const header = container.querySelector('header');
    if (header) header.after(box);
    else container.prepend(box);
  }
  box.replaceChildren();
  const id = getPublicBusinessId(object);
  const label = document.createElement('span');
  label.textContent = id === '—' ? 'Публичный ID не назначен — подключение ЖКХ по номеру недоступно.' : `Публичный ID для ЖКХ: ${id}`;
  box.appendChild(label);
  if (id === '—') return;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Скопировать';
  button.style.cssText = 'padding:5px 10px;border:1px solid #62826b;border-radius:6px;background:#243a2b;color:#fff;cursor:pointer';
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(id);
      button.textContent = 'Скопировано';
    } catch {
      window.prompt('Скопируйте публичный ID для подключения ЖКХ:', id);
    }
  };
  box.appendChild(button);
}
