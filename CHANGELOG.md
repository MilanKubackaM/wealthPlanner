# Changelog

All notable changes to the projection engine are recorded here. Any entry that changes a
produced number must also bump `ENGINE_VERSION` in `packages/engine/src/version.ts`.

## [Unreleased]

### Engine v2 — extracted from the single-file prototype

Added
- `packages/engine`: pure TypeScript simulation and recommendation engine, zero runtime
  dependencies, so web, server and React Native all compute identical answers.
- `packages/jurisdictions`: Czech and Slovak parameters, with parental-leave rules modelled
  as strategy objects because the two countries use structurally different systems — CZ is a
  fixed total allowance drawn down over a chosen number of months, SK is a fixed monthly
  amount until the child turns three.
- `packages/engine-fixtures`: seven scenarios covering a healthy household, the flagship
  child scenario, overlapping leave windows, a stressed household, a Slovak household and
  two degenerate cases.
- Golden-file projections plus `fast-check` property tests for determinism, causality
  (no look-ahead), monotonicity and robustness against absurd input.
- `scripts/engine-version-guard.mjs`, wired into CI.

Fixed, relative to the prototype
- Net worth no longer clamps a negative reserve to zero, so the headline figure stops
  contradicting the detail table in exactly the deficit the engine exists to detect.
- Overlapping maternity/parental windows no longer overwrite one another; the parent takes
  the most favourable active benefit and never falls back to full salary while a window is open.
- Personal investment contributions declared as funded from pocket money are now capped at
  that allowance instead of compounding money that never left the household.
- Child costs taper over the final years instead of dropping off a cliff.
- The projection start is an input, not a compile-time constant, so nothing claims one month
  and computes another.
- Mortgage rate resets (fixation end) are modelled.
- Income growth and expense inflation are separate assumptions.
- The reserve floor inflates with expenses instead of being frozen at month one.
- A child outside the horizon is no longer silently dropped.
- Recommendation rules emit structured facts, never localised prose, and never name a bank,
  fund or provider.
- Every recommendation, including the day-one deficit case the prototype left unverified, is
  produced by a binary search whose result is re-simulated before being shown.
- A child or one-off dated outside the projection window is now reported as a problem
  (`child-outside-horizon`, `oneoff-outside-horizon`) instead of vanishing from every chart
  and recommendation without a word.
- Envelope totals are surfaced as derived output. Envelopes stay descriptive in v1: they say
  what the reserve is earmarked for and provably do not alter the projection.
