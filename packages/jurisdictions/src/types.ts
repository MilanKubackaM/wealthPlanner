/**
 * Jurisdiction-specific parameters and rules.
 *
 * DESIGN RULE: Czech and Slovak parental benefits are NOT two parameter sets of the
 * same model — they are two structurally different models:
 *
 *   CZ: rodičovský příspěvek is a FIXED TOTAL ALLOWANCE the parent draws down over a
 *       self-chosen number of months, subject to a monthly ceiling.
 *   SK: rodičovský príspevok is a FIXED MONTHLY AMOUNT until the child turns 3.
 *
 * Therefore a leave regime is a strategy object, not a table of numbers.
 */

export type JurisdictionCode = 'CZ' | 'SK';
export type CurrencyCode = 'CZK' | 'EUR';

/** Every statutory number carries where it came from and when it was last checked. */
export interface SourcedValue<T> {
  value: T;
  /** ISO date the value was last verified against the primary source. */
  verifiedAt: string;
  /** URL of the primary (ideally governmental) source. */
  source: string;
  /** Set when the value could not be confirmed from a primary source. */
  unverified?: boolean;
  note?: string;
}

/** User-facing choices about how leave is taken. Not statutory. */
export interface LeavePlan {
  /** How many months of parental benefit the parent intends to draw. */
  parentalMonths: number;
  /**
   * Share of the pre-leave net income the parent returns to after all leave ends,
   * as a percentage. 100 = full return.
   */
  returnToWorkPct: number;
  /** True for a multiple birth (twins or more) — changes maternity duration. */
  multipleBirth?: boolean;
  /** True for a single parent — changes maternity duration in SK. */
  singleParent?: boolean;
}

export type LeavePhaseKind = 'maternity' | 'parental' | 'work';

export interface LeavePhase {
  kind: LeavePhaseKind;
  /** Net monthly income during this phase, in the scenario currency. */
  income: number;
}

export interface LeaveContext {
  /** Months elapsed since the child's birth month. 0 is the month of birth. */
  monthsSinceBirth: number;
  /**
   * The net monthly income the parent would have earned this month if no child
   * existed — already grown by the income-growth assumption.
   */
  baseNetIncome: number;
  plan: LeavePlan;
}

export interface LeaveRegime {
  readonly id: string;
  readonly jurisdiction: JurisdictionCode;
  readonly currency: CurrencyCode;
  /** Bumped whenever any rule or constant inside the regime changes. */
  readonly version: number;
  readonly verifiedAt: string;
  readonly sources: readonly string[];

  /** Whole months of maternity benefit for this plan. */
  maternityMonths(plan: LeavePlan): number;

  /**
   * Total months during which this child suppresses the parent's income
   * (maternity + parental). After this the parent is back at work.
   */
  totalLeaveMonths(plan: LeavePlan): number;

  /**
   * Income for the given month, or null when this child imposes no leave that month.
   * Returning null means "this child is not a reason to reduce income now".
   */
  incomeFor(ctx: LeaveContext): LeavePhase | null;
}

export interface MortgageLimits {
  ltvMaxPct: SourcedValue<number>;
  ltvMaxPctUnder36: SourcedValue<number> | null;
  dstiMaxPct: SourcedValue<number>;
  dstiMaxPctUnder36: SourcedValue<number> | null;
  dtiMaxMultiple: SourcedValue<number> | null;
}

export interface Jurisdiction {
  readonly code: JurisdictionCode;
  readonly currency: CurrencyCode;
  readonly locale: string;
  readonly leave: LeaveRegime;
  readonly mortgageLimits: MortgageLimits;
  /**
   * Holding period in months after which capital gains on securities are exempt.
   */
  readonly securitiesExemptionMonths: SourcedValue<number>;
  /** Typical top savings-account rate, for the "your cash earns too little" rule. */
  readonly typicalTopSavingsRatePct: SourcedValue<number>;
  /** Typical new mortgage rate, used only as a default suggestion, never as advice. */
  readonly typicalMortgageRatePct: SourcedValue<number>;
  /**
   * Statutory retirement age in years. Rising in both countries, which is exactly why it
   * belongs here with a verification date rather than as a constant in the UI.
   * Also what finally makes `ltvMaxPctUnder36` / `dstiMaxPctUnder36` reachable — until the
   * model knew anyone's age, the under-36 limits could never be selected.
   */
  readonly statutoryRetirementAgeYears: SourcedValue<number>;
  /** Typical consumer-loan APR. A default suggestion for a new debt, never advice. */
  readonly typicalConsumerLoanRatePct: SourcedValue<number>;
  /** Typical revolving credit-card rate. Same standing as the line above. */
  readonly typicalCreditCardRatePct: SourcedValue<number>;
}
