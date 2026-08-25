import { ENGINE_VERSION, type ScenarioInput } from '@wealthplanner/engine';
import type { JurisdictionCode } from '@wealthplanner/jurisdictions';
import { withRegime } from './defaults';
import { PLAN_SCHEMA_VERSION, isJurisdictionCode } from './migrate';

/**
 * Plans live in the browser. No account, no server, nothing to leak — which is both the
 * strongest privacy claim available and the reason the running cost of this product stays
 * near zero. Cloud sync arrives later as an opt-in, with the plan encrypted client-side.
 *
 * The key is PER COUNTRY. A single global key meant a Czech plan and a Slovak plan could not
 * coexist: the second save destroyed the first, and whichever survived was then served to
 * both locales — which is how a Slovak user ended up looking at a 4 510 000 Kč mortgage
 * under Slovak labels, with Czech benefit rules feeding the model. Two keys remove the
 * ambiguity at its source instead of guessing which plan the user meant.
 */
const KEY_PREFIX = 'wealthplanner.plan.v2';
const LEGACY_KEY = 'wealthplanner.plan.v1';

const keyFor = (jurisdiction: JurisdictionCode) => `${KEY_PREFIX}.${jurisdiction}`;

export interface StoredPlan {
  engineVersion: number;
  schemaVersion?: number;
  savedAt: string;
  scenario: ScenarioInput;
  /**
   * Field paths the user has actually edited. Everything else on screen is a national
   * average, and this is what lets the product say so honestly rather than reassuringly.
   */
  touched?: string[];
}

/** The leave regime holds functions, so it is stripped before serialising and re-attached on load. */
function serialisable(scenario: ScenarioInput): unknown {
  const { leaveRegime, ...rest } = scenario;
  return { ...rest, leaveRegimeId: leaveRegime.id };
}

function payloadFor(scenario: ScenarioInput, touched: string[], now: Date) {
  return {
    engineVersion: ENGINE_VERSION,
    schemaVersion: PLAN_SCHEMA_VERSION,
    savedAt: now.toISOString(),
    scenario: serialisable(scenario),
    touched,
  };
}

export function savePlan(
  scenario: ScenarioInput,
  touched: string[] = [],
  now: Date = new Date(),
): void {
  try {
    localStorage.setItem(keyFor(scenario.jurisdiction), JSON.stringify(payloadFor(scenario, touched, now)));
  } catch {
    /* Private window, blocked storage, quota — never break the page over persistence. */
  }
}

export interface LoadResult {
  scenario: ScenarioInput;
  savedAt: string | null;
  /**
   * True when the plan was computed by an older engine. The user is told and asked; a
   * saved plan is never silently re-simulated under new arithmetic.
   */
  staleEngine: boolean;
  touched: string[];
}

function parse(raw: string | null): LoadResult | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredPlan;
  if (!parsed?.scenario?.assumptions) return null;
  /* Proven, not trusted. Without this a plan missing the field becomes silently Czech. */
  if (!isJurisdictionCode(parsed.scenario.jurisdiction)) return null;
  return {
    scenario: withRegime(parsed.scenario),
    savedAt: parsed.savedAt ?? null,
    staleEngine: (parsed.engineVersion ?? 0) < ENGINE_VERSION,
    touched: Array.isArray(parsed.touched) ? parsed.touched : [],
  };
}

/**
 * Moves a plan saved under the single global key to its country's key, once. Runs before
 * every read rather than on a version flag, because a user can arrive with the old key from
 * a cached bundle at any time.
 */
function migrateLegacyKey(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredPlan;
    const code = parsed?.scenario?.jurisdiction;
    if (isJurisdictionCode(code) && localStorage.getItem(keyFor(code)) === null) {
      localStorage.setItem(keyFor(code), raw);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export function loadPlan(jurisdiction: JurisdictionCode): LoadResult | null {
  try {
    migrateLegacyKey();
    return parse(localStorage.getItem(keyFor(jurisdiction)));
  } catch {
    return null;
  }
}

/**
 * Whether a plan exists for the OTHER country. A Czech plan is not convertible into a Slovak
 * one — different currency, a structurally different benefit model, different mortgage
 * limits, and no exchange rate the product is willing to invent — so the answer is an offer
 * to open it where it belongs, never an automatic conversion.
 */
export function hasPlanFor(jurisdiction: JurisdictionCode): boolean {
  try {
    migrateLegacyKey();
    return localStorage.getItem(keyFor(jurisdiction)) !== null;
  } catch {
    return false;
  }
}

/*
 * Which country the user last chose to plan IN — deliberately not derived from the interface
 * language. Living in Czechia with a Slovak UI is a real and common case: same job, same
 * mortgage, same benefits, different reading preference. Inferring the country from the locale
 * gets that person wrong on every single number, so the choice is theirs and it is remembered.
 */
const COUNTRY_KEY = 'wealthplanner.country.v1';

export function savePreferredCountry(jurisdiction: JurisdictionCode): void {
  try {
    localStorage.setItem(COUNTRY_KEY, jurisdiction);
  } catch {
    /* ignore */
  }
}

export function loadPreferredCountry(): JurisdictionCode | null {
  try {
    const raw = localStorage.getItem(COUNTRY_KEY);
    return isJurisdictionCode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function clearPlan(jurisdiction: JurisdictionCode): void {
  try {
    localStorage.removeItem(keyFor(jurisdiction));
  } catch {
    /* ignore */
  }
}

export function exportPlan(
  scenario: ScenarioInput,
  touched: string[] = [],
  now: Date = new Date(),
): string {
  return JSON.stringify(payloadFor(scenario, touched, now), null, 2);
}

export function importPlan(text: string): ScenarioInput | null {
  try {
    const parsed = JSON.parse(text) as { scenario?: ScenarioInput };
    const scenario = parsed.scenario ?? (parsed as unknown as ScenarioInput);
    if (!scenario?.assumptions || !Array.isArray(scenario.people)) return null;
    if (!isJurisdictionCode(scenario.jurisdiction)) return null;
    return withRegime(scenario);
  } catch {
    return null;
  }
}
