import { describe, expect, it } from 'vitest';
import { simulate, detectProblems, criterionFor, recommend } from '@wealthplanner/engine';
import type { JurisdictionCode } from '@wealthplanner/jurisdictions';
import { countryFor, defaultScenario, demoScenario } from '../src/lib/defaults';
import { exportPlan, importPlan } from '../src/lib/storage';
import { upgradePlan } from '../src/lib/migrate';
import { comparisonVariants, sensitivityRows } from '../src/lib/variants';

const START = { year: 2026, month: 8 };
const CODES: JurisdictionCode[] = ['CZ', 'SK'];

describe('starting values', () => {
  it('gives a Czech household koruna, Czech leave rules and a working projection', () => {
    const scenario = defaultScenario('CZ', START);
    expect(scenario.currency).toBe('CZK');
    expect(scenario.leaveRegime.jurisdiction).toBe('CZ');
    const result = simulate(scenario);
    expect(result.monthly.length).toBeGreaterThan(300);
    expect(Number.isFinite(result.finalNetWorth)).toBe(true);
  });

  it('gives a Slovak household euro and Slovak leave rules', () => {
    const scenario = defaultScenario('SK', START);
    expect(scenario.currency).toBe('EUR');
    expect(scenario.leaveRegime.jurisdiction).toBe('SK');
  });

  it('maps a locale to a country in exactly one place', () => {
    expect(countryFor('sk')).toBe('SK');
    expect(countryFor('cs')).toBe('CZ');
    /* Anything unexpected must fall back, never throw: this runs on every page load. */
    expect(countryFor('en')).toBe('CZ');
  });
});

/*
 * Every locale's landing page makes the same promise: it finds the month a plan breaks. A demo
 * that stays solvent silently downgrades that promise to "the plan holds" — which is exactly
 * what shipped for Slovakia, because the old single-country test could not see it. So this
 * runs for EVERY jurisdiction, and adding one will fail until its demo earns its alarm.
 */
describe.each(CODES)('the landing demo for %s', (code) => {
  const scenario = demoScenario(code, START);
  const result = simulate(scenario);

  it('dips below its own inflated reserve floor', () => {
    expect(result.worstFloorGap).toBeLessThan(0);
  });

  /*
   * Stronger than the floor test above, and it exists because the weaker one passed while the
   * example was quietly broken: raising the default wage growth to the ČNB long-run figure let
   * the demo household grow out of its trough, so the landing page rendered a healthy plan and
   * no red verdict at all. The floor gap was still negative; the deficit was gone.
   */
  it('actually runs out of money, which is the entire point of the example', () => {
    expect(result.deficitAt).not.toBeNull();
    expect(result.minReserve).toBeLessThan(0);
  });

  it('names the month of the trough instead of an em dash', () => {
    /*
     * simulate() seeds minReserve with the opening balance, so a plan whose trough never goes
     * below day one reports minReserveAt = null and the hero prints "—" where the month
     * belongs. Both assertions are needed: one catches a flat plan, the other a shallow one.
     */
    expect(result.minReserveAt).not.toBeNull();
    expect(result.minReserve).toBeLessThan(scenario.reserve.balance);
  });

  it('emits a problem the recommender can provably fix', () => {
    const problems = detectProblems(scenario, result);
    const fixable = problems.filter((p) => criterionFor(p) !== null);
    expect(fixable.length).toBeGreaterThan(0);
    expect(recommend(scenario, fixable[0]!).length).toBeGreaterThan(0);
  });

  it('leaves the childless household of the same country solvent', () => {
    /* The alarm has to come from the child, not from a household that never worked. */
    const plain = simulate(defaultScenario(code, START));
    expect(plain.deficitAt).toBeNull();
    expect(plain.worstFloorGap).toBeGreaterThanOrEqual(0);
  });

  it('keeps a single-adult household of the same country solvent too', () => {
    const solo = defaultScenario(code, START, 1);
    expect(solo.people).toHaveLength(1);
    const r = simulate(solo);
    expect(r.deficitAt).toBeNull();
  });
});

describe('household size', () => {
  it('scales a lone adult down instead of halving a couple', () => {
    for (const code of CODES) {
      const couple = defaultScenario(code, START, 2);
      const solo = defaultScenario(code, START, 1);
      const groceries = (s: typeof couple) =>
        s.expenses.find((e) => e.id === 'groceries')?.monthlyAmount ?? 0;
      /* Food is near-linear in people; a dwelling's utilities are not. Both must move, and
         the dwelling must move less — that is the whole point of an equivalence scale. */
      const foodRatio = groceries(solo) / groceries(couple);
      const utilities = (s: typeof couple) =>
        s.expenses.find((e) => e.id === 'utilities')?.monthlyAmount ?? 0;
      const utilityRatio = utilities(solo) / utilities(couple);
      expect(foodRatio).toBeLessThan(utilityRatio);
      expect(foodRatio).toBeGreaterThan(0.4);
      /* Income is per person and must never be scaled. */
      expect(solo.people[0]?.netMonthlyIncome).toBe(couple.people[0]?.netMonthlyIncome);
    }
  });

  it('derives the horizon from age instead of a magic constant', () => {
    const scenario = defaultScenario('CZ', START);
    const birthYear = scenario.people[0]?.birthYear ?? 0;
    expect(birthYear).toBeGreaterThan(1900);
    expect(scenario.assumptions.horizonYear).toBeGreaterThan(birthYear + 60);
  });
});

describe('the comparison panel respects what the household said about children', () => {
  it('does not invent a child for a household that said no', () => {
    const base = { ...defaultScenario('CZ', START), childrenIntent: 'no' as const };
    const variants = comparisonVariants(base);
    expect(variants.every((v) => v.scenario.children.length === 0)).toBe(true);
    expect(variants.length).toBeGreaterThan(1);
  });

  it('still offers the child columns to an undecided household', () => {
    const base = { ...defaultScenario('CZ', START), childrenIntent: 'undecided' as const };
    expect(comparisonVariants(base).some((v) => v.scenario.children.length > 0)).toBe(true);
  });
});

describe('the sensitivity panel matches the household it describes', () => {
  it('shocks the rent for a renter and the rate for an owner', () => {
    const owner = defaultScenario('CZ', START);
    expect(sensitivityRows(owner).map((r) => r.key)).toContain('rateUp');

    const renter = {
      ...owner,
      housing: {
        kind: 'rent' as const,
        rent: {
          id: 'r1',
          label: '',
          monthlyAmount: 20_000,
          annualIndexationPct: 3,
          countsTowardReserveFloor: true,
        },
      },
    };
    const keys = sensitivityRows(renter).map((r) => r.key);
    expect(keys).toContain('rentUp');
    expect(keys).not.toContain('rateUp');
  });

  it('tells the truth about whose income it cut in a one-person household', () => {
    const solo = defaultScenario('CZ', START, 1);
    const row = sensitivityRows(solo).find((r) => r.key === 'incomeDown');
    expect(row?.labelKey).toBe('sensitivity.incomeDownSingle');
  });
});

describe('upgrading a plan saved by an older build', () => {
  it('reads a v1 mortgage array as owning, never as renting', () => {
    const legacy = {
      ...defaultScenario('CZ', START),
      mortgages: [
        { id: 'm1', label: '', balance: 3_000_000, annualRatePct: 4, monthlyPayment: 20_000, rateResets: [] },
      ],
    } as unknown as Parameters<typeof upgradePlan>[0];
    delete (legacy as Record<string, unknown>).housing;
    const upgraded = upgradePlan(legacy);
    expect(upgraded.housing.kind).toBe('own');
    expect(upgraded.housing.kind === 'own' && upgraded.housing.mortgages[0]?.balance).toBe(3_000_000);
  });

  it('reads a plan with a child as intending children, and one without as undecided', () => {
    const withChild = demoScenario('CZ', START) as unknown as Record<string, unknown>;
    delete withChild.childrenIntent;
    expect(upgradePlan(withChild as never).childrenIntent).toBe('yes');

    const without = defaultScenario('CZ', START) as unknown as Record<string, unknown>;
    delete without.childrenIntent;
    /* Never 'no'. The user was not asked, and 'no' is an answer. */
    expect(upgradePlan(without as never).childrenIntent).toBe('undecided');
  });

  it('is idempotent, because the planner hydrates an imported plan twice', () => {
    const once = upgradePlan(defaultScenario('SK', START));
    const twice = upgradePlan(once);
    expect(JSON.stringify(twice.housing)).toBe(JSON.stringify(once.housing));
    expect(twice.liabilities).toEqual(once.liabilities);
  });

  it('never invents a birth year for a person who did not give one', () => {
    const scenario = defaultScenario('CZ', START);
    const anonymous = {
      ...scenario,
      people: scenario.people.map(({ birthYear, ...rest }) => rest),
    } as unknown as Parameters<typeof upgradePlan>[0];
    expect(upgradePlan(anonymous).people[0]?.birthYear).toBeUndefined();
  });
});

describe('export and import round-trip', () => {
  it('survives a round trip with the leave regime reattached', () => {
    const original = demoScenario('SK', START);
    const restored = importPlan(exportPlan(original));
    expect(restored).not.toBeNull();
    expect(restored?.leaveRegime.jurisdiction).toBe('SK');
    expect(restored?.currency).toBe('EUR');
    /* The whole point: the restored plan must compute the same numbers. */
    expect(simulate(restored!).minReserve).toBeCloseTo(simulate(original).minReserve, 6);
  });

  it('rejects nonsense instead of throwing', () => {
    expect(importPlan('not json')).toBeNull();
    expect(importPlan('{"scenario":{}}')).toBeNull();
  });

  it('rejects a plan whose country cannot be proven, rather than defaulting it to Czech', () => {
    const scenario = demoScenario('SK', START) as unknown as Record<string, unknown>;
    scenario.jurisdiction = undefined;
    expect(importPlan(JSON.stringify({ scenario }))).toBeNull();
  });
});
