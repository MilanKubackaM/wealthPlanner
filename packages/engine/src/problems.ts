import type { ProjectionResult, ScenarioInput, YearMonth } from './types';

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
  | 'oneoff-outside-horizon'
  | 'child-leave-unassigned'
  | 'liability-rate-exceeds-return'
  | 'liability-never-repaid'
  | 'children-intended-but-absent'
  | 'housing-cost-outgrowing-income'
  | 'horizon-before-retirement'
  | 'envelope-owner-missing';

export type Severity = 'critical' | 'warning' | 'info';

export interface Problem {
  id: ProblemId;
  severity: Severity;
  facts: {
    at?: YearMonth | null;
    /** For the deficit rule: the month of the DEEPEST shortfall, which is not the month it first goes negative. */
    worstAt?: YearMonth | null;
    amount?: number;
    floor?: number;
    gap?: number;
    months?: number;
    personId?: string;
    childId?: string;
    itemId?: string;
    ratePct?: number;
    suggestedRatePct?: number;
    /** Housing cost as a share of net household income, now and at the horizon. */
    sharePctNow?: number;
    sharePctEnd?: number;
  };
}

export interface DetectOptions {
  /**
   * Typical top savings rate for the household's jurisdiction, used only to detect
   * "your cash is earning far below what cash can earn". Passed in, never hardcoded.
   */
  typicalSavingsRatePct?: number;
  /**
   * Statutory retirement age, injected the same way, used only to notice that the horizon
   * ends before the household stops earning. Never derived inside the engine.
   */
  retirementAgeYears?: number;
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
        worstAt: result.minReserveAt,
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

  /*
   * 8 — a child whose leave is assigned to nobody. CRITICAL, because the projection is
   * quantitatively WRONG rather than merely incomplete: the child's cost is simulated while
   * the leave is not, so foregone income silently reads zero. Deleting a person from a
   * household is what creates this state, and nothing else in the engine reports it.
   *
   * Deliberately NOT repaired in simulate() or in the migration. Silent repair is the
   * failure mode this whole engine was extracted to end.
   */
  const personIds = new Set(input.people.map((p) => p.id));
  for (const child of input.children) {
    if (!personIds.has(child.leaveTakenBy)) {
      problems.push({
        id: 'child-leave-unassigned',
        severity: 'critical',
        facts: { childId: child.id, at: child.birth },
      });
    }
  }

  /*
   * 9 — a debt costing more than the household assumes its investments earn. Derived
   * ENTIRELY from two numbers the user typed, so it asserts no market fact and names no
   * product. The 0.5 pp tolerance mirrors the low-reserve-rate rule above.
   */
  for (const l of input.liabilities) {
    if (
      l.balance > 0 &&
      input.jointInvesting.monthlyContribution > 0 &&
      l.annualRatePct > input.jointInvesting.annualReturnPct + 0.5
    ) {
      problems.push({
        id: 'liability-rate-exceeds-return',
        severity: 'warning',
        facts: {
          itemId: l.id,
          ratePct: l.annualRatePct,
          suggestedRatePct: input.jointInvesting.annualReturnPct,
          amount: l.balance,
        },
      });
    }
  }

  /*
   * 10 — the payment does not cover the interest, so the balance never amortises. The
   * credit-card minimum-payment trap, and an arithmetic dead end the engine can prove.
   * Without the rule the projection just carries a debt to the horizon unexplained.
   */
  for (const l of input.liabilities) {
    const monthlyInterest = (l.balance * l.annualRatePct) / 100 / 12;
    if (l.balance > 0 && l.monthlyPayment <= monthlyInterest + 0.01) {
      problems.push({
        id: 'liability-never-repaid',
        severity: 'critical',
        facts: { itemId: l.id, amount: l.balance, months: l.remainingTermMonths },
      });
    }
  }

  /*
   * 11 — the user said they plan children and the projection contains none, so the plan on
   * screen is not the plan they think they are reading. Same reasoning as the
   * outside-horizon rules: never let the screen quietly omit what was just typed in.
   */
  if (input.childrenIntent === 'yes' && input.children.length === 0) {
    problems.push({
      id: 'children-intended-but-absent',
      severity: 'info',
      facts: { months: (input.assumptions.horizonYear - input.assumptions.start.year) * 12 },
    });
  }

  /*
   * 12 — rent indexed faster than every income grows. Then the rent share of net income
   * rises monotonically to the horizon BY CONSTRUCTION, which is a fact about the inputs
   * rather than an affordability threshold. A "rent above 30 % of income" rule would need a
   * source it does not have and would be advice; this needs neither.
   */
  if (input.housing.kind === 'rent' && input.people.length > 0) {
    const rent = input.housing.rent;
    const slowestGrowth = Math.min(...input.people.map((p) => p.incomeGrowthPct));
    if (rent.annualIndexationPct > slowestGrowth) {
      const incomeNow = input.people.reduce((sum, p) => sum + p.netMonthlyIncome, 0);
      const years = Math.max(0, input.assumptions.horizonYear - input.assumptions.start.year);
      const rentEnd = rent.monthlyAmount * Math.pow(1 + rent.annualIndexationPct / 100, years);
      const incomeEnd = input.people.reduce(
        (sum, p) => sum + p.netMonthlyIncome * Math.pow(1 + p.incomeGrowthPct / 100, years),
        0,
      );
      problems.push({
        id: 'housing-cost-outgrowing-income',
        severity: 'warning',
        facts: {
          amount: rent.monthlyAmount,
          ratePct: rent.annualIndexationPct,
          sharePctNow: incomeNow > 0 ? (rent.monthlyAmount / incomeNow) * 100 : 0,
          sharePctEnd: incomeEnd > 0 ? (rentEnd / incomeEnd) * 100 : 0,
        },
      });
    }
  }

  /*
   * 13 — the horizon ends before the household stops earning, so the headline net-worth
   * figure answers a question about a year in which they are still being paid.
   */
  if (typeof options.retirementAgeYears === 'number') {
    for (const person of input.people) {
      if (person.birthYear === undefined) continue;
      const retiresIn = person.birthYear + options.retirementAgeYears;
      if (retiresIn > input.assumptions.horizonYear) {
        problems.push({
          id: 'horizon-before-retirement',
          severity: 'info',
          facts: { personId: person.id, at: { year: retiresIn, month: 0 } },
        });
        break;
      }
    }
  }

  /* 14 — an envelope owned by a person who no longer exists mis-buckets the totals. */
  for (const envelope of input.envelopes) {
    if (envelope.owner !== 'shared' && !personIds.has(envelope.owner)) {
      problems.push({
        id: 'envelope-owner-missing',
        severity: 'info',
        facts: { itemId: envelope.id, amount: envelope.amount },
      });
    }
  }

  return problems;
}

/** True when the projection has no cash problem at all. */
export function isHealthy(result: ProjectionResult): boolean {
  return result.deficitAt === null && result.pausedMonths === 0 && result.worstFloorGap >= 0;
}
