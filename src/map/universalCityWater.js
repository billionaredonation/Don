import { enableNaturalRiverWater } from './naturalRiverWater.js';

// No external masks. The mask exists only in memory, calculated from the actual
// map image or rasterized from world-space material-zone polygons.
const cached = new Map();
const CACHE_LIMIT = 4;
function remember(key, promise) {
  cached.set(key, promise);
  if (cached.size > CACHE_LIMIT) cached.delete(cached.keys().next().value);
  return promise;
}
function createCanvas(w,h) {const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
async function loadImage(url) {
  const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding='async';
  await new Promise((resolve,reject)=>{im.onload=resolve; im.onerror=()=>reject(new Error('Map cannot be sampled (CORS or source error)'));im.src=url;});
  return im;
}
function makeBlob(canvas) {return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}

function polygonMask(polygons, width, height) {
  const c=createCanvas(width,height), ctx=c.getContext('2d');
  ctx.fillStyle='white';
  let count=0;
  for(const zone of polygons){
    const points=zone?.points || zone?.polygon;
    if(!Array.isArray(points) || points.length<3)continue;
    ctx.beginPath();
    for(let i=0;i<points.length;i++){
      const p=points[i]; const x=Number(Array.isArray(p)?p[0]:p.x), y=Number(Array.isArray(p)?p[1]:p.y);
      if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      // Geometries use normalized 0..1 coordinates by default.
      const px=zone.pixelCoordinates?x:x*width, py=zone.pixelCoordinates?y:y*height;
      if(i===0)ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath(); ctx.fill(); count++;
  }
  return count ? c : null;
}

function detectPixels(im) {
  const scale=Math.min(1, 1600/Math.max(im.naturalWidth,im.naturalHeight));
  const W=Math.round(im.naturalWidth*scale), H=Math.round(im.naturalHeight*scale);
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(im,0,0,W,H);
  const image=ctx.getImageData(0,0,W,H), rgba=image.data, n=W*H;
  const eligible=new Uint8Array(n);
  let whites=0, transparent=0, blues=0;
  for(let i=0;i<n;i++){
    const o=i*4,r=rgba[o],g=rgba[o+1],b=rgba[o+2],a=rgba[o+3];
    if(a<24){eligible[i]=1;transparent++;continue;}
    // Precise near-white reservoir, not pale peach residential blocks or sand.
    // Cherkasy maps use #fef8ef; beige housing has a substantially lower G/B.
    const pale = r>=251 && g>=242 && b>=232 && Math.abs(r-g)<=13 && r-b<=24;
    // Other standard basemaps can use a clearly blue reservoir.
    const blue = b>=65 && b>r*1.13 && (g>r*1.05 || b>g*1.12) && b-r>22;
    if(pale){eligible[i]=2;whites++;}
    else if(blue){eligible[i]=3;blues++;}
  }
  // Transparent cut-outs are ideal; otherwise select only one water palette.
  let type=0;
  if(transparent/n>0.015)type=1;
  else if(whites/n>0.04)type=2;
  else if(blues/n>0.025)type=3;
  if(!type)return null;
  const seen=new Uint8Array(n),queue=new Int32Array(n), out=new Uint8Array(n);
  let filled=0;
  function flood(seed){
    if(seen[seed] || eligible[seed]!==type)return;
    let head=0,tail=0; queue[tail++]=seed;seen[seed]=1;
    while(head<tail){
      const p=queue[head++];const x=p%W;
      if(x>0){const q=p-1;if(!seen[q]&&eligible[q]===type){seen[q]=1;queue[tail++]=q;}}
      if(x<W-1){const q=p+1;if(!seen[q]&&eligible[q]===type){seen[q]=1;queue[tail++]=q;}}
      if(p>=W){const q=p-W;if(!seen[q]&&eligible[q]===type){seen[q]=1;queue[tail++]=q;}}
      if(p<n-W){const q=p+W;if(!seen[q]&&eligible[q]===type){seen[q]=1;queue[tail++]=q;}}
    }
    // Filter tiny isolated spots and remove short pixel-level artifacts.
    if(tail>=Math.max(90,n*0.0003)){
      filled+=tail; for(let j=0;j<tail;j++)out[queue[j]]=255;
    }
  }
  for(let x=0;x<W;x++){flood(x);flood((H-1)*W+x);}
  for(let y=0;y<H;y++){flood(y*W);flood(y*W+W-1);}
  // For pale cartographic backgrounds, isolated off-white spaces may be
  // buildings or courtyards. Never flood them as water. For blue/transparent
  // maps, isolated lakes may be added if their component is sufficiently large.
  if(type!==2)for(let i=0;i<n;i++)if(eligible[i]===type && !seen[i])flood(i);
  if(filled/n<0.008 || filled/n>0.68)return null;
  // Erode 1px inward (strictly never extend onto map's dark shoreline).
  const alpha=new Uint8ClampedArray(n);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const p=y*W+x;
    if(out[p] && out[p-1] && out[p+1] && out[p-W] && out[p+W])alpha[p]=255;
  }
  const result=ctx.createImageData(W,H);
  for(let i=0;i<n;i++){result.data[4*i]=255;result.data[4*i+1]=255;result.data[4*i+2]=255;result.data[4*i+3]=alpha[i];}
  ctx.putImageData(result,0,0);
  return canvas;
}
async function generate(mapSrc, zones) {
  const image=await loadImage(mapSrc);
  const polygons=Array.isArray(zones)?zones:[];
  const target=polygonMask(polygons,image.naturalWidth,image.naturalHeight) || detectPixels(image);
  if(!target)return null;
  const blob=await makeBlob(target);
  return blob;
}
export function enableCityWater(viewport,{city,mapSrc}={}) {
  const layer=viewport?.querySelector('.gta-map-animated-water');
  if(!layer||!mapSrc)return ()=>{};
  let disposed=false, stop=()=>{}, url=null;
  const zones=city?.materialZones || city?.material_zones || city?.waterZones || city?.water_zones || [];
  const key=mapSrc+'|'+JSON.stringify(zones);
  viewport.dataset.waterStatus='detecting';
  const promise=cached.get(key) || remember(key,generate(mapSrc,zones).catch(e=>{cached.delete(key);throw e;}));
  promise.then(blob=>{
    if(disposed||!blob){if(!disposed)viewport.dataset.waterStatus='not-detected';return;}
    url=URL.createObjectURL(blob);
    layer.style.setProperty('--mn-water-mask',`url(${JSON.stringify(url)})`);
    layer.classList.add('is-ready');
    viewport.dataset.waterStatus='active';
    viewport.dataset.waterMode=zones.length?'geometry':'map-pixels';
    const material=city?.waterMaterial||city?.water_material||'water';
    viewport.dataset.waterMaterial=material;
    stop=enableNaturalRiverWater(viewport,{material});
  }).catch(e=>{
    if(disposed)return;
    viewport.dataset.waterStatus='read-failed';
    console.warn('[MN water] Could not read this map image; use same-origin map or specify materialZones.',e);
  });
  return ()=>{
    disposed=true;stop();layer.classList.remove('is-ready');
    layer.style.removeProperty('--mn-water-mask');
    if(url)URL.revokeObjectURL(url);
    delete viewport.dataset.waterMaterial;
  };
}
