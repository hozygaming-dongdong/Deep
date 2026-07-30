/* ============================================================
   DEEPER v2 — MAIN (driver): GESTURE control with WEIGHT.

   One gesture surface, no buttons.
   · IDLE  — hook at surface + down-arrow + 4-notch CAST gauge. Drag DOWN to fill
     → cast (DROP). This same 4-notch DOWN gauge is the "clutch": from a stopped
     HOLD you must fill it again to start sinking.
   · SINK  — once engaged, the hook descends with WEIGHT: a damped velocity driven
     by how far past the engage point you hold (throttle), never snapping to the
     finger. It never rises on its own.
   · PULL  — drag UP to fill the 4-notch PULL gauge (works from SINK or HOLD; the
     "回拉" is exactly a PULL). At full → reel.
   · HOLD  — release to coast to a stop and observe.

   Horizontal finger offset STEERS the hook (eased, so it has mass). Steering is
   an additive lateral offset (steerX); headless sim uses 0, RTP gate unaffected.
   ============================================================ */
import { createRound } from './round.js';
import { LAYERS, LAYER_DEPTH, WORLD_W, layerDepthY, bandOf, BP, REEL_SPEED, PULL_WINDUP,
         ANCHOR_X, lineXAtDepth, SHARK_CONTACT_DIST, ANTE_AMT, ANTE_P, CFG, applyCfg } from './world.js';
import {
  bubbleX, bubbleProjectedX, bubblePopRadius, bubbleWorldXAtScreen,
  fishX, fishY, fishProjectedX, fishCatchRadius, fishWorldXAtScreen, makeScatter, sharkX,
} from './entities.js';
import { cv, ctx, LAYOUT, LW, resize, draw, advanceAtmosphere, setUnit, beastPanX, beastArtReady, beastArtProgress } from './render-v2.js';
import * as A from './audio-v2.js';
import {
  SAVED_CFG_KEY, SAVED_CFG_CHANNEL, readSavedCfg, engineCfgFromRecord,
} from './saved-config.js';

const $ = s => document.querySelector(s);
const BET_STEPS = [1,5,10,50,100,200,300,500,1000];    // IDLE-only bet ladder
const easeOut = p => 1-Math.pow(1-p,3);
const maxDepth = () => layerDepthY(LAYERS);
// hao 2026-07-19: the PULL ends OUT OF THE WATER — the hook flies well past
// the waterline and hangs in the air while the catch cashes into coins
const BREACH_DEPTH = -132, REEL_SPACING = 30;
const IDLE_HOOK = 150;                   // v2.1 §8.1 — the hook WAITS in the water

const V = {
  state:'IDLE',           // IDLE · SINK · HOLD · REELING · PAYOUT · SNAP
  engine:null, T:0, hookDepth:0, cam:0, shake:0,
  balance:10000, balShown:10000, stake:50, seedN:0, result:null, resultT:0, resultTier:0,
  carryBp:0,                    // v2.5 — the safe bank of residual pool, persists across rounds

  reel:null, fx:{flash:0,slam:null,pops:[],coins:[],blood:[],cutLine:null,splash:null}, idleClock:0,
  drag:null,              // {sx,sy,cx,cy,deepest,engageDy}
  engaged:false, vDepth:0, throttle:0,
  steerX:0, steerTarget:0,
  downMeter:0, pullMeter:0,
  potDisplay:0,
  auto:null,                // dev autoplay: simulates player decisions, never alters engine outcome
  unit:'CASH',            // wallet display scale — CASH 1:1 · PTS 1:100 (display only)
  cut:null, cutCam:null, rehook:null, cutFade:1, card:null, danger:0, committed:0, lastContact:null,   // cutFade: 1→0 fades the lost catch out on the ascent, 0→1 fades the calm idle sea in (seamless hand-off)
  zoomZ:1, zoomPunch:0, focus:0,   // PULL focus rig (v2.1: the climb owns the eye)
};

// gesture tuning (recalibrated on each press from the stage size)
let ENGAGE_PX=100, PULL_PX=100, THROTTLE_RANGE=150, STEER_GAIN=0.85, STEER_MAX=130;
const MAX_SINK_RATE=155;   // px/sec at full throttle — slow, weighty
const SINK_ACCEL=3.0;      // velocity lag (water resistance / mass)
const COAST_DAMP=3.0;      // release → coast to a stop
const STEER_EASE=5.0;      // horizontal weight
const PULL_DEAD=12;        // px of up-rebound before the pull gauge starts filling
function calibrate(){ const s=$('#stage'); const h=s.clientHeight||700, w=s.clientWidth||394;
  ENGAGE_PX=h*0.11; PULL_PX=h*0.11; THROTTLE_RANGE=h*0.16; STEER_GAIN=STEER_MAX/(w*0.42); }

function setState(s){ V.state=s; }
function fmt(n){ return Math.round(n).toLocaleString('en-US'); }

/* ---------- WALLET UNITS (hao 2026-07-19; v2.10 WYSIWYG) -------------
   Balance, bet, every caught fish, dock and final '+N' use the same economic
   value. Spawn weights are independent from the pool, but caught labels are
   exact payout components. The wallet chip changes the SCALE:
     · CASH 1:1   — the real money you'd bank (2 decimals)
     · PTS  1:100 — the same money as points/credits (integers, weightier)
   Display only: nothing here touches the engine or the economy. */
const UNITS = {
  CASH:{ k:1,   dp:2, tag:'cash' },
  PTS: { k:100, dp:0, tag:'pts'  },
};
function unit(){ return UNITS[V.unit]; }
/* the wallet's ATOM is one credit (= 0.01 cash). */
const toCredits = m => Math.round(m*100)/100;
function fmtMoney(m){
  const u=unit(), v=m*u.k;
  return u.dp ? v.toLocaleString('en-US',{minimumFractionDigits:u.dp, maximumFractionDigits:u.dp})
              : Math.round(v).toLocaleString('en-US');
}

/* A guaranteed multiplier beast gets one narrative gold fish on the PULL path.
   It is added only AFTER settlement, so it has zero payout/RTP/event meaning:
   st.scatters and pullHadGoldFish remain the actual geometry result.

   Deep pulls place it just above the camera at the deepest hidden point, so the
   rising camera reveals a fish that was already swimming. Shallow pulls lack
   that vertical runway, so the same fish starts beyond a side edge and cruises
   into the line. Both paths solve the free-swim position at the real contact
   time; there is no visible PULL-time snap onto the hook. */
function armForcedBeastGold(st){
  if(!st || st.forcedBeastGoldFish || V.hookDepth<=36) return;
  let seed=((Math.floor((st.beastShowRoll||0.5)*0x100000000)>>>0)
    ^ Math.imul((st.L||1)+1,0x9e3779b9))>>>0;
  const vrng=()=>{
    seed=(seed+0x6d2b79f5)>>>0;
    let z=seed; z=Math.imul(z^(z>>>15),z|1);
    z^=z+Math.imul(z^(z>>>7),z|61);
    return ((z^(z>>>14))>>>0)/4294967296;
  };
  const fromDepth=V.hookDepth;
  const maxDepth=Math.max(36,fromDepth-72);
  const deepestHidden=V.cam-LAYOUT.surfaceY-72;
  const verticalHidden=deepestHidden>=64;
  let depth;
  if(verticalHidden){
    const hiddenJitter=24+vrng()*Math.min(150,LAYOUT.h*0.16);
    depth=Math.max(42,Math.min(maxDepth,deepestHidden-hiddenJitter));
  }else{
    depth=Math.max(36,Math.min(maxDepth,fromDepth*(0.58+vrng()*0.18)));
  }
  const L=Math.max(1,Math.min(LAYERS,Math.round(depth/LAYER_DEPTH)));
  const spawnT=V.T-(0.9+vrng()*0.55);          // already fully faded before it can enter
  const f=makeScatter(vrng,L,spawnT);
  f.depth=depth; f.L=L; f.band=bandOf(L);
  f.z0=0; f.zAmp=0; f.zFreq=0; f.zPhase=0;    // contact and visible body share one plane
  f.pub=0; f.score=0; f.caught=true;
  f._forcedBeastBait=true; f._showOnly=true;
  const contactT=V.T+PULL_WINDUP+(fromDepth-depth)/REEL_SPEED;
  const targetX=lineXAtDepth(depth,contactT,depth,st.C,st.steerX);
  if(verticalHidden){
    f.spawnX+=targetX-fishX(f,contactT,st.C);
  }else{
    // Solve a smooth side-entry trajectory through two points: outside now,
    // exactly on the line when the physical hook reaches this depth.
    const offscreen=vrng()<0.5 ? -58 : WORLD_W+58;
    f.spawnX=0; f.drift=0;
    const a0=fishX(f,V.T,st.C), a1=fishX(f,contactT,st.C);
    const life0=V.T-f.spawnT, life1=contactT-f.spawnT;
    f.drift=(targetX-offscreen-(a1-a0))/Math.max(0.1,life1-life0);
    f.spawnX=offscreen-a0-f.drift*life0;
  }
  st.fish.push(f); st.caught.push(f);
  st.forcedBeastGoldFish=f;
}

/* ---------- transitions ---------- */
function engageSink(dy){
  if(V.state==='IDLE'){
    if(V.balance<V.stake){ flashCost(); V.downMeter=0; return false; }
    applyPendingGameConfig();   // saved while the previous round was active
    V.balance -= V.stake; V.committed=V.stake; updateBal(); updateBetUI(true); V.seedN++; V.T=0;
    V.engine = createRound('deeperv2live:'+V.seedN, 0, V.carryBp); V.engine.steer(V.steerX||0);   // v2.5 roll the bank in
    V.hookDepth=IDLE_HOOK; V.result=null; V.potDisplay=0;   // the winch pays out from where the hook waited
    V.cutFade=1;                                           // a fresh dive is full-opacity (in case idle was still fading in)
    A.cast();
  }
  // engage reference = the clutch threshold, so holding just PAST it already applies throttle
  V.engaged=true; V.throttle=0; V.drag.engageDy=ENGAGE_PX; V.drag.deepest=Math.max(dy,ENGAGE_PX); setState('SINK');
  return true;
}
function disengage(){ V.engaged=false; V.throttle=0; if(V.state==='SINK') setState('HOLD'); }
function doPull(){
  if(!V.engine || (V.state!=='HOLD'&&V.state!=='SINK')) return;
  if(V.cut) return;   // the line is already snapping (cut charge) — ignore a late pull so the sealed salvage plays
  V.engaged=false; V.throttle=0; V.vDepth=0;
  V.engine.pull(V.T,V.hookDepth);
  const st=V.engine.st;
  V.fx.beastTele=null;
  if(V.beastEvery) applyBeastArm(st, V.beastEvery.mult, V.beastEvery.escape);   // dev: 每局強制巨獸（DEEPER_V2.beastEvery/beastOff）
  if(st.directBeastShow || V.beastEvery) armForcedBeastGold(st);
  // a WHALE-escape round also has snapped=true, but it plays the whole whale
  // drama during the reel first — only a plain SHARK snap ends here
  if(st.snapped && !st.whaleEscaped){ endInCut(); return; }   // (v2.1e: no pull-through hazard — safety net only)
  // the omen: current turbulence — real whales always show it, and some
  // false alarms show it too (about half the omens come to nothing)
  V.fx.tease = st.whaleTease ? {t:0} : null;
  if(V.fx.tease) A.omen();
  A.windup(PULL_WINDUP);
  // String slots are assigned only when the rising hook actually reaches each
  // fish. The engine has already proved every caught fish was naturally inside
  // the corridor; no catch receives a PULL-time side-dart.
  // The visible hook uses the same start depth, windup and REEL_SPEED as the
  // engine contact clock. Bubble/scatter beats may shake and flash, but cannot
  // pause the physical hook while fish continue swimming.
  armMissHolds(st);            // close misses are pre-planned and drift clear before contact
  V.reel={t:0,windup:PULL_WINDUP,fromDepth:V.hookDepth,combo:0,hitch:0,hooked:0}; V.drag=null; setState('REELING');
}
/* v2.22 — after PULL, close misses get a fixed visual escape plan immediately.
   The verdict is already sealed; this only starts the sideways drift early so
   the player sees a natural swim path instead of a last-second dodge. */
function armMissHolds(st){
  for(const f of st.fish) if(f.escaped && !f.caught && !f._grab){
    f.adjX=0; f.adjT=0;
    const contactT=reelPathTime(st,f.depth);
    const line=reelPathX(st,f.depth);
    const natural=fishProjectedX(f,contactT,st.C);
    const clearance=fishCatchRadius(f,contactT);
    const side=natural>=line ? 1 : -1;
    const targetWorld=fishWorldXAtScreen(f,contactT,line+side*(clearance+24));
    const naturalWorld=fishX(f,contactT,st.C);
    const offset=targetWorld-naturalWorld;
    const lead=Math.min(1.25,Math.max(0.72,Math.abs(offset)/150+0.48));
    f._missHold=true; f._slip={t0:Math.max(V.T,contactT-lead), contactT, offset};
  }
  for(const b of st.bubbles) if(b.missed && !b.popped && Number.isFinite(b.catchGap)){
    b.adjX=0; b.adjT=0;
    const contactT=reelPathTime(st,b.depth);
    const line=reelPathX(st,b.depth);
    const natural=bubbleProjectedX(b,contactT,st.C);
    const clearance=bubblePopRadius(b,contactT);
    const side=natural>=line ? 1 : -1;
    const targetWorld=bubbleWorldXAtScreen(b,contactT,line+side*(clearance+22));
    const naturalWorld=bubbleX(b,contactT,st.C);
    const offset=targetWorld-naturalWorld;
    const lead=Math.min(1.15,Math.max(0.62,Math.abs(offset)/150+0.44));
    b._missHold=true; b._slip={t0:Math.max(V.T,contactT-lead), contactT, offset};
  }
}
function reelPathTime(st,d){
  const p=st&&st.reelPath;
  return p ? p.startT + Math.max(0, p.startDepth - d)/REEL_SPEED : V.T;
}
function reelPathX(st,d){
  const p=st&&st.reelPath;
  return p
    ? lineXAtDepth(d, reelPathTime(st,d), d, st.C, p.steerX)
    : lineXAtDepth(d, V.T, d, st.C, st.steerX);
}
// the gesture gauges click as each notch lights (feel: the drag has detents)
let lastDownNotch=0, lastPullNotch=0;
function notchTick(meter, last){ const n=Math.floor(meter*4+1e-6);
  if(n>last) A.tick(n>=4); return n; }

const POP_HITCH=0.5;        // seconds the burst FX holds/shakes; physical hook keeps climbing
/* v2.3 — the dive's own zoom. Everything the camera does during a round is a
   MULTIPLE of this (see the focus rig), so this one number moves the whole
   language without flattening the beast ladder. */
const SINK_Z=1.14;
/* v2.5 (hao: PULL 時鉤子拉回經過的都要抓到 → 勾不到的魚要在上拉過程游到旁邊創造 miss)
   — how far BELOW a miss the climbing hook is when that fish begins to slip aside.
   Sized so the whole visible silhouette clears its per-entity contact radius by
   the time the hook reaches that depth at every reel pace, so the hook is never
   seen to thread THROUGH an object it didn't take. Show-only. */
function advanceDepth(dt){
  if(!V.engine) return;
  if(V.engine.st.over){
    // round sealed. While a cut is charging, keep the hook FALLING at the player's
    // throttle (no pause) and roll no new segments — tickCut fires the snap.
    if(V.cut){ V.hookDepth=Math.min(maxDepth(), V.hookDepth+V.vDepth*dt); return; }
    /* no charge yet → nothing caught the verdict (most commonly an L1 bite resolved
       at DROP, before any descent — createRound enters L1 at once). Arm it now,
       still without pausing; keep the hook moving. */
    if(V.state==='SINK'||V.state==='HOLD'){
      // dev: hold the forced cut until SHARK_TEST_L (L1 bit at DROP → keep sinking)
      if(V.sharkForce==='bite' && V.engine.st.L < SHARK_TEST_L){
        devNeutralizeBite(V.engine.st);
        V.hookDepth=Math.min(maxDepth(), V.hookDepth+V.vDepth*dt); return;
      }
      const cs=V.engine.st.contacts, c=cs.length?cs[cs.length-1]:null;
      if(c && c.hit && !V.beastEvery){ armCut(c); V.hookDepth=Math.min(maxDepth(), V.hookDepth+V.vDepth*dt); }
      else endInCut();
    }
    return;
  }
  V.hookDepth = Math.min(maxDepth(), V.hookDepth + V.vDepth*dt);
  while(V.engine.canSink() && V.hookDepth >= layerDepthY(V.engine.st.L+1)){
    const nextL=V.engine.st.L+1;
    if(V.balance<nextSegmentAnteCost(nextL)){
      blockSinkForFunds(nextL);
      break;
    }
    V.engine.sink(V.T);
    if(V.beastEvery && V.engine.st.over){        // dev: beastEvery demo 免鯊魚——清掉下沉的鯊魚咬,直達巨獸深度純看演出
      V.engine.st.over=false; V.engine.st.snapped=false; V.engine.st.sharkCut=false;
      for(const s of V.engine.st.sharks) s.bit=false;
    }
    // dev (sharkEvery bite): neutralize bites before SHARK_TEST_L so the cut lands there
    if(V.sharkForce==='bite' && V.engine.st.over && V.engine.st.L < SHARK_TEST_L) devNeutralizeBite(V.engine.st);
    /* v2.3b THE ANTE — every segment charges one stake (hao: 就不用特別表演了).
       ~~word + chime + shake~~: when the charge was 1-in-3 it was a surprise and
       a surprise has to be explained. Made certain it explains itself, and the
       same flourish 27 times a dive is just noise on the descent's own beat.
       What remains is the balance moving under its existing gold pulse — the
       money is still visibly leaving, it simply is not announced. */
    const ante=V.engine.st.antes[V.engine.st.antes.length-1];
    if(ante && ante.hit){ const amt=toCredits(ANTE_AMT*V.stake);
      V.balance-=amt; V.committed+=amt; updateBal(); flashCost(); }
    /* A shark's verdict is sealed. BOTH outcomes charge the line identically (hao:
       前面一模一樣). A HIT arms the round-ending cut (armCut → snap). A MISS arms
       the SAME charge (armMiss), but the dive keeps going and the shark turns into
       the reward instead of cutting. The suspense is which one it was. */
    const cs=V.engine.st.contacts;
    const c=cs.length? cs[cs.length-1] : null;
    if(c && c!==V.lastContact){ V.lastContact=c;
      if(!V.beastEvery){ if(c.hit){ armCut(c); return; } else armMiss(); } }
    if(V.engine.st.over){ endInCut(); return; }             // safety net
  }
}
/* ---------- THE CUT (v2.6.1, hao: 不能暫停/不影響操作節奏——鯊魚直接衝刺,爆了就斷線) ---
   The cut is NOT a state and NOT a beat. It never stops the descent, never takes
   the player's grip, never reframes the camera. The bite was sealed at segment
   entry; here the biter just CHARGES across the line as an overlay WHILE the dive
   keeps running at the player's throttle — steering, holding, everything stays
   live. When the charge connects (~0.35s) the line snaps and the round hands off
   to the reel/card. A miss never enters this at all (line holds, dive continues).
   ⚠ Earlier v2.6 used a 0.42s STRIKE state that zeroed vDepth + dropped the drag —
   that WAS a pause; hao rejected it. Now it is a pure FX timer (`V.cut`). */
const CUT_DUR = 0.6;   // 由遠而近 approach + cross (the dive keeps running under it, so length ≠ pause)
/* v2.6.8 (hao: 回升快到頂時鉤子從屏幕外上方落下掉入水中,要有微水花) — the re-cast: as
   the recovery pan nears the top, a fresh hook drops in from above the frame, pierces
   the surface (a small splash) and settles at the idle waiting depth. */
const REHOOK_FROM = -300, REHOOK_DUR = 0.9;   // world-depth start (above the surface) → IDLE_HOOK
/* dev only (sharkEvery 'bite'): the forced cut is HELD until the hook has sunk to
   this segment, so the bite演出 lands at a fixed spot instead of wherever the first
   1/8 shark happened to appear. Earlier bites are neutralized. L7 = mid-REEF
   (REEF is L4–9); the earlier neutralized sharks scroll off-screen above as the
   camera follows the hook down, so the cut segment is uncluttered. */
const SHARK_TEST_L = 7;
function devNeutralizeBite(st){          // undo a sealed bite so the dive continues (dev)
  st.over=false; st.snapped=false; st.sharkCut=false;
  const b=st.sharks.find(s=>s.bit); if(b){ b.bit=false; b.resolved=true; b._devFadeT0=V.T; }  // recede + quick-fade so it doesn't clutter the cut segment
  const c=st.contacts[st.contacts.length-1]; if(c) c.hit=false;              // …so the sink loop won't armCut this contact
}
/* how much dread is in the water RIGHT NOW: nearest shark's proximity to the
   line, weighted by depth. Purely positional — it reads what is already on
   screen and leaks nothing about the sealed roll. */
function computeDanger(){
  const st=V.engine&&V.engine.st;
  if(!st || !(V.state==='SINK'||V.state==='HOLD')) return 0;
  let near=0, charging=0;
  for(const sh of st.sharks){
    if(sh._cut){                                  // a charging shark (hit OR miss) drives the rope taut
      const raw=(V.T-sh._cut.t0)/sh._cut.dur;
      if(raw>=0 && raw<1) charging=Math.max(charging, raw);
      continue;
    }
    if(sh.resolved) continue;
    const d=Math.abs(sharkX(sh,V.T) - lineXAtDepth(sh.depth,V.T,V.hookDepth,st.C,st.steerX));
    near=Math.max(near, Math.max(0, 1 - d/(SHARK_CONTACT_DIST*3.2)));
  }
  const depthK=Math.min(1, V.hookDepth/maxDepth());
  const base=Math.min(1, near*(0.5+0.5*depthK));
  // ANY charge strains the rope identically (you don't yet know hit or miss — the
  // suspense IS the tension). A hit ends in the snap; a miss lets it relax.
  if(V.cut) return Math.max(base, Math.min(1, 0.5+0.5*(V.cut.t/V.cut.dur)));
  if(charging>0) return Math.max(base, 0.5+0.5*charging);
  return base;
}
/* which shark just made contact. On a bite the biter is unambiguous — the
   engine flags it `bit` (round.js) — so charge THAT one across the line, even
   if it is one you swam past segments ago (the whole point of them
   accumulating). Otherwise take the closest. */
function nearestShark(hit){
  const st=V.engine&&V.engine.st; if(!st) return null;
  if(hit){ for(const sh of st.sharks) if(sh.bit) return sh; }
  let best=null, bd=1e9;
  for(const sh of st.sharks){
    const d=Math.abs(sharkX(sh,V.T) - lineXAtDepth(sh.depth,V.T,V.hookDepth,st.C,st.steerX));
    if(d<bd){ bd=d; best=sh; }
  }
  return best || (st.sharks.length? st.sharks[st.sharks.length-1] : null);
}
/* arm the cut charge — an OVERLAY, not a state. Deliberately touches nothing that
   would interrupt the player: no vDepth/throttle reset, no drag drop, no setState,
   no camera. The dive keeps falling at the player's throttle; the biter just drives
   across the line (drawShark's _cut branch) and `tickCut` fires the snap when it
   connects. */
/* v2.6.5 (hao: 鯊魚要從屏幕外游入) — the charge STARTS off-screen: the shark enters
   from the edge it is nearest, swims in across the line, and (on the exit) carries
   on out the far side. `from` is well beyond the visible frame at the dive zoom. */
const SHARK_ENTRY = 360;
function sharkEntryFrom(sh, lx){
  const side = (sharkX(sh,V.T) >= lx) ? 1 : -1;   // comes in from the side it is on
  return lx + side*SHARK_ENTRY;                    // …starting off-screen
}
function armCut(contact){
  const sh=nearestShark(contact.hit);
  if(sh){ const lx=lineXAtDepth(sh.depth,V.T,V.hookDepth,V.engine.st.C,V.engine.st.steerX);
    sh._cut={ t0:V.T, from:sharkEntryFrom(sh,lx), dur:CUT_DUR }; }
  V.cut={ t:0, dur:CUT_DUR };
  A.strikeRise(CUT_DUR);
}
/* arm the MISS charge — the shark charges the line EXACTLY like a bite (same
   drawShark _cut pass, same rope strain), but no V.cut (the round doesn't end).
   At the end it swims off and the reward it "became" is revealed (the prize the
   engine already spawned this segment) right where it bit. Pure演出, no economy. */
function armMiss(){
  const st=V.engine.st;
  let sh=null;                                     // the shark that just missed this segment
  for(let i=st.sharks.length-1;i>=0;i--){ const s=st.sharks[i];
    if(s.spent && !s._cut && s._devFadeT0==null){ sh=s; break; } }
  if(!sh) return;
  const lx=lineXAtDepth(sh.depth, V.T, V.hookDepth, st.C, st.steerX);
  sh._cut={ t0:V.T, from:sharkEntryFrom(sh,lx), dur:CUT_DUR, miss:true };
  A.strikeRise(CUT_DUR);
  const prize=st.fish.filter(f=>f.type==='PRIZE' && f._revealT==null).pop();
  if(prize){ const rt=V.T+CUT_DUR*0.82; prize._revealT=rt; prize.spawnT=rt; prize.spawnX=lx; }  // emerges at the bite point as the charge ends
}
/* ticked every frame in the main loop (independent of state) so the charge
   progresses whether the player keeps holding down or lets go. */
function tickCut(dt){
  if(!V.cut) return;
  V.cut.t+=dt;
  if(V.cut.t < V.cut.dur) return;                  // NO shake during the charge (hao: 挫敗感降到最低)
  V.cut=null;
  /* The line snaps. v2.18 has already moved the complete unpaid budget into
     safe carry, so this is a clean visual stop, never a hidden value wipe. */
  if(V.engine.st.baseBp>0) beginSalvageReel();
  else endInCut();
}
/* mark the sever point (the hook end of the line) for the line-snap visual — the
   shark bit THROUGH here, so the rope parts at the hook. */
function markCutLine(){
  if(!V.engine) return; const st=V.engine.st;
  V.fx.cutLine={ t:0, x:lineXAtDepth(V.hookDepth, V.T, V.hookDepth, st.C, st.steerX), y:V.hookDepth };
}
/* v2.4 — the SALVAGE reel: a shark cut forced the pull, so reel up the base
   that was already on the hook (the engine settled it) and let the breach frame
   it as a cut, not a triumph. Same machinery as a normal pull, minus the beast. */
function beginSalvageReel(){
  V.fx.tease=null;               // salvage = a forced PULL (you reel the base up); no severed-line drop here
  A.windup(PULL_WINDUP);
  armMissHolds(V.engine.st);   // same slip-on-approach on a shark-cut salvage climb
  V.reel={ t:0, windup:PULL_WINDUP, fromDepth:V.hookDepth, combo:0, hitch:0, hooked:0, cut:true };
  V.drag=null; setState('REELING');
}
/* the loss ritual, then the CARD — the round does not reset until the player
   has been told, in plain words, what happened (hao 2026-07-19) */
function endInCut(){
  V.result={snapped:true}; V.vDepth=0; V.engaged=false; V.drag=null;
  markCutLine();                 // the REAL performance: the line severs + the hook falls away
  // low-frustration close: NO screen shake, NO title card — the snapping line IS the message.
  A.cut();
  // the recovery pan is an EASED animation (smootherstep), not an exponential lerp —
  // it starts and ends at zero velocity so the climb never lurches (hao: 跳動很大→動態恢復).
  V.cutCam={ t:0, from:V.cam, dur:Math.max(1.8, Math.min(3.4, Math.abs(V.cam)/150)) };
  V.fx.slam=null; V.card=null; setState('SNAP'); V.resultT=0;
}
const CARD_IN=0.35, CARD_HOLD=1.9;
function showCard(txt, sub, cold, delay){
  V.card={ txt, sub, cold:!!cold, t:0, delay:delay||0.55, lost:V.committed, shown:false };
}
function tickCard(dt){
  const c=V.card; if(!c) return;
  if(c.delay>0){ c.delay-=dt; return; }
  if(!c.shown){ c.shown=true; A.card(c.cold); if(!c.cold) V.shake=Math.max(V.shake,4); }   // no shake on the loss card
  c.t+=dt;
}
function cardDone(){ return !V.card || (V.card.shown && V.card.t>CARD_IN+CARD_HOLD); }

function flashCost(){ const b=$('#bal'); if(!b) return; b.classList.remove('charged'); void b.offsetWidth; b.classList.add('charged'); }
function nextSegmentAnteCost(nextL){
  const p=ANTE_P?.[bandOf(nextL)]||0;
  return p>0 ? toCredits(ANTE_AMT*V.stake) : 0;
}
function blockSinkForFunds(nextL){
  const boundary=layerDepthY(nextL);
  V.hookDepth=Math.min(V.hookDepth, Math.max(0,boundary-0.5));
  V.vDepth=0; V.throttle=0; V.engaged=false; V.downMeter=0;
  setState('HOLD');
  flashCost();
}

/* ---------- pointer handlers ---------- */
function onDown(e){
  if(V.state==='REELING'||V.state==='WHALE'||V.state==='PAYOUT'||V.state==='SNAP'||V.cut) return;
  calibrate();
  V.drag={ sx:e.clientX, sy:e.clientY, cx:e.clientX, cy:e.clientY, deepest:0, engageDy:0 };
  V.downMeter=0; V.pullMeter=0;
}
function onMove(e){
  if(!V.drag) return;
  V.drag.cx=e.clientX; V.drag.cy=e.clientY;
  const dx=e.clientX-V.drag.sx, dy=e.clientY-V.drag.sy;
  V.steerTarget = Math.max(-STEER_MAX, Math.min(STEER_MAX, dx*STEER_GAIN));
  V.drag.deepest = Math.max(V.drag.deepest, dy);
  const rebound = V.drag.deepest - dy;                 // how far back UP from the deepest point
  const live = V.engine && !V.engine.st.over;
  if(rebound >= PULL_DEAD && live && (V.state==='SINK'||V.state==='HOLD')){
    // 回拉 → arm PULL (same as a direct pull); pause the descent while arming
    if(V.engaged) V.throttle=0;
    V.downMeter=0;
    V.pullMeter = Math.min(1, (rebound - PULL_DEAD)/PULL_PX);
    lastPullNotch=notchTick(V.pullMeter, lastPullNotch); lastDownNotch=0;
    if(V.pullMeter>=1) doPull();
  } else {
    V.pullMeter=0;
    if(V.engaged){
      V.throttle = Math.max(0, Math.min(1, (dy - V.drag.engageDy)/THROTTLE_RANGE));
    } else if((V.state==='IDLE'||V.state==='HOLD') && dy>0){
      V.downMeter = Math.min(1, dy/ENGAGE_PX);         // clutch: fill to engage the sink
      lastDownNotch=notchTick(V.downMeter, lastDownNotch); lastPullNotch=0;
      if(V.downMeter>=1) engageSink(dy);
    }
  }
}
function onUp(){
  if(!V.drag) return;
  const wasEngaged=V.engaged;
  V.drag=null; V.downMeter=0; V.pullMeter=0; lastDownNotch=0; lastPullNotch=0;
  if(wasEngaged) disengage();                          // → HOLD, coast to a stop
}

/* ---------- dev autoplay ---------- */
const AUTO_MODES = ['safe','deep','random'];
function autoTargetDepth(mode){
  if(mode==='deep') return layerDepthY(Math.max(2,Math.floor(LAYERS*0.78)));
  if(mode==='random') return layerDepthY(2+Math.floor(Math.random()*Math.max(1,LAYERS-2)));
  return layerDepthY(Math.max(2,Math.floor(LAYERS*0.48)));
}
function autoNotify(){
  try{ window.dispatchEvent(new CustomEvent('deeper:auto', {detail:autoStatus()})); }catch{}
}
function autoPlay(mode='safe', opts={}){
  mode=AUTO_MODES.includes(mode) ? mode : 'safe';
  const rounds=Number.isFinite(+opts.rounds) ? Math.max(1,Math.floor(+opts.rounds)) : Infinity;
  V.auto={on:true,mode,rounds,started:0,wait:0,targetDepth:autoTargetDepth(mode)};
  autoNotify();
  return autoStatus();
}
function autoStop(){
  V.auto=null;
  V.engaged=false; V.throttle=0; V.downMeter=0; V.pullMeter=0;
  if(V.state==='SINK') setState('HOLD');
  autoNotify();
  return autoStatus();
}
function autoStatus(){
  const a=V.auto;
  return a ? {on:true, mode:a.mode, rounds:a.rounds, started:a.started, targetDepth:Math.round(a.targetDepth)}
           : {on:false};
}
function autoBeginSink(){
  if(V.balance<V.stake){ autoStop(); return false; }
  calibrate();
  const x=(cv?.getBoundingClientRect().left||0)+(cv?.clientWidth||LAYOUT.w)*0.5;
  const y=(cv?.getBoundingClientRect().top||0)+LAYOUT.h*0.45;
  V.drag={sx:x,sy:y,cx:x,cy:y+ENGAGE_PX,deepest:ENGAGE_PX,engageDy:0};
  engageSink(ENGAGE_PX);
  V.drag=null;
  V.throttle=0.86;
  return true;
}
function autoShouldPull(a){
  const st=V.engine&&V.engine.st;
  if(!st || st.over) return false;
  if(V.hookDepth>=maxDepth()-8) return true;
  if(a.mode==='deep') return V.hookDepth>=a.targetDepth;
  if(a.mode==='random') return V.hookDepth>=a.targetDepth;
  const pv=V.engine.previewPull(V.T,V.hookDepth);
  const shownMult=(pv?.potentialBp||0)/BP;
  return (shownMult>=1.5 && st.L>=2) || V.hookDepth>=a.targetDepth;
}
function tickAuto(dt){
  const a=V.auto;
  if(!a?.on) return;
  const boot=$('#boot');
  if(boot && !boot.classList.contains('gone')){
    if(!beastArtUnlocked) return;
    boot.classList.add('gone'); setTimeout(()=>boot.remove(),500);
  }
  a.wait=Math.max(0,(a.wait||0)-dt);
  if(a.wait>0) return;
  if(V.state==='IDLE' && !V.engine){
    if(a.started>=a.rounds){ autoStop(); return; }
    a.targetDepth=autoTargetDepth(a.mode);
    a.started++;
    autoBeginSink();
    autoNotify();
    return;
  }
  if(V.state==='SINK' || V.state==='HOLD'){
    if(autoShouldPull(a)){
      V.pullMeter=1;
      doPull();
      a.wait=0.35;
      return;
    }
    if(V.state==='HOLD') setState('SINK');
    V.engaged=true;
    V.throttle=0.82;
    V.downMeter=1;
  }
}

/* ---------- main loop ---------- */
function loop(dt){
  // the world clock: gameplay states advance it while the round is live, and
  // it KEEPS RUNNING through REELING/WHALE/PAYOUT/SNAP — the sea never
  // freezes for the show (fish keep swimming; the outcome is already sealed)
  // a charging cut keeps the sea live too (V.cut) — the dive must not freeze while
  // the shark drives at the line.
  if(V.engine && (V.state==='SINK'||V.state==='HOLD')){ if(!V.engine.st.over || V.cut) V.T+=dt; }
  else if(V.engine) V.T+=dt;
  if(V.state==='PAYOUT'||V.state==='SNAP') V.resultT+=dt;
  if(V.state==='IDLE') V.idleClock+=dt;
  advanceAtmosphere(dt);
  A.setWorld(V.hookDepth/maxDepth(), V.throttle, V.state!=='IDLE');
  // the dread is CONTINUOUS: how close the nearest shark is, weighted by depth
  V.danger += (computeDanger()-V.danger)*Math.min(1,dt*4);
  A.setDanger(V.danger);
  tickCard(dt);
  tickAuto(dt);

  // steering has mass (eased, not 1:1)
  V.steerX += (V.steerTarget - V.steerX)*Math.min(1,dt*STEER_EASE);
  if(V.engine && (!V.engine.st.over || V.cut)) V.engine.steer(V.steerX);   // steering stays live through the cut charge

  tickCut(dt);                          // the cut is an overlay: progress it in EVERY state, it never blocks the dive
  if(V.state==='REELING') tickReel(dt);
  else if(V.state==='WHALE') tickWhale(dt);
  else if(V.state==='SINK'){
    const targetRate = V.throttle*MAX_SINK_RATE;
    V.vDepth += (targetRate - V.vDepth)*Math.min(1,dt*SINK_ACCEL);
    if(V.vDepth<0) V.vDepth=0;
    advanceDepth(dt);
  } else if(V.state==='HOLD'){
    if(V.vDepth>1){ V.vDepth *= Math.max(0,1-dt*COAST_DAMP); advanceDepth(dt); } else V.vDepth=0;  // coast to rest
  } else if(V.state==='PAYOUT' && V.engine && V.engine.st.caught.some(f=>f._grab && !f._cashed)){
    // the winch keeps winding until the WHOLE string is out of the sea —
    // every remaining fish cashes into coins as it crosses the waterline
    V.hookDepth -= 320*dt;
    V.engine.st.caught.forEach(f=>{ if(f._grab) f._reelDepth=V.hookDepth+(f._order+1)*REEL_SPACING; });
    cashCrossings(V.engine.st);
  }

  if(V.fx.slam && V.fx.slam.scale<1) V.fx.slam.scale=Math.min(1,V.fx.slam.scale+dt*6);
  if(V.fx.flash>0) V.fx.flash=Math.max(0,V.fx.flash-dt*3);
  if(V.fx.pops && V.fx.pops.length){
    for(const p of V.fx.pops){
      const was=p.t; p.t+=dt*1.25;                       // slower life = the ×N stays readable
      if(p.fishF && was<0.62 && p.t>=0.62){              // the mult SLAMS onto its fish
        const shownMult=p.fishF._shownMultApplied||1;
        const popMult=+p.mult||1;
        p.fishF._boostFlash=1; V.shake=Math.max(V.shake,3.6);
        p.fishF._boostExprT=0.72;
        p.fishF._boostBaseBp=Math.round((+p.fishF.score||0)*BP*shownMult);
        p.fishF._boostMult=popMult;
        p.fishF._shownMultApplied=shownMult*popMult;
      }
    }
    V.fx.pops=V.fx.pops.filter(p=>p.t<1);
  }
  if(V.engine){ for(const f of V.engine.st.caught){
    if(f._boostFlash) f._boostFlash=Math.max(0,f._boostFlash-dt*1.9);
    if(f._boostExprT) f._boostExprT=Math.max(0,f._boostExprT-dt);
  } }
  if(V.fx.coins && V.fx.coins.length) tickCoins(dt);
  if(V.fx.blood && V.fx.blood.length){                    // 咬合噴血：粒子受水阻快速減速+微沉+擴散
    for(const b of V.fx.blood){ b.t+=dt;
      if(!b.cloud){ b.x+=b.vx*dt; b.y+=b.vy*dt; b.vx*=(1-Math.min(1,dt*2.6)); b.vy=b.vy*(1-Math.min(1,dt*2.6))+16*dt; } }
    V.fx.blood=V.fx.blood.filter(b=>b.t<b.life);
  }
  if(V.fx.breach){ V.fx.breach.t+=dt; if(V.fx.breach.t>1.15) V.fx.breach=null; }
  if(V.fx.cutLine){ V.fx.cutLine.t+=dt; if(V.fx.cutLine.t>0.7) V.fx.cutLine=null; }   // the line-snap recoil
  if(V.fx.tease){ V.fx.tease.t+=dt;
    V.shake=Math.max(V.shake, 0.8+0.7*Math.sin(V.fx.tease.t*3));   // low rumble
    // false alarms dissolve after ~2.2s; real ones persist until the whale fires
    if(V.fx.tease.t>2.2 && !(V.engine&&V.engine.st.whaleTriggered)) V.fx.tease=null;
  }
  if(!V.drag){ if(V.downMeter>0) V.downMeter=Math.max(0,V.downMeter-dt*3); if(V.pullMeter>0) V.pullMeter=Math.max(0,V.pullMeter-dt*3); }

  let camTarget;
  // NB: a charging cut gets NO special camera — it rides the normal SINK follow
  // below, so the frame never remaps under the player (hao: 不影響操作節奏).
  // The cut AFTERMATH (cardless SNAP), by contrast, recovers SLOWLY — a fast
  // snap-back reads as a harsh punishment (hao: 屏幕恢復太快挫敗感太強, 拉回要慢).
  const cutRecover = V.state==='SNAP' && !V.card;
  V.fx.cutRecover = cutRecover; V.fx.rehook = !!V.rehook;    // suppress rope/hook the whole ascent — EXCEPT once the fresh hook is dropping in
  // cross-fade the sea across the cut→next-round hand-off (hao: 要完整與下一段開始銜接):
  // the lost catch fades OUT on the ascent, the calm idle sea fades back IN.
  if(cutRecover) V.cutFade=Math.max(0, V.cutFade-dt*1.1); else V.cutFade=Math.min(1, V.cutFade+dt*1.7);
  V.fx.cutFade = V.cutFade;
  if(cutRecover) camTarget=0;                                // rise ALL the way back to the surface/top (hao: 咬斷後屏幕慢慢回到上方)
  else if(V.state==='PAYOUT'||V.state==='SNAP') camTarget=LAYOUT.surfaceY-LAYOUT.h*0.34;
  else if(V.state==='REELING'||V.state==='WHALE')
    // FOLLOW the hook up through the chain-pops (hook rides mid-frame, the
    // string below, the next bubble above); lock onto the breach frame only
    // for the last stretch so the surface burst is composed
    camTarget=Math.max(LAYOUT.surfaceY-LAYOUT.h*0.34, V.hookDepth - LAYOUT.h*0.55 + LAYOUT.surfaceY);
  else camTarget=Math.max(0, V.hookDepth - LAYOUT.h*0.42 + LAYOUT.surfaceY);
  if(cutRecover && V.cutCam){
    // eased pan back to the surface — smootherstep = zero velocity at both ends, so
    // the climb glides instead of lurching (exponential lerp starts fast = the jolt).
    V.cutCam.t+=dt;
    const p=Math.min(1, V.cutCam.t/V.cutCam.dur), e=p*p*p*(p*(p*6-15)+10);
    V.cam = V.cutCam.from*(1-e);
    if(p>=0.74 && !V.rehook){ V.rehook={t:0, splashed:false, done:false}; V.hookDepth=REHOOK_FROM; }  // drop the fresh hook in near the top
    if(p>=1) V.cutCam=null;
  } else {
    V.cam += (camTarget-V.cam)*Math.min(1,dt*5);
  }
  if(V.shake>0) V.shake=Math.max(0,V.shake-dt*36);
  if(V.shake>0) V.shake=Math.max(0,V.shake-dt*36);
  /* PULL focus rig: zoom-in + iris while the reel climbs; punch on every pop;
     release for the breach frame so the surface burst keeps its composition.

     v2.3 (hao: SINK 從開始鏡頭就要拉近一些直到 PULL 結算, 讓過程不能同時看到
     太多層的動態) — the dive itself now sits at SINK_Z instead of wide. Fewer
     segments share the frame, so the layer you are in is the one you read.

     ⚠ Every event zoom below is expressed as a MULTIPLE of SINK_Z, not as an
     absolute. Raising the dive's baseline would otherwise quietly flatten the
     beast's advance — a 1.60 that used to be +60% over a wide frame is only
     +40% over a 1.14 one, and the tier ladder hao spent eight rounds calibrating
     would lose its steps. Written relative, the ladder survives a baseline change. */
  { let zT=SINK_Z, fT=0;
    // waiting and the verdict both get the wide frame — the dive is the tight part
    if(V.state==='IDLE'||V.state==='PAYOUT'||V.state==='SNAP'){ zT=1; }
    else if(V.state==='REELING' && V.reel){
      const climbing=V.reel.t>=V.reel.windup;
      const total=Math.max(1,V.reel.fromDepth-BREACH_DEPTH);
      const frac=(V.hookDepth-BREACH_DEPTH)/total;
      zT = !climbing? SINK_Z*1.05 : (frac<0.16? SINK_Z*0.93 : SINK_Z*1.12);
      fT = !climbing? 0.5  : (frac<0.16? 0.2 : 0.9);
    } else if(V.state==='WHALE'){
      // the camera CROWDS the beast — closer for every tier (hao):
      // wide for the eruption, tight once the jaws hold the hook
      const wst=(V.whale&&V.whale.stage!=null)?V.whale.stage:1;
      const held=V.whale && V.whale.phase!=='burst' && V.whale.phase!=='swallow';
      zT= SINK_Z*(held? [1.19,1.34,1.54][wst] : [1.03,1.09,1.17][wst]);
      fT= held? 0.8 : 0.45;
    }
    V.zoomZ += (zT + V.zoomPunch*0.11 - V.zoomZ)*Math.min(1,dt*(cutRecover?1.3:4.5));   // slow zoom-out after a cut
    V.zoomPunch = Math.max(0, V.zoomPunch - dt*3.4);
    V.focus += (fT - V.focus)*Math.min(1,dt*4);
    if(V.focus<0.01) V.focus=0;
    if(Math.abs(V.zoomZ-1)<0.002 && !V.zoomPunch) V.zoomZ=1;
  }
  // the fresh hook dropping in at the top: falls from above the frame, pierces the
  // surface (small splash), settles at the idle depth (hao: 從屏幕外上方落下掉入水中+微水花)
  if(V.rehook){
    V.rehook.t+=dt;
    const p2=Math.min(1, V.rehook.t/REHOOK_DUR), e2=p2*p2*p2*(p2*(p2*6-15)+10);
    V.hookDepth = REHOOK_FROM + (IDLE_HOOK-REHOOK_FROM)*e2;
    if(!V.rehook.splashed && V.hookDepth>=0){ V.rehook.splashed=true;
      const st=V.engine&&V.engine.st;
      V.fx.splash={ t:0, x: st? lineXAtDepth(0,V.T,V.hookDepth,st.C,st.steerX) : ANCHOR_X };
      A.cast();
    }
    if(p2>=1) V.rehook.done=true;
  }
  if(V.fx.splash){ V.fx.splash.t+=dt; if(V.fx.splash.t>0.6) V.fx.splash=null; }
  // balance readout tweens toward the real balance (coins landing feel additive)
  V.balShown += (V.balance-V.balShown)*Math.min(1,dt*7);
  if(Math.abs(V.balance-V.balShown)<0.6) V.balShown=V.balance;
  { const be=$('#bal'); const txt=fmtMoney(V.balShown); if(be && be.textContent!==txt) be.textContent=txt; }
  // a cardless shark cut RECOVERS SLOWLY — a fast snap-back is what made the loss
  // feel harsh (hao: 屏幕恢復太快挫敗感太強). Give the gentle pull-back room to breathe.
  // A GREAT WHITE line break still holds the full 2.0s so the secured payout
  // message remains readable before reset.
  const linger = V.state==='PAYOUT' ? 2.0+(V.resultTier||0)*0.45 : (V.card? 2.0 : 0.9);
  // a shark cut holds the reset until the camera has RISEN back to the top — only
  // there does the new hook grow back (hao: 直到上方才長回鉤子). Depth-adaptive:
  // a deeper cut = a longer climb before the round resets.
  const cutAtTop = !cutRecover || (V.rehook ? V.rehook.done : !V.cutCam);   // wait for the pan AND the fresh hook's drop to finish
  if((V.state==='PAYOUT'||V.state==='SNAP') && V.resultT>linger && cutAtTop && !(V.fx.coins&&V.fx.coins.length) && cardDone()) endRound();

  if(V.engine){
    const fy=Math.max(LAYOUT.h*0.22, Math.min(LAYOUT.h*0.72, LAYOUT.surfaceY+V.hookDepth-V.cam));
    const rig=(V.zoomZ>1.002||V.focus>0.01)? {z:V.zoomZ, x:ANCHOR_X, y:fy, focus:V.focus, punch:V.zoomPunch,
      panX:(V.state==='WHALE'? beastPanX():0)} : null;   // 巨獸咬走鉤:鏡頭隨衝勢偏移(hao:感受鯊魚的力量)
    V.fx.card=V.card; V.fx.danger=V.danger;   // v2.6: the cut is the charging shark + rope strain, no overlay
    draw(V.engine, V.hookDepth, V.T, V.cam, V.shake, V.fx, false, rig);
  }
  else drawIdle();
  drawHud();
  updateDock();
}
/* v2.1 §8.3/8.6 — the reel: tension windup → slow rise with chain-popping
   bubbles (combo stacks shake/flash) → breach bursts the WIN AMOUNT (not the
   mult) + a tiered coin fountain into BALANCE. */
function tickReel(dt){
  const r=V.reel, beforeT=r.t; r.t+=dt; const st=V.engine.st;
  if(r.t<r.windup){
    // TENSION — the engine charges 0.65s before the strike lands; this beat
    // is the line straining, not dead time
    const p=r.t/r.windup;
    V.hookDepth=r.fromDepth+14*Math.sin(p*Math.PI);
    V.shake=Math.max(V.shake, 0.6+p*2.6);
  } else {
    // CLIMB — one physical contact clock. FX may hitch, the hook may not.
    if(r.hitch>0){
      r.hitch-=dt;
      V.shake=Math.max(V.shake, 2.0);
    }
    const climbDt=beforeT<r.windup ? Math.max(0,r.t-r.windup) : dt;
    V.hookDepth=Math.max(BREACH_DEPTH,V.hookDepth-REEL_SPEED*climbDt);
    // WHALE 2.5 — 大白鯊剪影「預告」不接管前景:狀態維持 REELING,reel 照爬、CATCH 照滾,
    // 剪影只是背景圖層掠過→沉入盤旋;隨機一小段間隔後才「衝出」進 WHALE 接管(hao 2026-07-22)。
    const forcedGoldPending=st.forcedBeastGoldFish && !st.forcedBeastGoldFish._grab;
    if((st.whaleTriggered||st.pullBeastTeased) && !forcedGoldPending
      && !r.whaleFired && V.hookDepth<=WHALE_TELE_DEPTH){
      r.whaleFired=true;
      V.beastTele={ t:0, dir:(Math.random()<0.5?-1:1),
                    lurkDur:1.0, gapDur:0.35+Math.random()*0.85,
                    willBite:st.whaleTriggered };                   // false PULL omen stops after the silhouette; a real bite owns the gap + strike
      A.omen();                                                       // 預兆(不接管、不定格、不壓暗前景)
    }
    if(V.beastTele){
      const bt=V.beastTele; bt.t+=dt;
      if(bt.t < bt.lurkDur){                                          // 剪影「一次」緩慢掠過(背景層)
        V.fx.beastTele={ ph:'lurk', p:bt.t/bt.lurkDur, stage:0,
          tier: st.whaleTier>=0? st.whaleTier : 1, lurkDir:bt.dir, escaped:st.whaleEscaped, tele:true };
      } else {
        V.fx.beastTele=null;                                          // 掠過後即離場,懸念空窗不再現身(前景照跑,不會像卡頓)
      }
      if(!bt.willBite && bt.t>=bt.lurkDur){
        V.beastTele=null; V.fx.beastTele=null;                          // 預告可落空：剪影游完即結束，收線照常
      } else if(bt.willBite && (bt.t >= bt.lurkDur+bt.gapDur || V.hookDepth<=WHALE_MIN_BURST)){   // 間隔到 / 快到淺水 → 衝出
        const dir=bt.dir; V.beastTele=null; V.fx.beastTele=null; startWhale2(dir); return;
      }
    }
    st.caught.forEach(f=>{ if(f._grab) f._reelDepth=V.hookDepth+(f._order+1)*REEL_SPACING; });
    // BREACH — the hook breaks the surface: v1-style foam rings + a held beat,
    // AT the real crossing point (it drifts with current/steer — never fixed)
    if(!r.breached && V.hookDepth<=2){
      r.breached=true; r.hitch=Math.max(r.hitch,0.30);
      V.fx.breach={t:0, x:crossX()};
      V.shake=Math.max(V.shake,8); V.fx.flash=Math.max(V.fx.flash,0.18); A.breach();
    }
    // …then each strung fish CROSSES THE WATERLINE and CASHES into coins
    // (hao: 拉出海平面 轉換成金幣) — what you strung is what turns to gold
    cashCrossings(st);
    // BITE-ON-PASS — each selected fish's unmodified free-swim trajectory
    // already intersects the hook. The 0.22s settle is only the final contact
    // body-contact radius), never a correction from elsewhere in the layer.
    for(const f of st.caught){
      if(!f._grab && V.hookDepth<=f.depth){
        f._grab=true; f._hookT=V.T; f._order=r.hooked++;
        f._reelDepth=V.hookDepth+(f._order+1)*REEL_SPACING;
        const contactT=reelPathTime(st,f.depth);
        f._fromX=fishX(f,contactT,V.engine.C); f._fromY=fishY(f,contactT);
        const biteLine=reelPathX(st,f.depth);
        const fromScreen=fishProjectedX(f,contactT,st.C);
        f._biteGap=Math.abs(fromScreen-biteLine);
        f._attachX=(fromScreen>=biteLine?1:-1)
          *Math.min(f._biteGap,Math.max(10,fishCatchRadius(f,V.T)-8));
        V.fx.pops.push({ x:f._fromX, y:LAYOUT.surfaceY+f._fromY, r0:5, col:'#E9F2F0', t:0.35,
          seed:Math.random()*6.283, small:true, label:null, toX:null, toY:null });
        V.shake=Math.max(V.shake,1.8); A.bite();
      }
    }
    // PRE-PLANNED MISS DRIFT — close misses were assigned a fixed sideways
    // offset at PULL time. Playback only eases that plan in; it never re-aims
    // fish around the hook inside the player's gaze.
    for(const f of st.fish){
      if(!f._missHold) continue;
      if(!f._slip){ f._missHold=false; continue; }
      if(V.hookDepth <= f.depth - 8){ f._missHold = false; continue; }  // hook safely past → freeze the offset
      const span=Math.max(0.18,f._slip.contactT-f._slip.t0);
      const k=Math.max(0,Math.min(1,(V.T-f._slip.t0)/span));
      const ramp=k*k*(3-2*k);
      f.adjX=f._slip.offset*ramp;
    }
    // An unaffordable multiplier follows the same legibility law: it remains
    // visible and clears the hook before contact instead of being crossed
    // without popping. Only bubbles whose natural route was close are armed.
    for(const b of st.bubbles){
      if(!b._missHold) continue;
      if(!b._slip){ b._missHold=false; continue; }
      if(V.hookDepth<=b.depth-8){ b._missHold=false; continue; }
      const span=Math.max(0.18,b._slip.contactT-b._slip.t0);
      const k=Math.max(0,Math.min(1,(V.T-b._slip.t0)/span));
      const ramp=k*k*(3-2*k);
      b.adjX=b._slip.offset*ramp;
    }
    // scatter tease — a golden ring bursts as the hook passes each landed
    // scatter (§8.5: the 1st is the near-miss beat, the 2nd means WHALE)
    for(const f of st.caught){
      if(f.type==='SCATTER' && !f._teased && V.hookDepth<=f.depth){
        f._teased=true; r.hitch=POP_HITCH*1.25;
        V.fx.pops.push({ x:ANCHOR_X, y:LAYOUT.surfaceY+f.depth, r0:18, col:'#F6C243', t:0,
          seed:Math.random()*6.283, label: st.whaleTriggered ? '★★ BEAST' : '★', toX:null, toY:null });
        V.shake=Math.max(V.shake, st.whaleTriggered?8:5);
        V.zoomPunch=1; V.fx.flashCol='#F6C243';
        V.fx.flash=Math.max(V.fx.flash, 0.26); A.scatter();
      }
    }
    // pop each bubble the moment the hook passes its depth — the climb
    // HITCHES so the burst, the flying ×N and the fish flash all get READ
    for(const b of st.popped){
      if(!b._popped && V.hookDepth<=b.depth){
        b._popped=true; r.combo++; r.hitch=POP_HITCH;
        const st2=BUBBLE_FX[b.tier];
        const bx=bubbleProjectedX(b,V.T,V.engine.C);   // burst at the rendered glass position
        const tf=b.fishRef;
        V.fx.pops.push({ x:bx, y:LAYOUT.surfaceY+b.depth, r0:st2.r, col:st2.col, t:0, fishF:tf,
          seed:Math.random()*6.283,
          mult:b.mult,
          label:'×'+(b.mult>=10?b.mult.toFixed(0):b.mult.toFixed(2)),
          toX: tf? ANCHOR_X+Math.sin((tf._order||0)*2.1)*16 : null,
          toY: tf? LAYOUT.surfaceY+(tf._reelDepth||V.hookDepth) : null });
        // stacked tension: each pop hits harder than the last, the lens punches,
        // the screen blinks the bubble's tier color
        V.zoomPunch=1;
        V.fx.flashCol=st2.col;
        V.shake=Math.min(15, 3.5+r.combo*2.1);
        V.fx.flash=Math.max(V.fx.flash, Math.min(0.4, 0.14+r.combo*0.06+b.tier*0.03));
        A.pop(b.tier, r.combo-1);
      }
    }
    if(V.hookDepth<=BREACH_DEPTH+0.5){
      // safety net — a triggered beast normally fires mid-climb (WHALE_BURST_DEPTH)
      if(st.whaleTriggered && !forcedGoldPending && !r.whaleFired){
        r.whaleFired=true; startWhale2(); return;
      }
      const win=toCredits(st.payoutBp/BP*V.stake); V.balance+=win;
      V.result={payBp:st.payoutBp,win}; const mult=st.payoutBp/BP;
      const tier = mult>=50?4 : mult>=10?3 : mult>=3?2 : mult>=1?1 : 0;
      const cut = !!r.cut;                    // v2.4: this breach is a salvaged shark cut
      // a cut surfaces softly — no shake, gentle flash (hao: 挫敗感降到最低); a real win still punches.
      V.fx.flashCol = cut?'#6FE3E1':null; V.fx.flash = cut?0.35:1; V.shake = cut?0:Math.min(14,5+tier*2.2);
      // §8.6 — the breach bursts the WIN AMOUNT; the mult is the small line.
      // a cut still shows what you SAVED, but says so — it is not a triumph.
      V.fx.slam = cut
        ? {txt:'LINE CUT', sub:'saved +'+fmtMoney(win), scale:0.42, cold:true, big:false}
        : {txt:'+'+fmtMoney(win), sub:'×'+(mult>=10?mult.toFixed(1):mult.toFixed(2)), scale:0.4, cold:false, big:tier>=3};
      spawnCoins([4,16,32,56,92][tier], tier); if(cut) A.cut(); else A.win(tier);   // v2.5: 爆出更多金幣
      V.resultTier = cut?0:tier;
      setState('PAYOUT'); V.resultT=0;
    }
  }
}
const BUBBLE_FX=[{col:'#6FE3E1',r:15},{col:'#39C6B5',r:19},{col:'#5B8FC7',r:24},{col:'#C8922E',r:31},{col:'#F6C243',r:41}];

/* ---------- BEAST SHOW ------------------------------------------------
   v2.28: caught value plus carry is already sealed. Crossing a configurable
   threshold selects this show; a held beast visibly releases the residual
   carry without changing RTP, while a break leaves it banked. The sequence:
   BURST — it erupts from the sea floor, head-up, jaws open
   SWALLOW — the whole strung catch vanishes into its mouth
   BITE — it clamps the hook; the line snaps TAUT
   STRUGGLE — thrash, tension climbing → DRAG — hauled up, odometer → LAND. */
const WHALE_BURST_DEPTH=480;   // mid-REEF — where it erupts under the climb
/* 大白鯊剪影「預告」在更深處啟動,並讓 reel 續爬——剪影+盤旋這段結束時,鉤大約才爬到
   WHALE_BURST_DEPTH 附近才「衝出」。剪影是純背景圖層,不進 WHALE 接管、不動前景節奏。
   若剪影還沒走完鉤已爬到 MIN_BURST(快到淺水,魚串將出海面)就提前衝出。(hao 2026-07-22) */
const WHALE_TELE_DEPTH=960;    // 剪影預告啟動深度(reel 續爬;較深以補償較長的慢掠,衝出仍落 mid-reef)
const WHALE_MIN_BURST=300;     // 保底:到此深度必須衝出(避免魚串已近海面才爆)
/* v2.1c beast ladder — RUSSIAN-DOLL predation (hao): every tier is EATEN
   by the next. tier 0 = the small WHALE takes the catch. tier 1 = the
   GREAT WHALE then eats the small whale. tier 2 = the MEGALODON eats the
   great whale. Each clamp bursts harder than the last; only the FINAL
   beast plays the struggle. Escaped rounds read as a GREAT (you never
   quite see what took it). */
const W2S={ LURK:0.7, STRIKE:0.72, BURST:[0.55,0.75,1.0], SWALLOW:[0.42,0.52,0.66], BITE:[0.38,0.42,0.48],
            HAUL:1.7, STRUGGLE:3.0, SNAPLINE:0.85, DRAG:2.6, LAND:0.6 };
/* the odometer starts counting from the FIRST beast's haul — the player
   believes they are already cashing a small whale… then the next beast
   erupts and the count SURGES (hao: 突然升級). Cut points per chain: */
const SHOW_CUTS={ 2:[0.12,0.35], 1:[0.25], 0:[] };
const BEAST_FX=[
  { col:'#9DF0EE', slam:'GREAT WHITE' },
  { col:'#F6C243', slam:'MOSASAUR'    },
  { col:'#FBE7A8', slam:'LIVYATAN'    },
];
/* dev helper — 把「這一局」封成巨獸局（forceWhale 與 beastEvery demo 共用）。
   純演出狀態,鏡射引擎會封的欄位;held 清 snapped 以免被 doPull 的 cut 判斷攔下。 */
function applyBeastArm(st, mult, escape){
  st.whaleTriggered=true; st.whaleTease=true;
  st.whaleTier = mult<30?0 : mult<100?1 : 2;
  st.whaleEscaped=!!escape; st.beastLineBroken=!!escape; st.snapped=false; st.whaleBp=0;
  st.beastBudgetBreak=false;
  st.beastShowBp=Math.round(mult*BP); st.payoutBp=st.beastShowBp;
}
function startWhale2(lurkDir){
  const st=V.engine.st;
  V.fx.tease=null; V.fx.beastTele=null;
  // 剪影預告(lurk/stalk)已在 REELING 期背景演完 → 直接從「衝出」(strike)接管
  V.whale={t:0, phase:'strike', stage:0, escaped:st.whaleEscaped, fromDepth:V.hookDepth,
    lurkDir: lurkDir || (Math.random()<0.5?-1:1),
    tier: st.whaleTier>=0 ? st.whaleTier : 1,
    target:toCredits((st.beastShowBp||st.payoutBp)/BP*V.stake), shown:0, ate:false};
  V.fx.flash=0.32; V.shake=8; V.fx.slam=null; A.beastBurst(0);   // 反向爆衝咬鉤（剪影已預告過）
  setState('WHALE');
}
function tickWhale(dt){
  const wh=V.whale; if(!wh) return;
  wh.t+=dt; const st=V.engine.st;
  const dur=(wh.phase==='haul'&&wh.haulDur)? wh.haulDur :
            ((Array.isArray(W2S[wh.phase.toUpperCase()])? W2S[wh.phase.toUpperCase()][wh.stage] : W2S[wh.phase.toUpperCase()])||1);
  const p=Math.min(1, wh.t/dur);
  switch(wh.phase){
    // ★ lurk(剪影掠過)+ stalk(盤旋懸念)已移到 REELING 期的「背景 telegraph」(見 tickReel /
    //   V.beastTele),不再是 WHALE 接管相位——如此剪影經過完全不影響前景節奏、不破題。
    //   WHALE state 現在直接從 strike(衝出)開局。
    case 'strike':                                  // (stage 0 only) 水平衝刺，掃過咬光魚串
      V.shake=Math.max(V.shake, 4+p*8);
      if(p>0.6 && !wh.ate){ wh.ate=true;            // 掃中：整串魚被吞（語意＝原 stage0 swallow）
        st.caught.forEach(f=>{ f._swallowed=true; });
        V.fx.flashCol=BEAST_FX[0].col; V.fx.flash=0.4; V.shake=Math.max(V.shake,12); A.beastSwallow(); }
      if(p>=1){ wh.phase='bite'; wh.t=0;            // 咬合爆特效（沿用原 swallow→bite 爆法）
        const bc=BEAST_FX[0];
        V.fx.pops.push({ x:ANCHOR_X, y:LAYOUT.surfaceY+V.hookDepth, r0:30,
          col:bc.col, t:0, seed:Math.random()*6.283, label:null, toX:null, toY:null });
        V.fx.flashCol=bc.col; V.fx.flash=Math.max(V.fx.flash,0.45); V.zoomPunch=1;
        V.shake=11; A.beastClamp(0); }
      break;
    case 'burst':                                   // stage-beast erupts from below
      V.shake=Math.max(V.shake, 5+p*4+wh.stage*1.5);
      if(p>=1){ wh.phase='swallow'; wh.t=0; wh.bitFx=false;   // reset 咬合噴血 flag
        if(wh.stage===0) st.caught.forEach(f=>{ f._swallowed=true; });
        V.fx.flash=0.5+wh.stage*0.1; V.shake=11+wh.stage*2; A.beastSwallow(); }
      break;
    case 'swallow':                                 // eats the catch — or the PREVIOUS beast
      if(!wh.bitFx && wh.stage>=1 && p>=0.6){ wh.bitFx=true;   // 咬下咬住前一隻獸的瞬間→爆血（與被咬抽搐同框,hao）
        spawnBlood(ANCHOR_X, LAYOUT.surfaceY+V.hookDepth, wh.stage);
        V.shake=Math.max(V.shake, 10+wh.stage*2.5); A.beastClamp(wh.stage);
      }
      if(p>=1){ wh.phase='bite'; wh.t=0;
        // CLAMP BURST — every stage explodes the instant the jaws snap shut
        // (hao: 全部在咬合的瞬間都要爆特效); each stage hits harder
        const bc=BEAST_FX[wh.stage];
        V.fx.pops.push({ x:ANCHOR_X, y:LAYOUT.surfaceY+V.hookDepth, r0:30+wh.stage*24,
          col:bc.col, t:0, seed:Math.random()*6.283, label:null, toX:null, toY:null });
        V.fx.flashCol=bc.col;
        V.fx.flash=Math.max(V.fx.flash, 0.45+wh.stage*0.25);
        V.zoomPunch=1;
        V.shake=9+wh.stage*3.2;
        if(wh.stage===0) A.beastClamp(0);   // stage0(咬魚串)咬合音;stage≥1 的 clamp 音已在 swallow 咬下瞬間播過（免雙 clamp）
      }
      break;
    case 'bite':                                    // jaws clamp
      if(p>=1){ wh.t=0;
        if(wh.stage<wh.tier){ wh.phase='haul'; A.beastHaul();   // …hauled up in false victory
          // SLOW, and never the same twice: the haul length and the moment
          // the water turns are both uncertain — anything can happen mid-pull
          wh.haulDur=1.6+Math.random()*0.9;
          wh.teaseAt=0.3+Math.random()*0.35;
          wh.backAt=0.25+Math.random()*0.45;         // one wrench-back mid-haul (GREAT only)
          // this stage's count window: the player is ALREADY cashing out
          wh.showFrom=wh.shown||0;
          wh.showTo=Math.round(wh.target*(SHOW_CUTS[wh.tier][wh.stage]||0.2));
          wh.showProg=0;
        }
        else { wh.phase='struggle'; A.beastStruggle(); }        // the FINAL beast fights
      }
      break;
    case 'haul':                                    // the beast is winched UPWARD, clamped —
      // mid-haul the water shifts AGAIN: a second, harsher omen, and the
      // next predator strikes DURING the movement (hao: 套娃是移動中再觸發)
      { const inBack = wh.stage>=1 && p>(wh.backAt||0.4) && p<(wh.backAt||0.4)+0.14;
        wh._inBack=inBack;                           // render 的「兩股力」訊號:回拖=獸贏
        if(inBack){                                  // the beast WRENCHES back down (GREAT+)
          if(!wh.wrenchSfx){ wh.wrenchSfx=true; A.beastWrench(); }
          V.hookDepth=Math.min(wh.fromDepth+40, V.hookDepth + 130*dt);
          V.shake=Math.max(V.shake, 6+wh.stage*2);
        } else {
          V.hookDepth=Math.max(70, V.hookDepth - 72*dt);
          V.shake=Math.max(V.shake, 1.1);
          // the count climbs ONLY while moving up — frozen during the wrench
          wh.showProg=Math.min(1, (wh.showProg||0) + dt/((wh.haulDur||1.7)*0.9));
        }
        wh.shown=toCredits((wh.showFrom||0) + ((wh.showTo||0)-(wh.showFrom||0))*Math.pow(wh.showProg||0,1.1));
        V.fx.slam={txt:'+'+fmtMoney(wh.shown), sub:'IT IS HELD', scale:1, big:true, cold:false};
      }
      if(p>(wh.teaseAt||0.45) && !wh.reTeased){ wh.reTeased=true; V.fx.tease={t:0}; A.omen(); }
      if(p>=1){ wh.stage++; wh.phase='burst'; wh.t=0; wh.reTeased=false; wh.wrenchSfx=false;
        V.fx.tease=null; V.fx.flash=Math.max(V.fx.flash,0.18); A.beastBurst(wh.stage); }
      break;
    case 'struggle':                                // tension climbs to the verdict
      V.shake=Math.max(V.shake, 3+p*9);
      if(p>=1){ wh.t=0;
        if(wh.escaped){ wh.phase='snapline'; V.fx.flash=1; V.shake=15; A.snap(); }
        else wh.phase='drag';
      }
      break;
    case 'snapline':                                // unaffordable PULL-event beast breaks visually; settled payout stays secured
      if(p>=1){
        const win=toCredits(st.payoutBp/BP*V.stake);
        V.balance+=win;                       // PULL event break is presentation-only; settled money is never rewritten
        V.result={payBp:st.payoutBp,win,snapped:true,lineBroken:true};
        V.fx.slam=null; V.whale=null; V.fx.whale=null;
        setState('SNAP'); V.resultT=0;
        showCard('LINE BROKEN', win>0?'PAYOUT SECURED · +'+fmtMoney(win):'NO PAYOUT · +0', true);
        return;
      }
      break;
    case 'drag': {                                  // held! — a TUG-OF-WAR to the surface
      if(!wh.tug){
        // plan the whole fight up front: FEW but LONG wrenches (hao) — the
        // drama lives in the DISTANCE lost. The odometer only climbs on the
        // way UP and freezes while dragged back, so every wrench survived
        // means MORE climbing — more reversals literally read as more reward,
        // yet the sealed total lands exactly.
        // small whale never fights back; GREAT 1-2 wrenches, MEGALODON 2-3
        const n=wh.tier===0? 0 : Math.min(3, wh.tier+(Math.random()<0.5?1:0));
        const backs=[];
        for(let i=0;i<n;i++) backs.push({ at:0.22+(0.58/Math.max(1,n))*(i+0.15+Math.random()*0.7),
                                          dist:0.26+Math.random()*0.16 });
        const upTotal=1+backs.reduce((a,b)=>a+b.dist,0);
        wh.tug={ phase:'up', prog:0, up:0, backs, bi:0, upTotal, backLeft:0,
                 from:V.hookDepth, showBase:wh.shown||0 };
      }
      const tg=wh.tug;
      if(tg.phase==='up'){
        const step=dt/1.5;                               // SLOW winching — long strokes
        tg.prog=Math.min(1, tg.prog+step); tg.up+=step;
        V.shake=Math.max(V.shake, 2.2+wh.tier);
        if(tg.bi<tg.backs.length && tg.prog>=tg.backs[tg.bi].at && tg.prog<0.92){
          tg.phase='back'; tg.backLeft=tg.backs[tg.bi].dist; tg.bi++;
          V.shake=10+wh.tier*2.5; V.fx.flash=Math.max(V.fx.flash,0.18); A.beastWrench();
        }
      } else {
        const d=Math.min(tg.backLeft, dt*0.38, Math.max(0,tg.prog-0.035));  // dragged FAR back down, slowly
        tg.prog-=d; tg.backLeft-=d;
        V.shake=Math.max(V.shake, 6.5+wh.tier*2.5);
        if(tg.backLeft<=0.001 || tg.prog<=0.04){ tg.phase='up'; A.beastHaul(); }
      }
      // odometer: continues from the running count, climbs only on up-strokes
      wh.shown=toCredits(tg.showBase + (wh.target-tg.showBase)*Math.pow(Math.min(1, tg.up/tg.upTotal),1.1));
      V.fx.slam={txt:'+'+fmtMoney(wh.shown), sub:'IT IS HELD', scale:1, big:true, cold:false};
      V.hookDepth=tg.from*(1-tg.prog)+BREACH_DEPTH*tg.prog;
      // the beast BREAKS THE SURFACE on its way out — same v1 foam language
      if(!wh.breachedFx && V.hookDepth<=2){ wh.breachedFx=true;
        V.fx.breach={t:0, x:ANCHOR_X}; V.shake=Math.max(V.shake,10); A.breach(); }
      if(tg.prog>=1){ wh.t=0; wh.phase='land';
        const win=toCredits(st.payoutBp/BP*V.stake); V.balance+=win;
        V.result={payBp:st.payoutBp,win};
        V.fx.flashCol=null; V.fx.flash=1; V.shake=14;
        V.fx.slam={txt:'+'+fmtMoney(win), sub:BEAST_FX[wh.tier].slam, scale:0.5, big:true, cold:false};
        spawnCoins([56,76,108][wh.tier]||76, 4, ANCHOR_X); V.resultTier=4; A.beastLand(wh.tier);   // the beast breaches at center (v2.5: more gold)
      }
      break; }
    case 'land':
      if(p>=1){ V.whale=null; V.fx.whale=null; setState('PAYOUT'); V.resultT=0; return; }
      break;
  }
  if(V.whale){
    // phase 可能在上面 switch 內剛轉換(wh.t 已歸 0)——用「轉換後」的 phase/t 重算 p 給 render,
    // 否則沿用舊 phase 的 p≈1,新 phase 會用終點值畫一幀＝獸出現時閃到畫面中央(hao 2026-07-22 bug)
    const durO=(wh.phase==='haul'&&wh.haulDur)? wh.haulDur :
      ((Array.isArray(W2S[wh.phase.toUpperCase()])? W2S[wh.phase.toUpperCase()][wh.stage] : W2S[wh.phase.toUpperCase()])||1);
    const pO=Math.min(1, wh.t/durO);
    V.fx.whale={ph:wh.phase, p:pO, escaped:wh.escaped, tier:wh.tier, stage:wh.stage, lurkDir:wh.lurkDir,
    // 兩股力訊號(hao):+1=絞盤真的在收(線贏) -1=獸把線拖回(獸贏) 0=僵持(bite/struggle,鉤沒動)
    pull: wh.phase==='haul'? (wh._inBack?-1:1) : wh.phase==='drag'? (wh.tug&&wh.tug.phase==='back'?-1:1)
        : wh.phase==='land'? 1 : wh.phase==='snapline'? -1 : 0};
  }
}

/* the REAL waterline crossing of the string right now — the engine line's x
   just under the surface (drifts with current + the sealed steer). Breach
   FX and coins must happen HERE, never at a fixed center (hao 2026-07-19). */
function crossX(){
  if(!V.engine) return ANCHOR_X;
  return reelPathX(V.engine.st, 2);
}

/* each strung fish that crosses the waterline bursts into coins — shared by
   the reel climb AND the payout wind-in (the winch keeps hauling until the
   whole string has come out of the sea). */
function cashCrossings(st){
  const cx0=crossX();
  for(const f of st.caught){
    if(f._grab && !f._cashed && f._reelDepth!=null && f._reelDepth<=6){
      f._cashed=true;
      const fan=Math.sin((f._order||0)*2.1)*16;
      spawnCoinsAt(cx0+fan, LAYOUT.surfaceY-V.cam,
        f.type==='SCATTER'?6:(4+2*(ARCH_COIN[f.arch]||0)));   // v2.5: 每尾出水噴更多金幣
      V.fx.pops.push({ x:cx0+fan, y:LAYOUT.surfaceY+2, r0:7, col:'#F6C243', t:0.3,
        seed:Math.random()*6.283, small:true, label:null, toX:null, toY:null });
      V.shake=Math.max(V.shake,2.6); A.coin();
    }
  }
}

/* coin fountains: the big one erupts FROM THE WATERLINE (the catch came out
   of the sea), then every coin gets pulled into the BALANCE readout
   top-left; each arrival ticks the balance pulse. */
/* 咬合噴血（套娃獸吃獸,hao 2026-07-22）：暗血紅核心 → 快速被深水稀釋成墨褐雲。紅光在水下
   最先被吸收＝物理真實的「深海血」,有血腥衝擊但不鮮紅/不 magenta（design-system 損失才用
   petrol-violet,血是大獎升級的暴力）。x,y=咬合點（獸嘴＝鉤深度）,stage 越深血越多越猛。量級旋鈕:
   雲 r1／噴濺 n·sp／血色 stop。 */
function spawnBlood(x, y, stage){
  const gush=1+stage*0.4;
  V.fx.blood.push({ cloud:true, x, y, t:0, life:1.5+stage*0.25, r0:16+stage*9, r1:132+stage*48, seed:x*0.7+y*0.3 });
  V.fx.blood.push({ cloud:true, x:x+((x*7+y)%23-11), y:y+((x*3+y*5)%17-8), t:0, life:1.05+stage*0.15, r0:10, r1:82+stage*32, seed:x*0.3+y*0.9 });
  const n=20+stage*10;
  for(let i=0;i<n;i++){ const a=(i*2.399+x*0.11)%6.283, sp=(52+((i*89+y)%230))*gush;   // 無 Math.random（決定性喜好,靠 index 散開）
    V.fx.blood.push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-42*gush,
      t:0, life:0.68+((i*53)%90)/100, r:2.6+((i*37)%60)/10+stage*2, dark:(i%5)/5 }); }
}
const ARCH_COIN={ minnow:0, mid:1, large:2, giant:3 };
function spawnCoins(n, tier, x0){
  const by=LAYOUT.surfaceY-V.cam;               // the waterline, in screen space
  const bx=(x0!=null)? x0 : crossX();           // erupt where the catch REALLY came out
  for(let i=0;i<n;i++){
    V.fx.coins.push({ x:bx+(Math.random()*2-1)*76, y:by+(Math.random()*2-1)*14,
      vx:(Math.random()*2-1)*280, vy:-(170+Math.random()*330),
      t:0, sz:4.2+Math.random()*3.4+(tier>=3?1.6:0), phase:Math.random()*6.283,
      delay:Math.random()*0.3 });
  }
}
/* per-fish cash-out burst — a small handful right where IT crossed the line */
function spawnCoinsAt(x, y, n){
  for(let i=0;i<n;i++){
    V.fx.coins.push({ x:x+(Math.random()*2-1)*14, y:y+(Math.random()*2-1)*6,
      vx:(Math.random()*2-1)*170, vy:-(150+Math.random()*220),
      t:0, sz:3.6+Math.random()*2.6, phase:Math.random()*6.283,
      delay:Math.random()*0.12 });
  }
}
/* the BALANCE readout in CANVAS space — coins home to wherever the wallet
   actually sits (v2.5 hao: 錢要往 BALANCE 的位置飛). The old fixed (64,26) was a
   left-corner guess that missed the now top-CENTER readout, so the cash never
   visibly landed home; this maps the live #bal element into the coin space. */
function balTarget(){
  const be=$('#bal');
  if(!be || !cv) return [LAYOUT.w*0.5, 46];
  const b=be.getBoundingClientRect(), r=cv.getBoundingClientRect();
  if(!r.width || !r.height) return [LAYOUT.w*0.5, 46];
  return [ (b.left+b.width*0.5 - r.left)/r.width *LAYOUT.w,
           (b.top +b.height*0.5 - r.top )/r.height*LAYOUT.h ];
}
function tickCoins(dt){
  const [tx,ty]=balTarget();
  let arrived=false;
  for(const c of V.fx.coins){
    if(c.delay>0){ c.delay-=dt; continue; }
    c.px=c.x; c.py=c.y;                        // last pos → the streak drawn in drawCoins
    c.t+=dt/1.2;
    if(c.t<0.4){ c.x+=c.vx*dt; c.y+=c.vy*dt; c.vy+=1020*dt; }
    else {
      const k=Math.min(1,(c.t-0.4)/0.6);
      const pull=Math.min(1,dt*(3.5+9*k));
      c.x+=(tx-c.x)*pull; c.y+=(ty-c.y)*pull; c.sz=Math.max(1.6,c.sz*(1-dt*0.42));
      if(Math.hypot(c.x-tx,c.y-ty)<15){ c.t=1; arrived=true; }
    }
  }
  V.fx.coins=V.fx.coins.filter(c=>c.t<1);
  if(arrived) flashCost();                    // balance pulses as coins land
}
function endRound(){
  if(V.engine) V.carryBp = V.engine.st.carryOutBp||0;   // v2.5 — bank this round's residual for the next
  V.engine=null; V.hookDepth=0; V.result=null; V.reel=null; V.fx={flash:0,slam:null};
  V.shake=0; V.cam=0; V.T=0; V.steerX=0; V.steerTarget=0; V.vDepth=0; V.throttle=0;
  V.engaged=false; V.downMeter=0; V.pullMeter=0; V.potDisplay=0;
  V.cut=null; V.cutCam=null; V.rehook=null; V.card=null; V.danger=0; V.committed=0; V.lastContact=null; A.setDanger(0);
  V.fx={flash:0,slam:null,pops:[],coins:[],blood:[],cutLine:null,splash:null};
  V.zoomZ=1; V.zoomPunch=0; V.focus=0;
  setState('IDLE'); applyPendingGameConfig(); updateBetUI(false); A.silenceLoops(); lastDownNotch=lastPullNotch=0;
}

let _idleEngine=null;
const LIVE_CFG_SYNC={seenAt:null,appliedAt:null,pending:null};
function markGameTuningState(state,savedAt){
  const stage=$('#stage');
  if(!stage) return;
  stage.dataset.tuningState=state;
  stage.dataset.tuningSavedAt=savedAt||'';
}
function applyPendingGameConfig(){
  const next=LIVE_CFG_SYNC.pending;
  if(!next) return false;
  applyCfg(next.patch);
  LIVE_CFG_SYNC.appliedAt=next.savedAt;
  LIVE_CFG_SYNC.pending=null;
  _idleEngine=null;             // rebuild the idle water with the saved appearance mix
  markGameTuningState('applied',next.savedAt);
  return true;
}
function receiveSavedGameConfig(record){
  const patch=engineCfgFromRecord(record);
  if(!patch || record.savedAt===LIVE_CFG_SYNC.seenAt) return false;
  LIVE_CFG_SYNC.seenAt=record.savedAt;
  LIVE_CFG_SYNC.pending={savedAt:record.savedAt,patch};
  markGameTuningState('pending',record.savedAt);
  if(V.state==='IDLE' && !V.engine) applyPendingGameConfig();
  return true;
}
function idleEngine(){ if(!_idleEngine){ _idleEngine=createRound('idlev2',0); for(let i=0;i<4;i++) _idleEngine.sink(); } return _idleEngine; }
// v2.1: the hook already waits IN the water while idle — line runs up out of the frame
function drawIdle(){ draw(idleEngine(), IDLE_HOOK, V.idleClock, 0, 0, {cutFade:V.cutFade}, true); }   // fx carries cutFade so the idle sea fades IN after a cut

/* ---------- gesture HUD (hao 2026-07-19: arrow + energy gauge are ONE) --
   The 4 gauge cells ARE 4 chevrons, growing in the drag direction (每格箭頭
   越來越大); filling the drag lights them up one by one. At meter 0 the
   stack breathes as a hint. Down guides sit LOW, clear of the tall hook. */
function chevMeter(cx, y0, dir, meter, clock, col){
  const n=4;
  ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
  let y=y0;
  for(let i=0;i<n;i++){
    const w=12+i*4.8, hh=8+i*3.4;                 // each chevron BIGGER than the last
    const lit = meter >= (i+1)/n - 0.001;
    const breath = 0.5+0.5*Math.sin(clock*3 - i*0.55);
    ctx.strokeStyle=col; ctx.lineWidth=2.2+i*0.65;
    ctx.globalAlpha = lit? 0.95 : (meter>0.001? 0.20 : (0.44-i*0.05)*(0.45+0.55*breath));
    const tip = dir==='down'? y+hh : y-hh;
    ctx.beginPath(); ctx.moveTo(cx-w,y); ctx.lineTo(cx,tip); ctx.lineTo(cx+w,y); ctx.stroke();
    if(lit){                                       // the energy fills the arrow itself
      ctx.globalAlpha=0.55; ctx.fillStyle=col;
      ctx.beginPath();
      ctx.moveTo(cx-w*0.66, y+(dir==='down'?2:-2));
      ctx.lineTo(cx, dir==='down'? y+hh*0.82+2 : y-hh*0.82-2);
      ctx.lineTo(cx+w*0.66, y+(dir==='down'?2:-2));
      ctx.lineTo(cx, dir==='down'? y+hh*0.30 : y-hh*0.30);
      ctx.closePath(); ctx.fill();
    }
    y += (dir==='down'?1:-1)*(hh+9+i*1.5);
  }
  ctx.restore();
}
// the hook is TALL (industrial, ×1.55) — down guides start well below it
const GUIDE_DOWN=86, GUIDE_UP=-50;
function drawHud(){
  const W=LAYOUT.w, H=LAYOUT.h; ctx.save(); ctx.textAlign='center';
  const hy = LAYOUT.surfaceY + V.hookDepth - V.cam, cx=W*0.5;
  if(V.state==='IDLE'){
    const hy=LAYOUT.surfaceY+IDLE_HOOK-V.cam;      // hint cluster rides the waiting hook
    chevMeter(cx, hy+GUIDE_DOWN, 'down', V.downMeter, V.idleClock, '#6FE3E1');
    ctx.globalAlpha=0.55; ctx.font="800 11px 'Big Shoulders Display',sans-serif"; if('letterSpacing' in ctx) ctx.letterSpacing='2px';
    ctx.fillStyle='#7E9596'; ctx.fillText('DRAG DOWN · LOWER THE HOOK', cx, hy+GUIDE_DOWN+118);
  } else if(V.state==='SINK'){
    if(V.pullMeter>0.01) chevMeter(cx, hy+GUIDE_UP, 'up', V.pullMeter, V.T, '#F6C243');   // arming a pull mid-sink
    else chevMeter(cx, hy+GUIDE_DOWN, 'down', V.throttle, V.T, '#6FE3E1');                // throttle lights the arrow
  } else if(V.state==='HOLD'){
    if(V.pullMeter>0.01) chevMeter(cx, hy+GUIDE_UP, 'up', V.pullMeter, V.T, '#F6C243');
    else if(V.downMeter>0.01) chevMeter(cx, hy+GUIDE_DOWN, 'down', V.downMeter, V.T, '#6FE3E1');
    else { chevMeter(cx, hy+GUIDE_UP, 'up', 0, V.T, '#F6C243'); chevMeter(cx, hy+GUIDE_DOWN, 'down', 0, V.T, '#6FE3E1'); }
  }
  if('letterSpacing' in ctx) ctx.letterSpacing='0px';
  ctx.restore();
}

/* ---------- rolling odometer for POTENTIAL (money, ≈N) ---------- */
function digitReel(){ const r=document.createElement('span'); r.className='reel';
  const col=document.createElement('span'); col.className='col';
  for(let i=0;i<=9;i++){ const d=document.createElement('span'); d.textContent=i; col.appendChild(d); }
  r.appendChild(col); return r; }
let potSig='';
const isDigit = ch => ch>='0' && ch<='9';
function updatePotentialRoll(money){
  const el=$('#potentialNum');
  const s=fmtMoney(Math.max(0, money));            // WHAT YOU'D BANK, in wallet units
  const sig=s.replace(/\d/g,'#');                  // layout = digits vs separators (. and ,)
  if(sig!==potSig || !el.querySelector('.roll')){
    el.innerHTML='';
    const roll=document.createElement('span'); roll.className='roll';
    const ax=document.createElement('span'); ax.className='sym'; ax.textContent='≈'; roll.appendChild(ax);
    for(const ch of s){
      if(isDigit(ch)) roll.appendChild(digitReel());
      else { const sp=document.createElement('span'); sp.className='sym'; sp.textContent=ch; roll.appendChild(sp); }
    }
    el.appendChild(roll); potSig=sig;
  }
  const cols=el.querySelectorAll('.reel .col'); let ri=0;
  for(const ch of s) if(isDigit(ch)){ const c=cols[ri++]; if(c) c.style.transform='translateY(-'+(+ch)+'em)'; }
}

/* ---------- dock ----------
   v2.1d (hao 2026-07-19): the dock reads in MONEY, end to end. It used to
   read in POINTS while the breach burst a CURRENCY amount — the same catch
   shrank ~7× at the payoff moment (points→money is stake×SCALE_SCORE, an
   internal RTP dial the player can never see). Now POT/POTENTIAL are the
   money you'd actually bank, continuous with the '+N' at the surface and
   directly comparable to the BET tile sitting next to them. Fish keep their
   PTS labels — points stay the BODY language, money is the OUTCOME. */
const toMoney = bp => (bp/BP)*V.stake;
const DOCK_FIT_MIN = 0.56;
function fitDockNumber(el){
  if(!el) return;
  const slot=el.closest('.ro');
  const max=(slot?.clientWidth||0)-2;
  if(max<=0) return;
  el.style.setProperty('--dock-fit','1');
  const w=Math.max(el.scrollWidth, el.getBoundingClientRect().width);
  const fit=w>max ? Math.max(DOCK_FIT_MIN, Math.min(1, max/w)) : 1;
  el.style.setProperty('--dock-fit', fit.toFixed(3));
}
function fitDockNumbers(){
  requestAnimationFrame(()=>{
    fitDockNumber($('#potNum'));
    fitDockNumber($('#multNum'));
    fitDockNumber($('#potentialNum'));
  });
}
function updateDock(){
  const st=V.engine&&V.engine.st;
  const live = st && (V.state==='HOLD'||V.state==='SINK');
  const pv = live ? V.engine.previewPull(V.T,V.hookDepth) : null;
  // after the catch lands, the dock FREEZES on the realized result — the same
  // numbers the breach just burst, so the story doesn't change units or values
  // at the payoff moment
  setUnit(unit().k, unit().dp, V.stake);           // fish labels ride the same wallet scale
  const landed = V.state==='PAYOUT' && V.result && !V.result.snapped && st;
  const effShown = landed ? (st.potBp>0 ? st.baseBp/st.potBp : 1) : (pv?pv.effX:1);
  $('#potNum').textContent = fmtMoney(toMoney(landed?st.potBp:(pv?pv.potBp:(st?st.potBp:0))));  // pre-mult
  $('#multNum').textContent='×'+effShown.toFixed(2);
  if(st && live){ const target = toMoney(pv.potentialBp);                    // money you'd bank now
    V.potDisplay += (target - V.potDisplay)*0.14;        // ease so it doesn't fluctuate too fast
    updatePotentialRoll(V.potDisplay);
  } else if(landed){ updatePotentialRoll(V.result.win);  // == the '+N' at the surface
  } else { const el=$('#potentialNum'); if(potSig!==''){ el.innerHTML='—'; potSig=''; } V.potDisplay=0; }
  fitDockNumbers();
  /* v2.2 — the subline is gone (hao): the dock's four numbers already say
     everything the player acts on, and a running commentary under them was
     just noise competing with the water. Band/depth live on the right-edge
     ruler; 'in reach' is visible in the water itself. */
}
function updateBal(){ /* #bal is tweened toward V.balance every frame in loop() */ }

/* ---------- WALLET: tap to switch the display scale (any time) ---------- */
function toggleUnit(){
  V.unit = V.unit==='CASH' ? 'PTS' : 'CASH';
  const t=$('#unitTag'); if(t) t.textContent=unit().tag;
  potSig='';                                  // odometer relays out for the new scale
  updateBetUI(V.state!=='IDLE');
  flashCost();                                // the balance pulses to acknowledge the switch
}

/* ---------- BET switching (v2.1 §8.8 — IDLE only) ---------- */
function updateBetUI(locked){
  const el=$('#betVal'); if(!el) return;
  el.textContent=fmtMoney(V.stake);
  $('#betTile').classList.toggle('locked', !!locked || V.state!=='IDLE');
}
function cycleBet(){
  if(V.state!=='IDLE') return;                      // locked once the winch runs
  const i=BET_STEPS.indexOf(V.stake);
  V.stake=BET_STEPS[(i+1)%BET_STEPS.length];
  updateBetUI(false);
}

/* ---------- boot + rAF + input ---------- */
let last=0;
function frame(t){ const dt=Math.min(0.05,(t-last)/1000||0); last=t; loop(dt); requestAnimationFrame(frame); }
receiveSavedGameConfig(readSavedCfg());
window.addEventListener('storage',e=>{
  if(e.key===SAVED_CFG_KEY) receiveSavedGameConfig(readSavedCfg());
});
let savedCfgChannel=null;
try{
  if(typeof BroadcastChannel==='function'){
    savedCfgChannel=new BroadcastChannel(SAVED_CFG_CHANNEL);
    savedCfgChannel.addEventListener('message',e=>{
      if(e.data?.type==='saved') receiveSavedGameConfig(readSavedCfg());
    });
  }
}catch{}
const handleViewportResize=()=>{ resize(); calibrate(); fitDockNumbers(); };
window.addEventListener('resize', handleViewportResize);
window.addEventListener('deeper:viewport', handleViewportResize);
resize(); updateBal(); updateDock(); updateBetUI(false);
let beastArtUnlocked=false;
const updateBootArtStatus=()=>{
  const start=$('#boot .start');
  if(!start) return;
  const p=beastArtProgress();
  start.textContent = beastArtUnlocked
    ? 'tap - then pull the hook down'
    : (p.settled>=p.total ? `beast art failed ${p.loaded}/${p.total} - reload` : `loading beast art ${p.loaded}/${p.total}`);
};
updateBootArtStatus();
const beastStatusTimer=setInterval(updateBootArtStatus, 120);
beastArtReady.then(()=>{
  const p=beastArtProgress();
  beastArtUnlocked=p.loaded>=p.total;
  clearInterval(beastStatusTimer);
  updateBootArtStatus();
});
{ const bt=$('#betTile');
  if(bt) bt.addEventListener('pointerdown', e=>{ e.stopPropagation(); A.unlock(); A.ui(); cycleBet(); });
  const w=$('#wallet');
  if(w) w.addEventListener('pointerdown', e=>{ e.stopPropagation(); A.unlock(); A.ui(); toggleUnit(); });
  // no sfx chip any more — mute stays reachable at DEEPER_V2.audio.toggleMuted()
  const t=$('#unitTag'); if(t) t.textContent=unit().tag;
}
{ const stage=$('#stage');
  const installZoomGuard=()=>{
    let lastTouchEnd=0;
    document.addEventListener('touchend', e=>{
      const now=performance.now();
      if(now-lastTouchEnd<360) e.preventDefault();
      lastTouchEnd=now;
    }, {capture:true, passive:false});
    document.addEventListener('touchmove', e=>{
      if(e.touches && e.touches.length>1) e.preventDefault();
    }, {capture:true, passive:false});
    ['gesturestart','gesturechange','gestureend'].forEach(type=>{
      document.addEventListener(type, e=>e.preventDefault(), {capture:true, passive:false});
    });
  };
  installZoomGuard();
  stage.addEventListener('pointerdown', e=>{ A.unlock();   // browsers only allow audio after a gesture
    const boot=$('#boot'); if(boot && !boot.classList.contains('gone')){
      if(!beastArtUnlocked){ updateBootArtStatus(); return; }
      boot.classList.add('gone'); setTimeout(()=>boot.remove(),500); return;
    } onDown(e); });
  window.addEventListener('pointermove', onMove, {passive:true});
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
requestAnimationFrame(frame);

window.DEEPER_V2 = {
  V, audio:A,
  tuningInfo(){ return {
    savedAt:LIVE_CFG_SYNC.seenAt,
    appliedAt:LIVE_CFG_SYNC.appliedAt,
    pending:!!LIVE_CFG_SYNC.pending,
  }; },
  stepFrames(n=1, dt=1/60){ for(let i=0;i<n;i++) loop(dt); return V.state; },
  gDown:(x,y)=>onDown({clientX:x,clientY:y}), gMove:(x,y)=>onMove({clientX:x,clientY:y}), gUp:onUp,
  pull:doPull,
  autoPlay:(mode='safe',opts={})=>autoPlay(mode,opts),
  autoStop,
  autoStatus,
  // dev: arm a beast on the current REELING round. escape=true plays the
  // line-break-but-paid branch; else held, paying `mult` (tier inferred from mult:
  // <30 WHALE · <100 GREAT WHALE · else MEGALODON).
  forceWhale(mult=600, escape=false){ const st=V.engine&&V.engine.st;
    if(st && V.state==='REELING'){ applyBeastArm(st, mult, escape); V.fx.tease={t:0};
      return 'beast armed '+(escape?'(LINE BREAK · PAYOUT SECURED)':'×'+mult+' ('+['WHALE','GREAT','MEGALODON'][st.whaleTier]+')'); }
    return 'need REELING state'; },
  // dev: 設定後「每局收網」都強制觸發巨獸,正常玩即可反覆體驗（beastOff 關閉）
  beastEvery(mult=600, escape=false){ V.beastEvery={mult:+mult||600, escape:!!escape};
    const tier=['GREAT WHITE','MOSASAUR','LIVYATAN'][mult<30?0:mult<100?1:2];
    return '每局強制巨獸 ON → '+tier+(escape?'(斷鉤但照付)':'(咬死 held ×'+mult+')')+'｜玩法:按住往下拖沉→放開收網→巨獸出現｜關閉:DEEPER_V2.beastOff()'; },
  beastOff(){ V.beastEvery=null; return '每局強制巨獸 OFF'; },
  // dev: 強迫每段都出鯊魚,方便反覆看斷線演出（跑真引擎路徑＝含 salvage/字卡/獎品,
  // 只改執行期 CFG,build 時整段 tree-shake 不進出貨版）。'bite'=必咬斷、'miss'=必失手、
  // null=還原預設。與 beastEvery 互斥（beast 開時下沉會清掉鯊魚）。
  sharkEvery(mode){
    if(!this._sharkOrig) this._sharkOrig={ enabled:CFG.sharkEnabled, s:CFG.sharkSpawnP, b:CFG.sharkBiteP };
    // 'bite' spawn=1、咬中率=1,但 advanceDepth 把 < SHARK_TEST_L 的咬先中和掉（devNeutralizeBite）→
    //   斷線演出穩定落在 SHARK_TEST_L(=L7 mid-REEF);L1 一 DROP 的咬也被中和,不會空咬。
    // 'miss' keeps the configured spawn rate but forces bite=0.
    if(mode==='bite')      applyCfg({ sharkEnabled:true, sharkSpawnP:1, sharkBiteP:1 });
    else if(mode==='miss') applyCfg({ sharkEnabled:true, sharkSpawnP:this._sharkOrig.s, sharkBiteP:0 });
    else { applyCfg({ sharkEnabled:this._sharkOrig.enabled, sharkSpawnP:this._sharkOrig.s, sharkBiteP:this._sharkOrig.b }); mode=null; }
    if(mode) V.beastEvery=null;                         // 互斥:開鯊魚就關巨獸
    V.sharkForce=mode;
    return '鯊魚測試 → '+(mode==='bite'?'必咬斷(看斷線演出)':mode==='miss'?'照原出現率,必不咬斷':'OFF(還原原設定)'); },
  hookInfo(){ const st=V.engine&&V.engine.st; return { state:V.state, T:+V.T.toFixed(2), L:st?st.L:0, hookDepth:+V.hookDepth.toFixed(1), vDepth:+V.vDepth.toFixed(1), throttle:+V.throttle.toFixed(2), steerX:+V.steerX.toFixed(1), down:+V.downMeter.toFixed(2), pull:+V.pullMeter.toFixed(2), pot:st?+(st.potBp/BP).toFixed(2):0 }; },
};

/* ---------- dev 巨獸測試面板（畫布右上角；僅 dev，build 時 import.meta.env.DEV
   為 false 整段被 tree-shake，不進出貨版）。點一個 tier＝每局收網強制觸發那隻，
   正常玩即可反覆體驗；斷鉤＝切 escaped 視覺分支但仍照付；OFF＝關閉。 ---------- */
const SHOW_DEMO_PANEL = (import.meta.env && import.meta.env.DEV) || true;
if(SHOW_DEMO_PANEL){
  const css=`
  #beastDev{position:absolute;top:calc(env(safe-area-inset-top,10px) + 4px);right:8px;z-index:40;width:156px;
    font:600 10px/1.35 var(--font-ui,sans-serif);color:var(--bone,#E9F2F0);user-select:none;-webkit-user-select:none;
    background:rgba(6,15,24,.82);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);
    border:1px solid rgba(246,194,67,.26);border-radius:9px;padding:7px;box-shadow:0 5px 18px rgba(0,0,0,.45)}
  #beastDev .hd{display:flex;align-items:center;justify-content:space-between;
    font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-hi,#FBE7A8);margin-bottom:2px;cursor:pointer}
  #beastDev:not(.open){width:auto;min-width:86px;padding:6px 7px}
  #beastDev:not(.open) .row,#beastDev:not(.open) .lbl{display:none}
  #beastDev:not(.open) .hd{margin-bottom:0}
  #beastDev .hd span:first-child::after{content:' ▾';opacity:.72}
  #beastDev.open .hd span:first-child::after{content:' ▴'}
  #beastDev .hd .dot{width:6px;height:6px;border-radius:50%;background:#38474f;transition:.25s}
  #beastDev.on .hd .dot{background:var(--gold-mid,#F6C243);box-shadow:0 0 7px var(--gold-mid,#F6C243)}
  #beastDev .row{display:flex;gap:4px;margin-top:5px}
  #beastDev button{flex:1;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09);
    color:var(--ash,#7E9596);border-radius:5px;padding:6px 2px;font:800 10px var(--font-ui,sans-serif);cursor:pointer;transition:.14s}
  #beastDev button:hover{background:rgba(255,255,255,.13);color:var(--bone,#E9F2F0)}
  #beastDev button.on{background:var(--gold-grad,linear-gradient(135deg,#FBE7A8,#F6C243 38%,#C8922E 62%,#6E4A12));
    color:#2a1e05;border-color:var(--gold-hi,#FBE7A8);box-shadow:inset 0 1px 0 var(--gold-hi,#FBE7A8)}
  #beastDev .esc.on{background:linear-gradient(180deg,#9a6cd0,#6d44a8);color:#fff;border-color:#C9A7E8;box-shadow:none}
  #beastDev .off{flex:.62;color:#c89090}
  #beastDev .off:hover{color:#f0b4b4}
  #beastDev .lbl{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:var(--ash,#7E9596);margin-top:8px;
    padding-top:7px;border-top:1px solid rgba(255,255,255,.08)}
  #beastDev .shk.on{background:linear-gradient(180deg,#9a6cd0,#6d44a8);color:#fff;border-color:#C9A7E8;box-shadow:none}
  #beastDev .auto.on{background:linear-gradient(180deg,#4fd6c8,#209f9a);color:#041317;border-color:#8df8ef;box-shadow:none}
  #beastDev .auto-stop{flex:.72;color:#c89090}`;
  const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style);
  const p=document.createElement('div'); p.id='beastDev';
  p.innerHTML='<div class="hd"><span>Dev ▸ Beast / Shark</span><span class="dot"></span></div>'+
    '<div class="row"><button data-m="20">大白鯊</button><button data-m="60">滄龍</button><button data-m="600">利維坦</button></div>'+
    '<div class="row"><button class="esc" data-esc>掙脫</button><button class="off" data-off>OFF</button></div>'+
    '<div class="lbl">Shark 每段強制</div>'+
    '<div class="row"><button class="shk" data-shark="bite">必咬斷</button><button class="shk" data-shark="miss">必失手</button><button class="off" data-shark-off>OFF</button></div>'+
    '<div class="lbl">Auto Play</div>'+
    '<div class="row"><button class="auto" data-auto="safe">Safe</button><button class="auto" data-auto="deep">Deep</button><button class="auto" data-auto="random">Rnd</button><button class="off auto-stop" data-auto-off>Stop</button></div>';
  (document.getElementById('stage')||document.body).appendChild(p);
  p.querySelector('.hd').addEventListener('click', e=>{ e.stopPropagation(); p.classList.toggle('open'); });
  let esc=false, actM=null, shk=null;
  const tierBtns=[...p.querySelectorAll('button[data-m]')], escBtn=p.querySelector('[data-esc]');
  const shkBtns=[...p.querySelectorAll('button[data-shark]')];
  const autoBtns=[...p.querySelectorAll('button[data-auto]')];
  const sync=()=>{ const auto=window.DEEPER_V2.autoStatus();
    p.classList.toggle('on', actM!==null||shk!==null||auto.on); escBtn.classList.toggle('on', esc);
    tierBtns.forEach(b=>b.classList.toggle('on', +b.dataset.m===actM));
    shkBtns.forEach(b=>b.classList.toggle('on', b.dataset.shark===shk));
    autoBtns.forEach(b=>b.classList.toggle('on', auto.on && b.dataset.auto===auto.mode)); };
  p.addEventListener('pointerdown', e=>e.stopPropagation());   // 別觸發遊戲的下沉手勢
  tierBtns.forEach(b=>b.addEventListener('click', e=>{ e.stopPropagation(); actM=+b.dataset.m;
    shk=null; window.DEEPER_V2.sharkEvery(null);              // 互斥:開巨獸就關鯊魚強制
    window.DEEPER_V2.beastEvery(actM, esc); sync(); }));
  escBtn.addEventListener('click', e=>{ e.stopPropagation(); esc=!esc; if(actM!==null) window.DEEPER_V2.beastEvery(actM, esc); sync(); });
  p.querySelector('[data-off]').addEventListener('click', e=>{ e.stopPropagation(); actM=null; window.DEEPER_V2.beastOff(); sync(); });
  shkBtns.forEach(b=>b.addEventListener('click', e=>{ e.stopPropagation(); shk=b.dataset.shark;
    actM=null;                                                // sharkEvery 內部已 V.beastEvery=null,這裡同步 UI
    window.DEEPER_V2.sharkEvery(shk); sync(); }));
  p.querySelector('[data-shark-off]').addEventListener('click', e=>{ e.stopPropagation(); shk=null; window.DEEPER_V2.sharkEvery(null); sync(); });
  autoBtns.forEach(b=>b.addEventListener('click', e=>{ e.stopPropagation(); window.DEEPER_V2.autoPlay(b.dataset.auto); sync(); }));
  p.querySelector('[data-auto-off]').addEventListener('click', e=>{ e.stopPropagation(); window.DEEPER_V2.autoStop(); sync(); });
  window.addEventListener('deeper:auto', sync);
}
