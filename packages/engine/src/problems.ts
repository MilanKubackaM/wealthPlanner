import type { ProjectionResult, ScenarioInput, YearMonth } from './types.js';

/**
 * The engine emits STRUCTURED FACTS, never prose. All wording, currency formatting and
 * localisation happens in the UI. The prototype embedded Slovak sentences and two named
 * competitor banks inside its rule logic; that is both a localisation dead end and a
 * regulatory hazard (naming a provider edges towards intermediation).
 */
export type ProblemId =
  | 'reserve-deficit'
  | 'reserve-below-floor'
  | 'dca-paused'
  | 'pocket-overcommitted'
  | 'low-reserve-rate'
  | 'idle-surplus'
  | 'child-outside-horizon'
  | 'oneoff-outside-horizon';

export type Severity = 'critical' | 'warning' | 'info';

export interface Problem {
  id: ProblemId;
  severity: Severity;
  facts: {
    at?: YearMonth | null;
    amount?: number;
    floor?: number;
    gap?: number;
    months?: number;
    personId?: string;
    childId?: string;
    itemId?: string;
    ratePct?: number;
    suggestedRatePct?: number;
  };
}

export interface DetectOptions {
  /**
   * Typical top savings rate for the household's jurisdiction, used only to detect
   * "your cash is earning far below what cash can earn". Passed in, never hardcoded.
   */
  typicalSavingsRatePct?: number;
}

/**
 * Detects every problem worth telling the user about, most severe first.
 * Pure: no I/O, no clock, no locale.
 */
export function detectProblems(
  input: ScenarioInput,
  result: ProjectionResult,
  options: DetectOptions = {},
): Problem[] {
  const problems: Problem[] = [];

  /* 1 — the reserve runs out entirely. */
  if (result.deficitAt) {
    problems.push({
      id: 'reserve-deficit',
      severity: 'critical',
      facts: {
        at: result.deficitAt,
        amount: Math.max(0, -result.minReserve),
        gap: Math.max(0, -result.worstFloorGap),
        floor: result.floorAtWorst,
      },
    });
  } else if (result.pausedMonths > 0) {
    /* 2 — investing had to be throttled to keep the reserve non-negative. */
    problems.push({
      id: 'dca-paused',
      severity: 'warning',
      facts: {
        at: result.pausedFrom,
        months: result.pausedMonths,
        amount: result.pausedAmount,
      },
    });
  } else if (result.worstFloorGap < 0) {
    /* 3 — the reserve survives but dips below the floor. */
    problems.push({
      id: 'reserve-below-floor',
      severity: 'warning',
      facts: {
        at: result.worstFloorGapAt,
        amount: Math.max(0, result.minReserve),
        floor: result.floorAtWorst,
        gap: -result.worstFloorGap,
      },
    });
  }

  /*
   * 4 — someone is investing more than their whole allowance. The prototype's UI claimed
   * personal contributions came out of pocket money but never enforced it, so the model
   * compounded money that never left the household.
   */
  for (const person of input.people) {
    const fromPocket = person.investments
      .filter((s) => s.fundedFromPocketMoney)
      .reduce((sum, s) => sum + s.monthlyContribution, 0);
    if (fromPocket > person.pocketMoney + 0.01) {
      problems.push({
        id: 'pocket-overcommitted',
        severity: 'warning',
        facts: {
          personId: person.id,
          amount: fromPocket - person.pocketMoney,
        },
      });
    }
  }

  /* 5 — cash earning far below what cash can earn. Never names a provider. */
  const typical = options.typicalSavingsRatePct;
  if (
    typeof typical === 'number' &&
    input.reserve.annualRatePct < typical - 0.5 &&
    input.reserve.balance > 0
  ) {
    problems.push({
      id: 'low-reserve-rate',
      severity: 'info',
      facts: {
        ratePct: input.reserve.annualRatePct,
        suggestedRatePct: typical,
        amount: Math.round((input.reserve.balance * (typical - input.reserve.annualRatePct)) / 100),
      },
    });
  }

  /*
   * 6 — anything the user entered that falls outside the projection window. The prototype
   * dropped such a child from every chart and every recommendation with no warning at all,
   * so the user saw a plan that quietly did not include the thing they had just typed in.
   */
  const firstAbs = input.assumptions.start.year * 12 + input.assumptions.start.month;
  const lastAbs = input.assumptions.horizonYear * 12 + 11;
  for (const child of input.children) {
    const birthAbs = child.birth.year * 12 + child.birth.month;
    if (birthAbs < firstAbs || birthAbs > lastAbs) {
      problems.push({
        id: 'child-outside-horizon',
        severity: 'warning',
        facts: { at: child.birth, childId: child.id },
      });
    }
  }
  for (const item of input.oneOffs) {
    const atAbs = item.at.year * 12 + item.at.month;
    if (atAbs < firstAbs || atAbs > lastAbs) {
      problems.push({
        id: 'oneoff-outside-horizon',
        severity: 'info',
        facts: { at: item.at, itemId: item.id, amount: item.amount },
      });
    }
  }

  /* 7 — a persistent surplus is piling up in cash with the sweep switched off. */
  if (input.reserve.sweepCap === null && result.firstSurplus > 0) {
    problems.push({
      id: 'idle-surplus',
      severity: 'info',
      facts: { amount: result.firstSurplus },
    });
  }

  return problems;
}

/** True when the projection has no cash problem at all. */
export function isHealthy(result: ProjectionResult): boolean {
  return result.deficitAt === null && result.pausedMonths === 0 && result.worstFloorGap >= 0;
}
