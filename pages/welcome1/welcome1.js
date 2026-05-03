import { register, show } from '../../src/router.js';

register('welcome1', (root) => {
  root.className = 'page welcome1';

  root.innerHTML = `
    <div class="welcome-bg"></div>

    <section class="welcome-card welcome1-card">
      <div class="welcome-logo">MN</div>

      <p class="welcome-step">СТАРТ ГРИ</p>

      <h1 class="welcome-title">MN RPG</h1>

      <p class="welcome-subtitle">
        Живи, працюй та розвивайся у світі міст України.
      </p>

      <div class="welcome1-info">
        <p>Онлайн скоро відкриється.</p>
        <p>Почни раніше за інших.</p>
      </div>

      <div class="welcome-actions">
        <button class="welcome-btn" id="nextBtn" type="button">
          Далі
        </button>
      </div>
    </section>
  `;

  root.querySelector('#nextBtn').addEventListener('click', () => {
    show('welcome2');
  });
});

