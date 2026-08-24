import { describe, expect, it } from 'vitest';
import { simulate, detectProblems, criterionFor, recommend } from '@wealthplanner/engine';
import { defaultScenario, demoScenario } from '../src/lib/defaults';
import { exportPlan, importPlan } from '../src/lib/storage';

const START = { year: 2026, month: 8 };

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

  it('leaves the childless default household solvent — the demo must earn its alarm', () => {
    const result = simulate(defaultScenario('CZ', START));
    expect(result.deficitAt).toBeNull();
  });

  it('makes the landing demo actually show the problem it claims to show', () => {
    const scenario = demoScenario('CZ', START);
    const result = simulate(scenario);
    const problems = detectProblems(scenario, result);
    const fixable = problems.filter((p) => criterionFor(p) !== null);
    expect(fixable.length).toBeGreaterThan(0);
    /* And at least one proven fix, or the hero has nothing to prove. */
    expect(recommend(scenario, fixable[0]!).length).toBeGreaterThan(0);
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
});
