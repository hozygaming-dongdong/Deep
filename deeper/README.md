# DEEPER

> **Drop · Sink · Pull.** An accumulate-bet, one-pull fishing crash game.
> (The game is **DEEPER**; its deepest zone — the highest-stakes band — is **the ABYSS**.)
> Mobile portrait, fully English. `BET · SINK deeper · one PULL`.

You **drop** a hook and **sink** it through the water by gesture. Every segment from the
reef down **antes** a little more stake into the round's pool; sharks may cut the line and
force you up early. At any moment you **pull once** to reel up what's in reach. Go deeper for
a bigger ceiling — and a real chance the deep keeps it. The jackpot is a **beast** you watch
arrive (WHALE · GREAT · MEGALODON), not a number you're handed.

## Run it
```bash
npm install
npm run dev          # Vite dev server → http://localhost:8190  (game: /deeper.html · tuner: /tuner.html)
npm run build        # dist/ — deeper.html game
npm run build:single # dist-single/deeper.html — ONE self-contained file (aggregator demos)
npm run sim          # economy gate + RTP harness (the SAME simRound the game ships)
```
`window.DEEPER_V2` is the debug handle (`stepFrames`, `gDown/gMove/gUp`, `pull`, `forceWhale`) —
Claude preview tabs freeze rAF, so drive frames manually with `stepFrames(n)`.

## Layout
```
deeper.html             game entry — gesture-direct control (markup + chrome CSS; logic in src/engine/)
tuner.html              economy parameter console (dev-only; not a build input)
src/
  econ/rng.js           deterministic PRNG (xfnv1a → mulberry32) — shared by the engine
  engine/               deterministic core:
    world.js            constants live in the mutable CFG object · geometry · the POOL table
    entities.js         fish / bubble / scatter / shark spawns (read CFG)
    round.js            the headless outcome engine (createRound / simRound) — game AND sim run this
    render-v2.js        Canvas2D scene (view)
    main-v2.js          gesture driver + presentation
    audio-v2.js         procedural WebAudio (zero asset files)
    tuning.js           simSummary(cfg) — one call the tuner and CLI both use
tools/sim.mjs           gate + RTP harness (npm run sim)
docs/
  GDD.md                game design bible — top-level design truth, living doc
  ECONOMY-V2.md         economy number authority (current CFG constants + sim tables + rationale)
  DESIGN-V2.md          redesign plan + per-phase execution record
  DEV-LOG-V2.md         methodology, decision context, gotchas (incl. the retired-v1 history)
  design-system.md      locked visual system ("Pelagic Noir × Stamped Gold")
```

## Economy (the POOL model — docs/ECONOMY-V2.md is the authority)
Outcome first, physics second: **the bet draws the round's budget from a multiplier table**, then
the water is arranged to spend it — so RTP is a property of the table, not of anyone's reflexes.
- **Ante** — every segment from REEF down charges 0.25× stake, each buying its own pool draw
  (a bet, not a fee): more handle, a bigger pool, deeper = more bet.
- **Sharks** — 1/8 per segment × 20% bite. A bite is a *forced early pull*: you keep the base
  already in reach and lose only the deeper pool + the beast. That's the risk of going deep.
- **Beast** — WHALE / GREAT / MEGALODON are three rows of the pool table; the draw probability
  IS the appearance frequency (~1/10 · 1/30 · 1/100). Each can tear free (50 / 25 / 25 %).
- **RTP** — the fixed-stop ceiling (best simple play) sits just under the target; the curve is an
  inverted-U — deeper raises the ceiling and the cut risk together.
- All of the above are the `CFG` object in `world.js`; **any change re-opens the gate** — `npm run sim`
  must stay green (`--rounds 200000` for a freeze). Play with the numbers live in `tuner.html`.

## Art identity
Bioluminescent trench / **black-gold material**. The **temperature axis (cold cyan ↔ warm gold)**
*is* the depth meter, the loss, and the win. Gold = specular metal (baked rim, never glow).
Signature cashout = the hook breaks the surface and strung fish cash into a coin fountain; a
LINE CUT is told in the owned petrol palette — no magenta, no glow.

## Status
The economy is the v2.4 line (ante + shark-salvage + beast rows),
green at 30k tune; the 200k freeze and a couple of open calibration calls are tracked in
docs/ECONOMY-V2.md §0′. An earlier button-based v1 (and the ABYSS working-title era) was removed
2026-07-20 — history lives in git and docs/DEV-LOG-V2.md.

Launch-blockers (out of client scope): licensing, payment rails, server-side outcome authority,
real-device 60fps matrix, CPI/LTV model.
