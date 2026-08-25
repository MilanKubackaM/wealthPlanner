import { describe, expect, it } from 'vitest';
import {
  czCoupleWithChild,
  czCoupleWithMortgage,
  czSingleRentingWithCarLoan,
  paidOffNoChildren,
  zeroIncomeHousehold,
} from '@wealthplanner/engine-fixtures';
import { scorePlan, simulate, type ScenarioInput, type ScoreDimensionId } from '@wealthplanner/engine';

/* The Czech benchmarks, so the tests read the same numbers the product does. */
const CZ = {
  targetInvestingSharePct: 12,
  cashComfortMonthsMax: 6,
  advisoryDebtServiceSharePct: 35,
  cannotFaceUnexpectedExpensePct: 18.7,
};

const score = (input: ScenarioInput, opts = CZ) => scorePlan(input, simulate(input), opts);
const dim = (input: ScenarioInput, id: ScoreDimensionId, opts = CZ) =>
  score(input, opts).dimensions.find((d) => d.id === id)!;

describe('scorePlan — shape and invariants', () => {
  it('returns four dimensions in a stable order whose weights sum to one', () => {
    const s = score(czCoupleWithMortgage());
    expect(s.dimensions.map((d) => d.id)).toEqual(['reserve', 'investing', 'debt', 'headroom']);
    const total = s.dimensions.reduce((sum, d) => sum + d.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('keeps every score and the overall inside 0-100, as integers', () => {
    for (const make of [
      czCoupleWithMortgage,
      czCoupleWithChild,
      czSingleRentingWithCarLoan,
      paidOffNoChildren,
      zeroIncomeHousehold,
    ]) {
      const s = score(make());
      expect(Number.isInteger(s.overall)).toBe(true);
      expect(s.overall).toBeGreaterThanOrEqual(0);
      expect(s.overall).toBeLessThanOrEqual(100);
      for (const d of s.dimensions) {
        expect(Number.isInteger(d.score)).toBe(true);
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('survives a household with no income at all without emitting NaN', () => {
    const s = score(zeroIncomeHousehold());
    expect(Number.isFinite(s.overall)).toBe(true);
    for (const d of s.dimensions) expect(Number.isFinite(d.score)).toBe(true);
  });

  it('is deterministic', () => {
    const input = czCoupleWithMortgage();
    expect(score(input)).toEqual(score(input));
  });

  it('changes no projected number — it only reads the result', () => {
    const input = czCoupleWithMortgage();
    const before = simulate(input);
    scorePlan(input, before, CZ);
    expect(simulate(input)).toEqual(before);
  });
});

describe('scorePlan — the reserve is judged at its worst month', () => {
  it('caps a plan that goes below zero, however good everything else is', () => {
    const input = czCoupleWithChild();
    const result = simulate(input);
    /* The fixture is the one that troughs; if that ever stops being true this test is lying. */
    expect(result.deficitAt).not.toBeNull();

    const reserve = dim(input, 'reserve');
    expect(reserve.advice).toBe('reserve-deficit');
    expect(reserve.score).toBeLessThanOrEqual(25);
  });

  /*
   * The composite must not average a fatal flaw away. Before this rule the Slovak landing
   * example scored 58 overall — three strong dimensions carrying a reserve of 7 — which reads
   * as a passing grade for a plan that runs out of money.
   */
  it('holds the OVERALL score down when the plan runs out of money, however strong the rest', () => {
    const input = czCoupleWithChild();
    const s = score(input);
    expect(simulate(input).deficitAt).not.toBeNull();
    expect(s.overall).toBeLessThanOrEqual(45);

    /* And it is the gate doing the work, not weak dimensions: the other three are healthy. */
    const others = s.dimensions.filter((d) => d.id !== 'reserve');
    expect(others.every((d) => d.score > 50)).toBe(true);
  });

  it('gives full marks once the trough sits on the recommended floor', () => {
    const input = paidOffNoChildren();
    const result = simulate(input);
    expect(result.worstFloorGap).toBeGreaterThanOrEqual(0);
    expect(dim(input, 'reserve').score).toBe(100);
    expect(dim(input, 'reserve').advice).toBe('reserve-ok');
  });

  it('reports the cover in months, so the UI can state it instead of asserting a grade', () => {
    const facts = dim(paidOffNoChildren(), 'reserve').facts;
    expect(facts.coverMonths).toBeGreaterThan(0);
    expect(facts.peerCannotCoverPct).toBe(18.7);
  });
});

describe('scorePlan — telling a saver to stop saving', () => {
  /*
   * The case the whole dimension exists for: plenty of cash, nothing invested. The reserve is
   * excellent and the arrangement is still wrong, and the score has to be able to say both.
   */
  const hoarder = (): ScenarioInput => ({
    ...czCoupleWithMortgage(),
    reserve: { balance: 3_000_000, annualRatePct: 4, sweepCap: null },
    jointInvesting: { monthlyContribution: 0, annualReturnPct: 7, startingBalance: 0 },
    people: czCoupleWithMortgage().people.map((p) => ({ ...p, investments: [] })),
  });

  it('scores the reserve full marks and the investing near zero', () => {
    expect(dim(hoarder(), 'reserve').score).toBe(100);
    expect(dim(hoarder(), 'investing').score).toBe(0);
  });

  it('advises moving the cash, not finding more money', () => {
    const investing = dim(hoarder(), 'investing');
    expect(investing.advice).toBe('investing-cash-heavy');
    expect(investing.facts.cashMonths!).toBeGreaterThan(CZ.cashComfortMonthsMax);
  });

  it('penalises a cash pile even when the contribution is already on target', () => {
    const onTarget: ScenarioInput = {
      ...hoarder(),
      /* 20 000 of 105 000 net is ~19 %, comfortably past the 12 % benchmark. */
      jointInvesting: { monthlyContribution: 20_000, annualReturnPct: 7, startingBalance: 0 },
    };
    const investing = dim(onTarget, 'investing');
    expect(investing.advice).toBe('investing-cash-heavy');
    expect(investing.score).toBeLessThan(100);
  });

  /*
   * The ethical gate. A household whose reserve dips under its floor must NOT be told to move
   * cash into the market, because for a fragile household liquidity beats optimisation. If
   * this test ever goes green on 'investing-cash-heavy', the module is giving harmful advice.
   */
  it('never calls a household cash-heavy while its reserve dips below the floor', () => {
    /*
     * The fixture already holds more cash TODAY than the six-month ceiling and still troughs
     * later, which is exactly the trap: judged on today's balance alone it looks like a
     * hoarder, and telling it to move the money into the market would be harmful advice.
     */
    const fragile = czCoupleWithChild();
    const result = simulate(fragile);
    expect(result.worstFloorGap).toBeLessThan(0);
    expect(dim(fragile, 'investing').facts.cashMonths!).toBeGreaterThan(
      CZ.cashComfortMonthsMax,
    );
    expect(dim(fragile, 'investing').advice).not.toBe('investing-cash-heavy');
  });

  /*
   * A household a whisker over the soft ceiling must NOT be told its problem is a cash pile.
   * This test is why `MATERIAL_CASH_EXCESS_MONTHS` exists: at seven months against a
   * six-month line the deduction is right and the headline is not.
   */
  it('says nothing is invested when nothing is invested and the cash is barely over the line', () => {
    const lean: ScenarioInput = {
      ...czCoupleWithMortgage(),
      reserve: { balance: 400_000, annualRatePct: 4, sweepCap: null },
      jointInvesting: { monthlyContribution: 0, annualReturnPct: 7, startingBalance: 0 },
      people: czCoupleWithMortgage().people.map((p) => ({ ...p, investments: [] })),
    };
    const investing = dim(lean, 'investing');
    expect(investing.facts.cashMonths!).toBeGreaterThan(CZ.cashComfortMonthsMax);
    expect(investing.facts.cashMonths!).toBeLessThan(CZ.cashComfortMonthsMax + 3);
    expect(investing.advice).toBe('investing-none');
    expect(investing.score).toBe(0);
  });

  it('counts personal sleeves towards the target, not just the joint contribution', () => {
    const base = czCoupleWithMortgage();
    const jointOnly: ScenarioInput = {
      ...base,
      people: base.people.map((p) => ({ ...p, investments: [] })),
    };
    expect(dim(base, 'investing').facts.investingSharePct!).toBeGreaterThan(
      dim(jointOnly, 'investing').facts.investingSharePct!,
    );
  });
});

describe('scorePlan — debt', () => {
  it('caps the dimension when a debt costs more than the portfolio is expected to earn', () => {
    const input = czSingleRentingWithCarLoan();
    const debt = dim(input, 'debt');
    const expensive = input.liabilities.filter(
      (l) => l.annualRatePct > input.jointInvesting.annualReturnPct,
    );
    if (expensive.length > 0) {
      expect(debt.advice).toBe('debt-costlier-than-returns');
      expect(debt.score).toBeLessThanOrEqual(55);
      expect(debt.facts.worstDebtRatePct).toBe(Math.max(...expensive.map((l) => l.annualRatePct)));
    }
  });

  it('caps regardless of how small the payment is — the rate is the point, not the size', () => {
    const base = czCoupleWithMortgage();
    const tinyExpensiveCard: ScenarioInput = {
      ...base,
      housing: { kind: 'own', mortgages: [] },
      liabilities: [
        {
          id: 'card',
          label: 'Card',
          kind: 'credit-card',
          balance: 20_000,
          annualRatePct: 22,
          monthlyPayment: 900,
          remainingTermMonths: 0,
          revolving: true,
        },
      ],
    };
    const debt = dim(tinyExpensiveCard, 'debt');
    expect(debt.facts.debtSharePct!).toBeLessThan(2);
    expect(debt.advice).toBe('debt-costlier-than-returns');
    expect(debt.score).toBeLessThanOrEqual(55);
  });

  it('gives full marks to a household with no debt at all', () => {
    const debt = dim(paidOffNoChildren(), 'debt');
    expect(debt.score).toBe(100);
    expect(debt.advice).toBe('debt-ok');
  });

  /*
   * The deliberate property: the regulator's ceiling is where a bank must refuse the loan, so
   * it is not a passing grade. Scoring zero there is the intended reading, not an accident.
   */
  it('scores zero by the time debt service reaches the regulators own ceiling', () => {
    const base = czCoupleWithMortgage();
    /* Narrowing, not casting: the fixture is an owner, and the union has to be asked. */
    if (base.housing.kind !== 'own') throw new Error('fixture is expected to own');
    const crushed: ScenarioInput = {
      ...base,
      housing: {
        kind: 'own',
        mortgages: [{ ...base.housing.mortgages[0]!, monthlyPayment: 70_000 }],
      },
    };
    const debt = dim(crushed, 'debt');
    expect(debt.facts.debtSharePct!).toBeGreaterThan(59);
    expect(debt.score).toBe(0);
    expect(debt.advice).toBe('debt-heavy');
  });
});

describe('scorePlan — headroom', () => {
  it('is zero when nothing at all is left at the end of the month', () => {
    const base = czCoupleWithMortgage();
    const spent: ScenarioInput = {
      ...base,
      expenses: base.expenses.map((e) =>
        e.id === 'leisure' ? { ...e, monthlyAmount: 60_000 } : e,
      ),
    };
    const headroom = dim(spent, 'headroom');
    expect(headroom.score).toBe(0);
    expect(headroom.advice).toBe('headroom-none');
  });

  /*
   * The advice must not argue with its own score. A row reading 91 while the sentence says
   * "the surplus is small" is the panel contradicting itself, and it shipped that way until a
   * screenshot caught it.
   */
  it('calls a healthy surplus healthy, at the same threshold the UI turns the row green', () => {
    const base = czCoupleWithMortgage();
    const comfortable: ScenarioInput = {
      ...base,
      expenses: base.expenses.map((e) =>
        e.id === 'leisure' ? { ...e, monthlyAmount: 6_000 } : e,
      ),
    };
    const headroom = dim(comfortable, 'headroom');
    expect(headroom.score).toBeGreaterThanOrEqual(70);
    expect(headroom.advice).toBe('headroom-ok');
  });

  it('reports the surplus as a share of net income', () => {
    const headroom = dim(czCoupleWithMortgage(), 'headroom');
    expect(headroom.facts.headroomSharePct).toBeDefined();
    expect(Number.isFinite(headroom.facts.headroomSharePct!)).toBe(true);
  });
});

describe('scorePlan — a child moves weight towards liquidity', () => {
  it('weights the reserve higher when a child is in the plan, and says that it did', () => {
    const childless = score({ ...czCoupleWithMortgage(), childrenIntent: 'no' });
    const expecting = score({ ...czCoupleWithMortgage(), childrenIntent: 'yes' });

    expect(childless.childWeighted).toBe(false);
    expect(expecting.childWeighted).toBe(true);

    const w = (s: typeof childless, id: ScoreDimensionId) =>
      s.dimensions.find((d) => d.id === id)!.weight;
    expect(w(expecting, 'reserve')).toBeGreaterThan(w(childless, 'reserve'));
    expect(w(expecting, 'investing')).toBeLessThan(w(childless, 'investing'));
  });

  it('also triggers on an actual child, not only on the intention', () => {
    expect(score(czCoupleWithChild()).childWeighted).toBe(true);
  });

  it('leaves the reserve TARGET to the engine — only the weight moves', () => {
    /* Same result, same reserve sub-score; the intention must not move the target itself. */
    const base = czCoupleWithMortgage();
    const a = dim({ ...base, childrenIntent: 'no' }, 'reserve');
    const b = dim({ ...base, childrenIntent: 'yes' }, 'reserve');
    expect(a.score).toBe(b.score);
    expect(a.facts.coverMonths).toBe(b.facts.coverMonths);
  });
});

describe('scorePlan — the benchmarks come from the caller, not from here', () => {
  it('moves the investing score when the country target moves', () => {
    const input = czCoupleWithMortgage();
    const strict = dim(input, 'investing', { ...CZ, targetInvestingSharePct: 30 });
    const lenient = dim(input, 'investing', { ...CZ, targetInvestingSharePct: 5 });
    expect(lenient.score).toBeGreaterThan(strict.score);
  });

  it('moves the cash-heavy line when the country ceiling moves', () => {
    const input: ScenarioInput = {
      ...czCoupleWithMortgage(),
      reserve: { balance: 1_500_000, annualRatePct: 4, sweepCap: null },
    };
    const tight = dim(input, 'investing', { ...CZ, cashComfortMonthsMax: 3 });
    const loose = dim(input, 'investing', { ...CZ, cashComfortMonthsMax: 36 });
    expect(tight.score).toBeLessThan(loose.score);
    expect(loose.advice).not.toBe('investing-cash-heavy');
  });
});
