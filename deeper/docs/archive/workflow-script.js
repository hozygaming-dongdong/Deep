export const meta = {
  name: 'fishing-bet-game-design',
  description: 'Five AI roles debate and iterate a fishing-themed accumulate-bet casino game to international standard',
  phases: [
    { title: 'Vision', detail: '5 roles each pitch their initial vision in parallel' },
    { title: 'Debate', detail: 'PM synthesizes; specialists critique; PM scores against an international-casino rubric; loop until pass' },
    { title: 'Spec', detail: 'Final RTP math model, chosen art direction, and build brief' },
  ],
}

// ---------- Shared concept brief given to every agent ----------
const CONCEPT = `
GAME CONCEPT — "accumulate-bet, one-pull payout" fishing casino game.
- Mobile portrait-first, fully English, international real-money casino audience.
- Core loop: each BET sinks a fishing hook DOWN a small segment. As the hook descends,
  the player SEES multiplier fish (e.g. x2, x5, x50) and surprise triggers appear at
  various depths. This tension keeps the player betting "one more" to sink deeper.
- At any moment the player chooses to PULL UP. The hook rises and COLLECTS / hooks the
  fish it passes on the way up — paying out everything caught at once. ONE big WIN.
- The novelty: a "BET BET BET ... xN, then one WIN" rhythm. The bet is the cost of risk
  (sink deeper = more potential, but the catch can also escape / dwindle).
- Precedent: the team has shipped HTML casino games with rigorously tuned RTP before.
This must FEEL like a premium international slot/crash-style game, not a system tool, not generic AI-flavored.
`

const ROLE_PRIMER = {
  pm: `You are the PRODUCT MANAGER. You own the bar: does this reach international real-money casino quality (think the polish of Evolution/Pragmatic/Spribe titles)? You care about: clarity of the core loop in <10s, the bet->tension->cashout emotional arc, session length & re-trigger, fairness/transparency, and whether every other discipline is pulling toward one coherent product.`,
  design: `You are the GAME DESIGNER / MATH DESIGNER. You own gameplay feel AND the math model. You care about: the sink mechanic (how far per bet, escalating depth/risk), how multiplier fish are placed and revealed, the pull-up collection rules, surprise/bonus triggers, the risk-reward curve, near-miss design, volatility, and a tunable RTP model. Be concrete with numbers.`,
  art: `You are the ART / CREATIVE DIRECTOR. You own look, motion and identity. Propose 2-3 distinct visual directions (e.g. deep-sea neon premium / bright cartoon / golden luxury) with palette, lighting, fish design language, the hook/line treatment, the depth-meter visual, juice & animation language, and how the cashout moment looks/feels. Recommend one.`,
  market: `You are the MARKET / GROWTH MANAGER. You own positioning, target geos, monetization framing, retention hooks, virality, and competitive differentiation vs existing crash/fishing/slot games. You care about whether the theme+math fit the chosen markets and what makes this title chartable.`,
  tech: `You are the TECH / GAME ENGINEER. You own feasibility as a single-file mobile-portrait HTML game (no framework, pure JS/CSS/SVG/Canvas). You care about: 60fps animation budget, provably-fair-style deterministic RNG, state machine for bet/sink/pull, performance on mid phones, and flagging anything the others propose that is impractical. Keep it buildable.`,
}

const rolesText = (obj) => Object.entries(obj).map(([k, v]) => `### ${k}\n${v}`).join('\n\n')

// ---------- Schemas ----------
const CRITIQUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['role', 'strengths', 'problems', 'mustFix', 'suggestions'],
  properties: {
    role: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'string' } },
    mustFix: { type: 'array', items: { type: 'string' }, description: 'blocking issues that keep this below international casino bar' },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
}

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'dimensions', 'verdict', 'directives', 'rationale'],
  properties: {
    score: { type: 'number', description: 'overall 0-100 vs international real-money casino bar' },
    dimensions: {
      type: 'object',
      additionalProperties: false,
      required: ['coreLoopClarity', 'emotionalArc', 'mathSoundness', 'visualPremium', 'marketFit', 'feasibility'],
      properties: {
        coreLoopClarity: { type: 'number' },
        emotionalArc: { type: 'number' },
        mathSoundness: { type: 'number' },
        visualPremium: { type: 'number' },
        marketFit: { type: 'number' },
        feasibility: { type: 'number' },
      },
    },
    verdict: { type: 'string', enum: ['pass', 'iterate'] },
    directives: { type: 'array', items: { type: 'string' }, description: 'concrete instructions for the next synthesis round' },
    rationale: { type: 'string' },
  },
}

const MATH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['targetRTP', 'volatility', 'betModel', 'depthModel', 'fishTable', 'pullUpRules', 'bonusTriggers', 'rtpDerivation', 'tuningKnobs'],
  properties: {
    targetRTP: { type: 'string' },
    volatility: { type: 'string' },
    betModel: { type: 'string', description: 'bet sizes, currency, what one bet costs and does' },
    depthModel: { type: 'string', description: 'how far the hook sinks per bet, depth tiers, escalating risk' },
    fishTable: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tier', 'multiplier', 'spawnWeight', 'depthBand', 'notes'], properties: { tier: { type: 'string' }, multiplier: { type: 'string' }, spawnWeight: { type: 'string' }, depthBand: { type: 'string' }, notes: { type: 'string' } } } },
    pullUpRules: { type: 'string', description: 'exactly what the pull collects, escape/dwindle mechanics, how payout is computed' },
    bonusTriggers: { type: 'array', items: { type: 'string' } },
    rtpDerivation: { type: 'string', description: 'how the numbers combine to hit target RTP' },
    tuningKnobs: { type: 'array', items: { type: 'string' } },
  },
}

const ART_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chosenDirection', 'rationale', 'palette', 'typography', 'fishDesignLanguage', 'hookAndLine', 'depthMeter', 'motionLanguage', 'cashoutMoment', 'antiGenericNotes'],
  properties: {
    chosenDirection: { type: 'string' },
    rationale: { type: 'string' },
    palette: { type: 'array', items: { type: 'string' }, description: 'hex codes with role labels' },
    typography: { type: 'string' },
    fishDesignLanguage: { type: 'string' },
    hookAndLine: { type: 'string' },
    depthMeter: { type: 'string' },
    motionLanguage: { type: 'string' },
    cashoutMoment: { type: 'string' },
    antiGenericNotes: { type: 'string', description: 'specific things to avoid generic-AI / system-tool look' },
  },
}

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['oneLiner', 'coreLoopSpec', 'screens', 'uiLayout', 'interactionStates', 'juiceChecklist', 'mvpScope', 'openRisks'],
  properties: {
    oneLiner: { type: 'string' },
    coreLoopSpec: { type: 'string', description: 'step-by-step the exact loop to implement' },
    screens: { type: 'array', items: { type: 'string' } },
    uiLayout: { type: 'string', description: 'portrait layout zones top-to-bottom' },
    interactionStates: { type: 'array', items: { type: 'string' }, description: 'state machine states and transitions' },
    juiceChecklist: { type: 'array', items: { type: 'string' } },
    mvpScope: { type: 'string', description: 'what the first playable HTML prototype must include' },
    openRisks: { type: 'array', items: { type: 'string' } },
  },
}

// ---------- PHASE 1: VISION ----------
phase('Vision')
const visions = await parallel([
  () => agent(`${CONCEPT}\n\nYour role:\n${ROLE_PRIMER.pm}\n\nGive your opening vision for this product: what is the single most important thing that makes it world-class, the emotional promise, and the top 3 risks. ~250 words.`, { label: 'vision:PM', phase: 'Vision' }),
  () => agent(`${CONCEPT}\n\nYour role:\n${ROLE_PRIMER.design}\n\nPropose the first concrete version of the gameplay: the sink-per-bet mechanic, how multiplier fish appear/are placed by depth, the pull-up collection rule, surprise triggers, and an initial rough RTP/volatility approach with real numbers. ~350 words.`, { label: 'vision:Design', phase: 'Vision' }),
  () => agent(`${CONCEPT}\n\nYour role:\n${ROLE_PRIMER.art}\n\nPropose 2-3 distinct visual directions with palettes and the feel of the cashout moment. Recommend one and say why for an international audience. ~350 words.`, { label: 'vision:Art', phase: 'Vision' }),
  () => agent(`${CONCEPT}\n\nYour role:\n${ROLE_PRIMER.market}\n\nDefine target geos, positioning, how it differs from existing crash/fishing games, monetization framing, and the retention/virality hooks the design must support. ~300 words.`, { label: 'vision:Market', phase: 'Vision' }),
  () => agent(`${CONCEPT}\n\nYour role:\n${ROLE_PRIMER.tech}\n\nAssess feasibility as a single-file portrait HTML game. Recommend the rendering approach (Canvas vs SVG/DOM), the state machine, the RNG approach, the 60fps budget, and flag any concept element that will be hard. ~300 words.`, { label: 'vision:Tech', phase: 'Vision' }),
])
const [vPM, vDesign, vArt, vMarket, vTech] = visions
log('Vision phase complete — 5 role pitches collected')

// ---------- PHASE 2: DEBATE LOOP (iterate until PM passes) ----------
phase('Debate')
let designDoc = `# Combined opening visions\n\n## PM\n${vPM}\n\n## Game/Math Designer\n${vDesign}\n\n## Art Director\n${vArt}\n\n## Market\n${vMarket}\n\n## Tech\n${vTech}`
let lastJudge = null
const PASS = 88
const MAX_ROUNDS = 4
let round = 0

while (round < MAX_ROUNDS) {
  round++
  const directives = lastJudge ? `\nThe PM's directives from the previous round you MUST address:\n- ${lastJudge.directives.join('\n- ')}` : ''

  // PM synthesizes one coherent design from everything so far
  const synth = await agent(
    `${CONCEPT}\n\nYou are the PRODUCT MANAGER acting as lead synthesizer.\nHere is all current material (visions + any prior critiques/directives):\n\n${designDoc}${directives}\n\nSynthesize ONE coherent, opinionated design document for round ${round}. Resolve conflicts, make decisions (don't list options — decide). Cover: the exact core loop, the sink/depth mechanic, fish multiplier placement, pull-up collection & escape mechanic, surprise/bonus triggers, the chosen art direction, UI layout for portrait, and how it stays premium. Be specific and concrete. Markdown, ~700 words.`,
    { label: `synth:r${round}`, phase: 'Debate' }
  )

  // Specialists critique the synthesized doc from their lens, in parallel
  const critiques = await parallel([
    () => agent(`${CONCEPT}\n\nYour role:\n${ROLE_PRIMER.design}\n\nCritique this design HARD from the gameplay & math lens. Is the risk-reward curve compelling? Is the math soundable to a target RTP? Near-miss & volatility right?\n\nDESIGN DOC:\n${synth}`, { label: `crit:Design:r${round}`, phase: 'Debate', schema: CRITIQUE_SCHEMA }),
    () => agent(`${CONCEPT}\n\nYour role:\n${ROLE_PRIMER.art}\n\nCritique this design HARD from the visual/identity lens. Will it look premium and distinctive, not generic? Is the cashout moment iconic?\n\nDESIGN DOC:\n${synth}`, { label: `crit:Art:r${round}`, phase: 'Debate', schema: CRITIQUE_SCHEMA }),
    () => agent(`${CONCEPT}\n\nYour role:\n${ROLE_PRIMER.market}\n\nCritique this design HARD from positioning/retention/virality. Does it differentiate? Will it retain and spread in target geos?\n\nDESIGN DOC:\n${synth}`, { label: `crit:Market:r${round}`, phase: 'Debate', schema: CRITIQUE_SCHEMA }),
    () => agent(`${CONCEPT}\n\nYour role:\n${ROLE_PRIMER.tech}\n\nCritique this design HARD from feasibility/performance as single-file portrait HTML. Flag anything that won't hit 60fps or is impractical.\n\nDESIGN DOC:\n${synth}`, { label: `crit:Tech:r${round}`, phase: 'Debate', schema: CRITIQUE_SCHEMA }),
  ])
  const critValid = critiques.filter(Boolean)
  const critText = critValid.map(c => `### ${c.role}\nStrengths: ${c.strengths.join('; ')}\nProblems: ${c.problems.join('; ')}\nMUST-FIX: ${c.mustFix.join('; ')}\nSuggestions: ${c.suggestions.join('; ')}`).join('\n\n')

  // PM judges against the international-casino rubric
  const judge = await agent(
    `${CONCEPT}\n\nYou are the PRODUCT MANAGER. Judge round ${round} against the bar of an international real-money casino title.\n\nDESIGN DOC:\n${synth}\n\nSPECIALIST CRITIQUES:\n${critText}\n\nScore each dimension 0-100 and overall. Pass ONLY if it genuinely reaches international casino quality (overall >= ${PASS}) AND no specialist mustFix remains unresolved. Otherwise iterate and give concrete directives for the next round.`,
    { label: `judge:r${round}`, phase: 'Debate', schema: JUDGE_SCHEMA }
  )
  lastJudge = judge
  log(`Round ${round}: PM score ${judge.score} — ${judge.verdict} (loop=${judge.dimensions.coreLoopClarity} arc=${judge.dimensions.emotionalArc} math=${judge.dimensions.mathSoundness} art=${judge.dimensions.visualPremium} market=${judge.dimensions.marketFit} feas=${judge.dimensions.feasibility})`)

  designDoc = `# Round ${round} design doc\n${synth}\n\n# Round ${round} critiques\n${critText}`

  if (judge.verdict === 'pass' && judge.score >= PASS) {
    log(`PM APPROVED at round ${round} with score ${judge.score}`)
    break
  }
}

// ---------- PHASE 3: FINAL SPEC ----------
phase('Spec')
const [math, art, brief] = await parallel([
  () => agent(`${CONCEPT}\n\nYou are the GAME/MATH DESIGNER. Based on the APPROVED design below, produce the complete, concrete, tunable RTP math model. Real numbers everywhere.\n\nAPPROVED DESIGN:\n${designDoc}`, { label: 'final:Math', phase: 'Spec', schema: MATH_SCHEMA }),
  () => agent(`${CONCEPT}\n\nYou are the ART DIRECTOR. Based on the APPROVED design below, lock the final art direction with exact hex palette and concrete visual specs an engineer can build.\n\nAPPROVED DESIGN:\n${designDoc}`, { label: 'final:Art', phase: 'Spec', schema: ART_SCHEMA }),
  () => agent(`${CONCEPT}\n\nYou are the PRODUCT MANAGER. Based on the APPROVED design below, write the final BUILD BRIEF for the engineer to implement a first playable single-file portrait HTML prototype.\n\nAPPROVED DESIGN:\n${designDoc}`, { label: 'final:Brief', phase: 'Spec', schema: BRIEF_SCHEMA }),
])

return {
  rounds: round,
  finalScore: lastJudge ? lastJudge.score : null,
  verdict: lastJudge ? lastJudge.verdict : null,
  dimensions: lastJudge ? lastJudge.dimensions : null,
  math,
  art,
  brief,
  approvedDesignDoc: designDoc,
}
