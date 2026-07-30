/* ============================================================
   DEEPER v2 — ROUND: the deterministic, headless outcome engine.

   OUTCOME-FIRST: a seeded sealed pool decides economic payout; deterministic
   positions, fish/bubble multiplier weights and hazards perform that result.
   The SAME engine runs the live game and headless RTP sim.
   Outcome = f(seed, action-timeline). No DOM, no Math.random, no clock.

   ────────────────────────────────────────────────────────────
   v2.4 RNG CONSUME ORDER (fixed — provably-fair alignment; keep in
   lockstep with any live driver and the sim harness):
     round init:  currentP0, currentP1, currentP2, currentP3
                  OPENING POOL draw (one roll → anonymous exact/range result row)
     enter L   :  segment ANTE roll — exactly ONE per entry, hit or miss
                  (SHALLOWS p=0 still consumes; stream stays regular)
                  ANTE POOL draw — ALSO exactly one per entry, ALWAYS rolled
                  even when the ante missed (result discarded), same reason.
                  ⚠ v2.3 raised the per-segment cost 1 roll → 2: seeds do NOT
                  replay against v2.2 traces. v2.4 keeps 2/segment but drops
                  the init modeU roll and changes the pool/shark rolls below,
                  so v2.4 seeds also diverge from v2.3.
                  spawnLayer(L) →
                    fishCount,
                    per fish: value, spawnX, swimAmp, swimSpeed, swimPhase,
                              driftDir, driftMag, wander×3, bob×3, z×4
                    bubbleCount,
                    per bubble: tierRoll, value, spawnX, sway×3, bob×3, driftDir, driftMag, z×2
                    scatterCount, per scatter: spawnX, swim×3,
                              driftDir, driftMag, bob×3, z×2
                    sharkPresence (1/8), [if present] shark: center, amp, freq, phase
                  descent hazard (v2.4) →
                    per PRESENT shark that has not rolled yet: ONE bite roll
                    (flat configured probability, pool-independent). A HIT
                    carries the entire unpaid budget forward; A MISS →
                    makePrize (value, swim×3, drift×2, bob×3) — the shark
                    becomes the fattest catch in the water.
     PULL      :  (NO pull-through hazard — all shark risk resolved on descent)
                  catch (fish + scatters + bubble pops) → PURE 2D GEOMETRY, 0 rng
                  (z is VISUAL layering only — every playable entity is hookable;
                  the far decorative school is a separate non-playable family)
                  bubble assignment →
                    per SPAWNED bubble in spawn order: ONE roll is always
                    consumed (natural miss included). A popped bubble uses that
                    roll to choose which caught SCORE fish receives its mult.
                  BEAST SHOW (v2.20) →
                    showRoll — ALWAYS one roll (stream regularity) and
                      presentation-only. First the sealed-pool multiplier ladder
                      evaluates LIVYATAN → MOSASAUR → GREAT WHITE; a hit is
                      guaranteed held. If none hits, deterministic forks of the
                      SAME roll evaluate PULL stages: caught/no-gold teaser →
                      teaser-to-GREAT-WHITE → GREAT-WHITE-to-MOSASAUR. An
                      unaffordable event branch may break visually, never money.
   ────────────────────────────────────────────────────────────

   Payout (v2.28 sealed-pool law + carry-funded beast collection):
     ordinary = exact Σ(caught fish visible value × caught bubble mult), never
                above anonymous opening result + independent 97% ante rows
     beast    = eligible from caught value + carry; a held beast visibly collects
                the residual carry, while a miss/break leaves it banked
     shark    = pool-independent LINE CUT show; all unpaid value becomes safe carry
   ============================================================ */
import { xfnv1a, mulberry32 } from '../econ/rng.js';
import {
  BP, LAYERS, DWELL, SHARK_BITE_P, REEL_SPEED, PULL_WINDUP,
  ANTE_P, ANTE_AMT, layerDepthY, lineXAtDepth, bandOf,
  drawPoolOutcome, drawAnteMult, beastShowDecision,
  BEAST_SHOW_RULES, GOLD_FISH_TEASE_P, NO_GOLD_FISH_TEASE_P,
  TEASE_TO_GREAT_WHITE_P, GREAT_WHITE_TO_MOSA_P,
} from './world.js';
import {
  spawnLayer, fishProjectedX, bubbleProjectedX, fishCatchRadius, bubblePopRadius,
  makePrize, fishGone, poolExposed,
} from './entities.js';

/* Fork independent-looking stage uniforms from the one fixed post-PULL roll.
   This adds no PRNG consumption and leaves every later seeded value aligned. */
function pullEventRoll(u,salt){
  let x=((Math.max(0,Math.min(1-Number.EPSILON,+u||0))*4294967296)>>>0) ^ salt;
  x=Math.imul(x^(x>>>16),0x7feb352d);
  x=Math.imul(x^(x>>>15),0x846ca68b);
  return ((x^(x>>>16))>>>0)/4294967296;
}

/* resolve the shark that appeared this segment. Each shark rolls its
   bite EXACTLY ONCE, the segment it spawns, at a flat SHARK_BITE_P — no depth
   ramp, geometry gate, or pool-value gate. A hit is a presentation stop: every
   unpaid basis point moves into safe carry, so it cannot erase a positive pool.
   A shark that does NOT bite becomes the PRIZE (v2.1f, restored by hao 2026-07-20:
   鯊魚沒咬斷就會變成獎勵 跟先前一樣) — same animal, now the fattest ordinary catch
   in the water and fast enough that you'll often lose it. Risk and reward are
   the same object, and the prizes claw back some of the RTP the bites take. */
function resolveHazard(st, rng, phase){
  for(const s of st.sharks){
    if(s.rolled) continue;                   // already had its one roll
    s.rolled = true;
    const roll = rng();
    /* v2.18: the performance verdict reads only its configured probability.
       Pool value never changes the bite animation; safe carry protects money. */
    const hit = roll < SHARK_BITE_P;
    st.contacts.push({ L:s.L, phase, roll, hit });
    if(hit){
      /* Nothing is paid on the broken line. The complete current pool plus any
         incoming safe bank rolls forward, so the cut delays value, never burns it. */
      s.bit = true; st.sharkCut = true;
      st.stopL = st.L;
      st.baseBp = 0;                         // 本局漁獲全損（不再 settleBase 撈回）
      st.whaleBp = 0;
      st.roundPayBp = 0;
      st.payoutBp = 0;                       // nothing paid to balance this round
      st.carryOutBp = st.ordinaryPoolBp + st.carryInBp;
      st.over = true; st.snapped = true;
      return true;
    }
    // it missed → its verdict is spent; it recedes (resolved dims it + drops it
    // from the danger meter, v2.6 hao: 沒斷就是過去了,別讓錯過的鯊魚一直懸念) and
    // leaves behind the PRIZE — a fast, fat catch you can still lose.
    s.spent = true; s.resolved = true;
    st.fish.push(makePrize(rng, s, st.t));
  }
  return false;
}

// enter segment L: advance time, roll the fee, spawn its entities, resolve
// descent hazard. atT: the sim-time this descent resolves at. Headless sim
// omits it → DWELL-spaced (deterministic); the LIVE driver passes its
// continuous clock so real pull-timing is the player's input.
function enter(st, rng, L, atT){
  st.L = L;
  st.t = (atT!==undefined) ? atT : (L-1) * DWELL;
  /* v2.3 THE ANTE — one roll for whether this segment charges, one draw for what
     that ante buys. BOTH are consumed unconditionally (see header). The ante is a
     BET, not a fee: the stake goes out and an independent pool draw comes back in,
     so the budget grows by its own 97%-expectation and RTP is untouched. */
  const band = bandOf(L);
  const au = rng();
  const anteMult = drawAnteMult(rng());        // ALWAYS drawn (ordinary rows only); used on a hit
  const hit = au < (ANTE_P[band]||0);
  if(hit){
    st.anteBp += Math.round(ANTE_AMT*BP);
    st.ordinaryPoolBp += Math.round(ANTE_AMT*anteMult*BP);
    st.poolBp = st.ordinaryPoolBp + st.beastPoolBp;
    st.anteHits++;
    /* The ante only fattens the anonymous BUDGET. Any eventual beast show is
       selected later from the final paid multiple, not from this draw. */
  }
  st.antes.push({ L, band, hit, mult: hit ? anteMult : 0 });
  // The anonymous opening + ante budget becomes fish; beast casting happens
  // only after settlement and never consumes or erases it.
  const payableBp = st.ordinaryPoolBp;
  const dueBp = Math.round(payableBp * poolExposed(L, LAYERS));
  const offerBp = Math.max(0, dueBp - st.exposedBp);
  const { fish, bubbles, sharks } = spawnLayer(rng, L, st.t, offerBp/BP);
  /* Exposure is an outcome-budget fact, not the sum of presentation labels. */
  st.exposedBp = dueBp;
  for(const f of fish) st.fish.push(f);
  for(const b of bubbles) st.bubbles.push(b);
  for(const s of sharks) st.sharks.push(s);
  resolveHazard(st, rng, 'descent');       // sets st.snapped/over on a HIT
}

/* ================= THE ARRANGEMENT / BASE LANE (v2.12) ======================
   Solve the catch at the CURRENT depth against the round's exposed budget and
   write st.baseBp. Pure geometry + budget, NO rng — so it is safe to call from
   both a normal PULL and a shark-cut auto-pull. Beast presentation is selected
   only after this settlement and cannot change it.

     "若預算不足魚不會消失, 而是在 PULL 的時剛好游過 沒勾到; 若預算夠就要讓魚靠近鉤子."

   Budget = poolExposed(L) × pool. Fish and bubbles keep their random SINK
   trajectories; only entities whose unmodified future position intersects the
   rising hook may be selected. Caught entities never receive a PULL-time x
   adjustment. Candidates are packed by seed rank rather than depth, and every
   landed value is paid exactly. */
function settleBase(st, rng, hookStartDepth){
  const C = st.C;
  const layerDepth = layerDepthY(st.L);
  /* A live pull may begin between segment boundaries. Starting the contact
     clock at the shallower boundary made the engine evaluate fish before the
     rendered hook could physically reach them. Headless callers omit the
     optional depth and preserve their boundary-based policy. */
  const hookDepth = Number.isFinite(hookStartDepth)
    ? Math.max(layerDepth,hookStartDepth)
    : layerDepth;
  const path = st.reelPath || { startT:st.t, startDepth:hookDepth, steerX:st.steerX };
  const tPass  = d => path.startT + Math.max(0, path.startDepth - d)/REEL_SPEED;
  const hookAt = (d,t) => lineXAtDepth(d, t, d, C, path.steerX);
  const exposedBudgetBp = Math.round(st.ordinaryPoolBp * poolExposed(st.L, LAYERS));
  const budgetBp = exposedBudgetBp + st.carryInBp;
  /* Fixed stream shape: natural geometry may change which bubbles pop, but it
     must never shift the later legacy show roll. */
  const bubbleAssign=new Map();
  for(const b of st.bubbles) bubbleAssign.set(b,rng());

  const live=st.fish.filter(f=>!f.caught&&!f.escaped&&f.depth<=hookDepth+1
    && !fishGone(f,tPass(f.depth)));
  const routed=[];
  for(const f of live){
    const t=tPass(f.depth), hx=hookAt(f.depth,t);
    const gap=Math.abs(fishProjectedX(f,t,C)-hx), radius=fishCatchRadius(f,t);
    if(gap<radius) routed.push({f,t,hx,gap,radius});
  }
  routed.sort((a,b)=>(a.f.routeRank??0.5)-(b.f.routeRank??0.5)
    || a.f.depth-b.f.depth);
  const freeBubbles=[];
  for(const b of st.bubbles){
    if(b.popped||b.missed||b.depth>hookDepth+1) continue;
    const t=tPass(b.depth), hx=hookAt(b.depth,t);
    const gap=Math.abs(bubbleProjectedX(b,t,C)-hx), radius=bubblePopRadius(b,t);
    if(gap<radius){ b.catchGap=gap; b.catchRadius=radius; freeBubbles.push(b); }
  }
  freeBubbles.sort((a,b)=>(a.routeRank??0.5)-(b.routeRank??0.5)||a.depth-b.depth);

  const caughtScore=[];
  let leftBp = budgetBp;
  /* Try the earliest naturally intersecting bubble that can be paid exactly.
     Its assignment roll was already consumed above, even if this bubble misses
     or no caught fish can afford its uplift. */
  const tryBubble=()=>{
    for(let i=0;i<freeBubbles.length;i++){
      const b=freeBubbles[i], eligible=[];
      for(const f of caughtScore){
        const current=Math.round(f.score*BP*f.multApplied);
        const next=Math.round(f.score*BP*f.multApplied*b.mult);
        const uplift=next-current;
        if(uplift>0 && uplift<=leftBp) eligible.push({f,uplift});
      }
      if(!eligible.length) continue;
      const u=bubbleAssign.get(b);
      const picked=eligible[Math.min(eligible.length-1,Math.floor(u*eligible.length))];
      picked.f.multApplied*=b.mult;
      b.popped=true; b.fishRef=picked.f; st.popped.push(b);
      leftBp-=picked.uplift;
      freeBubbles.splice(i,1);
      return true;
    }
    return false;
  };
  for(const hit of routed){
    const {f,t,hx,gap,radius}=hit;
    f.catchGap=gap;                                      // sim/debug proof: already on-route
    f.catchRadius=radius;
    if(f.type==='SCATTER'){              // scatters feed the beast chain, not the budget
      f.caught = true; f.multApplied = 1; st.caught.push(f); st.scatters++;
      continue;
    }
    const baseBp = Math.round(f.score*BP);
    if(baseBp>0 && baseBp<=leftBp){
      f.caught = true; f.multApplied = 1; st.caught.push(f); caughtScore.push(f);
      st.potBp += baseBp; leftBp -= baseBp;
      tryBubble();                                      // give multipliers budget priority
    } else {
      // It was naturally on-route but unaffordable: arm a local near-miss only.
      f.escaped = true;
    }
  }
  while(tryBubble()){}                                  // stack any remaining affordable bubbles
  for(const b of st.bubbles) if(!b.popped){
    b.missed=true;
    b.adjX=0; b.adjT=0;                                 // keep the same random trajectory
  }

  // WYSIWYG law: caught labels add exactly to base payout; no hidden softcap.
  let sumBp = 0;
  for(const f of caughtScore) sumBp += Math.round(f.score*BP*f.multApplied);
  st.baseBp = sumBp;
}

/* createRound — build a fresh round on one seeded stream and DROP into L1.
   Returns a small driver the game/sim calls: canSink() / sink() / pull(atT).

   v2.27 CARRYOVER — `carryInBp` is the ordinary residual the LAST round left
   unclaimed. It rolls into this round's visible catch budget, so it can only be
   paid by fish/bubbles the PULL path actually touches; untouched value keeps
   rolling forward. */
export function createRound(seedStr, atT0, carryInBp){
  const rng = mulberry32(xfnv1a(seedStr));
  const C = { p0: rng()*6.2831853, p1: rng()*6.2831853, p2: rng()*6.2831853, p3: rng()*6.2831853 };  // current phases
  /* v2.11 — THE POOL: one roll picks an anonymous exact/range result row.
     No row selects a fish or beast presentation. */
  const opening = drawPoolOutcome(rng());
  const poolMult = opening.mult;
  const openingBp = Math.round(poolMult*BP);
  const ordinaryPoolBp = openingBp;
  const beastPoolBp = 0;                            // compatibility trace; v2.12 has no economic beast lane
  const carryBp = Math.max(0, Math.round(carryInBp||0));
  /* CARRY = stored water value. It funds visible catches instead of paying out
     directly, so balance movement still matches what the hook touched. */
  const st = {
    C, L:0, t:0,
    fish:[], bubbles:[], sharks:[],
    poolBp: openingBp, ordinaryPoolBp, beastPoolBp, exposedBp:0,
    poolMult, beastTier:-1, carryInBp:carryBp, carryOutBp:0, // beastTier becomes presentation tier only after PULL
    roundPayBp:0,                                            // this round's own take (excl. carry) — for carryOut
    potBp:0,                               // Σ raw caught score (bp), pre-mult — dock body readout
    antes:[], anteBp:0, anteHits:0,        // v2.3 per-segment antes (extra stake in, extra pool out)
    contacts:[], caught:[], popped:[],     // trace
    scatters:0, greatWhiteTeases:0, greatWhiteTeased:false,
    pullBeastTeased:false, pullGreatWhite:false, pullMosasaur:false, pullHadGoldFish:false,
    directBeastShow:false, pullEventRolls:null,
    baseBp:0, whaleBp:0, beastShowBp:0, beastShowBudgetBp:0, beastShowRoll:-1,
    whaleTease:false, whaleTriggered:false, whaleEscaped:false, beastLineBroken:false, whaleTier:-1,
    beastBudgetBreak:false,
    over:false, snapped:false, sharkCut:false, stopL:0, payoutBp:0,
    steerX:0,                              // player's lateral aim (gesture); 0 = pure current
    reelPath:null,                         // frozen PULL path shared by settlement, reel animation and render
  };
  enter(st, rng, 1, atT0!==undefined ? atT0 : 0);   // DROP resolves L1 at t0
  const api = {
    st, C,
    band(){ return st.L; },
    canSink(){ return !st.over && st.L < LAYERS; },
    potBp(){ return st.potBp; },
    /* previewPull — PURE, non-mutating, no rng: what a PULL at time t WOULD land
       right now (entities currently inside the catch corridor). effX is the
       visible base fish value. Bubble assignment still needs seeded target
       selection, so the live dock keeps its honest approximation marker. */
    previewPull(atT, atDepth){
      /* v2.1f — mirrors pull() EXACTLY (minus rng): the windup delay and the
         per-entity t_pass hook-contact test. Anything less and the dock would
         promise a catch the hook never makes. */
      const t = ((typeof atT==='number') ? atT : st.t) + PULL_WINDUP;
      const layerDepth = layerDepthY(st.L);
      const hookDepth = Number.isFinite(atDepth) ? Math.max(layerDepth,atDepth) : layerDepth;
      const path = { startT:t, startDepth:hookDepth, steerX:st.steerX };
      const tPass = d => path.startT + Math.max(0, path.startDepth - d)/REEL_SPEED;
      const hookAt = (d,tt) => lineXAtDepth(d, tt, d, C, path.steerX);
      let potBp=0, count=0, scatters=0;
      for(const f of st.fish){
        if(f.caught||f.escaped||fishGone(f,tPass(f.depth))) continue;
        const tt = tPass(f.depth);
        if(Math.abs(fishProjectedX(f,tt,C)-hookAt(f.depth,tt))<fishCatchRadius(f,tt)){
          if(f.type==='SCATTER') scatters++;
          else { count++; potBp += Math.round(f.score*BP); }
        }
      }
      let bubbles=0;
      for(const b of st.bubbles){
        if(b.popped || b.missed) continue;
        const tt = tPass(b.depth);
        if(Math.abs(bubbleProjectedX(b,tt,C)-hookAt(b.depth,tt))<bubblePopRadius(b,tt)) bubbles++;
      }
      return { potBp, effX:1, bubbles, scatters, count, potentialBp:potBp };
    },
    sink(atT){
      if(st.over || st.L>=LAYERS) return st;
      enter(st, rng, st.L+1, atT);
      return st;
    },
    steer(x){ st.steerX = x; },            // player's lateral aim (world units off-anchor)
    pull(atT, atDepth){
      if(st.over) return st;
      // player's pull moment is a real input; the strike lands after the windup
      st.t = ((typeof atT==='number') ? atT : st.t) + PULL_WINDUP;
      st.stopL = st.L;
      const layerDepth = layerDepthY(st.L);
      const startDepth = Number.isFinite(atDepth) ? Math.max(layerDepth,atDepth) : layerDepth;
      st.reelPath = { startT:st.t, startDepth, steerX:st.steerX };
      /* v2.1e (hao 2026-07-19): the PULL no longer re-rolls every shark it
         threads past. That second, invisible death happened AFTER the player
         had already committed and could not be read on screen — the whole
         risk now lives in the descent, where the shark is visible, closes in,
         and gets a beat of its own before the verdict. (~~fork#4 extract
         THROUGH the accumulated sharks~~ — retired; the deep-play RTP it used
         to hold down is re-absorbed by the depth-scaled bite below.) */
      // catch — solve the arrangement + base lane at this depth (pure, no rng)
      settleBase(st, rng, startDepth);
      /* ---------- BEAST SHOW: carry-funded visible collection ----------------
         One roll is still consumed unconditionally so the seeded stream shape
         remains stable. Carry helps qualify the tier, but only leaves the bank
         when a held beast gives that residual value a visible payout event. */
      const beastU = rng();
      st.beastShowRoll=beastU;
      st.roundPayBp = st.baseBp;
      st.payoutBp   = st.roundPayBp;
      st.carryOutBp = Math.max(0, st.carryInBp + st.ordinaryPoolBp - st.baseBp);
      st.beastShowBudgetBp=st.payoutBp+st.carryOutBp;
      const budgetMult=st.beastShowBudgetBp/BP;
      /* Forced beast show (multiplier ladder) always has priority and can never
         break. If it selects any beast, skip the entire separate PULL event
         chain; that chain is sampled only on non-forced-beast PULLs. */
      let decision=st.payoutBp>0 ? beastShowDecision(budgetMult,beastU) : {tier:-1,lineBroken:false};
      st.directBeastShow=decision.tier>=0;
      st.pullHadGoldFish=st.scatters>0;
      const rolls={
        tease:pullEventRoll(beastU,0x9e3779b9),
        greatWhite:pullEventRoll(beastU,0x243f6a88),
        mosasaur:pullEventRoll(beastU,0xb7e15162),
      };
      st.pullEventRolls=rolls;
      if(!st.directBeastShow){
        const teaseP=st.pullHadGoldFish ? GOLD_FISH_TEASE_P : NO_GOLD_FISH_TEASE_P;
        st.pullBeastTeased=rolls.tease<teaseP;
        st.greatWhiteTeased=st.pullBeastTeased;
        st.greatWhiteTeases=st.pullBeastTeased?1:0;
        st.pullGreatWhite=st.pullBeastTeased && rolls.greatWhite<TEASE_TO_GREAT_WHITE_P;
        st.pullMosasaur=st.pullGreatWhite && rolls.mosasaur<GREAT_WHITE_TO_MOSA_P;
        if(st.pullGreatWhite){
          const tier=st.pullMosasaur?1:0;
          decision={tier,lineBroken:budgetMult<BEAST_SHOW_RULES[tier].min,eventChain:true};
        }
      }
      if(decision.tier>=0){
        if(!decision.lineBroken){
          st.whaleBp=st.carryOutBp;
          st.payoutBp+=st.whaleBp;
          st.carryOutBp=0;
        }
        st.whaleTriggered=true; st.whaleTease=true;
        st.beastLineBroken=decision.lineBroken;
        st.beastBudgetBreak=!!decision.eventChain && decision.lineBroken;
        st.whaleEscaped=decision.lineBroken;                 // view compatibility: plays snapline
        st.whaleTier=decision.tier; st.beastTier=st.whaleTier;
        st.beastShowBp=st.payoutBp;                        // animation target only
      } else {
        st.whaleTriggered=false; st.whaleEscaped=false; st.beastLineBroken=false; st.beastBudgetBreak=false;
        st.whaleTier=-1; st.beastTier=-1; st.beastShowBp=0;
        st.whaleTease=st.pullBeastTeased;
      }
      st.over = true;
      return st;
    },
  };
  return api;
}

/* ----------------------------------------------------------------
   HEADLESS SIM DRIVER — run one round under a policy that decides, at each
   HOLD, 'SINK' or 'PULL'. Baseline uses the default pull time (immediate);
   a timing-aware policy may pass a pull sub-time to pull(). spendBp is the
   DROP (1×) plus every segment ANTE that hit on the way down (v2.3).
   ---------------------------------------------------------------- */
export function simRound(seedStr, policy, carryInBp){
  const r = createRound(seedStr, undefined, carryInBp);
  while(r.canSink()){
    const view = {
      L:r.st.L, nextL:r.st.L+1,
      potBp:r.st.potBp,
      potentialBp:r.previewPull().potentialBp,
      sharks:r.st.sharks.length,               // v2.4: informational (each already rolled its bite)
      spendBp: BP + r.st.anteBp,
    };
    if(policy(view)==='PULL') break;
    r.sink();
    if(r.st.over) break;                    // snapped mid-descent
  }
  if(!r.st.over) r.pull();
  const spendBp = BP + r.st.anteBp;
  return { payoutBp:r.st.payoutBp, baseBp:r.st.baseBp, whaleBp:r.st.whaleBp,
           spendBp, anteBp:r.st.anteBp, anteHits:r.st.anteHits, snapped:r.st.snapped, stopL:r.st.stopL||r.st.L,
           potBp:r.st.potBp, poolBp:r.st.poolBp, ordinaryPoolBp:r.st.ordinaryPoolBp,
           beastPoolBp:r.st.beastPoolBp, poolMult:r.st.poolMult, exposedBp:r.st.exposedBp,
           carryInBp:r.st.carryInBp, carryOutBp:r.st.carryOutBp,     // ordinary residual rolled in / out
           scatters:r.st.scatters, popped:r.st.popped.length,
           greatWhiteTeases:r.st.greatWhiteTeases, greatWhiteTeased:r.st.greatWhiteTeased,
           pullBeastTeased:r.st.pullBeastTeased, pullGreatWhite:r.st.pullGreatWhite,
           pullMosasaur:r.st.pullMosasaur, pullHadGoldFish:r.st.pullHadGoldFish,
           directBeastShow:r.st.directBeastShow, pullEventRolls:r.st.pullEventRolls,
           whaleTease:r.st.whaleTease, whaleTriggered:r.st.whaleTriggered,
           whaleEscaped:r.st.whaleEscaped, beastLineBroken:r.st.beastLineBroken,
           beastBudgetBreak:r.st.beastBudgetBreak, whaleTier:r.st.whaleTier,
           beastTier:r.st.beastTier, beastShowBp:r.st.beastShowBp,
           beastShowBudgetBp:r.st.beastShowBudgetBp, beastShowRoll:r.st.beastShowRoll,
           sharkCut:r.st.sharkCut,                                    // v2.4: a shark forced an early pull (base kept)
           contacts:r.st.contacts.length, caught:r.st.caught.length };
}

export { xfnv1a, mulberry32 };
