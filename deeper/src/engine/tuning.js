/* ============================================================
   DEEPER v2 — TUNING SUMMARY (v2.12 anonymous sealed-pool).

   ONE function the browser tuner AND the CLI can call to get every headline
   number for a given CFG: RTP by depth, the fixed-stop ceiling (the exploit
   gate), event frequencies (beast show per tier, shark cut, ante rate),
   win/hit rate. It runs the REAL simRound, so the tool can never drift from the
   game — what the tuner shows is what the engine does.

   Deterministic: no Date/Math.random. Seeds are fixed strings.
   ============================================================ */
import {
  applyCfg, CFG, BP, bandOf, BEAST_TIER_NAME, BEAST_SHOW_RULES,
  POOL_RTP, ANTE_EV, ANTE_AMT, LAYERS,
} from './world.js';
import { simRound } from './round.js';

const seedOf = (i) => 'deepertune:' + i;
const fixedStop = (L) => (v) => v.L >= L ? 'PULL' : 'SINK';
// a human-ish policy: cash out once the shown potential clears th× the spend,
// or bail at a depth cap. Mirrors how a real player reads the dock's "≈".
const humanCashout = (th, maxL) => (v) => (v.potentialBp >= th * v.spendBp || v.L >= maxL) ? 'PULL' : 'SINK';

/* simSummary(cfg, opts) — apply cfg (or null to use current), run the sim, and
   return a plain object of everything the tuner renders. opts:
     rounds  (default 12000) — per fixed-stop depth; the tuner trades a little
             noise for responsiveness, the CLI can pass 200000 for a freeze.
     depths  — the fixed-stop ladder to profile.
     refL    — the reference depth for frequency readouts (default 20). */
export function simSummary(cfg, opts = {}) {
  if (cfg) applyCfg(cfg);
  const rounds = opts.rounds || 12000;
  const depths = opts.depths || [3, 6, 9, 12, 15, 18, 20, 22, 24, 26, 28, 30];
  const refL = opts.refL || 20;

  /* progress: the depth loop is the bulk (N steps), then the freq pass and the
     human pass. Reported as a fraction over depths+2 total steps. In the worker
     this posts a message per step so the main thread can animate a real bar. */
  const onProgress = opts.onProgress || (() => {});
  const totalSteps = depths.length + 2;
  let step = 0;

  /* v2.5 — each policy is now a SEQUENCE, not independent rounds: the residual
     one round leaves rolls into the next (carry). RTP = total paid / total spent
     over the run; the residual still owed at the end is added to `pay` so the
     figure is exact. This is what makes best-simple-play ≈ the ceiling. */
  // --- RTP by fixed-stop depth (the shape of "how deep do I dare") ---
  const rtpByDepth = [];
  let ceiling = { L: 0, rtp: 0 };
  for (const L of depths) {
    let pay = 0, spend = 0, base = 0, whale = 0, cut = 0, n = 0, mx = 0, carry = 0;
    for (let i = 0; i < rounds; i++) {
      const r = simRound(seedOf(i), fixedStop(L), carry);
      pay += r.payoutBp; spend += r.spendBp; whale += r.whaleBp;
      if (r.sharkCut) cut++; n++; if (r.payoutBp > mx) mx = r.payoutBp;
      carry = r.carryOutBp;
    }
    pay += carry;                             // the final unclaimed residual is still owed
    base = pay - whale;                       // paid carry is ordinary-lane value
    const rtp = spend ? pay / spend : 0;
    rtpByDepth.push({ L, band: bandOf(L), rtp, base: base / spend, whale: whale / spend, cutRate: cut / n, maxWin: mx / BP });
    if (rtp > ceiling.rtp) ceiling = { L, rtp };
    onProgress(++step / totalSteps);
  }

  // --- event frequencies at the reference depth (also a carry sequence) ---
  let n = 0, wins = 0, hits = 0, anteHits = 0, cutRef = 0, refSegments=0, fcarry = 0;
  let greatWhiteTeaseRounds=0, greatWhiteBiteRounds=0, mosasaurStageRounds=0;
  const appear = [0, 0, 0], lineBreaks=[0,0,0], awardMultTotals=[0,0,0];
  for (let i = 0; i < rounds; i++) {
    const r = simRound(seedOf(i), fixedStop(refL), fcarry); n++;
    if (r.payoutBp > 0) wins++;
    if (r.payoutBp >= r.spendBp) hits++;              // returned the stake or better
    anteHits += r.anteHits; if (r.sharkCut) cutRef++;
    refSegments+=Math.max(1,r.stopL);
    /* Presentation funnel spans BOTH casting paths. Every real beast begins
       with the GREAT WHITE tease/bite stage; PULL-event false teases add only
       to the first count. Counting pullBeastTeased alone hid all guaranteed
       multiplier shows and could make "tease" look rarer than the shark. */
    if(r.whaleTease) greatWhiteTeaseRounds++;
    if(r.whaleTriggered) greatWhiteBiteRounds++;
    if(r.whaleTriggered && r.beastTier>=1) mosasaurStageRounds++;
    if (r.whaleTriggered && r.beastTier >= 0) {
      appear[r.beastTier]++;
      awardMultTotals[r.beastTier] += r.beastShowBp / BP;
      if(r.beastLineBroken) lineBreaks[r.beastTier]++;
    }
    fcarry = r.carryOutBp;
  }
  const beast = BEAST_TIER_NAME.map((name, t) => ({
    name,
    appearOneIn: appear[t] ? n / appear[t] : 0,
    avgAwardMult: appear[t] ? awardMultTotals[t] / appear[t] : 0,
    lineBreakOneIn: lineBreaks[t] ? n / lineBreaks[t] : 0,
    lineBreakRate: appear[t] ? lineBreaks[t] / appear[t] : 0,
    min: BEAST_SHOW_RULES[t].min,
    max: Infinity,
    p: BEAST_SHOW_RULES[t].p,
  }));
  onProgress(++step / totalSteps);

  // --- best simple human strategy (the nominal-play RTP) ---
  let humanBest = 0, humanTh = 0;
  const hn = Math.min(rounds, 8000);
  for (const th of [1, 1.5, 2, 3, 5]) {
    let pay = 0, spend = 0, carry = 0;
    for (let i = 0; i < hn; i++) { const r = simRound(seedOf(i), humanCashout(th, LAYERS), carry); pay += r.payoutBp; spend += r.spendBp; carry = r.carryOutBp; }
    pay += carry;
    const rtp = spend ? pay / spend : 0;
    if (rtp > humanBest) { humanBest = rtp; humanTh = th; }
  }
  onProgress(1);

  return {
    rounds, refL,
    poolRTP: POOL_RTP, anteEV: ANTE_EV, anteAmt: ANTE_AMT,
    rtpByDepth, ceiling, ceilingSafe: ceiling.rtp < 1,
    humanBest, humanTh,
    winRate: wins / n, hitRate: hits / n,
    antesPerRound: anteHits / n, cutRateRef: cutRef / n,
    cutPerSegment: cutRef / Math.max(1,refSegments),
    greatWhiteTeaseOneIn: greatWhiteTeaseRounds ? n/greatWhiteTeaseRounds : 0,
    greatWhiteTeaseToBite: greatWhiteTeaseRounds ? greatWhiteBiteRounds/greatWhiteTeaseRounds : 0,
    greatWhiteToMosasaur: greatWhiteBiteRounds ? mosasaurStageRounds/greatWhiteBiteRounds : 0,
    beast, beastShowRules:BEAST_SHOW_RULES.map(r=>({...r})),
    // echo the config back so the tuner can show Σp and flag a mis-summed table
    poolSumP: [...CFG.poolExact, ...CFG.poolRange].reduce((a, r) => a + r.p, 0),
  };
}
