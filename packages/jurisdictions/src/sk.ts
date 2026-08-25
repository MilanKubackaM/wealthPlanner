import type { Jurisdiction, LeaveContext, LeavePhase, LeavePlan, LeaveRegime } from './types';

const SP_MATERSKE = 'https://www.socpoist.sk/materske';
const UPSVR_RODICOVSKY = 'https://www.upsvr.gov.sk/socialne-veci-a-rodina/rodicovsky-prispevok';
const KROS_2026 = 'https://web.kros.sk/blog/pracujuci-rodicia-a-socialny-system-prehlad-davok-2026/';
const NBS_LIMITS = 'https://nbs.sk/dohlad-nad-financnym-trhom/politika-obozretnosti-na-makrourovni/';

const VERIFIED_AT = '2026-08-24';

/** Weeks of materské. Verified against KROS 2026 overview; confirm at Sociálna poisťovňa. */
const MATERNITY_WEEKS_SINGLE = 34;
const MATERNITY_WEEKS_SINGLE_PARENT = 37;
const MATERNITY_WEEKS_MULTIPLE = 43;

/** 75 % of the daily assessment base. Approximated here as a share of net pay. */
const MATERNITY_SHARE_OF_NET = 0.75;

/** Fixed monthly rodičovský príspevok, 2026, after receiving materské. */
const PARENTAL_MONTHLY_EUR = 500.1;

/** Fixed monthly rodičovský príspevok, 2026, with no preceding materské. */
const PARENTAL_MONTHLY_NO_MATERNITY_EUR = 364.8;

/** The benefit runs until the child's third birthday. */
const PARENTAL_MAX_MONTHS = 36;

function weeksToWholeMonths(weeks: number): number {
  return Math.round((weeks * 7) / 30.4375);
}

/**
 * Slovak leave regime: maternity as a share of net pay, then a FIXED MONTHLY amount
 * until the child turns three. Structurally unlike the Czech drawdown model —
 * drawing over fewer months does not raise the monthly payment.
 */
export const skLeaveRegime: LeaveRegime = {
  id: 'sk-2026',
  jurisdiction: 'SK',
  currency: 'EUR',
  version: 1,
  verifiedAt: VERIFIED_AT,
  sources: [SP_MATERSKE, UPSVR_RODICOVSKY, KROS_2026],

  maternityMonths(plan: LeavePlan): number {
    const weeks = plan.multipleBirth
      ? MATERNITY_WEEKS_MULTIPLE
      : plan.singleParent
        ? MATERNITY_WEEKS_SINGLE_PARENT
        : MATERNITY_WEEKS_SINGLE;
    return weeksToWholeMonths(weeks);
  },

  totalLeaveMonths(plan: LeavePlan): number {
    const maternity = this.maternityMonths(plan);
    const parental = Math.min(
      Math.max(0, Math.floor(plan.parentalMonths)),
      Math.max(0, PARENTAL_MAX_MONTHS - maternity),
    );
    return maternity + parental;
  },

  incomeFor(ctx: LeaveContext): LeavePhase | null {
    const { monthsSinceBirth, baseNetIncome, plan } = ctx;
    if (monthsSinceBirth < 0) return null;

    const maternity = this.maternityMonths(plan);
    if (monthsSinceBirth < maternity) {
      return { kind: 'maternity', income: baseNetIncome * MATERNITY_SHARE_OF_NET };
    }

    const parental = Math.min(
      Math.max(0, Math.floor(plan.parentalMonths)),
      Math.max(0, PARENTAL_MAX_MONTHS - maternity),
    );
    if (parental > 0 && monthsSinceBirth < maternity + parental) {
      const monthly = maternity > 0 ? PARENTAL_MONTHLY_EUR : PARENTAL_MONTHLY_NO_MATERNITY_EUR;
      return { kind: 'parental', income: monthly };
    }

    return null;
  },
};

export const slovakia: Jurisdiction = {
  code: 'SK',
  currency: 'EUR',
  locale: 'sk-SK',
  leave: skLeaveRegime,
  mortgageLimits: {
    ltvMaxPct: {
      value: 90,
      verifiedAt: VERIFIED_AT,
      source: NBS_LIMITS,
      unverified: true,
      note: 'NBS sets no single explicit LTV cap in the Czech style; treat as indicative.',
    },
    ltvMaxPctUnder36: null,
    dstiMaxPct: { value: 60, verifiedAt: VERIFIED_AT, source: NBS_LIMITS },
    dstiMaxPctUnder36: null,
    dtiMaxMultiple: {
      value: 8,
      verifiedAt: VERIFIED_AT,
      source: NBS_LIMITS,
      unverified: true,
      note: 'DTI limit exists but the exact multiple was not confirmed from NBS in this pass.',
    },
  },
  securitiesExemptionMonths: {
    value: 12,
    verifiedAt: VERIFIED_AT,
    source: 'https://www.slov-lex.sk/pravne-predpisy/SK/ZZ/2003/595/',
    unverified: true,
    note: 'One-year holding exemption for securities. Confirm scope before relying on it.',
  },
  typicalTopSavingsRatePct: {
    value: 2.0,
    verifiedAt: VERIFIED_AT,
    source: 'market survey',
    unverified: true,
    note: 'Domestic bank rates. Never present as a product recommendation.',
  },
  typicalMortgageRatePct: {
    value: 3.5,
    verifiedAt: VERIFIED_AT,
    source: 'NBS statistics',
    unverified: true,
  },
  statutoryRetirementAgeYears: {
    value: 64,
    verifiedAt: VERIFIED_AT,
    source: 'https://www.socpoist.sk/',
    unverified: true,
    note: 'Indexed to life expectancy, so it moves by cohort. Confirm before any claim about a pension.',
  },
  typicalConsumerLoanRatePct: {
    value: 8.5,
    verifiedAt: VERIFIED_AT,
    source: 'https://nbs.sk/statisticke-udaje/',
    unverified: true,
    note: 'NBS statistics, new business in household consumer credit. Default suggestion only.',
  },
  typicalCreditCardRatePct: {
    value: 19.0,
    verifiedAt: VERIFIED_AT,
    source: 'https://nbs.sk/statisticke-udaje/',
    unverified: true,
    note: 'Revolving credit. Default suggestion only.',
  },
};
