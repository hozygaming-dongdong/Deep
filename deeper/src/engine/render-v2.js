/* ============================================================
   DEEPER v2 — RENDER: a VIEW onto the deterministic engine.

   Draws the world by evaluating the engine's closed-form positions at
   the current continuous clock T. Nothing here decides outcomes — it
   only shows what the engine already determined.

   v2.1 scene (DESIGN-V2 §8.1/8.2, hao 2026-07-19: vessel removed): a
   plumb winch line drops out of the night sky, anchored at the TOP-CENTER
   of the screen; metric depth ruler on the right edge; 4 bands × 18 segments; bubbles /
   scatters / fish archetypes as the three entity kinds.

   Visual language from design-system.md: temperature axis (cold cyan
   risk ↔ warm gold reward), baked strata, grain, vignette, petrol-violet
   for the loss pole. No glow filters, no magenta.
   ============================================================ */
import {
  WORLD_W, ANCHOR_X, LAYERS, LAYER_DEPTH, CATCH_RADIUS, BP,
  SHARK_CONTACT_DIST, SEG_M, BAND_EDGES, BAND_INFO,
  layerDepthY, bandOf, currentDisp, lineXAtDepth, depthMeters,
} from './world.js';
import {
  fishX, fishY, fishZ, fishTailPhase, fishCatchRadius,
  sharkX, bubbleX, bubbleY, bubbleZ, bubblePopRadius,
  SCALE_SCORE, BUBBLE_TIERS, FISH_BODY_SIZE, BUBBLE_BODY_RADIUS,
} from './entities.js';

/* ---- 2.5D projection — z is depth INTO the screen; z=0 is the line's focal plane. */
const FOCAL=540, VANISH_X=270;
/* the rope has TWO real endpoints — the sky anchor (top-center of the screen)
   and the hook; above this depth the drawn rope runs straight for the engine
   curve so the waterline is a drifting CROSSING, never a pivot (hao). Below
   it the rope is exactly the corridor line — 所見即所得 intact. */
const LINE_BLEND=110;
/* 巨獸鏡頭平移(beastPanX)的加寬邊距——背景/海面/天空多畫這麼寬,pan 過去仍是海不是黑
   (hao 2026-07-22:海面左右側不能全黑、更寬的海面、保持整體設計)。 */
const PANM=170;
function projScale(z){ return FOCAL/(FOCAL+(z||0)); }
function projX(worldX,z){ return VANISH_X + (worldX-VANISH_X)*projScale(z); }
function haze(z){ const h=((z||0)+150)/600; return h<0?0:h>1?1:h; }

export const cv = document.getElementById('cv');
export const ctx = cv.getContext('2d');
export const LW = 540, LH = 960;
export const LAYOUT = { w:LW, h:LH, surfaceY:132 };   // v2.1: room for the sky band
let DPR = 1, scale = 1;

export function resize(){
  const stage = document.getElementById('stage');
  const w = stage.clientWidth, h = stage.clientHeight;
  DPR = Math.min(2, window.devicePixelRatio||1);
  cv.width = Math.round(w*DPR); cv.height = Math.round(h*DPR);
  scale = (w/LW)*DPR;
  ctx.setTransform(scale,0,0,scale,0,0);
  LAYOUT.w = LW; LAYOUT.h = h/(w/LW);
}

/* WALLET DISPLAY SCALE — fish labels and payout use the same economic value,
   written as CASH 1:1 (2dp) or PTS 1:100. */
const U = { k:1, dp:2, stake:50 };
export function setUnit(k, dp, stake){ U.k=k; U.dp=dp; U.stake=stake; }
function fmtU(money){
  const v=money*U.k;
  return U.dp ? v.toLocaleString('en-US',{minimumFractionDigits:U.dp, maximumFractionDigits:U.dp})
              : Math.round(v).toLocaleString('en-US');
}

const FD = "'Big Shoulders Display',Impact,sans-serif";
const FU = "'Hanken Grotesk',system-ui,sans-serif";
function setDisplay(px,wt){ ctx.font=(wt||900)+' '+px+"px "+FD; if('letterSpacing' in ctx) ctx.letterSpacing='0px'; }

// world depth (px) → screen Y. surfaceY offsets the waterline down.
function worldY(depth){ return LAYOUT.surfaceY + depth; }

// --- grain tile ---
const GRAIN_SZ = 128;
const grainCv = document.createElement('canvas'); grainCv.width=GRAIN_SZ; grainCv.height=GRAIN_SZ;
const gctx = grainCv.getContext('2d');
function regenGrain(){ const img=gctx.createImageData(GRAIN_SZ,GRAIN_SZ), d=img.data;
  for(let i=0;i<d.length;i+=4){ const v=Math.random()*255|0; d[i]=d[i+1]=d[i+2]=v; d[i+3]=255; } gctx.putImageData(img,0,0); }
regenGrain();
let grainPhase=0, grainTick=0;
let _seaFade=1;   // fish opacity for the cut→next-round cross-fade (set per-frame from fx.cutFade)

/* --- 4-band strata (v2.1): SHALLOWS cyan → REEF sea-green → DEEPER blue →
   ABYSS violet-black. Gradient per band, faint per-segment ticks. --- */
function bandStrata(L){
  const band=bandOf(L);
  if(band==='SHALLOWS') return ['#0F4D5C','#0C3E4B','#0A303B'];
  if(band==='REEF')     return ['#0C3540','#0A2A33','#092228'];
  if(band==='DEEPER')   return ['#0A1C2C','#091524','#0A101E'];
  return                       ['#0C0D1E','#0B0917','#0E0A18'];
}
// current streaks (decorative volume)
const STREAKS = Array.from({length:64}, ()=>({
  depth: Math.random()*(LAYERS*LAYER_DEPTH+300),
  x: Math.random()*WORLD_W, len: 20+Math.random()*42, a:0.06+Math.random()*0.10,
  sp: 0.6+Math.random()*0.9, z: Math.random()*520-120,
}));

/* the slow SWELL — a gentle whole-water heave (decorative layers only; the
   playable entities' positions stay the engine's, so what you see in the
   corridor is still exactly what you get). */
function swellY(depth, T){
  return 4.0*Math.sin(T*0.5 + depth*0.0055) + 2.2*Math.sin(T*0.83 + depth*0.011);
}

/* background volume school — the NON-PLAYABLE far family (v2.1 two-family z):
   no labels, never hookable, stacked in three depth layers purely for the
   sense of a living sea behind the playable foreground. (hao 2026-07-19:
   the deep z must READ as swimming fish — bigger flock, more present.) */
const BG_SCHOOL=[];
for(const [n,z0,z1,s0,s1] of [[24,260,420,11,16],[20,440,660,8,12],[16,680,920,5,9]]){
  for(let i=0;i<n;i++) BG_SCHOOL.push({
    x:Math.random()*WORLD_W, depth:40+Math.random()*(LAYERS*LAYER_DEPTH),
    z:z0+Math.random()*(z1-z0), amp:30+Math.random()*90, freq:0.10+Math.random()*0.25, ph:Math.random()*6.28,
    bob:6+Math.random()*14, bobF:0.18+Math.random()*0.4, bobP:Math.random()*6.28,
    sz:s0+Math.random()*(s1-s0), dir:Math.random()<0.5?1:-1, sp:8+Math.random()*18,
    tail:Math.random()*6.28 });
}
function drawBgSchool(T,cam){
  ctx.save();
  for(const b of BG_SCHOOL){
    const y=worldY(b.depth)-cam*0.7; if(y<-40||y>LAYOUT.h+40) continue;
    const psc=projScale(b.z), hz=haze(b.z);
    const xw=((((b.x + b.dir*T*b.sp) % (WORLD_W+140)) + (WORLD_W+140)) % (WORLD_W+140)) - 70
            + Math.sin(b.freq*T+b.ph)*b.amp;
    const x=projX(xw,b.z);
    const yy=y+Math.sin(b.bobF*T+b.bobP)*b.bob + swellY(b.depth,T)*(0.5+0.5*(1-hz));
    const sz=b.sz*psc;
    const flick=Math.sin(T*3.2+b.tail);                     // tail beat — they SWIM, not drift
    ctx.globalAlpha=0.135*(1-hz*0.45)+0.02; ctx.fillStyle= b.z>600?'#151129':'#0C202C';
    ctx.beginPath(); ctx.ellipse(x,yy,sz,sz*0.48,flick*0.06*b.dir,0,7); ctx.fill();
    ctx.save(); ctx.translate(x-b.dir*sz*0.8, yy); ctx.rotate(flick*0.5*b.dir);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-b.dir*sz*0.5,-sz*0.4); ctx.lineTo(-b.dir*sz*0.5,sz*0.4); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.globalAlpha=0.085*(1-hz*0.5); ctx.strokeStyle='#2C6068'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(x,yy,sz,sz*0.48,0,Math.PI*1.05,Math.PI*1.95); ctx.stroke();
  }
  ctx.restore();
}

/* internal waves — wide, slow petrol bands rolling through the water column;
   the SWELL made visible (hao 2026-07-19: 海底要有波浪湧動感). */
function drawInternalWaves(T, cam){
  const W=LAYOUT.w, H=LAYOUT.h;
  ctx.save();
  for(let k=0;k<7;k++){
    const d0=250+k*470;
    const y0=worldY(d0)-cam; if(y0<-90||y0>H+90) continue;
    const amp=8+k*1.5, wl=290+k*40, sp=(k%2? -1:1)*(5.5+k*0.6);
    ctx.globalAlpha=0.042+k*0.003;
    ctx.fillStyle= d0>1500? '#241B3A' : d0>700? '#14293C' : '#1B4550';
    ctx.beginPath(); ctx.moveTo(-PANM, y0+surf2(-PANM,T,wl,sp,amp));
    for(let x=-PANM+18;x<=W+PANM;x+=18) ctx.lineTo(x, y0+surf2(x,T,wl,sp,amp));
    ctx.lineTo(W+PANM, y0+72); ctx.lineTo(-PANM, y0+72);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function surf2(x,T,wl,sp,amp){
  return Math.sin((x+T*sp*8)/wl*6.283)*amp + Math.sin((x*0.53-T*sp*5)/wl*6.283)*amp*0.5;
}

/* star field for the night sky (fixed, decorative)
   v2.3c — spans far above the old 90px band, because the sky now continues past
   the top of the frame (drawSkyAndSea's fillTop). Density THINS upward by
   design: u² clusters the stars near the horizon where the gradient is still
   lit, and leaves the near-black top sparse — a uniform field up there reads as
   noise/texture rather than as sky. */
const STARS = Array.from({length:64},()=>{
  const u=Math.random();
  return { x:Math.random()*WORLD_W, y:90 - u*u*430,
    a:0.15+Math.random()*0.4, tw:0.5+Math.random()*1.6, ph:Math.random()*6.28,
    r:Math.random()<0.85?0.8:1.4 };
});

export function advanceAtmosphere(dt){
  grainPhase += dt*9; grainTick += dt; if(grainTick>0.1){ grainTick=0; regenGrain(); }
}

/* ================= SKY + SEA SURFACE (hao 2026-07-19 二修) ==============
   NO VESSEL. The line is a plumb line out of the night sky — its anchor is
   the TOP-CENTER OF THE SCREEN (not the waterline; the ship was removed).
   Night sky over a living WAVING surface; god-rays fan down from it. */
function surfWave(x, T){          // closed-form surface wave (decorative only)
  return 2.6*Math.sin(x*0.021 + T*1.05)
       + 1.7*Math.sin(x*0.047 - T*1.65)
       + 1.1*Math.sin(x*0.011 + T*0.55);
}
function drawSkyAndSea(T, cam, pierceX){
  const W=LAYOUT.w;
  if(pierceX==null) pierceX=ANCHOR_X;
  const sy = worldY(0)-cam;                     // waterline screen y (mean level)
  const skyTop = sy-LAYOUT.surfaceY-40;         // where the gradient's TOP colour sits
  /* v2.3c (hao: 最上方黑色那段應該要是夜空延伸出去, 現在會是黑的) — the FILL has to
     reach past the top of the frame, always. Tying it to skyTop meant the sky
     was a 172px band pinned above the waterline, so any time the camera sat
     high — or the dive's zoom widened what the frame covers — raw background
     showed through above it as a hard black edge.
     The GRADIENT keeps its original coordinates, so the colour ramp is
     untouched; canvas clamps past the last stop, which is exactly the desired
     reading: the night simply continues upward. */
  const fillTop = Math.min(skyTop, -260);
  if(sy < -40) return;                          // fully scrolled away

  // under-crest strip: where the wave rises above the mean line, show water
  ctx.fillStyle='#0F4D5C'; ctx.fillRect(-PANM, sy-9, W+PANM*2, 12);

  // --- night sky, filled down to the WAVING surface ---
  const g=ctx.createLinearGradient(0,skyTop,0,sy);
  g.addColorStop(0,'#060910'); g.addColorStop(0.58,'#0C1B2E'); g.addColorStop(0.92,'#1B3A54'); g.addColorStop(1,'#245272');
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.moveTo(-PANM,skyTop);
  ctx.lineTo(-PANM, sy+surfWave(-PANM,T));
  for(let x=-PANM+18;x<=W+PANM;x+=18) ctx.lineTo(x, sy+surfWave(x,T));
  ctx.lineTo(W+PANM, skyTop);
  ctx.closePath(); ctx.fill();
  // stars
  ctx.save();
  for(const s of STARS){
    const y=sy-LAYOUT.surfaceY+s.y; if(y>sy-14) continue;
    ctx.globalAlpha=(s.a+0.2)*(0.6+0.4*Math.sin(T*s.tw+s.ph));
    ctx.fillStyle='#C9DCE8'; ctx.fillRect(s.x, y, s.r, s.r);
  }
  ctx.restore();

  // --- sea surface: the WAVING waterline + a second crest + moving glints ---
  ctx.save();
  ctx.strokeStyle='rgba(214,238,240,0.75)'; ctx.lineWidth=2;
  ctx.beginPath();
  for(let x=-PANM;x<=W+PANM;x+=14){ const y=sy+surfWave(x,T); x===-PANM? ctx.moveTo(x,y):ctx.lineTo(x,y); }
  ctx.stroke();
  ctx.globalAlpha=0.28; ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=-PANM;x<=W+PANM;x+=16){ const y=sy+4.5+surfWave(x+60,T*0.9)*0.7; x===-PANM? ctx.moveTo(x,y):ctx.lineTo(x,y); }
  ctx.stroke();
  ctx.lineWidth=1.1;
  for(let i=0;i<9;i++){
    const gx=(i*67 + T*26)%(W+PANM*2+40)-PANM-20, gl=14+((i*37)%22);
    const gy=sy+surfWave(gx,T)+2.5+(i%3);
    ctx.globalAlpha=0.10+0.12*Math.sin(T*1.7+i*1.9);
    ctx.strokeStyle= i%3? 'rgba(214,238,240,0.8)' : 'rgba(246,194,67,0.55)';
    ctx.beginPath(); ctx.moveTo(gx,gy); ctx.lineTo(gx+gl,gy); ctx.stroke();
  }
  // a small standing ripple where the line pierces the water — the pierce
  // point is WHEREVER the top-anchor→hook line crosses (it drifts with the
  // sway; the surface is a crossing, not a pivot)
  ctx.globalAlpha=0.35;
  ctx.strokeStyle='rgba(233,242,240,0.8)'; ctx.lineWidth=1.2;
  ctx.beginPath();
  ctx.ellipse(pierceX, sy+surfWave(pierceX,T)*0.7+1.5, 9+1.4*Math.sin(T*2.2), 2.6, 0, 0, 7);
  ctx.stroke();
  ctx.restore();

  // --- god-rays fanning down from the surface around the line ---
  ctx.save();
  for(const [ox,wTop,wBot,len,ph] of [[-0.30,18,64,430,0],[ -0.06,26,92,560,2.1],[0.22,20,70,470,4.0]]){
    const sway=Math.sin(T*0.14+ph)*16;
    const x0=ANCHOR_X+ox*W+sway;
    const grad=ctx.createLinearGradient(0,sy,0,sy+len);
    grad.addColorStop(0,'rgba(158,222,231,0.10)'); grad.addColorStop(1,'rgba(158,222,231,0)');
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.moveTo(x0-wTop/2,sy); ctx.lineTo(x0+wTop/2,sy);
    ctx.lineTo(x0+wBot/2+sway*0.6,sy+len); ctx.lineTo(x0-wBot/2+sway*0.6,sy+len);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/* ================= METRIC DEPTH RULER (right edge, v2.1 §8.2) ========= */
function drawRuler(cam, hookDepth){
  const W=LAYOUT.w, H=LAYOUT.h;
  ctx.save(); ctx.textAlign='right';
  for(let L=1;L<=LAYERS;L++){
    const y=worldY(layerDepthY(L))-cam; if(y<-14||y>H+14) continue;
    const isBand = (L===3||L===7||L===12||L===18);
    ctx.globalAlpha=isBand?0.55:0.34;
    ctx.strokeStyle=isBand?'#9FB6BC':'#5E777D'; ctx.lineWidth=isBand?1.4:1;
    ctx.beginPath(); ctx.moveTo(W-(isBand?16:10),y); ctx.lineTo(W-4,y); ctx.stroke();
    ctx.fillStyle=isBand?'#9FB6BC':'#5E777D';
    ctx.font='600 9px '+FU; if('letterSpacing' in ctx) ctx.letterSpacing='0.5px';
    ctx.fillText(SEG_M[L]+'m'+(L===LAYERS?'+':''), W-20, y+3);
  }
  // live hook-depth chip riding the ruler
  if(hookDepth>4){
    const y=worldY(hookDepth)-cam;
    if(y>-10 && y<H+10){
      const m=Math.round(depthMeters(hookDepth));
      ctx.globalAlpha=0.92; setDisplay(11,800);
      const label=m+'m';
      const tw=ctx.measureText(label).width;
      ctx.fillStyle='rgba(5,8,10,0.78)'; ctx.fillRect(W-30-tw, y-8, tw+14, 15);
      ctx.strokeStyle='rgba(246,194,67,0.6)'; ctx.lineWidth=1; ctx.strokeRect(W-30-tw, y-8, tw+14, 15);
      ctx.fillStyle='#F6C243'; ctx.fillText(label, W-22, y+3.5);
      ctx.beginPath(); ctx.moveTo(W-14,y); ctx.lineTo(W-8,y-3.4); ctx.lineTo(W-8,y+3.4); ctx.closePath(); ctx.fill();
    }
  }
  if('letterSpacing' in ctx) ctx.letterSpacing='0px';
  ctx.restore();
}

/* draw the whole frame. engine = the createRound() api; hookDepth = the RENDERED
   (eased) hook depth in px; T = continuous clock; cam = camera depth offset.
   ambient=true → the IDLE resting view (hook waits IN the water, DESIGN-V2 §8.1).
   zoom = {z,x,y,focus} → the PULL focus rig: world layers scale around (x,y),
   a screen-space iris dims the periphery (focus 0..1). UI stays unscaled. */
export function draw(engine, hookDepth, T, cam, shake, fx, ambient, zoom){
  const W=LAYOUT.w, H=LAYOUT.h, C=engine.C, st=engine.st;
  const sx=st.steerX||0;
  let shook=false;
  if(shake>0.2){ ctx.save(); ctx.translate((Math.random()*2-1)*shake,(Math.random()*2-1)*shake); shook=true; }
  let zoomed=false;
  if(zoom && zoom.z>1.002){
    ctx.save(); ctx.translate(zoom.x,zoom.y); ctx.scale(zoom.z,zoom.z); ctx.translate(-zoom.x,-zoom.y);
    if(zoom.panX) ctx.translate(-zoom.panX,0);   // 巨獸咬走鉤:鏡頭跟著衝勢平移(縮放空間內)
    zoomed=true;
  }

  // --- water column strata (4 bands) ---
  ctx.fillStyle='#04070A'; ctx.fillRect(-PANM,0,W+PANM*2,H);
  if(ambient){
    // attract/idle backdrop — the SHALLOWS water the dive starts in, so tapping to
    // dive doesn't pop the colour (hao: 啟動開始時海水不該突然變色). Same SHALLOWS
    // strata palette. Keep in sync with #boot in deeper.html.
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#0F4D5C'); bg.addColorStop(0.5,'#0C3A47'); bg.addColorStop(1,'#0A2A36');
    ctx.fillStyle=bg; ctx.fillRect(-PANM,0,W+PANM*2,H);
  } else {
    for(let b=0;b<BAND_EDGES.length-1;b++){
      const edgeBot=BAND_EDGES[b+1]+(b===BAND_EDGES.length-2?0.5:0);
      const yTop=worldY(BAND_EDGES[b]*LAYER_DEPTH)-cam, yBot=worldY(edgeBot*LAYER_DEPTH)-cam;
      if(yBot<-4||yTop>H+4) continue;
      const s=bandStrata(BAND_EDGES[b]+1);
      const g=ctx.createLinearGradient(0,Math.max(yTop,-200),0,Math.min(yBot,H+200));
      g.addColorStop(0,s[0]); g.addColorStop(.5,s[1]); g.addColorStop(1,s[2]);
      ctx.fillStyle=g; ctx.fillRect(-PANM,Math.max(-4,yTop),W+PANM*2,Math.min(H+4,yBot)-Math.max(-4,yTop));
    }
    // depth temperature tint (keyed to hook depth)
    { const dfrac=Math.max(0,Math.min(1,hookDepth/(LAYERS*LAYER_DEPTH)));
      ctx.save(); ctx.globalAlpha=0.05+0.10*dfrac;
      ctx.fillStyle='rgb('+Math.round(0x2b+(0x3a-0x2b)*dfrac)+','+Math.round(0xbe*(1-dfrac)+0x10*dfrac)+','+Math.round(0xcb*(1-dfrac)+0x40*dfrac)+')';
      ctx.fillRect(-PANM,0,W+PANM*2,H); ctx.restore(); }
  }
  // surface light — light through the surface, present in BOTH idle and a SHALLOW
  // dive, fading with depth. Drawn in both modes so idle → dive is continuous (was
  // idle-only, which popped dark the instant you dived). surfK=1 near the surface.
  { const surfK=Math.max(0, 1 - Math.max(0,hookDepth-160)/(8*LAYER_DEPTH));
    if(surfK>0.01){ const sun=ctx.createRadialGradient(W*0.5,-H*0.06,10, W*0.5,-H*0.06,H*0.62);
      sun.addColorStop(0,'rgba(150,200,222,'+(0.26*surfK).toFixed(3)+')'); sun.addColorStop(1,'rgba(150,200,222,0)');
      ctx.fillStyle=sun; ctx.fillRect(-PANM,0,W+PANM*2,H*0.7); } }

  drawInternalWaves(T, cam);
  drawBgSchool(T, cam);

  // --- current streaks ---
  ctx.save(); ctx.lineCap='round';
  for(const s of STREAKS){
    const y=worldY(s.depth)-cam+swellY(s.depth,T)*0.45; if(y<-20||y>H+20) continue;
    const disp=currentDisp(s.depth, T, C);
    const dir=disp>=0?1:-1;
    const strength=Math.min(1,Math.abs(disp)/54);
    const psc=projScale(s.z), hz=haze(s.z);
    const xw=((((s.x + dir*T*42*s.sp) % (W+PANM*2+80)) + (W+PANM*2+80)) % (W+PANM*2+80)) - PANM - 40;
    const x=projX(xw, s.z);
    const len=s.len*(0.45+strength)*psc;
    ctx.globalAlpha=s.a*(0.3+strength*0.7)*(1-hz*0.5);
    ctx.strokeStyle='#9fe9f0'; ctx.lineWidth=1.1*psc;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+dir*len, y+disp*0.008); ctx.stroke();
    ctx.globalAlpha=s.a*strength*0.9*(1-hz*0.6); ctx.fillStyle='#c6f4f6';
    ctx.fillRect(x+dir*len-1, y-1, 2, 2);
  }
  ctx.restore();

  // --- sky, sea surface, god-rays ---
  // the rope's pierce point: where the sky-anchor→blend-point run crosses the
  // waterline. The surface is a CROSSING of the two real endpoints (top-center
  // anchor + hook), not a pivot — so lateral sway drifts the crossing (hao).
  let pierceX=ANCHOR_X;
  if(hookDepth>0.5){
    const dB=Math.min(hookDepth, LINE_BLEND);
    const xB=lineXAtDepth(dB,T,hookDepth,C,sx), yB=worldY(dB)-cam;
    const sy0=worldY(0)-cam, yTop=-8;
    if(yB>yTop+4) pierceX=ANCHOR_X+(xB-ANCHOR_X)*(sy0-yTop)/(yB-yTop);
  }
  drawSkyAndSea(T, cam, pierceX);

  // --- band nameplates (name + metric range, left edge like the concept) ---
  for(const b of BAND_INFO) drawStamp(b, worldY((b.L-1)*LAYER_DEPTH+34)-cam);
  // per-segment faint ticks
  for(let L=1;L<=LAYERS;L++){ const y=worldY(layerDepthY(L))-cam; if(y<-20||y>H+20) continue;
    ctx.strokeStyle='rgba(155,152,143,.07)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(16,y); ctx.lineTo(W-26,y); ctx.stroke(); }

  const hd = hookDepth;

  // --- catch corridor ---
  if(hd>2 && !ambient){
    const N=26; ctx.save();
    ctx.beginPath();
    for(let i=0;i<=N;i++){ const d=hd*i/N; const lx=lineXAtDepth(d,T,hd,C,sx); const y=worldY(d)-cam; if(i===0) ctx.moveTo(lx-CATCH_RADIUS,y); else ctx.lineTo(lx-CATCH_RADIUS,y); }
    for(let i=N;i>=0;i--){ const d=hd*i/N; const lx=lineXAtDepth(d,T,hd,C,sx); const y=worldY(d)-cam; ctx.lineTo(lx+CATCH_RADIUS,y); }
    ctx.closePath();
    ctx.fillStyle='rgba(111,227,225,0.05)'; ctx.fill();
    ctx.strokeStyle='rgba(111,227,225,0.10)'; ctx.lineWidth=1; ctx.stroke();
    ctx.restore();
  }

  // --- 大白鯊剪影「預告」:背景圖層,畫在魚群/線之前(=在其後方),不接管前景 ---
  if(!ambient && fx && fx.beastTele) drawWhale(fx.beastTele, T, hd, cam);

  // --- bubbles (behind fish; z-sorted far→near together with fish would need a
  //     merge — bubbles sit near the focal plane, draw before fish is fine) ---
  // sea cross-fade across the cut→next-round hand-off (main-v2 drives fx.cutFade):
  // the lost catch (fish AND bubbles) fades out on the ascent, idle sea fades in.
  _seaFade = (fx && fx.cutFade!=null) ? fx.cutFade : 1;
  for(const b of st.bubbles) drawBubble(b,T,C,cam,hd,ambient,sx);

  // --- fish far→near; reeled fish snap to the near plane ---
  const zorder = st.fish.map(f => [ (f._grab&&f._reelDepth!=null) ? -9999 : fishZ(f,T), f ])
                        .sort((a,b)=> b[0]-a[0]);
  for(const [,f] of zorder) drawFish(f,T,C,cam,hd,ambient,sx);
  if(!ambient) for(const s of st.sharks) drawShark(s,T,C,cam,hd,sx);

  // --- THE LINE — a plumb line out of the sky: its anchor is the TOP-CENTER
  //     OF THE SCREEN (hao: 支點=屏幕上方中心,非海平面;無船體), straight down
  //     the sky, pierces the waterline, then bows with the current down to
  //     the hook. Above the surface (breach) it is taut and vertical. While
  //     the WHALE clamps the hook it is replaced by the one in drawWhale. ---
  const whaleClamp = fx && fx.whale && !((fx.whale.stage??0)===0 && ['lurk','strike','burst','swallow'].includes(fx.whale.ph));
  const cutSnap = fx && fx.cutLine;      // the line is severed — drawCutLine draws the rope + falling hook instead
  // the whole cut recovery (the slow rise back to the top) shows NO rope/hook — the
  // line is gone; the new hook only grows back at the surface (hao: 直到上方才長回鉤子).
  const noHook = (cutSnap || (fx && fx.cutRecover)) && !(fx && fx.rehook);   // …except once the fresh hook is dropping back in
  if(!whaleClamp && !noHook){
    const N=30; ctx.save();
    /* v2.1e — the rope CARRIES the dread: as a shark closes it strains toward
       petrol violet and starts to shiver. Continuous and honest (it reads the
       shark's visible position), so the bite is never a surprise. */
    const dg=Math.max(0,Math.min(1,(fx&&fx.danger)||0));
    const shiver = dg>0.02 ? (Math.sin(T*54)*1.1+Math.sin(T*31)*0.7)*dg*dg : 0;
    ctx.strokeStyle = dg<0.02 ? 'rgba(233,242,240,0.62)'
      : 'rgba('+Math.round(233-95*dg)+','+Math.round(242-150*dg)+','+Math.round(240-40*dg)+','+(0.62+0.3*dg).toFixed(2)+')';
    ctx.lineWidth=1.8+1.5*dg*dg; ctx.beginPath();
    const lineTop = -8;                          // the sky anchor — always the frame top
    ctx.moveTo(ANCHOR_X, lineTop);
    if(hd>0.5){
      // TWO real endpoints — sky anchor and hook. The sky run heads STRAIGHT
      // for the shallow blend point (no pin at the waterline; the crossing
      // drifts with the sway so lateral steering reads natural); from
      // LINE_BLEND down the rope IS the engine's corridor line, exactly.
      const dB=Math.min(hd, LINE_BLEND);
      for(let i=0;i<=N;i++){ const d=dB+(hd-dB)*i/N; const x=lineXAtDepth(d,T,hd,C,sx)+shiver*Math.sin(i*1.7); const y=worldY(d)-cam; ctx.lineTo(x,Math.max(y,lineTop)); }
    } else {
      // breached: the hook leaves the water at the REAL crossing point, then
      // eases toward plumb under the sky anchor as it rises (no x-snap)
      const cx0=lineXAtDepth(0.5,T,0.5,C,sx);
      const k=Math.min(1, Math.max(0,-hd)/110);
      ctx.lineTo(cx0+(ANCHOR_X-cx0)*k, Math.max(worldY(hd)-cam, lineTop));
    }
    ctx.stroke(); ctx.restore();
  }
  // --- the heavy hook (v2.1: industrial, tip trails the motion direction).
  //     While a beast holds it, the hook is drawn AT THE JAW inside
  //     drawWhale instead (it must ride the thrash) ---
  if(!whaleClamp && !noHook){
    let hx, hy=worldY(hd)-cam;
    if(hd>0.5) hx=lineXAtDepth(hd,T,hd,C,sx);
    else { const cx0=lineXAtDepth(0.5,T,0.5,C,sx); const k=Math.min(1, Math.max(0,-hd)/110); hx=cx0+(ANCHOR_X-cx0)*k; }
    drawHook(hx,hy,T,hd>0.5?currentDisp(hd,T,C):0); }
  if(cutSnap) drawCutLine(fx.cutLine, T, cam);
  if(fx && fx.splash) drawSplash(fx.splash, cam);

  // --- grain + vignette ---
  ctx.save(); ctx.globalAlpha=0.045; ctx.globalCompositeOperation='overlay';
  const ox=(grainPhase*53)%GRAIN_SZ, oy=(grainPhase*97)%GRAIN_SZ;
  for(let yy=-GRAIN_SZ;yy<H+GRAIN_SZ;yy+=GRAIN_SZ) for(let xx=-GRAIN_SZ;xx<W+GRAIN_SZ;xx+=GRAIN_SZ) ctx.drawImage(grainCv,xx-ox,yy-oy);
  ctx.restore();
  { const dfrac=Math.max(0,Math.min(1,hd/(LAYERS*LAYER_DEPTH))); const vig=Math.min(0.9,0.34+dfrac*0.4);
    const vg=ctx.createRadialGradient(W*0.5,H*0.5,H*(0.6-dfrac*0.15),W*0.5,H*0.5,H*0.82);
    vg.addColorStop(0,'rgba(4,7,10,0)'); vg.addColorStop(1,'rgba(4,7,10,'+vig.toFixed(3)+')');
    ctx.fillStyle=vg; ctx.fillRect(0,0,W,H); }

  // --- world-space overlays ride INSIDE the zoom (they live in the water) ---
  if(fx){
    if(fx.cutLine) drawCutLine(fx.cutLine, cam);
    if(fx.breach) drawBreachFx(fx.breach, T, cam);
    if(fx.tease) drawTease(fx.tease, T, cam);
    if(fx.pops) drawPops(fx.pops, cam);
    if(fx.whale) drawWhale(fx.whale, T, hd, cam);
    if(fx.blood && fx.blood.length) drawBlood(fx.blood, cam);   // 咬合噴血（獸嘴前,跟鏡頭 zoom）
  }
  if(zoomed) ctx.restore();

  // --- PULL focus screen-FX (v2.1): radial smear + inbound light rays ---
  if(zoom && zoom.focus>0.05){
    // 1) radial smear — the frame re-composited over itself, scaled about the
    //    focus: center stays sharp, the periphery streaks outward (cheap
    //    radial blur). Punch widens the smear on every pop.
    const base=0.16*zoom.focus + (zoom.punch||0)*0.12;
    ctx.save();
    for(const [k,a] of [[1.030,base],[1.062,base*0.6]]){
      ctx.globalAlpha=Math.min(0.45,a);
      ctx.drawImage(cv, zoom.x*(1-k), zoom.y*(1-k), W*k, H*k);
    }
    ctx.restore();
    // 2) light rays wheeling in from the periphery toward the catch
    ctx.save(); ctx.translate(zoom.x, zoom.y);
    const rot=T*0.09;
    for(let i=0;i<9;i++){
      const a0=rot+i*0.698;
      ctx.globalAlpha=(0.028+0.05*Math.max(0,Math.sin(T*1.25+i*2.13)))*zoom.focus*(1+(zoom.punch||0)*2.0);
      ctx.fillStyle= i%3? '#DCEAE7' : '#F6C243';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0)*H*0.15, Math.sin(a0)*H*0.15);
      ctx.lineTo(Math.cos(a0+0.055)*H*0.92, Math.sin(a0+0.055)*H*0.92);
      ctx.lineTo(Math.cos(a0-0.055)*H*0.92, Math.sin(a0-0.055)*H*0.92);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // --- screen-space layers: ruler UI, focus iris, coins, flash, slam ---
  drawRuler(cam, ambient?0:hd);
  if(zoom && zoom.focus>0.01){
    // the PULL iris: periphery falls away, the climb owns the eye
    const g=ctx.createRadialGradient(zoom.x,zoom.y,H*0.16, zoom.x,zoom.y,H*0.60);
    g.addColorStop(0,'rgba(2,4,7,0)'); g.addColorStop(1,'rgba(2,4,7,'+(0.46*zoom.focus).toFixed(3)+')');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  if(fx){
    if(fx.danger>0.03) drawDangerEdge(fx.danger, T);
    if(fx.coins) drawCoins(fx.coins);
    if(fx.flash>0){ ctx.save(); ctx.globalAlpha=Math.min(1,fx.flash); ctx.fillStyle=fx.flashCol||'#FBE7A8'; ctx.fillRect(0,0,W,H); ctx.restore(); }
    if(fx.slam) drawSlam(fx.slam);
    if(fx.card) drawCard(fx.card);
  }

  if(shook) ctx.restore();
}

/* ---------- DANGER: the edge channel (v2.1e) -------------------------
   design-system's tension language: the risk is told by the frame DARKENING
   and taking a petrol-violet cast at the edges — never by a glow. */
function drawDangerEdge(d, T){
  const W=LAYOUT.w, H=LAYOUT.h;
  const k=Math.max(0,Math.min(1,d));
  const pulse=0.82+0.18*Math.sin(T*(2.2+3*k));
  ctx.save();
  const g=ctx.createRadialGradient(W*0.5,H*0.5,H*0.30, W*0.5,H*0.5,H*0.78);
  g.addColorStop(0,'rgba(138,92,194,0)');
  g.addColorStop(1,'rgba(138,92,194,'+(0.30*k*k*pulse).toFixed(3)+')');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const g2=ctx.createRadialGradient(W*0.5,H*0.5,H*0.34, W*0.5,H*0.5,H*0.85);
  g2.addColorStop(0,'rgba(4,5,10,0)');
  g2.addColorStop(1,'rgba(4,5,10,'+(0.34*k).toFixed(3)+')');
  ctx.fillStyle=g2; ctx.fillRect(0,0,W,H);
  ctx.restore();
}

/* v2.6 — the old abstract STRIKE overlay (dark dread-fill + a phantom lunge
   ellipse) is retired. The cut is now told by the REAL shark charging the line
   (see drawShark's _cut branch) plus the rope straining violet under it and the
   endInCut flash. No telegraph, no separate glyph. */

/* ---------- THE RE-CAST SPLASH (v2.6.8, hao: 落下掉入水中要有微水花) --------
   A small foam ring + a spray of droplets where the fresh hook pierces the
   surface. Deliberately 微 — a light entry, not a beast breach. */
function drawSplash(sp, cam){
  const p=Math.min(1, sp.t/0.6); if(p>=1) return;
  const x=sp.x, sy=worldY(0)-cam + surfWave(sp.x,grainPhase)*0.4;   // the waterline
  ctx.save();
  const r=5+p*24;
  ctx.globalAlpha=(1-p)*0.55; ctx.strokeStyle='rgba(200,230,235,0.9)'; ctx.lineWidth=1.6*(1-p*0.5);
  ctx.beginPath(); ctx.ellipse(x, sy, r, r*0.28, 0, 0, 7); ctx.stroke();
  ctx.globalAlpha=(1-p)*0.32;
  ctx.beginPath(); ctx.ellipse(x, sy, r*0.5, r*0.14, 0, 0, 7); ctx.stroke();
  ctx.fillStyle='rgba(196,228,232,0.95)';
  for(let i=0;i<7;i++){
    const ph=(i-3)*0.42, v=66+((i*37)%46), tt=p*0.92;
    const dx=Math.sin(ph)*(12+((i*23)%16)), dy=-(v*tt) + 210*tt*tt;   // thrown up, gravity back
    ctx.globalAlpha=(1-p)*0.8;
    ctx.beginPath(); ctx.arc(x+dx*1.5, sy+dy, 1.5*(1-p*0.45), 0, 7); ctx.fill();
  }
  ctx.restore();
}

/* ---------- THE LINE SNAP (v2.6.2, hao: 斷線要真表演出斷線,不要字卡) -------
   The shark bit through. No card, no shake — the performance IS the message:
   the released tension whips the severed end UP into a slack sway, while the
   hook (and whatever was on it) tumbles down and is swallowed by the deep. */
function drawCutLine(cl, T, cam){
  const p=Math.min(1, cl.t/0.7);
  const bx=cl.x, by=worldY(cl.y)-cam, lineTop=-8;
  ctx.save();
  // upper rope: recoils upward, elastic damped whip, goes slack
  const recoil=54*(1-Math.pow(1-p,3)), endY=by-recoil, sway=Math.sin(p*20)*13*(1-p);
  ctx.globalAlpha=0.6*(1-0.4*p);
  ctx.strokeStyle='rgba(233,242,240,0.6)'; ctx.lineWidth=1.7; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(ANCHOR_X,lineTop);
  ctx.quadraticCurveTo(ANCHOR_X+sway*0.7,(lineTop+endY)*0.5, bx+sway,endY); ctx.stroke();
  // frayed severed tip
  ctx.globalAlpha=0.5*(1-p); ctx.lineWidth=1.1;
  for(let i=0;i<3;i++){ const a=-1.4+i*0.6; ctx.beginPath();
    ctx.moveTo(bx+sway,endY); ctx.lineTo(bx+sway+Math.cos(a)*7, endY+Math.abs(Math.sin(a))*7); ctx.stroke(); }
  // the hook + a stub of line tumble away into the gloom
  const fall=p*p*300, hx=bx-sway*0.4+Math.sin(p*5)*7, hy=by+fall, fade=Math.max(0,1-p*0.85);
  ctx.globalAlpha=fade*0.55; ctx.strokeStyle='rgba(200,208,215,0.9)'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(hx-Math.sin(p*6)*6, hy-30); ctx.lineTo(hx, hy-9); ctx.stroke();
  ctx.translate(hx,hy); ctx.rotate(p*3.0);
  ctx.globalAlpha=fade; ctx.strokeStyle='#C8D0D7'; ctx.lineWidth=2.2; ctx.lineJoin='round';
  ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(0,3); ctx.arc(-4,3,4,0,Math.PI*1.15); ctx.stroke();  // hook silhouette
  ctx.globalAlpha=fade*0.9; ctx.fillStyle='#F6C243';                                                   // gold lure
  ctx.beginPath(); ctx.moveTo(0,8); ctx.lineTo(3,11); ctx.lineTo(0,14); ctx.lineTo(-3,11); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------- the TITLE CARD (hao 2026-07-19) --------------------------
   A round never resets in silence: the ritual plays, then a stamped plate
   states plainly what happened and what it cost, and only then does the
   world return to rest. */
function drawCard(c){
  if(!c.shown) return;
  const W=LAYOUT.w, H=LAYOUT.h;
  const inP=Math.min(1, c.t/0.35), out=Math.max(0, (c.t-(0.35+1.9))/0.4);
  const a=Math.min(1,inP)*(1-Math.min(1,out));
  if(a<=0) return;
  const ease=1-Math.pow(1-inP,3);
  const cy=H*0.44, hw=W*0.40, hh=64;
  ctx.save();
  ctx.globalAlpha=a*0.72; ctx.fillStyle='#04070A'; ctx.fillRect(0,cy-hh-26,W,hh*2+52);
  ctx.globalAlpha=a;
  const col = c.cold? '#8A5CC2' : '#F6C243';
  const hi  = c.cold? '#C9A7E8' : '#FBE7A8';
  // stamped plate: hard rules top and bottom, no rounded web box
  ctx.strokeStyle=col; ctx.lineWidth=2;
  const y0=cy-hh+(1-ease)*10, y1=cy+hh-(1-ease)*10;
  ctx.beginPath(); ctx.moveTo(W*0.5-hw,y0); ctx.lineTo(W*0.5+hw,y0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.5-hw,y1); ctx.lineTo(W*0.5+hw,y1); ctx.stroke();
  ctx.textAlign='center';
  setDisplay(Math.round(52*(0.94+0.06*ease)),900);
  if('letterSpacing' in ctx) ctx.letterSpacing='2px';
  ctx.lineWidth=7; ctx.strokeStyle=c.cold?'#2A123E':'#3A2A05'; ctx.strokeText(c.txt, W*0.5, cy+4);
  ctx.fillStyle=col; ctx.fillText(c.txt, W*0.5, cy+4);
  ctx.lineWidth=1.2; ctx.strokeStyle=hi; ctx.strokeText(c.txt, W*0.5, cy+4);
  if('letterSpacing' in ctx) ctx.letterSpacing='1px';
  ctx.font='600 13px '+FU; ctx.fillStyle=hi; ctx.globalAlpha=a*0.85;
  ctx.fillText(c.sub, W*0.5, cy+30);
  if('letterSpacing' in ctx) ctx.letterSpacing='0px';
  ctx.restore();
}

/* ---------- BREACH at the waterline (hao 2026-07-19: PULL 拉出海平面,
   要像 v1 那樣有波紋) — foam rings spreading on the surface, a burst of
   spray, and a brief gold flood where the catch came out. ---------- */
function drawBreachFx(br, T, cam){
  const t=br.t, cx=br.x||ANCHOR_X;
  if(t>=1.15) return;
  const sy=worldY(0)-cam + surfWave(cx,T)*0.5;
  ctx.save();
  // foam rings — expanding ellipses hugging the surface plane (v1 語彙)
  for(let i=0;i<3;i++){
    const k=Math.max(0, Math.min(1, (t-i*0.12)/0.9));
    if(k<=0||k>=1) continue;
    const r=16+k*(120+i*36);
    ctx.globalAlpha=(1-k)*(0.55-i*0.12);
    ctx.strokeStyle= i===1? 'rgba(246,194,67,0.9)' : 'rgba(233,242,240,0.9)';
    ctx.lineWidth=2.6-i*0.7;
    ctx.beginPath(); ctx.ellipse(cx, sy, r, r*0.24, 0, 0, 7); ctx.stroke();
  }
  // the bulge highlight right as it breaks (first beat only)
  if(t<0.3){
    ctx.globalAlpha=(1-t/0.3)*0.5;
    ctx.strokeStyle='rgba(233,242,240,0.9)'; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.ellipse(cx, sy-3, 20+t*40, 7, 0, Math.PI, 0); ctx.stroke();
  }
  // spray — droplets thrown up, falling back under gravity
  for(let i=0;i<12;i++){
    const ph=i*0.5236, v=150+((i*53)%110), tt=Math.max(0, t-((i*29)%10)/60);
    if(tt<=0||tt>0.85) continue;
    const dx=Math.sin(ph)*(24+((i*37)%40))*tt*2.4;
    const dy=v*tt - 480*tt*tt;
    ctx.globalAlpha=(1-tt/0.85)*0.8;
    ctx.fillStyle= i%4? '#DCEAE7' : '#FBE7A8';
    const s=i%3?2:3;
    ctx.fillRect(cx+dx-s/2, sy-dy-s/2, s, s);
  }
  // gold flood — the water itself flashes warm where the win came out
  if(t<0.6){
    const a=(1-t/0.6)*0.16;
    const g=ctx.createRadialGradient(cx,sy,6, cx,sy,150);
    g.addColorStop(0,'rgba(246,194,67,'+a.toFixed(3)+')'); g.addColorStop(1,'rgba(246,194,67,0)');
    ctx.globalAlpha=1; ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx, sy, 150, 44, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
}

/* ---------- current-turbulence omen (WHALE 2.0 tease) -----------------
   Swirling arcs + a huge shadow sweeping the deep + drifting motes. Real
   whales always show it; ~half the omens are false alarms that dissolve. */
function drawTease(tz, T, cam){
  const W=LAYOUT.w, H=LAYOUT.h, t=tz.t;
  const a=Math.min(1, t*2.2) * Math.min(1, Math.max(0,(2.35-t))*1.6);   // self fade-in/out
  if(a<=0) return;
  const cx=ANCHOR_X, cy=H*0.55;
  ctx.save();
  // swirl arcs
  for(let i=0;i<3;i++){
    const r=110+i*54, w0=T*(1.4+i*0.35)+i*2.1;
    ctx.globalAlpha=a*(0.14-i*0.03);
    ctx.strokeStyle='#9FE9F0'; ctx.lineWidth=2.2-i*0.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, w0, w0+2.2); ctx.stroke();
  }
  // the shadow below — something VAST is moving
  const sx=((t*260)%(W+560))-280;
  ctx.globalAlpha=a*0.16; ctx.fillStyle='#05070C';
  ctx.beginPath(); ctx.ellipse(sx, H*0.9, 240, 54, 0.06, 0, 7); ctx.fill();
  // motes spiraling toward the swirl
  for(let i=0;i<8;i++){
    const ang=T*1.8+i*0.785, rr=170-((t*60+i*23)%150);
    ctx.globalAlpha=a*0.35*(rr/170);
    ctx.fillStyle='#C6F4F6';
    ctx.fillRect(cx+Math.cos(ang+i)*rr, cy+Math.sin(ang+i)*rr*0.7, 2, 2);
  }
  ctx.restore();
}

/* ---------- WHALE 2.0 event (v2.1b §8.5) ------------------------------
   VERTICAL leviathan: erupts head-up from the sea floor, swallows the
   strung catch bottom-to-top, clamps the hook, thrashes… then either
   tears free (dives with everything) or is hauled to the surface.
   Gold eye + jaw-line: the jackpot animal, not the loss pole. */
/* ============================================================
   BEAST v2.5 — AI PNG 姿態演出（接入自 demos/beast-nested-predation）
   遊戲首次引入圖片資產：透明 PNG（public/beasts/）runtime 載入。未載好時
   drawWhale fallback 到程序化剪影 drawWhaleFallback（漸進增強；build:single
   不內聯 public/ 也走此路）。狀態機（main-v2 tickWhale）不變，這裡只按 phase
   切姿態。stage 0 大白鯊=水平（lurk 繞圈→strike 衝刺）；1 滄龍 / 2 利維坦=
   垂直頭朝上湧出，嘴對鉤、由下往上把上一隻縮進巨口（套娃）。
   ============================================================ */
const bClamp=(v,a,b)=>Math.max(a,Math.min(b,v)), bLerp=(a,b,t)=>a+(b-a)*t;
const bExpo=t=>Math.pow(bClamp(t,0,1),2.4), bEaseOut=t=>1-Math.pow(1-bClamp(t,0,1),3);
const BEAST_POSE = {
  gwCruise:{src:'./beasts/great-white-cruise.png',  iw:1536, ih:1024, mo:[.10,.52]},
  gwBite:  {src:'./beasts/great-white-bite.png',    iw:1536, ih:1024, mo:[.05,.55]},
  gwDrag:  {src:'./beasts/great-white-dragged.png', iw:1122, ih:1402, mo:[.50,.50]},
  moBurst: {src:'./beasts/mosasaur-burst.png',      iw:1024, ih:1536, mo:[.56,.20]},
  moClamp: {src:'./beasts/mosasaur-clamp.png',      iw:1024, ih:1536, mo:[.50,.16]},
  lvOpen:  {src:'./beasts/livyatan-rise-open.png',  iw:1024, ih:1536, mo:[.50,.20]},
  lvClosed:{src:'./beasts/livyatan-rise-closed.png',iw:1024, ih:1536, mo:[.50,.18]},
};
let beastReady=false;
{ const ks=Object.keys(BEAST_POSE); let n=0;
  for(const k of ks){ const im=new Image(); im.onload=()=>{ if(++n>=ks.length) beastReady=true; }; im.src=BEAST_POSE[k].src; BEAST_POSE[k].img=im; } }
const BEAST_H=[0.238, 0.62, 1.06]; // 每階高度佔螢幕比（大白鯊 0.34→0.27→0.216→0.238,hao 縮兩輪再放大10%）
/* 兩股力的身體角度（hao）：0=橫游 1=垂直吊掛。跨幀狀態,只被「線真的在拉(pull>0)」拽向
   垂直、被「獸贏(pull<0)」扭回水平;僵持(pull=0)不自轉。_gwWhip=轉動速率→尾巴鞭甩包絡。 */
let _gwA=0, _gwWhip=0, _gwPrevT=null;
/* 咬走鉤的慣性（hao）：strike 的衝刺速度在咬合瞬間存成 _gwCVX,慣性把鉤帶往行進方向,
   線張力=彈簧+阻尼拉回錨點——過衝、繃緊、回彈收斂。鏡頭跟著偏移(beastPanX→main 的 zoom rig)。 */
let _gwCX=0, _gwCVX=0, _gwThr=0, _gwImp=false;   // _gwThr=咬住後殘存推進力(拖著鉤走)  _gwImp=撞擊減速已觸發
export function beastPanX(){ return _gwCX*0.55; }
const beastShut=[BEAST_POSE.gwCruise, BEAST_POSE.moClamp, BEAST_POSE.lvClosed];  // 閉口姿 by stage
/* 環境光管線（hao 2026-07-21）：獸畫到離屏圖層，用 source-atop 疊「水中光照」（頂光梯度、
   環境色、輪廓光）到獸的形狀上——靠光塑形讓 PNG 沉進水裡，而不是用 filter 壓暗染色吃掉細節。 */
const ctxMain = ctx;                                                                // 主畫布別名
let BEAST_TARGET = null;                                                            // 獸繪製目標:null=主 ctx；離屏 ctx=環境光圖層
let _beastLayer=null, _beastLayerX=null;
function beastLayer(){ if(!_beastLayer){ _beastLayer=document.createElement('canvas'); _beastLayerX=_beastLayer.getContext('2d'); }
  if(_beastLayer.width!==cv.width||_beastLayer.height!==cv.height){ _beastLayer.width=cv.width; _beastLayer.height=cv.height; }
  return _beastLayerX; }
let _featherL=null, _featherX=null;                                                 // ②邊緣羽化用的第二離屏
function featherCanvas(){ if(!_featherL){ _featherL=document.createElement('canvas'); _featherX=_featherL.getContext('2d'); }
  if(_featherL.width!==cv.width||_featherL.height!==cv.height){ _featherL.width=cv.width; _featherL.height=cv.height; }
  return _featherX; }
function beastRect(pose, cx, cy, hFrac){ const dh=LAYOUT.h*hFrac, dw=dh*pose.iw/pose.ih; return {dw,dh,x0:cx-dw/2,y0:cy-dh/2}; }
function beastMouthPt(pose, cx, cy, hFrac){ const{dw,dh,x0,y0}=beastRect(pose,cx,cy,hFrac); return [x0+pose.mo[0]*dw, y0+pose.mo[1]*dh]; }
function beastCyForMouthY(pose, hFrac, targetY){ return targetY-(pose.mo[1]-0.5)*LAYOUT.h*hFrac; }  // 讓嘴 y 對準 targetY 的中心 cy
function drawBeast(pose, cx, cy, hFrac, a, opt={}){
  if(!pose.img||!pose.img.complete) return;
  const ctx = BEAST_TARGET || ctxMain;                                             // 可切換到離屏環境光圖層
  const{dw,dh,x0,y0}=beastRect(pose,cx,cy,hFrac);
  ctx.save(); ctx.globalAlpha=bClamp(a,0,1);
  if(opt.rot){ ctx.translate(cx,cy); ctx.rotate(opt.rot); ctx.translate(-cx,-cy); }
  if(opt.flip){ ctx.translate(cx,0); ctx.scale(-1,1); ctx.translate(-cx,0); }
  if(opt.dark>0) ctx.filter='brightness('+(1-opt.dark*.85).toFixed(3)+') saturate('+(1-opt.dark*.6).toFixed(3)+')';   // 原色為主,水感靠環境光
  ctx.drawImage(pose.img, x0, y0, dw, dh); ctx.restore();
}
function drawBeastBlur(pose, cx, cy, hFrac, a, motion, opt={}){
  const g=motion>.05?3:0;
  for(let i=g;i>=1;i--){ const d=i*motion*46, dx=opt.horiz?d:0, dy=opt.horiz?0:d;
    drawBeast(pose, cx-dx, cy+ (opt.horiz?0:d), hFrac, a*.2*(1-i/(g+1)), {flip:opt.flip}); }
  drawBeast(pose, cx, cy, hFrac, a, opt);
}
/* 混合動態（hao 2026-07-21）：PNG 沿身體長軸切 N 段，每段做正弦波動（頭穩尾擺）＋
   整體呼吸縮放＋衝刺 squash&stretch。讓寫實 PNG 不再是「離散切換」而是「連續活著」，
   補上 PNG 相對程序化剪影最弱的一環。wave<0.3 退化成單張 drawImage（等同 drawBeast）。 */
function drawBeastWavy(pose, cx, cy, hFrac, a, opt={}){
  if(!pose.img||!pose.img.complete) return;
  const ctx = BEAST_TARGET || ctxMain;                                             // 可切換到離屏環境光圖層
  const{dw,dh,x0,y0}=beastRect(pose,cx,cy,hFrac);
  ctx.save(); ctx.globalAlpha=bClamp(a,0,1);
  if(opt.rot){ ctx.translate(cx,cy); ctx.rotate(opt.rot); ctx.translate(-cx,-cy); }
  if(opt.flip){ ctx.translate(cx,0); ctx.scale(-1,1); ctx.translate(-cx,0); }
  if(opt.stretch){ const s=opt.stretch, sx=opt.horiz?1+s:1-s*0.6, sy=opt.horiz?1-s*0.6:1+s;
    ctx.translate(cx,cy); ctx.scale(sx,sy); ctx.translate(-cx,-cy); }               // 體積守恆感的擠壓拉伸
  if(opt.skew){ ctx.translate(cx,cy); ctx.transform(1, opt.skew.y||0, opt.skew.x||0, 1, 0, 0); ctx.translate(-cx,-cy); }  // 整體水波晃動（不分段=不破圖）
  if(opt.silhouette) ctx.filter='brightness(0.07) saturate(0)';                    // 純黑剪影（遠景潛伏）
  else if(opt.dark>0) ctx.filter='brightness('+(1-opt.dark*.85).toFixed(3)+') saturate('+(1-opt.dark*.6).toFixed(3)+')';
  // 正常獸不再壓暗染色（保留 PNG 原色/細節）——水感改由 drawWhale 的環境光圖層塑造
  const wave=opt.wave||0;
  if(wave<0.3){ ctx.drawImage(pose.img,x0,y0,dw,dh); ctx.restore(); return; }
  const N=opt.seg||24, T=opt.T||0, sp=opt.speed||2.4, wl=opt.waveLen||0.5, ph=opt.phase||0, tp=opt.tailPow||1;
  const br=(opt.breathe||0)*Math.sin(T*1.7+ph);                                     // 呼吸
  // 剪切連續條帶(2026-07-22 破圖根治):每段畫成平行四邊形,左緣=off(i)、右緣=off(i+1),
  // 相鄰段共用邊界值→C0 連續、任何振幅零裂縫(舊的剛性平移條帶在大振幅/大旋轉必裂,退役)。
  const off=i=>{ const k=Math.pow(i/N, tp);
    return Math.sin(T*sp - i*wl + ph)*wave*k + Math.sin(T*5.5 - i*0.5 + ph)*wave*0.14*k; };
  if(opt.horiz){                                                                    // 水平身體：沿 x 切
    const sw=dw/N, ssw=pose.iw/N, hh=dh*(1+br), oy=(dh-hh)/2;
    for(let i=0;i<N;i++){ const xi=x0+i*sw, o0=off(i), m=(off(i+1)-o0)/sw;
      ctx.save(); ctx.transform(1, m, 0, 1, 0, o0 - m*xi);
      ctx.drawImage(pose.img, i*ssw,0,ssw,pose.ih,  xi-0.5, y0+oy, sw+1, hh);
      ctx.restore(); }
  } else {                                                                          // 垂直身體：沿 y 切
    const sh=dh/N, ssh=pose.ih/N, ww=dw*(1+br), ox=(dw-ww)/2;
    for(let i=0;i<N;i++){ const yi=y0+i*sh, o0=off(i), m=(off(i+1)-o0)/sh;
      ctx.save(); ctx.transform(1, 0, m, 1, o0 - m*yi, 0);
      ctx.drawImage(pose.img, 0,i*ssh,pose.iw,ssh,  x0+ox, yi-0.5, ww, sh+1);
      ctx.restore(); }
  }
  ctx.restore();
}
function beastSpeedLines(cx, cy, inten, horiz){
  if(inten<.05) return; const W=LAYOUT.w, H=LAYOUT.h;
  ctx.save(); ctx.globalCompositeOperation='screen';
  for(let i=0;i<14;i++){
    ctx.globalAlpha=(.12+Math.random()*.3)*inten; ctx.strokeStyle='#bfe6f2'; ctx.lineWidth=1.4+Math.random()*2;
    if(horiz){ const y=cy+(Math.random()*2-1)*H*.32, x0=cx+(Math.random()*2-1)*W*.45;   // 水平衝＝水平速度線
      ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x0+60+Math.random()*130,y); ctx.stroke(); }
    else { const x=cx+(Math.random()*2-1)*W*.42, y0=cy+Math.random()*H*.3;               // 垂直湧＝垂直速度線
      ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y0+50+Math.random()*110); ctx.stroke(); }
  }
  ctx.restore();
}
function beastSpray(mx, my, pw, T){
  if(pw<.05) return; ctx.save();
  for(let i=0;i<28;i++){ const ph=(T*2.8+i*0.31)%1, a=-Math.PI/2+(i/28*2-1)*1.28, sp=(190+((i*97)%540))*pw;
    const x=mx+Math.cos(a)*sp*ph, y=my+Math.sin(a)*sp*ph+(ph*ph)*300;
    ctx.globalAlpha=(1-ph)*.88*pw; ctx.fillStyle='#eaf7fb';
    ctx.beginPath(); ctx.arc(x,y,(1.9+(i%3)*2.1)*(1-ph),0,7); ctx.fill(); }
  ctx.restore();
}
/* ~~caustics 線/浮游顆粒/god rays/vignette/青藍 overlay/頂光梯度~~ 2026-07-21 hao 打回整批退役：
   疊加式「氛圍層」黏不住——獸 PNG 自帶攝影棚光,場景另一套光,在中間疊裝飾是第三層各自為政,
   讀感=硬加上去。正解=合成對齊(把獸的光調進場景:色度/黑位/深度霧),一次只加一層驗收。 */

/* 大白鯊吊掛姿態（共用）：stage0 的 haul/struggle/drag/land 與「被滄龍吞掉前」都走這一套——
   跨 stage 完全連續,不停格不突變(hao 2026-07-22:滄龍還沒咬到,鯊魚動態不能停/不能突變)。
   讀模組狀態 _gwA/_gwCX(跨 stage 存活),時間項全 closed-form。 */
function gwHangPose(T, hookY, hFrac, dir, pull, struggling){
  const flip=dir<0, sgn=flip?-1:1;
  const burst=Math.pow(Math.max(0,Math.sin(T*3.1+1.2)),6);        // 爆發-安靜掙扎包絡
  const fishF=(pull<0||struggling)? 1 : 0.35;
  const rot = sgn*Math.PI*0.5*_gwA
    + Math.sin(T*2.6)*0.07*_gwA                                   // 慢鐘擺(重物頻率)
    + Math.sin(T*26)*0.30*(1-_gwA)*fishF*(0.35+0.65*burst)        // 甩頭只在爆發時猛
    + sgn*(-0.24)*burst*_gwA                                      // 爆發時奮力抬身
    + Math.sin(T*21)*0.10*burst;
  const pose=BEAST_POSE.gwCruise;
  const {dw,dh}=beastRect(pose,0,0,hFrac);
  const ex0=(pose.mo[0]-0.5)*dw*(flip?-1:1), ey0=(pose.mo[1]-0.5)*dh;
  const rc=Math.cos(rot), rs=Math.sin(rot);
  return { pose, flip, rot, burst,
    bx: ANCHOR_X - (ex0*rc - ey0*rs) + _gwCX,
    by: hookY+30 - (ex0*rs + ey0*rc)
      + (LAYOUT.h*0.010 + Math.sin(T*2.6-1.1)*LAYOUT.h*0.006)*_gwA*(pull>0?1:0.4) };
}

/* PNG 版 — 未載好轉 fallback 剪影 */
function drawWhale(wh, T, hookDepth, cam){
  if(!beastReady){ drawWhaleFallback(wh, T, hookDepth, cam); return; }
  const W=LAYOUT.w, H=LAYOUT.h, ph=wh.ph, p=wh.p;
  const stage=(wh.stage!=null)?wh.stage:((wh.tier!=null)?wh.tier:1);

  // 背景壓暗（沿用 fallback 節奏）——tele(剪影預告)不壓暗,前景維持原本亮度/節奏
  if(!wh.tele){
    const dim = ph==='lurk'? p*0.40 : ph==='snapline'? 0.45*(1-p*0.6) : ph==='land'? 0.45*(1-p) : 0.45;
    ctx.save(); ctx.fillStyle='rgba(3,5,9,'+Math.max(0,dim).toFixed(3)+')'; ctx.fillRect(-PANM,0,W+PANM*2,H); ctx.restore();
  }

  const cx=ANCHOR_X, hookY=worldY(hookDepth)-cam;
  let pose, hFrac=BEAST_H[stage], bx=cx, by=hookY, mouth=0, flip=false, rot=0, alpha=1, motion=0, spray=0, slines=0, dark=0, horiz=false, silhouette=false, settle0=1;

  if(stage===0){
    // ===== 大白鯊：剪影快速掠過 → 反向衝出咬鉤 → 劇烈甩動 → 頭朝上被拖（hao 2026-07-21）=====
    horiz=true;
    const dir = wh.lurkDir||1;                                              // 1:左→右 / -1:右→左（每局隨機）
    const gwDW=BEAST_H[0]*H*BEAST_POSE.gwCruise.iw/BEAST_POSE.gwCruise.ih, mouthDX=gwDW*0.38;
    const biteFlip = dir<0;                                                 // 衝出/咬合朝向（進場側=lurk 離場側）
    const rdt=(_gwPrevT!=null && T>_gwPrevT)? Math.min(0.05, T-_gwPrevT) : 1/60; _gwPrevT=T;
    if(ph==='bite'||ph==='haul'||ph==='struggle'||ph==='drag'||ph==='land'){
      if(!_gwImp){ _gwImp=true; _gwCVX*=0.45; }                             // 撞到的瞬間再減速(咬上線的衝擊吃掉動量)
      _gwThr*=Math.exp(-rdt*1.5);                                           // 推進力 ~1s 衰竭
      _gwCVX+=(-dir*W*1.8*_gwThr - _gwCX*5 - _gwCVX*1.4)*rdt; _gwCX+=_gwCVX*rdt;   // 推力>張力=拖著鉤走;衰竭後慢拽回
    }
    if(ph==='lurk'){
      // ① 剪影掠過一次=預告(背景層,不接管前景)；頭朝游動方向（flip=往右游）。剪影加大(hao)。
      _gwA=0; _gwWhip=0; _gwPrevT=null; _gwCX=0; _gwCVX=0; _gwThr=0; _gwImp=false;   // 新一局:狀態歸位
      pose=BEAST_POSE.gwCruise; silhouette=true; hFrac=BEAST_H[0]*0.92;
      bx=bLerp(dir>0? -W*0.42 : W*1.42, dir>0? W*1.42 : -W*0.42, p);        // 勻速快掠：dir>0 左→右
      by=hookY-H*0.15+Math.sin(p*9)*H*0.012; flip=dir>0;
    } else if(ph==='strike'){
      // ② WHALE 接管入口:從側邊反向爆衝、張口把嘴衝到鉤。剪影預告已在 REELING 演完,
      //    故此處重置跨局殘留的懸掛狀態(_gwA/_gwWhip/_gwPrevT——原本由 lurk 歸零)。
      if(p<0.05){ _gwA=0; _gwWhip=0; _gwPrevT=null; }
      pose=BEAST_POSE.gwBite; const e=bExpo(p);
      bx=bLerp(dir>0? W*1.42 : -W*0.42, cx+dir*mouthDX, e); by=hookY+24; flip=biteFlip;   // 瞄準鉤下緣(魚串處)
      motion=(1-p)*0.95; slines=1-p; mouth=1; spray=p;
      _gwCX=0; _gwCVX=-dir*W*0.9; _gwThr=1; _gwImp=false;                   // 衝刺速度(放慢30%)→慣性+殘存推進力
    } else if(ph==='snapline'){
      // 咬斷游走(hao:不是死掉)——一記甩頭掙斷,叼著鉤沿衝刺方向加速游出畫;距離淡出非死亡淡出
      pose= p<0.18? BEAST_POSE.gwBite : BEAST_POSE.gwCruise; flip=biteFlip;
      const esc=bExpo(bClamp((p-0.16)/0.84,0,1));
      bx=cx+dir*mouthDX - dir*W*1.5*esc;                                    // 沿行進方向(-dir)揚長而去
      by=hookY+28 + H*0.10*esc;                                             // 帶一點下潛角(鉤仍含口縫)
      rot=(biteFlip?-1:1)*0.14*esc + Math.sin(T*30)*0.22*(1-bClamp(p/0.2,0,1));   // 掙斷甩頭→游姿微傾
      motion=esc*0.8; slines=esc*0.6;                                       // 爆發游走的殘影+速度線
      alpha=1-Math.max(0,p-0.75)/0.25*0.45;
    } else if(ph==='bite'){
      // ③ 咬住瞬間：衝勁把鉤帶著走(_gwCX),線繃斜張力回拉;同時劇烈甩頭試圖脫鉤
      pose=BEAST_POSE.gwCruise; flip=biteFlip;
      bx=cx+dir*mouthDX+_gwCX+Math.sin(T*38)*W*0.03; by=hookY+28+Math.cos(T*30)*H*0.015; rot=Math.sin(T*26)*0.30;   // 咬鉤下緣(鉤收進口縫)
    } else {
      // ④ haul/struggle/drag/land：兩股力(hao)——線真的在收(pull>0)才拽向垂直;
      //    獸贏回拖(pull<0)扭回水平下潛;僵持(pull=0,bite/struggle)不自轉、只有自身甩動。
      //    嘴恆釘在鉤上,身體繞嘴轉——扳正永遠跟「實際拉扯」同步,不跟時間走。
      const pull=wh.pull||0;
      const prevA=_gwA;
      if(pull>0)      _gwA+=(1-_gwA)*Math.min(1, rdt*3.4);          // 線贏:被拽向垂直
      else if(pull<0) _gwA+=(0-_gwA)*Math.min(1, rdt*2.4);          // 獸贏:扭回水平下潛
      _gwWhip+=(bClamp(Math.abs(_gwA-prevA)/Math.max(rdt,1e-3)*1.2,0,1)-_gwWhip)*Math.min(1, rdt*6);
      settle0=_gwA;
      const hs=gwHangPose(T, hookY, hFrac, dir, pull, ph==='struggle');   // 姿態共用(被吞前也走它=跨 stage 連續)
      pose=hs.pose; flip=hs.flip; rot=hs.rot; bx=hs.bx; by=hs.by; wh._burst=hs.burst;
      if(ph==='land') alpha=1-p*0.5;
    }
  } else {
    // ===== 滄龍(1)/利維坦(2)：垂直頭朝上湧出。嘴恆釘在鉤上(反推中心),頭繞嘴俯仰+身體分段游動波 =====
    const openP=stage===1?BEAST_POSE.moBurst:BEAST_POSE.lvOpen, shutP=beastShut[stage];
    const burst=Math.pow(Math.max(0,Math.sin(T*2.7+stage*1.9)),6); wh._burst=burst;   // 爆發-安靜掙扎(相位錯開)
    // 嘴點反推:給 pose+rot,算出讓「經 rot 的嘴」精確落在 (cx,hookY) 的身體中心——嘴永遠對鉤(hao bug1)
    const vc=(po,r)=>{ const {dw,dh}=beastRect(po,0,0,hFrac);
      const ex=(po.mo[0]-0.5)*dw, ey=(po.mo[1]-0.5)*dh, rc=Math.cos(r), rs=Math.sin(r);
      return { bx:cx-(ex*rc-ey*rs), by:hookY-(ex*rs+ey*rc) }; };
    if(ph==='burst'){ pose=openP; const e=bExpo(p);          // 湧出:頭前傾撲食、末段收正
      rot=(1-e)*0.26 + Math.sin(T*7)*0.05*(1-e);
      const c=vc(openP,rot); bx=c.bx; by=bLerp(H+hFrac*H*0.5+140, c.by, e);
      mouth=1; motion=(1-p)*0.6; slines=1-p*0.5; spray=1-p;
    } else if(ph==='swallow'){ pose=openP;                   // 全程張口撲咬(不中途切 shutP:避免 mo 跳變→嘴脫鉤/身體跳);咬下延到 bite＝對齊爆血
      const chomp=Math.pow(p,2.6);                            // 咬下加速(後段猛壓向咬合點)
      rot=(1-p)*0.14 + chomp*0.22 + Math.sin(T*7)*0.04*(1-p); // 前傾張口逼近→猛咬下(頭繞嘴俯衝,嘴仍釘鉤)
      const c=vc(openP,rot); bx=c.bx; by=c.by; mouth=1-chomp*0.7; motion=(1-p)*0.3;
    } else if(ph==='snapline'){ pose=shutP; rot=Math.sin(T*22)*0.16;
      const c=vc(shutP,rot); bx=c.bx; by=c.by+Math.pow(p,1.7)*H*0.9; alpha=1-p*0.55;
    } else { pose=shutP;                                     // bite/haul/struggle/drag/land
      const B=0.35+0.65*burst;
      // 消除定格(hao):bite 不是靜止叼著——剛咬合的餘震顫+維持低頭咬緊+咬緊較勁(不靠稀疏 burst spike)
      const chomped = ph==='bite'? Math.exp(-p*6)*Math.sin(p*46)*0.16 : 0;   // 咬合餘震(高頻衰減)
      const grind = ph==='bite'? 0.10 : 0.055;               // bite 期咬緊較勁更明顯
      rot=Math.sin(T*4.2)*grind + Math.sin(T*26)*0.075*burst + chomped
        - (ph==='bite'? Math.exp(-p*3)*0.12 : 0);            // 咬下後維持低頭咬緊(前段最壓)再回
      const c=vc(shutP,rot); bx=c.bx+Math.sin(T*3.1)*W*0.01*B; by=c.by;   // 身體慢頻左右晃(重物感)
      if(ph==='land') alpha=1-p*0.5; }
  }

  // russian-doll：前一隻還咬著鉤，被當前隻由下往上縮進巨口
  let prev=null;
  if(stage>0 && (ph==='burst'||ph==='swallow')){
    const ps=stage-1, eaten=ph==='swallow'?p:0;
    // 咬合進度(swallow 後半:嘴閉合→咬死)＋被咬掙扎包絡(中段峰值=剛被咬最猛,吞沒後平息)。
    // hao:大白鯊照常表演(全程 gwHangPose 猛掙扎)→突然被咬一震(thrash 抽搐)→被拖進嘴(縮+陡淡出),
    // 絕不平滑淡出/停格。陡淡出=前段保持可見在掙扎、末段才消失(對齊 tickWhale 的咬合噴血)。
    const bit=bClamp((eaten-0.45)/0.55, 0, 1), thrash=bit*(1-bit)*4;
    const fade=Math.max(0, 1-Math.pow(eaten,2.6)*1.12);
    if(ps===0){
      const hs=gwHangPose(T, hookY, BEAST_H[0], (wh.lurkDir||1), 0, true);   // struggling=true=照常猛掙扎
      wh._burst=hs.burst;
      prev={pose:hs.pose, hFrac:BEAST_H[0]*(1-bit*0.22),                     // 被吞入略縮
            x:hs.bx + Math.sin(T*72)*thrash*7,                               // 咬住橫向劇烈抽搐
            y:hs.by + Math.cos(T*66)*thrash*6 - bit*14,                      // 抽搐+略縮進上方的巨口
            rot:hs.rot + Math.sin(T*74)*bit*0.4,                             // 被咬痙攣
            flip:hs.flip, horiz:true, alpha:fade, shark:true};
    } else {
      // 滄龍被利維坦吞:同哲學(照常→被咬抽搐→陡淡出)
      prev={pose:beastShut[ps], hFrac:BEAST_H[ps]*(1-bit*0.2), x:cx+Math.sin(T*60)*thrash*6,
            y:hookY - bit*16 + Math.cos(T*58)*thrash*5, rot:Math.sin(T*62)*bit*0.3,
            alpha:fade, flip:false, horiz:false};
    }
  }

  // 鉤子含嘴 + taut line（潛伏/逃走時不畫，魚串懸線由主 draw 接管）
  const holdHook = ph!=='lurk' && ph!=='strike' && (ph!=='snapline' || stage===0);   // 大白鯊掙脫=叼著鉤游走
  let hookFront=null;                              // 鉤的「嘴前下彎」——獸畫完後再補畫(含著,不是穿過)
  // 鉤的持有者:湧出/吞食中鉤仍在「前一隻」嘴裡(hao:還沒咬到,鉤不換手);其餘=當前獸
  const hp = prev? {pose:prev.pose, bx:prev.x, by:prev.y, hFrac:prev.hFrac, flip:prev.flip, rot:prev.rot||0, a:prev.alpha, st0:!!prev.shark}
                 : {pose, bx, by, hFrac, flip, rot, a:alpha, st0:stage===0};
  if(holdHook && hp.pose){
    let [mx,my]=beastMouthPt(hp.pose, hp.bx, hp.by, hp.hFrac);
    if(hp.flip) mx=2*hp.bx-mx;                                                // 嘴隨 flip 鏡射
    if(hp.rot){ const rc=Math.cos(hp.rot), rs=Math.sin(hp.rot), ex=mx-hp.bx, ey=my-hp.by;   // 嘴隨 rot 旋轉
      mx=hp.bx+ex*rc-ey*rs; my=hp.by+ex*rs+ey*rc; }
    const jitter=ph==='struggle'?Math.sin(T*90)*2.4:Math.sin(T*70)*1.0;
    if(hp.st0){
      // 大白鯊(hao 三修):鉤/線整組畫在「臉前」,只有上唇帶用獸圖回蓋——
      // 鉤眼+上柄露在嘴上方可見、上唇蓋住中段(=咬住)、鉤彎在口縫、下唇在鉤下
      hookFront={x:mx+jitter, y:my-18, my, line: ph!=='snapline', a:hp.a};   // 眼距嘴縫18px=鉤沉進嘴
    } else {
      if(ph!=='snapline'){
        ctx.save();
        ctx.strokeStyle='rgba(240,246,244,0.92)'; ctx.lineWidth=2.4;
        ctx.beginPath(); ctx.moveTo(cx,-8); ctx.lineTo(mx+jitter,my-4); ctx.stroke();
        ctx.globalAlpha=0.4; ctx.lineWidth=5.5;
        ctx.beginPath(); ctx.moveTo(cx,-8); ctx.lineTo(mx+jitter,my-4); ctx.stroke();
        ctx.restore();
      }
      ctx.save(); ctx.globalAlpha=bClamp(hp.a,0,1);
      drawHook(mx+jitter, my, T, 0);               // 垂直巨獸:整口吞,鉤在獸後被嘴吞掉
      ctx.restore();
    }
  }

  // ---- 程序化變形（讓 PNG 活起來）：身體波動 amp、呼吸、衝刺 squash&stretch，per-phase ----
  const {dw:bdw, dh:bdh} = beastRect(pose, bx, by, hFrac);
  const bodyAxis = horiz? bdh : bdw;
  // 尾巴永遠在打水(hao:像真的在海裡游)——振幅 tailPow≈2 集中尾段,厚身近剛體=不破圖
  let wave=bodyAxis*0.03, wspeed=4.5, breathe=0.016, wlen=0.6, stretch=0, tailPow=2.1;
  if(ph==='lurk'){ wave=bodyAxis*0.065; wspeed=5.5; breathe=0.028; wlen=0.8; }               // 巡游:全幅擺尾
  else if(ph==='strike'||ph==='burst'){ wave=bodyAxis*0.055; wspeed=9.5; wlen=0.7; breathe=0.035; stretch=motion*0.16; }  // 爆衝:高頻大力擺
  else if(ph==='swallow'){ wave=bodyAxis*0.04; wspeed=4.5; breathe=0.03; }
  else if(ph==='snapline'){ wave=bodyAxis*0.07; wspeed=10; wlen=0.8; }                       // 咬斷游走:全力衝刺擺尾
  // 拉扯/掙扎:安靜時只微擺尾、爆發時猛拍(節奏跟 rot 的爆發同源)＋轉動鞭甩;假 skew 水波退役
  let skew=null;
  if(ph==='haul'||ph==='drag'||ph==='struggle'){
    const burst=wh._burst||0;                     // 全 stage 共用爆發包絡(尾拍與身體掙扎同源)
    const wrench=(stage===0)? _gwWhip : 0;
    const base=(stage===0)? 0.02 : 0.035;         // 垂直獸(滄龍/利維坦)身體扭動更大=更真實(hao bug2)
    wave=bodyAxis*(base + 0.075*burst + 0.05*wrench); wspeed=8; wlen=0.7;
  }
  const wopt={flip,rot,dark,horiz,silhouette, wave, speed:wspeed, waveLen:wlen, breathe, stretch, skew, tailPow, T, phase:stage*1.7};

  if(slines>0) beastSpeedLines(cx, by, slines, horiz);              // 速度線（主畫布，獸前）

  // === 獸畫到離屏圖層 → source-atop 疊環境光到獸形狀上 → 貼回（原色細節保留，靠光沉進水裡）===
  const L = beastLayer(), lw=_beastLayer.width, lh=_beastLayer.height;
  L.setTransform(1,0,0,1,0,0); L.clearRect(0,0,lw,lh);
  L.setTransform(ctx.getTransform());                              // 複製主 transform（zoom/shake/cam）
  BEAST_TARGET = L;
  if(prev){ const pAxis=prev.horiz? prev.hFrac*LAYOUT.h : prev.hFrac*LAYOUT.h*prev.pose.iw/prev.pose.ih;
    const pWave=prev.shark? pAxis*(0.02+0.075*(wh._burst||0)) : pAxis*0.05;   // 鯊魚延續吊掛尾拍節奏
    drawBeastWavy(prev.pose, prev.x, prev.y, prev.hFrac, prev.alpha,
      {flip:prev.flip, rot:prev.rot||0, horiz:prev.horiz, wave:pWave, speed:prev.shark?8:6.5,
       waveLen:prev.shark?0.7:0.6, breathe:0.035, tailPow:2.1, T, phase:1.1}); }
  if(motion>0.05){ for(let k=3;k>=1;k--){ const d=k*motion*44, dx=horiz?(wh.lurkDir||1)*d:0, dy=horiz?0:d;   // 殘影拖在行進反方向
    drawBeast(pose, bx+dx, by+dy, hFrac, alpha*.16*(1-k/4), {flip,horiz}); } }
  drawBeastWavy(pose, bx, by, hFrac, alpha, wopt);
  BEAST_TARGET = null;
  /* 第①層·水介質：你和獸之間隔著水（參與介質）。source-atop 只染獸形狀——
     一筆同時做「色度拉向水色/黑位抬升/越深越霧」,亮度細節按比例保留,非 filter 壓暗。 */
  if(!silhouette){
    const {dw:mdw,dh:mdh}=beastRect(pose,bx,by,hFrac);
    const S=Math.max(mdw,mdh)*0.9;                                  // 含旋轉的覆蓋範圍
    L.save(); L.globalCompositeOperation='source-atop';
    const mg=L.createLinearGradient(0,by-S,0,by+S);                 // 獸身空間:上淺下濃(深處被水吃掉更多)
    mg.addColorStop(0,'rgba(16,48,60,0.26)'); mg.addColorStop(0.5,'rgba(16,48,60,0.44)'); mg.addColorStop(1,'rgba(14,40,52,0.68)');   // 中間偏收(hao:最強太沉、first版不夠)
    L.fillStyle=mg; L.fillRect(bx-S,by-S,S*2,S*2);
    L.restore();
  }
  /* 第②層·邊緣柔化：拿自身的模糊 alpha 做 destination-in 羽化——只軟化輪廓那 1-2px,
     內部細節原封不動（去 PNG 剪裁硬邊;不是全圖模糊、不是 glow）。 */
  { const F=featherCanvas();
    F.setTransform(1,0,0,1,0,0); F.clearRect(0,0,_featherL.width,_featherL.height);
    F.filter='blur(3.5px)'; F.drawImage(_beastLayer,0,0); F.filter='none';
    L.save(); L.setTransform(1,0,0,1,0,0); L.globalCompositeOperation='destination-in';
    L.drawImage(_featherL,0,0); L.restore(); }
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha=1; ctx.filter='none'; ctx.drawImage(_beastLayer,0,0); ctx.restore();
  if(hookFront){ const hf=hookFront;               // 臉前的鉤+線 → 上唇帶回蓋獸圖(=上唇蓋著鉤、下唇在鉤下)
    const hA=bClamp(hf.a!=null?hf.a:alpha,0,1);    // 跟著持有者淡出(被吞時鉤/線一起消失)
    ctx.save(); ctx.globalAlpha=hA;
    if(hf.line){
      ctx.strokeStyle='rgba(240,246,244,0.92)'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(cx,-8); ctx.lineTo(hf.x,hf.y-3); ctx.stroke();
      ctx.globalAlpha=hA*0.4; ctx.lineWidth=5.5;
      ctx.beginPath(); ctx.moveTo(cx,-8); ctx.lineTo(hf.x,hf.y-3); ctx.stroke();
      ctx.globalAlpha=hA;
    }
    drawHook(hf.x, hf.y, T, 0);                    // 整支鉤在臉前(眼+上柄可見)
    ctx.beginPath(); ctx.rect(hf.x-17, hf.my-15, 34, 18); ctx.clip();   // 上唇帶(加高=咬合覆蓋更多,hao)
    ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(_beastLayer,0,0);      // 用獸自己的唇回蓋=咬住鉤中段
    ctx.restore();
  }

  if(spray>0){ const [mx,my]=beastMouthPt(pose, bx, by, hFrac); beastSpray(mx, my, spray, T); }
}

function drawWhaleFallback(wh, T, hookDepth, cam){
  const W=LAYOUT.w, H=LAYOUT.h;
  const {ph,p}=wh;
  const stage=(wh.stage!=null)?wh.stage:((wh.tier!=null)?wh.tier:1);
  const dim = (ph==='burst'&&stage===0)? p*0.45 : ph==='snapline'? 0.45*(1-p*0.6) : ph==='land'? 0.45*(1-p) : 0.45;
  ctx.save(); ctx.fillStyle='rgba(3,5,9,'+Math.max(0,dim).toFixed(3)+')'; ctx.fillRect(-PANM,0,W+PANM*2,H); ctx.restore();

  const cx=ANCHOR_X;
  const hookY=worldY(hookDepth)-cam;
  const restFor=(s)=>hookY+BEAST_SNOUT[s]*BEAST_S2[s];

  // RUSSIAN-DOLL PREDATION — the previous beast is still clamped on the hook
  // while the bigger one rises… then vanishes into its jaws
  let clampP=null, prevDraw=null;         // transform of whoever HOLDS the hook
  if(stage>0 && (ph==='burst'||ph==='swallow')){
    const ps=stage-1;
    const eaten = ph==='swallow'? p : 0;
    const px_=cx+Math.sin(T*38)*2, py_=restFor(ps)+eaten*52, pr_=Math.PI/2+Math.sin(T*1.3)*0.012;
    prevDraw={ps, x:px_, y:py_, rot:pr_, alpha:Math.max(0,1-eaten*1.5)};
    clampP={x:px_, y:py_, rot:pr_, S2:BEAST_S2[ps], snout:BEAST_SNOUT[ps]};
  }

  // the CURRENT beast
  const S2=BEAST_S2[stage], snout=BEAST_SNOUT[stage];
  const restY=restFor(stage);
  let cy, mouth, rot=Math.PI/2, tremX=0, alpha=1, wake=0;
  const enterFrom=H+snout*S2+140;
  if(ph==='burst'){ const e=1-Math.pow(1-p,3); cy=enterFrom-(enterFrom-restY-54)*e; mouth=Math.min(1,0.25+p*1.1); wake=1; }
  else if(ph==='swallow'){ cy=restY+54-54*p; mouth=1-Math.pow(p,0.6); }
  else if(ph==='bite'||ph==='haul'){ cy=restY; mouth=0.10+0.05*Math.sin(p*18); }
  else if(ph==='struggle'){ cy=restY+6*Math.sin(p*43);
    rot+=Math.sin(p*38)*0.16*(0.5+p); tremX=Math.sin(p*67)*5*(0.5+p); mouth=0.08; }
  else if(ph==='snapline'){ cy=restY+Math.pow(p,1.7)*H*0.9; rot+=0.3*p; mouth=0.3; alpha=1-p*0.55; }
  else { cy=restY; mouth=0.06; alpha=1-p*0.5; }    // land: hauled out under the flash
  const curRot=rot+Math.sin(T*1.3)*0.012;
  if(ph==='bite'||ph==='haul'||ph==='struggle'||ph==='drag'||ph==='land')
    clampP={x:cx+tremX, y:cy, rot:curRot, S2, snout};

  // --- HOOK INSIDE THE MOUTH + TAUT LINE (hao: 鉤子要含在嘴巴內) ---
  // drawn BEFORE the beasts: the jaw point sits INSIDE the mouth, so the
  // biter's upper lip covers the hook and the line vanishes at the teeth —
  // yet everything still rides the thrash (pose-transformed each frame)
  if(clampP){
    const jl={x:-clampP.snout+38, y:12};
    const cth=Math.cos(clampP.rot), sth=Math.sin(clampP.rot);
    const mx=clampP.x + clampP.S2*(jl.x*cth - jl.y*sth);
    const my=clampP.y + clampP.S2*(jl.x*sth + jl.y*cth);
    const jitter=(ph==='struggle'? Math.sin(T*90)*2.4 : Math.sin(T*70)*1.1);
    const topY=-8;                        // the line falls from the sky anchor at the frame top
    ctx.save();
    ctx.strokeStyle='rgba(240,246,244,0.92)'; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(cx, topY); ctx.lineTo(mx+jitter, my-4); ctx.stroke();
    ctx.globalAlpha=0.4; ctx.lineWidth=5.5;
    ctx.beginPath(); ctx.moveTo(cx, topY); ctx.lineTo(mx+jitter, my-4); ctx.stroke();
    ctx.restore();
    drawHook(mx+jitter, my, T, 0);
  }

  // beasts drawn OVER the line & hook — the mouth swallows them visually
  if(prevDraw) beastAt(prevDraw.ps, prevDraw.x, prevDraw.y,
    {mouth:0.05, rot:prevDraw.rot, alpha:prevDraw.alpha, T});
  beastAt(stage, cx+tremX, cy, {mouth, rot:curRot, alpha, T, wake:wake?p:0});
}

/* beast ladder scales — each stage must DWARF the one before (hao):
   0 small whale · 1 great whale (2×) · 2 MEGALODON (4× — swallows the frame) */
const BEAST_S2=[0.5, 1.0, 2.3];
const BEAST_SNOUT=[262, 262, 310];
function beastAt(stage, x, y, o){
  ctx.save();
  ctx.globalAlpha=(o.alpha!=null)?o.alpha:1;
  ctx.translate(x, y);
  ctx.rotate((o.rot!=null)?o.rot:Math.PI/2);
  // the megalodon runs WIDE — its flank spans the whole frame (local y maps
  // to screen-x after the head-up rotation)
  ctx.scale(BEAST_S2[stage], BEAST_S2[stage]*(stage===2?1.28:1));
  beastBody(stage, o.mouth||0.06, o.T||0, o.wake||0);
  ctx.restore();
}
/* body drawn head-left in local space; caller rotates head-up and scales */
function beastBody(stage, mouth, T, wake){
  if(stage===2){
    /* ============ MEGALODON — the ancient shark, all TEETH ============ */
    const jawY = 20 + mouth*96;            // lower jaw swings wide
    ctx.fillStyle='#0B0D12';
    ctx.beginPath();
    ctx.moveTo(-310,-8);                   // snout tip
    ctx.quadraticCurveTo(-240,-62,-70,-88);
    ctx.quadraticCurveTo(120,-96,232,-44); // back
    ctx.lineTo(258,-16);                   // tail root
    ctx.lineTo(322,-112); ctx.lineTo(296,-4); ctx.lineTo(324,100); ctx.lineTo(258,22);  // crescent tail
    ctx.quadraticCurveTo(130,62,10,74);
    ctx.quadraticCurveTo(-120,82,-232,46); // belly to jaw corner
    ctx.quadraticCurveTo(-268,36,-296,jawY);  // lower jaw (opens WIDE)
    ctx.quadraticCurveTo(-220,30,-176,20); // mouth roof
    ctx.quadraticCurveTo(-238,2,-310,-8);
    ctx.closePath(); ctx.fill();
    // the great dorsal fin — the silhouette that says SHARK
    ctx.beginPath(); ctx.moveTo(0,-90); ctx.lineTo(78,-188); ctx.lineTo(102,-84); ctx.closePath(); ctx.fill();
    // pectoral blade
    ctx.beginPath(); ctx.moveTo(-120,66); ctx.quadraticCurveTo(-92,150,-40,172);
    ctx.quadraticCurveTo(-84,128,-76,70); ctx.closePath(); ctx.fill();
    // TEETH — two ragged rows; the whole threat lives here (hao: 牙齒張力)
    ctx.fillStyle='#EDF3F1';
    for(let i=0;i<7;i++){                  // upper row, hanging from the roof
      const tx=-296+i*19, ty=-2+i*3;
      ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx+8,ty); ctx.lineTo(tx+3.5,ty+15+(i%2)*4); ctx.closePath(); ctx.fill();
    }
    for(let i=0;i<6;i++){                  // lower row, rising from the jaw
      const tx=-288+i*20, ty=jawY-2-i*1.5;
      ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx+9,ty); ctx.lineTo(tx+4.5,ty-14-(i%2)*4); ctx.closePath(); ctx.fill();
    }
    // gill slits
    ctx.strokeStyle='rgba(233,242,240,0.14)'; ctx.lineWidth=2;
    for(const g of [-150,-128,-106]){
      ctx.beginPath(); ctx.moveTo(g,-40); ctx.quadraticCurveTo(g-10,0,g,44); ctx.stroke();
    }
    // old scars across the flank
    ctx.strokeStyle='rgba(233,242,240,0.10)'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(-40,-60); ctx.lineTo(40,-30); ctx.moveTo(-16,-70); ctx.lineTo(52,-44); ctx.stroke();
    // back rim + PALE gold eye — ancient, wrong, magnetic
    ctx.strokeStyle='rgba(150,190,208,0.5)'; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(-310,-8); ctx.quadraticCurveTo(-240,-62,-70,-88);
    ctx.quadraticCurveTo(120,-96,232,-44); ctx.stroke();
    ctx.fillStyle='#FBE7A8';
    ctx.beginPath(); ctx.arc(-236,-26,4.2,0,7); ctx.fill();
    ctx.fillStyle='#0B0D12';
    ctx.beginPath(); ctx.arc(-235,-26,1.7,0,7); ctx.fill();
  } else {
    /* ============ WHALE (0) / GREAT WHALE (1) ============ */
    const lipY = 16 + mouth*72;            // lower lip hinges down = open jaw
    ctx.fillStyle='#0A0E16';
    ctx.beginPath();
    ctx.moveTo(-262,-14);                  // upper lip
    ctx.quadraticCurveTo(-230,-64,-120,-100);
    ctx.quadraticCurveTo(40,-128,180,-74); // back
    ctx.quadraticCurveTo(232,-52,254,-24); // tail root
    ctx.lineTo(318,-90); ctx.lineTo(294,-4); ctx.lineTo(318,82); ctx.lineTo(254,28);  // fluke
    ctx.quadraticCurveTo(180,70,60,92);    // aft belly
    ctx.quadraticCurveTo(-70,108,-170,78); // belly
    ctx.quadraticCurveTo(-238,56,-252,lipY); // lower lip (opens)
    ctx.quadraticCurveTo(-180,28,-158,18); // mouth roof (inside)
    ctx.quadraticCurveTo(-212,-2,-262,-14);
    ctx.closePath(); ctx.fill();
    // pectoral fin
    ctx.beginPath(); ctx.moveTo(-78,58); ctx.quadraticCurveTo(-46,116,-8,132);
    ctx.quadraticCurveTo(-52,104,-42,62); ctx.closePath(); ctx.fill();
    // GREAT WHALE wears barnacle ridges along the back (the elder's crown)
    if(stage===1){
      ctx.fillStyle='rgba(233,242,240,0.13)';
      for(const [bx,by,r] of [[-60,-104,5],[-20,-112,6.5],[24,-116,5],[64,-112,4.5],[100,-104,5.5]]){
        ctx.beginPath(); ctx.arc(bx,by,r,Math.PI,0); ctx.fill();
      }
    }
    // throat grooves
    ctx.strokeStyle='rgba(233,242,240,0.06)'; ctx.lineWidth=1.4;
    for(const k of [0.25,0.5,0.75]){
      ctx.beginPath(); ctx.moveTo(-236+40*k, lipY*k+30*k);
      ctx.quadraticCurveTo(-120, 70+22*k, 20, 84+10*k); ctx.stroke();
    }
    // back rim — bright enough to separate the mass from the dimmed sky
    ctx.strokeStyle='rgba(140,185,205,0.48)'; ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.moveTo(-262,-14); ctx.quadraticCurveTo(-230,-64,-120,-100);
    ctx.quadraticCurveTo(40,-128,180,-74); ctx.stroke();
    ctx.strokeStyle='rgba(140,185,205,0.22)'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(254,28); ctx.lineTo(318,82); ctx.moveTo(254,-24); ctx.lineTo(318,-90); ctx.stroke();
    // gold jaw-line + eye — jackpot language
    ctx.strokeStyle='rgba(246,194,67,0.75)'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.moveTo(-262,-14); ctx.quadraticCurveTo(-212,-2,-158,18); ctx.stroke();
    ctx.fillStyle='#F6C243';
    ctx.beginPath(); ctx.arc(-178,-34,3,0,7); ctx.fill();
  }
  // burst wake — bubbles streaming off the body while it erupts
  if(wake>0){
    ctx.globalAlpha=0.5;
    ctx.strokeStyle='rgba(198,244,246,0.7)'; ctx.lineWidth=1.2;
    for(let i=0;i<7;i++){
      const bx=-200+((i*83)%380), by=120+((i*57)%160)+wake*90;
      ctx.beginPath(); ctx.arc(bx,by,3+(i%3)*2,0,7); ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
}

/* ---------- overlays ---------- */
function drawSlam(s){
  const W=LAYOUT.w, H=LAYOUT.h, cold=s.cold;
  ctx.save(); ctx.textAlign='center'; ctx.translate(W/2, H*0.40); ctx.scale(s.scale||1, s.scale||1);
  setDisplay(s.big?104:94,900);
  ctx.lineWidth=8; ctx.strokeStyle=cold?'#2A123E':'#6E4A12'; ctx.strokeText(s.txt,0,0);
  ctx.fillStyle=cold?'#8A5CC2':'#F6C243'; ctx.fillText(s.txt,0,0);
  ctx.lineWidth=1.4; ctx.strokeStyle=cold?'#C9A7E8':'#FBE7A8'; ctx.strokeText(s.txt,0,0);
  if(s.sub){ ctx.font='600 17px '+FU; ctx.fillStyle=cold?'#C9A7E8':'#FBE7A8'; if('letterSpacing' in ctx) ctx.letterSpacing='1px'; ctx.fillText(s.sub,0,38); if('letterSpacing' in ctx) ctx.letterSpacing='0px'; }
  ctx.restore();
}

/* bubble-pop bursts: {x,y,t,col,r0,seed,label,toX,toY,fishF} t: 0→1 */
function drawPops(pops, cam){
  for(const p of pops){
    const a=1-p.t;
    if(a<=0) continue;
    const y=p.y-cam;
    const grow=1-a;
    ctx.save();
    if(p.small){
      // bite ripple — a modest splash where a fish strikes the line
      ctx.globalAlpha=a*0.7; ctx.strokeStyle=p.col; ctx.lineWidth=1.8;
      ctx.beginPath(); ctx.arc(p.x, y, p.r0+grow*22, 0, 7); ctx.stroke();
      ctx.globalAlpha=a*0.5; ctx.fillStyle='#FFFFFF';
      ctx.beginPath(); ctx.arc(p.x, y, Math.max(0,p.r0*0.5*a), 0, 7); ctx.fill();
      ctx.restore(); continue;
    }
    // triple shockwave in the bubble's tier color
    ctx.globalAlpha=a*0.95; ctx.strokeStyle=p.col; ctx.lineWidth=3.5+6*grow;
    ctx.beginPath(); ctx.arc(p.x, y, p.r0+grow*64, 0, 7); ctx.stroke();
    ctx.globalAlpha=a*0.5; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(p.x, y, p.r0+grow*96, 0, 7); ctx.stroke();
    ctx.globalAlpha=a*0.45; ctx.fillStyle=p.col;
    ctx.beginPath(); ctx.arc(p.x, y, (p.r0+grow*34)*0.62, 0, 7); ctx.fill();
    ctx.globalAlpha=a*0.8; ctx.fillStyle='#FFFFFF';
    ctx.beginPath(); ctx.arc(p.x, y, Math.max(0,p.r0*0.4*a), 0, 7); ctx.fill();
    // glass shards fly out
    const sd=p.seed||0;
    for(let i=0;i<9;i++){
      const ang=sd+i*0.698;
      const dist=p.r0+grow*(70+((i*37)%30));
      const sx2=p.x+Math.cos(ang)*dist, sy2=y+Math.sin(ang)*dist*0.85;
      ctx.globalAlpha=a*0.85; ctx.fillStyle=i%3?p.col:'#FFFFFF';
      const s=(3.4-grow*2.4)*(i%2?1:1.5);
      ctx.fillRect(sx2-s/2, sy2-s/2, s, s);
    }
    // the mult value hangs on the burst, then DIVES onto its fish (smoothstep)
    if(p.toX!=null){
      const k=Math.max(0,Math.min(1,(p.t-0.18)/0.44));   // linger first, then fly
      const tt=k*k*(3-2*k);
      const fx=p.x+(p.toX-p.x)*tt, fy=y+(p.toY-cam-y)*tt;
      const pop=1+0.5*Math.max(0,1-p.t*2.4);             // birth scale-pop
      setDisplay(Math.round(20*pop),900); ctx.textAlign='center';
      ctx.globalAlpha=Math.min(1,a+0.3);
      ctx.fillStyle='rgba(5,8,10,.72)';
      const tw=ctx.measureText(p.label).width+12;
      ctx.fillRect(fx-tw/2, fy-15, tw, 21);
      ctx.fillStyle=p.col; ctx.fillText(p.label, fx, fy+2);
    }
    ctx.restore();
  }
}

/* 咬合噴血渲染（獸吃獸,hao 2026-07-22）：cloud=擴散血雲（暗血紅核心→墨褐→透明,sqrt 擴散＋
   平方淡出）;其餘=噴濺血滴（擴散變大變淡,暗猩紅）。深海血＝暗色被水吞噬,非鮮紅噴漆。 */
function drawBlood(blood, cam){
  ctx.save();
  for(const b of blood){
    const k=b.t/b.life; if(k>=1) continue;
    const y=b.y-cam;
    if(b.cloud){
      const r=b.r0+(b.r1-b.r0)*Math.sqrt(k);              // 先快後慢擴散
      const a=(1-k)*(1-k)*0.55;                            // 平方淡出：前段濃、後段快消
      const g=ctx.createRadialGradient(b.x,y,0, b.x,y,r);
      g.addColorStop(0,   'rgba(86,13,21,'+(a*0.82).toFixed(3)+')');    // 暗血紅核心（再壓暗,hao 2026-07-22）
      g.addColorStop(0.45,'rgba(52,10,16,'+(a*0.6).toFixed(3)+')');    // 稀釋
      g.addColorStop(1,   'rgba(18,7,11,0)');                           // 融入水（墨褐→透明）
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,y,r,0,7); ctx.fill();
    } else {
      const a=(1-k)*0.72, r=b.r*(1+k*1.6);                 // 血滴擴散變大變淡
      ctx.globalAlpha=a;
      ctx.fillStyle = b.dark<0.4?'#560E17':(b.dark<0.75?'#3C0912':'#66131C');   // 再壓暗（深海血更沉,hao）
      ctx.beginPath(); ctx.arc(b.x,y,r,0,7); ctx.fill();
      ctx.globalAlpha=1;
    }
  }
  ctx.restore();
}

/* coin burst → BALANCE: {x,y,vx,vy,t,sz,phase} in screen space */
function drawCoins(coins){
  for(const c of coins){
    if(c.t>=1) continue;
    // gold streak as it homes on the wallet — reads as cash STREAMING to BALANCE (v2.5)
    if(c.px!=null && c.t>0.4){
      const dx=c.x-c.px, dy=c.y-c.py, len=Math.hypot(dx,dy);
      if(len>2.5){
        ctx.save();
        ctx.globalAlpha=Math.min(0.55, len*0.02)*(c.t<0.85?1:(1-(c.t-0.85)/0.15));
        ctx.strokeStyle='#F6C243'; ctx.lineWidth=Math.max(1,c.sz*0.7); ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(c.px,c.py); ctx.lineTo(c.x,c.y); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(c.x, c.y);
    const squash=Math.abs(Math.sin(c.t*9+c.phase));      // spinning disc
    ctx.globalAlpha=c.t<0.85?1:(1-(c.t-0.85)/0.15);
    ctx.fillStyle='#C8922E';
    ctx.beginPath(); ctx.ellipse(0,0,c.sz,c.sz*Math.max(0.28,squash),0,0,7); ctx.fill();
    ctx.fillStyle='#F6C243';
    ctx.beginPath(); ctx.ellipse(0,-c.sz*0.12,c.sz*0.82,c.sz*0.82*Math.max(0.24,squash),0,0,7); ctx.fill();
    ctx.strokeStyle='#FBE7A8'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(0,-c.sz*0.12,c.sz*0.82,c.sz*0.82*Math.max(0.24,squash),0,Math.PI*1.1,Math.PI*1.9); ctx.stroke();
    ctx.restore();
  }
}

/* band nameplate: NAME + metric range (concept-art style, left edge) */
function drawStamp(b, y){
  const H=LAYOUT.h; if(y<14||y>H-6) return;
  ctx.save(); ctx.textAlign='left';
  ctx.globalAlpha=.5; ctx.fillStyle=b.col; setDisplay(17,800);
  if('letterSpacing' in ctx) ctx.letterSpacing='6px';
  ctx.fillText(b.name,20,y);
  ctx.globalAlpha=.4; ctx.font='600 10px '+FU;
  if('letterSpacing' in ctx) ctx.letterSpacing='2px';
  ctx.fillText(b.range,21,y+15);
  if('letterSpacing' in ctx) ctx.letterSpacing='0px';
  ctx.restore();
}

/* ---------- the heavy industrial hook (v2.1 §8.1) --------------------
   Bigger, twin-tone steel, gold gem lure. The SHANK TIP POINTS ALONG THE
   MOTION DIRECTION: velocity is estimated by finite difference on the
   drawn position (self-contained), blended with a current lean. */
let _hookLast=null, _hookAng=0;
function drawHook(eyeX,eyeY,T,curDisp){
  let ang=0;
  if(_hookLast){
    const dx=eyeX-_hookLast.x, dy=eyeY-_hookLast.y;
    // motion direction: straight drop → hang plumb; sideways drag → tip swings
    // toward the drag side; rising (reel) → tip trails upward slightly
    const target=Math.max(-0.7,Math.min(0.7, dx*0.06 + (dy<0?dy*0.012:0) + (curDisp/54)*0.10));
    _hookAng += (target-_hookAng)*0.14;
    ang=_hookAng;
  }
  _hookLast={x:eyeX,y:eyeY};
  ctx.save(); ctx.translate(eyeX,eyeY); ctx.rotate(ang);
  const S=1.55;                                   // v2.1 heft
  ctx.scale(S,S);
  ctx.lineCap='round'; ctx.lineJoin='round';
  // dark steel core
  ctx.strokeStyle='#3A4650'; ctx.lineWidth=4.6;
  hookPath();
  // bone-steel rim
  ctx.strokeStyle='#E8E6DF'; ctx.lineWidth=2.6;
  hookPath();
  // eye ring
  ctx.strokeStyle='#E8E6DF'; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.arc(0,0,4.2,0,7); ctx.stroke();
  ctx.strokeStyle='#3A4650'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(0,0,4.2,0,7); ctx.stroke();
  // gold gem lure near the barb, faint pulse
  const lp=0.75+0.25*Math.sin((T||0)*3.3);
  ctx.globalAlpha=lp; ctx.fillStyle='#F6C243';
  ctx.beginPath(); ctx.moveTo(-15,17); ctx.lineTo(-11,21.5); ctx.lineTo(-15,26); ctx.lineTo(-19,21.5); ctx.closePath(); ctx.fill();
  ctx.globalAlpha=lp*0.9; ctx.strokeStyle='#6E4A12'; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(-15,17); ctx.lineTo(-11,21.5); ctx.lineTo(-15,26); ctx.lineTo(-19,21.5); ctx.closePath(); ctx.stroke();
  ctx.restore();
}
function hookPath(){
  ctx.beginPath();
  ctx.moveTo(0,4.5); ctx.lineTo(0,22);
  ctx.quadraticCurveTo(0,34,-11,34);
  ctx.quadraticCurveTo(-19,34,-16,24);
  // barb
  ctx.moveTo(-16,24); ctx.lineTo(-12.5,27.5);
  ctx.stroke();
}

/* ---------- bubbles: tiered glass spheres carrying ×N ---------- */
const BUBBLE_STYLE = [                       // v2.2b — ×2 floor, all of them big
  { rim:'#6FE3E1', txt:'#6FE3E1', r:BUBBLE_BODY_RADIUS[0] }, // T1 cold cyan
  { rim:'#39C6B5', txt:'#63E0CD', r:BUBBLE_BODY_RADIUS[1] }, // T2 teal
  { rim:'#5B8FC7', txt:'#8FB4E3', r:BUBBLE_BODY_RADIUS[2] }, // T3 deep blue
  { rim:'#C8922E', txt:'#F6C243', r:BUBBLE_BODY_RADIUS[3] }, // T4 gold
  { rim:'#F6C243', txt:'#FBE7A8', r:BUBBLE_BODY_RADIUS[4] }, // T5 baked gold monster
];
function drawBubble(b,T,C,cam,hookDepth,ambient,sx){
  /* `popped` is the sealed economic verdict. Keep the bubble visible on its
     free-swim path until the rising hook physically reaches it; tickReel then
     sets `_popped` at the contact frame. */
  if(b._popped) return;
  const y=worldY(bubbleY(b,T))-cam, H=LAYOUT.h;
  if(y<-50||y>H+50) return;
  const x0=bubbleX(b,T,C);
  // v2.8: a new layer appears where it actually lives. The old far-z zoom
  // projected every bubble toward the line, making PULL read as a line flash.
  const life=T-b.spawnT;
  const introP=Math.max(0,Math.min(1,life/0.72));
  const introE=introP*introP*(3-2*introP);
  const z=bubbleZ(b,T), psc=projScale(z), hz=haze(z);
  const x=projX(x0,z);
  const st=BUBBLE_STYLE[b.tier];
  const shownMult=b.mult;
  const inZone = !ambient && hookDepth>2 && !b.missed &&
                 Math.abs(x-lineXAtDepth(b.depth,T,hookDepth,C,sx))<bubblePopRadius(b,T);
  const breathe=1+0.035*Math.sin(T*1.6+b.bobPhase*3);
  const r=st.r*psc*breathe*(inZone?1.1:1);
  const fade=(ambient?0.55:(b.missed?0.82:1))*(1-hz*0.55)*introE*_seaFade;
  ctx.save(); ctx.globalAlpha=fade;
  // glass body
  ctx.fillStyle='rgba(210,240,244,0.05)';
  ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  // tier rim (double for high tiers)
  ctx.strokeStyle=st.rim; ctx.lineWidth=(b.tier>=3?2.4:1.6)*(inZone?1.3:1);
  ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.stroke();
  if(b.tier===4){ ctx.globalAlpha=fade*0.5; ctx.beginPath(); ctx.arc(x,y,r+3.5,0,7); ctx.stroke(); ctx.globalAlpha=fade; }
  // top-left specular arc + lower reflection
  ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.arc(x-r*0.28,y-r*0.3,r*0.55,Math.PI*1.05,Math.PI*1.55); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(x,y,r*0.8,Math.PI*0.25,Math.PI*0.6); ctx.stroke();
  // ×N label
  if(fade>0.3 && hz<0.55){
    ctx.textAlign='center';
    const label='×'+(shownMult>=10?shownMult.toFixed(0):shownMult.toFixed(2));
    setDisplay(Math.max(11,Math.min(27,r*0.72)),900);
    ctx.fillStyle=st.txt; ctx.globalAlpha=Math.min(1,fade+0.2);
    ctx.fillText(label,x,y+r*0.18);
  }
  ctx.restore();
}

/* ---------- fish: SCORE archetypes + golden SCATTER ----------
   TIERED sizing (v2.1 hao): value↔size is a LADDER, not a linear map —
   each archetype steps ~1.45× up so the class reads instantly.
   v2.1d: FEWER, BIGGER — every fish ~1.4× (scarce screen = each one matters). */
// v2.2b — everything in the water is bigger: fewer, larger, each one an event
function drawFish(f,T,C,cam,hookDepth,ambient,sx){
  if(f._swallowed) return;                 // inside the whale
  if(f._cashed) return;                    // already burst into coins at the surface
  const grabbed = f._grab && (f._reelDepth!=null);
  const depth = grabbed ? f._reelDepth : f.depth;
  const lineD = hookDepth>0 ? hookDepth : depth;
  const fan = grabbed ? Math.sin((f._order||0)*2.1)*16 : 0;
  let x, y;
  if(grabbed){
    // BITE — the fish strikes onto the line from wherever it swam to
    // (smoothstep over 0.22s), then rides the string
    const k=Math.min(1,(T-(f._hookT!=null?f._hookT:T))/0.22), ke=k*k*(3-2*k);
    const lx=lineXAtDepth(depth,T,lineD,C,sx)+fan+(f._attachX||0), ly=worldY(depth);
    x = (f._fromX!=null)? f._fromX+(lx-f._fromX)*ke : lx;
    y = ((f._fromY!=null)? worldY(f._fromY)+(ly-worldY(f._fromY))*ke : ly) - cam;
  } else {
    x = fishX(f,T,C);
    y = worldY(fishY(f,T)) - cam;
  }
  const H=LAYOUT.h;
  if(y<-60||y>H+60) return;
  // a MISS-reward prize stays hidden until the shark's charge ends — then it
  // EMERGES at the bite point (foreground, no far-murk swim-in) as the shark that
  // "became" it fades off (hao: 失手變成獎勵).
  if(f._revealT!=null && T < f._revealT) return;
  // v2.8 spawn intro: fade in at the seeded horizontal position. Do not travel
  // from the far-z vanishing point—the projection concentrated new fish on the
  // line and made a quick PULL look like the line itself was blinking.
  const life = T - f.spawnT;
  const introP = Math.max(0,Math.min(1,life/0.72));
  const introE = f._revealT!=null ? 1 : introP*introP*(3-2*introP);
  const z = grabbed ? 0 : fishZ(f,T);
  const psc = projScale(z);
  const px = projX(x, z);
  const hz = grabbed ? 0 : haze(z);
  const phase=fishTailPhase(f,T);
  const inZone = !ambient && !grabbed && hookDepth>2 && !f.caught && !f.escaped &&
                 Math.abs(px-lineXAtDepth(f.depth,T,hookDepth,C,sx))<fishCatchRadius(f,T);
  // Do not reveal the sealed verdict before physical contact. Gold begins only
  // once the hook has actually taken the fish.
  const warm = grabbed;
  const isScatter = f.type==='SCATTER';
  const isPrize = f.type==='PRIZE';
  /* v2.3 (hao: PULL 的過程本來在 SINK 中出現的魚都要維持在畫面上, 不能消失,
     要讓玩家感覺到過程有機會勾到這些魚) — a fish the budget did not buy used to
     fade to 0.22 during the climb, which effectively deleted it. That quietly
     threw away the near-miss: the player was TOLD they missed instead of
     watching it happen. It now stays legible and darts past the hook's nose
     (fishX's dash), so the water still looks full of chances all the way up.
     Still a touch under a catch — the string is what glows. */
  const fade0 = ambient ? (0.12 + 0.24*(0.5+0.5*Math.sin(T*0.5 + f.spawnX*0.03 + f.swimPhase)))
                        : ((f.escaped && !f.caught) ? 0.82 : 1);
  const fade = fade0 * (1 - hz*0.6) * introE * _seaFade;
  const base = FISH_BODY_SIZE[f.arch]||15;
  const sz = base*(inZone ? (1+0.07*Math.sin(T*7)) : 1) * psc;
  let facing=1, bank=0, speed=0;
  if(!grabbed){
    const h=0.06;
    const vxr=(fishX(f,T+h,C)+fan-x)/h, vyr=(worldY(fishY(f,T+h))-cam-y)/h;
    facing=Math.tanh(vxr/18); speed=Math.min(1,Math.hypot(vxr,vyr)/110);
    bank = Math.atan2(vyr, Math.abs(vxr)+40)*0.6;
  }
  const tail = Math.sin(phase)*(0.32+speed*0.55);
  const rim = (isScatter||isPrize) ? '#F6C243'
            : (warm?'#F6C243':inZone?'#9DF0EE':'#5A8F86');
  const body = warm ? '#2a2208' : ((isScatter||isPrize) ? '#231A08' : '#0C0F12');
  ctx.save(); ctx.globalAlpha=fade; ctx.translate(px,y);
  if(grabbed) ctx.rotate(-0.22 + Math.sin(T*8+(f._order||0))*0.12);
  else ctx.rotate(bank);
  /* Horizontal foreshortening makes a direction change read as the fish
     turning through the camera plane instead of instantly mirroring. */
  ctx.scale(grabbed?1:facing,1);
  // flexing body
  const midY = tail*sz*0.42;
  ctx.fillStyle=body;
  ctx.beginPath();
  ctx.moveTo(sz,0);
  ctx.quadraticCurveTo(0,-sz*0.62+midY, -sz*0.9, midY*0.6);
  ctx.quadraticCurveTo(0, sz*0.62+midY,  sz, 0);
  ctx.closePath(); ctx.fill();
  // forked tail
  ctx.save(); ctx.translate(-sz*0.9, midY*0.6); ctx.rotate(tail*1.1);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-sz*0.55,-sz*0.5); ctx.lineTo(-sz*0.3,0); ctx.lineTo(-sz*0.55,sz*0.5); ctx.closePath(); ctx.fill(); ctx.restore();
  // archetype details
  if(f.arch==='large'||f.arch==='giant'||isPrize){
    // dorsal fin
    ctx.beginPath(); ctx.moveTo(sz*0.1,-sz*0.5+midY*0.8); ctx.lineTo(-sz*0.15,-sz*0.95+midY); ctx.lineTo(-sz*0.42,-sz*0.5+midY*0.8); ctx.closePath(); ctx.fill();
  }
  if(f.arch==='giant'||isPrize){
    // belly fin + heavier jaw line
    ctx.beginPath(); ctx.moveTo(sz*0.15,sz*0.48+midY*0.8); ctx.lineTo(-sz*0.02,sz*0.8+midY); ctx.lineTo(-sz*0.3,sz*0.48+midY*0.8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle=rim; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(sz*0.96,sz*0.06); ctx.quadraticCurveTo(sz*0.5,sz*0.3+midY*0.3,sz*0.1,sz*0.34+midY*0.4); ctx.stroke();
  }
  // dorsal rim
  ctx.strokeStyle=rim; ctx.lineWidth=(inZone?2.2:1.4)*(f.arch==='giant'?1.3:1);
  ctx.beginPath(); ctx.moveTo(sz,0); ctx.quadraticCurveTo(0,-sz*0.62+midY,-sz*0.9,midY*0.6); ctx.stroke();
  // eye
  ctx.fillStyle=warm?'#FBE7A8':((isScatter||isPrize)?'#FBE7A8':inZone?'#9DF0EE':'#6FE3E1');
  ctx.beginPath(); ctx.arc(sz*0.55,-sz*0.1+midY*0.3,1.5,0,7); ctx.fill();
  if(isScatter){
    // golden halo — the jackpot fish reads as PRECIOUS from across the screen
    const hp=0.5+0.5*Math.sin(T*2.6+f.swimPhase);
    ctx.globalAlpha=fade*(0.35+0.3*hp);
    ctx.strokeStyle='#F6C243'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.arc(0,0,sz*1.7+2*hp,0,7); ctx.stroke();
    ctx.globalAlpha=fade*0.8; ctx.strokeStyle='#FBE7A8'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(0,0,sz*1.25,0,7); ctx.stroke();
  }
  ctx.restore();
  // 變成獎勵特效 (hao 2026-07-22): when a MISS-reward emerges, a gold ring blooms
  // out + sparkle spokes — the shark that passed just "became" this prize.
  if(f._revealT!=null){
    const rp=(T-f._revealT)/0.5;
    if(rp>=0 && rp<1){
      const a=1-rp;
      ctx.save();
      ctx.globalAlpha=a*0.85; ctx.strokeStyle='#F6C243'; ctx.lineWidth=2.6*(1-rp*0.6);
      ctx.beginPath(); ctx.arc(px,y, sz*(0.6+rp*2.4),0,7); ctx.stroke();
      ctx.globalAlpha=a*0.45; ctx.strokeStyle='#FBE7A8'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(px,y, sz*(0.3+rp*3.6),0,7); ctx.stroke();
      ctx.globalAlpha=a*0.7; ctx.strokeStyle='#FBE7A8'; ctx.lineWidth=1.5;
      for(let i=0;i<6;i++){ const ang=i*1.047+rp*0.6, r0=sz*0.5, r1=sz*(1.1+rp*1.9);
        ctx.beginPath(); ctx.moveTo(px+Math.cos(ang)*r0,y+Math.sin(ang)*r0); ctx.lineTo(px+Math.cos(ang)*r1,y+Math.sin(ang)*r1); ctx.stroke(); }
      ctx.restore();
    }
  }
  // label — points for SCORE, ★ for scatter
  if(fade>0.45 && !ambient && hz<0.5){
    ctx.save(); ctx.textAlign='center';
    const applied=f.multApplied||1;
    const boosted=applied>1 && grabbed;
    const bf=f._boostFlash||0;                           // 1→0 right after the mult slams on
    if(bf>0){                                            // gold shock ring + ripple
      ctx.globalAlpha=bf*0.75; ctx.strokeStyle='#F6C243'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.arc(px,y,sz*(1.25+(1-bf)*1.5),0,7); ctx.stroke();
      ctx.globalAlpha=bf*0.3; ctx.strokeStyle='#FBE7A8'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.arc(px,y,sz*(1.7+(1-bf)*2.2),0,7); ctx.stroke();
    }
    const col = isScatter ? '#F6C243' : (boosted?'#FBE7A8':warm?'#F6C243':inZone?'#9DF0EE':'#6FE3E1');
    // WYSIWYG: use the exact same basis-point rounding as round.js settlement.
    const shownBp=Math.round(f.score*BP*applied);
    const label = isScatter ? '★' : fmtU(shownBp/BP*U.stake);
    const basePx = isScatter?14:(boosted?22:f.arch==='giant'?20:f.arch==='large'?17:15);
    setDisplay(Math.round(basePx*(1+bf*0.55)),900);      // the new value BOUNCES in
    ctx.globalAlpha=Math.min(1,fade+0.2);
    const ty=y-sz*0.7-8;
    ctx.fillStyle='rgba(5,8,10,.68)'; const tw=ctx.measureText(label).width+10;
    ctx.fillRect(px-tw/2,ty-12-bf*4,tw,16+bf*6);
    ctx.fillStyle=col; ctx.fillText(label,px,ty+1);
    // unit tag only in points mode — in cash mode the decimals already say "money"
    if(!isScatter && U.dp===0){ ctx.globalAlpha=fade*0.5; setDisplay(8,800); ctx.fillStyle='#7E9596'; ctx.fillText('PTS',px,ty+10); }
    ctx.restore();
  }
}

function drawShark(s,T,C,cam,hookDepth,sx){
  const lx=lineXAtDepth(s.depth,T,hookDepth,C,sx);
  let x=sharkX(s,T), dir, charge=0, cutAlpha=1, chargeE=0;
  if(s._cut){
    // 從屏幕外游入 → cross → out the far side (hao 2026-07-22): the shark enters from
    // off-screen (`from`), swims across and reaches the line exactly at charge=1
    // (the bite/pass), then (raw>1) carries on out the OTHER edge, fading.
    const raw=(T-s._cut.t0)/s._cut.dur;
    charge=Math.min(1,raw);
    chargeE=charge*charge*(3-2*charge);
    dir=(lx>=s._cut.from)?1:-1;                       // entry edge → line → far edge
    x=s._cut.from+(lx-s._cut.from)*chargeE;           // reaches the line at charge=1
    cutAlpha=0.62+0.38*chargeE;                       // it's at its own depth (clear water), a slight commit-brighten
    if(raw>1){ const ex=raw-1; x=lx+dir*ex*s._cut.dur*720; cutAlpha=Math.max(0,1-ex/0.6); }
  } else {
    const vx=-s.amp*s.freq*Math.sin(s.freq*(T-s.spawnT)+s.phase);
    dir=vx>=0?1:-1;
  }
  const y=worldY(s.depth)-cam, H=LAYOUT.h;
  if(y<-50||y>H+50) return;
  let devFade=1;                                    // dev: a neutralized test-shark fades out fast, so it never clutters the cut segment
  if(s._devFadeT0!=null){ devFade=1-(T-s._devFadeT0)/0.7; if(devFade<=0) return; }
  const near = charge>0 || (hookDepth>2 && Math.abs(x-lx)<SHARK_CONTACT_DIST+30);
  // spawn intro: the shark surfaces out of the gloom, no pop-in
  const intro=Math.min(1,(T-s.spawnT)/1.2), introE=intro*intro;
  // a CHARGING biter is fully opaque + full-size — it commits, it doesn't fade in.
  // (the biter always just spawned in the segment it bites, so keying its alpha to
  //  the 1.2s intro left it half-transparent exactly when you need to see it.)
  const sc=charge>0 ? (0.88+0.42*chargeE) : (0.7+0.3*introE);   // enters near full-size (its own depth), looms as it commits
  ctx.save(); ctx.translate(x,y); ctx.scale(dir*sc,sc);
  ctx.globalAlpha= s._cut ? cutAlpha : (s.resolved?0.25:1)*introE*devFade;
  ctx.fillStyle='#0A0712';
  ctx.beginPath(); ctx.moveTo(34,0); ctx.quadraticCurveTo(6,-15,-26,-9); ctx.lineTo(-40,-2);
  ctx.lineTo(-40,2); ctx.lineTo(-26,9); ctx.quadraticCurveTo(6,15,34,0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-2,-13); ctx.lineTo(-12,-30); ctx.lineTo(-16,-12); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-38,0); ctx.lineTo(-52,-14); ctx.lineTo(-46,0); ctx.lineTo(-52,14); ctx.closePath(); ctx.fill();
  ctx.strokeStyle= near?'#B98CE6':'#8A5CC2'; ctx.lineWidth= near?2:1.2;
  ctx.beginPath(); ctx.moveTo(34,0); ctx.quadraticCurveTo(6,-15,-26,-9); ctx.stroke();
  ctx.fillStyle= near?'#F6C243':'#8A5CC2'; ctx.beginPath(); ctx.arc(20,-2,1.8,0,7); ctx.fill();
  ctx.restore();
}
