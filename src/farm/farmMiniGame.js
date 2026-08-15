const PRECISION_ROUNDS = 3;
const SEQUENCE_LENGTH = 6;
const HARVEST_TARGET = 6;
const TIMED_GAME_DURATION_MS = 10000;
const RESULT_DELAY_MS = 620;
const FINAL_DELAY_MS = 760;
const FARM_RAKE_ASSET_URL = `${String(import.meta.env.BASE_URL || '/')}grabl.png`;

const CROP_GAME_META = Object.freeze({
  apple: Object.freeze({
    cropType: 'apple', cropIcon: '🍎', cropLabel: 'Яблоня', goal: 6, durationMs: 14000,
    title: 'Поймайте спелые яблоки', caption: 'Ведите корзину под красными плодами',
  }),
  orange: Object.freeze({
    cropType: 'orange', cropIcon: '🍊', cropLabel: 'Апельсины', goal: 7, durationMs: 15000,
    title: 'Запомните спелые плоды', caption: 'Повторите подсвеченные апельсины по памяти',
  }),
  wheat: Object.freeze({
    cropType: 'wheat', cropIcon: '🌾', cropLabel: 'Пшеница', goal: 5, durationMs: 16000,
    title: 'Срежьте пшеницу в ритм', caption: 'Косите активный ряд внутри золотой зоны',
  }),
  corn: Object.freeze({
    cropType: 'corn', cropIcon: '🌽', cropLabel: 'Кукуруза', goal: 5, durationMs: 15000,
    title: 'Очистите початки', caption: 'Запомните стрелку и снимите слой нужным движением',
  }),
});

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

function shellMarkup({ action, mobile, badge, arena, footer, cropType = '', cropLabel = '', copyOverride = null }) {
  const copy = { ...ACTION_COPY[action], ...(copyOverride || {}) };
  const normalizedCropType = CROP_GAME_META[cropType] ? cropType : '';
  const safeCropLabel = String(cropLabel || CROP_GAME_META[normalizedCropType]?.cropLabel || '').slice(0, 32);
  return `
    <div class="mn-farm-minigame" data-farm-minigame data-action="${action}" data-crop-type="${normalizedCropType}" data-platform="${mobile ? 'mobile' : 'desktop'}">
      <div class="mn-farm-minigame-backdrop" aria-hidden="true"></div>
      <section class="mn-farm-minigame-panel" role="dialog" aria-modal="true" aria-labelledby="mn-farm-minigame-title">
        <header class="mn-farm-minigame-header">
          <span class="mn-farm-minigame-icon" aria-hidden="true">${copy.icon}</span>
          <span class="mn-farm-minigame-heading">
            <small>${copy.eyebrow} · ${safeCropLabel || 'мини-игра'}</small>
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

function precisionMarkup(mobile, crop = {}) {
  const dots = Array.from({ length: PRECISION_ROUNDS }, (_, index) => (
    `<i data-farm-game-dot="${index}" aria-label="Попытка ${index + 1}"></i>`
  )).join('');
  return shellMarkup({
    action: 'weed', mobile, cropType: crop.cropType, cropLabel: crop.cropLabel,
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

function playPrecisionGame(crop = {}) {
  const mobile = isMobileGame();
  const elements = mountGame(precisionMarkup(mobile, crop));
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

function sequenceMarkup(mobile, crop = {}) {
  const positions = shuffled([
    { x: 17, y: 25 }, { x: 78, y: 23 }, { x: 25, y: 75 }, { x: 73, y: 73 },
  ]);
  const buttons = ['W', 'A', 'S', 'D'].map((key, index) => (
    `<button type="button" data-farm-sequence-key="${key}" style="--key-x:${positions[index].x}%;--key-y:${positions[index].y}%">${key}</button>`
  )).join('');
  return shellMarkup({
    action: 'water', mobile, badge: timedScoreMarkup(), cropType: crop.cropType, cropLabel: crop.cropLabel,
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

function playSequenceGame(crop = {}) {
  const mobile = isMobileGame();
  const elements = mountGame(sequenceMarkup(mobile, crop));
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

function cropHarvestArenaMarkup(meta, mobile) {
  if (meta.cropType === 'apple') {
    return `
      <div class="mn-farm-minigame-arena is-crop-harvest is-apple-catch" data-farm-crop-stage>
        <div class="mn-farm-apple-orchard" data-farm-apple-orchard>
          <span class="mn-farm-apple-canopy" aria-hidden="true">🌳</span>
          <div class="mn-farm-apple-fruits" data-farm-apple-fruits></div>
          <span class="mn-farm-apple-basket" data-farm-apple-basket aria-label="Корзина">🧺</span>
        </div>
        <div class="mn-farm-apple-controls" aria-label="Управление корзиной">
          <button type="button" data-farm-apple-move="-1" aria-label="Двигать влево">←</button>
          <span>${mobile ? 'Ведите корзину пальцем' : 'Двигайте мышь или стрелки'}</span>
          <button type="button" data-farm-apple-move="1" aria-label="Двигать вправо">→</button>
        </div>
        <p data-farm-game-instruction>Ловите 🍎 и пропускайте зелёные плоды</p>
      </div>`;
  }

  if (meta.cropType === 'orange') {
    const fruits = Array.from({ length: 8 }, (_, index) => (
      `<button type="button" data-farm-orange-fruit="${index}" aria-label="Апельсин ${index + 1}"><kbd>${index + 1}</kbd><span>🍊</span></button>`
    )).join('');
    return `
      <div class="mn-farm-minigame-arena is-crop-harvest is-orange-memory" data-farm-crop-stage>
        <div class="mn-farm-orange-tree" data-farm-orange-tree>${fruits}</div>
        <p data-farm-game-instruction>Запомните светящиеся плоды, затем выберите их</p>
      </div>`;
  }

  if (meta.cropType === 'wheat') {
    const rows = Array.from({ length: meta.goal }, (_, index) => `
      <button type="button" class="mn-farm-wheat-row" data-farm-wheat-row="${index}" aria-label="Ряд ${index + 1}">
        <kbd>${index + 1}</kbd><span>🌾🌾🌾</span>
        <i><b data-farm-wheat-zone></b><em data-farm-wheat-marker>✂</em></i>
      </button>`).join('');
    return `
      <div class="mn-farm-minigame-arena is-crop-harvest is-wheat-rhythm" data-farm-crop-stage>
        <div class="mn-farm-wheat-field" data-farm-wheat-field>${rows}</div>
        <p data-farm-game-instruction>${mobile ? 'Касайтесь подсвеченного ряда в золотой зоне' : 'Кликайте по ряду или используйте клавиши 1–5'}</p>
      </div>`;
  }

  return `
    <div class="mn-farm-minigame-arena is-crop-harvest is-corn-husk" data-farm-crop-stage>
      <div class="mn-farm-corn-workbench" data-farm-corn-workbench>
        <span class="mn-farm-corn-cob" data-farm-corn-cob data-layer="0"><i>🌽</i><b></b><b></b><b></b><b></b><b></b></span>
        <strong class="mn-farm-corn-cue" data-farm-corn-cue>?</strong>
      </div>
      <div class="mn-farm-corn-controls" aria-label="Направление снятия листа">
        <button type="button" data-farm-corn-direction="left">↙</button>
        <button type="button" data-farm-corn-direction="down">↓</button>
        <button type="button" data-farm-corn-direction="right">↘</button>
      </div>
      <p data-farm-game-instruction>${mobile ? 'Свайпните по початку или нажмите нужную стрелку' : 'Проведите мышью по початку или нажмите ←/↓/→'}</p>
    </div>`;
}

function cropHarvestMarkup(meta, mobile) {
  return shellMarkup({
    action: 'harvest',
    mobile,
    cropType: meta.cropType,
    cropLabel: meta.cropLabel,
    copyOverride: { title: meta.title, caption: meta.caption, icon: meta.cropIcon },
    badge: `<b data-farm-crop-count>0</b><small>/${meta.goal}</small><em><b data-farm-game-time>${(meta.durationMs / 1000).toFixed(1)}</b>с</em>`,
    arena: cropHarvestArenaMarkup(meta, mobile),
    footer: `
      <div class="mn-farm-minigame-footer is-simple">
        <span class="mn-farm-minigame-stat">Ошибок: <b data-farm-game-mistakes>0</b> · пропущено: <b data-farm-game-misses>0</b></span>
        <strong data-farm-game-verdict>Приготовьтесь</strong>
      </div>`,
  });
}

function setupAppleCropGame(context) {
  const { game, stage, meta, record, complete, addMistake, addMiss, isDone, on, later, loop, verdict } = context;
  const orchard = game.querySelector('[data-farm-apple-orchard]');
  const fruitsRoot = game.querySelector('[data-farm-apple-fruits]');
  const basket = game.querySelector('[data-farm-apple-basket]');
  const moveButtons = [...game.querySelectorAll('[data-farm-apple-move]')];
  if (!orchard || !fruitsRoot || !basket) {
    complete('Корзина готова к сбору');
    return;
  }

  let basketX = 50;
  let pointerActive = false;
  let lastFrameAt = performance.now();
  let nextSpawnAt = lastFrameAt + 360;
  let fruitId = 0;
  const fruits = [];

  function setBasket(position) {
    basketX = clamp(position, 8, 92);
    basket.style.left = `${basketX}%`;
  }

  function setBasketFromPointer(event) {
    const rect = orchard.getBoundingClientRect();
    if (!rect.width) return;
    setBasket(((event.clientX - rect.left) / rect.width) * 100);
  }

  function spawnFruit() {
    if (isDone()) return;
    const ripe = Math.random() > .24;
    const element = document.createElement('i');
    const fruit = {
      id: fruitId += 1,
      x: 9 + Math.random() * 82,
      y: -8,
      speed: 34 + Math.random() * 14,
      ripe,
      element,
    };
    element.dataset.kind = ripe ? 'ripe' : 'decoy';
    element.textContent = ripe ? meta.cropIcon : (Math.random() > .5 ? '🍏' : '🍂');
    element.style.left = `${fruit.x}%`;
    element.style.top = `${fruit.y}%`;
    fruits.push(fruit);
    fruitsRoot.appendChild(element);
  }

  function retireFruit(fruit) {
    const index = fruits.findIndex((entry) => entry.id === fruit.id);
    if (index >= 0) fruits.splice(index, 1);
    later(() => fruit.element.remove(), 100);
  }

  function handlePointerDown(event) {
    if (event.target.closest('[data-farm-apple-move]')) return;
    pointerActive = true;
    event.preventDefault();
    setBasketFromPointer(event);
  }

  function handlePointerMove(event) {
    if (context.mobile && !pointerActive) return;
    setBasketFromPointer(event);
  }

  function handleKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    setBasket(basketX + (['ArrowLeft', 'KeyA'].includes(event.code) ? -11 : 11));
  }

  function handleMoveButton(event) {
    const direction = Number(event.currentTarget.dataset.farmAppleMove) || 0;
    setBasket(basketX + direction * 13);
  }

  on(orchard, 'pointerdown', handlePointerDown);
  on(orchard, 'pointermove', handlePointerMove);
  on(window, 'pointerup', () => { pointerActive = false; });
  on(window, 'pointercancel', () => { pointerActive = false; });
  on(window, 'keydown', handleKeydown, true);
  moveButtons.forEach((button) => on(button, 'click', handleMoveButton));

  loop((now) => {
    if (isDone()) return;
    const deltaSeconds = Math.min(.04, Math.max(0, now - lastFrameAt) / 1000);
    lastFrameAt = now;
    if (now >= nextSpawnAt && fruits.length < 5) {
      spawnFruit();
      nextSpawnAt = now + 610 + Math.random() * 210;
    }

    [...fruits].forEach((fruit) => {
      fruit.y += fruit.speed * deltaSeconds;
      fruit.element.style.top = `${fruit.y}%`;
      if (fruit.y < 80) return;
      const caught = Math.abs(fruit.x - basketX) <= 13;
      if (caught && fruit.ripe) {
        const accuracy = Math.round(clamp(103 - Math.abs(fruit.x - basketX) * 2.35, 68, 100));
        fruit.element.dataset.caught = 'true';
        record(accuracy, `Яблоко в корзине · ${accuracy}%`);
      } else if (caught) {
        fruit.element.dataset.caught = 'wrong';
        addMistake('Неспелый плод попал в корзину');
      } else if (fruit.ripe) {
        addMiss('Спелое яблоко упало мимо');
      }
      retireFruit(fruit);
      if (context.scores.length >= meta.goal) complete('Спелые яблоки собраны');
    });
  });

  setBasket(50);
  verdict.textContent = 'Подведите корзину под первый плод';
  stage.dataset.phase = 'active';
}

function setupOrangeCropGame(context) {
  const { game, stage, meta, record, complete, addMistake, isDone, on, later, verdict } = context;
  const tree = game.querySelector('[data-farm-orange-tree]');
  const fruits = [...game.querySelectorAll('[data-farm-orange-fruit]')];
  const roundSizes = [3, 4];
  let roundIndex = 0;
  let targets = new Set();
  let selected = new Set();
  let accepting = false;
  let choiceStartedAt = 0;

  function startRound() {
    if (isDone()) return;
    if (roundIndex >= roundSizes.length) {
      complete('Вы запомнили все спелые апельсины');
      return;
    }
    accepting = false;
    selected = new Set();
    targets = new Set(shuffled(fruits.map((_, index) => index)).slice(0, roundSizes[roundIndex]));
    fruits.forEach((fruit, index) => {
      delete fruit.dataset.picked;
      delete fruit.dataset.wrong;
      fruit.dataset.ripe = targets.has(index) ? 'true' : 'false';
    });
    stage.dataset.phase = 'memorize';
    verdict.textContent = `Запоминайте · раунд ${roundIndex + 1}`;
    later(() => {
      if (isDone()) return;
      fruits.forEach((fruit) => { fruit.dataset.ripe = 'hidden'; });
      stage.dataset.phase = 'choose';
      verdict.textContent = 'Теперь выберите спелые плоды';
      choiceStartedAt = performance.now();
      accepting = true;
    }, roundIndex === 0 ? 1150 : 1350);
  }

  function chooseFruit(index) {
    if (!accepting || isDone() || index < 0 || index >= fruits.length || selected.has(index)) return;
    const fruit = fruits[index];
    if (!targets.has(index)) {
      fruit.dataset.wrong = 'true';
      addMistake('Этот апельсин не подсвечивался');
      later(() => delete fruit.dataset.wrong, 300);
      return;
    }
    selected.add(index);
    fruit.dataset.picked = 'true';
    const elapsedPenalty = clamp((performance.now() - choiceStartedAt) / 230, 0, 24);
    const score = Math.round(clamp(100 - elapsedPenalty, 62, 100));
    record(score, `Верно · ${selected.size} из ${targets.size}`);
    if (selected.size < targets.size) return;
    accepting = false;
    roundIndex += 1;
    later(startRound, 520);
  }

  function handleTreeClick(event) {
    const fruit = event.target.closest('[data-farm-orange-fruit]');
    if (!fruit || !tree?.contains(fruit)) return;
    event.preventDefault();
    chooseFruit(Number(fruit.dataset.farmOrangeFruit));
  }

  function handleKeydown(event) {
    const match = event.code.match(/^(?:Digit|Numpad)([1-8])$/);
    if (!match) return;
    event.preventDefault();
    event.stopPropagation();
    chooseFruit(Number(match[1]) - 1);
  }

  on(tree, 'click', handleTreeClick);
  on(window, 'keydown', handleKeydown, true);
  later(startRound, 360);
}

function setupWheatCropGame(context) {
  const { game, stage, meta, record, complete, addMistake, addMiss, isDone, on, later, loop, verdict } = context;
  const field = game.querySelector('[data-farm-wheat-field]');
  const rows = [...game.querySelectorAll('[data-farm-wheat-row]')];
  let active = false;
  let activeRow = -1;
  let previousRow = -1;
  let roundStartedAt = 0;
  let markerPosition = 0;
  let zoneStart = 40;
  let zoneWidth = 20;

  function clearRows() {
    rows.forEach((row) => {
      delete row.dataset.active;
      delete row.dataset.wrong;
    });
  }

  function startRound() {
    if (isDone()) return;
    if (context.scores.length >= meta.goal) {
      complete('Пшеница срезана ровными рядами');
      return;
    }
    clearRows();
    const candidates = rows.map((_, index) => index).filter((index) => index !== previousRow);
    activeRow = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
    previousRow = activeRow;
    zoneWidth = 16 + Math.random() * 7;
    zoneStart = 14 + Math.random() * (72 - zoneWidth);
    const row = rows[activeRow];
    row.dataset.active = 'true';
    row.querySelector('[data-farm-wheat-zone]').style.cssText = `left:${zoneStart}%;width:${zoneWidth}%`;
    roundStartedAt = performance.now();
    active = true;
    stage.dataset.phase = 'active';
    verdict.textContent = `Готов ряд ${activeRow + 1}`;
  }

  function cutRow(rowIndex) {
    if (!active || isDone() || rowIndex < 0 || rowIndex >= rows.length) return;
    if (rowIndex !== activeRow) {
      rows[rowIndex].dataset.wrong = 'true';
      addMistake(`Сейчас нужен ряд ${activeRow + 1}`);
      later(() => delete rows[rowIndex].dataset.wrong, 260);
      return;
    }
    active = false;
    const center = zoneStart + zoneWidth / 2;
    const normalizedDistance = Math.abs(markerPosition - center) / Math.max(1, zoneWidth / 2);
    const score = Math.round(clamp(normalizedDistance <= 1
      ? 100 - normalizedDistance * 19
      : 81 - (normalizedDistance - 1) * 42, 18, 100));
    const grade = scoreGrade(score);
    rows[rowIndex].dataset.cut = grade.key;
    record(score, score >= 85 ? 'Чистый срез' : score >= 60 ? 'Ряд срезан' : 'Край ряда помят');
    later(() => {
      delete rows[rowIndex].dataset.cut;
      startRound();
    }, 420);
  }

  function handleFieldClick(event) {
    const row = event.target.closest('[data-farm-wheat-row]');
    if (!row || !field?.contains(row)) return;
    event.preventDefault();
    cutRow(Number(row.dataset.farmWheatRow));
  }

  function handleKeydown(event) {
    const match = event.code.match(/^(?:Digit|Numpad)([1-5])$/);
    if (!match) return;
    event.preventDefault();
    event.stopPropagation();
    cutRow(Number(match[1]) - 1);
  }

  on(field, 'click', handleFieldClick);
  on(window, 'keydown', handleKeydown, true);
  loop((now) => {
    if (!active || isDone()) return;
    const elapsed = now - roundStartedAt;
    const sweep = (elapsed * .095) % 200;
    markerPosition = sweep <= 100 ? sweep : 200 - sweep;
    rows[activeRow]?.querySelector('[data-farm-wheat-marker]')?.style.setProperty('left', `${markerPosition}%`);
    if (elapsed >= 3600) {
      active = false;
      addMiss('Момент среза упущен');
      record(18, 'Ряд помят из-за задержки');
      later(startRound, 420);
    }
  });
  later(startRound, 360);
}

function setupCornCropGame(context) {
  const { game, stage, meta, record, complete, addMistake, isDone, on, later, verdict } = context;
  const workbench = game.querySelector('[data-farm-corn-workbench]');
  const cob = game.querySelector('[data-farm-corn-cob]');
  const cue = game.querySelector('[data-farm-corn-cue]');
  const controls = [...game.querySelectorAll('[data-farm-corn-direction]')];
  const arrows = { left: '↙', down: '↓', right: '↘' };
  const vectors = {
    left: { x: -.7, y: .7 },
    down: { x: 0, y: 1 },
    right: { x: .7, y: .7 },
  };
  let expected = 'down';
  let previous = '';
  let accepting = false;
  let pointerStart = null;
  let stepStartedAt = 0;

  function startStep() {
    if (isDone()) return;
    if (context.scores.length >= meta.goal) {
      complete('Початки полностью очищены');
      return;
    }
    const candidates = Object.keys(arrows).filter((direction) => direction !== previous);
    expected = candidates[Math.floor(Math.random() * candidates.length)] || 'down';
    previous = expected;
    accepting = false;
    cue.textContent = arrows[expected];
    stage.dataset.phase = 'memorize';
    verdict.textContent = `Запомните движение · слой ${context.scores.length + 1}`;
    later(() => {
      if (isDone()) return;
      cue.textContent = '?';
      stage.dataset.phase = 'swipe';
      verdict.textContent = 'Снимайте слой по памяти';
      stepStartedAt = performance.now();
      accepting = true;
    }, 720);
  }

  function submitDirection(direction, precision = 1) {
    if (!accepting || isDone() || !arrows[direction]) return;
    if (direction !== expected) {
      stage.dataset.feedback = 'error';
      addMistake('Лист потянут не в ту сторону');
      later(() => delete stage.dataset.feedback, 300);
      return;
    }
    accepting = false;
    const speedPenalty = clamp((performance.now() - stepStartedAt) / 260, 0, 22);
    const score = Math.round(clamp(78 + precision * 22 - speedPenalty, 48, 100));
    record(score, score >= 85 ? 'Лист снят чисто' : 'Слой снят');
    cob.dataset.layer = String(context.scores.length);
    stage.dataset.feedback = 'success';
    later(() => {
      delete stage.dataset.feedback;
      startStep();
    }, 430);
  }

  function handlePointerDown(event) {
    if (!accepting || event.target.closest('[data-farm-corn-direction]')) return;
    event.preventDefault();
    pointerStart = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event) {
    if (!pointerStart || !accepting) {
      pointerStart = null;
      return;
    }
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    const distance = Math.hypot(dx, dy);
    if (distance < 24 || dy < 8) return;
    const normalized = { x: dx / distance, y: dy / distance };
    const direction = Math.abs(dx) < Math.abs(dy) * .42 ? 'down' : dx < 0 ? 'left' : 'right';
    const expectedVector = vectors[expected];
    const precision = clamp(normalized.x * expectedVector.x + normalized.y * expectedVector.y, 0, 1);
    submitDirection(direction, direction === expected ? precision : 0);
  }

  function handleDirectionButton(event) {
    event.preventDefault();
    submitDirection(event.currentTarget.dataset.farmCornDirection, .9);
  }

  function handleKeydown(event) {
    const direction = event.code === 'ArrowLeft' ? 'left' : event.code === 'ArrowDown' ? 'down' : event.code === 'ArrowRight' ? 'right' : '';
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    submitDirection(direction, .94);
  }

  on(workbench, 'pointerdown', handlePointerDown);
  on(window, 'pointerup', handlePointerUp);
  on(window, 'pointercancel', () => { pointerStart = null; });
  controls.forEach((button) => on(button, 'click', handleDirectionButton));
  on(window, 'keydown', handleKeydown, true);
  later(startStep, 360);
}

function playCropHarvestGame({ cropType = '', cropIcon = '🌾', cropLabel = '' } = {}) {
  const meta = CROP_GAME_META[String(cropType || '').trim()];
  if (!meta) return playHarvestGame(cropIcon);

  const mobile = isMobileGame();
  const elements = mountGame(cropHarvestMarkup(meta, mobile));
  const stage = elements.game?.querySelector('[data-farm-crop-stage]');
  const timeOutput = elements.game?.querySelector('[data-farm-game-time]');
  const countOutput = elements.game?.querySelector('[data-farm-crop-count]');
  const mistakesOutput = elements.game?.querySelector('[data-farm-game-mistakes]');
  const missesOutput = elements.game?.querySelector('[data-farm-game-misses]');

  if (!elements.game || !elements.panel || !stage || !timeOutput || !countOutput) {
    elements.game?.remove();
    return playHarvestGame(cropIcon);
  }

  return new Promise((resolve) => {
    let settled = false;
    let completing = false;
    let mistakes = 0;
    let misses = 0;
    let remainingMs = meta.durationMs;
    let finishTimer = 0;
    const startedAt = performance.now();
    const scores = [];
    const cleanups = [];

    function cleanup() {
      window.clearTimeout(finishTimer);
      cleanups.splice(0).reverse().forEach((callback) => {
        try { callback(); } catch {}
      });
      elements.game?.remove();
      if (cancelActiveGame === cancel) cancelActiveGame = null;
    }

    function finish(result) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    function cancel() {
      finish({ score: 0, grade: 'poor', cancelled: true, rounds: [] });
    }

    function on(target, eventName, handler, options) {
      if (!target?.addEventListener) return;
      target.addEventListener(eventName, handler, options);
      cleanups.push(() => target.removeEventListener(eventName, handler, options));
    }

    function later(callback, delay) {
      const timer = window.setTimeout(() => {
        if (!settled && !completing) callback();
      }, delay);
      cleanups.push(() => window.clearTimeout(timer));
      return timer;
    }

    function loop(callback) {
      let frame = 0;
      let active = true;
      const tick = (now) => {
        if (!active || settled) return;
        callback(now);
        if (active && !settled) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
      cleanups.push(() => {
        active = false;
        window.cancelAnimationFrame(frame);
      });
    }

    function updateStats() {
      countOutput.textContent = String(Math.min(meta.goal, scores.length));
      if (mistakesOutput) mistakesOutput.textContent = String(mistakes);
      if (missesOutput) missesOutput.textContent = String(misses);
      if (elements.average) {
        const average = scores.length
          ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
          : 0;
        elements.average.textContent = scores.length ? `${average}%` : '—';
      }
    }

    function record(rawScore, message) {
      if (settled || completing || scores.length >= meta.goal) return;
      const score = Math.round(clamp(Number(rawScore) || 0, 0, 100));
      scores.push(score);
      const grade = scoreGrade(score);
      setResultState(elements, grade.key);
      setVerdict(elements, message, grade.key);
      updateStats();
    }

    function addMistake(message) {
      if (settled || completing) return;
      mistakes += 1;
      updateStats();
      setVerdict(elements, message, 'poor');
    }

    function addMiss(message) {
      if (settled || completing) return;
      misses += 1;
      updateStats();
      setVerdict(elements, message, 'poor');
    }

    function complete(summary) {
      if (settled || completing) return;
      completing = true;
      const average = scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 18;
      const completionRatio = clamp(scores.length / meta.goal, 0, 1);
      const timeRatio = clamp(remainingMs / meta.durationMs, 0, 1);
      const score = Math.round(clamp(
        average * .78 + completionRatio * 12 + timeRatio * 10 - mistakes * 4 - misses * 2.5,
        18,
        100,
      ));
      const grade = scoreGrade(score);
      if (elements.average) elements.average.textContent = `${score}%`;
      setResultState(elements, grade.key);
      setVerdict(elements, `${summary} · ${score}%`, grade.key);
      elements.panel.dataset.complete = 'true';
      stage.dataset.phase = 'complete';
      finishTimer = window.setTimeout(() => {
        finish({ score, grade: grade.key, cancelled: false, rounds: [...scores], cropType: meta.cropType });
      }, FINAL_DELAY_MS);
    }

    function handleEscape(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }

    const context = {
      game: elements.game,
      panel: elements.panel,
      stage,
      meta: { ...meta, cropIcon: String(cropIcon || meta.cropIcon), cropLabel: String(cropLabel || meta.cropLabel) },
      mobile,
      scores,
      verdict: elements.verdict,
      record,
      complete,
      addMistake,
      addMiss,
      isDone: () => settled || completing,
      on,
      later,
      loop,
    };

    cancelActiveGame = cancel;
    on(window, 'keydown', handleEscape, true);
    loop((now) => {
      if (completing) return;
      remainingMs = Math.max(0, meta.durationMs - (now - startedAt));
      timeOutput.textContent = (remainingMs / 1000).toFixed(1);
      if (remainingMs <= 0) complete('Время вышло, собрана только часть урожая');
    });

    updateStats();
    window.requestAnimationFrame(() => {
      if (settled) return;
      elements.panel.dataset.visible = 'true';
      if (meta.cropType === 'apple') setupAppleCropGame(context);
      else if (meta.cropType === 'orange') setupOrangeCropGame(context);
      else if (meta.cropType === 'wheat') setupWheatCropGame(context);
      else setupCornCropGame(context);
    });
  });
}

export function cancelFarmMiniGame() {
  cancelActiveGame?.();
}

export function playFarmMiniGame({ action = 'weed', cropType = '', cropIcon = '🌾', cropLabel = '' } = {}) {
  cancelFarmMiniGame();
  const crop = { cropType, cropIcon, cropLabel };
  if (action === 'water') return playSequenceGame(crop);
  if (action === 'harvest') return playCropHarvestGame(crop);
  return playPrecisionGame(crop);
}
