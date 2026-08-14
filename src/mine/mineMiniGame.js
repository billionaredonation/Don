const STRIKE_ROUNDS = 4;
const ROUND_TIMEOUT_MS = 5200;

let cancelActiveGame = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isMobileGameplay() {
  return Boolean(
    window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ||
    document.body.classList.contains('mn-mobile-game-enabled') ||
    document.body.classList.contains('mn-landscape-game')
  );
}

function gradeForScore(score) {
  if (score >= 88) return 'perfect';
  if (score >= 62) return 'good';
  return 'poor';
}

function verdictForScore(score) {
  if (score >= 88) return 'Точный удар';
  if (score >= 62) return 'Хороший удар';
  return 'Слабый удар';
}

function markup({ resourceIcon, resourceLabel, mobile }) {
  const dots = Array.from({ length: STRIKE_ROUNDS }, (_, index) => (
    `<i data-mine-game-dot="${index}" aria-label="Удар ${index + 1}"></i>`
  )).join('');

  return `
    <div class="mn-mine-minigame" data-mine-minigame data-platform="${mobile ? 'mobile' : 'desktop'}">
      <div class="mn-mine-minigame-backdrop" aria-hidden="true"></div>
      <section class="mn-mine-minigame-panel" role="dialog" aria-modal="true" aria-labelledby="mn-mine-game-title">
        <header>
          <i aria-hidden="true">⛏️</i>
          <span><small>Добыча · ${resourceIcon} ${resourceLabel}</small><strong id="mn-mine-game-title">Поймайте точку удара</strong></span>
          <b><em data-mine-game-round>1</em>/${STRIKE_ROUNDS}</b>
        </header>
        <div class="mn-mine-game-stats">
          <span><small>Средняя точность</small><strong data-mine-game-average>—</strong></span>
          <span><small>На удар</small><strong data-mine-game-time>5.2</strong></span>
        </div>
        <div class="mn-mine-game-arena" data-mine-game-hit>
          <div class="mn-mine-game-track" data-mine-game-track>
            <span class="mn-mine-game-target" data-mine-game-target></span>
            <span class="mn-mine-game-marker" data-mine-game-marker>⛏️</span>
          </div>
          <p>${mobile ? 'Нажмите по шкале в нужный момент' : 'Нажмите Space или кнопку в нужный момент'}</p>
        </div>
        <footer>
          <span>${dots}</span>
          <button type="button" data-mine-game-hit>${mobile ? 'Ударить' : 'Ударить · Space'}</button>
          <strong data-mine-game-verdict>Приготовьтесь</strong>
        </footer>
      </section>
    </div>`;
}

export function cancelMineMiniGame() {
  cancelActiveGame?.();
  cancelActiveGame = null;
}

export function playMineMiniGame({ resourceIcon = '🪨', resourceLabel = 'Сырьё' } = {}) {
  cancelMineMiniGame();

  const mobile = isMobileGameplay();
  document.body.insertAdjacentHTML('beforeend', markup({ resourceIcon, resourceLabel, mobile }));

  const game = document.querySelector('[data-mine-minigame]');
  const panel = game?.querySelector('.mn-mine-minigame-panel');
  const track = game?.querySelector('[data-mine-game-track]');
  const target = game?.querySelector('[data-mine-game-target]');
  const marker = game?.querySelector('[data-mine-game-marker]');
  const roundOutput = game?.querySelector('[data-mine-game-round]');
  const averageOutput = game?.querySelector('[data-mine-game-average]');
  const timeOutput = game?.querySelector('[data-mine-game-time]');
  const verdict = game?.querySelector('[data-mine-game-verdict]');
  const dots = [...(game?.querySelectorAll('[data-mine-game-dot]') || [])];
  const hitTargets = [...(game?.querySelectorAll('[data-mine-game-hit]') || [])];

  return new Promise((resolve) => {
    let settled = false;
    let roundIndex = 0;
    let roundStartedAt = 0;
    let roundFrame = 0;
    let nextRoundTimer = 0;
    let inputLocked = true;
    let markerPosition = 0;
    let targetStart = 38;
    let targetWidth = 20;
    const scores = [];

    function cleanup() {
      window.cancelAnimationFrame(roundFrame);
      window.clearTimeout(nextRoundTimer);
      window.removeEventListener('keydown', handleKeyDown, true);
      hitTargets.forEach((element) => element.removeEventListener('pointerdown', handlePointerDown));
      game?.remove();
      if (cancelActiveGame === cancel) cancelActiveGame = null;
    }

    function finish(result) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    function cancel() {
      finish({ cancelled: true, score: 0, grade: 'poor', rounds: [] });
    }

    function renderAverage() {
      if (!averageOutput) return;
      const average = scores.length
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : 0;
      averageOutput.textContent = scores.length ? `${average}%` : '—';
    }

    function finishGame() {
      const score = Math.round(scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length));
      const grade = gradeForScore(score);
      panel.dataset.result = grade;
      verdict.textContent = score >= 88
        ? 'Порода расколота идеально'
        : score >= 62
          ? 'Сырьё добыто без лишних потерь'
          : 'Сырьё добыто, но часть породы потеряна';
      window.setTimeout(() => finish({ cancelled: false, score, grade, rounds: [...scores] }), 720);
    }

    function startRound() {
      if (roundIndex >= STRIKE_ROUNDS) {
        finishGame();
        return;
      }

      targetWidth = 14 + Math.random() * 9;
      targetStart = 7 + Math.random() * (86 - targetWidth);
      target.style.left = `${targetStart}%`;
      target.style.width = `${targetWidth}%`;
      roundOutput.textContent = String(roundIndex + 1);
      verdict.textContent = roundIndex === 0 ? 'Начали' : 'Следующий удар';
      delete panel.dataset.result;
      roundStartedAt = performance.now();
      inputLocked = false;
      roundFrame = window.requestAnimationFrame(tick);
    }

    function tick(now) {
      if (settled || inputLocked) return;
      const elapsed = now - roundStartedAt;
      const progress = (elapsed * (0.055 + roundIndex * 0.006)) % 200;
      markerPosition = progress <= 100 ? progress : 200 - progress;
      marker.style.left = `${markerPosition}%`;
      timeOutput.textContent = Math.max(0, (ROUND_TIMEOUT_MS - elapsed) / 1000).toFixed(1);

      if (elapsed >= ROUND_TIMEOUT_MS) {
        registerStrike(0);
        return;
      }
      roundFrame = window.requestAnimationFrame(tick);
    }

    function registerStrike(forcedScore = null) {
      if (settled || inputLocked) return;
      inputLocked = true;
      window.cancelAnimationFrame(roundFrame);

      const center = targetStart + targetWidth / 2;
      const maximumDistance = Math.max(center, 100 - center, 1);
      const score = forcedScore == null
        ? Math.round(clamp(100 - (Math.abs(markerPosition - center) / maximumDistance) * 125, 0, 100))
        : forcedScore;
      const grade = gradeForScore(score);
      scores.push(score);
      dots[roundIndex].dataset.grade = grade;
      panel.dataset.result = grade;
      verdict.textContent = forcedScore === 0 ? 'Удар пропущен' : `${verdictForScore(score)} · ${score}%`;
      renderAverage();
      roundIndex += 1;
      nextRoundTimer = window.setTimeout(startRound, 430);
    }

    function handlePointerDown(event) {
      event.preventDefault();
      event.stopPropagation();
      registerStrike();
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.code !== 'Space' || event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      registerStrike();
    }

    cancelActiveGame = cancel;
    window.addEventListener('keydown', handleKeyDown, true);
    hitTargets.forEach((element) => element.addEventListener('pointerdown', handlePointerDown));
    requestAnimationFrame(() => {
      panel.dataset.visible = 'true';
      nextRoundTimer = window.setTimeout(startRound, 420);
    });
  });
}
