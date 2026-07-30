# DEEPER — Locked Design System v2

> Authored with the frontend-design methodology after the v1 build was judged ugly with weak gamble
> feel. This is the LAW every art/build agent implements against. The failure of v1 was generic-AI
> smell (Inter + flat pure-black + timid centered stacks + no texture + no juice). Kill all of it.

## Aesthetic direction (committed, bold)
**"Pelagic Noir × Stamped Gold."** A precision deep-diving instrument crossed with a high-roller's
gold ingot. Editorial restraint in the resting state; ONE violent, over-produced moment at the PULL.
Premium, tactile, slightly dangerous. Never cute, never neon-soup, never glassmorphism.

## Typography (distinctive — NO Inter / Roboto / Arial / system as the look)
Load via a single Google Fonts `<link>` with a system fallback (game must still degrade offline).
- **Display / numerals / stamps: "Big Shoulders Display"** (industrial condensed, instrument-panel
  character, metal-stamp weight) — DEEPER wordmark, the Number-SLAM payout, band stamps
  (SHALLOWS/REEF/ABYSS), multiplier tags. Use 800–900 weight. `font-feature-settings:"tnum"` on all numerals.
- **UI / body: "Hanken Grotesk"** (refined warm grotesque) — dock labels, readouts. 400/600.
- **Mono (FAIR seed, dev): "Spline Sans Mono"** or system mono. Small, quiet.
- Tracking: stamps get wide tracking (0.12–0.2em) + ALL CAPS; body is sentence case, tight.

## Color tokens (temperature axis IS the brand)
```
--abyss-0:   #04070A   /* cool near-black — NEVER pure #000 (reads cheap) */
--abyss-1:   #0A1016
--petrol-1:  #0E2E33   /* trench mids */
--petrol-2:  #16545B
--cyan-cold: #6FE3E1   /* bioluminescent cold pole */
--cyan-deep: #2C9FB2
--bone:      #E9F2F0   /* ticks, primary text */
--violet-loss:#8A5CC2  /* LINE SNAP / ruin ONLY — never elsewhere, never red/magenta */
/* GOLD = specular metal, built from a multi-stop rim, NEVER a glow/box-shadow bloom */
--gold-sh:   #6E4A12
--gold-base: #C8922E
--gold-mid:  #F6C243
--gold-hi:   #FBE7A8
```
Gold rim recipe: `linear-gradient(135deg,var(--gold-hi),var(--gold-mid) 38%,var(--gold-base) 62%,var(--gold-sh))`
plus ONE 1px hard highlight line at the top edge. Dominant field = abyss/petrol; gold is a SHARP
accent, used sparingly so it reads as precious metal, not decoration.

## Texture & depth (kill the flatness)
- Full-screen **film grain** overlay (tiling SVG/`feTurbulence` or a tiny canvas noise), 3–6% opacity,
  `mix-blend-mode:overlay`. This single layer removes 80% of the "cheap" read.
- **Vignette** that tightens with depth (darker corners deeper you go).
- Trench = horizontal **depth strata** banding (baked 2–3 stop gradients per band), NOT a flat fill.
- Brushed-metal micro-gradient on all gold surfaces.

## Motion / juice (orchestrated, not scattered)
- **Load (game):** ONE staggered sequence — hook drops in on a line, DEEPER wordmark
  STAMPS down (scale 1.06→1 + 1 frame of settle), tagline fades up, CTA begins a slow breath. Use
  `animation-delay` cascade. No element just "appears."
- **Sink:** camera eases down with overshoot; cold particulate rises as parallax; the line tightens.
- **Tension beat (THE gamble feel):** before a sink resolves, a held micro-beat — line creak, the
  next ledge's snap-risk telegraphed as a darkening edge channel + a faint rising heartbeat (audio +
  vignette pulse). Deeper = pitch up, vignette tighter, a creeping gold tint at the edges.
- **Near-miss sting:** if a big fish BLEEDS loose, or you PULL one ledge before a SNAP would've hit,
  show what you almost lost / almost died — "×42 slipped" fl/ash, a cold desat punch. Regret is the engine.
- **SIGNATURE CASHOUT (must be a rewatchable ~2.5s):** hook SNAPS up through the surface line dragging
  a comet-trail of caught fish that convert cold→gold as they cross; a specular gold shockwave RING
  expands (hard-edged, not glow); the **Number-SLAM** payout scales in with overshoot + a short
  screen-shake + a single deep impact chime. This is the one moment everything else is restraint for.
- **LINE SNAP (ruin):** told entirely in petrol-violet — a whip-crack, the gold drains cold, vignette
  slams. No red, no magenta. Loss must feel like the cold winning, not an error dialog.

## Layout (break the timid centered stack)
- Dock = an **instrument panel**, asymmetric. The depth column is a real vertical **core-sample gauge**
  on one edge (stratified, with a bone-white depth tick + a warming gold fill in its gutter), not a bar.
- Band stamps (SHALLOWS/REEF/ABYSS) are grid-breaking wayfinding marks, rotated/edge-anchored.
- The two decision buttons (SINK / PULL) are weighted unequally and tactile (stamped gold for PULL,
  cold steel for SINK) — they should feel like instrument controls, never default rounded web buttons.
- Generous negative space in rest; controlled density at depth.

## Hard "never" list (generic-AI smell)
Inter/Roboto/Arial as the look · pure #000 flat bg · purple-on-white · glassmorphism · glow-as-identity ·
magenta · centered-everything timidity · evenly-distributed timid palette · default web buttons ·
emoji as UI chrome · drop-shadow bloom standing in for gold.
