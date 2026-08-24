# wealthPlanner

A month-by-month financial simulator for households in Czechia and Slovakia.

It is not an expense tracker. It answers a second-order question that nothing in Czech or
Slovak currently answers: **what does a child, a mortgage refixation, or a change in your
saving rate do to your household over the next twenty-five years — and in which month does
it go wrong?**

The engine simulates every month from a chosen start to a chosen horizon: two or more
incomes with their own growth rates, mortgage amortisation including fixation resets,
fixed and variable expenses under CPI, a cash reserve earning interest, monthly investing
that throttles itself when cash runs short, sinking-fund envelopes, and the financial
effect of children — maternity benefit, parental benefit, and the cost of raising them.

When it finds a problem it does not merely report it. It searches the input space for the
smallest change that removes the problem, **re-runs the whole simulation to prove the fix
works**, and shows both projections side by side. No comparable product does this.

## Why monthly matters

ProjectionLab, the best tool of its kind, computes year by year and
[says so](https://projectionlab.com/help/year-by-year). An annual engine cannot tell you
that your reserve bottoms out in January 2032, because a 28-week maternity leave, an
amortisation schedule and a cash trough are all sub-annual events. Monthly granularity is
the whole reason this project exists.

## Repository layout

```
packages/
  engine            simulation + verified recommendations. Pure TS, ZERO runtime deps.
  jurisdictions     CZ/SK statutory parameters and leave regimes, each with a source
                    and a last-verified date.
  engine-fixtures   scenario builders used by tests. Invented figures only.
scripts/
  engine-version-guard.mjs   fails CI if the engine's arithmetic changes silently
```

`apps/web` (Next.js on Vercel) and `apps/mobile` (Expo) join later. Both consume the same
`packages/engine`, unmodified. **The engine is never reimplemented per platform** — two
engines would produce two answers, and the moment the web says January 2032 while the
phone says February 2032, the product's entire claim is dead.

## The rules that hold this together

1. **`packages/engine` has no runtime dependencies.** Not a date library, not Zod, nothing.
   That is what makes "identical on web and iOS" true by construction rather than by
   discipline: there is no dependency that could resolve differently between a Node bundle,
   a browser bundle and Hermes.
2. **The engine is pure and deterministic.** No clock, no randomness, no locale, no I/O.
   The projection start is an input. Validation happens at the application boundary.
3. **The engine emits structured facts, never prose.** All wording, currency formatting and
   localisation lives in the UI. A rule must never name a bank, fund, broker or product —
   that is both a localisation dead end and a regulatory hazard.
4. **Statutory constants live in `packages/jurisdictions` with a source URL and a
   `verifiedAt` date.** The likeliest cause of a wrong projection is not a maths bug, it is
   a stale legal constant. Re-verify every 1 January and 1 July.
5. **Changing what a number means bumps `ENGINE_VERSION`.** Saved scenarios record the
   version they were computed with and are never silently re-simulated with newer logic.

## Development

```bash
pnpm install
pnpm test          # 45 tests: unit, golden-file projections, property tests
pnpm typecheck
node scripts/engine-version-guard.mjs
```

Golden files are hand-written JSON, not opaque snapshots, so a change in the arithmetic
shows up as a readable diff. Regenerate deliberately and review every changed number:

```bash
UPDATE_GOLDEN=1 pnpm --filter @wealthplanner/engine test
node scripts/engine-version-guard.mjs --accept   # only for a genuine no-op refactor
```

## Status

Phase 1 of [`IMPLEMENTACIA.md`](./IMPLEMENTACIA.md) — the engine — is done. The web
application is next.

## Not financial advice

This is an illustrative model. It projects consequences of assumptions you supply; it does
not recommend financial products and it never will. Decisions about children, mortgages and
investments should not rest on it alone. Statutory parameters carry the date on which they
were last verified, and the law changes.

## Licence

MIT, with no warranty of any kind. See [LICENSE](./LICENSE).
