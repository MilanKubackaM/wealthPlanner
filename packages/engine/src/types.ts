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
  /**
   * Birth YEAR only, and optional on purpose.
   *
   * A stored `age` is wrong the next January, and the one thing age is for here is the
   * retirement horizon — precisely what a stale age corrupts. A year does not rot.
   * Optional because filling it in during migration would make the engine invent a
   * demographic fact about a real person; `ageAt()` returns null and the UI says so.
   */
  birthYear?: number;
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

export interface Rent {
  id: string;
  label: string;
  /** Current monthly rent, before indexation. */
  monthlyAmount: number;
  /**
   * Annual indexation, percent. Prefilled from the CPI assumption but kept SEPARATE from
   * it: a lease's escalator is contractual, not the consumer price index. Reusing
   * `cpiPct` here would hardcode "rent tracks inflation" and make this field decorative.
   */
  annualIndexationPct: number;
  /**
   * Whether the rent counts towards the reserve floor. True for a normal lease — rent is
   * the most fixed outgoing a renter has. The escape hatch is a rent a flatmate splits.
   */
  countsTowardReserveFloor: boolean;
}

/**
 * Housing is a CHOICE, encoded as a union rather than as a nullable mortgage beside a
 * nullable rent. The nullable-pair encoding admits the incoherent state (a mortgage and a
 * rent at once) that this type exists to exclude, and `housing.kind` gives the UI exactly
 * one thing to switch on.
 *
 * `own` with an empty `mortgages` array means "owns outright", which is a real household
 * and is deliberately distinct from renting.
 */
export type Housing =
  | { kind: 'own'; mortgages: Mortgage[] }
  | { kind: 'rent'; rent: Rent };

export type LiabilityKind = 'car-loan' | 'consumer-loan' | 'credit-card' | 'other';

export interface Liability {
  id: string;
  label: string;
  kind: LiabilityKind;
  balance: number;
  annualRatePct: number;
  monthlyPayment: number;
  /**
   * Remaining term in months, as printed on the contract. DERIVED, not authoritative: the
   * engine amortises from balance/rate/payment and stops when the balance reaches zero,
   * exactly as it does for a mortgage. Kept because it is the number the user can read off
   * a statement, and because a term that disagrees with the amortisation is itself a fact
   * worth reporting.
   */
  remainingTermMonths: number;
  /** A revolving balance (credit card) has no term. `remainingTermMonths` is then ignored. */
  revolving: boolean;
}

/**
 * Whether the household intends children. Tri-state on purpose: 'undecided' is the honest
 * state of a plan that was never asked, and it is NOT the same answer as 'no'. Descriptive
 * only — `simulate()` must never read this, and a test asserts that.
 */
export type ChildrenIntent = 'yes' | 'no' | 'undecided';

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

/**
 * One cash account, as the household actually holds it. DESCRIPTIVE: the projection reads
 * `Reserve.balance` and `Reserve.annualRatePct`, never this list.
 *
 * The reason for the split is that a real household has a current account at 0 %, a savings
 * account at 4 % and maybe a term deposit — while the model needs one buffer, because "which
 * month does the reserve hit its floor" is a question about the total. So the UI keeps the
 * breakdown, derives the total and the balance-weighted rate from it, and the engine consumes
 * only the aggregate. A test asserts that editing this list alone moves no projected number.
 */
export interface CashAccount {
  id: string;
  label: string;
  amount: number;
  annualRatePct: number;
}

export interface Reserve {
  /** The buffer the projection uses. Derived from `accounts` when the UI supplies them. */
  balance: number;
  /** Balance-weighted average of the accounts' rates. */
  annualRatePct: number;
  /**
   * Anything above this is swept into joint investing each month.
   * null disables the sweep entirely.
   */
  sweepCap: number | null;
  /** Descriptive breakdown of `balance`. Optional: a plan may just carry a single total. */
  accounts?: CashAccount[];
}

export interface JointInvesting {
  /** Target monthly contribution (DCA). Throttled automatically when cash is short. */
  monthlyContribution: number;
  annualReturnPct: number;
  startingBalance: number;
  /** What the household calls it. Descriptive; the projection never reads it. */
  label?: string;
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
  housing: Housing;
  /** Debts other than the mortgage: car loan, consumer credit, a revolving card. */
  liabilities: Liability[];
  expenses: Expense[];
  reserve: Reserve;
  jointInvesting: JointInvesting;
  children: Child[];
  /** Descriptive. Selects what the comparison panel offers; changes no projected number. */
  childrenIntent: ChildrenIntent;
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
  /** Rent paid this month, indexed by the lease's own escalator. Zero for an owner. */
  rentPayment: number;
  /** mortgagePayment + rentPayment. What the chart and the floor actually care about. */
  housingPayment: number;
  /** Total contractual payment on all non-mortgage debts this month. */
  liabilityPayment: number;
  childCost: number;
  reserve: number;
  jointInvestments: number;
  personalInvestments: number;
  mortgageBalance: number;
  liabilityBalance: number;
  dcaTarget: number;
  dcaActual: number;
  /**
   * The reserve floor for THIS month — reserveFloorMonths × this month's fixed outgoings,
   * so it rises with inflation instead of being frozen at month one.
   */
  floor: number;
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
  liabilityBalance: number;
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

  /** Year the last non-mortgage debt is cleared, if within the horizon. */
  liabilitiesClearedYear: number | null;

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
