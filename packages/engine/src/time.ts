import type { YearMonth } from './types';

/** Absolute month number since year 0. Makes month arithmetic trivial and total-order safe. */
export function toAbsolute(ym: YearMonth): number {
  return ym.year * 12 + ym.month;
}

export function fromAbsolute(abs: number): YearMonth {
  const year = Math.floor(abs / 12);
  return { year, month: abs - year * 12 };
}

export function addMonths(ym: YearMonth, months: number): YearMonth {
  return fromAbsolute(toAbsolute(ym) + months);
}

export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return toAbsolute(to) - toAbsolute(from);
}

export function isSameMonth(a: YearMonth | null, b: YearMonth | null): boolean {
  if (!a || !b) return a === b;
  return a.year === b.year && a.month === b.month;
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return toAbsolute(a) - toAbsolute(b);
}

/**
 * Monthly compounding factor for an annual percentage rate.
 * Uses simple division by 12 rather than a geometric twelfth root, matching the
 * original prototype so that ported results stay comparable. Documented on purpose:
 * this slightly overstates growth versus true annual compounding.
 */
export function monthlyRate(annualPct: number): number {
  return annualPct / 100 / 12;
}

/** Compound growth factor after `months` months of `annualPct` annual growth. */
export function growthFactor(annualPct: number, months: number): number {
  return Math.pow(1 + annualPct / 100, months / 12);
}

/**
 * Age in whole years at a given month, or null when the birth year is unknown.
 *
 * Returns null rather than a fallback on purpose: every caller must decide what to render
 * for "not told", and none of them may render a number the user never supplied.
 */
export function ageAt(birthYear: number | undefined, ym: YearMonth): number | null {
  return birthYear === undefined ? null : ym.year - birthYear;
}
