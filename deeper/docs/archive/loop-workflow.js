export const meta = {
  name: 'deeper-sink-decision-brainstorm',
  description: 'Multi-role brainstorm: make "whether to sink" a real bank-vs-risk gamble decision at EVERY ledge (not just deep). Diverge -> red-team -> converge to a locked mechanic spec -> build -> economy reasoning. RTP re-sim is done by the human after.',
  whenToUse: 'Owner wants every sink to be a weighed bet for true gamble feel; agents brainstorm the mechanic',
  phases: [
    { title: 'Brainstorm', detail: '5 distinct lenses each propose a per-ledge bank-vs-risk mechanic' },
    { title: 'Converge', detail: 'red-team the field, then synthesize ONE locked mechanic spec' },
    { title: 'Build', detail: 'game engineer implements the mechanic; mark the RTP dial' },
    { title: 'Economy', detail: 'economist reasons about EV/RTP direction + dial recommendation' },
  ],
}

const GAME = '/Users/hao/Documents/game-deeper/deeper.html'
const SPEC = '/Users/hao/Documents/game-deeper/docs/design-system.md'

const PROBLEM = [
  'PRODUCT: DEEPER — accumulate-bet one-pull fishing CRASH game, category "PLAYABLE GAMBLING", differentiator = player AGENCY. Loop: DROP stake -> hook sinks past multiplier fish that SUM -> PULL once to bank the summed multipliers (PULL consumes the stake; it pays only the caught-fish multiplier sum).',
  'THE OWNER\'S PROBLEM (the brief for this brainstorm): "whether to sink must FULLY become part of the decision-making — only then is there gamble feel." Today the decision is NOT real every ledge. Diagnosis: ledges L1-6 (SHALLOWS+REEF) are FREE with NO snap and NO bleed, so sinking there is a dominant no-brainer — you just always sink. Real bank-vs-risk tension only switches on at L7+ (paid EXTEND + snap risk + bleed). So the first half of the descent has no gamble decision at all.',
  'GOAL: every single ledge must be a genuine, FELT "bank what I have now vs risk it to go deeper for more" bet — with legible stakes — while preserving the agency identity and (critically) a sim-green economy.',
  'CURRENT MECHANICS (design on top of these, know them exactly): 12 ledges, 3 bands. Free auto/again in L1-6; paid EXTEND L7-12 (extra stake charged on entry). Deep snap chance snapP(L)=0.01+(L-7)*0.006 (total loss). Bleed (caught fish wriggle loose) 2% normal / 8% high-value, deep only. Anticipation beat + snap-risk telegraph deep only. SCALE=0.039 is the MASTER RTP dial; CATCH_P=0.38. Solved optimal-stop = L10 @ ~96.9% RTP, inverted-U EV curve peaking ~L10, ~3.1% house edge. There is an in-browser Monte-Carlo harness (sim 10k / 200k) that is the economy gate.',
  'HARD CONSTRAINT: the mechanic must remain RTP-tunable so a single dial (SCALE or a clearly-named new constant) still monotonically sets RTP and the human can re-green it at ~96.9% via the 200k sim. Do NOT propose anything that makes RTP strategy-DEPENDENT in a way that breaks the house edge (a known failure mode: stacking summing+injection can gift an exploit). The optimal-stopper must not find a >100% policy.',
  'ART/IDENTITY LAW: read ' + SPEC + '. Black-gold temperature axis, gold=specular metal, petrol-violet=loss, instrument-panel dock. Any new readout must fit this, not bolt on generic UI.',
].join('\n\n')

const PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['lens', 'mechanicName', 'oneLine', 'perLedgeDecision', 'riskCurve', 'uiReadout', 'rtpStrategy', 'identityFit', 'weaknesses'],
  properties: {
    lens: { type: 'string' },
    mechanicName: { type: 'string' },
    oneLine: { type: 'string' },
    perLedgeDecision: { type: 'string', description: 'exactly how EVERY ledge (incl L1-6) becomes a real bank-vs-risk choice' },
    riskCurve: { type: 'string', description: 'how cost/risk-to-banked-value scales across L1..L12' },
    uiReadout: { type: 'string', description: 'what the player sees each ledge to make the bet legible' },
    rtpStrategy: { type: 'string', description: 'which single dial keeps it sim-green and predicted RTP direction' },
    identityFit: { type: 'string' },
    weaknesses: { type: 'array', items: { type: 'string' } },
  },
}

const SPEC_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['mechanicName', 'summary', 'whyEveryLedgeIsADecision', 'perLedgeRules', 'riskCurve', 'uiSpec', 'economyPlan', 'implementationSteps', 'borrowedFrom'],
  properties: {
    mechanicName: { type: 'string' },
    summary: { type: 'string' },
    whyEveryLedgeIsADecision: { type: 'string' },
    perLedgeRules: { type: 'array', items: { type: 'string' } },
    riskCurve: { type: 'string' },
    uiSpec: { type: 'array', items: { type: 'string' } },
    economyPlan: { type: 'string', description: 'the dial to tune, target RTP band, what the human re-sims, how the optimal-stopper stays <100%' },
    implementationSteps: { type: 'array', items: { type: 'string' } },
    borrowedFrom: { type: 'array', items: { type: 'string' }, description: 'which proposals/ideas were merged' },
  },
}

const BUILD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['filesTouched', 'summary', 'tunableConstants', 'simHarnessOk', 'risks'],
  properties: {
    filesTouched: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    tunableConstants: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'line', 'effect'], properties: { name: { type: 'string' }, line: { type: 'string' }, effect: { type: 'string' } } } },
    simHarnessOk: { type: 'boolean' },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

const ECON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['evReasoning', 'predictedRtpDirection', 'recommendedDialStart', 'keepsGreenPlan', 'exploitCheck'],
  properties: {
    evReasoning: { type: 'string' },
    predictedRtpDirection: { type: 'string' },
    recommendedDialStart: { type: 'string', description: 'a concrete starting SCALE (or new dial) value to try in the first 200k sim' },
    keepsGreenPlan: { type: 'string' },
    exploitCheck: { type: 'string', description: 'why no per-ledge strategy yields >100% RTP' },
  },
}

const LENSES = [
  { key: 'gamble-psych', persona: 'Gamble Psychologist. Your obsession: loss aversion, the endowment effect (once value is "banked-in-hand" the player dreads losing it), near-miss, and the dread/greed oscillation. Design the per-ledge bet so the player FEELS they are risking something they already own, from ledge one.' },
  { key: 'crash-economist', persona: 'Crash-game Economist. You think in EV curves and house edge. Design a per-ledge risk/cost structure that creates a real decision every ledge yet stays RTP-tunable via one monotonic dial, with the optimal-stopper provably <100%.' },
  { key: 'systems-designer', persona: 'Systems/Mechanics Designer. You care about clean, legible rules and how the SINK/PULL/EXTEND verbs compose. Make every ledge a meaningful fork without bolting on clutter; reuse existing systems (bleed, snap, sigma) where possible.' },
  { key: 'feel-engineer', persona: 'Feel/Juice Engineer. You make the decision VISCERAL moment-to-moment — the held breath before committing a sink, the telegraph of what is at stake, the sting when greed costs you. Tie the bet to felt feedback every ledge.' },
  { key: 'contrarian', persona: 'Contrarian/Red-teamer. You distrust the obvious answer (just add bleed everywhere). Propose a genuinely different angle to make every sink a decision (e.g. opportunity cost, ratchets, escalating ante, partial cash-out, sacrifice) and pre-empt how each obvious fix fails.' },
]

// ---------- Brainstorm ----------
phase('Brainstorm')
const proposals = (await parallel(LENSES.map((L) => () =>
  agent(
    'You are the ' + L.persona + '\n\n' + PROBLEM + '\n\n'
    + 'Read ' + GAME + ' enough to ground yourself in the real mechanics, then propose ONE concrete mechanic that makes "whether to sink" a genuine bank-vs-risk decision at EVERY ledge. Be specific and implementable. State honestly how it keeps RTP sim-green via one dial, and your proposal\'s own weaknesses.',
    { schema: PROPOSAL_SCHEMA, label: 'propose:' + L.key, phase: 'Brainstorm' },
  ),
))).filter(Boolean)
log('Brainstorm — ' + proposals.length + ' proposals: ' + proposals.map((p) => p.mechanicName).join(' · '))

// ---------- Converge: red-team then synthesize ----------
phase('Converge')
const redteam = await agent(
  'You are a hostile Red-team Critic. Here are ' + proposals.length + ' proposed mechanics to make every sink a real decision in DEEPER:\n\n' + JSON.stringify(proposals) + '\n\n' + PROBLEM + '\n\n'
  + 'For EACH proposal, find the fatal flaw: does it actually make L1-6 a real decision or just add busywork? does it break the house edge or create a dominant strategy? does it clutter the 3-second read? Rank them and say which ideas are worth merging and which to kill. Return a sharp written critique.',
  { label: 'red-team', phase: 'Converge' },
)
const lockedSpec = await agent(
  'You are the Lead Game Designer + PM, converging the brainstorm into ONE locked mechanic. Proposals:\n\n' + JSON.stringify(proposals) + '\n\nRED-TEAM CRITIQUE:\n\n' + redteam + '\n\n' + PROBLEM + '\n\n'
  + 'Synthesize the single best mechanic (merge the strongest ideas, drop the flawed ones) that makes EVERY ledge a genuine, legible bank-vs-risk bet, fits the identity, and stays RTP-tunable + exploit-free. Output a concrete, implementable spec: per-ledge rules, the risk/cost curve L1..L12, the UI readout, the economy plan (which dial, target ~96.9%, how the optimal-stopper stays <100%), and ordered implementation steps.',
  { schema: SPEC_SCHEMA, label: 'converge-spec', phase: 'Converge' },
)
log('Converged on: ' + lockedSpec.mechanicName)

// ---------- Build ----------
phase('Build')
const build = await agent(
  'You are the Game Engineer. Read ' + SPEC + ' and the whole current ' + GAME + ', then implement this LOCKED mechanic spec:\n\n' + JSON.stringify(lockedSpec, null, 1) + '\n\n' + PROBLEM + '\n\n'
  + 'STRICT: edit ONLY ' + GAME + '. Never delete/move any file, never touch .claude/ or serve.js. Implement the per-ledge bank-vs-risk decision, the risk curve, and the legible readout in the black-gold instrument identity. Keep the in-browser Monte-Carlo sim harness FUNCTIONAL and make the RTP dial obvious and well-commented so a human can re-green it. It is expected that RTP shifts — your job is correct mechanics + a clean dial, not the final number. Zero console errors, single-file, no deps. Return filesTouched, a summary, the tunable constants (name + line + effect on RTP), whether the sim harness still runs, and risks.',
  { schema: BUILD_SCHEMA, label: 'build:game', phase: 'Build' },
)
log('Built — sim harness ok: ' + build.simHarnessOk + ' — ' + build.tunableConstants.length + ' tunable constants')

// ---------- Economy reasoning ----------
phase('Economy')
const econ = await agent(
  'You are the Crash-game Economist. The mechanic just implemented:\n\n' + JSON.stringify(lockedSpec.economyPlan) + '\n\nBUILD REPORT:\n\n' + JSON.stringify(build) + '\n\n' + PROBLEM + '\n\n'
  + 'Read the economy/PRNG/sim code in ' + GAME + '. Reason about the new EV per ledge and the inverted-U. Predict which way RTP moved and give a concrete starting dial value for the human\'s first 200k sim to land back near 96.9%. Prove no per-ledge strategy yields >100% RTP (exploit check).',
  { schema: ECON_SCHEMA, label: 'economy', phase: 'Economy' },
)
log('Economy — predicted RTP ' + econ.predictedRtpDirection + ' · try dial ' + econ.recommendedDialStart)

return {
  mechanic: lockedSpec.mechanicName,
  spec: lockedSpec,
  proposals: proposals.map((p) => ({ lens: p.lens, name: p.mechanicName, oneLine: p.oneLine })),
  build,
  economy: econ,
}
