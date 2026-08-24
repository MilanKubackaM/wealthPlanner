import type { CurrencyCode, JurisdictionCode, LeavePlan, LeaveRegime } from '@wealthplanner/jurisdictions';

/** A calendar month. `month` is 0-based (0 = January) to match Date semantics. */
export interface YearMonth {
  year: number;
  month: number;
}

export interface InvestmentSleeve {
  id: string;
  label: string;
  monthlyContribution: number;
  annualReturnPct: number;
  startingBalance: number;
  /**
   * When true the contribution is paid out of this person's pocket money rather than
   * from household cash flow. The original prototype claimed this in its UI text but
   * never enforced it, so a user could invest more than their whole allowance and the
   * model would compound money that never left the household. The engine now enforces it.
   */
  fundedFromPocketMoney: boolean;
}

export interface Person {
  id: string;
  label: string;
  /** Current net monthly income, before any growth. */
  netMonthlyIncome: number;
  /** Annual nominal income growth, percent. Per person, not global. */
  incomeGrowthPct: number;
  /** Monthly personal allowance ("pocket money"). */
  pocketMoney: number;
  investments: InvestmentSleeve[];
}

export interface RateReset {
  at: YearMonth;
  newAnnualRatePct: number;
  /** Optional new payment. When omitted the payment is kept and the term stretches. */
  newMonthlyPayment?: number;
}

export interface Mortgage {
  id: string;
  label: string;
  balance: number;
  annualRatePct: number;
  monthlyPayment: number;
  /** Fixation-end events. The dominant risk in a real household's next decade. */
  rateResets: RateReset[];
}

export type ExpenseKind = 'fixed' | 'variable';

export interface Expense {
  id: string;
  label: string;
  monthlyAmount: number;
  /**
   * 'fixed' expenses count towards the reserve target (the "three months of fixed
   * outgoings" floor). Mortgage payments are added to that target separately.
   */
  kind: ExpenseKind;
  /** Whether the amount grows with the CPI assumption. */
  inflates: boolean;
}

export interface Reserve {
  balance: number;
  annualRatePct: number;
  /**
   * Anything above this is swept into joint investing each month.
   * null disables the sweep entirely.
   */
  sweepCap: number | null;
}

export interface JointInvesting {
  /** Target monthly contribution (DCA). Throttled automatically when cash is short. */
  monthlyContribution: number;
  annualReturnPct: number;
  startingBalance: number;
}

export interface Child {
  id: string;
  label: string;
  /** Explicit month and year. The prototype hardcoded July. */
  birth: YearMonth;
  monthlyCost: number;
  /** Cost runs until the child reaches this age. */
  costUntilAgeYears: number;
  /** Cost tapers linearly to zero over the final N years instead of stopping dead. */
  costTaperYears: number;
  /** Which person's income the leave applies to. */
  leaveTakenBy: string;
  leavePlan: LeavePlan;
}

export interface OneOff {
  id: string;
  label: string;
  at: YearMonth;
  /** Positive is income, negative is an expense. */
  amount: number;
}

export interface Envelope {
  id: string;
  label: string;
  /** Person id, or 'shared'. */
  owner: string;
  amount: number;
  target: number;
  /** Shared envelopes back the household reserve; personal ones do not. */
  countsTowardReserve: boolean;
}

export interface Assumptions {
  /** First month of the projection. Derived from today, never a compile-time constant. */
  start: YearMonth;
  /** Last calendar year included. */
  horizonYear: number;
  /** Expense inflation, percent per year. Separate from income growth. */
  cpiPct: number;
  /** Months of fixed outgoings the reserve should never fall below. */
  reserveFloorMonths: number;
}

export interface ScenarioInput {
  jurisdiction: JurisdictionCode;
  currency: CurrencyCode;
  assumptions: Assumptions;
  people: Person[];
  mortgages: Mortgage[];
  expenses: Expense[];
  reserve: Reserve;
  jointInvesting: JointInvesting;
  children: Child[];
  oneOffs: OneOff[];
  envelopes: Envelope[];
  /** Injected, never hardcoded. Comes from @wealthplanner/jurisdictions. */
  leaveRegime: LeaveRegime;
}

export interface MonthlyPoint {
  index: number;
  year: number;
  month: number;
  income: number;
  spending: number;
  mortgagePayment: number;
  childCost: number;
  reserve: number;
  jointInvestments: number;
  personalInvestments: number;
  mortgageBalance: number;
  dcaTarget: number;
  dcaActual: number;
  sweep: number;
  surplus: number;
  /** Per-person income this month, keyed by person id. */
  incomeByPerson: Record<string, number>;
  /** Leave phase per person this month, when any. */
  phaseByPerson: Record<string, string>;
}

export interface YearlyPoint {
  year: number;
  reserve: number;
  jointInvestments: number;
  personalInvestments: Record<string, number>;
  mortgageBalance: number;
  /** Reserve is included as-is, including negative values. Never clamped. */
  netWorth: number;
}

export interface ProjectionResult {
  engineVersion: number;
  monthly: MonthlyPoint[];
  yearly: YearlyPoint[];

  /** Lowest reserve balance reached, and when. Negative values are preserved. */
  minReserve: number;
  minReserveAt: YearMonth | null;

  /** First month the reserve goes below zero, if ever. */
  deficitAt: YearMonth | null;

  /** Months in which the DCA had to be throttled, and the total shortfall. */
  pausedMonths: number;
  pausedAmount: number;
  pausedFrom: YearMonth | null;

  /** Year the mortgage is fully repaid, if within the horizon. */
  mortgagePaidYear: number | null;

  /** Fixed outgoings in the first month, used for the reserve floor. */
  fixedMonthlyOutgoings: number;
  reserveFloor: number;

  /** Surplus in the first projected month. */
  firstSurplus: number;

  /** Income foregone across the whole projection because of leave. */
  foregoneIncome: number;

  finalNetWorth: number;

  /**
   * Worst shortfall of the reserve against the floor, comparing each month's reserve
   * against that month's INFLATED floor rather than today's. Negative means the
   * reserve dipped below the floor. This is what the recommendation rules use.
   */
  worstFloorGap: number;
  worstFloorGapAt: YearMonth | null;
  /** The floor value at the worst month, so the UI can state both numbers. */
  floorAtWorst: number;

  /**
   * Envelope totals. Envelopes are descriptive in v1 — they say what the reserve is
   * earmarked for without altering cash flow — so these are reported, not simulated.
   */
  sharedEnvelopeTotal: number;
  personalEnvelopeTotal: number;
}
