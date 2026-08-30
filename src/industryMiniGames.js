import './industryMiniGames.css';
import { INDUSTRY_ROLES } from './industryConfig.js';

const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const shuffle = a => [...a].sort(() => Math.random() - 0.5);

function shell(role, title) {
  return `<div class="mn-industry-game" data-industry-game>
    <button data-game-cancel></button>
    <section data-mode="${role.game}">
      <header><i>${role.icon}</i><span><small>ПРОИЗВОДСТВЕННАЯ СМЕНА</small><strong>${esc(title || role.label)}</strong></span><b data-game-score>0/5</b></header>
      <main data-game-stage></main>
      <footer><small data-game-hint>Приготовьтесь…</small><button data-game-action>Начать</button></footer>
    </section>
  </div>`;
}

function timing(stage) {
  stage.innerHTML = '<div class="mn-timing"><i></i><b></b></div>';
  let x = 0, dir = 1;
  const timer = setInterval(() => {
    x += dir * 2.8;
    if (x > 96 || x < 0) dir *= -1;
    stage.style.setProperty('--x', `${x}%`);
  }, 16);
  return () => {
    clearInterval(timer);
    return x > 38 && x < 62;
  };
}

function loading(stage) {
  stage.innerHTML = '<div class="mn-loading"><b>📦</b><span></span><i></i></div>';
  let power = 0, down = false;
  const press = () => { down = true; };
  const up = () => { down = false; };
  stage.onpointerdown = press;
  window.addEventListener('pointerup', up);
  const timer = setInterval(() => {
    power = Math.max(0, Math.min(100, power + (down ? 2.7 : -1.2)));
    stage.style.setProperty('--power', `${power}%`);
  }, 16);
  return () => {
    clearInterval(timer);
    window.removeEventListener('pointerup', up);
    return power >= 55 && power <= 82;
  };
}

function inspection(stage, onHit) {
  const defect = Math.floor(Math.random() * 6);
  stage.innerHTML = `<div class="mn-inspection">${[0,1,2,3,4,5].map(i => `<button data-part="${i}"${i === defect ? ' data-defect="true"' : ''}>⚙️</button>`).join('')}</div>`;
  return () => new Promise(resolve => {
    stage.onclick = e => {
      const b = e.target.closest('[data-part]');
      if (!b) return;
      const ok = b.dataset.defect === 'true';
      onHit(ok);
      resolve(ok);
    };
  });
}

function sequence(stage, onHit, labels = ['1', '2', '3', '4']) {
  const order = shuffle(labels.map((label, index) => ({ label, index: index + 1 })));
  stage.innerHTML = `<div class="mn-packing">${order.map(v => `<button data-seq="${v.index}">${v.label}</button>`).join('')}</div>`;
  let next = 1;
  return () => new Promise(resolve => {
    stage.onclick = e => {
      const b = e.target.closest('[data-seq]');
      if (!b) return;
      const ok = Number(b.dataset.seq) === next;
      b.disabled = true;
      if (!ok) {
        onHit(false);
        resolve(false);
      } else if (++next > labels.length) {
        onHit(true);
        resolve(true);
      }
    };
  });
}

function mixing(stage) {
  stage.innerHTML = '<div class="mn-loading"><b>🌀</b><span></span><i></i></div>';
  let power = 45 + Math.random() * 10;
  let down = false;
  const press = () => { down = true; };
  const up = () => { down = false; };
  stage.onpointerdown = press;
  window.addEventListener('pointerup', up);
  const timer = setInterval(() => {
    power += down ? 1.9 : -1.35;
    power += (Math.random() - 0.5) * 1.4;
    power = Math.max(0, Math.min(100, power));
    stage.style.setProperty('--power', `${power}%`);
  }, 16);
  return () => {
    clearInterval(timer);
    window.removeEventListener('pointerup', up);
    return power >= 48 && power <= 72;
  };
}

function cement(stage) {
  stage.innerHTML = `<div class="mn-industry-recipe-game">
    <strong>Давление мельницы</strong>
    <div class="mn-loading"><b>⚪</b><span></span><i></i></div>
    <small>Удерживайте давление и фиксируйте его в рабочей зоне.</small>
  </div>`;
  let pressure = 20 + Math.random() * 25;
  let down = false;
  const press = () => { down = true; };
  const up = () => { down = false; };
  stage.onpointerdown = press;
  window.addEventListener('pointerup', up);
  const timer = setInterval(() => {
    pressure += down ? 2.4 : -1.25;
    pressure = Math.max(0, Math.min(100, pressure));
    stage.style.setProperty('--power', `${pressure}%`);
  }, 16);
  return () => {
    clearInterval(timer);
    window.removeEventListener('pointerup', up);
    return pressure >= 58 && pressure <= 78;
  };
}

function concrete(stage, onHit) {
  return sequence(stage, onHit, ['Камень', 'Цемент', 'Вода', 'Смешивание']);
}

function operatorBuilder(recipe, stage, onHit) {
  const game = recipe?.operatorGame || 'timing';
  if (game === 'cement') return cement(stage);
  if (game === 'concrete') return concrete(stage, onHit);
  if (game === 'sequence') return sequence(stage, onHit, ['1', '2', '3', '4']);
  if (game === 'mixing') return mixing(stage);
  return timing(stage);
}

export function playIndustryMiniGame(roleId, context = {}) {
  const role = INDUSTRY_ROLES[roleId] || INDUSTRY_ROLES.loader;
  const title = roleId === 'operator' && context.recipe?.label
    ? `${role.label} · ${context.recipe.label}${context.rework ? ' · пересборка' : ''}`
    : role.label;

  document.querySelector('[data-industry-game]')?.remove();
  document.body.insertAdjacentHTML('beforeend', shell(role, title));
  const root = document.querySelector('[data-industry-game]');
  const stage = root.querySelector('[data-game-stage]');
  const action = root.querySelector('[data-game-action]');
  const score = root.querySelector('[data-game-score]');
  const hint = root.querySelector('[data-game-hint]');

  return new Promise(resolve => {
    let round = 0, hits = 0, active = null, locked = false;

    const finishRound = async ok => {
      hits += ok ? 1 : 0;
      round += 1;
      score.textContent = `${hits}/5`;
      hint.textContent = ok ? 'Операция выполнена' : 'Ошибка операции';
      await wait(300);
      if (round >= 5) {
        root.remove();
        resolve({ success: hits >= 3, score: hits, quality: Math.round(hits / 5 * 100) });
        return;
      }
      startRound();
    };

    const startRound = () => {
      locked = false;
      hint.textContent = `Этап ${round + 1} из 5`;
      const onHit = ok => {
        if (locked) return;
        locked = true;
        void finishRound(ok);
      };

      if (roleId === 'operator') active = operatorBuilder(context.recipe, stage, onHit);
      else if (roleId === 'quality') active = inspection(stage, onHit);
      else active = loading(stage);

      const asyncClickGame = roleId === 'quality' || (roleId === 'operator' && ['concrete', 'sequence'].includes(context.recipe?.operatorGame));
      action.textContent = asyncClickGame ? 'Выполнить' : 'Зафиксировать';
      if (asyncClickGame && active instanceof Function) active();
    };

    action.onclick = () => {
      if (!active) {
        startRound();
        return;
      }
      if (locked) return;
      const result = active();
      if (typeof result === 'boolean') {
        locked = true;
        void finishRound(result);
      }
    };

    root.querySelector('[data-game-cancel]').onclick = () => {
      root.remove();
      resolve({ success: false, cancelled: true, score: hits, quality: 0 });
    };
    action.textContent = 'Начать';
  });
}
