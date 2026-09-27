// Temporary, local-only diagnostic export. Never includes auth/session payloads.
export function enableBalanceDiagnostics({ root, getTrace }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Журнал баланса';
  button.style.cssText = 'position:fixed;left:12px;bottom:150px;z-index:10000;padding:8px 12px;border:1px solid #36bcea;border-radius:10px;background:#102331;color:white;font:13px sans-serif;pointer-events:auto';
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'width:min(620px,85vw);max-height:80vh;background:#102331;color:white;border:1px solid #36bcea;border-radius:14px;padding:20px;pointer-events:auto';
  dialog.innerHTML = `<h3>Журнал баланса</h3><p>После скачка скачайте журнал или скопируйте текст и отправьте в чат.</p><textarea readonly aria-label="Журнал баланса" style="width:100%;height:35vh;box-sizing:border-box;background:#061621;color:white"></textarea><p data-status role="status"></p><button type="button" data-download>Скачать JSON</button> <button type="button" data-copy>Копировать</button> <button type="button" data-close>Закрыть</button>`;
  const area = dialog.querySelector('textarea'), status = dialog.querySelector('[data-status]');
  const urls = new Set();
  button.onclick = (event) => {
    event.stopPropagation();
    const entries = getTrace();
    area.value = JSON.stringify({ version: 'balance-single-source-2', exportedAt: new Date().toISOString(), entries }, null, 2);
    status.textContent = `Записей: ${entries.length}. Журнал фиксируется на момент открытия этого окна.`;
    if (!dialog.open) dialog.showModal();
  };
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('click', event => event.stopPropagation());
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(area.value); status.textContent = 'Скопировано. Вставьте текст в чат.'; }
    catch { area.focus(); area.select(); status.textContent = 'Нажмите Ctrl+C, затем вставьте текст в чат.'; }
  };
  dialog.querySelector('[data-download]').onclick = () => {
    const url = URL.createObjectURL(new Blob([area.value], { type: 'application/json' }));
    urls.add(url);
    const link = document.createElement('a');
    link.href = url; link.download = 'MN-Game-balance-log.json';
    dialog.append(link); link.click(); link.remove();
    status.textContent = 'Если Telegram не сохранил файл, нажмите «Копировать».';
  };
  root.append(button, dialog);
  return () => { button.remove(); dialog.remove(); for (const url of urls) URL.revokeObjectURL(url); };
}
