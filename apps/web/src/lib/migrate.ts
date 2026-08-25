import type { Child, Housing, Liability, Mortgage, Person, ScenarioInput } from '@wealthplanner/engine';

/**
 * Structural upgrade of a plan that was saved by an older build. It must be IDEMPOTENT (the
 * planner hydrates an imported plan twice) and it must never throw — a plan that cannot be
 * upgraded still has to load, or a user loses their work to a refactor.
 *
 * The hard constraint that shaped this file: there is no server, so there is no coordinated
 * rollout. A stale service-worker bundle reading a fresh plan, and a fresh bundle reading a
 * stale plan, are both real states on the same machine. So every new field is either
 * optional in the type or defaulted at the READ site as well as here.
 *
 * It also never invents a number. Where the honest answer is "the user never told us", the
 * field stays undefined and the UI says so.
 */

export const PLAN_SCHEMA_VERSION = 2;

/** The shape of a plan saved before `housing`, `liabilities` and `childrenIntent` existed. */
type LegacyScenario = Omit<ScenarioInput, 'housing' | 'liabilities' | 'childrenIntent'> &
  Partial<Pick<ScenarioInput, 'housing' | 'liabilities' | 'childrenIntent'>> & {
    /** v1 kept a bare array here. */
    mortgages?: Mortgage[];
  };

export function upgradePlan(raw: ScenarioInput | LegacyScenario): ScenarioInput {
  const legacy = raw as LegacyScenario;

  /*
   * An old plan carrying a 4.5M mortgage means "owns". Defaulting to `rent` would silently
   * delete the mortgage — and `own` with an empty array is "owns outright", which is a real
   * household and not the same thing as renting.
   */
  const housing: Housing = legacy.housing ?? { kind: 'own', mortgages: legacy.mortgages ?? [] };

  const people: Person[] = Array.isArray(legacy.people) ? legacy.people : [];
  const children: Child[] = Array.isArray(legacy.children) ? legacy.children : [];
  const liabilities: Liability[] = Array.isArray(legacy.liabilities) ? legacy.liabilities : [];

  return {
    ...(legacy as ScenarioInput),
    housing,
    liabilities,
    /*
     * A plan that already contains a child obviously intends children. A plan without one is
     * 'undecided', never 'no': the user was never asked, and 'no' is an answer.
     */
    childrenIntent: legacy.childrenIntent ?? (children.length > 0 ? 'yes' : 'undecided'),
    people,
    children,
  };
}

/** A stored jurisdiction must be proven, not trusted: a truthy test defaults SK-less plans to CZ. */
export function isJurisdictionCode(value: unknown): value is ScenarioInput['jurisdiction'] {
  return value === 'CZ' || value === 'SK';
}
