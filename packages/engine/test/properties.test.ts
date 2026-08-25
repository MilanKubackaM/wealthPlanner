import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  czCoupleRenting,
  czCoupleWithChild,
  czCoupleWithMortgage,
  czSingleRentingWithCarLoan,
} from '@wealthplanner/engine-fixtures';
import { simulate, monthsBetween, type Mortgage, type ScenarioInput } from '@wealthplanner/engine';

/**
 * Property tests catch "is the behaviour still sane" across input combinations nobody
 * thought to fixture. Golden files catch "did the behaviour change". Both are needed.
 */

const FAST = { numRuns: 25 } as const;

describe('properties — determinism and causality', () => {
  it('is deterministic: the same input always yields the same numbers', () => {
    const input = czCoupleWithChild();
    const a = simulate(input);
    const b = simulate(input);
    expect(a.minReserve).toBe(b.minReserve);
    expect(a.finalNetWorth).toBe(b.finalNetWorth);
    expect(a.monthly.length).toBe(b.monthly.length);
  });

  it('does not look ahead: a later rate reset cannot change earlier months', () => {
    fc.assert(
      fc.property(fc.integer({ min: 24, max: 120 }), fc.double({ min: 1, max: 9, noNaN: true }), (offset, newRate) => {
        const base = czCoupleWithMortgage();
        const resetAt = { year: base.assumptions.start.year + Math.floor(offset / 12), month: offset % 12 };
        const withReset: ScenarioInput = {
          ...base,
          housing: withMortgages(base, (m) => ({
            ...m,
            rateResets: [{ at: resetAt, newAnnualRatePct: newRate }],
          })),
        };
        const a = simulate(base);
        const b = simulate(withReset);
        const resetIndex = monthsBetween(base.assumptions.start, resetAt);
        for (let i = 0; i < resetIndex; i++) {
          expect(b.monthly[i]?.reserve).toBeCloseTo(a.monthly[i]?.reserve ?? NaN, 6);
        }
      }),
      FAST,
    );
  });

  it('a later child cannot change months before its birth', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2030, max: 2045 }), (birthYear) => {
        const base = czCoupleWithMortgage();
        const child = czCoupleWithChild().children[0]!;
        const withChild: ScenarioInput = {
          ...base,
          children: [{ ...child, birth: { year: birthYear, month: 6 } }],
        };
        const a = simulate(base);
        const b = simulate(withChild);
        const birthIndex = monthsBetween(base.assumptions.start, { year: birthYear, month: 6 });
        for (let i = 0; i < birthIndex; i++) {
          expect(b.monthly[i]?.reserve).toBeCloseTo(a.monthly[i]?.reserve ?? NaN, 6);
        }
      }),
      FAST,
    );
  });
});

/** Maps over the mortgages of an owning household, leaving a renter untouched. */
function withMortgages(
  input: ScenarioInput,
  fn: (m: Mortgage) => Mortgage,
): ScenarioInput['housing'] {
  if (input.housing.kind !== 'own') return input.housing;
  return { kind: 'own', mortgages: input.housing.mortgages.map(fn) };
}

describe('properties — monotonicity', () => {
  it('a higher rent never improves the reserve trough', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60_000 }), fc.integer({ min: 0, max: 60_000 }), (x, y) => {
        const low = Math.min(x, y);
        const high = Math.max(x, y);
        const base = czCoupleRenting();
        if (base.housing.kind !== 'rent') throw new Error('fixture invariant: renting');
        const rent = base.housing.rent;
        const at = (amount: number) =>
          simulate({ ...base, housing: { kind: 'rent', rent: { ...rent, monthlyAmount: amount } } });
        expect(at(high).minReserve).toBeLessThanOrEqual(at(low).minReserve + 1e-6);
      }),
      FAST,
    );
  });

  /*
   * Deliberately NOT "a higher payment never improves the trough" — that is false, and the
   * counter-example is instructive: a bigger payment clears the loan sooner, the payment
   * then stops, and in a household whose trough is late the late months come out ahead. The
   * true invariant is on the balance, which is what the payment actually controls.
   */
  it('a higher debt payment never leaves a larger balance in any month', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40_000 }), fc.integer({ min: 0, max: 40_000 }), (x, y) => {
        const low = Math.min(x, y);
        const high = Math.max(x, y);
        const base = czSingleRentingWithCarLoan();
        const at = (payment: number) =>
          simulate({ ...base, liabilities: base.liabilities.map((l) => ({ ...l, monthlyPayment: payment })) });
        const a = at(low);
        const b = at(high);
        for (let i = 0; i < a.monthly.length; i++) {
          expect(b.monthly[i]?.liabilityBalance ?? 0).toBeLessThanOrEqual(
            (a.monthly[i]?.liabilityBalance ?? 0) + 1e-6,
          );
        }
      }),
      FAST,
    );
  });

  it('investing more each month never improves the reserve trough', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30_000 }),
        fc.integer({ min: 0, max: 30_000 }),
        (lowRaw, highRaw) => {
          const low = Math.min(lowRaw, highRaw);
          const high = Math.max(lowRaw, highRaw);
          const base = czCoupleWithChild();
          const a = simulate({ ...base, jointInvesting: { ...base.jointInvesting, monthlyContribution: low } });
          const b = simulate({ ...base, jointInvesting: { ...base.jointInvesting, monthlyContribution: high } });
          expect(b.minReserve).toBeLessThanOrEqual(a.minReserve + 1e-6);
        },
      ),
      FAST,
    );
  });

  it('starting with more cash never makes the trough worse', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000 }), fc.integer({ min: 0, max: 2_000_000 }), (x, y) => {
        const low = Math.min(x, y);
        const high = Math.max(x, y);
        const base = czCoupleWithChild();
        const a = simulate({ ...base, reserve: { ...base.reserve, balance: low } });
        const b = simulate({ ...base, reserve: { ...base.reserve, balance: high } });
        expect(b.minReserve).toBeGreaterThanOrEqual(a.minReserve - 1e-6);
      }),
      FAST,
    );
  });

  it('spending more never improves the trough', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 1, noNaN: true }), fc.double({ min: 1, max: 2, noNaN: true }), (down, up) => {
        const base = czCoupleWithChild();
        const scale = (f: number): ScenarioInput => ({
          ...base,
          expenses: base.expenses.map((e) => ({ ...e, monthlyAmount: e.monthlyAmount * f })),
        });
        const cheaper = simulate(scale(down));
        const pricier = simulate(scale(up));
        expect(pricier.minReserve).toBeLessThanOrEqual(cheaper.minReserve + 1e-6);
      }),
      FAST,
    );
  });
});

describe('properties — robustness', () => {
  it('survives absurd inputs without NaN, Infinity or throwing', () => {
    fc.assert(
      fc.property(
        fc.record({
          income: fc.integer({ min: 0, max: 10_000_000 }),
          growth: fc.double({ min: -20, max: 50, noNaN: true }),
          cpi: fc.double({ min: -10, max: 50, noNaN: true }),
          rate: fc.double({ min: 0, max: 40, noNaN: true }),
          payment: fc.integer({ min: 0, max: 500_000 }),
          horizon: fc.integer({ min: 2026, max: 2100 }),
          sweepCap: fc.oneof(fc.constant(null), fc.integer({ min: -100, max: 5_000_000 })),
        }),
        (p) => {
          const base = czCoupleWithChild();
          const input: ScenarioInput = {
            ...base,
            assumptions: { ...base.assumptions, cpiPct: p.cpi, horizonYear: p.horizon },
            people: base.people.map((x) => ({
              ...x,
              netMonthlyIncome: p.income,
              incomeGrowthPct: p.growth,
            })),
            housing: withMortgages(base, (m) => ({
              ...m,
              annualRatePct: p.rate,
              monthlyPayment: p.payment,
            })),
            reserve: { ...base.reserve, sweepCap: p.sweepCap },
          };
          const r = simulate(input);
          expect(Number.isFinite(r.minReserve)).toBe(true);
          expect(Number.isFinite(r.finalNetWorth)).toBe(true);
          expect(r.monthly.length).toBeGreaterThan(0);
        },
      ),
      FAST,
    );
  });

  it('a horizon before the start still yields at least one month rather than an empty projection', () => {
    const base = czCoupleWithMortgage();
    const r = simulate({ ...base, assumptions: { ...base.assumptions, horizonYear: 2000 } });
    expect(r.monthly.length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(r.minReserve)).toBe(true);
  });
});
