import type { Jurisdiction, LeaveContext, LeavePhase, LeavePlan, LeaveRegime } from './types';

const CSSZ_PPM = 'https://www.cssz.gov.cz/penezita-pomoc-v-materstvi';
const MPSV_RODICOVSKY = 'https://www.mpsv.cz/-/rodicovsky-prispevek';
const CNB_LIMITS =
  'https://www.cnb.cz/cs/dohled-financni-trh/dohled-nad-financnim-trhem/stanovovani-limitu-uverovych-ukazatelu/';

const VERIFIED_AT = '2026-08-24';

/** Weeks of peněžitá pomoc v mateřství. Verified against ČSSZ. */
const MATERNITY_WEEKS_SINGLE = 28;
const MATERNITY_WEEKS_MULTIPLE = 37;

/** 70 % of the reduced daily assessment base. Approximated here as a share of net pay. */
const MATERNITY_SHARE_OF_NET = 0.7;

/**
 * Total rodičovský příspěvek for a child under 3.
 * UNVERIFIED against a primary MPSV page in this pass — confirm before launch.
 */
const PARENTAL_TOTAL_ALLOWANCE_CZK = 350_000;

/** Monthly drawing ceiling when the parent received maternity benefit first. */
const PARENTAL_MONTHLY_CEILING_CZK = 60_000;

/** Monthly drawing ceiling with no preceding maternity benefit. */
const PARENTAL_MONTHLY_CEILING_NO_MATERNITY_CZK = 15_000;

function weeksToWholeMonths(weeks: number): number {
  return Math.round((weeks * 7) / 30.4375);
}

/**
 * Czech leave regime: maternity as a share of net pay, then a fixed total allowance
 * drawn down over a self-chosen number of months subject to a monthly ceiling.
 */
export const czLeaveRegime: LeaveRegime = {
  id: 'cz-2026',
  jurisdiction: 'CZ',
  currency: 'CZK',
  version: 1,
  verifiedAt: VERIFIED_AT,
  sources: [CSSZ_PPM, MPSV_RODICOVSKY],

  maternityMonths(plan: LeavePlan): number {
    return weeksToWholeMonths(
      plan.multipleBirth ? MATERNITY_WEEKS_MULTIPLE : MATERNITY_WEEKS_SINGLE,
    );
  },

  totalLeaveMonths(plan: LeavePlan): number {
    return this.maternityMonths(plan) + Math.max(0, Math.floor(plan.parentalMonths));
  },

  incomeFor(ctx: LeaveContext): LeavePhase | null {
    const { monthsSinceBirth, baseNetIncome, plan } = ctx;
    if (monthsSinceBirth < 0) return null;

    const maternity = this.maternityMonths(plan);
    if (monthsSinceBirth < maternity) {
      return { kind: 'maternity', income: baseNetIncome * MATERNITY_SHARE_OF_NET };
    }

    const parentalMonths = Math.max(0, Math.floor(plan.parentalMonths));
    if (parentalMonths > 0 && monthsSinceBirth < maternity + parentalMonths) {
      const ceiling =
        maternity > 0 ? PARENTAL_MONTHLY_CEILING_CZK : PARENTAL_MONTHLY_CEILING_NO_MATERNITY_CZK;
      const perMonth = Math.min(PARENTAL_TOTAL_ALLOWANCE_CZK / parentalMonths, ceiling);
      return { kind: 'parental', income: perMonth };
    }

    return null;
  },
};

export const czechia: Jurisdiction = {
  code: 'CZ',
  currency: 'CZK',
  locale: 'cs-CZ',
  leave: czLeaveRegime,
  mortgageLimits: {
    ltvMaxPct: { value: 80, verifiedAt: VERIFIED_AT, source: CNB_LIMITS },
    ltvMaxPctUnder36: { value: 90, verifiedAt: VERIFIED_AT, source: CNB_LIMITS },
    dstiMaxPct: { value: 45, verifiedAt: VERIFIED_AT, source: CNB_LIMITS },
    dstiMaxPctUnder36: { value: 50, verifiedAt: VERIFIED_AT, source: CNB_LIMITS },
    dtiMaxMultiple: { value: 8.5, verifiedAt: VERIFIED_AT, source: CNB_LIMITS },
  },
  securitiesExemptionMonths: {
    value: 36,
    verifiedAt: VERIFIED_AT,
    source: 'https://www.zakonyprolidi.cz/cs/1992-586',
    unverified: true,
    note: 'Three-year holding exemption; the 40M CZK cap was reportedly removed for 2026. Confirm.',
  },
  typicalTopSavingsRatePct: {
    value: 4.25,
    verifiedAt: VERIFIED_AT,
    source: 'market survey',
    unverified: true,
    note: 'Market rate, changes continuously. Never present as a product recommendation.',
  },
  typicalMortgageRatePct: {
    value: 4.5,
    verifiedAt: VERIFIED_AT,
    source: 'https://www.cbamonitor.cz/',
    unverified: true,
    note: 'ČBA Hypomonitor average for new loans. Default suggestion only.',
  },
  statutoryRetirementAgeYears: {
    value: 65,
    verifiedAt: VERIFIED_AT,
    source: 'https://www.zakonyprolidi.cz/cs/1995-155',
    unverified: true,
    note: 'Rising towards 67 under the 2024 amendment; the schedule depends on birth year. Confirm before any claim about a pension.',
  },
  typicalConsumerLoanRatePct: {
    value: 9.5,
    verifiedAt: VERIFIED_AT,
    source: 'https://www.cnb.cz/arad/',
    unverified: true,
    note: 'ČNB ARAD, new business in household consumer credit. Default suggestion only.',
  },
  typicalCreditCardRatePct: {
    value: 22.0,
    verifiedAt: VERIFIED_AT,
    source: 'https://www.cnb.cz/arad/',
    unverified: true,
    note: 'Revolving credit. Default suggestion only.',
  },
};
