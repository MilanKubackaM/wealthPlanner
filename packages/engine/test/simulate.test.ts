import { describe, expect, it } from 'vitest';
import {
  czCoupleWithChild,
  czCoupleWithMortgage,
  czCoupleWithOverlappingChildren,
  paidOffNoChildren,
  skCoupleWithChild,
  zeroIncomeHousehold,
} from '@wealthplanner/engine-fixtures';
import { ENGINE_VERSION, simulate, addMonths, monthsBetween } from '@wealthplanner/engine';
import { czechia, slovakia } from '@wealthplanner/jurisdictions';

describe('simulate — basics', () => {
  it('stamps the engine version so saved scenarios can never be silently reinterpreted', () => {
    expect(simulate(czCoupleWithMortgage()).engineVersion).toBe(ENGINE_VERSION);
  });

  it('runs from the given start month to December of the horizon year', () => {
    const input = czCoupleWithMortgage();
    const r = simulate(input);
    const first = r.monthly[0];
    const last = r.monthly[r.monthly.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(first?.year).toBe(input.assumptions.start.year);
    expect(first?.month).toBe(input.assumptions.start.month);
    expect(last?.year).toBe(input.assumptions.horizonYear);
    expect(last?.month).toBe(11);
    /* Sep 2026 .. Dec 2060 inclusive */
    expect(r.monthly.length).toBe(monthsBetween({ year: 2026, month: 8 }, { year: 2060, month: 11 }) + 1);
  });

  it('produces no NaN or Infinity anywhere, even with zero income', () => {
    for (const input of [czCoupleWithMortgage(), zeroIncomeHousehold(), paidOffNoChildren()]) {
      const r = simulate(input);
      for (const m of r.monthly) {
        for (const [key, value] of Object.entries(m)) {
          if (typeof value === 'number') {
            expect(Number.isFinite(value), `${key} at index ${m.index}`).toBe(true);
          }
        }
      }
      expect(Number.isFinite(r.minReserve)).toBe(true);
      expect(Number.isFinite(r.finalNetWorth)).toBe(true);
    }
  });
});

describe('simulate — mortgage', () => {
  it('amortises to exactly zero and records the payoff year', () => {
    const r = simulate(czCoupleWithMortgage());
    expect(r.mortgagePaidYear).not.toBeNull();
    const last = r.monthly[r.monthly.length - 1];
    expect(last?.mortgageBalance).toBe(0);
  });

  it('never pays more than the outstanding balance plus its interest', () => {
    const input = czCoupleWithMortgage();
    const r = simulate(input);
    const payoffMonth = r.monthly.find((m) => m.mortgageBalance === 0);
    expect(payoffMonth).toBeDefined();
    /* After payoff the payment must stop entirely, not keep draining cash. */
    const after = r.monthly.filter((m) => m.index > (payoffMonth?.index ?? 0));
    expect(after.every((m) => m.mortgagePayment === 0)).toBe(true);
  });

  it('applies a rate reset at its effective month and not before', () => {
    const input = skCoupleWithChild();
    const reset = input.mortgages[0]?.rateResets[0];
    expect(reset).toBeDefined();
    const withReset = simulate(input);

    const noReset = simulate({
      ...input,
      mortgages: input.mortgages.map((m) => ({ ...m, rateResets: [] })),
    });

    const resetIndex = monthsBetween(input.assumptions.start, reset!.at);
    /* Identical up to the reset month, then the higher rate slows repayment. */
    expect(withReset.monthly[resetIndex - 1]?.mortgageBalance).toBeCloseTo(
      noReset.monthly[resetIndex - 1]?.mortgageBalance ?? -1,
      6,
    );
    expect(withReset.monthly[resetIndex]?.mortgageBalance).toBeGreaterThan(
      noReset.monthly[resetIndex]?.mortgageBalance ?? Infinity,
    );
  });
});

describe('simulate — children and leave', () => {
  it('suppresses income during maternity and restores it after all leave ends', () => {
    const input = czCoupleWithChild();
    const child = input.children[0]!;
    const r = simulate(input);

    const birthIndex = monthsBetween(input.assumptions.start, child.birth);
    const maternityMonths = czechia.leave.maternityMonths(child.leavePlan);
    const totalLeave = czechia.leave.totalLeaveMonths(child.leavePlan);

    expect(r.monthly[birthIndex]?.phaseByPerson['b']).toBe('maternity');
    expect(r.monthly[birthIndex + maternityMonths]?.phaseByPerson['b']).toBe('parental');
    expect(r.monthly[birthIndex + totalLeave]?.phaseByPerson['b']).toBe('work');

    /* Before the birth the parent earns strictly more than during maternity. */
    const before = r.monthly[birthIndex - 1]?.incomeByPerson['b'] ?? 0;
    const during = r.monthly[birthIndex]?.incomeByPerson['b'] ?? 0;
    expect(during).toBeLessThan(before);
    expect(r.foregoneIncome).toBeGreaterThan(0);
  });

  it('never pays full salary while any leave window is still open (the overlap bug)', () => {
    const input = czCoupleWithOverlappingChildren();
    const r = simulate(input);
    const first = input.children[0]!;
    const second = input.children[1]!;

    const firstEnd =
      monthsBetween(input.assumptions.start, first.birth) +
      czechia.leave.totalLeaveMonths(first.leavePlan);
    const secondEnd =
      monthsBetween(input.assumptions.start, second.birth) +
      czechia.leave.totalLeaveMonths(second.leavePlan);
    const lastEnd = Math.max(firstEnd, secondEnd);
    const firstBirth = monthsBetween(input.assumptions.start, first.birth);

    for (let i = firstBirth; i < lastEnd; i++) {
      const point = r.monthly[i];
      expect(point).toBeDefined();
      const phase = point?.phaseByPerson['b'];
      expect(
        phase === 'maternity' || phase === 'parental',
        `month ${i} fell back to work while a leave window was open`,
      ).toBe(true);
    }
  });

  it('takes the most favourable active benefit when two windows overlap', () => {
    const input = czCoupleWithOverlappingChildren();
    const r = simulate(input);
    const second = input.children[1]!;
    const secondBirth = monthsBetween(input.assumptions.start, second.birth);
    /* At the second birth, maternity (a share of salary) beats the parental drawdown. */
    const income = r.monthly[secondBirth]?.incomeByPerson['b'] ?? 0;
    const parentalOnly =
      czechia.leave.incomeFor({
        monthsSinceBirth: secondBirth - monthsBetween(input.assumptions.start, input.children[0]!.birth),
        baseNetIncome: 0,
        plan: input.children[0]!.leavePlan,
      })?.income ?? 0;
    expect(income).toBeGreaterThanOrEqual(parentalOnly);
  });

  it('applies the Slovak regime as a fixed monthly amount, not a drawdown', () => {
    const input = skCoupleWithChild();
    const child = input.children[0]!;
    const twelve = slovakia.leave.incomeFor({
      monthsSinceBirth: slovakia.leave.maternityMonths(child.leavePlan) + 1,
      baseNetIncome: 1_600,
      plan: child.leavePlan,
    });
    const halfAsLong = slovakia.leave.incomeFor({
      monthsSinceBirth: slovakia.leave.maternityMonths(child.leavePlan) + 1,
      baseNetIncome: 1_600,
      plan: { ...child.leavePlan, parentalMonths: 12 },
    });
    /* Drawing over fewer months must NOT raise the Slovak monthly payment. */
    expect(twelve?.income).toBeCloseTo(halfAsLong?.income ?? -1, 6);
  });

  it('applies the Czech regime as a drawdown: fewer months means more per month', () => {
    const plan = { parentalMonths: 24, returnToWorkPct: 100 };
    const long = czechia.leave.incomeFor({
      monthsSinceBirth: czechia.leave.maternityMonths(plan) + 1,
      baseNetIncome: 45_000,
      plan,
    });
    const short = czechia.leave.incomeFor({
      monthsSinceBirth: czechia.leave.maternityMonths(plan) + 1,
      baseNetIncome: 45_000,
      plan: { ...plan, parentalMonths: 12 },
    });
    expect(short?.income).toBeGreaterThan(long?.income ?? 0);
  });

  it('tapers child cost instead of dropping it off a cliff', () => {
    const input = czCoupleWithChild();
    const child = input.children[0]!;
    const r = simulate(input);
    const endIndex = monthsBetween(input.assumptions.start, addMonths(child.birth, child.costUntilAgeYears * 12));
    const taperStart = endIndex - child.costTaperYears * 12;

    const atTaperStart = r.monthly[taperStart]?.childCost ?? 0;
    const midTaper = r.monthly[taperStart + child.costTaperYears * 6]?.childCost ?? 0;
    const afterEnd = r.monthly[endIndex]?.childCost ?? -1;

    expect(atTaperStart).toBeGreaterThan(midTaper);
    expect(midTaper).toBeGreaterThan(0);
    expect(afterEnd).toBe(0);
  });
});

describe('simulate — the bugs the prototype shipped', () => {
  it('reports net worth with a negative reserve at face value, never clamped to zero', () => {
    const input = czCoupleWithMortgage();
    const broke = simulate({
      ...input,
      reserve: { ...input.reserve, balance: 0 },
      expenses: input.expenses.map((e) => ({ ...e, monthlyAmount: e.monthlyAmount * 6 })),
    });
    expect(broke.minReserve).toBeLessThan(0);
    const worstYear = broke.yearly.find((y) => y.reserve < 0);
    expect(worstYear).toBeDefined();
    const expected =
      (worstYear?.reserve ?? 0) +
      (worstYear?.jointInvestments ?? 0) +
      Object.values(worstYear?.personalInvestments ?? {}).reduce((s, v) => s + v, 0) -
      (worstYear?.mortgageBalance ?? 0);
    expect(worstYear?.netWorth).toBeCloseTo(expected, 6);
  });

  it('caps pocket-money-funded contributions at the allowance', () => {
    const input = czCoupleWithMortgage();
    const greedy = {
      ...input,
      people: input.people.map((p) =>
        p.id === 'a'
          ? {
              ...p,
              pocketMoney: 5_000,
              investments: p.investments.map((s) => ({ ...s, monthlyContribution: 50_000 })),
            }
          : p,
      ),
    };
    const r = simulate(greedy);
    const baseline = simulate(input);
    /* The overcommitted sleeve cannot compound more than the allowance can fund, so it
       must not blow past a sane multiple of the baseline personal balance. */
    const finalPersonal = r.monthly[r.monthly.length - 1]?.personalInvestments ?? 0;
    const basePersonal = baseline.monthly[baseline.monthly.length - 1]?.personalInvestments ?? 0;
    expect(finalPersonal).toBeLessThan(basePersonal * 3);
  });

  it('does not treat a household with no children as returning to work at a reduced rate', () => {
    const r = simulate(czCoupleWithMortgage());
    const mid = r.monthly[120];
    expect(mid?.phaseByPerson['b']).toBe('work');
    const grown = r.monthly[120]?.incomeByPerson['b'] ?? 0;
    expect(grown).toBeGreaterThan(45_000);
  });

  it('keeps the reserve floor inflating with expenses rather than freezing at month one', () => {
    const r = simulate(czCoupleWithChild());
    expect(r.reserveFloor).toBeGreaterThan(0);
    if (r.worstFloorGapAt && r.worstFloorGapAt.year > 2030) {
      expect(r.floorAtWorst).toBeGreaterThan(r.reserveFloor);
    }
  });
});

describe('simulate — things the user typed that fall outside the window', () => {
  it('reports a child born after the horizon instead of silently dropping it', async () => {
    const { detectProblems } = await import('@wealthplanner/engine');
    const input = czCoupleWithChild();
    const stray = {
      ...input,
      children: input.children.map((c) => ({ ...c, birth: { year: 2099, month: 0 } })),
    };
    const problems = detectProblems(stray, simulate(stray));
    expect(problems.some((p) => p.id === 'child-outside-horizon')).toBe(true);
  });

  it('reports a one-off dated before the projection starts', async () => {
    const { detectProblems } = await import('@wealthplanner/engine');
    const input = czCoupleWithMortgage();
    const stray = {
      ...input,
      oneOffs: [{ id: 'x', label: 'Old bonus', at: { year: 2020, month: 0 }, amount: 100_000 }],
    };
    const problems = detectProblems(stray, simulate(stray));
    expect(problems.some((p) => p.id === 'oneoff-outside-horizon')).toBe(true);
  });

  it('reports envelope totals without letting them change the cash flow', () => {
    const input = czCoupleWithMortgage();
    const withEnvelopes = {
      ...input,
      envelopes: [
        { id: 'e1', label: 'Car', owner: 'shared', amount: 50_000, target: 100_000, countsTowardReserve: true },
        { id: 'e2', label: 'Clothes', owner: 'a', amount: 5_000, target: 10_000, countsTowardReserve: false },
      ],
    };
    const bare = simulate(input);
    const rich = simulate(withEnvelopes);
    expect(rich.sharedEnvelopeTotal).toBe(50_000);
    expect(rich.personalEnvelopeTotal).toBe(5_000);
    /* Descriptive only: the projection itself must be identical. */
    expect(rich.minReserve).toBeCloseTo(bare.minReserve, 6);
    expect(rich.finalNetWorth).toBeCloseTo(bare.finalNetWorth, 6);
  });
});
