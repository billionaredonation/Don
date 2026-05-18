import { register, show } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { loginByNickname, getAuthPlayer } from '../../src/auth/playerAuth.js';

register('auth', (root) => {
  root._cleanupHome?.();

  const currentAuth = getAuthPlayer();

  if (currentAuth?.nickname) {
    state.nickname = currentAuth.nickname;
    save();
    show('home');
    return;
  }

  root.className = 'page auth-page';

  root.innerHTML = `
    <main class="auth-screen">
      <section class="auth-card">
        <h1>Вход в игру</h1>

        <p>
          Введи ник, который уже зарегистрирован в системе.
        </p>

        <form class="auth-form">
          <input
            class="auth-input"
            name="nickname"
            type="text"
            placeholder="Например: Donation"
            autocomplete="nickname"
            required
          />

          <button class="auth-button" type="submit">
            Войти
          </button>
        </form>

        <div class="auth-error" hidden></div>
      </section>
    </main>
  `;

  const form = root.querySelector('.auth-form');
  const input = root.querySelector('.auth-input');
  const errorBox = root.querySelector('.auth-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    errorBox.hidden = true;
    errorBox.textContent = '';

    const nickname = input.value;

    try {
      const authPlayer = await loginByNickname(nickname);

      state.nickname = authPlayer.nickname;
      save();

      show('home');
    } catch (error) {
      errorBox.textContent = error.message || 'Ошибка входа';
      errorBox.hidden = false;
    }
  });
});
