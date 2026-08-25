import type { ProjectionResult, ScenarioInput } from './types';

/**
 * How well the household's money is ARRANGED — one number, and the four reasons for it.
 *
 * ============================================================================
 * The one rule this module must never break
 * ============================================================================
 *
 * Every input is read from the `ScenarioInput` the user typed or from the `ProjectionResult`
 * `simulate()` produced. Nothing here estimates anything. That is not tidiness, it is the
 * only thing stopping the score from contradicting the chart directly above it: if the score
 * had its own arithmetic it could report a healthy reserve over a line that goes below zero,
 * and the whole product's claim is that it does not do that.
 *
 * ============================================================================
 * What the benchmarks are, and what they are not
 * ============================================================================
 *
 * The targets come from `@wealthplanner/jurisdictions` — per country, dated, sourced, and
 * flagged `unverified` where they are conventions rather than measurements. They are passed
 * in rather than imported so this package keeps its zero dependencies.
 *
 * Most popular personal-finance rules do not survive being looked up, and the ones used here
 * were chosen on that basis:
 *
 *   - 50/30/20 is NOT used. It is a 2005 trade book with no peer-reviewed evaluation, its 30 %
 *     has no derivation anywhere, and its 50 % ceiling is unreachable for a large minority of
 *     households once housing is paid. `headroom` measures whether anything is left over at
 *     all, which is the part of that rule that actually means something.
 *   - The 3-6 month reserve is used, because it is what the product already builds its floor
 *     from — but note it is a convention that JPMorganChase Institute says in print is "not
 *     empirically grounded" (their own transaction-data answer is nearer six weeks). It is
 *     therefore treated as the point where `reserve` reaches 100, never as a legal fact.
 *   - "Debt at rate r returns a guaranteed r" IS used, and it is the only rule here that
 *     needs no citation because it needs no evidence: it is a deduction. It gets teeth (a
 *     cap, not a deduction) for that reason.
 *   - Regulatory DSTI/DTI limits are NOT used as targets. They are the point at which a bank
 *     must refuse the loan.
 *
 * ============================================================================
 * What a score may never assert
 * ============================================================================
 *
 * Not a comparison against other users. Not a retirement outcome — this engine does not model
 * decumulation, so no sub-score may claim one. Not a product. And never a bare number: the
 * caller gets the dimensions or it gets nothing, which is why they are one object.
 */

/** Which part of the arrangement a sub-score is about. */
export type ScoreDimensionId = 'reserve' | 'investing' | 'debt' | 'headroom';

/**
 * What the household should do about this dimension. An id, not a sentence: the wording is
 * the web app's business, and the engine stays free of copy in any language.
 */
export type ScoreAdviceId =
  /** The reserve dips below zero. Nothing else matters until that is not true. */
  | 'reserve-deficit'
  /** Positive, but under the recommended floor. */
  | 'reserve-below-floor'
  /** At or above the floor. */
  | 'reserve-ok'
  /** Nothing is being invested at all. */
  | 'investing-none'
  /** Investing, but under the country benchmark. */
  | 'investing-below-target'
  /** At the benchmark. */
  | 'investing-ok'
  /**
   * The distinctive one: cash well past the point of prudence while the reserve is safe.
   * The advice is to move some of it, and it is gated on the reserve being safe.
   */
  | 'investing-cash-heavy'
  /** A debt costs more than the expected return. Pay it before investing another koruna. */
  | 'debt-costlier-than-returns'
  /** Debt service is eating too much of the income. */
  | 'debt-heavy'
  /** Debt is under control or absent. */
  | 'debt-ok'
  /** Nothing at all is left at the end of the month. */
  | 'headroom-none'
  /** Something is left, but not much. */
  | 'headroom-thin'
  /** Comfortable. */
  | 'headroom-ok';

export interface ScoreDimension {
  id: ScoreDimensionId;
  /** 0-100, integer. */
  score: number;
  /** Relative weight in the overall score. The four sum to 1. */
  weight: number;
  advice: ScoreAdviceId;
  /**
   * The numbers behind the score, so the UI can state them instead of asserting a grade.
   * Every one of these is measured, never rounded into a claim.
   */
  facts: {
    /** Months of fixed outgoings the reserve covers at its worst point. */
    coverMonths?: number;
    /** Months of fixed outgoings held in cash today. */
    cashMonths?: number;
    /** Months of cash beyond which cash stops being prudence. */
    cashMonthsMax?: number;
    /** Investment contributions as a share of net monthly income, percent. */
    investingSharePct?: number;
    /** The country benchmark for that share, percent. */
    investingTargetPct?: number;
    /** Debt service as a share of net monthly income, percent. */
    debtSharePct?: number;
    /** The advisory ceiling for that share, percent. */
    debtAdvisoryPct?: number;
    /** The rate on the most expensive debt that beats the expected return, percent. */
    worstDebtRatePct?: number;
    /** The expected return it beats, percent. */
    expectedReturnPct?: number;
    /** What is left at the end of the first month, as a share of net income, percent. */
    headroomSharePct?: number;
    /** Share of households in this country that cannot cover an unexpected expense. */
    peerCannotCoverPct?: number;
  };
}

export interface HealthScore {
  /** 0-100, integer. The weighted mean of the dimensions. */
  overall: number;
  /** Always four, always in a stable order, always summing to weight 1. */
  dimensions: ScoreDimension[];
  /**
   * True when the weights were shifted towards liquidity because a child is in the plan.
   * Surfaced so the UI can say why, rather than the weights changing invisibly.
   */
  childWeighted: boolean;
}

export interface ScoreOptions {
  /** Monthly investment contributions as a share of net income the country treats as on target. */
  targetInvestingSharePct: number;
  /** Months of fixed outgoings past which held cash is an allocation mistake. */
  cashComfortMonthsMax: number;
  /** Our own advisory ceiling on debt service as a share of net income. */
  advisoryDebtServiceSharePct: number;
  /** Share of households locally that cannot cover an unexpected expense. */
  cannotFaceUnexpectedExpensePct: number;
}

/**
 * Months of cash beyond the country's comfort ceiling before "you are holding too much cash"
 * becomes the headline for this dimension rather than a quiet deduction from its score.
 *
 * Three, so a household a month or two over a soft line is not told its main problem is a
 * cash pile. The deduction still applies from the first month over.
 */
const MATERIAL_CASH_EXCESS_MONTHS = 3;

/**
 * Ceiling on the OVERALL score for a plan whose reserve goes below zero.
 *
 * Without this, the composite does the thing every composite index does: it averages a fatal
 * flaw away. The Slovak landing example measured 58 with three strong dimensions carrying a
 * reserve of 7 — a plan that runs out of money reading as a passing grade. Running out of
 * money is not one consideration in four; it is the arrangement not working, and no amount of
 * disciplined investing or budget headroom is allowed to talk over it.
 */
const DEFICIT_OVERALL_MAX = 45;

/* --------------------------------------------------------------------------- shape ---- */

/** Clamp to the 0-100 the whole module promises, and round: a score is not a measurement. */
function band(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Linear ramp from 0 at `from` to 100 at `to`, flat outside. Handles a reversed range. */
function ramp(value: number, from: number, to: number): number {
  if (from === to) return value >= to ? 100 : 0;
  const t = (value - from) / (to - from);
  return band(t * 100);
}

/* ------------------------------------------------------------------------ scoring ---- */

/**
 * The reserve, measured at its WORST month rather than today.
 *
 * Deliberately one-sided: too much cash is not a reserve problem, it is an allocation
 * problem, and it is scored as one under `investing`. A household with eighteen months of
 * cash has an excellent reserve and a bad portfolio, and saying so in two separate places is
 * the only way the advice comes out right.
 */
function scoreReserve(result: ProjectionResult, opts: ScoreOptions): ScoreDimension {
  const monthlyOutgoings = result.fixedMonthlyOutgoings;
  /* The reserve AT the worst month against the floor THAT month — both inflated together,
     so this is not today's floor compared against a balance thirty years away. */
  const reserveAtWorst = result.floorAtWorst + result.worstFloorGap;
  const coverMonths = monthlyOutgoings > 0 ? reserveAtWorst / monthlyOutgoings : 0;
  const floorMonths = monthlyOutgoings > 0 ? result.floorAtWorst / monthlyOutgoings : 0;

  const facts = {
    coverMonths,
    peerCannotCoverPct: opts.cannotFaceUnexpectedExpensePct,
  };

  if (result.deficitAt !== null) {
    /*
     * Below zero is not "a low score", it is a different situation: the plan does not work.
     * Capped hard at 25 so no amount of investing or budget headroom can dress it up.
     */
    return { id: 'reserve', score: band(ramp(coverMonths, -3, 0) * 0.25), weight: 0, advice: 'reserve-deficit', facts };
  }

  const score = ramp(coverMonths, 0, floorMonths);
  return {
    id: 'reserve',
    score,
    weight: 0,
    advice: score >= 100 ? 'reserve-ok' : 'reserve-below-floor',
    facts,
  };
}

/**
 * Long-run provision, and the one place the score tells a saver to stop saving.
 *
 * The cash penalty is gated on `worstFloorGap >= 0` and that gate is an ethical one, not a
 * technicality. For a household whose reserve already dips under its floor, liquidity beats
 * optimisation — the St. Louis Fed measured a $100 increase in liquid assets cutting bill
 * delinquency by 8.3 points — so "invest it instead" is, for exactly those people, harmful
 * advice. The gate is what stops this module giving it.
 */
function scoreInvesting(
  scenario: ScenarioInput,
  result: ProjectionResult,
  netIncome: number,
  opts: ScoreOptions,
): ScoreDimension {
  const personal = scenario.people.reduce(
    (sum, person) =>
      sum + person.investments.reduce((s, sleeve) => s + Math.max(0, sleeve.monthlyContribution), 0),
    0,
  );
  const monthly = Math.max(0, scenario.jointInvesting.monthlyContribution) + personal;
  const sharePct = netIncome > 0 ? (monthly / netIncome) * 100 : 0;

  const cashMonths =
    result.fixedMonthlyOutgoings > 0 ? scenario.reserve.balance / result.fixedMonthlyOutgoings : 0;
  const reserveIsSafe = result.worstFloorGap >= 0 && result.deficitAt === null;
  const cashExcess = Math.max(0, cashMonths - opts.cashComfortMonthsMax);

  const facts = {
    investingSharePct: sharePct,
    investingTargetPct: opts.targetInvestingSharePct,
    cashMonths,
    cashMonthsMax: opts.cashComfortMonthsMax,
  };

  const base = ramp(sharePct, 0, opts.targetInvestingSharePct);

  /*
   * Up to 40 points, reached at twice the comfort ceiling. Not a cliff: one month past the
   * line is a nudge, a year past it is the headline.
   */
  const penalty = reserveIsSafe
    ? Math.min(40, (cashExcess / Math.max(1, opts.cashComfortMonthsMax)) * 40)
    : 0;

  const score = band(base - penalty);

  /*
   * The score reacts to any excess; the ADVICE needs more than that before it changes what
   * the household is told its problem is.
   *
   * A test caught this being wrong. With seven months of cash against a six-month ceiling,
   * a 1.2-month excess was enough to retitle the whole dimension "you are holding too much
   * cash" — which is a strange thing to say to someone one month over a soft line, and it
   * displaced the more useful "you are not investing anything". The excess now has to be
   * substantial before it becomes the headline, which is what the comment above always
   * claimed and the code did not do.
   */
  const cashIsTheStory = penalty > 0 && cashExcess >= MATERIAL_CASH_EXCESS_MONTHS;

  /*
   * Order matters. Cash-heavy is reported ahead of below-target because it is the more
   * actionable finding and the money is already there — the household does not need to find
   * anything, only move it.
   */
  const advice: ScoreAdviceId = cashIsTheStory
    ? 'investing-cash-heavy'
    : monthly <= 0
      ? 'investing-none'
      : sharePct >= opts.targetInvestingSharePct
        ? 'investing-ok'
        : 'investing-below-target';

  return { id: 'investing', score, weight: 0, advice, facts };
}

/**
 * Debt service, with a cap rather than a deduction for the one thing no other strength can
 * offset: paying more on a debt than the portfolio is expected to earn. Retiring debt at rate
 * r is a certain, risk-free r; the alternative is an expected return with variance. That is a
 * deduction, not a finding, which is why it caps the dimension instead of nudging it.
 */
function scoreDebt(
  scenario: ScenarioInput,
  result: ProjectionResult,
  netIncome: number,
  opts: ScoreOptions,
): ScoreDimension {
  const first = result.monthly[0];
  const service = first ? first.mortgagePayment + first.liabilityPayment : 0;
  const sharePct = netIncome > 0 ? (service / netIncome) * 100 : 0;

  const expectedReturnPct = scenario.jointInvesting.annualReturnPct;
  const expensive = scenario.liabilities
    .filter((l) => l.balance > 0 && l.annualRatePct > expectedReturnPct)
    .map((l) => l.annualRatePct);
  const worstDebtRatePct = expensive.length > 0 ? Math.max(...expensive) : undefined;

  const facts = {
    debtSharePct: sharePct,
    debtAdvisoryPct: opts.advisoryDebtServiceSharePct,
    ...(worstDebtRatePct !== undefined ? { worstDebtRatePct, expectedReturnPct } : {}),
  };

  /*
   * Full marks up to half the advisory share, then down to zero at 1.7x it — which lands
   * near the regulators' own ceilings (ČNB's deactivated 45 %, NBS's binding 60 %). That the
   * score is zero exactly where a bank must refuse you is the intended reading: the legal
   * ceiling is not a passing grade.
   */
  const advisory = opts.advisoryDebtServiceSharePct;
  const raw =
    sharePct <= advisory / 2 ? 100 : 100 - ramp(sharePct, advisory / 2, advisory * 1.7);

  const score = worstDebtRatePct !== undefined ? Math.min(55, band(raw)) : band(raw);

  const advice: ScoreAdviceId =
    worstDebtRatePct !== undefined
      ? 'debt-costlier-than-returns'
      : sharePct > advisory
        ? 'debt-heavy'
        : 'debt-ok';

  return { id: 'debt', score, weight: 0, advice, facts };
}

/**
 * Whether anything is left at the end of the month. This is what replaces 50/30/20: not a
 * verdict on how the money was split between needs and wants — a split whose 30 % has no
 * derivation and whose 50 % ceiling many households cannot reach — but on whether the
 * arrangement produces a surplus at all, which is the part of that rule that survives.
 */
function scoreHeadroom(result: ProjectionResult, netIncome: number): ScoreDimension {
  const sharePct = netIncome > 0 ? (result.firstSurplus / netIncome) * 100 : 0;
  const facts = { headroomSharePct: sharePct };
  /* 10 % of net income left over is the top of the scale. */
  const score = ramp(sharePct, 0, 10);
  /*
   * The threshold is the same 70 the UI uses to turn a row green, and that is the point: a row
   * scoring 91 that reads "the surplus is small" is the score arguing with itself. Only a
   * demand for the last 10 % of the scale made 9.1 % of net income sound thin.
   */
  const advice: ScoreAdviceId =
    sharePct <= 0 ? 'headroom-none' : score >= 70 ? 'headroom-ok' : 'headroom-thin';
  return { id: 'headroom', score, weight: 0, facts, advice };
}

/* -------------------------------------------------------------------------- public ---- */

/**
 * Score the arrangement. Pure, deterministic, and additive: it reads a result, it changes
 * nothing, and no projected number depends on it — which is why introducing it does not bump
 * `ENGINE_VERSION`. A stored plan cannot mean something different because a score exists.
 */
export function scorePlan(
  scenario: ScenarioInput,
  result: ProjectionResult,
  opts: ScoreOptions,
): HealthScore {
  const first = result.monthly[0];
  const netIncome = first ? first.income : 0;

  /*
   * A child in the plan moves weight towards liquidity, because that is when the household
   * is least able to absorb a shock and least able to wait out a bad year.
   *
   * The reserve TARGET is not touched here, and deliberately so: the engine already computes
   * the floor from each month's own fixed outgoings, so parental leave raises it by itself.
   * Two places computing the same target is how they come to disagree.
   */
  const childInPlan = scenario.children.length > 0 || scenario.childrenIntent === 'yes';
  const weights: Record<ScoreDimensionId, number> = childInPlan
    ? { reserve: 0.38, investing: 0.22, debt: 0.2, headroom: 0.2 }
    : { reserve: 0.3, investing: 0.3, debt: 0.2, headroom: 0.2 };

  const dimensions: ScoreDimension[] = [
    scoreReserve(result, opts),
    scoreInvesting(scenario, result, netIncome, opts),
    scoreDebt(scenario, result, netIncome, opts),
    scoreHeadroom(result, netIncome),
  ].map((d) => ({ ...d, weight: weights[d.id] }));

  const weighted = band(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0));
  const overall = result.deficitAt !== null ? Math.min(DEFICIT_OVERALL_MAX, weighted) : weighted;

  return { overall, dimensions, childWeighted: childInPlan };
}
