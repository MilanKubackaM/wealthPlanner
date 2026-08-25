import { describe, expect, it } from 'vitest';
import cs from '../messages/cs.json';
import sk from '../messages/sk.json';

/**
 * Two catalogues, no guard until now. Five new capabilities' worth of keys across two
 * languages is a translation-drift accident waiting to happen: a key that exists in one file
 * and not the other throws MISSING_MESSAGE at runtime, in production, in one locale only.
 */
function flatten(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return [`${prefix}[]`];
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe('message catalogues', () => {
  it('have exactly the same keys in both languages', () => {
    const a = flatten(cs).sort();
    const b = flatten(sk).sort();
    expect(a.filter((key) => !b.includes(key))).toEqual([]);
    expect(b.filter((key) => !a.includes(key))).toEqual([]);
  });

  it('agree on the length of every list, so an index is never missing', () => {
    const lists: Array<[string, unknown, unknown]> = [
      ['months', cs.months, sk.months],
      ['monthsIn', cs.monthsIn, sk.monthsIn],
      ['landing.slogans', cs.landing.slogans, sk.landing.slogans],
    ];
    for (const [name, x, y] of lists) {
      expect((x as unknown[]).length, name).toBe((y as unknown[]).length);
    }
  });

  it('keeps the child-affordability slogan first, because the e2e suite asserts it', () => {
    expect(cs.landing.slogans[0]).toContain('dítě');
    expect(sk.landing.slogans[0]).toContain('dieťa');
  });

  it('uses no dots inside lever keys — next-intl reads a dot as a path separator', () => {
    for (const key of Object.keys(cs.fixes.levers)) expect(key).not.toContain('.');
    for (const key of Object.keys(sk.fixes.levers)) expect(key).not.toContain('.');
  });
});
