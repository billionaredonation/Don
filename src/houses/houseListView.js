export function renderHouseList(houses = []) {
  if (!houses.length) return '<p>В этом городе пока нет домов.</p>';

  return `
    <ul class="house-list">
      ${houses
        .map(
          (h) => `
        <li class="${h.owner_id ? 'house-owned' : 'house-free'}">
          <span>${h.class.toUpperCase()}</span>
          <b>${h.price.toLocaleString('ru-RU')} ₴</b>
        </li>`
        )
        .join('')}
    </ul>
  `;
}
