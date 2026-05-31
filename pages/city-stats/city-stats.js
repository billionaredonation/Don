import { register } from '../../src/router.js';
import { getCityConfig } from '../../src/cities/index.js';
import { fetchCityStats } from '../../src/api/cityStats.js';

const IMG_V = '1';                              // cache-bust для карт

function pct(free, total) {
  return total ? Math.round((free / total) * 100) : 0;
}

register('/city/:slug/stats', async (root, { slug }) => {
  root.className = 'page city-stats';
  root.textContent = 'Загрузка…';

  const city = getCityConfig(slug);

  if (!city) {
    root.textContent = `Город «${slug}» не найден`;
    return;
  }

  try {
    const s = await fetchCityStats(city.id);

    root.innerHTML = `
      <header class="city-header">
        <h1>${city.name}</h1>
        <p>${city.tagline}</p>
      </header>

      <section class="city-counters">
        <h2>🏠 Дома</h2>
        <p>
          Свободно <b>${s.houses_free}</b> из ${s.houses_total}
          (${pct(s.houses_free, s.houses_total)} %)
        </p>

        <h2>🏭 Бизнесы</h2>
        <p>
          Свободно <b>${s.biz_free}</b> из ${s.biz_total}
          (${pct(s.biz_free, s.biz_total)} %)
        </p>
      </section>

      <section class="city-details">
        <h2>Работы</h2>
        <ul>
          ${city.jobs
            .map(
              (j) =>
                `<li><b>${j.title}</b> — ${j.pay} грн <small>${j.description}</small></li>`
            )
            .join('')}
        </ul>

        <h2>Жильё</h2>
        <p>
          <b>${city.housing.title}</b> от ${city.housing.minPrice} грн.<br>
          ${city.housing.description}<br>
          ${city.housing.bonus}
        </p>
      </section>

      <img class="city-map" src="${city.map}?v=${IMG_V}" alt="${city.name}" />
    `;
  } catch (e) {
    root.innerHTML = `<p class="error">${e.message}</p>`;
  }
});
