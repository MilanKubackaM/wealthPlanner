# Changelog

## Phase 2.5 — UI/UX refactor and a household the model can actually describe

**Engine, `ENGINE_VERSION` 3 → 4** (one bump for both arithmetic changes, so a saved plan
raises the "computed by another version" banner once rather than twice):

- `ScenarioInput.housing` is a discriminated union — `own` with mortgages, or `rent`. The
  nullable-pair alternative admits the incoherent state (a mortgage and a rent at once) that
  the whole capability exists to exclude. `mortgages` is gone from the type; `upgradePlan()`
  reads it from the legacy shape, so old plans still load.
- Rent joins the monthly expense block, not step 3 and not an eighth step: it has no balance,
  no interest and no payoff. It indexes by its OWN escalator, which is what makes the
  indexation field mean something, and it therefore enters `spending` ahead of the DCA
  throttle and the reserve floor with no further edits. It cannot reach net worth.
- `ScenarioInput.liabilities` — car loan, consumer credit, a revolving card — amortise inside
  step 3 by the mortgage's arithmetic minus the fixation. The payment enters `spending`,
  `fixedMonthlyOutgoings` AND `floorThisMonth`: measured, omitting it from the floor left a
  household with an 8 000 CZK/month loan holding 24 000 CZK less cash than it needs. Net worth
  subtracts the outstanding balance.
- `Person.birthYear` (a year, not an age — an age is wrong the next January, and the horizon is
  exactly what a stale age corrupts) and `ageAt()`, which returns null rather than inventing 35.
- `childrenIntent`, tri-state, descriptive only. A test asserts flipping it moves no number.
- Seven new problem rules, of which one is a real bug this codebase could not previously see:
  **`child-leave-unassigned`**. A child whose leave belongs to nobody was costing money while
  nobody went on leave — `foregoneIncome` read 911 904 with a valid id and **0** with a
  dangling one, and nothing reported it. Deleting a person creates that state. Also
  `liability-rate-exceeds-return`, `liability-never-repaid`,
  `housing-cost-outgrowing-income`, `children-intended-but-absent`,
  `horizon-before-retirement`, `envelope-owner-missing`.
- `Lever.min`, and a debt-payment lever floored at the interest-only payment. Zero is
  arithmetically fine and financially a default. The lever is suppressed entirely for any debt
  already flagged as costlier than investing, so the two cards cannot argue on screen.
- `statutoryRetirementAgeYears`, `typicalConsumerLoanRatePct`, `typicalCreditCardRatePct` in
  both jurisdictions, all `unverified` until checked, all on `/parametre`. The retirement age
  also finally makes `ltvMaxPctUnder36` reachable — it was dead data while nothing knew an age.
- Three new fixtures and goldens: `czSingleWithChild` (calibrated so a 24-month leave tips it
  into a shallow deficit the recommender can fix — 24 → 21 months), `czCoupleRenting`,
  `czSingleRentingWithCarLoan`. The seven existing goldens changed in one line each.

**Two defects found from the deployed app and fixed:**

- **The Slovak landing demo never dipped**, so the Slovak page could not demonstrate the one
  thing the product does; the hero fell back to "the plan holds". The cause was not the benefit
  regime (replacement rates are within a point of each other) but two ratios in `skDefaults`: a
  mortgage at DSTI 20.5 % / DTI 3.42× against the Czech 31.0 % / 4.82×, and a cushion worth
  6.20 months of fixed outgoings against 4.36. Two lines: 130 000 / 650 and 6 500 / 19 500.
- **A Czech plan was restored onto the Slovak planner** — the CZK-scale mortgage under Slovak
  labels, with Czech ČNB limits and Czech benefits feeding the model. `localStorage` was one
  global key and the boot effect never compared the locale with the stored jurisdiction.
  Now: per-country keys with a one-time migration of the old one, `jurisdiction` validated
  rather than trusted (a truthy test silently made every key-less plan Czech), a single
  `countryFor()` helper instead of the same ternary in three places and missing from the
  fourth, and a documented precedence — fragment (disclosed on mismatch, never converted) →
  this country's stored plan → the country default. The service worker's offline fallback was
  hardcoded to `/cs/plan` too; it now follows the requested locale.

**The two screens:**

- **No chart in the wizard.** It sat below the fields and the buttons, so on a phone it was
  off-screen on every step; it split attention on the one screen whose entire design is one
  question at a time; and it spent the single memorable picture twenty-five times against
  provisional national averages. Replaced by a consequence ribbon: verdict as colour AND glyph
  AND word, the trough as a sentence, **the change attributable to this step** — which the
  chart could not do, because it showed the state and left the user to infer which answer moved
  it — and an honest completeness count. Two lines, no SVG, above the fold at 360px. The live
  region is written once per step, never per keystroke.
- **Seven wizard steps, at most four controls each** (the old step 2 had seven), branching on
  household shape, housing kind and children intent. Country is no longer the first question:
  it is inferred from the locale, and changing it used to discard everything the user had typed.
- **The plan page is disclosure sections with live summaries**, not tabs — tabs show one panel,
  and these sections are not peers; they would also break Ctrl+F and printing the whole plan.
  `hidden="until-found"`, a sticky section rail, section state in its own storage key, deep
  links in a query param (never the fragment, which carries the plan itself), and print forced
  open from React state because CSS cannot recover content React never rendered.
- **One field component.** `type="number"` is gone product-wide: it mutates its value on a
  scroll wheel over a focused field, which silently rewrote the plan as the user scrolled.
  Parsing now accepts what the app itself prints — `money()` groups with U+00A0, so `39 000 Kč`
  pasted back in used to become NaN, silently, and so did a decimal comma. An empty field
  commits nothing instead of 0. `min`/`max` are enforced on commit, so `max` on parental months
  means something — and that maximum is now derived from the leave regime, since Slovakia stops
  paying at the third birthday and the field offered 36 where 28 was the real limit.
  `auto-fit` is banned in favour of a 12-column grid: five different track minima across five
  files were producing orphan columns at nearly every intermediate width.
- **Design system**: 87 tokens in three theme blocks, four button variants × three sizes with
  all seven states, a focus ring that no longer changes the focused element's shape, elevation
  (there was none anywhere), and a light primary button that now passes 1.4.3 at 6.29:1 instead
  of failing at 4.42:1. Every touch target reaches 44px on a coarse pointer. Nav rebuilt: three
  tiers, a language switch that keeps the route you were reading, an active state carried by
  three signals none of which is colour, and no hamburger for three links. The `<h1>` rotates
  six second-order questions per locale, grid-stacked so the tallest governs the height with no
  measurement code, static under `prefers-reduced-motion`, and announced once as one heading.
- **A real layout bug found on the way**: `.stack-lg` without `grid-template-columns` got an
  implicit `auto` track, which is as wide as its widest child's max-content — so the section
  rail stretched the page to 1450px inside a 412px viewport, `overflow-x: hidden` clipped it,
  and every tap below the fold landed on the wrong element.

**Guards added**, because a design system that is not measured decays back into a refactor:
`scripts/style-guard.mjs` ratchets inline styles (161) and hardcoded pixel literals (115)
downwards only, in CI and in `ship.sh`; a test asserts key parity between `cs.json` and
`sk.json`; and `sk.json` no longer switches between formal and informal address mid-file.


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
