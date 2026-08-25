import { describe, expect, it } from 'vitest';
import {
  czCoupleUnderStress,
  czCoupleWithMortgage,
  czSingleRentingWithCarLoan,
  skCoupleWithChild,
} from '@wealthplanner/engine-fixtures';
import {
  buildLevers,
  criterionFor,
  detectProblems,
  isHealthy,
  recommend,
  searchLever,
  simulate,
} from '@wealthplanner/engine';
import { czechia } from '@wealthplanner/jurisdictions';

describe('detectProblems', () => {
  it('finds nothing to complain about in a healthy household', () => {
    const input = czCoupleWithMortgage();
    const result = simulate(input);
    const problems = detectProblems(input, result);
    const cashProblems = problems.filter((p) => p.severity !== 'info');
    expect(cashProblems).toEqual([]);
  });

  it('reports the stressed household with a month and an amount', () => {
    const input = czCoupleUnderStress();
    const result = simulate(input);
    const problems = detectProblems(input, result);
    expect(problems.length).toBeGreaterThan(0);
    const worst = problems[0];
    expect(worst).toBeDefined();
    expect(['reserve-deficit', 'dca-paused', 'reserve-below-floor']).toContain(worst?.id);
    expect(worst?.facts.at).toBeTruthy();
  });

  it('flags an overcommitted allowance', () => {
    const input = czCoupleWithMortgage();
    const greedy = {
      ...input,
      people: input.people.map((p) =>
        p.id === 'a' ? { ...p, pocketMoney: 1_000 } : p,
      ),
    };
    const problems = detectProblems(greedy, simulate(greedy));
    expect(problems.some((p) => p.id === 'pocket-overcommitted')).toBe(true);
  });

  it('never names a provider — the low-rate rule needs the rate injected', () => {
    const input = czCoupleWithMortgage();
    const lazy = { ...input, reserve: { ...input.reserve, annualRatePct: 0.1 } };
    const withoutContext = detectProblems(lazy, simulate(lazy));
    expect(withoutContext.some((p) => p.id === 'low-reserve-rate')).toBe(false);

    const withContext = detectProblems(lazy, simulate(lazy), {
      typicalSavingsRatePct: czechia.typicalTopSavingsRatePct.value,
    });
    const rule = withContext.find((p) => p.id === 'low-reserve-rate');
    expect(rule).toBeDefined();
    expect(rule?.facts.suggestedRatePct).toBe(czechia.typicalTopSavingsRatePct.value);
  });
});

describe('searchLever', () => {
  it('returns null rather than a value that does not work, when a lever cannot help', () => {
    const input = czCoupleUnderStress();
    const impossible = searchLever(
      input,
      {
        id: 'noop',
        direction: 'decrease',
        step: 1,
        get: () => 10,
        /* A lever that changes nothing can never fix anything. */
        set: (i) => i,
      },
      () => false,
    );
    expect(impossible).toBeNull();
  });

  it('every value it returns is proven by a fresh simulation', () => {
    const input = czCoupleUnderStress();
    const problems = detectProblems(input, simulate(input));
    const problem = problems.find((p) => criterionFor(p) !== null);
    expect(problem).toBeDefined();
    const criterion = criterionFor(problem!)!;

    for (const lever of buildLevers(input)) {
      const found = searchLever(input, lever, criterion);
      if (!found) continue;
      /* Re-simulate independently and assert the criterion really holds. */
      const independent = simulate(lever.set(input, found.value));
      expect(criterion(independent), `${lever.id} -> ${found.value}`).toBe(true);
    }
  });

  it('snaps to the lever step', () => {
    const input = czCoupleUnderStress();
    const problems = detectProblems(input, simulate(input));
    const criterion = criterionFor(problems[0]!)!;
    const lever = buildLevers(input).find((l) => l.id === 'jointInvesting.monthlyContribution')!;
    const found = searchLever(input, lever, criterion);
    if (found) expect(found.value % lever.step).toBeCloseTo(0, 6);
  });
});

describe('recommend', () => {
  it('only emits fixes that provably remove the problem', () => {
    const input = czCoupleUnderStress();
    const problems = detectProblems(input, simulate(input));
    const problem = problems.find((p) => criterionFor(p) !== null)!;
    const fixes = recommend(input, problem);

    expect(fixes.length).toBeGreaterThan(0);
    const criterion = criterionFor(problem)!;
    const levers = buildLevers(input);
    for (const fix of fixes) {
      expect(fix.verified).toBe(true);
      const lever = levers.find((l) => l.id === fix.leverId)!;
      expect(criterion(simulate(lever.set(input, fix.to))), fix.leverId).toBe(true);
      /* The proof must actually show an improvement, not just claim one. */
      expect(fix.after.minReserve).toBeGreaterThanOrEqual(fix.before.minReserve - 1e-6);
    }
  });

  it('orders fixes least-drastic first', () => {
    const input = czCoupleUnderStress();
    const problems = detectProblems(input, simulate(input));
    const fixes = recommend(input, problems.find((p) => criterionFor(p) !== null)!);
    const rel = fixes.map((f) => Math.abs(f.to - f.from) / Math.max(1, Math.abs(f.from)));
    for (let i = 1; i < rel.length; i++) {
      expect(rel[i]!).toBeGreaterThanOrEqual(rel[i - 1]! - 1e-9);
    }
  });

  it('returns nothing for a healthy household', () => {
    const input = czCoupleWithMortgage();
    const result = simulate(input);
    expect(isHealthy(result)).toBe(true);
    const problems = detectProblems(input, result).filter((p) => criterionFor(p) !== null);
    expect(problems).toEqual([]);
  });

  it('works in EUR with the Slovak regime and respects the EUR step sizes', () => {
    const input = skCoupleWithChild();
    const stressed = {
      ...input,
      reserve: { ...input.reserve, balance: 3_000 },
      jointInvesting: { ...input.jointInvesting, monthlyContribution: 900 },
    };
    const problems = detectProblems(stressed, simulate(stressed));
    const problem = problems.find((p) => criterionFor(p) !== null);
    if (!problem) return;
    const fixes = recommend(stressed, problem);
    for (const fix of fixes) {
      const lever = buildLevers(stressed).find((l) => l.id === fix.leverId)!;
      expect(fix.to % lever.step).toBeCloseTo(0, 6);
    }
  });
});

describe('levers — other liabilities', () => {
  it('never proposes a payment below interest-only, because that is a default, not a fix', () => {
    const input = czSingleRentingWithCarLoan();
    /* The fixture's own loan is suppressed (it is costlier than investing), so use a cheap one. */
    const cheapLoan = {
      ...input,
      liabilities: input.liabilities.map((l) => ({ ...l, annualRatePct: 4 })),
    };
    const lever = buildLevers(cheapLoan).find((l) => l.id.startsWith('liabilities['));
    expect(lever).toBeDefined();
    const first = cheapLoan.liabilities[0];
    const interestOnly = ((first?.balance ?? 0) * (first?.annualRatePct ?? 0)) / 100 / 12;
    expect(lever?.min ?? 0).toBeGreaterThanOrEqual(interestOnly);

    const problems = detectProblems(cheapLoan, simulate(cheapLoan));
    const fixable = problems.find((p) => criterionFor(p) !== null);
    if (fixable) {
      for (const fix of recommend(cheapLoan, fixable)) {
        if (fix.leverId.startsWith('liabilities[')) {
          expect(fix.to).toBeGreaterThanOrEqual(lever?.min ?? 0);
        }
      }
    }
  });

  it('offers no payment lever for a debt that already costs more than the assumed return', () => {
    /*
     * Otherwise the screen argues with itself: one card says "pay the 8.9 % loan down", the
     * other says "pay less on it to protect the ETF standing order".
     */
    const input = czSingleRentingWithCarLoan();
    expect(buildLevers(input).some((l) => l.id.startsWith('liabilities['))).toBe(false);
  });
});
