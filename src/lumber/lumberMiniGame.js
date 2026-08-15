let cancelActiveGame = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);
}

function gameShell({ mode, icon, eyebrow, title, instruction }) {
  const assetBase = String(import.meta.env.BASE_URL || '/');
  const visual = mode === 'saw'
    ? `<img src="${assetBase}benzopila.png" alt="" data-lumber-game-tool>`
    : '<span data-lumber-game-tool>🪓</span>';
  return `
    <div class="mn-lumber-minigame" data-lumber-minigame data-mode="${mode}">
      <button class="mn-lumber-minigame-backdrop" type="button" data-lumber-game-cancel aria-label="Отменить"></button>
      <section class="mn-lumber-minigame-panel" role="dialog" aria-modal="true">
        <header><i>${escapeHtml(icon)}</i><span><small>${escapeHtml(eyebrow)}</small><strong>${escapeHtml(title)}</strong></span><b><em data-lumber-game-progress>0</em>/4</b></header>
        <div class="mn-lumber-game-stats"><span><small>Точность</small><strong data-lumber-game-score>0%</strong></span><span><small>Время</small><strong data-lumber-game-time>—</strong></span></div>
        <div class="mn-lumber-game-stage" data-lumber-game-stage>
          <div class="mn-lumber-game-wood" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="mn-lumber-game-track" data-lumber-game-track><i class="mn-lumber-game-zone" data-lumber-game-zone></i><b data-lumber-game-cursor></b></div>
          <div class="mn-lumber-game-tool">${visual}</div>
          <p data-lumber-game-verdict>${escapeHtml(instruction)}</p>
        </div>
        <button class="mn-lumber-game-action" type="button" data-lumber-game-action>${mode === 'saw' ? 'Зафиксировать рез' : 'Ударить'}</button>
        <footer>Нажмите кнопку, пробел или коснитесь рабочей зоны, когда указатель находится в зелёном секторе.</footer>
      </section>
    </div>`;
}

function playTimingGame({ mode, icon, eyebrow, title, instruction, durationMs, speed }) {
  cancelLumberMiniGame();
  document.body.insertAdjacentHTML('beforeend', gameShell({ mode, icon, eyebrow, title, instruction }));
  const game = document.querySelector('[data-lumber-minigame]');
  const panel = game?.querySelector('.mn-lumber-minigame-panel');
  const action = game?.querySelector('[data-lumber-game-action]');
  const stage = game?.querySelector('[data-lumber-game-stage]');
  const cursor = game?.querySelector('[data-lumber-game-cursor]');
  const zone = game?.querySelector('[data-lumber-game-zone]');
  const progressOutput = game?.querySelector('[data-lumber-game-progress]');
  const scoreOutput = game?.querySelector('[data-lumber-game-score]');
  const timeOutput = game?.querySelector('[data-lumber-game-time]');
  const verdict = game?.querySelector('[data-lumber-game-verdict]');

  return new Promise((resolve) => {
    const scores = [];
    const startedAt = performance.now();
    let frame = 0;
    let step = 0;
    let closed = false;
    let zoneCenter = 50;
    let zoneWidth = mode === 'saw' ? 20 : 24;

    function setZone() {
      zoneWidth = Math.max(mode === 'saw' ? 13 : 16, zoneWidth - step * 1.6);
      zoneCenter = 19 + Math.random() * 62;
      if (zone) {
        zone.style.left = `${zoneCenter - zoneWidth / 2}%`;
        zone.style.width = `${zoneWidth}%`;
      }
    }

    function currentPosition(now = performance.now()) {
      const phase = ((now - startedAt) / 1000) * speed;
      return (Math.sin(phase) + 1) * 50;
    }

    function finish(result) {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown, true);
      action?.removeEventListener('click', strike);
      stage?.removeEventListener('pointerdown', strike);
      game?.querySelectorAll('[data-lumber-game-cancel]').forEach((button) => button.removeEventListener('click', cancel));
      game?.remove();
      document.body.classList.remove('mn-lumber-minigame-open');
      cancelActiveGame = null;
      resolve(result);
    }

    function cancel() {
      finish({ cancelled: true, score: 0 });
    }

    function strike(event) {
      event?.preventDefault?.();
      if (closed || step >= 4) return;
      const position = currentPosition();
      const distance = Math.abs(position - zoneCenter);
      const hitRadius = zoneWidth / 2;
      const score = Math.round(clamp(100 - Math.max(0, distance - hitRadius * .25) * 4.2, 24, 100));
      scores.push(score);
      step += 1;
      if (progressOutput) progressOutput.textContent = String(step);
      if (scoreOutput) scoreOutput.textContent = `${Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)}%`;
      if (verdict) verdict.textContent = score >= 88 ? 'Идеально по разметке!' : score >= 62 ? 'Хорошо, продолжайте.' : 'Край задет — следующий проход точнее.';
      stage?.querySelector(`.mn-lumber-game-wood i:nth-child(${step})`)?.setAttribute('data-cut', 'true');
      stage?.setAttribute('data-feedback', score >= 62 ? 'good' : 'poor');
      window.setTimeout(() => stage?.removeAttribute('data-feedback'), 260);
      if (step >= 4) {
        action.disabled = true;
        window.setTimeout(() => finish({
          cancelled: false,
          score: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
        }), 520);
      } else {
        setZone();
      }
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      } else if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        strike(event);
      }
    }

    function loop(now) {
      if (closed) return;
      const left = Math.max(0, durationMs - (now - startedAt));
      if (timeOutput) timeOutput.textContent = `${(left / 1000).toFixed(1)} сек.`;
      if (cursor) cursor.style.left = `${currentPosition(now)}%`;
      if (left <= 0) {
        const fallback = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 25;
        finish({ cancelled: false, score: fallback });
        return;
      }
      frame = requestAnimationFrame(loop);
    }

    setZone();
    action?.addEventListener('click', strike);
    stage?.addEventListener('pointerdown', strike);
    game?.querySelectorAll('[data-lumber-game-cancel]').forEach((button) => button.addEventListener('click', cancel));
    window.addEventListener('keydown', onKeyDown, true);
    document.body.classList.add('mn-lumber-minigame-open');
    cancelActiveGame = cancel;
    requestAnimationFrame(() => panel?.setAttribute('data-visible', 'true'));
    frame = requestAnimationFrame(loop);
  });
}

export function playLumberChopMiniGame({ treeIcon = '🌳', treeLabel = 'дерево' } = {}) {
  return playTimingGame({
    mode: 'chop', icon: treeIcon, eyebrow: 'Работа топором', title: `Срубите ${String(treeLabel).toLowerCase()}`,
    instruction: 'Поймайте зелёный сектор четырьмя ударами.', durationMs: 18500, speed: 3.15,
  });
}

export function playLumberSawMiniGame() {
  return playTimingGame({
    mode: 'saw', icon: '🪵', eyebrow: 'Распиловка', title: 'Разрежьте бревно на 4 части',
    instruction: 'Проведите четыре точных реза бензопилой.', durationMs: 20500, speed: 3.8,
  });
}

export function cancelLumberMiniGame() {
  cancelActiveGame?.();
  cancelActiveGame = null;
  document.querySelector('[data-lumber-minigame]')?.remove();
  document.body.classList.remove('mn-lumber-minigame-open');
}
