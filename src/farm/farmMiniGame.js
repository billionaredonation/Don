const PRECISION_ROUNDS = 3;
const SEQUENCE_LENGTH = 6;
const HARVEST_TARGET = 6;
const TIMED_GAME_DURATION_MS = 10000;
const RESULT_DELAY_MS = 620;
const FINAL_DELAY_MS = 760;
const FARM_RAKE_ASSET_URL = `${String(import.meta.env.BASE_URL || '/')}grabl.png`;

let cancelActiveGame = null;

const ACTION_COPY = Object.freeze({
  weed: Object.freeze({
    eyebrow: 'Прополка', title: 'Очистите растение',
    caption: 'Остановите грабли точно в рабочей зоне', icon: '🌿',
  }),
  water: Object.freeze({
    eyebrow: 'Полив', title: 'Настройте подачу воды',
    caption: 'Введите всю последовательность за 10 секунд', icon: '💧',
  }),
  harvest: Object.freeze({
    eyebrow: 'Сбор', title: 'Соберите спелый урожай',
    caption: 'Берите плоды и не задевайте сорняки', icon: '✂️',
  }),
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

function finalScore({ remainingMs, retries = 0, mistakes = 0, misses = 0 }) {
  const timeRatio = clamp(remainingMs / TIMED_GAME_DURATION_MS, 0, 1);
  return Math.round(clamp(70 + timeRatio * 30 - retries * 22 - mistakes * 5 - misses * 2, 18, 100));
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function shellMarkup({ action, mobile, badge, arena, footer }) {
  const copy = ACTION_COPY[action];
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
          <span class="mn-farm-minigame-round" data-farm-game-badge>${badge}</span>
        </header>
        <div class="mn-farm-minigame-meta">
          <span>${copy.caption}</span>
          <output><small>Качество</small><b data-farm-game-average>—</b></output>
        </div>
        ${arena}
        ${footer}
      </section>
    </div>`;
}

function mountGame(markup) {
  document.body.insertAdjacentHTML('beforeend', markup);
  const game = document.querySelector('[data-farm-minigame]');
  return {
    game,
    panel: game?.querySelector('.mn-farm-minigame-panel'),
    badge: game?.querySelector('[data-farm-game-badge]'),
    average: game?.querySelector('[data-farm-game-average]'),
    verdict: game?.querySelector('[data-farm-game-verdict]'),
    instruction: game?.querySelector('[data-farm-game-instruction]'),
  };
}

function setVerdict(elements, text, grade = '') {
  if (!elements.verdict) return;
  elements.verdict.textContent = text;
  if (grade) elements.verdict.dataset.grade = grade;
  else delete elements.verdict.dataset.grade;
}

function setResultState(elements, grade = '') {
  if (!elements.panel) return;
  if (grade) elements.panel.dataset.result = grade;
  else delete elements.panel.dataset.result;
}

function timedScoreMarkup() {
  return '<b data-farm-game-time>10.0</b><small>сек</small>';
}

function precisionMarkup(mobile) {
  const dots = Array.from({ length: PRECISION_ROUNDS }, (_, index) => (
    `<i data-farm-game-dot="${index}" aria-label="Попытка ${index + 1}"></i>`
  )).join('');
  return shellMarkup({
    action: 'weed', mobile,
    badge: `<b data-farm-game-round>1</b><small>/${PRECISION_ROUNDS}</small>`,
    arena: `
      <div class="mn-farm-minigame-arena is-precision">
        <div class="mn-farm-minigame-track" data-farm-game-track>
          <span class="mn-farm-minigame-target" data-farm-game-target><i></i></span>
          <button class="mn-farm-minigame-marker" type="button" data-farm-game-marker aria-label="Грабли">
            <img src="${FARM_RAKE_ASSET_URL}" alt="">
          </button>
        </div>
        <p data-farm-game-instruction>${mobile
          ? 'Тапните по шкале, когда грабли окажутся в светлой зоне'
          : 'Остановите грабли в светлой зоне — Space или кнопка ниже'}</p>
      </div>`,
    footer: `
      <div class="mn-farm-minigame-footer">
        <span class="mn-farm-minigame-dots">${dots}</span>
        <button type="button" data-farm-game-stop ${mobile ? 'hidden' : ''}>Зафиксировать <kbd>Space</kbd></button>
        <strong data-farm-game-verdict>Приготовьтесь</strong>
      </div>`,
  });
}

function roundTarget(roundIndex) {
  const widths = [22, 18, 14];
  const width = widths[roundIndex] || 14;
  const center = 20 + Math.random() * 60;
  return { center, width, left: clamp(center - width / 2, 4, 96 - width) };
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

function playPrecisionGame() {
  const mobile = isMobileGame();
  const elements = mountGame(precisionMarkup(mobile));
  const track = elements.game?.querySelector('[data-farm-game-track]');
  const targetElement = elements.game?.querySelector('[data-farm-game-target]');
  const marker = elements.game?.querySelector('[data-farm-game-marker]');
  const stopButton = elements.game?.querySelector('[data-farm-game-stop]');
  const roundOutput = elements.game?.querySelector('[data-farm-game-round]');
  const dots = [...(elements.game?.querySelectorAll('[data-farm-game-dot]') || [])];

  if (!elements.game || !elements.panel || !track || !targetElement || !marker) {
    elements.game?.remove();
    return Promise.resolve({ score: 0, grade: 'poor', cancelled: true });
  }

  return new Promise((resolve) => {
    let roundIndex = 0;
    let roundOpen = false;
    let markerPosition = 3;
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
      track.removeEventListener('pointerdown', handleTrackPress);
      window.removeEventListener('keydown', handleKeydown, true);
    }

    function finish(result) {
      if (finished) return;
      finished = true;
      roundOpen = false;
      cancelAnimationFrame(animationFrame);
      removeListeners();
      cancelActiveGame = null;
      elements.game.remove();
      resolve(result);
    }

    cancelActiveGame = () => finish({ score: 0, grade: 'poor', cancelled: true });

    function animateMarker(now) {
      if (!roundOpen) return;
      if (!animationStartedAt) animationStartedAt = now;
      const duration = Math.max(980, 1550 - roundIndex * 180);
      const progress = ((now - animationStartedAt) % duration) / duration;
      const pingPong = progress <= .5 ? progress * 2 : (1 - progress) * 2;
      setMarkerPosition(3 + pingPong * 94);
      animationFrame = requestAnimationFrame(animateMarker);
    }

    function handleTrackPress(event) {
      if (!mobile || !roundOpen) return;
      event.preventDefault();
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
      cancelAnimationFrame(animationFrame);
      const score = precisionScore(markerPosition, target);
      const grade = scoreGrade(score);
      scores.push(score);
      const average = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
      if (elements.average) elements.average.textContent = `${average}%`;
      setVerdict(elements, `${grade.label} · ${score}%`, grade.key);
      setResultState(elements, grade.key);
      if (dots[roundIndex]) dots[roundIndex].dataset.grade = grade.key;
      await wait(RESULT_DELAY_MS);
      if (finished) return;
      roundIndex += 1;
      if (roundIndex < PRECISION_ROUNDS) {
        startRound();
        return;
      }
      const scoreTotal = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
      const finalGrade = scoreGrade(scoreTotal);
      elements.panel.dataset.complete = 'true';
      setResultState(elements, finalGrade.key);
      setVerdict(elements, `${finalGrade.label} · итог ${scoreTotal}%`, finalGrade.key);
      if (elements.instruction) elements.instruction.textContent = scoreTotal >= 60
        ? 'Участок очищен — качество сохранено'
        : 'Участок очищен, но итоговый урожай будет меньше';
      await wait(FINAL_DELAY_MS);
      finish({ score: scoreTotal, grade: finalGrade.key, cancelled: false });
    }

    function startRound() {
      target = roundTarget(roundIndex);
      targetElement.style.left = `${target.left}%`;
      targetElement.style.width = `${target.width}%`;
      if (roundOutput) roundOutput.textContent = String(roundIndex + 1);
      setVerdict(elements, roundIndex === 0 ? 'Приготовьтесь' : 'Следующая попытка');
      setResultState(elements);
      elements.panel.dataset.complete = 'false';
      animationStartedAt = 0;
      setMarkerPosition(3);
      roundOpen = true;
      animationFrame = requestAnimationFrame(animateMarker);
    }

    stopButton?.addEventListener('click', submitRound);
    track.addEventListener('pointerdown', handleTrackPress);
    window.addEventListener('keydown', handleKeydown, true);
    startRound();
  });
}

function createSequence() {
  const keys = ['W', 'A', 'S', 'D'];
  const sequence = [];
  while (sequence.length < SEQUENCE_LENGTH) {
    const next = keys[Math.floor(Math.random() * keys.length)];
    if (next !== sequence[sequence.length - 1]) sequence.push(next);
  }
  return sequence;
}

function sequenceMarkup(mobile) {
  const positions = shuffled([
    { x: 17, y: 25 }, { x: 78, y: 23 }, { x: 25, y: 75 }, { x: 73, y: 73 },
  ]);
  const buttons = ['W', 'A', 'S', 'D'].map((key, index) => (
    `<button type="button" data-farm-sequence-key="${key}" style="--key-x:${positions[index].x}%;--key-y:${positions[index].y}%">${key}</button>`
  )).join('');
  return shellMarkup({
    action: 'water', mobile, badge: timedScoreMarkup(),
    arena: `
      <div class="mn-farm-minigame-arena is-sequence">
        <div class="mn-farm-sequence-list" data-farm-sequence-list></div>
        <div class="mn-farm-sequence-pad" data-farm-sequence-pad>${buttons}</div>
        <p data-farm-game-instruction>${mobile
          ? 'Нажимайте разбросанные буквы в указанном порядке'
          : 'Введите последовательность на клавиатуре W/A/S/D'}</p>
      </div>`,
    footer: `
      <div class="mn-farm-minigame-footer is-simple">
        <span class="mn-farm-minigame-stat">Ошибок: <b data-farm-game-mistakes>0</b> · повторов: <b data-farm-game-retries>0</b></span>
        <strong data-farm-game-verdict>Введите первую букву</strong>
      </div>`,
  });
}

function playSequenceGame() {
  const mobile = isMobileGame();
  const elements = mountGame(sequenceMarkup(mobile));
  const list = elements.game?.querySelector('[data-farm-sequence-list]');
  const pad = elements.game?.querySelector('[data-farm-sequence-pad]');
  const timeOutput = elements.game?.querySelector('[data-farm-game-time]');
  const mistakesOutput = elements.game?.querySelector('[data-farm-game-mistakes]');
  const retriesOutput = elements.game?.querySelector('[data-farm-game-retries]');

  if (!elements.game || !elements.panel || !list || !pad || !timeOutput) {
    elements.game?.remove();
    return Promise.resolve({ score: 0, grade: 'poor', cancelled: true });
  }

  return new Promise((resolve) => {
    let sequence = [];
    let entered = 0;
    let mistakes = 0;
    let retries = 0;
    let attemptStartedAt = 0;
    let remainingMs = TIMED_GAME_DURATION_MS;
    let timerFrame = 0;
    let accepting = false;
    let finished = false;

    function renderSequence() {
      list.innerHTML = sequence.map((key, index) => (
        `<i data-state="${index < entered ? 'done' : index === entered ? 'current' : 'pending'}">${key}</i>`
      )).join('');
    }

    function removeListeners() {
      pad.removeEventListener('click', handlePadClick);
      window.removeEventListener('keydown', handleKeydown, true);
    }

    function finish(result) {
      if (finished) return;
      finished = true;
      accepting = false;
      cancelAnimationFrame(timerFrame);
      removeListeners();
      cancelActiveGame = null;
      elements.game.remove();
      resolve(result);
    }

    cancelActiveGame = () => finish({ score: 0, grade: 'poor', cancelled: true });

    function updateStats() {
      if (mistakesOutput) mistakesOutput.textContent = String(mistakes);
      if (retriesOutput) retriesOutput.textContent = String(retries);
    }

    function timerTick(now) {
      if (!accepting) return;
      remainingMs = Math.max(0, TIMED_GAME_DURATION_MS - (now - attemptStartedAt));
      timeOutput.textContent = (remainingMs / 1000).toFixed(1);
      if (remainingMs <= 0) {
        void restartAfterTimeout();
        return;
      }
      timerFrame = requestAnimationFrame(timerTick);
    }

    async function restartAfterTimeout() {
      if (!accepting) return;
      accepting = false;
      retries += 1;
      updateStats();
      elements.panel.dataset.timeout = 'true';
      setResultState(elements, 'poor');
      setVerdict(elements, 'Время вышло · качество снижено', 'poor');
      if (elements.instruction) elements.instruction.textContent = 'Новая последовательность начнётся автоматически';
      await wait(850);
      if (finished) return;
      delete elements.panel.dataset.timeout;
      startAttempt();
    }

    async function completeGame() {
      accepting = false;
      cancelAnimationFrame(timerFrame);
      const score = finalScore({ remainingMs, retries, mistakes });
      const grade = scoreGrade(score);
      if (elements.average) elements.average.textContent = `${score}%`;
      setResultState(elements, grade.key);
      setVerdict(elements, `${grade.label} · итог ${score}%`, grade.key);
      elements.panel.dataset.complete = 'true';
      if (elements.instruction) elements.instruction.textContent = retries > 0
        ? 'Полив завершён, но повторы снизили качество'
        : 'Последовательность введена — полив завершён';
      await wait(FINAL_DELAY_MS);
      finish({ score, grade: grade.key, cancelled: false });
    }

    function submitKey(rawKey) {
      if (!accepting) return;
      const key = String(rawKey || '').toUpperCase();
      if (!['W', 'A', 'S', 'D'].includes(key)) return;
      if (key !== sequence[entered]) {
        mistakes += 1;
        updateStats();
        elements.panel.dataset.wrong = 'true';
        setVerdict(elements, `Нужна буква ${sequence[entered]}`, 'poor');
        window.setTimeout(() => { if (elements.panel) delete elements.panel.dataset.wrong; }, 180);
        return;
      }
      entered += 1;
      renderSequence();
      setVerdict(elements, entered < sequence.length ? `Верно · дальше ${sequence[entered]}` : 'Последовательность собрана', 'good');
      if (entered >= sequence.length) void completeGame();
    }

    function handlePadClick(event) {
      const button = event.target?.closest?.('[data-farm-sequence-key]');
      if (!button || !pad.contains(button)) return;
      event.preventDefault();
      submitKey(button.dataset.farmSequenceKey);
    }

    function handleKeydown(event) {
      if (mobile || !accepting || !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      submitKey(event.code.slice(-1));
    }

    function startAttempt() {
      sequence = createSequence();
      entered = 0;
      remainingMs = TIMED_GAME_DURATION_MS;
      timeOutput.textContent = '10.0';
      renderSequence();
      setResultState(elements);
      setVerdict(elements, `Начните с буквы ${sequence[0]}`);
      if (elements.instruction) elements.instruction.textContent = mobile
        ? 'Нажимайте разбросанные буквы в указанном порядке'
        : 'Введите последовательность на клавиатуре W/A/S/D';
      attemptStartedAt = performance.now();
      accepting = true;
      timerFrame = requestAnimationFrame(timerTick);
    }

    pad.addEventListener('click', handlePadClick);
    window.addEventListener('keydown', handleKeydown, true);
    updateStats();
    startAttempt();
  });
}

function harvestMarkup(mobile, cropIcon) {
  const cells = Array.from({ length: 9 }, (_, index) => (
    `<button type="button" data-farm-harvest-cell="${index}" aria-label="Ячейка ${index + 1}"><kbd>${index + 1}</kbd><span></span></button>`
  )).join('');
  return shellMarkup({
    action: 'harvest', mobile,
    badge: `<b data-farm-harvest-count>0</b><small>/${HARVEST_TARGET}</small><em><b data-farm-game-time>10.0</b>с</em>`,
    arena: `
      <div class="mn-farm-minigame-arena is-harvest" data-crop-icon="${cropIcon}">
        <div class="mn-farm-harvest-grid" data-farm-harvest-grid>${cells}</div>
        <p data-farm-game-instruction>${mobile
          ? `Тапайте только по ${cropIcon} — всё управление находится в этом блоке`
          : `Кликайте по ${cropIcon} или используйте клавиши 1–9`}</p>
      </div>`,
    footer: `
      <div class="mn-farm-minigame-footer is-simple">
        <span class="mn-farm-minigame-stat">Ошибок: <b data-farm-game-mistakes>0</b> · пропущено: <b data-farm-game-misses>0</b></span>
        <strong data-farm-game-verdict>Найдите первый плод</strong>
      </div>`,
  });
}

function playHarvestGame(cropIcon = '🌾') {
  const mobile = isMobileGame();
  const safeCropIcon = String(cropIcon || '🌾').slice(0, 8);
  const elements = mountGame(harvestMarkup(mobile, safeCropIcon));
  const grid = elements.game?.querySelector('[data-farm-harvest-grid]');
  const cells = [...(grid?.querySelectorAll('[data-farm-harvest-cell]') || [])];
  const countOutput = elements.game?.querySelector('[data-farm-harvest-count]');
  const timeOutput = elements.game?.querySelector('[data-farm-game-time]');
  const mistakesOutput = elements.game?.querySelector('[data-farm-game-mistakes]');
  const missesOutput = elements.game?.querySelector('[data-farm-game-misses]');

  if (!elements.game || !elements.panel || !grid || !timeOutput || cells.length !== 9) {
    elements.game?.remove();
    return Promise.resolve({ score: 0, grade: 'poor', cancelled: true });
  }

  return new Promise((resolve) => {
    let collected = 0;
    let mistakes = 0;
    let misses = 0;
    let retries = 0;
    let targetCell = -1;
    let targetCollected = false;
    let attemptStartedAt = 0;
    let remainingMs = TIMED_GAME_DURATION_MS;
    let timerFrame = 0;
    let spawnTimer = 0;
    let accepting = false;
    let finished = false;

    function updateStats() {
      if (countOutput) countOutput.textContent = String(collected);
      if (mistakesOutput) mistakesOutput.textContent = String(mistakes);
      if (missesOutput) missesOutput.textContent = String(misses);
    }

    function clearCells() {
      cells.forEach((cell) => {
        delete cell.dataset.kind;
        cell.querySelector('span').textContent = '';
      });
    }

    function spawnWave(countMiss = true) {
      if (!accepting) return;
      if (countMiss && targetCell >= 0 && !targetCollected) misses += 1;
      clearCells();
      targetCollected = false;
      const indexes = shuffled(cells.map((_, index) => index));
      targetCell = indexes[0];
      const decoyIcons = shuffled(['🌿', '🐛', '🍂']);
      cells[targetCell].dataset.kind = 'crop';
      cells[targetCell].querySelector('span').textContent = safeCropIcon;
      indexes.slice(1, 4).forEach((cellIndex, index) => {
        cells[cellIndex].dataset.kind = 'decoy';
        cells[cellIndex].querySelector('span').textContent = decoyIcons[index];
      });
      updateStats();
      window.clearTimeout(spawnTimer);
      spawnTimer = window.setTimeout(() => spawnWave(true), 900);
    }

    function removeListeners() {
      grid.removeEventListener('click', handleGridClick);
      window.removeEventListener('keydown', handleKeydown, true);
    }

    function finish(result) {
      if (finished) return;
      finished = true;
      accepting = false;
      cancelAnimationFrame(timerFrame);
      window.clearTimeout(spawnTimer);
      removeListeners();
      cancelActiveGame = null;
      elements.game.remove();
      resolve(result);
    }

    cancelActiveGame = () => finish({ score: 0, grade: 'poor', cancelled: true });

    function timerTick(now) {
      if (!accepting) return;
      remainingMs = Math.max(0, TIMED_GAME_DURATION_MS - (now - attemptStartedAt));
      timeOutput.textContent = (remainingMs / 1000).toFixed(1);
      if (remainingMs <= 0) {
        void restartAfterTimeout();
        return;
      }
      timerFrame = requestAnimationFrame(timerTick);
    }

    async function restartAfterTimeout() {
      if (!accepting) return;
      accepting = false;
      cancelAnimationFrame(timerFrame);
      window.clearTimeout(spawnTimer);
      retries += 1;
      collected = 0;
      updateStats();
      setResultState(elements, 'poor');
      setVerdict(elements, 'Не успели · качество снижено', 'poor');
      if (elements.instruction) elements.instruction.textContent = 'Новая попытка начнётся автоматически';
      await wait(850);
      if (finished) return;
      startAttempt();
    }

    async function completeGame() {
      accepting = false;
      cancelAnimationFrame(timerFrame);
      window.clearTimeout(spawnTimer);
      const score = finalScore({ remainingMs, retries, mistakes, misses });
      const grade = scoreGrade(score);
      if (elements.average) elements.average.textContent = `${score}%`;
      setResultState(elements, grade.key);
      setVerdict(elements, `${grade.label} · итог ${score}%`, grade.key);
      elements.panel.dataset.complete = 'true';
      if (elements.instruction) elements.instruction.textContent = score >= 60
        ? 'Урожай собран аккуратно'
        : 'Урожай собран, но ошибок было многовато';
      await wait(FINAL_DELAY_MS);
      finish({ score, grade: grade.key, cancelled: false });
    }

    function selectCell(cellIndex) {
      if (!accepting || cellIndex < 0 || cellIndex >= cells.length) return;
      const cell = cells[cellIndex];
      if (cell.dataset.kind === 'crop') {
        delete cell.dataset.kind;
        targetCollected = true;
        collected += 1;
        cell.dataset.hit = 'true';
        updateStats();
        setVerdict(elements, `Собрано ${collected} из ${HARVEST_TARGET}`, 'good');
        if (collected >= HARVEST_TARGET) {
          void completeGame();
          return;
        }
        window.setTimeout(() => {
          delete cell.dataset.hit;
          spawnWave(false);
        }, 120);
        return;
      }
      if (cell.dataset.kind === 'decoy') {
        delete cell.dataset.kind;
        mistakes += 1;
        cell.dataset.wrong = 'true';
        updateStats();
        setVerdict(elements, 'Это не урожай', 'poor');
        window.setTimeout(() => {
          delete cell.dataset.wrong;
          if (accepting) spawnWave(false);
        }, 180);
      }
    }

    function handleGridClick(event) {
      const cell = event.target?.closest?.('[data-farm-harvest-cell]');
      if (!cell || !grid.contains(cell)) return;
      event.preventDefault();
      selectCell(Number(cell.dataset.farmHarvestCell));
    }

    function handleKeydown(event) {
      if (mobile || !accepting) return;
      const match = event.code.match(/^(?:Digit|Numpad)([1-9])$/);
      if (!match) return;
      event.preventDefault();
      event.stopPropagation();
      selectCell(Number(match[1]) - 1);
    }

    function startAttempt() {
      remainingMs = TIMED_GAME_DURATION_MS;
      timeOutput.textContent = '10.0';
      collected = 0;
      targetCell = -1;
      targetCollected = false;
      updateStats();
      setResultState(elements);
      setVerdict(elements, 'Найдите первый плод');
      if (elements.instruction) elements.instruction.textContent = mobile
        ? `Тапайте только по ${safeCropIcon} — всё управление находится в этом блоке`
        : `Кликайте по ${safeCropIcon} или используйте клавиши 1–9`;
      attemptStartedAt = performance.now();
      accepting = true;
      spawnWave(false);
      timerFrame = requestAnimationFrame(timerTick);
    }

    grid.addEventListener('click', handleGridClick);
    window.addEventListener('keydown', handleKeydown, true);
    updateStats();
    startAttempt();
  });
}

export function cancelFarmMiniGame() {
  cancelActiveGame?.();
}

export function playFarmMiniGame({ action = 'weed', cropIcon = '🌾' } = {}) {
  cancelFarmMiniGame();
  if (action === 'water') return playSequenceGame();
  if (action === 'harvest') return playHarvestGame(cropIcon);
  return playPrecisionGame();
}
