import PRODUCTION_RECORD from '../../production-config.json' with { type: 'json' };

/* ============================================================
   DEEPER v2 — WORLD: constants + deterministic geometry.

   The current core is OUTCOME-FIRST: a seeded sealed pool owns payout, while
   deterministic geometry performs it. Everything here is a PURE function of
   (seeded params, sim-time) — no DOM, no Math.random, no wall-clock — so the
   game and headless sim evaluate the SAME world and presentation.

   v2.1 (2026-07-18, DESIGN-V2 §8): 4 bands × 18 segments with a metric
   depth skin, probabilistic per-segment fee from REEF down, per-fish
   bubble multiplication, WHALE scatter jackpot lane.
   v2.21 keeps fish/bubble SPAWN weights independent, makes sealed-pool rows
   anonymous, exposes the missed-shark PRIZE interval, and gives each depth band
   independent per-segment density AND visible multiplier weights. Caught values
   remain WYSIWYG; beasts are selected only after settlement from the sealed pool
   budget.
   ============================================================ */
export const BP = 10000;                 // ×1.00 in basis points

// --- arena (logical world units; matches the 540-wide portrait column) ---
export const WORLD_W = 540;
export const ANCHOR_X = 270;             // where the line meets the surface (rod tip)
export const SURFACE_Y = 0;

/* --- DEPTH STRUCTURE (v2.1): 4 bands × 18 segments ------------------
   Segments are the decision/spawn/fee unit (L = 1..18; formerly "layers").
   Displayed depth is METRIC: SEG_M[L] = meters at the BOTTOM of segment L —
   SHALLOWS 0–50m (3) / REEF 50–200m (4) / DEEPER 200–500m (5) / ABYSS
   500–1500m+ (6). World-px per segment stays uniform: the metric ruler is
   the narrative skin over a regular decision grid. */
export const BANDS = ['SHALLOWS','REEF','DEEPER','ABYSS'];
const DEFAULT_DEPTH_BANDS = { SHALLOWS:3, REEF:6, DEEPER:9, ABYSS:12 };
const DEFAULT_SEG_M = [0, 10,25,50, 75,95,120,145,170,200, 230,260,295,330,365,400,435,465,500,
                       560,620,690,760,840,920,1010,1100,1200,1300,1400,1500];
const BAND_METER_RANGE = {
  SHALLOWS:[0,50], REEF:[50,200], DEEPER:[200,500], ABYSS:[500,1500],
};
export let LAYERS = 30;                  // default: 3/6/9/12 per band
export const LAYER_DEPTH = 96;           // world-units of depth between ledges
export let SEG_M = DEFAULT_SEG_M.slice();
export let DEPTH_BANDS = {...DEFAULT_DEPTH_BANDS};
export let BAND_ENDS = { SHALLOWS:3, REEF:9, DEEPER:18, ABYSS:30 };
export let BAND_EDGES = [0, 3, 9, 18, 30];
export let BAND_INFO = [
  { name:'SHALLOWS', range:'0-50m',    L:1,  col:'#6FE3E1', segments:3 },
  { name:'REEF',     range:'50-200m',  L:4,  col:'#45B89A', segments:6 },
  { name:'DEEPER',   range:'200-500m', L:10, col:'#5B8FC7', segments:9 },
  { name:'ABYSS',    range:'500m+',    L:19, col:'#8A5CC2', segments:12 },
];
function normaliseDepthBands(raw){
  const out={};
  for(const b of BANDS){
    const n=Math.round(+raw?.[b]);
    out[b]=Math.max(1,Math.min(60,Number.isFinite(n)?n:DEFAULT_DEPTH_BANDS[b]));
  }
  return out;
}
function buildSegMeters(depthBands){
  if(BANDS.every(b=>depthBands[b]===DEFAULT_DEPTH_BANDS[b])) return DEFAULT_SEG_M.slice();
  const meters=[0];
  for(const b of BANDS){
    const [from,to]=BAND_METER_RANGE[b], n=depthBands[b];
    for(let i=1;i<=n;i++) meters.push(Math.round(from+(to-from)*(i/n)));
  }
  return meters;
}
function rebuildDepthStructure(){
  DEPTH_BANDS=normaliseDepthBands(CFG?.depthBands);
  BAND_EDGES=[0];
  BAND_ENDS={};
  let total=0;
  for(const b of BANDS){ total+=DEPTH_BANDS[b]; BAND_ENDS[b]=total; BAND_EDGES.push(total); }
  LAYERS=total;
  SEG_M=buildSegMeters(DEPTH_BANDS);
  BAND_INFO=BANDS.map((name,i)=>{
    const start=BAND_EDGES[i], end=BAND_EDGES[i+1], [m0,m1]=BAND_METER_RANGE[name];
    const range=name==='ABYSS' ? `${m0}m+` : `${m0}-${m1}m`;
    return { name, range, L:start+1, col:['#6FE3E1','#45B89A','#5B8FC7','#8A5CC2'][i], segments:end-start };
  });
  CFG.depthBands={...DEPTH_BANDS};
}
export function layerDepthY(L){ return SURFACE_Y + L*LAYER_DEPTH; }
export function bandOf(L){
  if(L<=BAND_ENDS.SHALLOWS) return 'SHALLOWS';
  if(L<=BAND_ENDS.REEF) return 'REEF';
  if(L<=BAND_ENDS.DEEPER) return 'DEEPER';
  return 'ABYSS';
}
// world depth (px) → display meters, piecewise-linear across segment bounds
export function depthMeters(px){
  const seg = Math.max(0, Math.min(LAYERS-1e-9, px/LAYER_DEPTH));
  const i = Math.floor(seg), f = seg - i;
  return SEG_M[i] + (SEG_M[Math.min(LAYERS, i+1)] - SEG_M[i])*f;
}

/* --- ~~PROBABILISTIC SEGMENT FEE~~ (v2.1; replaced the fixed extCost, retired
   in v2.2, and superseded by THE ANTE in v2.3) -------------------------
   Kept for the lineage — the shape below is the ancestor of the ante:
   entering ANY segment consumed exactly ONE roll (hit or miss, so the rng
   stream stays regular for provably-fair replay); SHALLOWS p=0 never charged;
   from REEF down each descent could cost FEE_AMT×stake. "Descending has a
   price, but an uncertain one" — the per-segment micro-tension.
   What died was the DIRECTION of the money, not the cadence. */
/* ~~v2.2 — FEES ARE OFF.~~ The pool table already carries the entire house edge
   (Σ rtp = 96%), so CHARGING again on the way down did two bad things: it
   broke the guarantee (you paid more than the pool was drawn against) and it
   taxed the one behaviour the game wants — going deeper. hao had already
   called it out from the felt side: "在 SINK 時還會額外加注".
   The roll was KEPT (one per segment, p=0) so the mechanism could come back if
   a future model needed it. It has — as a different animal. See THE ANTE. */

/* --- THE ANTE (v2.3, hao 2026-07-19) --------------------------------
   "SINK 從 REEF 開始每一段都固定有 1/3 的概率需要再次加注 —— 藉此提高玩家的
    投注頻率, 加多水池預算."

   This is NOT the retired fee wearing a new hat. The distinction is the whole
   design and it is worth being blunt about:

     FEE  (retired) — stake leaves, the pool does not grow. Pure tax on depth.
                      RTP falls, the guarantee breaks, deep play is punished.
     ANTE (this)    — stake leaves AND buys its own pool draw. The player is
                      betting again, not being charged. RTP stays 97% because
                      every unit of spend is matched by a 97%-expectation draw;
                      what rises is HANDLE, which is what the operator earns on.

   Both of §5.5's objections dissolve: the guarantee holds (you paid for the
   extra pool you got), and depth is no longer taxed (it is bet on).

   ⚠ THE ANTE MUST DRAW ITS OWN MULTIPLIER — never scale the round's existing
   poolMult. Scaling would make the ante's EV depend on what this round already
   is, and the omen (which §11 P5v2b moves into the descent) would tell a bot
   exactly when topping up is +EV. That is precisely the timing exploit the
   POOL model was built to kill. An independent draw is worth 97% always, so
   reading the water can never make the ante a better or worse bet.

   Charged automatically — no accept/decline prompt (hao). A prompt would be a
   choice, and a choice informed by ANY pool tell is an edge; automatic is both
   uninterruptible drama and un-exploitable.

   v2.3b — EVERY segment, not one in three (hao: 改成每一小段都固定加注好了, 就不
   用特別表演了). A 1/3 chance needed to announce itself: a surprise charge has to
   be explained or it reads as theft, so it cost a word, a sound and a shake on
   every hit. Made certain, it stops being an event and becomes the tariff of
   going deeper — the player learns it once and then just feels the depth costing
   money. The show budget goes back to the fish, which is where it belongs.
   The roll is STILL consumed (p=1 always hits) so the stream order survives and
   a future model can dial it back to a probability without another re-freeze. */
/* v2.3c — the ante is a QUARTER stake, not a whole one (hao). At ×1 the pool
   grew as fast as the spend did, and that flattened the game: every stop point
   returned the same 95–96%, the perfect-foresight bot matched a human at 95%,
   and "how deep do I dare" — the decision the whole design is built on — paid
   the same everywhere. A quarter keeps the per-segment tariff (and the handle
   it earns) while letting poolExposed's depth ramp stay the dominant term.
   It also keeps a dive to the floor affordable: ~8 stakes instead of ~28.
   v2.4c — ANTE_P / ANTE_AMT are now derived from CFG (see THE ECONOMIC CONFIG
   below); defaults are unchanged (REEF-down, 0.25×). */

/* ~~v2.3c THE BEAST'S DOOR (BEAST_POOL_MIN)~~ — retired in v2.4. Deciding the
   beast by how big the STACKED pool got made antes summon animals, and no single
   threshold survived that: too low and every ante-fed round became a beast (1/2
   @L20), too high and a lucky player never met one. v2.4 moves the beast onto
   its own POOL_TABLE rows (below), so frequency is a draw probability again, set
   directly and immune to how many antes stacked. */

// --- sim stepping (live render interpolates; headless sim samples at action times) ---
export const STEP_HZ = 60;
export const DT = 1/STEP_HZ;
export const DWELL = 1.15;                // seconds a HOLD occupies (sim time advances per segment)

/* --- CURRENT FIELD — closed-form horizontal displacement (world-units) at a
   given depth & time. FOUR incommensurate waves (slow swell + medium + drift +
   fast ripple) so the flow reads ORGANIC, not a metronomic sine — this is what
   kills the "stiff" sway. Deterministic in (depth,t,C). */
export const CURRENT_AMP = 54;           // peak sideways displacement
export function currentDisp(depth, t, C){
  return CURRENT_AMP * (
    0.46*Math.sin(depth*0.0110 + t*0.62 + C.p0) +   // medium
    0.26*Math.sin(depth*0.0190 - t*0.46 + C.p1) +   // counter-medium
    0.17*Math.sin(depth*0.0068 + t*0.27 + C.p2) +   // slow large swell
    0.11*Math.sin(depth*0.0360 + t*1.06 + C.p3)     // fast ripple
  );
}

/* --- LINE GEOMETRY — the taut rope from the surface anchor to the hook, bowed
   by the current AND by the player's steer. x of the line at depth d (0..hookDepth):
   anchored at the surface, displaced by (current + steerX) tapering to full at the
   hook. steerX is the player's lateral aim (gesture); 0 = pure current (headless sim).
   Fish are caught by their horizontal distance to THIS at their own depth. */
export function lineXAtDepth(d, t, hookDepth, C, steerX){
  if(hookDepth<=0) return ANCHOR_X + (steerX||0);
  const frac = Math.max(0, Math.min(1, d/hookDepth));
  return ANCHOR_X + (currentDisp(d, t, C) + (steerX||0)) * frac;
}
export function hookX(hookDepth, t, C, steerX){   // the hook end of the line
  return lineXAtDepth(hookDepth, t, hookDepth, C, steerX);
}

// --- CATCH — pure 2D corridor (v2.1 hao): a fish/bubble/scatter is taken
//     only if it naturally intersects the rising hook's future corridor.
//     There is NO z-gate: every playable entity lives on the FOREGROUND
//     layer (labels always shown, always hookable — what you see is what
//     you get); z is a small visual-layering breath only. The murky far
//     school is a separate NON-PLAYABLE decorative family in the render. ---
/* v2.1f (hao 2026-07-19: 「應該是鉤子碰到才能拉」) — catching is no longer a
   wide corridor swept along the whole line at one instant. The HOOK has to
   actually touch the fish AS IT REELS PAST that depth (round.js evaluates each
   entity at its own t_pass). Far fewer land, so each is worth far more, and
   the ones that slip by the hook-width are real near-misses you watched. */
export const CATCH_RADIUS = 26;          // minimum hook reach; visible fish body extends it in entities.js
// minimum bubble reach; large visible spheres extend it so contact stays WYSIWYG
export const POP_RADIUS = 20;

/* --- SHARKS (v2.4, hao spec: 鯊魚在 SINK 每一段都為 1/8 的概率出現, 有 20% 會咬斷) ---
   One clean risk per segment. Entering any segment has a 1/8 chance a shark
   shows; a shark that shows bites through 20% of the time = a LINE CUT. Net
   1/8 × 20% = 2.5% of segments cut.

   v2.18 — a cut is a pool-independent PERFORMANCE STOP, not a wipe. Nothing is
   paid on that broken line; the complete current budget + incoming safe-bank
   rolls forward. That lets a true 2.5%/segment show coexist with a 97% table.
   The tension is the interruption and delayed payout, never destroyed value.
   A shark that does NOT bite becomes the PRIZE (the fattest catch in the water).

   ~~Retired: SHARK_HIT_P/RAMP depth ramp, geometry-gated contact.~~ Each segment
   is its own independent 1/8·20% event, sealed when the shark appears and then
   played out visually. Flat — one honest number, not a depth curve.
   v2.4c — SHARK_SPAWN_P / SHARK_BITE_P now derive from CFG (below). */
export const SHARK_CONTACT_DIST = 40;    // visual only: how close it sweeps before the verdict
/* The deterministic reel prediction travels at REEL_SPEED world-px/sec and
   evaluates each entity when the hook reaches its depth (t_pass). Live playback
   may pace empty stretches differently, but route-committed fish hold a narrow
   stable ribbon, so the visible contact remains genuine and timing-invariant. */
export const REEL_SPEED = 420;
/* PULL WINDUP — the strike is not instant: from the player's pull moment the
   line tenses for PULL_WINDUP seconds BEFORE the catch geometry is evaluated.
   Deterministic (input + constant), visible (the tension beat), and it blunts
   frame-perfect corridor sniping: what you see when you commit is ≈, not =. */
/* v2.1f note (hao 2026-07-19): windup was briefly raised to 1.05 to fight
   sniping — WRONG TOOL. An oracle simply picks its pull moment with the delay
   already accounted for, so a longer windup costs the HUMAN aim and costs the
   bot nothing. Back to 0.65, which is a feel/show value (the tension beat). */
export const PULL_WINDUP = 0.65;

/* ============================================================
   THE POOL (v2.12 anonymous sealed result) — OUTCOME FIRST.

   One seeded opening draw picks an exact or ranged multiplier without naming
   any fish or beast. Every ante independently buys another complete pool.
   Fish/bubbles perform the budget; a beast may replay a sufficiently large
   final payment, but never owns or changes any part of it.

   RTP stays a property of this table, not of depth, reflexes or show casting.
   The frozen authority is docs/ECONOMY-V2.md, updated only on a clean 200k
   re-green. */
/* ════════════════ SHARED CONFIG (economic + presentation) ════════════════
   Every tunable economic knob lives in ONE mutable object so the game, the CLI
   sim, and the browser tuner all read the SAME source. `applyCfg(patch)` merges
   a change and `rebuildCfg()` re-derives the tables; the exported bindings are
   `let`, so via ES-module live bindings every importer sees the new value with
   no code change. Defaults below == the current v2.15 line, so an untouched load
   reproduces the frozen numbers exactly. Change here = re-open the sim gate.

   ⚠ TUNING values under active calibration — the frozen authority is
   docs/ECONOMY-V2.md, updated only on a clean 200k re-green.

   Exact frozen values and 200k evidence live in docs/ECONOMY-V2.md §0″. */
export const CFG = {
  depthBands: { SHALLOWS:10, REEF:10, DEEPER:10, ABYSS:20 },
  /* v2.12 generic opening distribution. Rows describe only a sealed multiplier
     result; they do not name or select any fish/beast presentation. */
  poolExact: [
    { mult:0, p:0.2747179487179487 },
  ],
  /* Uniform range rows use the same opening roll for both row selection and
     within-row position. Probabilities already encode their RTP contribution;
     presentation never multiplies or discounts them. */
  poolRange: [
    { p:0.3000000000000000, min:0,   max:0.3 },
    { p:0.1846153846153846, min:0.3, max:1   },
    { p:0.1500000000000000, min:1,   max:3   },
    { p:0.0675000000000000, min:3,   max:5   },
    { p:0.0200000000000000, min:5,   max:10  },
    { p:0.0025000000000000, min:10,  max:30  },
    { p:0.0006666666666667, min:30,  max:60  },
  ],
  /* Carry-collection ladder. The one existing post-PULL show roll evaluates
     eligible tiers from LIVYATAN → MOSASAUR → GREAT WHITE. A missed higher tier
     falls through to the next rule. A held beast releases residual carry but
     never creates or discounts value outside the sealed pool. */
  beastShowRules: [
    { tier:0, min:10, p:0.30 },
    { tier:1, min:18, p:0.40 },
    { tier:2, min:35, p:0.50 },
  ],
  /* PULL-only presentation chain. The first branch depends on whether the hook
     actually caught a gold fish; later stages are pure show upgrades. */
  goldFishTeaseP: 0.50,
  noGoldFishTeaseP: 0,
  teaseToGreatWhiteP: 0.50,
  greatWhiteToMosasaurP: 0.50,
  /* Every ante buys its own complete 96.5% sealed pool. It never
     promotes the opening row into a beast and is never exposed to beast loss. */
  antePool: [
    { mult:0,   p:0.1504020618556701 },
    { mult:0.5, p:0.3979381443298969 },
    { mult:1,   p:0.2984536082474227 },
    { mult:2,   p:0.0994845360824742 },
    { mult:5,   p:0.0537216494845361 },
  ],
  anteAmt:   0.20,        // ×stake charged every segment from REEF down
  anteFrom:  'REEF',      // first band that antes (SHALLOWS is the free look)
  sharkEnabled: true,     // SINK hazard master switch
  sharkSpawnP: 1/8,       // shark appears per segment (EVERY segment)
  sharkBiteP:  0.20,      // of appearances → line cut (forced early pull)
  /* A shark that misses becomes one fast WYSIWYG PRIZE fish. The existing first
     makePrize roll samples this log-uniform interval; no RNG is added. */
  sharkPrizeMin: 3,
  sharkPrizeMax: 10,
  /* Legacy global appearance mix. Kept only so old operator records and focused
     diagnostic patches can migrate without losing intent; production spawning
     reads `appearanceByBand` below. */
  fishAppearance: [
    { mult:0.2, weight:0 },
    { mult:0.5, weight:40 },
    { mult:1,   weight:30 },
    { mult:1.5, weight:0 },
    { mult:2,   weight:20 },
    { mult:3,   weight:10 },
    { mult:5,   weight:0 },
  ],
  bubbleAppearance: [
    { min:2,  max:4,   weight:50.0 },
    { min:4,  max:8,   weight:33.0 },
    { min:8,  max:20,  weight:14.0 },
    { min:20, max:50,  weight:2.5 },
    { min:50, max:100, weight:0.5 },
  ],
  /* v2.21 depth-banded presentation value. Each band's fish and bubble rows
     use the SAME existing tier roll, so the visible stakes rise with depth
     without adding RNG or coupling presentation back to the sealed RTP row.
     Weighted means progress approximately:
       fish   ×0.54 → ×0.86 → ×1.20 → ×1.66
       bubble ×3.39 → ×4.52 → ×6.76 → ×8.92 */
  appearanceByBand: {
    SHALLOWS: {
      fish: [
        {mult:0.2,weight:20}, {mult:0.5,weight:60}, {mult:1,weight:20},
        {mult:1.5,weight:0}, {mult:2,weight:0}, {mult:3,weight:0}, {mult:5,weight:0},
      ],
      bubble: [
        {min:2,max:4,weight:85}, {min:4,max:8,weight:14}, {min:8,max:20,weight:1},
        {min:20,max:50,weight:0}, {min:50,max:100,weight:0},
      ],
    },
    REEF: {
      fish: [
        {mult:0.2,weight:5}, {mult:0.5,weight:40}, {mult:1,weight:40},
        {mult:1.5,weight:10}, {mult:2,weight:5}, {mult:3,weight:0}, {mult:5,weight:0},
      ],
      bubble: [
        {min:2,max:4,weight:68}, {min:4,max:8,weight:25}, {min:8,max:20,weight:6},
        {min:20,max:50,weight:1}, {min:50,max:100,weight:0},
      ],
    },
    DEEPER: {
      fish: [
        {mult:0.2,weight:0}, {mult:0.5,weight:25}, {mult:1,weight:40},
        {mult:1.5,weight:15}, {mult:2,weight:15}, {mult:3,weight:5}, {mult:5,weight:0},
      ],
      bubble: [
        {min:2,max:4,weight:48}, {min:4,max:8,weight:33}, {min:8,max:20,weight:15},
        {min:20,max:50,weight:3.5}, {min:50,max:100,weight:0.5},
      ],
    },
    ABYSS: {
      fish: [
        {mult:0.2,weight:0}, {mult:0.5,weight:10}, {mult:1,weight:30},
        {mult:1.5,weight:20}, {mult:2,weight:25}, {mult:3,weight:12}, {mult:5,weight:3},
      ],
      bubble: [
        {min:2,max:4,weight:35}, {min:4,max:8,weight:35}, {min:8,max:20,weight:22},
        {min:20,max:50,weight:7}, {min:50,max:100,weight:1},
      ],
    },
  },
  /* v2.15 per-segment presentation density. Every band and family owns an
     independent 0/1/2/3 count distribution. Each family reuses its existing
     single count/presence roll; defaults preserve the prior seeded mapping. */
  spawnDensity: {
    SHALLOWS: {
      fish:    [{count:0,weight:0},     {count:1,weight:50},   {count:2,weight:50},   {count:3,weight:0}],
      bubble:  [{count:0,weight:75},    {count:1,weight:23},   {count:2,weight:2},    {count:3,weight:0}],
      scatter: [{count:0,weight:99.43}, {count:1,weight:0.57}, {count:2,weight:0},    {count:3,weight:0}],
    },
    REEF: {
      fish:    [{count:0,weight:0},    {count:1,weight:50},  {count:2,weight:50},  {count:3,weight:0}],
      bubble:  [{count:0,weight:72},   {count:1,weight:26},  {count:2,weight:2},   {count:3,weight:0}],
      scatter: [{count:0,weight:98.6}, {count:1,weight:1.4}, {count:2,weight:0},   {count:3,weight:0}],
    },
    DEEPER: {
      fish:    [{count:0,weight:0},     {count:1,weight:50},   {count:2,weight:50},   {count:3,weight:0}],
      bubble:  [{count:0,weight:70},    {count:1,weight:27},   {count:2,weight:3},    {count:3,weight:0}],
      scatter: [{count:0,weight:97.45}, {count:1,weight:2.55}, {count:2,weight:0},    {count:3,weight:0}],
    },
    ABYSS: {
      fish:    [{count:0,weight:0},    {count:1,weight:50},  {count:2,weight:50},  {count:3,weight:0}],
      bubble:  [{count:0,weight:67},   {count:1,weight:30},  {count:2,weight:3},   {count:3,weight:0}],
      scatter: [{count:0,weight:96.4}, {count:1,weight:3.6}, {count:2,weight:0},   {count:3,weight:0}],
    },
  },
};

/* production-config.json is the operator-owned shipping source. The literal
   above remains a readable fallback, while replacing one JSON file updates the
   game, tuner defaults, CLI simulation, and the single-file Pages build. */
if(PRODUCTION_RECORD?.schema===1 && PRODUCTION_RECORD.cfg
  && typeof PRODUCTION_RECORD.cfg==='object'){
  for(const key of Object.keys(CFG)){
    if(PRODUCTION_RECORD.cfg[key]!==undefined){
      CFG[key]=structuredClone(PRODUCTION_RECORD.cfg[key]);
    }
  }
}

/* derived, rebuilt from CFG — all `let` so live bindings update on retune */
export let BEAST_SHOW_FROM, BEAST_SHOW_P, BEAST_SHOW_RULES, BEAST_TIER_NAME;
export let GOLD_FISH_TEASE_P, NO_GOLD_FISH_TEASE_P, TEASE_TO_GREAT_WHITE_P, GREAT_WHITE_TO_MOSA_P;
export let ANTE_AMT, ANTE_P, SHARK_SPAWN_P, SHARK_BITE_P, SHARK_PRIZE_MIN, SHARK_PRIZE_MAX;
export let POOL_TABLE, POOL_P, POOL_RTP, ANTE_EV;
let ANTE_TABLE;
export const rangeMeanMult = b => ((+b.min||0) + (+b.max||0)) / 2;
export function fishAppearanceForBand(band){
  const rows=CFG.appearanceByBand?.[band]?.fish;
  return Array.isArray(rows)&&rows.length ? rows : CFG.fishAppearance;
}
export function bubbleAppearanceForBand(band){
  const rows=CFG.appearanceByBand?.[band]?.bubble;
  return Array.isArray(rows)&&rows.length ? rows : CFG.bubbleAppearance;
}

export function rebuildCfg(){
  rebuildDepthStructure();
  // POOL_TABLE is presentation-agnostic: exact rows followed by uniform ranges.
  POOL_TABLE = [
    ...CFG.poolExact.map(r => ({ mult:+r.mult||0, p:+r.p||0 })),
    ...CFG.poolRange.map(r => ({
      mult:rangeMeanMult(r), min:+r.min||0, max:+r.max||0, p:+r.p||0, range:true,
    })),
  ];
  POOL_P  = POOL_TABLE.map(r => r.p);
  POOL_RTP = CFG.poolExact.reduce((a,r)=>a+(+r.p||0)*(+r.mult||0),0)
    + CFG.poolRange.reduce((a,r)=>a+(+r.p||0)*rangeMeanMult(r),0);
  BEAST_TIER_NAME=['GREAT WHITE','MOSASAUR','LIVYATAN'];
  const fallback=[
    {tier:0,min:10,p:0.5},
    {tier:1,min:30,p:0.5},
    {tier:2,min:100,p:0.5},
  ];
  const source=Array.isArray(CFG.beastShowRules)?CFG.beastShowRules:fallback;
  BEAST_SHOW_RULES=fallback.map((d,t)=>{
    const raw=source.find(r=>(+r.tier||0)===t) || source[t] || d;
    const min=+raw.min, p=+raw.p;
    return {
      tier:t,
      min:Math.max(0.5,Number.isFinite(min)?min:d.min),
      p:Math.max(0,Math.min(1,Number.isFinite(p)?p:d.p)),
    };
  });
  const clampP=(value,fallback=0)=>{
    const n=+value;
    return Math.max(0,Math.min(1,Number.isFinite(n)?n:fallback));
  };
  GOLD_FISH_TEASE_P=clampP(CFG.goldFishTeaseP);
  NO_GOLD_FISH_TEASE_P=clampP(CFG.noGoldFishTeaseP);
  TEASE_TO_GREAT_WHITE_P=clampP(CFG.teaseToGreatWhiteP);
  GREAT_WHITE_TO_MOSA_P=clampP(CFG.greatWhiteToMosasaurP);
  /* Compatibility aliases for older diagnostics; the engine uses the full
     per-tier rules below. */
  BEAST_SHOW_FROM=BEAST_SHOW_RULES[0].min;
  BEAST_SHOW_P=BEAST_SHOW_RULES[0].p;
  ANTE_AMT       = CFG.anteAmt;
  const from = BANDS.indexOf(CFG.anteFrom);
  ANTE_P = { SHALLOWS:0, REEF:0, DEEPER:0, ABYSS:0 };
  BANDS.forEach((b,i)=>{ if(i>=from && from>=0) ANTE_P[b]=1; });
  const spawnP=+CFG.sharkSpawnP, biteP=+CFG.sharkBiteP;
  const sharkOn=CFG.sharkEnabled!==false;
  SHARK_SPAWN_P = sharkOn ? Math.max(0,Math.min(1,Number.isFinite(spawnP)?spawnP:1/8)) : 0;
  SHARK_BITE_P  = sharkOn ? Math.max(0,Math.min(1,Number.isFinite(biteP)?biteP:0.20)) : 0;
  const prizeMin=+CFG.sharkPrizeMin, prizeMax=+CFG.sharkPrizeMax;
  SHARK_PRIZE_MIN=Math.max(0.1,Number.isFinite(prizeMin)?prizeMin:3);
  SHARK_PRIZE_MAX=Math.max(SHARK_PRIZE_MIN,Number.isFinite(prizeMax)?prizeMax:10);
  ANTE_TABLE = CFG.antePool.map(r => ({...r}));
  ANTE_EV = ANTE_TABLE.reduce((a,r)=>a+r.p*r.mult, 0);
}
/* merge a patch into CFG and re-derive. The tuner calls this; the game/sim
   never do (they run the defaults). Deep-merges the array fields by replace. */
export function applyCfg(patch){
  /* v2.21 compatibility: an old saved record owns one global mix. Expand it
     across all four bands in memory so operator values still beat new defaults.
     Nothing is written back until the operator explicitly presses Save. */
  if(!patch.appearanceByBand && (Array.isArray(patch.fishAppearance)||Array.isArray(patch.bubbleAppearance))){
    const cloneRows=rows=>rows.map(r=>({...r}));
    patch={...patch,appearanceByBand:Object.fromEntries(BANDS.map(b=>[b,{
      fish:cloneRows(Array.isArray(patch.fishAppearance)
        ? patch.fishAppearance : fishAppearanceForBand(b)),
      bubble:cloneRows(Array.isArray(patch.bubbleAppearance)
        ? patch.bubbleAppearance : bubbleAppearanceForBand(b)),
    }]))};
  }
  for(const k in patch){
    if(Array.isArray(patch[k])) CFG[k] = patch[k].map(x => (typeof x==='object'? {...x} : x));
    else CFG[k] = patch[k];
  }
  rebuildCfg();
}
rebuildCfg();   // initialise the exported bindings at load

/* opening draw → generic multiplier row index */
export function drawPoolIndex(u){
  let acc=0;
  for(let i=0;i<POOL_TABLE.length;i++){ acc+=POOL_P[i]; if(u<acc) return i; }
  return POOL_TABLE.length-1;
}
/* One opening roll resolves BOTH the row and, for a range row, its multiplier
   inside that row's configured uniform range. Conditional on landing in a row,
   `(u-rowStart)/row.p` is itself uniform [0,1), so configurability costs no
   extra RNG and preserves the provably-fair consume order. */
export function drawPoolOutcome(u){
  const uu=Math.max(0,Math.min(1-Number.EPSILON,+u||0));
  let acc=0;
  for(let i=0;i<POOL_TABLE.length;i++){
    const row=POOL_TABLE[i], start=acc; acc+=row.p;
    if(uu<acc || i===POOL_TABLE.length-1){
      if(!row.range) return { index:i, mult:row.mult };
      const local=row.p>0 ? Math.max(0,Math.min(1,(uu-start)/row.p)) : 0;
      return { index:i, mult:row.min+(row.max-row.min)*local };
    }
  }
  const i=POOL_TABLE.length-1, row=POOL_TABLE[i];
  return { index:i, mult:row.mult };
}
export function drawPoolMult(u){ return drawPoolOutcome(u).mult; }
export function beastShowTier(mult){
  const x=Math.max(0,+mult||0);
  for(let t=BEAST_SHOW_RULES.length-1;t>=0;t--){
    if(x>=BEAST_SHOW_RULES[t].min) return t;
  }
  return -1;
}
/* One uniform roll exactly reproduces a sequence of independent tier checks:
   P(L)=pL, P(M)=(1-pL)pM, P(G)=(1-pL)(1-pM)pG. This preserves the single-roll
   provably-fair stream while still giving each eligible tier its own chance. */
export function beastShowDecision(mult,u){
  const x=Math.max(0,+mult||0);
  const roll=Math.max(0,Math.min(1-Number.EPSILON,+u||0));
  let cursor=0, remaining=1;
  for(let t=BEAST_SHOW_RULES.length-1;t>=0;t--){
    const rule=BEAST_SHOW_RULES[t];
    if(x<rule.min) continue;
    const span=remaining*rule.p;
    if(roll<cursor+span){
      return {tier:t,lineBroken:false};
    }
    cursor+=span;
    remaining*=1-rule.p;
  }
  return {tier:-1,lineBroken:false};
}
export function chooseBeastShowTier(mult,u){
  return beastShowDecision(mult,u).tier;
}
/* Ante draw → its own complete 97% table; it changes budget, never beast tier. */
export function drawAnteMult(u){
  let acc=0;
  for(const r of ANTE_TABLE){ acc+=r.p; if(u<acc) return r.mult; }
  return ANTE_TABLE[ANTE_TABLE.length-1].mult;
}

/* --- LEGACY BASE-LANE CAP (v2.1; inactive in v2.11 settlement) --------
   base = softcap( Σ_i round(S_i × M_i) ) — M_i is the PRODUCT of the
   bubble mults assigned to fish i (base 1; a fish can stack several).
   v2.11 keeps this hidden cap out of active settlement: caught fish and bubble
   labels must add exactly to payout. Kept only for archived model comparisons.
   Softcap knee ×80 then hard ×500: the base-lane ceiling. The WHALE lane
   pays ON TOP (300–3000×, its own bounded law — NOT softcapped, the
   distribution is the bound). Theoretical single-round max = ×3500;
   the advertised max-win headline is the WHALE ×3000. */
export const SOFT_KNEE = 50*BP, SOFT_RATE = 0.32, HARD_CAP = 500*BP;
// second knee: beyond ×150 the return flattens hard — kills the extreme-tail
// sniping edge while leaving the ×30–×80 big-win sweet spot intact. The ×3000
// max-win headline belongs to the WHALE lane, not the base lane.
export const SOFT_KNEE2 = 150*BP, SOFT_RATE2 = 0.15;
export function softcap(bp){
  if(bp<=SOFT_KNEE) return bp;
  let out = SOFT_KNEE + (bp-SOFT_KNEE)*SOFT_RATE;
  if(out>SOFT_KNEE2) out = SOFT_KNEE2 + (out-SOFT_KNEE2)*SOFT_RATE2;
  return Math.min(HARD_CAP, Math.round(out));
}
export function basePayoutBp(sumBp){
  if(sumBp<=0) return 0;
  return softcap(Math.round(sumBp));
}

/* --- WHALE EVENT LAW (v2.1b — "seeing the whale is not landing it") ---
   Only golden scatters summon it: each scatter landed on the pull adds
   +30% trigger chance (1→30%, 2→60%, 3→90%, capped 100%; none → never).
   Then the STRUGGLE: 2/3 it tears free — the line SNAPS and the WHOLE
   round is lost (base included, hao's literal ruling); 1/3 it is held —
   the beast pays its tier mult (×10–×1000, v2.1c tiers below) ON TOP
   of base. A current-turbulence omen
   precedes it; false alarms are calibrated so roughly half the omens
   come to nothing (anticipation → near-miss). */
export const WHALE_P_PER_SCATTER = 0.30;
export const WHALE_ESCAPE_P = 2/3;
/* v2.1c BEAST TIERS ("big fish eats small fish") — held events roll a tier,
   then a log-uniform mult inside it. Cheap tiers are common, the ancient
   shark is the myth: E[mult]≈47 (vs ~640 before) → trigger odds ~13× more
   frequent at the same lane RTP. Advertised max win ×1,000. */
export const WHALE_TIERS = [
  { name:'WHALE',     min:10,  max:30,   w:0.70 },
  { name:'GREAT',     min:30,  max:100,  w:0.25 },
  { name:'MEGALODON', min:100, max:1000, w:0.05 },
];
export function whaleTier(u){
  let acc=0;
  for(let i=0;i<WHALE_TIERS.length;i++){ acc+=WHALE_TIERS[i].w; if(u<acc) return i; }
  return WHALE_TIERS.length-1;
}
export function whaleMult(tier, u){
  const t=WHALE_TIERS[tier];
  return t.min*Math.pow(t.max/t.min, Math.max(0,Math.min(1,u)));
}
