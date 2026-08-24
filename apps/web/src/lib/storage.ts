import { ENGINE_VERSION, type ScenarioInput } from '@wealthplanner/engine';
import { withRegime } from './defaults';

/**
 * Plans live in the browser. No account, no server, nothing to leak — which is both the
 * strongest privacy claim available and the reason the running cost of this product stays
 * near zero. Cloud sync arrives later as an opt-in, with the plan encrypted client-side.
 */
const KEY = 'wealthplanner.plan.v1';

export interface StoredPlan {
  engineVersion: number;
  savedAt: string;
  scenario: ScenarioInput;
}

/** The leave regime holds functions, so it is stripped before serialising and re-attached on load. */
function serialisable(scenario: ScenarioInput): unknown {
  const { leaveRegime, ...rest } = scenario;
  return { ...rest, leaveRegimeId: leaveRegime.id };
}

export function savePlan(scenario: ScenarioInput, now: Date = new Date()): void {
  try {
    const payload = {
      engineVersion: ENGINE_VERSION,
      savedAt: now.toISOString(),
      scenario: serialisable(scenario),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
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
}

export function loadPlan(): LoadResult | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPlan & { scenario: ScenarioInput };
    if (!parsed?.scenario?.assumptions) return null;
    return {
      scenario: withRegime(parsed.scenario),
      savedAt: parsed.savedAt ?? null,
      staleEngine: (parsed.engineVersion ?? 0) < ENGINE_VERSION,
    };
  } catch {
    return null;
  }
}

export function clearPlan(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function exportPlan(scenario: ScenarioInput, now: Date = new Date()): string {
  return JSON.stringify(
    { engineVersion: ENGINE_VERSION, savedAt: now.toISOString(), scenario: serialisable(scenario) },
    null,
    2,
  );
}

export function importPlan(text: string): ScenarioInput | null {
  try {
    const parsed = JSON.parse(text) as { scenario?: ScenarioInput };
    const scenario = parsed.scenario ?? (parsed as unknown as ScenarioInput);
    if (!scenario?.assumptions || !Array.isArray(scenario.people)) return null;
    return withRegime(scenario);
  } catch {
    return null;
  }
}
