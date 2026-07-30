/* ============================================================
   DEEPER v2 — ENTITIES: seeded spawn + closed-form motion.

   Three entity kinds in the water (v2.15 current model, DESIGN-V2 §8):
     · SCORE fish   — value/archetype use an independent appearance-weight
                      table; if caught, the visible value is paid exactly.
     · MULT BUBBLE  — ×2–×100, independently weighted. If it can be afforded,
                      it lands on one hooked fish and the visible uplift is real.
     · SCATTER      — small golden fish, no score. Land 2 on one PULL →
                      WHALE jackpot event (300–3000×).
   Spawn distributions are independent from the sealed pool. The PULL arranger
   keeps unaffordable fish/bubble combinations outside the catch path, so the
   caught on-screen sum can never exceed the pool and never pays a hidden value.

   Motion is CLOSED-FORM from params drawn ONCE at spawn — position at any
   sim-time is a pure function, so nothing consumes rng per frame and the
   world is reproducible from (seed, action-timeline). rng is consumed only
   in spawnLayer(), in the FIXED ORDER documented in round.js.
   ============================================================ */
import {
  WORLD_W, ANCHOR_X, CATCH_RADIUS, POP_RADIUS,
  layerDepthY, bandOf, currentDisp, SHARK_SPAWN_P, SHARK_PRIZE_MIN, SHARK_PRIZE_MAX,
  fishAppearanceForBand, bubbleAppearanceForBand, CFG,
} from './world.js';

function rand(rng, a, b){ return a + (b-a)*rng(); }

/* SCORE fish are denominated directly in ×stake. The current depth band's
   appearance table supplies the visible/payable values; no hidden scale exists. */
export const SCALE_SCORE = 1.0;
/* v2.3b (hao: 相對的讓魚的倍率或中獎率提高) — floor raised 0→1. Once EVERY
   segment charges an ante, a segment that spawns nothing is the player paying
   to watch empty water, which is the worst beat in the game. A guaranteed fish
   is the honest answer: the ante always buys something to aim at. It also gives
   the arrangement more carriers for a pool that is now several bets deep. */
export const SPAWN_MIN = 1, SPAWN_MAX = 2;// fish per segment entry (E=1.5)

/* A SHARK THAT MISSED IS THE PRIZE (v2.1f, hao: 讓風險跟收益對稱) — every
   shark charges the line exactly ONCE; survive it and it turns into the
   biggest ordinary catch in the water. It also swims FAST, because a prize
   this size has to be likely to get away. */
export const PRIZE_SPEED = 3.1;             // ×normal swim excursion & rate

/* archetype by ×-of-stake — silhouette/size class the renderer draws.
   Value must be readable at a glance (§8.7 calculability). */
export function archetypeOf(x){
  return x>=2.2 ? 'giant' : x>=1.1 ? 'large' : x>=0.5 ? 'mid' : 'minnow';
}

/* --- MULT BUBBLES (v2.10 independently weighted) ---------------------
   5 tiers spanning ×2–×100 — low tiers cold & small, high tiers warm &
   large (render maps tier → color/size). Each band owns an independent
   appearance-weight table; in-tier value is log-uniform and pays if caught. */
/* v2.2b — bubbles start at ×2. A multiplier under ×2 is not a prize, it is
   noise; every bubble in the water now visibly matters. */
export const BUBBLE_TIERS = [
  { min:2,   max:4   },   // T1 — cold cyan
  { min:4,   max:8   },   // T2 — teal
  { min:8,   max:20  },   // T3 — deep blue
  { min:20,  max:50  },   // T4 — gold
  { min:50,  max:100 },   // T5 — baked gold, the monster
];
export function tierOfMult(m){
  for(let i=BUBBLE_TIERS.length-1;i>0;i--) if(m>=BUBBLE_TIERS[i].min) return i;
  return 0;
}

/* --- LINEAR DRIFT-AWAY (special entities only) -----------------------
   Ordinary SCORE fish now use bounded free swimming: safe carry makes waiting
   unable to change sealed total value, and permanent drift bottom-packed the
   climb. SCATTER/PRIZE and bubbles retain linear escape pressure. */
const FISH_DRIFT    = [14, 32];   // px/sec, direction seeded
const SCATTER_DRIFT = [20, 40];   // the golden fish slips away faster

/* SCATTER/PRIZE still leave once their special linear drift clears the field. */
export const ESCAPE_DIST = 150;
export function fishGone(f, t){
  return Math.abs(f.drift||0) * Math.max(0, t - f.spawnT) > ESCAPE_DIST;
}
const BUBBLE_DRIFT  = [7, 14];    // bubbles drift too — a big mult can't be camped
// v2.1d structural knife: the FATTER the bubble, the faster it slips away
// (tier-scaled drift) — big ×N is aim-and-chase, never park-and-wait.
const BUBBLE_DRIFT_TIER = 0.40;   // drift ×(1+0.40·tier)
/* Organic motion tempo is presentation, not the linear escape clock. Bubbles
   stay calmer than fish so their printed multiplier remains readable. */
export const BUBBLE_MOTION_SPEED = 2;

/* Shared silhouette sizes keep render and contact geometry honest. A hit is
   measured from the visible body edge, not only from an invisible center dot. */
export const FISH_BODY_SIZE = {
  minnow:26, mid:38, large:54, giant:76, prize:70, scatter:18,
};
export const BUBBLE_BODY_RADIUS = [24,31,39,50,64];

/* New SINK entities appear across the layer, never stacked on the line.
   `layerSpawnX` maps ONE existing roll into either side of the playfield, so
   bubble/scatter RNG consumption stays bit-identical in count and order. */
const LAYER_SPAWN_MIN = 44;
const LAYER_SPAWN_MAX = Math.min(205, ANCHOR_X-64);
function layerSpawnX(rng){
  const u = rng();
  const side = u < 0.5 ? -1 : 1;
  const v = u < 0.5 ? u*2 : (u-0.5)*2;
  return ANCHOR_X + side*(LAYER_SPAWN_MIN + (LAYER_SPAWN_MAX-LAYER_SPAWN_MIN)*v);
}

/* Weighted presentation draw. `u` is always an already-existing spawn roll:
   changing weights changes only which visual tier it maps to, never how many
   RNG values the seeded stream consumes. */
function weightedIndex(rows, u){
  const total=rows.reduce((a,r)=>a+Math.max(0,+r.weight||0),0);
  if(total<=0) return 0;
  let acc=0, target=Math.max(0,Math.min(1-Number.EPSILON,u))*total;
  for(let i=0;i<rows.length;i++){ acc+=Math.max(0,+rows[i].weight||0); if(target<acc) return i; }
  return rows.length-1;
}
function weightedCount(rows,u){
  const row=rows[weightedIndex(rows,u)];
  return Math.max(0,Math.min(3,Math.round(+row.count||0)));
}

/* makeFish — one SCORE fish entity. rng order is unchanged: an old decoy-only
   value roll is still consumed when applicable, then the old offset roll now
   also chooses the presentation multiplier, followed by spawn side + swim(3),
   driftDir, driftMag, wander(3), bob(3), z(4). */
function makeFish(rng, L, t0, share){
  const band = bandOf(L);
  const depth = layerDepthY(L);
  /* `share` decides only whether this layer currently has exposed pool to
     arrange toward the hook. It must never rewrite the fish's visible value. */
  const afford = Math.max(0, share||0);
  const favored = afford > 0.08;
  /* Preserve the old decoy branch's extra roll so the stream shape stays fixed. */
  if(!favored) rng();                                  // legacy value roll
  const appearanceU = rng();                        // formerly offset magnitude only
  const showRows = fishAppearanceForBand(band);
  const value = +showRows[weightedIndex(showRows, appearanceU)].mult||0.5;
  /* Spawn position is presentation-independent from the pool. Every SCORE fish
     uses the same broad layer range; budget may never park payable fish nearer
     the rope during SINK. */
  const offRange=SCORE_SPAWN_X;
  const off = offRange[0] + (offRange[1]-offRange[0])*appearanceU;
  const spawnSide=rng()<0.5?-1:1;
  const f = {
    kind:'fish', type:'SCORE', L, band, depth, spawnT:t0, favored,
    curK:0.35,
    pub:value, score:value*SCALE_SCORE, arch:archetypeOf(value),
    spawnX: ANCHOR_X + spawnSide*off, spawnSide,
    /* Wide but bounded directional patrol. `swimSpeed` is seeded per fish, so
       individuals cruise at visibly different speeds without per-frame RNG. */
    swimAmp:rand(rng,34,72),
    swimSpeed: rand(rng, 32, 68),
    swimPhase: rand(rng, 0, 6.2831),
    caught:false, escaped:false, multApplied:1,
  };
  /* The old linear anti-camping drift permanently expelled upper fish, which
     bottom-packed PULL. Safe carry now protects the sealed value, so SCORE fish
     use fast bounded swimming instead. Preserve legacy decoy RNG consumption. */
  if(!favored){ rng(); rng(); }
  f.drift=0;
  // low-amplitude habitat drift + vertical bob; neither may reverse the heading
  f.wander=rand(rng,5,18);
  f.wanderFreq = rand(rng, 0.10, 0.30);
  f.wanderPhase = rand(rng, 0, 6.2831);
  f.bobAmp = rand(rng, 3, 9);
  f.bobFreq = rand(rng, 0.35, 0.85);
  f.bobPhase = rand(rng, 0, 6.2831);
  // z is a FOREGROUND visual breath only (no catch gate — v2.1 two-family z)
  f.z0 = rand(rng, -60, 90);
  f.zAmp = rand(rng, 6, 24);
  f.zFreq = rand(rng, 0.06, 0.20);
  f.zPhase = rand(rng, 0, 6.2831);
  /* Budget selection uses this seed-derived rank instead of depth order, so
     catches and misses remain distributed from top to bottom. No extra RNG. */
  f.routeRank=(f.swimPhase/6.2831 + L*0.61803398875)%1;
  return f;
}

/* makeScatter — the golden jackpot fish. Small, quick, hugs the focal
   plane (narrow z) so landing it is aim + timing, not pure luck — but it
   drifts away FAST (you chase it, you don't camp it).
   rng order: spawnX, swim(3), driftDir, driftMag, bob(3), z(2). */
export function makeScatter(rng, L, t0){
  const depth = layerDepthY(L);
  const f = {
    kind:'fish', type:'SCATTER', L, band:bandOf(L), depth, spawnT:t0,
    pub:0, score:0, arch:'scatter',
    spawnX: layerSpawnX(rng),
    swimAmp: rand(rng, 28, 56),
    swimSpeed: rand(rng, 62, 96),
    swimPhase: rand(rng, 0, 6.2831),
    caught:false, escaped:false, multApplied:1,
    wander:0, wanderFreq:0.2, wanderPhase:0,
  };
  f.drift = (rng()<0.5?-1:1) * rand(rng, SCATTER_DRIFT[0], SCATTER_DRIFT[1]);
  f.bobAmp = rand(rng, 4, 10); f.bobFreq = rand(rng, 0.5, 1.0); f.bobPhase = rand(rng, 0, 6.2831);
  f.z0 = rand(rng, -40, 60);
  f.zAmp = rand(rng, 4, 16);
  f.zFreq = 0.1; f.zPhase = 0;
  return f;
}

/* makePrize — the shark that charged and MISSED. Same silhouette (the render
   turns it gold), but now it is the fattest ordinary catch in the water and it
   moves like it wants to leave: PRIZE_SPEED× the swim excursion and rate plus a
   hard drift. Risk and reward are the same animal (hao 2026-07-19).
   rng order: value, swimAmp, swimSpeed, swimPhase, driftDir, driftMag, bob(3). */
export function makePrize(rng, shark, t0){
  const x = SHARK_PRIZE_MIN*Math.pow(SHARK_PRIZE_MAX/SHARK_PRIZE_MIN, rng());
  const f = {
    kind:'fish', type:'PRIZE', L:shark.L, band:bandOf(shark.L), depth:shark.depth, spawnT:t0,
    pub:x, score:x*SCALE_SCORE, arch:'prize',
    spawnX: shark.center,
    swimAmp: rand(rng, 30, 62)*PRIZE_SPEED,
    swimSpeed: rand(rng, 58, 90)*PRIZE_SPEED,
    swimPhase: rand(rng, 0, 6.2831),
    caught:false, escaped:false, multApplied:1,
    wander:0, wanderFreq:0.2, wanderPhase:0,
  };
  f.drift = (rng()<0.5?-1:1) * rand(rng, FISH_DRIFT[0], FISH_DRIFT[1]) * PRIZE_SPEED;
  f.bobAmp = rand(rng, 4, 12); f.bobFreq = rand(rng, 0.5, 1.1); f.bobPhase = rand(rng, 0, 6.2831);
  f.z0 = 0; f.zAmp = 0; f.zFreq = 0.1; f.zPhase = 0;
  return f;
}

/* makeBubble — one mult bubble. Drifts gently with the current, bobs in
   place, sits nearer the focal plane than fish (poppable by aim).
   rng order: tierRoll, value, spawnX, drift(3), bob(3), z(2). */
function makeBubble(rng, L, t0){
  const band = bandOf(L);
  const u = rng();
  const showRows=bubbleAppearanceForBand(band);
  const tier=weightedIndex(showRows,u);
  const {min,max} = showRows[tier]||BUBBLE_TIERS[tier];
  const rawMult = min*Math.pow(max/min, rng());     // log-uniform
  /* Quantise to the same precision the bubble prints, so ×N itself is also an
     exact promise: two decimals below ×10, whole numbers from ×10 upward. */
  const mult = rawMult>=10 ? Math.round(rawMult) : Math.round(rawMult*100)/100;
  const b = {
    kind:'bubble', L, band, depth: layerDepthY(L), spawnT:t0,
    tier, mult,
    spawnX: layerSpawnX(rng),
    driftAmp:rand(rng,36,80),
    driftFreq: rand(rng, 0.15, 0.45),
    driftPhase: rand(rng, 0, 6.2831),
    bobAmp: rand(rng, 5, 14),
    bobFreq: rand(rng, 0.3, 0.7),
    bobPhase: rand(rng, 0, 6.2831),
    popped:false, missed:false,
  };
  b.drift = (rng()<0.5?-1:1) * rand(rng, BUBBLE_DRIFT[0], BUBBLE_DRIFT[1]) * (1+BUBBLE_DRIFT_TIER*tier);
  b.z0 = rand(rng, -40, 80);
  b.zAmp = rand(rng, 4, 20);
  b.routeRank=(b.driftPhase/6.2831 + L*0.38196601125)%1;
  return b;
}

/* makeShark — one shark entity. Patrols its segment on a closed-form path.
   Persists after a GRAZE (stays a hazard on later descents / the pull). */
function makeShark(rng, L, t0){
  const depth = layerDepthY(L);
  return {
    kind:'shark', L, depth, spawnT:t0,
    center: ANCHOR_X + rand(rng, -120, 120),
    amp: rand(rng, 60, 150),              // wide patrol → sweeps across the line
    freq: rand(rng, 0.35, 0.85),
    phase: rand(rng, 0, 6.2831),
    resolved:false,                       // set true only on a HIT (removed)
    grazes:0,
  };
}

/* shark spawn probability is now the flat scalar SHARK_SPAWN_P (1/8) imported
   from world.js (v2.4, hao: 鯊魚在 SINK 每一段都為 1/8) — every segment, no
   safe shallows. See its definition in world.js for the full rationale. */

/* spawnLayer — draw everything that appears on entering segment L, in FIXED
   rng order (see round.js consume-order block):
     1 fishCount → per fish makeFish
     2 bubbleCount → per bubble makeBubble
     3 scatterCount → per scatter makeScatter
     4 shark presence → [if present] makeShark
   Returns {fish, bubbles, sharks} (the scatter rides in `fish`). */
/* --- POOL STEERING (v2.2) --------------------------------------------
   `budget` is what is left of the round's drawn pool, in ×-of-stake. It
   decides two things and nothing else:
     · how much VALUE this segment puts in the water  (offer)
     · whether that value is placed where the hook can REACH it (favored)
   With budget left the sea is generous; with the pool spent every fish is a
   decoy that drifts wide — 看得到、吃不到 — and the sharks stop bluffing. */
/* THE POOL IS PAID OUT WITH DEPTH. A flat per-segment share dumped the whole
   budget in the shallows, so the best play was "grab it at L3 and leave" —
   the exact opposite of the game. This curve is the cumulative share of the
   pool the sea has offered by segment L: shallow water shows you a taste, the
   ×100 monster lives in the ABYSS. */
export function poolExposed(L, LAYERS){
  const k = Math.max(0, Math.min(1, L/(LAYERS*0.62)));   // fully laid out by ~L19
  return Math.min(1, Math.pow(k, 1.30));
}
export const SCORE_SPAWN_X=[44,205]; // pool-independent broad random layer range
export function spawnLayer(rng, L, t0, budget){
  const fish=[], bubbles=[], sharks=[];
  const band = bandOf(L);
  const offer = Math.max(0, budget||0);      // what THIS segment may hand over
  /* v2.15 — each band independently maps the existing one-roll count for fish,
     bubbles and scatters into 0/1/2/3. Defaults reproduce the prior mapping.
     A tuned count changes only the per-entity rolls that naturally follow. */
  const density=CFG.spawnDensity[band];
  const n=weightedCount(density.fish,rng());
  for(let i=0;i<n;i++) fish.push(makeFish(rng, L, t0, n>0 ? offer/n : 0));
  const nb=weightedCount(density.bubble,rng());
  for(let i=0;i<nb;i++) bubbles.push(makeBubble(rng, L, t0));
  const ns=weightedCount(density.scatter,rng());
  for(let i=0;i<ns;i++) fish.push(makeScatter(rng, L, t0));
  if(rng() < SHARK_SPAWN_P) sharks.push(makeShark(rng, L, t0));
  return { fish, bubbles, sharks };
}

// --- closed-form positions at sim-time t (directional cruise + slow habitat drift) ---
/* `adjX` remains only for the approach-timed near-miss glide in main-v2;
   caught fish and bubbles never receive a pull-moment positioning correction. */
const ADJ_RAMP = 0.44;
const FOCAL = 540;
function perspectiveScale(z){ return FOCAL/(FOCAL+(z||0)); }
function projectedX(x,z){ return ANCHOR_X+(x-ANCHOR_X)*perspectiveScale(z); }
function unprojectedX(x,z){ return ANCHOR_X+(x-ANCHOR_X)/perspectiveScale(z); }
function cruiseSpeed(f){
  /* The fallback keeps an already-running HMR round usable while moving from
     the retired frequency field; newly spawned fish always own `swimSpeed`. */
  if(Number.isFinite(f.swimSpeed)) return f.swimSpeed;
  return Math.max(24,Math.min(120,(f.swimFreq||0.6)*(f.swimAmp||48)*1.7));
}
export function fishCruisePhase(f,t){
  const amp=Math.max(12,f.swimAmp||40);
  return cruiseSpeed(f)*(t-f.spawnT)/amp + (f.swimPhase||0);
}
export function fishTailPhase(f,t){
  return (t-f.spawnT)*(3.5+cruiseSpeed(f)*0.045)+(f.swimPhase||0);
}
function bodyTempo(f){ return 0.70+Math.min(1,cruiseSpeed(f)/100)*0.55; }
export function fishX(f, t, C){
  const life = t - f.spawnT;
  let adj=0;
  if(f.adjX){
    const u = Math.max(0, Math.min(1, (t-(f.adjT||0))/ADJ_RAMP));
    adj = f.adjX * (1 - Math.pow(1-u, 2.4));
  }
  return adj+f.spawnX
       + currentDisp(f.depth, t, C)*(f.curK!=null?f.curK:0.35)  // how much of the water it rides
       + (f.drift||0)*life                                     // steady drift-away (anti-camping)
       + f.swimAmp*Math.sin(fishCruisePhase(f,t))               // one continuous heading, eased turn at each end
       + (f.wander||0)*0.22*Math.sin((f.wanderFreq||0.2)*life + (f.wanderPhase||0)); // subtle habitat drift only
}
// vertical bob so fish aren't pinned to a rigid horizontal line (render/cosmetic; catch uses f.depth)
export function fishY(f, t){
  return f.depth+(f.bobAmp||0)*Math.sin((f.bobFreq||0.5)*(t-f.spawnT)*bodyTempo(f)+(f.bobPhase||0));
}
// 2.5D depth-into-screen at time t. z=0 is the line's focal plane; the catch Z-gate
// and the render's perspective scale/haze both read this.
export function fishZ(f, t){
  return (f.z0||0)+(f.zAmp||0)*Math.sin((f.zFreq||0.1)*(t-f.spawnT)*bodyTempo(f)+(f.zPhase||0));
}
export function fishCatchRadius(f,t){
  /* FISH_BODY_SIZE drives the rendered nose/body reach. Use the full projected
     silhouette plus the same 14px hook reach as bubbles. The previous 68%+8
     circle excluded visible heads/tails, most noticeably on giant/PRIZE fish. */
  const body=(FISH_BODY_SIZE[f.arch]||26)*perspectiveScale(fishZ(f,t));
  return Math.max(CATCH_RADIUS,Math.min(96,body+14));
}
export function fishProjectedX(f,t,C){ return projectedX(fishX(f,t,C),fishZ(f,t)); }
export function fishWorldXAtScreen(f,t,x){ return unprojectedX(x,fishZ(f,t)); }
export function sharkX(s, t){
  return s.center + s.amp*Math.sin(s.freq*(t-s.spawnT)+s.phase)
       + s.amp*0.22*Math.sin(s.freq*1.9*(t-s.spawnT)+s.phase*1.4);   // slight prowl irregularity
}
// bubble closed-form position (gentle current drift + slow bob; z for the pop gate)
export function bubbleX(b, t, C){
  const life = t - b.spawnT;
  const motionLife=life*BUBBLE_MOTION_SPEED;
  let adj=0;
  if(b.adjX){
    const u=Math.max(0,Math.min(1,(t-(b.adjT||0))/ADJ_RAMP));
    adj=b.adjX*(1-Math.pow(1-u,2.4));
  }
  return adj+b.spawnX
       + currentDisp(b.depth, t, C)*0.50
       + (b.drift||0)*life
       + b.driftAmp*Math.sin(b.driftFreq*motionLife + b.driftPhase);
}
export function bubbleY(b, t){
  return b.depth+b.bobAmp*Math.sin(b.bobFreq*(t-b.spawnT)*BUBBLE_MOTION_SPEED+b.bobPhase);
}
export function bubbleZ(b, t){
  return (b.z0||0)+(b.zAmp||0)*Math.sin(0.12*(t-b.spawnT)*BUBBLE_MOTION_SPEED+(b.bobPhase||0));
}
export function bubblePopRadius(b,t){
  /* BUBBLE_BODY_RADIUS is already the visible on-screen radius (unlike fish
     archetype length). Contact therefore starts at the full projected rim,
     plus the hook/barb's visible reach. The old 72%+7 formula put part of the
     drawn glass circle outside its own hit area. */
  const body=(BUBBLE_BODY_RADIUS[b.tier]||24)*perspectiveScale(bubbleZ(b,t));
  return Math.max(POP_RADIUS,Math.min(78,body+14));
}
export function bubbleProjectedX(b,t,C){ return projectedX(bubbleX(b,t,C),bubbleZ(b,t)); }
export function bubbleWorldXAtScreen(b,t,x){ return unprojectedX(x,bubbleZ(b,t)); }
