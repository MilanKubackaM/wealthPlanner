# Changelog

All notable changes to the projection engine are recorded here. Any entry that changes a
produced number must also bump `ENGINE_VERSION` in `packages/engine/src/version.ts`.

## [Unreleased]

### Web app — public, no account required

Added
- `apps/web`: Next.js 16 App Router on Vercel, full `cs-CZ` and `sk-SK` locales (two
  catalogues, not one compromise — including month names in the locative case with their
  preposition, since Intl only gives the nominative and Slovak needs "vo februári").
- Landing page that shows a working projection above the fold, populated with the national
  average household plus a child in three years, and states the trough in a sentence.
- Four-step onboarding with national-average defaults instead of a single screen of
  twenty-five empty fields, with the chart visible throughout so every answer moves it.
- The canonical reserve chart: one series, the floor as a reference line, the trough on an
  opaque callout chip, crosshair tooltip, and a table view. Its viewBox is chosen per
  breakpoint rather than scaled, because an 880-unit box on a 350px phone renders labels at
  about 4px.
- Verified recommendations in the UI, each with an Apply button and a before/after re-run.
- `localStorage` persistence, JSON export and import, engine-version awareness on load.
- Public `/parametre` (every statutory constant with its source and last-verified date,
  unconfirmed ones flagged in the UI), `/metodika` (the monthly order of operations and the
  binary-search-then-verify procedure, written out) and `/zasady` (short, because the truth is
  short: nothing about the user is stored anywhere).
- Scenario comparison as small multiples — without a child, as entered, and with the child
  three years later — all three on ONE shared vertical scale, because a per-panel scale would
  make the worst scenario look like the best. Any variant can be adopted with one click.
- A sensitivity panel: return −1 pp, inflation +2 pp, mortgage rate +1 pp, one income −30 %,
  reserve rate −2 pp, each a full re-simulation. It reports net worth and the payoff year
  alongside the trough, because a fixed mortgage payment means a rate shock does not move the
  cash reserve at all — three rows showed an identical trough until those columns were added.
- PNG export of the chart. CSS custom properties are resolved to literal colours before
  serialising, since an SVG loaded into an `<img>` has no access to the document's cascade.
- Installable PWA with an offline shell that never caches a plan.
- Envelopes and per-person investment sleeves, with the "paid from pocket money" flag wired to
  the engine's cap. An end-to-end test asserts that adding an envelope does NOT move the
  projection, which is what "descriptive" has to mean if the word is to be trusted.
- A share link carrying the whole plan in the URL fragment, deflate-compressed with the native
  `CompressionStream` and base64url-encoded — about 700 characters, and the fragment is never
  sent in an HTTP request, so a shared plan goes past the server rather than through it. A test
  round-trips it through a fresh browser context with no storage and asserts an identical
  projection on the other side.
- Keyboard navigation along the chart (arrows, Shift for a year at a time, Home/End, Escape)
  with the reading announced in a live region, so the tooltip is no longer pointer-only.
- The assumptions behind each recommendation are printed with the card, not in a page footnote.
- `robots.ts` and `vercel.json` — the latter with a Content-Security-Policy that allows no
  third-party origin at all, which the app can afford because it talks to none.
- 20 Playwright end-to-end tests across desktop and mobile, failing on ANY console error —
  which is how the hydration bug above would have been caught before a human saw it.

Decided
- The simulation runs in the browser, never on a server. Measured: `simulate()` 0.9 ms,
  `recommend()` 89 ms for about a hundred simulations. The chart therefore recomputes
  synchronously on every keystroke while recommendations are debounced inside a transition.
- Chart series use a categorical palette validated for colour-vision deficiency, normal-vision
  separation and contrast in both light and dark. Identity never rests on hue: the series is
  directly labelled and the trough carries text.

Fixed
- Currency and compact-number formatting no longer come raw from Intl. Node and Chrome
  disagreed on both the space character and the fraction digits for cs-CZ, which made every
  server-rendered amount a hydration mismatch. Regression tests now assert the exact strings.

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
