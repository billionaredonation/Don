import { register, show } from '../../src/router.js';
import { state, save } from '../../src/state.js';

register('welcome2', (root) => {
  root.className = 'page welcome2';

  root.innerHTML = `
    <div class="welcome-bg"></div>

    <section class="welcome-card welcome2-card">
      <div class="welcome-logo">MN</div>

      <p class="welcome-step">Шаг 2 / 3</p>

      <h2 class="welcome-title">Придумайте ник</h2>

      <p class="welcome-subtitle">
        От 3 до 8 букв. Например: Yana або Богдан.
      </p>

      <div class="nickname-box">
        <input
          id="nicknameInput"
          class="nickname-input"
          type="text"
          placeholder="Ваш ник"
          autocomplete="off"
          maxlength="8"
        />

        <p class="welcome2-error" id="nicknameError"></p>
      </div>

      <div class="welcome-actions">
        <button class="welcome-btn" id="nextBtn" type="button" disabled>
          Далі
        </button>
      </div>
    </section>
  `;

  const input = root.querySelector('#nicknameInput');
  const error = root.querySelector('#nicknameError');
  const nextBtn = root.querySelector('#nextBtn');

  function setInvalid(message) {
    error.textContent = message;
    nextBtn.disabled = true;
    nextBtn.classList.remove('active');
    input.classList.toggle('is-invalid', Boolean(message));
    return false;
  }

  function setValid() {
    error.textContent = '';
    nextBtn.disabled = false;
    nextBtn.classList.add('active');
    input.classList.remove('is-invalid');
    return true;
  }

  function validateNickname() {
    const value = input.value.trim();

    if (!value) {
      return setInvalid('');
    }

    if (value.length < 3) {
      return setInvalid('Ник должен быть минимум 3 буквы');
    }

    if (value.length > 8) {
      return setInvalid('Ник должен быть максимум 8 букв');
    }

    if (!/^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ]+$/.test(value)) {
      return setInvalid('Ник должен содержать только буквы');
    }

    return setValid();
  }

  input.addEventListener('input', validateNickname);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && validateNickname()) {
      nextBtn.click();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (!validateNickname()) {
      return;
    }

    state.nickname = input.value.trim();
    save();

    show('welcome3');
  });

  setTimeout(() => {
    input.focus();
  }, 150);

  validateNickname();
});
