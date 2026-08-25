import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import type { YearMonth } from '@wealthplanner/engine';

export type UiLocale = 'cs' | 'sk';

const bcp47: Record<UiLocale, string> = { cs: 'cs-CZ', sk: 'sk-SK' };

/*
 * Currency formatting is a credibility test. `128 652 Kč` with the narrow no-break space
 * Intl produces reads as local; `128,652 CZK` reads as a foreign tool. So always go
 * through Intl with the matching locale, and never concatenate a symbol by hand.
 */
const cache = new Map<string, Intl.NumberFormat>();

function nf(locale: UiLocale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(options);
  let found = cache.get(key);
  if (!found) {
    found = new Intl.NumberFormat(bcp47[locale], options);
    cache.set(key, found);
  }
  return found;
}

/*
 * Node and the browser do not always pick the same space between the digits and the symbol
 * for cs-CZ and sk-SK — one emits U+00A0, the other U+202F. Rendered on the server and
 * hydrated on the client, that single invisible character is a React hydration mismatch on
 * every amount on the page. Normalising every space variant to one canonical no-break space
 * makes the two agree, and looks identical.
 */
function canonicalSpaces(text: string): string {
  return text.replace(/[\u202f\u2009\u00a0\s]/g, '\u00a0');
}

export function money(value: number, currency: CurrencyCode, locale: UiLocale): string {
  return canonicalSpaces(
    nf(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Math.round(value)),
  );
}

/*
 * Axis ticks are formatted by hand rather than with Intl's `notation: 'compact'`, because
 * Node and Chrome disagree on its fraction digits — Node produced "268 tis. Kč" where the
 * browser produced "268,0 tis. Kč", which is a hydration mismatch on a server-rendered
 * chart. Doing the division here keeps the two byte-identical.
 *
 * "tis." and "mil." are the abbreviations in both Czech and Slovak, so they need no locale
 * branch; the currency symbol does.
 */
const SYMBOL: Record<CurrencyCode, string> = { CZK: 'Kč', EUR: '€' };


export type AxisScale = 'units' | 'thousands' | 'millions';

/**
 * One unit for the whole axis, picked from its range. Formatting each tick independently
 * produced a ladder that read "268 tis. Kč" next to "60 452 Kč" — technically correct,
 * visually incoherent.
 */
export function axisScaleFor(maxAbs: number): AxisScale {
  if (maxAbs >= 1_000_000) return 'millions';
  if (maxAbs >= 10_000) return 'thousands';
  return 'units';
}

export function moneyAxis(
  value: number,
  currency: CurrencyCode,
  locale: UiLocale,
  scale: AxisScale,
): string {
  const symbol = SYMBOL[currency];
  if (scale === 'millions') {
    const scaled = canonicalSpaces(
      nf(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 1_000_000),
    );
    return `${scaled}\u00a0mil.\u00a0${symbol}`;
  }
  if (scale === 'thousands') {
    const scaled = canonicalSpaces(nf(locale, { maximumFractionDigits: 0 }).format(value / 1_000));
    return `${scaled}\u00a0tis.\u00a0${symbol}`;
  }
  return money(value, currency, locale);
}

export function moneyCompact(value: number, currency: CurrencyCode, locale: UiLocale): string {
  const abs = Math.abs(value);
  const symbol = SYMBOL[currency];
  const millions = 1_000_000;
  const thousands = currency === 'CZK' ? 100_000 : 10_000;

  if (abs >= millions) {
    const scaled = canonicalSpaces(
      nf(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 1_000_000),
    );
    return `${scaled}\u00a0mil.\u00a0${symbol}`;
  }
  if (abs >= thousands) {
    const scaled = canonicalSpaces(
      nf(locale, { maximumFractionDigits: 0 }).format(value / 1_000),
    );
    return `${scaled}\u00a0tis.\u00a0${symbol}`;
  }
  return money(value, currency, locale);
}

export function signedMoney(value: number, currency: CurrencyCode, locale: UiLocale): string {
  const formatted = money(Math.abs(value), currency, locale);
  return value < 0 ? `−${formatted}` : formatted;
}

/**
 * `digits` defaults to 2 so every existing call site is unchanged. Pass 1 for a ratio the
 * user is meant to read at a glance: "6,4 %" is the same claim as "6,41 %" and one of them
 * pretends the model knows the second decimal.
 */
export function percent(value: number, locale: UiLocale, digits = 2): string {
  return canonicalSpaces(nf(locale, { maximumFractionDigits: digits }).format(value)) + '\u00a0%';
}

/**
 * A bare localised number. Exists because a count interpolated into a message is NOT
 * localised by the catalogue — "4.5 měs." shipped with an English decimal point until this
 * was formatted here instead.
 */
export function decimal(value: number, locale: UiLocale, digits = 1): string {
  return canonicalSpaces(nf(locale, { maximumFractionDigits: digits }).format(value));
}

export function integer(value: number, locale: UiLocale): string {
  return canonicalSpaces(nf(locale, { maximumFractionDigits: 0 }).format(value));
}

/**
 * Month labels come from the message catalogue rather than Intl, because the sentences
 * need the locative case with its preposition — "v lednu 2032", "vo februári 2032" —
 * and the correct form differs per month AND per language. Intl only gives nominative.
 */
export function monthLabel(at: YearMonth | null, months: string[]): string {
  if (!at) return '—';
  return `${months[at.month] ?? ''} ${at.year}`.trim();
}

export function monthPhrase(at: YearMonth | null, monthsIn: string[]): string {
  if (!at) return '—';
  return `${monthsIn[at.month] ?? ''} ${at.year}`.trim();
}

/** Today's month, used as the projection start. Kept out of the engine on purpose. */
export function currentYearMonth(now: Date = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() };
}

/**
 * Digits grouped the local way, with no currency symbol — the unit is an affix inside the
 * field's border, not part of the number. Goes through `canonicalSpaces` for the same
 * hydration reason every other formatter here does.
 */
export function groupNumber(value: number, locale: UiLocale, precision = 0): string {
  return canonicalSpaces(
    nf(locale, { minimumFractionDigits: 0, maximumFractionDigits: precision }).format(value),
  );
}

/**
 * Parses what a Czech or Slovak user actually types, and — just as importantly — what this
 * product itself prints. `money()` groups with U+00A0, so before this existed a user could
 * copy `39 000 Kč` out of the app, paste it back into the app, and get NaN, which the old
 * field silently swallowed. A decimal comma did the same. So: strip every space variant and
 * the currency symbols, accept a comma as the separator, accept the real minus sign, and
 * refuse anything with two separators rather than guessing which one was meant.
 */
export function parseNumber(text: string): number | null {
  const cleaned = text
    .replace(/[\s\u00a0\u202f\u2009]/g, '')
    .replace(/[Kk]\u010d|\u20ac|%/g, '')
    .replace(/\u2212/g, '-')
    .replace(/,/g, '.');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  if ((cleaned.match(/\./g) ?? []).length > 1) return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = { CZK: 'Kč', EUR: '€' };
