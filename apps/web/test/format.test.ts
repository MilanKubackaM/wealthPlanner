import { describe, expect, it } from 'vitest';
import {
  axisScaleFor,
  money,
  moneyAxis,
  monthLabel,
  monthPhrase,
  percent,
} from '../src/lib/format';

/**
 * These guard a bug that cost real debugging time: Node and Chrome disagreed on the spacing
 * and the fraction digits Intl produces for cs-CZ currency, which made every server-rendered
 * amount a React hydration mismatch. The rule is now explicit — no raw Intl output reaches the
 * DOM, and compact notation is done by hand.
 */
describe('money formatting is hydration-safe', () => {
  it('uses one canonical no-break space and never a narrow or thin one', () => {
    for (const value of [0, 1234, 128_652, -91_729, 34_083_231]) {
      for (const locale of ['cs', 'sk'] as const) {
        const text = money(value, 'CZK', locale);
        expect(text, text).not.toMatch(/[  ]/);
        expect(text, text).not.toMatch(/ /); // no plain ASCII space either
      }
    }
  });

  it('renders Czech koruna the local way, not the foreign way', () => {
    const text = money(128_652, 'CZK', 'cs');
    expect(text).toContain('Kč');
    expect(text).not.toContain('CZK');
    expect(text.replace(/ /g, ' ')).toBe('128 652 Kč');
  });

  it('renders euro amounts for Slovakia', () => {
    const text = money(1_218, 'EUR', 'sk');
    expect(text).toContain('€');
  });

  it('rounds rather than showing hundredths', () => {
    expect(money(1234.56, 'CZK', 'cs').replace(/ /g, ' ')).toBe('1 235 Kč');
  });
});

describe('axis formatting', () => {
  it('picks one unit for the whole axis from its range', () => {
    expect(axisScaleFor(683_000)).toBe('thousands');
    expect(axisScaleFor(34_000_000)).toBe('millions');
    expect(axisScaleFor(4_000)).toBe('units');
  });

  it('formats every tick in the chosen unit, so the ladder stays coherent', () => {
    const scale = axisScaleFor(683_000);
    const ticks = [-147_000, 60_452, 268_000, 475_000, 683_000].map((v) =>
      moneyAxis(v, 'CZK', 'cs', scale).replace(/ /g, ' '),
    );
    expect(ticks).toEqual([
      '-147 tis. Kč',
      '60 tis. Kč',
      '268 tis. Kč',
      '475 tis. Kč',
      '683 tis. Kč',
    ]);
  });

  it('never emits Intl compact notation, which differs between Node and the browser', () => {
    const text = moneyAxis(34_083_231, 'CZK', 'cs', 'millions').replace(/ /g, ' ');
    expect(text).toBe('34,1 mil. Kč');
  });
});

describe('month labels', () => {
  const csMonths = ['leden', 'únor', 'březen'];
  const csIn = ['v lednu', 'v únoru', 'v březnu'];
  const skIn = ['v januári', 'vo februári', 'v marci'];

  it('uses the nominative for a standalone label', () => {
    expect(monthLabel({ year: 2032, month: 0 }, csMonths)).toBe('leden 2032');
  });

  it('uses the locative WITH its preposition inside a sentence', () => {
    expect(monthPhrase({ year: 2032, month: 0 }, csIn)).toBe('v lednu 2032');
  });

  it('handles the Slovak month that needs "vo" rather than "v"', () => {
    expect(monthPhrase({ year: 2032, month: 1 }, skIn)).toBe('vo februári 2032');
  });

  it('degrades to a dash rather than throwing when there is no month', () => {
    expect(monthLabel(null, csMonths)).toBe('—');
  });
});

describe('percent', () => {
  it('separates the value from the sign with a no-break space', () => {
    expect(percent(4.5, 'cs')).toBe('4,5 %');
  });
});
