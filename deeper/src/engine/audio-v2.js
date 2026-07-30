/* ============================================================
   DEEPER v2 — AUDIO: everything is SYNTHESISED at call time.

   No samples, no generated assets, no paid API — just WebAudio
   primitives. That keeps the build a single JS module, makes every
   sound tunable by a number instead of a re-render, and lets pitch
   track game state (combo chains climb a scale, ambience opens and
   closes with depth).

   The palette mirrors design-system.md so the ears agree with the eyes:
     · GOLD / reward   — metallic bell partials, fast bright decay
     · COLD CYAN       — glassy sine & triangle, clean
     · PETROL VIOLET   — LOSS ONLY: a detuned pair sliding DOWN + harsh
                         band-passed noise. Never used for anything else.
     · WATER           — filtered noise with a moving resonance
     · MACHINERY       — low saw through a lowpass, lightly ground by AM

   Nothing here consumes engine rng or touches the economy: audio is a
   VIEW, exactly like the renderer. Math.random is free to use.

   Autoplay: browsers only allow audio after a user gesture, so nothing
   is built until unlock() is called from the first pointerdown.
   ============================================================ */

let ctx=null, master=null, muted=false, ready=false;
let amb=null, sink=null;          // the two persistent (looping) voices
let noiseBuf=null;
let fired=Object.create(null);    // dev counter: which cues actually played

const now = () => ctx.currentTime;
const rnd = (a,b) => a+(b-a)*Math.random();

/* one shared white-noise table — every watery/mechanical sound is a
   window onto this buffer through a different filter */
function buildNoise(){
  const n=Math.floor(ctx.sampleRate*2);
  noiseBuf=ctx.createBuffer(1,n,ctx.sampleRate);
  const d=noiseBuf.getChannelData(0);
  let last=0;
  for(let i=0;i<n;i++){
    const w=Math.random()*2-1;
    last=(last+0.02*w)/1.02;              // a touch of brown tilt = body
    d[i]=w*0.6+last*3.2;
  }
}

export function unlock(){
  // ALWAYS try to resume, even when already built: the very first gesture can
  // be one the browser doesn't count as user activation (or the tab was
  // backgrounded), leaving a suspended context that would never wake again.
  if(ready){ resume(); return; }
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC) return;
  ctx=new AC();
  buildNoise();
  master=ctx.createGain(); master.gain.value=muted?0:0.9;
  const comp=ctx.createDynamicsCompressor();   // keeps combo chains from clipping
  comp.threshold.value=-14; comp.knee.value=22; comp.ratio.value=5;
  comp.attack.value=0.004; comp.release.value=0.20;
  master.connect(comp); comp.connect(ctx.destination);
  buildAmbience(); buildSinkVoice(); buildDanger();
  ready=true;
  resume();
}
export function resume(){ if(ctx && ctx.state==='suspended') ctx.resume(); }
export function isReady(){ return ready; }
export function ctxState(){ return ctx? ctx.state : 'none'; }
export function setMuted(m){
  muted=!!m;
  if(master) master.gain.setTargetAtTime(muted?0:0.9, now(), 0.02);
  return muted;
}
export function toggleMuted(){ return setMuted(!muted); }
export function isMuted(){ return muted; }
export function counters(){ return {...fired}; }
function mark(k){ fired[k]=(fired[k]||0)+1; }

/* ---------- primitives ---------- */
// a plain voice: osc → gain(ADSR-ish) → out
function tone({freq, to, type='sine', dur=0.2, gain=0.2, at=0.004, dest, curve='exp', pan=0, dly=0}){
  if(!ready) return;
  const t=now()+dly, o=ctx.createOscillator(), g=ctx.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  if(to && to!==freq){
    if(curve==='exp') o.frequency.exponentialRampToValueAtTime(Math.max(1,to), t+dur);
    else o.frequency.linearRampToValueAtTime(to, t+dur);
  }
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(gain, t+at);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(panned(dest||master, pan));
  o.start(t); o.stop(t+dur+0.02);
}
// filtered noise burst — the water/impact workhorse
function noise({dur=0.3, gain=0.2, type='lowpass', f0=800, f1, q=1, dest, at=0.003, rate=1, dly=0}){
  if(!ready) return;
  const t=now()+dly, s=ctx.createBufferSource(), bp=ctx.createBiquadFilter(), g=ctx.createGain();
  s.buffer=noiseBuf; s.loop=true; s.playbackRate.value=rate;
  s.loopStart=Math.random()*1.5; s.loopEnd=s.loopStart+0.4;
  bp.type=type; bp.frequency.setValueAtTime(f0,t); bp.Q.value=q;
  if(f1) bp.frequency.exponentialRampToValueAtTime(Math.max(20,f1), t+dur);
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(gain, t+at);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  s.connect(bp); bp.connect(g); g.connect(dest||master);
  s.start(t); s.stop(t+dur+0.02);
}
function panned(dest, p){
  if(!p || !ctx.createStereoPanner) return dest;
  const n=ctx.createStereoPanner(); n.pan.value=Math.max(-1,Math.min(1,p)); n.connect(dest); return n;
}
/* struck metal: a fundamental plus inharmonic partials, fast decay.
   This is the "gold" of the palette — used for every reward beat. */
function metal({freq=520, dur=0.5, gain=0.16, dest, bright=1, dly=0}){
  if(!ready) return;
  const parts=[[1,1],[2.01,0.5],[3.03,0.32*bright],[4.72,0.18*bright],[6.1,0.1*bright]];
  for(const [m,a] of parts)
    tone({freq:freq*m, type:'sine', dur:dur*(1-0.11*Math.log2(m)), gain:gain*a, at:0.002, dest, dly});
  noise({dur:0.045, gain:gain*0.5, type:'highpass', f0:2600, dest, dly});   // the strike itself
}

/* ---------- persistent voices ---------- */
function buildAmbience(){
  const g=ctx.createGain(); g.gain.value=0.0; g.connect(master);
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=760; lp.Q.value=0.7;
  lp.connect(g);
  const s=ctx.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
  const sg=ctx.createGain(); sg.gain.value=0.05; s.connect(sg); sg.connect(lp); s.start();
  const o1=ctx.createOscillator(), o2=ctx.createOscillator(), og=ctx.createGain();
  o1.type='sine'; o2.type='sine'; o1.frequency.value=55; o2.frequency.value=55.35;
  og.gain.value=0.05; o1.connect(og); o2.connect(og); og.connect(g); o1.start(); o2.start();
  amb={g, lp, o1, o2};
}
function buildSinkVoice(){
  const g=ctx.createGain(); g.gain.value=0; g.connect(master);
  const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=190; bp.Q.value=1.1; bp.connect(g);
  const s=ctx.createBufferSource(); s.buffer=noiseBuf; s.loop=true; s.connect(bp); s.start();
  const saw=ctx.createOscillator(), sg=ctx.createGain(), slp=ctx.createBiquadFilter();
  saw.type='sawtooth'; saw.frequency.value=62; slp.type='lowpass'; slp.frequency.value=320;
  sg.gain.value=0.35; saw.connect(slp); slp.connect(sg); sg.connect(g); saw.start();
  sink={g, bp, saw};
}
/* called every frame: the sea closes in as you go deeper, and the winch
   voice tracks the throttle (this is the "weight" you hear) */
export function setWorld(depthFrac, throttle, active){
  if(!ready) return;
  const t=now(), d=Math.max(0,Math.min(1,depthFrac||0));
  amb.g.gain.setTargetAtTime(active?0.42:0.16, t, 0.5);
  amb.lp.frequency.setTargetAtTime(820-620*d, t, 0.4);       // pressure closes the top end
  amb.o1.frequency.setTargetAtTime(55-13*d, t, 0.6);          // and drags the drone down
  amb.o2.frequency.setTargetAtTime(55.35-13*d, t, 0.6);
  const th=Math.max(0,Math.min(1,throttle||0));
  sink.g.gain.setTargetAtTime(th*0.10, t, 0.08);
  sink.bp.frequency.setTargetAtTime(150+150*th, t, 0.15);
  sink.saw.frequency.setTargetAtTime(58+16*th, t, 0.15);
}
export function silenceLoops(){ if(!ready) return;
  sink.g.gain.setTargetAtTime(0, now(), 0.05);
  if(danger) danger.g.gain.setTargetAtTime(0, now(), 0.2);
  amb.g.gain.setTargetAtTime(0.16, now(), 0.4); }

/* ---------- cues ----------
   Named for the beat they serve, not the DSP they use. */

// gauge notch — the gesture "bites"
export function tick(strong){ mark('tick');
  tone({freq:strong?1180:880, to:strong?1420:1010, type:'triangle', dur:0.05, gain:0.05});
  noise({dur:0.03, gain:0.035, type:'highpass', f0:3200});
}
export function ui(){ mark('ui'); tone({freq:660, to:880, type:'square', dur:0.05, gain:0.035}); }

// the winch lets go — DROP
export function cast(){ mark('cast');
  tone({freq:120, to:46, type:'sawtooth', dur:0.5, gain:0.11});
  noise({dur:0.55, gain:0.10, type:'lowpass', f0:1500, f1:260});
  tone({freq:300, to:150, type:'triangle', dur:0.16, gain:0.05});
}
/* THE ANTE (v2.3) — another bet goes in on the way down.
   ~~fee(): bandpass 1500→420 + a 210→96 square — "mechanical, cold, unwelcome".~~
   That was the right sound for a CHARGE and exactly the wrong one for a BET.
   The ante buys pool, so it is a chip hitting the felt with an overtone RISING
   after it: metallic (the codex's gold = struck metal) and resolving UPWARD.
   If this ever sounds unwelcome again, the mechanic has drifted back to a fee.
   ⚠ v2.3b: the game no longer FIRES this — every segment antes now, so the
   charge is silent by design (see main-v2's advanceDepth). Kept as a dev cue and
   as the ready-made voice if the ante is ever dialled back to a probability. */
export function ante(){ mark('ante');
  noise({dur:0.06, gain:0.12, type:'bandpass', f0:2800, f1:1100, q:3.4});    // chip on felt
  tone({freq:392, to:587, type:'triangle', dur:0.19, gain:0.070});           // G4→D5, value going in
  tone({freq:784, to:1175, type:'sine', dur:0.15, gain:0.032, dly:0.035});   // its metal octave
}
// a fish strikes onto the string
/* the catch lands ON the hook — v2.5 (hao: PULL 到魚的音效要更亮更爽): a bright
   metallic 'got it' + an upward sparkle + a crisp snap, over a touch of body so it
   still has weight. A string of catches now reads as bright ticks, not soft thuds. */
export function bite(){ mark('bite');
  const f=rnd(640,780);
  metal({freq:f, dur:0.15, gain:0.075, bright:1.4});                       // bright metallic strike
  tone({freq:f*2.1, to:f*3.0, type:'triangle', dur:0.06, gain:0.042});     // quick upward sparkle
  noise({dur:0.05, gain:0.09, type:'highpass', f0:3600, rate:rnd(0.95,1.12)}); // crisp snap transient
  tone({freq:rnd(210,262), to:150, type:'sine', dur:0.08, gain:0.045});    // a little body/weight
}
/* bubble pop — the mult beat. Tier picks the register, the combo index
   walks UP a pentatonic scale so a long chain resolves as a phrase
   (§8.3 "多顆連爆時音高逐級加碼"). */
const PENTA=[0,2,4,7,9,12,14,16,19,21,24,26];
export function pop(tier=0, combo=0){ mark('pop');
  const base=[430,520,640,760,900][Math.max(0,Math.min(4,tier))];
  const semi=PENTA[Math.min(PENTA.length-1, combo)];
  const f=base*Math.pow(2, semi/12);
  metal({freq:f, dur:0.42+tier*0.06, gain:0.11+tier*0.014, bright:0.7+tier*0.14});
  noise({dur:0.06, gain:0.07, type:'bandpass', f0:f*2.2, q:3});      // the glass giving way
  tone({freq:f*0.5, to:f*0.36, type:'sine', dur:0.14, gain:0.05});   // body
}
// golden scatter — precious, unmistakable
export function scatter(){ mark('scatter');
  [0,0.075,0.15].forEach((d,i)=>metal({freq:660*Math.pow(2,[0,4,7][i]/12), dur:0.7, gain:0.10, bright:1.3, dly:d}));
  noise({dur:0.5, gain:0.05, type:'highpass', f0:4200});
}
// PULL windup — the line takes the strain
export function windup(sec=0.65){ mark('windup');
  tone({freq:70, to:190, type:'sawtooth', dur:sec, gain:0.055, curve:'lin'});
  noise({dur:sec, gain:0.05, type:'bandpass', f0:300, f1:1400, q:3});
}
// breaking the surface — the big water event
export function breach(){ mark('breach');
  noise({dur:0.5, gain:0.26, type:'bandpass', f0:420, f1:2600, q:0.8});
  noise({dur:0.32, gain:0.18, type:'highpass', f0:2400});
  tone({freq:150, to:52, type:'sine', dur:0.4, gain:0.14});
}
// a fish crosses the line and turns to gold — v2.5 (hao: 金幣音效要更像 cash):
// a cash-register cha-CHING — a mechanical drawer tick, then a bright bell (metallic
// partials + a perfect-fifth shimmer + octave sparkle). Staggered crossings jingle.
export function coin(){ mark('coin');
  noise({dur:0.028, gain:0.05, type:'highpass', f0:4600});                   // the drawer 'cha'
  const f=rnd(1240,1460);
  metal({freq:f, dur:0.24, gain:0.05, bright:1.5, dly:0.018});               // bright bell body
  tone({freq:f*1.5, type:'sine', dur:0.13, gain:0.03, dly:0.018});          // perfect-fifth shimmer
  tone({freq:f*2.0, type:'triangle', dur:0.08, gain:0.02, dly:0.018});      // octave sparkle
}
// the payout lands — tier 0..4 scales the ceremony
export function win(tier=1){ mark('win');
  const t=Math.max(0,Math.min(4,tier));
  tone({freq:110, to:60, type:'sine', dur:0.5, gain:0.16});
  noise({dur:0.2, gain:0.10, type:'lowpass', f0:2400, f1:600});
  const root=[392,440,494,523,587][t];
  [1,1.26,1.5].slice(0, t>=2?3:2).forEach((m,i)=>
    metal({freq:root*m, dur:0.9+t*0.15, gain:0.11, bright:1+t*0.12, dly:i*0.07}));
}
/* LOSS — petrol violet only: a detuned pair sliding down under a
   whip-crack. Never bright, never metallic. */
export function snap(){ mark('snap');
  noise({dur:0.09, gain:0.3, type:'highpass', f0:2200});             // the crack
  tone({freq:420, to:60, type:'sawtooth', dur:0.7, gain:0.12});
  tone({freq:414, to:57, type:'sawtooth', dur:0.75, gain:0.10});     // detuned twin = unease
  noise({dur:0.9, gain:0.10, type:'lowpass', f0:700, f1:120});
}

/* ---------- SHARK: the dread, the lunge, the verdict (v2.1e) ----------
   The danger voice is CONTINUOUS and tracks how close the threat is — it is
   the ear's version of "不要突然就發生". The strike riser then owns the
   moment between contact and verdict. */
let danger=null;
function buildDanger(){
  const g=ctx.createGain(); g.gain.value=0; g.connect(master);
  const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=140; bp.Q.value=3.2; bp.connect(g);
  const s=ctx.createBufferSource(); s.buffer=noiseBuf; s.loop=true; s.connect(bp); s.start();
  const o=ctx.createOscillator(), og=ctx.createGain();
  o.type='triangle'; o.frequency.value=47; og.gain.value=0.5; o.connect(og); og.connect(g); o.start();
  danger={g, bp, o};
}
export function setDanger(x){
  if(!ready || !danger) return;
  const t=now(), d=Math.max(0,Math.min(1,x||0));
  danger.g.gain.setTargetAtTime(d*d*0.16, t, 0.25);        // squared: only real proximity speaks
  danger.bp.frequency.setTargetAtTime(120+220*d, t, 0.3);
  danger.o.frequency.setTargetAtTime(44+26*d, t, 0.3);
}
// contact made — the seconds before the verdict
export function strikeRise(dur=1.2){ mark('strikeRise');
  tone({freq:90, to:520, type:'sawtooth', dur, gain:0.09, curve:'lin'});
  noise({dur, gain:0.11, type:'bandpass', f0:260, f1:2400, q:5});
  tone({freq:41, to:58, type:'sine', dur, gain:0.16, curve:'lin'});
}
// it bit through — LOSS: petrol violet only
export function cut(){ mark('cut');
  noise({dur:0.10, gain:0.30, type:'bandpass', f0:1800, f1:400, q:1.4});   // the chomp
  noise({dur:0.08, gain:0.26, type:'highpass', f0:2600, dly:0.05});        // the line parting
  tone({freq:430, to:58, type:'sawtooth', dur:0.8, gain:0.13, dly:0.05});
  tone({freq:423, to:55, type:'sawtooth', dur:0.85, gain:0.11, dly:0.05});
  noise({dur:1.0, gain:0.10, type:'lowpass', f0:700, f1:110, dly:0.05});
}
// it missed — the line HELD
export function held(){ mark('held');
  tone({freq:300, to:820, type:'triangle', dur:0.22, gain:0.09});
  tone({freq:600, to:1230, type:'sine', dur:0.28, gain:0.05, dly:0.03});
  noise({dur:0.18, gain:0.07, type:'highpass', f0:2400});
}
// the loss card lands
export function card(cold){ mark('card');
  if(cold){ tone({freq:150, to:74, type:'sine', dur:0.7, gain:0.14});
            tone({freq:225, to:112, type:'triangle', dur:0.6, gain:0.05}); }
  else metal({freq:523, dur:0.9, gain:0.12, bright:1.3});
  noise({dur:0.25, gain:0.08, type:'lowpass', f0:1200, f1:300});
}

/* ---------- BEAST event ---------- */
export function omen(){ mark('omen');
  tone({freq:34, to:44, type:'sine', dur:2.0, gain:0.15, curve:'lin'});
  noise({dur:2.0, gain:0.09, type:'lowpass', f0:220, f1:600, q:1.6});
  tone({freq:96, to:132, type:'triangle', dur:1.8, gain:0.03, curve:'lin'});
}
export function beastBurst(stage=0){ mark('beastBurst');
  const k=1+stage*0.35;
  noise({dur:0.7, gain:0.24*k, type:'lowpass', f0:300, f1:2200, q:0.9});
  tone({freq:60/k, to:30/k, type:'sine', dur:0.8, gain:0.24*k});
  tone({freq:150, to:420, type:'sawtooth', dur:0.5, gain:0.06, curve:'lin'});
}
export function beastSwallow(){ mark('beastSwallow');
  noise({dur:0.45, gain:0.18, type:'lowpass', f0:1400, f1:180, q:1.2});
  tone({freq:90, to:44, type:'sine', dur:0.4, gain:0.12});
}
export function beastClamp(stage=0){ mark('beastClamp');
  metal({freq:150+stage*40, dur:0.6, gain:0.16, bright:0.6});
  noise({dur:0.14, gain:0.24, type:'bandpass', f0:900, f1:200, q:1.6});
  tone({freq:52, to:34, type:'sine', dur:0.6, gain:0.2});
}
export function beastHaul(){ mark('beastHaul');                        // winch grinding under load
  tone({freq:78, to:92, type:'sawtooth', dur:1.2, gain:0.07, curve:'lin'});
  noise({dur:1.2, gain:0.07, type:'bandpass', f0:520, q:5});
}
export function beastWrench(){ mark('beastWrench');                    // it drags you back down
  tone({freq:150, to:44, type:'sawtooth', dur:0.7, gain:0.16});
  noise({dur:0.6, gain:0.16, type:'lowpass', f0:900, f1:150, q:1.4});
}
export function beastStruggle(){ mark('beastStruggle');                // the riser to the verdict
  tone({freq:120, to:600, type:'sawtooth', dur:2.6, gain:0.07, curve:'lin'});
  noise({dur:2.6, gain:0.09, type:'bandpass', f0:400, f1:2600, q:4});
}
export function beastLand(tier=0){ mark('beastLand');                  // it is HELD
  tone({freq:80, to:40, type:'sine', dur:0.9, gain:0.22});
  [0,0.09,0.18].forEach((d,i)=>metal({freq:[330,392,523][i]*(1+tier*0.06), dur:1.4, gain:0.13, bright:1.4, dly:d}));
  noise({dur:0.5, gain:0.12, type:'highpass', f0:3000});
}

/* offline render of one cue — used by verification to prove a cue is
   audible (non-silent, sane peak) without anyone having to listen. */
export async function renderCue(name, seconds=1.2){
  const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!AC) return null;
  const off=new AC(1, Math.ceil(44100*seconds), 44100);
  const saveCtx=ctx, saveMaster=master, saveReady=ready, saveAmb=amb, saveSink=sink, saveBuf=noiseBuf;
  ctx=off; buildNoise();
  master=off.createGain(); master.gain.value=0.9; master.connect(off.destination);
  amb={g:off.createGain(), lp:off.createBiquadFilter(), o1:off.createOscillator(), o2:off.createOscillator()};
  sink={g:off.createGain(), bp:off.createBiquadFilter(), saw:off.createOscillator()};
  const saveDanger=danger; danger={g:off.createGain(), bp:off.createBiquadFilter(), o:off.createOscillator()};
  ready=true;
  try { (CUES[name]||(()=>{}))(); } catch(e){ /* fall through to restore */ }
  const buf=await off.startRendering();
  ctx=saveCtx; master=saveMaster; ready=saveReady; amb=saveAmb; sink=saveSink; noiseBuf=saveBuf; danger=saveDanger;
  const d=buf.getChannelData(0);
  let peak=0, sum=0;
  for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>peak) peak=a; sum+=d[i]*d[i]; }
  return { peak:+peak.toFixed(4), rms:+Math.sqrt(sum/d.length).toFixed(4), samples:d.length };
}
const CUES={ tick:()=>tick(true), ui, cast, ante, bite, pop:()=>pop(3,2), scatter, windup:()=>windup(0.65),
  breach, coin, win:()=>win(3), snap, strikeRise:()=>strikeRise(1.2), cut, held, card:()=>card(true),
  omen, beastBurst:()=>beastBurst(1), beastSwallow,
  beastClamp:()=>beastClamp(1), beastHaul, beastWrench, beastStruggle, beastLand:()=>beastLand(2) };
export const CUE_NAMES = Object.keys(CUES);
