import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_FIXTURES, type FixtureName } from '@wealthplanner/engine-fixtures';
import { simulate } from '@wealthplanner/engine';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(HERE, 'golden');

/**
 * Golden files are hand-written JSON rather than an opaque snapshot blob, so a change in
 * the engine's arithmetic shows up as a readable diff in the pull request. Regenerate
 * deliberately with UPDATE_GOLDEN=1 and review every changed number — and bump
 * ENGINE_VERSION when you do.
 */
function summarise(name: FixtureName) {
  const input = ALL_FIXTURES[name]();
  const r = simulate(input);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    engineVersion: r.engineVersion,
    months: r.monthly.length,
    minReserve: round(r.minReserve),
    minReserveAt: r.minReserveAt,
    deficitAt: r.deficitAt,
    pausedMonths: r.pausedMonths,
    pausedAmount: round(r.pausedAmount),
    pausedFrom: r.pausedFrom,
    mortgagePaidYear: r.mortgagePaidYear,
    fixedMonthlyOutgoings: round(r.fixedMonthlyOutgoings),
    reserveFloor: round(r.reserveFloor),
    worstFloorGap: round(r.worstFloorGap),
    worstFloorGapAt: r.worstFloorGapAt,
    firstSurplus: round(r.firstSurplus),
    foregoneIncome: round(r.foregoneIncome),
    finalNetWorth: round(r.finalNetWorth),
    /* A sparse sample of the monthly series: enough to catch a shifted curve. */
    sample: r.monthly
      .filter((m) => m.index % 60 === 0)
      .map((m) => ({
        i: m.index,
        ym: `${m.year}-${String(m.month + 1).padStart(2, '0')}`,
        income: round(m.income),
        spending: round(m.spending),
        reserve: round(m.reserve),
        joint: round(m.jointInvestments),
        mortgage: round(m.mortgageBalance),
      })),
  };
}

describe('golden projections', () => {
  const names = Object.keys(ALL_FIXTURES) as FixtureName[];
  for (const name of names) {
    it(name, () => {
      const actual = summarise(name);
      const file = join(GOLDEN_DIR, `${name}.json`);
      if (process.env.UPDATE_GOLDEN === '1' || !existsSync(file)) {
        mkdirSync(GOLDEN_DIR, { recursive: true });
        writeFileSync(file, JSON.stringify(actual, null, 2) + '\n', 'utf8');
      }
      const expected = JSON.parse(readFileSync(file, 'utf8'));
      expect(actual).toEqual(expected);
    });
  }
});
