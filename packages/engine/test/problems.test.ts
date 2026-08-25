import { describe, expect, it } from 'vitest';
import {
  czCoupleRenting,
  czCoupleWithChild,
  czCoupleWithMortgage,
  czSingleRentingWithCarLoan,
} from '@wealthplanner/engine-fixtures';
import { criterionFor, detectProblems, simulate } from '@wealthplanner/engine';

const ids = (input: Parameters<typeof simulate>[0], options = {}) =>
  detectProblems(input, simulate(input), options).map((p) => p.id);

describe('problems — a child whose leave belongs to nobody', () => {
  /*
   * This is the state that deleting a person from a household creates, and before the rule
   * existed nothing reported it: the child's cost was simulated, the leave was not, and
   * foregone income silently read zero. A wrong number with no warning is worse than a
   * missing feature, which is why the severity is critical.
   */
  it('reports it, and still charges for the child', () => {
    const base = czCoupleWithChild();
    const orphaned = {
      ...base,
      children: base.children.map((c) => ({ ...c, leaveTakenBy: 'nobody' })),
    };
    const r = simulate(orphaned);
    expect(r.foregoneIncome).toBe(0);
    expect(r.monthly.some((m) => m.childCost > 0)).toBe(true);
    expect(ids(orphaned)).toContain('child-leave-unassigned');
  });

  it('offers no search-based fix, because assigning the leave is not a dial', () => {
    const problem = detectProblems(
      { ...czCoupleWithChild(), children: czCoupleWithChild().children.map((c) => ({ ...c, leaveTakenBy: 'nobody' })) },
      simulate(czCoupleWithChild()),
    ).find((p) => p.id === 'child-leave-unassigned');
    expect(problem).toBeDefined();
    expect(criterionFor(problem!)).toBeNull();
  });

  it('says nothing about a household whose children are assigned', () => {
    expect(ids(czCoupleWithChild())).not.toContain('child-leave-unassigned');
  });
});

describe('problems — liabilities', () => {
  it('notices a debt that costs more than the household assumes it earns', () => {
    expect(ids(czSingleRentingWithCarLoan())).toContain('liability-rate-exceeds-return');
  });

  it('stays quiet when nothing is being invested, because then there is no trade-off', () => {
    const base = czSingleRentingWithCarLoan();
    const noDca = { ...base, jointInvesting: { ...base.jointInvesting, monthlyContribution: 0 } };
    expect(ids(noDca)).not.toContain('liability-rate-exceeds-return');
  });

  it('reports a payment that does not even cover the interest', () => {
    const base = czSingleRentingWithCarLoan();
    const first = base.liabilities[0];
    if (!first) throw new Error('fixture invariant: expected a liability');
    const trap = {
      ...base,
      liabilities: [{ ...first, monthlyPayment: (first.balance * first.annualRatePct) / 100 / 12 / 2, revolving: true }],
    };
    expect(ids(trap)).toContain('liability-never-repaid');
  });
});

describe('problems — rent', () => {
  it('reports rent indexed faster than every income grows', () => {
    expect(ids(czCoupleRenting())).toContain('housing-cost-outgrowing-income');
  });

  it('says nothing when incomes grow at least as fast as the lease', () => {
    const base = czCoupleRenting();
    if (base.housing.kind !== 'rent') throw new Error('fixture invariant: renting');
    const rent = base.housing.rent;
    const calm = { ...base, housing: { kind: 'rent' as const, rent: { ...rent, annualIndexationPct: 1 } } };
    expect(ids(calm)).not.toContain('housing-cost-outgrowing-income');
  });

  it('never fires for an owner', () => {
    expect(ids(czCoupleWithMortgage())).not.toContain('housing-cost-outgrowing-income');
  });
});

describe('problems — intent and horizon', () => {
  it('reports a plan that says children are coming and contains none', () => {
    const base = { ...czCoupleWithMortgage(), childrenIntent: 'yes' as const, children: [] };
    expect(ids(base)).toContain('children-intended-but-absent');
  });

  it('does not nag an undecided household', () => {
    const base = { ...czCoupleWithMortgage(), childrenIntent: 'undecided' as const, children: [] };
    expect(ids(base)).not.toContain('children-intended-but-absent');
  });

  it('reports a horizon that ends before the household stops earning', () => {
    const base = czCoupleWithMortgage();
    const short = { ...base, assumptions: { ...base.assumptions, horizonYear: 2040 } };
    expect(ids(short, { retirementAgeYears: 65 })).toContain('horizon-before-retirement');
    expect(ids(base, { retirementAgeYears: 65 })).not.toContain('horizon-before-retirement');
  });

  it('says nothing about retirement when no birth year was given', () => {
    const base = czCoupleWithMortgage();
    const anonymous = {
      ...base,
      assumptions: { ...base.assumptions, horizonYear: 2040 },
      people: base.people.map(({ birthYear, ...rest }) => rest),
    };
    expect(ids(anonymous, { retirementAgeYears: 65 })).not.toContain('horizon-before-retirement');
  });

  it('reports an envelope owned by someone who is no longer in the household', () => {
    const base = czCoupleWithMortgage();
    const orphaned = {
      ...base,
      envelopes: [
        { id: 'e1', label: 'Car', owner: 'ghost', amount: 50_000, target: 100_000, countsTowardReserve: false },
      ],
    };
    expect(ids(orphaned)).toContain('envelope-owner-missing');
  });
});
