import { register } from '../../src/router.js';
import { state, save } from '../../src/state.js';
import { getCityConfig, normalizeCityId } from '../../src/cities/index.js';

/* ------------------------------------------------------------
   ЗАГРУЗКА PNG-карт
   ------------------------------------------------------------ */
const MAP_FILES = import.meta.glob('../../*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

function getMapByFileName(fileName) {
  const entry = Object.entries(MAP_FILES)
    .find(([path]) => path.endsWith(`/${fileName}`));
  return entry?.[1] || null;
}

function getCityMap(city) {
  const mapPath     = String(city.map || '').replace(/^\.?\//, '');
  const mapFileName = mapPath.split('/').pop();
  return getMapByFileName(mapFileName) || getMapByFileName('UkraineMap.png');
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/* ------------------------------------------------------------
   SVG-МАСКА ГОРОДА (рваный край)
   ------------------------------------------------------------ */
const CITY_SHAPES = [
  /* ——— основной массив города ——— */
  [
    [180,210],[240,170],[320,150],[410,140],[490,155],
    [560,175],[620,200],[680,230],[730,270],[770,320],
    [800,380],[820,450],[830,520],[820,590],[800,650],
    [760,700],[710,740],[650,770],[580,790],[510,800],
    [440,795],[370,780],[310,755],[260,720],[220,680],
    [195,630],[180,575],[170,515],[165,450],[165,385],
    [170,320],[175,260],
  ],
  /* ——— острова / районы ——— */
  [[120,470],[150,440],[165,470],[155,510],[125,515],[110,495]],
  [[840,280],[870,270],[885,295],[875,320],[850,325],[835,305]],
  [[600,850],[640,840],[665,865],[655,890],[615,895],[595,875]],
];

function shapeToPath(pts) {
  return pts.reduce(
    (acc,[x,y],i) => acc + (i ? `L${x},${y}` : `M${x},${y}`),
    '',
  ) + 'Z';
}

function buildCityMaskDataUrl() {
  const paths = CITY_SHAPES.map(shapeToPath).join(' ');
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
  <defs>
    <filter id="tear" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="38" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </defs>
  <g filter="url(#tear)">
    <path d="${paths}" fill="white"/>
  </g>
</svg>`.trim();

  return `url("data:image/svg+xml,${encodeURIComponent(svg)
    .replace(/'/g,'%27').replace(/"/g,'%22')}")`;
}

/* ------------------------------------------------------------
   Детерминированный «уникальный» цвет по ID города
   ------------------------------------------------------------ */
function hueFromString(str){
  let h=0;
  for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))%360;
  return h;                            /* 0‒359 */
}

/* ------------------------------------------------------------
   Управление картой (zoom / drag / pinch)
   ------------------------------------------------------------ */
function enableMapControls(stage, viewport) {
  const MIN_SCALE    = 0.6;
  const MAX_SCALE    = 9;
  const WORLD_FACTOR = 1.0;            /* ★ было 1.6 */

  let scale = 1, x = 0, y = 0, world = 0;

  let isDrag = false, actId = null;
  let sX = 0, sY = 0, sMapX = 0, sMapY = 0;

  const pts = new Map();
  let pinchDist0 = 0, pinchScale0 = 1;
  let pinchCtr = { x: 0, y: 0 };

  function measureWorld() {
    const r = stage.getBoundingClientRect();
    world = Math.max(r.width, r.height) * WORLD_FACTOR;
    viewport.style.width  = `${world}px`;
    viewport.style.height = `${world}px`;
  }

  function limits() {
    const r = stage.getBoundingClientRect();
    const w = world * scale, h = world * scale;
    return {
      maxX: Math.max(0, (w - r.width )/2),
      maxY: Math.max(0, (h - r.height)/2),
    };
  }

  function apply() {
    const lim = limits();
    x = clamp(x, -lim.maxX, lim.maxX);
    y = clamp(y, -lim.maxY, lim.maxY);
    viewport.style.transform =
      `translate(-50%,-50%) translate3d(${x}px,${y}px,0) scale(${scale})`;
    stage.style.setProperty('--zoom', scale.toFixed(2));
  }

  function zoomAt(cx,cy,next) {
    const r = stage.getBoundingClientRect();
    const px = cx - r.left - r.width /2;
    const py = cy - r.top  - r.height/2;
    const old = scale;
    scale = clamp(next, MIN_SCALE, MAX_SCALE);
    const k = scale / old;
    x = px - (px - x)*k;
    y = py - (py - y)*k;
    apply();
  }

  /* ---------- pointer events ---------- */
  stage.addEventListener('pointerdown', ev => {
    if (ev.target.closest('.gta-map-header, .gta-map-footer')) return;

    pts.set(ev.pointerId,{ x:ev.clientX, y:ev.clientY });
    stage.setPointerCapture(ev.pointerId);

    if (pts.size === 1){
      isDrag=true; actId=ev.pointerId;
      sX=ev.clientX; sY=ev.clientY; sMapX=x; sMapY=y;
    } else if (pts.size===2){
      isDrag=false; actId=null;
      const [p1,p2]=[...pts.values()];
      pinchDist0=Math.hypot(p2.x-p1.x,p2.y-p1.y);
      pinchScale0=scale;
      pinchCtr={x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2};
    }
  });

  stage.addEventListener('pointermove', ev=>{
    if(!pts.has(ev.pointerId)) return;
    pts.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});

    if (pts.size===2){
      const [p1,p2]=[...pts.values()];
      const d=Math.hypot(p2.x-p1.x,p2.y-p1.y);
      if(pinchDist0>0){
        zoomAt(pinchCtr.x,pinchCtr.y, pinchScale0*(d/pinchDist0));
      }
      return;
    }

    if(isDrag && ev.pointerId===actId){
      x = sMapX + ev.clientX - sX;
      y = sMapY + ev.clientY - sY;
      apply();
    }
  });

  function end(ev){
    pts.delete(ev.pointerId);
    if(pts.size<2) pinchDist0=0;

    if(pts.size===1){
      const [id]=[...pts.keys()];
      const p=pts.get(id);
      isDrag=true; actId=id;
      sX=p.x; sY=p.y; sMapX=x; sMapY=y;
    }
    if(!pts.size){ isDrag=false; actId=null; }
  }
  stage.addEventListener('pointerup',end);
  stage.addEventListener('pointercancel',end);
  stage.addEventListener('pointerleave',end);

  stage.addEventListener('wheel', ev=>{
    ev.preventDefault();
    const d = ev.deltaY>0 ? -0.12 : 0.12;
    zoomAt(ev.clientX,ev.clientY, scale*(1+d));
  },{passive:false});

  stage.addEventListener('dblclick', ev=>{
    if(scale>1.1){ scale=1;x=0;y=0;apply(); return; }
    zoomAt(ev.clientX,ev.clientY,2.7);
  });

  window.addEventListener('resize', ()=>{
    measureWorld(); apply();
  });

  /* -------- стартовая инициализация -------- */
  measureWorld();
  scale = Math.min(
    stage.clientWidth  / world,
    stage.clientHeight / world
  );
  apply();
}

/* ====================================================================== */

register('home', root => {
  root.className = 'page home';

  const cityId = normalizeCityId(state.city);
  const city   = getCityConfig(cityId);

  if (state.city !== cityId){
    state.city     = cityId;
    state.cityName = city.name;
    save();
  }

  const mapSrc = getCityMap(city);
  root.dataset.city = cityId;

  /* ----------------------------- HTML ----------------------------- */
  root.innerHTML = `
    <main class="home-gameplay">
      <section class="gta-map-stage">
        <div class="gta-map-bg"></div>

        <div class="gta-water">
          <div class="gta-water-layer water-main"></div>
          <div class="gta-water-layer water-light"></div>
        </div>

        <div class="gta-map-viewport">
          <img class="gta-map-image" src="${mapSrc}" alt="${city.name}"
               loading="eager" decoding="async" />

          <div class="gta-map-markers">
            <button class="gta-marker marker-work"><span></span><b>Робота</b></button>
            <button class="gta-marker marker-base"><span></span><b>База</b></button>
            <button class="gta-marker marker-market"><span></span><b>Ринок</b></button>
          </div>
        </div>

        <header class="gta-map-header">
          <div class="gta-map-title"><span>MN MAP</span><strong>${city.name}</strong></div>
          <div class="gta-map-player">${state.nickname || 'Игрок'}</div>
        </header>

        <footer class="gta-map-footer">
          <span>Колесо / pinch — масштаб</span>
          <span>Перетаскивай карту</span>
          <span>Двойной клик — сброс</span>
        </footer>
      </section>
    </main>
  `;

  const stage    = root.querySelector('.gta-map-stage');
  const viewport = root.querySelector('.gta-map-viewport');

  /* --- маска + цветная обводка --- */
  viewport.style.setProperty('--mask-url', buildCityMaskDataUrl());
  const hue = hueFromString(cityId);
  viewport.style.setProperty('--outline-hue',  hue);
  viewport.style.setProperty('--outline-main', `hsl(${hue} 95% 65% / 0.95)`);
  viewport.style.setProperty('--outline-glow', `hsl(${hue} 95% 65% / 0.55)`);

  enableMapControls(stage, viewport);
});
