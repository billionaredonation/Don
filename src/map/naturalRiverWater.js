import { resolveMaterialPreset } from './materialPresets.js';

/**
 * GPU water surface in world/map coordinates. The enclosing DOM element owns
 * the shoreline mask, so the shader never tries to infer geography or roads.
 * GPU failure (including context loss) falls back to Canvas 2D.
 */
const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = 0.5 * (a_position + 1.0);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
const FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_color;
uniform float u_speed;
uniform float u_strength;
// Surface normals from several SHORT, slowly travelling ripples. No large
// cellular noise or concentric bands: these were producing a cloth effect.
float wave(vec2 p, vec2 direction, float frequency, float velocity, float t) {
  return sin(dot(p,normalize(direction))*frequency + t*velocity);
}
float heightField(vec2 p,float t) {
  float h = 0.0;
  h += 0.42*wave(p,vec2(1.0,0.31),0.92,0.85,t);
  h += 0.27*wave(p,vec2(-0.27,1.0),1.37,-0.72,t);
  h += 0.17*wave(p,vec2(0.8,-0.65),2.28,1.16,t);
  h += 0.08*wave(p,vec2(-0.7,-0.42),3.61,-0.93,t);
  return h;
}
void main() {
  // Map pixels, not canvas UV, determine ripple scale at every aspect ratio.
  // Very small displacement keeps the water flat and prevents fabric folds.
  vec2 p = v_uv*u_resolution/28.0;
  float t = u_time*u_speed;
  float stepSize=0.085;
  float h=heightField(p,t);
  vec2 slope=vec2(heightField(p+vec2(stepSize,0.0),t)-heightField(p-vec2(stepSize,0.0),t),
                   heightField(p+vec2(0.0,stepSize),t)-heightField(p-vec2(0.0,stepSize),t))/(2.0*stepSize);
  vec3 n=normalize(vec3(-slope*0.22, 1.0));
  vec3 light=normalize(vec3(-0.40,0.35,0.85));
  float diffuse=clamp(dot(n,light),0.0,1.0);
  float glint=pow(max(0.0,dot(reflect(-light,n),vec3(0.0,0.0,1.0))), 38.0);
  float micro=sin(p.x*5.2+t*1.15)*sin(p.y*3.9-t*0.74);
  float brightness=0.95+0.055*diffuse+0.018*h+0.015*micro;
  vec3 col=clamp(u_color*brightness+vec3(0.055,0.105,0.125)*glint*u_strength,0.0,1.0);
  gl_FragColor=vec4(col,1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader); throw new Error(message || 'Shader compilation failed');
  }
  return shader;
}

function initWebGL(canvas, preset) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) {
    const m = gl.getProgramInfoLog(program); gl.deleteProgram(program);
    throw new Error(m || 'Shader linking failed');
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program,'a_position');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const uTime = gl.getUniformLocation(program,'u_time');
  const uResolution = gl.getUniformLocation(program,'u_resolution');
  gl.uniform3fv(gl.getUniformLocation(program,'u_color'),preset.color);
  gl.uniform1f(gl.getUniformLocation(program,'u_speed'),preset.waveSpeed);
  gl.uniform1f(gl.getUniformLocation(program,'u_strength'),preset.rippleStrength);
  return {
    draw(t) {
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform1f(uTime,t);
      gl.uniform2f(uResolution,canvas.width,canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    },
    dispose() { gl.deleteBuffer(buffer); gl.deleteProgram(program); },
  };
}

function init2D(canvas,preset) {
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) return null;
  const rgb = preset.color.map(v=>Math.round(v*255));
  // Cached noise shapes; no per-frame ImageData allocations.
  const flecks = Array.from({length:90},(_,i)=>({
    x: ((i*137.508)%100)/100, y: ((i*73.71)%100)/100,
    phase:i*1.72, radius:1+(i%3), speed:0.1+(i%7)*0.025,
  }));
  return {
    draw(t) {
      const w=canvas.width,h=canvas.height;
      ctx.fillStyle=`rgb(${rgb.join(',')})`; ctx.fillRect(0,0,w,h);
      for(const f of flecks) {
        const x=((f.x+t*f.speed*0.012)%1)*w;
        const y=(f.y+Math.sin(t*0.37+f.phase)*0.012)*h;
        const alpha=0.025+0.045*(0.5+0.5*Math.sin(t*0.9+f.phase));
        ctx.fillStyle=`rgba(195,235,221,${alpha})`;
        ctx.beginPath();ctx.ellipse(x,y,f.radius*2.2,Math.max(0.35,f.radius*0.22),Math.sin(f.phase)*0.25,0,Math.PI*2);ctx.fill();
      }
    },
    dispose() {},
  };
}

export function enableNaturalRiverWater(viewport, options = {}) {
  const canvas = viewport?.querySelector('.gta-map-animated-water .gta-water-surface');
  if (!canvas) return () => {};
  const preset = resolveMaterialPreset(options.material || viewport.dataset.waterMaterial || 'water');
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches || false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const ratioValue = Number(viewport?.dataset?.mapRatio);
  const mapRatio = Number.isFinite(ratioValue)&&ratioValue>0.2&&ratioValue<3 ? ratioValue : .75;
  const targetWidth = coarse ? 512 : 896;
  canvas.width=targetWidth; canvas.height=Math.round(targetWidth*mapRatio);
  let renderer, mode='none', frame=0, previous=0, closed=false, start=null;
  try { renderer=initWebGL(canvas,preset); if(renderer) mode='webgl'; }
  catch (err) { console.warn('[MN materials] WebGL unavailable:',err); }
  if(!renderer) {
    // WebGL context occupies a canvas even if compilation fails: swap it for a new Canvas 2D.
    const replacement = document.createElement('canvas');
    replacement.className=canvas.className;
    replacement.width=canvas.width; replacement.height=canvas.height;
    canvas.replaceWith(replacement);
    renderer=init2D(replacement,preset);
    if(renderer) mode='canvas2d';
  }
  viewport.dataset.materialRenderer=mode;
  if(!renderer) return () => {};
  const interval=1000/(coarse?24:35);
  const draw=(now)=>{
    if(closed) return;
    frame=requestAnimationFrame(draw);
    if(document.hidden || (now-previous<interval)) return;
    previous=now;
    if(start===null) start=now;
    renderer.draw(reduced?0:(now-start)/1000);
  };
  let activeCanvas = viewport.querySelector('.gta-map-animated-water .gta-water-surface');
  function lost(event) {
    event.preventDefault();
    if (closed) return;
    cancelAnimationFrame(frame);
    activeCanvas.removeEventListener('webglcontextlost', lost);
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.className = activeCanvas.className;
    fallbackCanvas.width = activeCanvas.width;
    fallbackCanvas.height = activeCanvas.height;
    activeCanvas.replaceWith(fallbackCanvas);
    activeCanvas = fallbackCanvas;
    renderer = init2D(fallbackCanvas, preset);
    viewport.dataset.materialRenderer = renderer ? 'canvas2d' : 'unavailable';
    if (renderer) {
      previous=0;
      if (reduced) renderer.draw(0);
      else frame=requestAnimationFrame(draw);
    }
  }
  activeCanvas.addEventListener('webglcontextlost', lost);
  if(reduced) renderer.draw(0);
  else frame=requestAnimationFrame(draw);
  return ()=>{
    closed=true;cancelAnimationFrame(frame);activeCanvas.removeEventListener('webglcontextlost',lost);
    renderer.dispose();viewport.removeAttribute('data-material-renderer');
  };
}
