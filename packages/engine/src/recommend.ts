import { simulate } from './simulate';
import { isHealthy, type Problem } from './problems';
import type { ProjectionResult, ScenarioInput, YearMonth } from './types';

/**
 * A lever is one input dimension the engine may propose changing. Levers are pure:
 * `set` returns a NEW ScenarioInput sharing everything it does not touch. We never deep
 * clone, because `leaveRegime` holds functions and would not survive structuredClone.
 */
export interface Lever {
  id: string;
  /** 'decrease' when a lower value fixes things, 'increase' when a higher one does. */
  direction: 'decrease' | 'increase';
  /** Rounding granularity of the proposed value. */
  step: number;
  get(input: ScenarioInput): number;
  set(input: ScenarioInput, value: number): ScenarioInput;
  /** Hard upper bound for 'increase' levers. Omitted means "expand geometrically". */
  max?: number;
}

export type Criterion = (result: ProjectionResult) => boolean;

export interface Proof {
  minReserve: number;
  minReserveAt: YearMonth | null;
  deficitAt: YearMonth | null;
  worstFloorGap: number;
  worstFloorGapAt: YearMonth | null;
  pausedMonths: number;
}

export interface Recommendation {
  problemId: Problem['id'];
  leverId: string;
  from: number;
  to: number;
  /**
   * Always true: a recommendation is only emitted after the modified scenario has been
   * re-simulated and shown to satisfy the criterion. This is the product's whole claim.
   */
  verified: true;
  before: Proof;
  after: Proof;
}

const SEARCH_ITERATIONS = 24;
const EXPAND_GUARD = 10;
const REVERIFY_GUARD = 60;

function proofOf(r: ProjectionResult): Proof {
  return {
    minReserve: r.minReserve,
    minReserveAt: r.minReserveAt,
    deficitAt: r.deficitAt,
    worstFloorGap: r.worstFloorGap,
    worstFloorGapAt: r.worstFloorGapAt,
    pausedMonths: r.pausedMonths,
  };
}

/**
 * Finds the least drastic value of `lever` that makes `criterion` hold, by binary search
 * over the monotonic direction, then snaps to `lever.step` and RE-VERIFIES by simulating
 * again — walking one step further if the snapped value does not hold. Returns null when
 * the lever cannot fix the problem at all, rather than returning a value that does not work.
 */
export function searchLever(
  input: ScenarioInput,
  lever: Lever,
  criterion: Criterion,
): { value: number; result: ProjectionResult } | null {
  const holds = (value: number): ProjectionResult | null => {
    const trial = simulate(lever.set(input, value));
    return criterion(trial) ? trial : null;
  };

  const current = lever.get(input);

  if (lever.direction === 'decrease') {
    /* Can the most extreme setting fix it? If not, this lever is not the answer. */
    if (!holds(0)) return null;
    let lo = 0; // known to satisfy
    let hi = current; // known to fail (the current scenario has the problem)
    for (let i = 0; i < SEARCH_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (holds(mid)) lo = mid;
      else hi = mid;
    }
    let value = Math.floor(lo / lever.step) * lever.step;
    for (let i = 0; i < REVERIFY_GUARD && value > 0; i++) {
      const r = holds(value);
      if (r) return { value, result: r };
      value -= lever.step;
    }
    const r = holds(Math.max(0, value));
    return r ? { value: Math.max(0, value), result: r } : null;
  }

  /* direction === 'increase' */
  let hi = Math.max(current * 2, current + lever.step * 4, lever.step * 4);
  let expanded = 0;
  while (!holds(hi) && expanded < EXPAND_GUARD) {
    hi *= 2;
    expanded++;
    if (lever.max !== undefined && hi > lever.max) break;
  }
  if (lever.max !== undefined && hi > lever.max) hi = lever.max;
  if (!holds(hi)) return null;

  let lo = current; // known to fail
  for (let i = 0; i < SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (holds(mid)) hi = mid;
    else lo = mid;
  }
  let value = Math.ceil(hi / lever.step) * lever.step;
  for (let i = 0; i < REVERIFY_GUARD; i++) {
    const r = holds(value);
    if (r) return { value, result: r };
    value += lever.step;
  }
  return null;
}

/* ------------------------------------------------------------------ levers ---- */

export function buildLevers(input: ScenarioInput): Lever[] {
  const levers: Lever[] = [];

  levers.push({
    id: 'jointInvesting.monthlyContribution',
    direction: 'decrease',
    step: input.currency === 'CZK' ? 500 : 20,
    get: (i) => i.jointInvesting.monthlyContribution,
    set: (i, value) => ({
      ...i,
      jointInvesting: { ...i.jointInvesting, monthlyContribution: value },
    }),
  });

  if (input.reserve.sweepCap !== null) {
    levers.push({
      id: 'reserve.sweepCap',
      direction: 'increase',
      step: input.currency === 'CZK' ? 50_000 : 2_000,
      get: (i) => i.reserve.sweepCap ?? 0,
      set: (i, value) => ({ ...i, reserve: { ...i.reserve, sweepCap: value } }),
    });
  }

  const variableTotal = input.expenses
    .filter((e) => e.kind === 'variable')
    .reduce((sum, e) => sum + e.monthlyAmount, 0);
  if (variableTotal > 0) {
    levers.push({
      id: 'expenses.variableTotal',
      direction: 'decrease',
      step: input.currency === 'CZK' ? 500 : 20,
      get: () => variableTotal,
      set: (i, value) => {
        const factor = variableTotal === 0 ? 0 : value / variableTotal;
        return {
          ...i,
          expenses: i.expenses.map((e) =>
            e.kind === 'variable' ? { ...e, monthlyAmount: e.monthlyAmount * factor } : e,
          ),
        };
      },
    });
  }

  levers.push({
    id: 'reserve.balance',
    direction: 'increase',
    step: input.currency === 'CZK' ? 10_000 : 500,
    get: (i) => i.reserve.balance,
    set: (i, value) => ({ ...i, reserve: { ...i.reserve, balance: value } }),
  });

  input.children.forEach((child, index) => {
    levers.push({
      id: `children[${index}].leavePlan.parentalMonths`,
      direction: 'decrease',
      step: 1,
      get: (i) => i.children[index]?.leavePlan.parentalMonths ?? 0,
      set: (i, value) => ({
        ...i,
        children: i.children.map((c, j) =>
          j === index
            ? { ...c, leavePlan: { ...c.leavePlan, parentalMonths: Math.round(value) } }
            : c,
        ),
      }),
    });
  });

  return levers;
}

/* ------------------------------------------------------------ criteria ---- */

export function criterionFor(problem: Problem): Criterion | null {
  switch (problem.id) {
    case 'reserve-deficit':
      return (r) => r.deficitAt === null;
    case 'dca-paused':
      return (r) => r.pausedMonths === 0;
    case 'reserve-below-floor':
      return (r) => r.worstFloorGap >= 0;
    default:
      /* Not a cash-flow problem — no search-based fix. */
      return null;
  }
}

/**
 * For one detected problem, returns every lever that provably fixes it, ordered by how
 * little it disturbs the plan (smallest relative change first). Every entry has been
 * re-simulated; nothing is proposed on the strength of a heuristic.
 */
export function recommend(input: ScenarioInput, problem: Problem): Recommendation[] {
  const criterion = criterionFor(problem);
  if (!criterion) return [];

  const before = proofOf(simulate(input));
  const out: Recommendation[] = [];

  for (const lever of buildLevers(input)) {
    const from = lever.get(input);
    const found = searchLever(input, lever, criterion);
    if (!found) continue;
    if (Math.abs(found.value - from) < lever.step / 2) continue;
    out.push({
      problemId: problem.id,
      leverId: lever.id,
      from,
      to: found.value,
      verified: true,
      before,
      after: proofOf(found.result),
    });
  }

  out.sort((a, b) => relativeChange(a) - relativeChange(b));
  return out;
}

function relativeChange(rec: Recommendation): number {
  const base = Math.abs(rec.from);
  if (base < 1e-9) return Math.abs(rec.to);
  return Math.abs(rec.to - rec.from) / base;
}

/** Convenience: detect, then attach verified fixes to each fixable problem. */
export function analyse(
  input: ScenarioInput,
  problems: Problem[],
): Array<{ problem: Problem; fixes: Recommendation[] }> {
  return problems.map((problem) => ({ problem, fixes: recommend(input, problem) }));
}

export { isHealthy };
