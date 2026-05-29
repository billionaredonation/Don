function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getObjectCategory(object) {
  return object?.category || object?.payload?.kind || object?.type || 'marker';
}

function getObjectLabel(object) {
  return object?.name || object?.type || 'Объект';
}

export function createAdminObjectList({
  listEl,
  filterEl,
  searchEl,
  getObjects,
  getSelectedObjectId,
  onSelect,
}) {
  if (!listEl || !getObjects || !getSelectedObjectId || !onSelect) return null;

  function getFilteredObjects() {
    const objects = Array.isArray(getObjects()) ? getObjects() : [];
    const filterValue = filterEl?.value || 'all';
    const searchValue = String(searchEl?.value || '').trim().toLowerCase();

    return objects.filter((object) => {
      const category = getObjectCategory(object);
      const label = getObjectLabel(object).toLowerCase();
      const type = String(object?.type || '').toLowerCase();
      const id = String(object?.id || '').toLowerCase();

      const matchesFilter = filterValue === 'all' || category === filterValue;
      const matchesSearch =
        !searchValue ||
        label.includes(searchValue) ||
        type.includes(searchValue) ||
        id.includes(searchValue);

      return matchesFilter && matchesSearch;
    });
  }

  function render() {
    const objects = getFilteredObjects();
    const selectedObjectId = getSelectedObjectId();

    if (!objects.length) {
      listEl.innerHTML = '<div class="admin-object-empty">Объектов нет</div>';
      return;
    }

    listEl.innerHTML = objects
      .map((object, index) => {
        const id = String(object.id || '');
        const shortId = id.slice(-6) || String(index + 1);
        const selectedClass = String(selectedObjectId) === id ? ' is-selected' : '';
        const label = getObjectLabel(object);
        const category = getObjectCategory(object);

        return `
          <button
            class="admin-object-item${selectedClass}"
            type="button"
            data-admin-object-id="${escapeHtml(id)}"
            title="${escapeHtml(label)} #${escapeHtml(shortId)}"
          >
            <span>${escapeHtml(object.icon || '◆')} ${escapeHtml(label)}</span>
            <b>${escapeHtml(category)} · #${escapeHtml(shortId)}</b>
          </button>
        `;
      })
      .join('');
  }

  function onListClick(event) {
    const button = event.target.closest('[data-admin-object-id]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    onSelect(button.dataset.adminObjectId);
  }

  function onFilterChange() {
    render();
  }

  listEl.addEventListener('click', onListClick);
  filterEl?.addEventListener('change', onFilterChange);
  searchEl?.addEventListener('input', onFilterChange);

  render();

  return {
    render,
    cleanup() {
      listEl.removeEventListener('click', onListClick);
      filterEl?.removeEventListener('change', onFilterChange);
      searchEl?.removeEventListener('input', onFilterChange);
    },
  };
}
