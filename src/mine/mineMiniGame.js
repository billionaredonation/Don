const GAME_STEPS = 4;

const GAME_META = Object.freeze({
  stone: Object.freeze({
    title: 'Разбейте слабые точки',
    statLabel: 'Точность ударов',
    timeLabel: 'На точку',
    actionLabel: '',
    readyLabel: 'Найдите первую слабую точку',
  }),
  coal: Object.freeze({
    title: 'Проложите линию разлома',
    statLabel: 'Точность разломов',
    timeLabel: 'До обвала',
    actionLabel: '',
    readyLabel: 'Ставьте разломы по порядку',
  }),
  metal: Object.freeze({
    title: 'Выберите силу удара',
    statLabel: 'Стабильность',
    timeLabel: 'На удар',
    actionLabel: 'Зафиксировать удар',
    readyLabel: 'Дождитесь нужной силы',
  }),
  copper: Object.freeze({
    title: 'Соберите медную жилу',
    statLabel: 'Проводимость',
    timeLabel: 'До затухания',
    actionLabel: '',
    readyLabel: 'Продолжите жилу от светящегося узла',
  }),
});

const COAL_PATTERNS = Object.freeze([
  Object.freeze([
    Object.freeze({ x: 18, y: 65 }),
    Object.freeze({ x: 37, y: 35 }),
    Object.freeze({ x: 61, y: 56 }),
    Object.freeze({ x: 82, y: 27 }),
  ]),
  Object.freeze([
    Object.freeze({ x: 16, y: 31 }),
    Object.freeze({ x: 39, y: 62 }),
    Object.freeze({ x: 63, y: 34 }),
    Object.freeze({ x: 84, y: 67 }),
  ]),
  Object.freeze([
    Object.freeze({ x: 21, y: 72 }),
    Object.freeze({ x: 43, y: 48 }),
    Object.freeze({ x: 58, y: 24 }),
    Object.freeze({ x: 81, y: 51 }),
  ]),
]);

const COPPER_PATHS = Object.freeze([
  Object.freeze([
    Object.freeze({ x: 10, y: 71 }),
    Object.freeze({ x: 29, y: 53 }),
    Object.freeze({ x: 47, y: 67 }),
    Object.freeze({ x: 67, y: 42 }),
    Object.freeze({ x: 89, y: 25 }),
  ]),
  Object.freeze([
    Object.freeze({ x: 10, y: 30 }),
    Object.freeze({ x: 30, y: 48 }),
    Object.freeze({ x: 49, y: 28 }),
    Object.freeze({ x: 68, y: 57 }),
    Object.freeze({ x: 90, y: 42 }),
  ]),
  Object.freeze([
    Object.freeze({ x: 9, y: 61 }),
    Object.freeze({ x: 28, y: 73 }),
    Object.freeze({ x: 48, y: 48 }),
    Object.freeze({ x: 69, y: 66 }),
    Object.freeze({ x: 90, y: 35 }),
  ]),
]);

let cancelActiveGame = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)] || items[0];
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

function strikeVerdict(score) {
  if (score >= 88) return `Точно в слабое место · ${score}%`;
  if (score >= 62) return `Хороший удар · ${score}%`;
  return `Порода зацеплена краем · ${score}%`;
}

function arenaMarkup(resourceType, mobile) {
  if (resourceType === 'coal') {
    return `
      <div class="mn-mine-game-stage mn-mine-coal-stage" data-mine-game-stage>
        <div class="mn-mine-coal-face" data-mine-coal-face>
          <span class="mn-mine-coal-depth mn-mine-coal-depth-a"></span>
          <span class="mn-mine-coal-depth mn-mine-coal-depth-b"></span>
          <svg class="mn-mine-coal-lines" viewBox="0 0 100 100" preserveAspectRatio="none" data-mine-coal-lines></svg>
          <div data-mine-coal-sites></div>
        </div>
        <p>${mobile ? 'Касайтесь пронумерованных слабых мест' : 'Ставьте разломы мышью по номерам от 1 до 4'}</p>
      </div>`;
  }

  if (resourceType === 'metal') {
    return `
      <div class="mn-mine-game-stage mn-mine-metal-stage" data-mine-game-stage>
        <div class="mn-mine-metal-forge">
          <span class="mn-mine-metal-spark mn-mine-metal-spark-a"></span>
          <span class="mn-mine-metal-spark mn-mine-metal-spark-b"></span>
          <div class="mn-mine-metal-gauge" data-mine-metal-gauge>
            <span class="mn-mine-metal-zone" data-mine-metal-zone></span>
            <span class="mn-mine-metal-marker" data-mine-metal-marker><i>⛏️</i></span>
          </div>
        </div>
        <p>${mobile ? 'Нажмите по шкале в нужный момент' : 'Нажмите Space, кнопку или саму шкалу'}</p>
      </div>`;
  }

  if (resourceType === 'copper') {
    return `
      <div class="mn-mine-game-stage mn-mine-copper-stage" data-mine-game-stage>
        <div class="mn-mine-copper-board" data-mine-copper-board></div>
        <p>${mobile ? 'Касайтесь соседних узлов и доведите жилу до выхода' : 'Проведите жилу по узлам от входа к выходу'}</p>
      </div>`;
  }

  return `
    <div class="mn-mine-game-stage mn-mine-stone-stage" data-mine-game-stage>
      <div class="mn-mine-stone-face" data-mine-stone-face>
        <span class="mn-mine-stone-layer mn-mine-stone-layer-a"></span>
        <span class="mn-mine-stone-layer mn-mine-stone-layer-b"></span>
        <span class="mn-mine-stone-target" data-mine-stone-target><i></i></span>
        <div class="mn-mine-stone-fractures" data-mine-stone-fractures></div>
      </div>
      <p>${mobile ? 'Ударьте пальцем точно в светящуюся точку' : 'Кликните точно по отмеченному слабому месту'}</p>
    </div>`;
}

function markup({ resourceType, resourceIcon, resourceLabel, mobile }) {
  const meta = GAME_META[resourceType] || GAME_META.stone;
  const dots = Array.from({ length: GAME_STEPS }, (_, index) => (
    `<i data-mine-game-dot="${index}" aria-label="Этап ${index + 1}"></i>`
  )).join('');

  return `
    <div class="mn-mine-minigame" data-mine-minigame data-game-type="${resourceType}" data-platform="${mobile ? 'mobile' : 'desktop'}">
      <div class="mn-mine-minigame-backdrop" aria-hidden="true"></div>
      <section class="mn-mine-minigame-panel" data-game-type="${resourceType}" data-has-action="${meta.actionLabel ? 'true' : 'false'}" role="dialog" aria-modal="true" aria-labelledby="mn-mine-game-title">
        <header>
          <i aria-hidden="true">${resourceIcon}</i>
          <span><small>Добыча · ${resourceLabel}</small><strong id="mn-mine-game-title">${meta.title}</strong></span>
          <b><em data-mine-game-round>1</em>/${GAME_STEPS}</b>
        </header>
        <div class="mn-mine-game-stats">
          <span><small>${meta.statLabel}</small><strong data-mine-game-average>—</strong></span>
          <span><small>${meta.timeLabel}</small><strong data-mine-game-time>—</strong></span>
        </div>
        ${arenaMarkup(resourceType, mobile)}
        <footer>
          <span>${dots}</span>
          <button type="button" data-mine-game-action ${meta.actionLabel ? '' : 'hidden'}>${meta.actionLabel}${!mobile && resourceType === 'metal' ? ' · Space' : ''}</button>
          <strong data-mine-game-verdict>${meta.readyLabel}</strong>
        </footer>
      </section>
    </div>`;
}

function setupStoneGame(context) {
  const { game, stage, record, complete, isDone, on, later, loop, timeOutput } = context;
  const face = game.querySelector('[data-mine-stone-face]');
  const target = game.querySelector('[data-mine-stone-target]');
  const fractures = game.querySelector('[data-mine-stone-fractures]');
  const roundDuration = 3600;
  let active = false;
  let targetX = 50;
  let targetY = 50;
  let roundStartedAt = 0;

  function finishStone() {
    complete('Камень расколот по слабым точкам');
  }

  function startRound() {
    if (isDone()) return;
    if (context.scores.length >= GAME_STEPS) {
      finishStone();
      return;
    }

    targetX = randomBetween(17, 83);
    targetY = randomBetween(20, 78);
    target.style.left = `${targetX}%`;
    target.style.top = `${targetY}%`;
    target.dataset.active = 'true';
    stage.dataset.phase = 'active';
    roundStartedAt = performance.now();
    active = true;
  }

  function addFracture(x, y, grade, missed = false) {
    const mark = document.createElement('span');
    mark.className = 'mn-mine-stone-fracture';
    mark.dataset.grade = missed ? 'missed' : grade;
    mark.style.left = `${x}%`;
    mark.style.top = `${y}%`;
    mark.style.rotate = `${Math.round(randomBetween(-28, 28))}deg`;
    fractures.appendChild(mark);
  }

  function finishRound(score, x, y, missed = false) {
    if (!active || isDone()) return;
    active = false;
    target.dataset.active = 'false';
    const grade = gradeForScore(score);
    addFracture(x, y, grade, missed);
    record(score, missed ? 'Слабая точка пропущена' : strikeVerdict(score));
    stage.dataset.hit = grade;
    later(() => {
      delete stage.dataset.hit;
      startRound();
    }, 360);
  }

  function handleStrike(event) {
    if (!active || isDone()) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = face.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    const dx = ((x - targetX) / 100) * rect.width;
    const dy = ((y - targetY) / 100) * rect.height;
    const distance = Math.hypot(dx, dy);
    const perfectRadius = Math.max(10, Math.min(rect.width, rect.height) * .055);
    let score = Math.round(clamp(104 - (distance / (perfectRadius * 3.25)) * 100, 0, 100));
    if (distance <= perfectRadius) score = Math.max(92, score);
    finishRound(score, x, y);
  }

  on(face, 'pointerdown', handleStrike);
  loop((now) => {
    if (!active) return;
    const remaining = Math.max(0, roundDuration - (now - roundStartedAt));
    timeOutput.textContent = (remaining / 1000).toFixed(1);
    if (remaining <= 0) finishRound(0, targetX, targetY, true);
  });
  later(startRound, 420);
}

function setupCoalGame(context) {
  const { game, stage, record, complete, isDone, on, loop, timeOutput, verdict } = context;
  const face = game.querySelector('[data-mine-coal-face]');
  const sitesRoot = game.querySelector('[data-mine-coal-sites]');
  const linesRoot = game.querySelector('[data-mine-coal-lines]');
  const points = pickRandom(COAL_PATTERNS);
  const decoys = [
    { x: randomBetween(24, 76), y: randomBetween(18, 30) },
    { x: randomBetween(27, 73), y: randomBetween(73, 84) },
  ];
  const duration = 17500;
  const startedAt = performance.now();
  let step = 0;
  let stepStartedAt = startedAt;
  let mistakes = 0;

  linesRoot.innerHTML = points.slice(1).map((point, index) => {
    const previous = points[index];
    return `<line x1="${previous.x}" y1="${previous.y}" x2="${point.x}" y2="${point.y}" data-mine-coal-line="${index + 1}"></line>`;
  }).join('');

  sitesRoot.innerHTML = [
    ...points.map((point, index) => (
      `<button type="button" class="mn-mine-coal-site" data-mine-coal-site="${index}" style="left:${point.x}%;top:${point.y}%" aria-label="Разлом ${index + 1}"><i>${index + 1}</i></button>`
    )),
    ...decoys.map((point, index) => (
      `<button type="button" class="mn-mine-coal-site is-decoy" data-mine-coal-decoy="${index}" style="left:${point.x}%;top:${point.y}%" aria-label="Ложная трещина"></button>`
    )),
  ].join('');

  function markMistake(element, x = null, y = null) {
    mistakes += 1;
    stage.dataset.feedback = 'error';
    verdict.textContent = 'Не та точка — пласт становится нестабильным';
    if (element) {
      element.dataset.wrong = 'true';
      window.setTimeout(() => delete element.dataset.wrong, 280);
    } else if (x != null && y != null) {
      const miss = document.createElement('span');
      miss.className = 'mn-mine-coal-miss';
      miss.style.left = `${x}%`;
      miss.style.top = `${y}%`;
      face.appendChild(miss);
      window.setTimeout(() => miss.remove(), 420);
    }
    window.setTimeout(() => delete stage.dataset.feedback, 240);
  }

  function handlePlacement(event) {
    if (isDone()) return;
    event.preventDefault();
    event.stopPropagation();
    const site = event.target.closest('[data-mine-coal-site]');

    if (!site || Number(site.dataset.mineCoalSite) !== step) {
      const rect = face.getBoundingClientRect();
      const x = rect.width ? clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100) : null;
      const y = rect.height ? clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100) : null;
      markMistake(event.target.closest('.mn-mine-coal-site'), x, y);
      return;
    }

    const rect = site.getBoundingClientRect();
    const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
    const precisionPenalty = clamp((distance / Math.max(1, rect.width / 2)) * 22, 0, 22);
    const speedPenalty = clamp((performance.now() - stepStartedAt) / 260, 0, 18);
    const score = Math.round(clamp(100 - precisionPenalty - speedPenalty - mistakes * 7, 25, 100));
    const currentStep = step;
    site.dataset.placed = 'true';
    linesRoot.querySelector(`[data-mine-coal-line="${currentStep}"]`)?.setAttribute('data-active', 'true');
    record(score, score >= 88 ? 'Разлом установлен точно' : score >= 62 ? 'Разлом держится' : 'Разлом нестабилен');
    step += 1;
    mistakes = 0;
    stepStartedAt = performance.now();

    if (step >= GAME_STEPS) complete('Угольный пласт раскрыт по линии разлома');
  }

  on(face, 'pointerdown', handlePlacement);
  loop((now) => {
    if (isDone()) return;
    const remaining = Math.max(0, duration - (now - startedAt));
    timeOutput.textContent = (remaining / 1000).toFixed(1);
    if (remaining <= 0) {
      while (context.scores.length < GAME_STEPS) record(0, 'Разлом не установлен');
      complete('Пласт частично обрушен');
    }
  });
}

function setupMetalGame(context) {
  const { game, stage, actionButton, record, complete, isDone, on, later, loop, timeOutput } = context;
  const zone = game.querySelector('[data-mine-metal-zone]');
  const marker = game.querySelector('[data-mine-metal-marker]');
  const roundDuration = 4800;
  let active = false;
  let roundStartedAt = 0;
  let markerPosition = 0;
  let zoneStart = 40;
  let zoneWidth = 18;

  function startRound() {
    if (isDone()) return;
    if (context.scores.length >= GAME_STEPS) {
      complete('Металлическая жила отделена чистым ударом');
      return;
    }
    zoneWidth = randomBetween(13, 19);
    zoneStart = randomBetween(8, 90 - zoneWidth);
    zone.style.left = `${zoneStart}%`;
    zone.style.width = `${zoneWidth}%`;
    roundStartedAt = performance.now();
    stage.dataset.phase = 'active';
    active = true;
  }

  function registerHit(forcedScore = null) {
    if (!active || isDone()) return;
    active = false;
    const center = zoneStart + zoneWidth / 2;
    const normalizedDistance = Math.abs(markerPosition - center) / Math.max(1, zoneWidth / 2);
    const score = forcedScore == null
      ? Math.round(clamp(normalizedDistance <= 1 ? 100 - normalizedDistance * 18 : 82 - (normalizedDistance - 1) * 42, 0, 100))
      : forcedScore;
    const grade = gradeForScore(score);
    stage.dataset.hit = grade;
    record(score, forcedScore === 0 ? 'Сила удара упущена' : score >= 88 ? 'Идеальная сила удара' : score >= 62 ? 'Металл отделён' : 'Удар прошёл вскользь');
    later(() => {
      delete stage.dataset.hit;
      startRound();
    }, 430);
  }

  function handleAction(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    registerHit();
  }

  function handleKeyDown(event) {
    if (event.code !== 'Space' || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    registerHit();
  }

  on(actionButton, 'pointerdown', handleAction);
  on(stage, 'pointerdown', handleAction);
  on(window, 'keydown', handleKeyDown, true);
  loop((now) => {
    if (!active) return;
    const elapsed = now - roundStartedAt;
    const progress = (elapsed * (0.061 + context.scores.length * .006)) % 200;
    markerPosition = progress <= 100 ? progress : 200 - progress;
    marker.style.left = `${markerPosition}%`;
    const remaining = Math.max(0, roundDuration - elapsed);
    timeOutput.textContent = (remaining / 1000).toFixed(1);
    if (remaining <= 0) registerHit(0);
  });
  later(startRound, 420);
}

function setupCopperGame(context) {
  const { game, stage, record, complete, isDone, on, loop, timeOutput, verdict } = context;
  const board = game.querySelector('[data-mine-copper-board]');
  const path = pickRandom(COPPER_PATHS);
  const decoys = [
    { x: path[1].x + randomBetween(-4, 6), y: clamp(path[1].y + (path[1].y > 50 ? -28 : 28), 14, 86), anchor: 1 },
    { x: path[2].x + randomBetween(-7, 7), y: clamp(path[2].y + (path[2].y > 50 ? -30 : 30), 14, 86), anchor: 2 },
    { x: path[3].x + randomBetween(-5, 5), y: clamp(path[3].y + (path[3].y > 50 ? -27 : 27), 14, 86), anchor: 3 },
  ];
  const duration = 19000;
  const startedAt = performance.now();
  let step = 1;
  let mistakes = 0;
  let stepStartedAt = startedAt;

  const pathLines = path.slice(1).map((point, index) => {
    const previous = path[index];
    return `<line class="mn-mine-copper-line" x1="${previous.x}" y1="${previous.y}" x2="${point.x}" y2="${point.y}" data-mine-copper-line="${index + 1}"></line>`;
  }).join('');
  const branchLines = decoys.map((point) => {
    const anchor = path[point.anchor];
    return `<line class="mn-mine-copper-branch" x1="${anchor.x}" y1="${anchor.y}" x2="${point.x}" y2="${point.y}"></line>`;
  }).join('');
  const pathNodes = path.map((point, index) => (
    `<button type="button" class="mn-mine-copper-node${index === 0 ? ' is-active is-start' : ''}${index === path.length - 1 ? ' is-finish' : ''}" data-mine-copper-step="${index}" style="left:${point.x}%;top:${point.y}%" aria-label="Узел жилы ${index + 1}">${index === 0 ? '●' : index === path.length - 1 ? '⚡' : ''}</button>`
  )).join('');
  const decoyNodes = decoys.map((point, index) => (
    `<button type="button" class="mn-mine-copper-node is-decoy" data-mine-copper-decoy="${index}" style="left:${point.x}%;top:${point.y}%" aria-label="Ложная жила"></button>`
  )).join('');

  board.innerHTML = `
    <svg class="mn-mine-copper-traces" viewBox="0 0 100 100" preserveAspectRatio="none">${pathLines}${branchLines}</svg>
    <div class="mn-mine-copper-nodes">${pathNodes}${decoyNodes}</div>`;

  function handleNode(event) {
    if (isDone()) return;
    const node = event.target.closest('.mn-mine-copper-node');
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();

    const nodeStep = Number(node.dataset.mineCopperStep);
    if (!Number.isFinite(nodeStep) || nodeStep !== step) {
      mistakes += 1;
      node.dataset.wrong = 'true';
      stage.dataset.feedback = 'error';
      verdict.textContent = 'Ложная ветка — вернитесь к активному узлу';
      window.setTimeout(() => {
        delete node.dataset.wrong;
        delete stage.dataset.feedback;
      }, 300);
      return;
    }

    const speedPenalty = clamp((performance.now() - stepStartedAt) / 300, 0, 22);
    const score = Math.round(clamp(100 - speedPenalty - mistakes * 14, 24, 100));
    node.classList.add('is-active');
    board.querySelector(`[data-mine-copper-line="${step}"]`)?.setAttribute('data-active', 'true');
    record(score, score >= 88 ? 'Жила проводит идеально' : score >= 62 ? 'Контакт восстановлен' : 'Контакт нестабилен');
    step += 1;
    mistakes = 0;
    stepStartedAt = performance.now();

    if (step >= path.length) complete('Медная жила собрана до самого выхода');
  }

  on(board, 'pointerdown', handleNode);
  loop((now) => {
    if (isDone()) return;
    const remaining = Math.max(0, duration - (now - startedAt));
    timeOutput.textContent = (remaining / 1000).toFixed(1);
    if (remaining <= 0) {
      while (context.scores.length < GAME_STEPS) record(0, 'Жила погасла');
      complete('Удалось сохранить только часть медной жилы');
    }
  });
}

export function cancelMineMiniGame() {
  cancelActiveGame?.();
  cancelActiveGame = null;
}

export function playMineMiniGame({ resourceType = 'stone', resourceIcon = '🪨', resourceLabel = 'Сырьё' } = {}) {
  cancelMineMiniGame();

  const normalizedType = GAME_META[resourceType] ? resourceType : 'stone';
  const mobile = isMobileGameplay();
  document.body.insertAdjacentHTML('beforeend', markup({
    resourceType: normalizedType,
    resourceIcon,
    resourceLabel,
    mobile,
  }));

  const game = document.querySelector('[data-mine-minigame]');
  const panel = game?.querySelector('.mn-mine-minigame-panel');
  const stage = game?.querySelector('[data-mine-game-stage]');
  const actionButton = game?.querySelector('[data-mine-game-action]');
  const roundOutput = game?.querySelector('[data-mine-game-round]');
  const averageOutput = game?.querySelector('[data-mine-game-average]');
  const timeOutput = game?.querySelector('[data-mine-game-time]');
  const verdict = game?.querySelector('[data-mine-game-verdict]');
  const dots = [...(game?.querySelectorAll('[data-mine-game-dot]') || [])];

  return new Promise((resolve) => {
    let settled = false;
    let completing = false;
    let finishTimer = 0;
    const cleanups = [];
    const scores = [];

    function cleanup() {
      window.clearTimeout(finishTimer);
      cleanups.splice(0).reverse().forEach((fn) => {
        try { fn(); } catch {}
      });
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

    function on(target, eventName, handler, options) {
      if (!target?.addEventListener) return;
      target.addEventListener(eventName, handler, options);
      cleanups.push(() => target.removeEventListener(eventName, handler, options));
    }

    function later(callback, delay) {
      const timer = window.setTimeout(() => {
        if (!settled) callback();
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

    function renderAverage() {
      const average = scores.length
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : 0;
      averageOutput.textContent = scores.length ? `${average}%` : '—';
    }

    function record(score, message) {
      if (settled || completing || scores.length >= GAME_STEPS) return;
      const normalizedScore = Math.round(clamp(Number(score) || 0, 0, 100));
      const grade = gradeForScore(normalizedScore);
      const index = scores.length;
      scores.push(normalizedScore);
      if (dots[index]) dots[index].dataset.grade = grade;
      panel.dataset.result = grade;
      verdict.textContent = message;
      roundOutput.textContent = String(Math.min(GAME_STEPS, scores.length + 1));
      renderAverage();
    }

    function complete(summary) {
      if (settled || completing) return;
      completing = true;
      const score = Math.round(scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length));
      const grade = gradeForScore(score);
      panel.dataset.result = grade;
      panel.dataset.complete = 'true';
      verdict.textContent = `${summary} · ${score}%`;
      if (actionButton) actionButton.disabled = true;
      finishTimer = window.setTimeout(() => {
        finish({ cancelled: false, score, grade, rounds: [...scores] });
      }, 780);
    }

    function handleGlobalKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }

    const context = {
      game,
      panel,
      stage,
      actionButton,
      roundOutput,
      averageOutput,
      timeOutput,
      verdict,
      dots,
      scores,
      mobile,
      record,
      complete,
      isDone: () => settled || completing,
      on,
      later,
      loop,
    };

    cancelActiveGame = cancel;
    on(window, 'keydown', handleGlobalKeyDown, true);
    window.requestAnimationFrame(() => {
      if (settled) return;
      panel.dataset.visible = 'true';
      if (normalizedType === 'coal') setupCoalGame(context);
      else if (normalizedType === 'metal') setupMetalGame(context);
      else if (normalizedType === 'copper') setupCopperGame(context);
      else setupStoneGame(context);
    });
  });
}
