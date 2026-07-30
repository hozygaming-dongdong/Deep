#!/usr/bin/env node
/* ============================================================
   DEEPER v2 — headless engine harness: correctness gate + P1v2 RTP table.
   Runs the SAME deterministic physics core the game ships (src/engine/*),
   with no render, over many rounds.

   Gates (must stay green):
     · deterministic (same seed+timeline → bit-identical outcome)
     · correct       (sealed-pool payout, independent spawn weights,
                      caught-label WYSIWYG, shark hazard, beast-show isolation)
   RTP table: fixed-stop ladder + behavioral policies + SHARP ceiling,
   with presentation-independent RTP. P1v2 tunes into the 96–97% robust band.

   Usage: node tools/sim.mjs [--rounds 200000] [--tune]
   ============================================================ */
import {
  BP, LAYERS, HARD_CAP, DWELL, BANDS, BAND_ENDS, BAND_EDGES, bandOf,
  ANTE_EV, ANTE_AMT, ANTE_P, POOL_RTP,
  BEAST_TIER_NAME, BEAST_SHOW_RULES, SHARK_PRIZE_MIN, SHARK_PRIZE_MAX,
  beastShowTier, beastShowDecision, fishAppearanceForBand, bubbleAppearanceForBand, CFG,
} from '../src/engine/world.js';
import { createRound, simRound } from '../src/engine/round.js';

const args = process.argv.slice(2);
const TUNE = args.includes('--tune');
/* v2.3: the working default is 30k — fast enough to iterate the ante/show loop.
   ⚠ 30k is a TUNING number, not a freeze number: the full 200k gate
   (`--rounds 200000`) is what ECONOMY-V2 quotes. Don't publish a 30k figure. */
const ROUNDS = parseInt((args[args.indexOf('--rounds')+1])||(TUNE?'60000':'30000'),10);
const SEED = 0xD33FE2;
const seedOf = (i)=> 'deeperv2:'+SEED+':'+i;

let fails = 0;
function ok(name, cond, extra=''){ console.log((cond?'  ✓ ':'  ✗ ')+name+(extra?('  '+extra):'')); if(!cond) fails++; }

// policies: view → 'SINK' | 'PULL'
const fixedStop = (L)=> (v)=> v.L>=L ? 'PULL' : 'SINK';
const timid = (k)=> (v)=> v.potentialBp >= k*v.spendBp ? 'PULL' : 'SINK';
const REF_L = Math.max(1,Math.min(LAYERS,Math.round(LAYERS*0.5)));
const PROFILE_DEPTHS = (()=>{
  const set=new Set([1,LAYERS,...BAND_EDGES.slice(1)]);
  const step=Math.max(1,Math.ceil(LAYERS/10));
  for(let L=step;L<LAYERS;L+=step) set.add(L);
  return [...set].sort((a,b)=>a-b);
})();
const anteSegmentsThrough = L => {
  let total=0;
  for(let segment=1;segment<=Math.min(L,LAYERS);segment++){
    if((ANTE_P[bandOf(segment)]||0)>0) total++;
  }
  return total;
};

/* SHARP — the informed ceiling policy: at each HOLD it samples the pull
   preview across the dwell window (what a patient player can literally see),
   pulls at the best moment once the preview clears a threshold, else sinks.
   Uses the real engine driver (createRound) so pull timing is exploited. */
/* ---------- HOW A HUMAN ACTUALLY PLAYS (v2.1f gate standard) ----------
   hao 2026-07-19: "人類就是簡單直接去進行 沒有這麼多方法."

   The old SHARP was an ORACLE: it sampled 12 FUTURE pull moments, simulated
   each exactly, and pulled at the single best instant. That is a bot with
   perfect foresight and frame-perfect hands — useful as an anti-exploit
   ceiling, useless as a model of the person holding the phone, and tuning
   against it crushed the human band to ~30% RTP.

   The gate now measures PEOPLE. A human:
     · reads what is on the dock RIGHT NOW — never the future
     · glances at human cadence (a few times a second), not every frame
     · acts a beat late (REACTION), and the engine still adds its windup
   The oracle is still measured below, but as INFORMATION only. Beating it is
   a P6 hardening problem (provably-fair commit-reveal means a live player
   cannot simulate ahead anyway) — deliberately deferred, see ECONOMY-V2 §6. */
let REACTION = 0.28;            // sec between seeing it and the pull landing
const GLANCE   = 0.32;          // sec between looks

// "I'll take it as soon as it's worth ≥θ of what I've put in" — the natural
// read of the money dock (CASH OUT vs BET), with no foresight at all.
function humanRound(seedStr, theta, maxL, carryInBp=0){
  const r = createRound(seedStr, undefined, carryInBp);
  while(true){
    const spend = BP + r.st.anteBp;
    // look a few times while sitting in this segment
    for(let k=0;k<Math.floor(DWELL/GLANCE);k++){
      const seen = r.st.t + k*GLANCE;
      const pv = r.previewPull(seen);
      if(pv.potentialBp >= theta*spend && pv.potentialBp > 0){
        r.pull(seen + REACTION);                 // acts a beat after seeing it
        return { payoutBp:r.st.payoutBp, baseBp:r.st.baseBp, whaleBp:r.st.whaleBp,
                 carryInBp:r.st.carryInBp, carryOutBp:r.st.carryOutBp,
                 spendBp:BP+r.st.anteBp, snapped:r.st.snapped };
      }
    }
    if(!r.canSink() || (maxL && r.st.L>=maxL)){ r.pull(r.st.t + REACTION); break; }
    r.sink();
    if(r.st.over) break;
  }
  return { payoutBp:r.st.payoutBp, baseBp:r.st.baseBp, whaleBp:r.st.whaleBp,
           carryInBp:r.st.carryInBp, carryOutBp:r.st.carryOutBp,
           spendBp:BP+r.st.anteBp, snapped:r.st.snapped };
}

/* the oracle — kept for information, NOT a gate (see above) */
function oracleRound(seedStr, theta, carryInBp=0){
  const r = createRound(seedStr, undefined, carryInBp);
  while(true){
    const spend = BP + r.st.anteBp;
    let bestT = r.st.t, bestPot = -1;
    for(let k=0;k<=11;k++){
      const t = r.st.t + k*(DWELL/11);
      const pv = r.previewPull(t);
      const tp=Math.min(1, pv.scatters*0.30);
      const val = pv.potentialBp*(1-tp*(2/3)) + tp*(1/3)*47*BP;
      if(val>bestPot){ bestPot=val; bestT=t; }
    }
    if(bestPot >= theta*spend || !r.canSink()){ r.pull(bestT); break; }
    r.sink();
    if(r.st.over) break;
  }
  return { payoutBp:r.st.payoutBp, baseBp:r.st.baseBp, whaleBp:r.st.whaleBp,
           carryInBp:r.st.carryInBp, carryOutBp:r.st.carryOutBp,
           spendBp:BP+r.st.anteBp, snapped:r.st.snapped };
}

if(!TUNE){
/* ---------- 1. DETERMINISM (the core gate) ---------- */
console.log('=== 1. DETERMINISM — same seed + same policy ⇒ bit-identical outcome ===');
{
  let mismatch=0, checked=0;
  for(let i=0;i<Math.min(ROUNDS,20000);i++){
    for(const L of BAND_EDGES.slice(1)){
      const a=JSON.stringify(simRound(seedOf(i), fixedStop(L)));
      const b=JSON.stringify(simRound(seedOf(i), fixedStop(L)));
      checked++; if(a!==b) mismatch++;
    }
  }
  ok('bit-identical across '+checked.toLocaleString()+' replays', mismatch===0, 'mismatches='+mismatch);
}

/* ---------- 2. DEPTH is the decision (v2.2) ----------
   ~~PULL TIMING is a real input~~ — that assertion guarded "physics-is-outcome",
   and v2.2 deliberately killed it: the arrangement solves to the drawn budget
   whatever instant you pull at, which is precisely why no timing or foresight
   exploit exists any more. Keeping it would have been a gate defending a
   retired law. What must hold NOW is that the surviving decision is real:
   going deeper lays out more of the pool, so depth changes the outcome. */
console.log('=== 2. DEPTH changes the show, not the anonymous sealed-pool RTP (v2.12) ===');
{
  /* Depth changes which values are visible and how quickly value is delivered,
     but may not destroy or add to a sealed positive opening/ante pool. */
  let differ=0, sampled=0; let shallowMax=0, deepMax=0;
  const shallowL=Math.max(1,Math.round(BAND_ENDS.SHALLOWS*0.6));
  const deepL=Math.max(shallowL+1,REF_L);
  for(let i=0;i<3000;i++){
    const mk=(L)=>{ const r=createRound(seedOf(i)); while(r.st.L<L && r.canSink()) r.sink();
                    if(r.st.over) return null; r.pull(); return r.st.payoutBp; };
    const shallow=mk(shallowL), deep=mk(deepL);
    if(shallow===null || deep===null) continue;
    sampled++;
    if(shallow!==deep) differ++;
    if(shallow>shallowMax) shallowMax=shallow;
    if(deep>deepMax) deepMax=deep;
  }
  ok('pull depth changes the outcome', differ>0, differ+'/'+sampled+' rounds differed');
  ok('deeper raises the ceiling (best case grows with depth)', deepMax>shallowMax,
     'max @L'+shallowL+' ×'+(shallowMax/BP).toFixed(0)
     +'  vs  @L'+deepL+' ×'+(deepMax/BP).toFixed(0));
  /* and the thing timing MUST NOT do any more */
  let catchDiffer=0, owedDiffer=0, tSampled=0;
  for(let i=0;i<1500;i++){
    const mk=(dt)=>{ const r=createRound(seedOf(i)); for(let s2=0;s2<REF_L-1 && r.canSink();s2++) r.sink();
                     if(r.st.over) return null; r.pull(r.st.t+dt);
                     return {pay:r.st.payoutBp, owed:r.st.payoutBp+r.st.carryOutBp}; };
    const a=mk(0), b=mk(0.7);
    if(a===null||b===null) continue;
    tSampled++;
    if(a.pay!==b.pay) catchDiffer++;
    if(a.owed!==b.owed) owedDiffer++;
  }
  ok('pull timing can change the natural catch paid now', catchDiffer>0,
     catchDiffer+'/'+tSampled+' rounds differed');
  ok('pull timing cannot change sealed value (paid now + safe carry)', owedDiffer===0,
     owedDiffer+'/'+tSampled+' rounds differed');
}

/* ---------- 2b. INDEPENDENT SPAWN WEIGHTS + WYSIWYG PAYOUT (v2.10) --- */
console.log('=== 2b. Fish/bubble spawn weights are independent; caught labels pay exactly ===');
{
  const bands=BANDS;
  const fishSeen=Object.fromEntries(bands.map(b=>[b,fishAppearanceForBand(b).map(()=>0)]));
  const bubbleSeen=Object.fromEntries(bands.map(b=>[b,bubbleAppearanceForBand(b).map(()=>0)]));
  let badFish=0, badPrize=0, prizeSeen=0, badBubble=0, badAssignment=0, badWysiwyg=0, badRoute=0;
  let badTouchVerdict=0, badMotion=0, popped=0, speedLo=Infinity, speedHi=-Infinity;
  const caughtThird=[0,0,0];
  const n=Math.min(ROUNDS,20000);
  for(let i=0;i<n;i++){
    const r=createRound(seedOf(i));
    while(r.st.L<LAYERS && r.canSink()) r.sink();
    for(const f of r.st.fish){
      if(f.type==='PRIZE'){
        prizeSeen++;
        if(f.score<SHARK_PRIZE_MIN-1e-9 || f.score>SHARK_PRIZE_MAX+1e-9) badPrize++;
        continue;
      }
      if(f.type!=='SCORE') continue;
      const rows=fishAppearanceForBand(f.band);
      const t=rows.findIndex(x=>Math.abs((+x.mult||0)-f.score)<1e-9);
      if(t<0) badFish++; else fishSeen[f.band][t]++;
      if(!Number.isFinite(f.swimSpeed) || f.swimSpeed<32 || f.swimSpeed>68) badMotion++;
      else { speedLo=Math.min(speedLo,f.swimSpeed); speedHi=Math.max(speedHi,f.swimSpeed); }
    }
    for(const b of r.st.bubbles){
      const t=b.tier, row=bubbleAppearanceForBand(b.band)[t];
      const exactDisplay=b.mult>=10
        ? Math.abs(b.mult-Math.round(b.mult))<1e-9
        : Math.abs(b.mult*100-Math.round(b.mult*100))<1e-7;
      if(!row || b.mult<row.min-1e-9 || b.mult>row.max+1e-9 || !exactDisplay) badBubble++;
      else bubbleSeen[b.band][t]++;
    }
    if(!r.st.over) r.pull();
    for(const f of r.st.fish){
      if(Number.isFinite(f.catchGap) && !(f.caught||f.escaped)) badTouchVerdict++;
    }
    for(const b of r.st.bubbles){
      if(Number.isFinite(b.catchGap) && !(b.popped||b.missed)) badTouchVerdict++;
    }
    for(const b of r.st.popped){ popped++; if(!b.fishRef) badAssignment++; }
    const shown=r.st.caught
      .filter(f=>f.type==='SCORE'||f.type==='PRIZE')
      .reduce((a,f)=>a+Math.round(f.score*BP*f.multApplied),0);
    if(shown!==r.st.baseBp) badWysiwyg++;
    for(const f of r.st.caught){
      if((f.catchGap??Infinity)>=(f.catchRadius??0)) badRoute++;
      caughtThird[Math.min(2,Math.floor((Math.max(1,f.L)-1)*3/LAYERS))]++;
    }
  }
  ok('every fish value comes from its independently configured appearance row',
     badFish===0 && bands.every(b=>fishSeen[b].every((x,i)=>
       (+fishAppearanceForBand(b)[i].weight||0)<=0 || x>0)),
     'violations='+badFish+' · seen='+bands.map(b=>b+':'+fishSeen[b].join('/')).join(' · '));
  ok('ordinary fish cruise at independently seeded, visibly varied speeds',
     badMotion===0 && speedLo<33 && speedHi>67,
     'violations='+badMotion+' · range='+speedLo.toFixed(2)+'–'+speedHi.toFixed(2)+' px/s');
  ok('missed-shark PRIZE values stay inside the configured multiplier interval',
     badPrize===0 && prizeSeen>0,
     'violations='+badPrize+' · seen='+prizeSeen+' · range=×'+SHARK_PRIZE_MIN+'–×'+SHARK_PRIZE_MAX);
  ok('every bubble payable multiplier stays in its independently configured tier',
     badBubble===0 && bands.every(b=>bubbleSeen[b].every((x,i)=>
       (+bubbleAppearanceForBand(b)[i].weight||0)<=0 || x>0)),
     'violations='+badBubble+' · seen='+bands.map(b=>b+':'+bubbleSeen[b].join('/')).join(' · '));
  ok('every popped bubble consumes the assignment path and targets a caught fish',
     badAssignment===0 && popped>0, 'violations='+badAssignment+' · popped='+popped);
  ok('caught fish labels add exactly to base payout (no hidden value or softcap)',
     badWysiwyg===0, 'violations='+badWysiwyg);
  ok('every caught fish was already inside the reel corridor before PULL playback',
     badRoute===0, 'violations='+badRoute);
  ok('every visible-body contact resolves as catch/pop or an explicit near-miss',
     badTouchVerdict===0, 'violations='+badTouchVerdict);
  ok('caught fish are distributed across upper / middle / lower water, not bottom-packed',
     caughtThird.every(x=>x>0), 'seen='+caughtThird.join('/'));
}

/* ---------- 3. PAYOUT LAW — sealed pool; held beast visibly collects carry --- */
console.log('=== 3. PAYOUT LAW (v2.28) — payout + carry stays sealed; held beast collects carry ===');
{
  let badBase=0, badPool=0, badSum=0, badShow=0, shows=0, qualified=0, wins=0, n=0, maxBase=0, maxTotal=0, anteRounds=0;
  let anteHitTotal=0, poolTotal=0, spendTotal=0, segTotal=0, openTotal=0;
  for(let i=0;i<ROUNDS;i++){
    const r=simRound(seedOf(i), fixedStop(REF_L)); n++;
    if(r.baseBp<0 || r.baseBp>HARD_CAP) badBase++;
    if(r.payoutBp > r.poolBp+r.carryInBp) badPool++;
    if(r.poolBp === 0 && r.payoutBp !== 0) badPool++;
    if(r.payoutBp+r.carryOutBp !== r.poolBp+r.carryInBp) badSum++;
    if(r.payoutBp !== r.baseBp+r.whaleBp) badSum++;
    const heldBeast=r.whaleTriggered && !r.beastLineBroken;
    if((r.whaleBp>0 && !heldBeast) || (heldBeast && r.carryOutBp!==0)
       || (!heldBeast && r.whaleBp!==0)) badSum++;
    const budgetMult=r.beastShowBudgetBp/BP;
    const directDecision=r.baseBp>0
      ? beastShowDecision(budgetMult,r.beastShowRoll)
      : {tier:-1,lineBroken:false};
    let decision=directDecision;
    if(!r.sharkCut){
      if(r.directBeastShow!==(directDecision.tier>=0)) badShow++;
      if(directDecision.tier<0){
        const rolls=r.pullEventRolls;
        const teaseP=r.pullHadGoldFish ? CFG.goldFishTeaseP : CFG.noGoldFishTeaseP;
        const teased=!!rolls && rolls.tease<teaseP;
        const great=teased && rolls.greatWhite<CFG.teaseToGreatWhiteP;
        const mosa=great && rolls.mosasaur<CFG.greatWhiteToMosasaurP;
        if(r.pullBeastTeased!==teased || r.pullGreatWhite!==great || r.pullMosasaur!==mosa) badShow++;
        if(great){
          const tier=mosa?1:0;
          decision={tier,lineBroken:budgetMult<BEAST_SHOW_RULES[tier].min};
        }
      }
    }
    const expectedTier=decision.tier;
    const isQualified=!r.sharkCut && r.baseBp>0 && beastShowTier(budgetMult)>=0;
    if(isQualified) qualified++;
    if(!r.sharkCut && !(r.beastShowRoll>=0 && r.beastShowRoll<1)) badShow++;
    if(!r.sharkCut && r.beastShowBudgetBp!==r.payoutBp+r.carryOutBp) badShow++;
    if(r.whaleTriggered){
      shows++;
      if(expectedTier<0 || r.whaleEscaped!==decision.lineBroken
         || r.beastLineBroken!==decision.lineBroken || r.beastShowBp!==r.payoutBp
         || r.whaleTier!==expectedTier) badShow++;
    } else if(expectedTier>=0 || r.beastShowBp!==0 || r.whaleTier!==-1
              || r.beastLineBroken || r.whaleEscaped) badShow++;
    if(r.anteBp>0) anteRounds++;
    anteHitTotal += r.anteHits; poolTotal += r.poolBp; spendTotal += r.spendBp;
    openTotal += Math.round(r.poolMult*BP);                  // the opening draw's budget (pre-ante)
    segTotal += anteSegmentsThrough(r.stopL);
    if(r.baseBp>maxBase) maxBase=r.baseBp;
    if(r.payoutBp>maxTotal) maxTotal=r.payoutBp;
    if(r.payoutBp>0) wins++;
  }
  ok('base lane in [0, ×500]', badBase===0, 'violations='+badBase);
  ok('THE POOL IS A CEILING (payout ≤ pool; ×0 pays nothing)', badPool===0, 'violations='+badPool);
  ok('beast show walks high→low budget rules and a held beast consumes carry',
     badShow===0 && badSum===0,
     'violations='+badShow+' · qualified='+qualified+' · shows='+shows
     +' · show/qualified='+(qualified?shows/qualified*100:0).toFixed(1)+'%');
  ok('payout + carry remains sealed; beast value is visible carry collection', badSum===0);
  /* v2.4 ── THE ANTE IS A BET, NOT A TAX ────────────────────────────────
     The v2.3 form checked E[pool] = 96% of spend, but that broke once the
     opening draw could land a beast mult (pool inflates to ~142% pre-shark).
     The invariant that actually separates the ante from a fee is its MARGINAL
     return: each quarter-stake the descent takes must buy budget back at the
     ordinary table's expectation (ANTE_EV), not vanish. A fee would read 0
     here; a promotion-to-beast exploit would read far above ANTE_EV. */
  const anteBudgetAdded = poolTotal - openTotal;            // pool the antes bought
  const anteStake = anteHitTotal * ANTE_AMT * BP;           // stake the antes cost
  const anteMarginalEV = anteBudgetAdded / anteStake;
  ok('ANTE IS A BET: marginal EV ≈ ordinary table EV (not a tax, not a beast windfall)',
     Math.abs(anteMarginalEV - ANTE_EV) < 0.02,
     'ante EV '+(anteMarginalEV*100).toFixed(1)+'%  vs table '+(ANTE_EV*100).toFixed(1)+'%');
  const anteRate = anteHitTotal/segTotal;
  ok('ante fires on EVERY configured charged segment', Math.abs(anteRate - 1) < 0.001,
     'rate = '+(anteRate*100).toFixed(2)+'%  ·  '+(anteHitTotal/n).toFixed(2)
     +' antes/round @L'+REF_L);
  console.log('     win-rate @L'+REF_L+' ≈ '+(wins/n*100).toFixed(1)
     +'%   max base ×'+(maxBase/BP).toFixed(1)+'   max total ×'+(maxTotal/BP).toFixed(1));
  // Segments before the configured ante band must remain free.
  const firstAnteBand=BANDS.findIndex(b=>(ANTE_P[b]||0)>0);
  const freeDepth=firstAnteBand>0 ? BAND_EDGES[firstAnteBand] : 0;
  let shFee=0;
  for(let i=0;i<20000 && freeDepth>0;i++){
    const r=simRound(seedOf(i), fixedStop(freeDepth));
    if(r.anteBp>0) shFee++;
  }
  ok('segments before the configured ante band are never charged',
     freeDepth===0 || shFee===0, 'violations='+shFee);
}

/* ---------- 4. SHARK VERDICT (v2.18) — presentation-only; budget safe ----- */
console.log('=== 4. SHARK VERDICT — pool-independent performance; all value carries ===');
{
  const n=Math.min(ROUNDS,80000); let cuts=0, badCarry=0, segments=0, contacts=0;
  for(let i=0;i<n;i++){
    const r=simRound(seedOf(i), fixedStop(LAYERS));
    segments+=r.stopL; contacts+=r.contacts;
    if(r.sharkCut){
      cuts++;
      if(r.payoutBp!==0 || r.carryOutBp!==r.ordinaryPoolBp+r.carryInBp) badCarry++;
    }
  }
  const spawnRate=contacts/segments, cutRate=cuts/segments;
  ok('shark cuts preserve current pool + incoming safe-bank in carry', badCarry===0,
     `cuts=${cuts} · carry violations=${badCarry}`);
  ok('shark appearance and bite performance match configured flat probabilities',
     Math.abs(spawnRate-CFG.sharkSpawnP)<0.01 && Math.abs(cutRate-CFG.sharkSpawnP*CFG.sharkBiteP)<0.004,
     `spawn/segment=${(spawnRate*100).toFixed(2)}% · cut/segment=${(cutRate*100).toFixed(2)}%`);
}
}

/* ---------- 5. RTP TABLE (the P1v2 tuning surface) ---------- */
console.log('=== 5. RTP by fixed stop — presentation-independent total ===');
{
  const rows=[]; const fixedRtps=new Map(); let maxFixed=0, maxFixedL=0;
  for(const L of PROFILE_DEPTHS){
    let pay=0,spend=0,snap=0,n=0,mx=0,shows=0,carry=0;
    for(let i=0;i<ROUNDS;i++){ const r=simRound(seedOf(i), fixedStop(L), carry);
      pay+=r.payoutBp; spend+=r.spendBp;
      if(r.snapped)snap++; if(r.whaleTriggered)shows++; n++; if(r.payoutBp>mx)mx=r.payoutBp;
      carry=r.carryOutBp;
    }
    pay+=carry;
    const fixedRtp=pay/spend; fixedRtps.set(L,fixedRtp);
    if(fixedRtp>maxFixed){ maxFixed=fixedRtp; maxFixedL=L; }
    rows.push(`  L${String(L).padStart(2)} ${bandOf(L).padEnd(8)} RTP ${(fixedRtp*100).toFixed(1).padStart(6)}%  cut ${(snap/n*100).toFixed(1).padStart(5)}%  beast-show 1/${shows?Math.round(n/shows):'—'}  max ×${(mx/BP).toFixed(0)}`);
  }
  console.log(rows.join('\n'));
  console.log(`  fixed-stop ceiling L${maxFixedL} = ${(maxFixed*100).toFixed(1)}%   ${maxFixed<1?'(<100% ✓)':'(≥100% ✗ EXPLOITABLE — blind strategy beats the house)'}`);
  if(maxFixed>=1) fails++;
  const shallowL=BAND_ENDS.SHALLOWS, shallow=fixedRtps.get(shallowL);
  const deepBand=PROFILE_DEPTHS.filter(L=>L>=REF_L).map(L=>fixedRtps.get(L));
  ok('SHALLOWS stays within 4pp of the sealed-pool target',
     Math.abs(shallow-POOL_RTP)<=0.04,
     `L${shallowL} ${(shallow*100).toFixed(2)}% vs target ${(POOL_RTP*100).toFixed(2)}%`);
  ok('lower-half depths converge to the sealed-pool target',
     deepBand.every(x=>Math.abs(x-POOL_RTP)<=0.025),
     `range ${(Math.min(...deepBand)*100).toFixed(2)}–${(Math.max(...deepBand)*100).toFixed(2)}%`);
  for(const k of [1.5,2,3,5]){
    let pay=0,spend=0,n=0,carry=0; for(let i=0;i<Math.min(ROUNDS,80000);i++){ const r=simRound(seedOf(i), timid(k), carry); pay+=r.payoutBp; spend+=r.spendBp; carry=r.carryOutBp; n++; }
    pay+=carry;
    console.log(`  timid ≥${k}×spend   RTP ${(pay/spend*100).toFixed(1)}%`);
  }
  // --- THE GATE: how PEOPLE play (v2.1f) ---
  let bestHuman=0, bestHumanTh=0;
  for(const th of [1.0,1.2,1.5,2,3,5]){
    let pay=0,spend=0,carry=0; const n=Math.min(ROUNDS,60000);
    for(let i=0;i<n;i++){ const r=humanRound(seedOf(i), th, undefined, carry); pay+=r.payoutBp; spend+=r.spendBp; carry=r.carryOutBp; }
    pay+=carry;
    const rtp=pay/spend;
    if(rtp>bestHuman){ bestHuman=rtp; bestHumanTh=th; }
    console.log(`  human cash-out ≥${th}×  RTP ${(rtp*100).toFixed(1)}%   ${rtp<1?'(<100% ✓)':'(≥100% ✗ EXPLOITABLE)'}`);
    if(rtp>=1) fails++;
  }
  console.log(`  → best human play = ≥${bestHumanTh}× @ ${(bestHuman*100).toFixed(1)}%  (NOMINAL RTP)`);
  /* REACTION SENSITIVITY — how much a faster pair of hands is worth. If this
     spread is wide the game's RTP is not a property of the game, it is a
     property of the player's reflexes, which no operator can publish. */
  {
    const keep=REACTION, out=[];
    for(const rx of [0.15,0.28,0.45]){
      REACTION=rx; let pay=0,spend=0,carry=0; const n=Math.min(ROUNDS,25000);
      for(let i=0;i<n;i++){ const r=humanRound(seedOf(i), bestHumanTh, undefined, carry); pay+=r.payoutBp; spend+=r.spendBp; carry=r.carryOutBp; }
      pay+=carry;
      out.push(`${rx}s→${(pay/spend*100).toFixed(0)}%`);
    }
    REACTION=keep;
    console.log(`  reaction sensitivity @≥${bestHumanTh}× : ${out.join('  ')}   (wide spread = RTP depends on reflexes)`);
  }
  // --- the oracle: information only, NOT a gate (P6 hardening; ECONOMY-V2 §6) ---
  {
    let pay=0,spend=0,carry=0; const n=Math.min(ROUNDS,40000);
    for(let i=0;i<n;i++){ const r=oracleRound(seedOf(i), 1.6, carry); pay+=r.payoutBp; spend+=r.spendBp; carry=r.carryOutBp; }
    pay+=carry;
    console.log(`  [info] perfect-foresight bot ≈ ${(pay/spend*100).toFixed(0)}%  — deferred to P6, not gating`);
  }
  /* --- BEAST SHOW FREQUENCY — derived from paid result, never a draw target --- */
  {
    let n=0, carry=0; const appear=[0,0,0], broken=[0,0,0];
    for(let i=0;i<ROUNDS;i++){
      const r=simRound(seedOf(i), fixedStop(REF_L), carry); n++;
      if(r.whaleTriggered && r.whaleTier>=0){
        appear[r.whaleTier]++;
        if(r.beastLineBroken) broken[r.whaleTier]++;
      }
      carry=r.carryOutBp;
    }
    const f=(x)=>x? '1/'+Math.round(n/x):'—';
    console.log('  BEAST SHOW @L'+REF_L+' (guaranteed multiplier ladder + PULL event chain):');
    for(let t=2;t>=0;t--){
      const rule=BEAST_SHOW_RULES[t];
      console.log(`    ${BEAST_TIER_NAME[t].padEnd(11)} ×${rule.min}+ @${(rule.p*100).toFixed(0)}%  ${f(appear[t])}`
        +` · event-budget-break ${f(broken[t])}`);
    }
  }
}

if(!TUNE) console.log('\n'+(fails===0 ? '✅ v2.21 engine: all correctness/determinism gates PASS' : '❌ '+fails+' gate(s) FAILED'));
process.exit(fails===0?0:1);
