const MINI_GAME_ROUNDS = 3;
const ROUND_RESULT_DELAY_MS = 520;
const FINAL_RESULT_DELAY_MS = 760;
const FARM_RAKE_ASSET_URL = `${String(import.meta.env.BASE_URL || '/')}grabl.png`;

let cancelActiveGame = null;

const ACTION_COPY = Object.freeze({
  weed: Object.freeze({
    eyebrow: 'Прополка',
    title: 'Очистите растение',
    caption: 'Точность всех попыток повлияет на урожай',
    icon: '🌿',
    marker: `<img src="${FARM_RAKE_ASSET_URL}" alt="">`,
  }),
  water: Object.freeze({
    eyebrow: 'Полив',
    title: 'Направьте поток воды',
    caption: 'Не проливайте воду мимо растения',
    icon: '💧',
    marker: '💧',
  }),
  harvest: Object.freeze({
    eyebrow: 'Сбор',
    title: 'Соберите урожай аккуратно',
    caption: 'Финальная точность определит количество',
    icon: '✂️',
    marker: '✂️',
  }),
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isMobileGame() {
  return Boolean(
    window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ||
    document.body?.classList.contains('mn-mobile-game-enabled') ||
    document.body?.classList.contains('mn-landscape-game') ||
    document.documentElement?.classList.contains('mn-mobile-device-detected')
  );
}

function scoreGrade(score) {
  if (score >= 85) return { key: 'perfect', label: 'Отлично' };
  if (score >= 60) return { key: 'good', label: 'Хорошо' };
  return { key: 'poor', label: 'Слабо' };
}

function roundTarget(roundIndex) {
  const widths = [22, 18, 14];
  const width = widths[roundIndex] || 14;
  const center = 20 + Math.random() * 60;
  return {
    center,
    width,
    left: clamp(center - width / 2, 4, 96 - width),
  };
}

function precisionScore(markerPosition, target) {
  const distance = Math.abs(markerPosition - target.center);
  const perfectRadius = Math.max(2.5, target.width * .18);
  if (distance <= perfectRadius) return Math.round(92 + (1 - distance / perfectRadius) * 8);
  if (distance <= target.width / 2) {
    const edgeProgress = (distance - perfectRadius) / Math.max(1, target.width / 2 - perfectRadius);
    return Math.round(91 - edgeProgress * 22);
  }
  return Math.round(clamp(68 - (distance - target.width / 2) * 2.35, 18, 68));
}

function miniGameMarkup({ action, copy, mobile }) {
  const dots = Array.from({ length: MINI_GAME_ROUNDS }, (_, index) => (
    `<i data-farm-game-dot="${index}" aria-label="Попытка ${index + 1}"></i>`
  )).join('');

  return `
    <div class="mn-farm-minigame" data-farm-minigame data-action="${action}" data-platform="${mobile ? 'mobile' : 'desktop'}">
      <div class="mn-farm-minigame-backdrop" aria-hidden="true"></div>
      <section class="mn-farm-minigame-panel" role="dialog" aria-modal="true" aria-labelledby="mn-farm-minigame-title">
        <header class="mn-farm-minigame-header">
          <span class="mn-farm-minigame-icon" aria-hidden="true">${copy.icon}</span>
          <span class="mn-farm-minigame-heading">
            <small>${copy.eyebrow} · мини-игра</small>
            <strong id="mn-farm-minigame-title">${copy.title}</strong>
          </span>
          <span class="mn-farm-minigame-round"><b data-farm-game-round>1</b>/${MINI_GAME_ROUNDS}</span>
        </header>

        <div class="mn-farm-minigame-meta">
          <span>${copy.caption}</span>
          <output><small>Точность</small><b data-farm-game-average>0%</b></output>
        </div>

        <div class="mn-farm-minigame-arena" data-farm-game-arena>
          <div class="mn-farm-minigame-track" data-farm-game-track>
            <span class="mn-farm-minigame-target" data-farm-game-target><i></i></span>
            <button class="mn-farm-minigame-marker" type="button" data-farm-game-marker aria-label="Игровой маркер">${copy.marker}</button>
          </div>
          <p data-farm-game-instruction>${mobile
            ? 'Зажмите значок, перетащите в светлую зону и отпустите'
            : 'Остановите маркер в светлой зоне — Space или кнопка ниже'}</p>
        </div>

        <div class="mn-farm-minigame-footer">
          <span class="mn-farm-minigame-dots">${dots}</span>
          <button type="button" data-farm-game-stop ${mobile ? 'hidden' : ''}>Зафиксировать <kbd>Space</kbd></button>
          <strong data-farm-game-verdict>Приготовьтесь</strong>
        </div>
      </section>
    </div>`;
}

export function cancelFarmMiniGame() {
  cancelActiveGame?.();
}

export async function playFarmMiniGame({ action = 'weed' } = {}) {
  cancelFarmMiniGame();

  const safeAction = ACTION_COPY[action] ? action : 'weed';
  const copy = ACTION_COPY[safeAction];
  const mobile = isMobileGame();
  document.body.insertAdjacentHTML('beforeend', miniGameMarkup({ action: safeAction, copy, mobile }));

  const game = document.querySelector('[data-farm-minigame]');
  const panel = game?.querySelector('.mn-farm-minigame-panel');
  const track = game?.querySelector('[data-farm-game-track]');
  const targetElement = game?.querySelector('[data-farm-game-target]');
  const marker = game?.querySelector('[data-farm-game-marker]');
  const stopButton = game?.querySelector('[data-farm-game-stop]');
  const roundOutput = game?.querySelector('[data-farm-game-round]');
  const averageOutput = game?.querySelector('[data-farm-game-average]');
  const instruction = game?.querySelector('[data-farm-game-instruction]');
  const verdict = game?.querySelector('[data-farm-game-verdict]');
  const dots = [...(game?.querySelectorAll('[data-farm-game-dot]') || [])];

  if (!game || !panel || !track || !targetElement || !marker) {
    game?.remove();
    return { score: 0, grade: 'poor', cancelled: true };
  }

  return new Promise((resolve) => {
    let roundIndex = 0;
    let roundOpen = false;
    let dragging = false;
    let markerPosition = mobile ? 8 : 0;
    let target = roundTarget(0);
    let animationFrame = 0;
    let animationStartedAt = 0;
    let finished = false;
    const scores = [];

    function setMarkerPosition(position) {
      markerPosition = clamp(position, 0, 100);
      marker.style.left = `${markerPosition}%`;
    }

    function removeListeners() {
      stopButton?.removeEventListener('click', submitRound);
      window.removeEventListener('keydown', handleKeydown, true);
      marker.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
    }

    function finish(result) {
      if (finished) return;
      finished = true;
      roundOpen = false;
      cancelAnimationFrame(animationFrame);
      removeListeners();
      cancelActiveGame = null;
      game.remove();
      resolve(result);
    }

    cancelActiveGame = () => finish({ score: 0, grade: 'poor', cancelled: true });

    function desktopAnimation(now) {
      if (!roundOpen || mobile) return;
      if (!animationStartedAt) animationStartedAt = now;
      const duration = Math.max(1050, 1550 - roundIndex * 170);
      const progress = ((now - animationStartedAt) % duration) / duration;
      const pingPong = progress <= .5 ? progress * 2 : (1 - progress) * 2;
      setMarkerPosition(3 + pingPong * 94);
      animationFrame = requestAnimationFrame(desktopAnimation);
    }

    function positionFromPointer(event) {
      const bounds = track.getBoundingClientRect();
      if (!bounds.width) return markerPosition;
      return ((event.clientX - bounds.left) / bounds.width) * 100;
    }

    function handlePointerDown(event) {
      if (!mobile || !roundOpen) return;
      event.preventDefault();
      dragging = true;
      marker.setPointerCapture?.(event.pointerId);
      panel.dataset.dragging = 'true';
    }

    function handlePointerMove(event) {
      if (!mobile || !roundOpen || !dragging) return;
      event.preventDefault();
      setMarkerPosition(positionFromPointer(event));
    }

    function handlePointerUp(event) {
      if (!mobile || !roundOpen || !dragging) return;
      event.preventDefault();
      dragging = false;
      panel.dataset.dragging = 'false';
      setMarkerPosition(positionFromPointer(event));
      submitRound();
    }

    function handleKeydown(event) {
      if (mobile || !roundOpen || !['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      submitRound();
    }

    async function submitRound() {
      if (!roundOpen) return;
      roundOpen = false;
      dragging = false;
      cancelAnimationFrame(animationFrame);
      panel.dataset.dragging = 'false';

      const score = precisionScore(markerPosition, target);
      const grade = scoreGrade(score);
      scores.push(score);
      const average = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
      if (averageOutput) averageOutput.textContent = `${average}%`;
      if (verdict) {
        verdict.textContent = `${grade.label} · ${score}%`;
        verdict.dataset.grade = grade.key;
      }
      const dot = dots[roundIndex];
      if (dot) dot.dataset.grade = grade.key;
      panel.dataset.result = grade.key;

      await wait(ROUND_RESULT_DELAY_MS);
      if (finished) return;

      roundIndex += 1;
      if (roundIndex < MINI_GAME_ROUNDS) {
        startRound();
        return;
      }

      const finalScore = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
      const finalGrade = scoreGrade(finalScore);
      panel.dataset.complete = 'true';
      panel.dataset.result = finalGrade.key;
      if (verdict) {
        verdict.textContent = `${finalGrade.label} · итог ${finalScore}%`;
        verdict.dataset.grade = finalGrade.key;
      }
      if (instruction) instruction.textContent = finalScore >= 60
        ? 'Качественная работа — урожай будет лучше'
        : 'Этап засчитан, но итоговый урожай будет меньше';

      await wait(FINAL_RESULT_DELAY_MS);
      finish({ score: finalScore, grade: finalGrade.key, cancelled: false });
    }

    function startRound() {
      target = roundTarget(roundIndex);
      targetElement.style.left = `${target.left}%`;
      targetElement.style.width = `${target.width}%`;
      if (roundOutput) roundOutput.textContent = String(roundIndex + 1);
      if (verdict) {
        verdict.textContent = roundIndex === 0 ? 'Приготовьтесь' : 'Следующая попытка';
        delete verdict.dataset.grade;
      }
      delete panel.dataset.result;
      panel.dataset.complete = 'false';
      panel.dataset.dragging = 'false';
      animationStartedAt = 0;
      setMarkerPosition(mobile ? (target.center > 50 ? 8 : 92) : 3);
      roundOpen = true;
      if (!mobile) animationFrame = requestAnimationFrame(desktopAnimation);
    }

    stopButton?.addEventListener('click', submitRound);
    window.addEventListener('keydown', handleKeydown, true);
    marker.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', handlePointerUp, { capture: true, passive: false });
    window.addEventListener('pointercancel', handlePointerUp, { capture: true, passive: false });
    startRound();
  });
}
