import type { Jurisdiction, LeaveContext, LeavePhase, LeavePlan, LeaveRegime } from './types';

/*
 * Every URL below was fetched and read on the VERIFIED_AT date. Three of the originals had
 * rotted: /materske was a redirect that no longer resolves, the ÚPSVaR benefit page has moved
 * more than once (so the statute on Slov-Lex is linked instead — it does not move), and NBS
 * has replaced one macroprudential landing page with a page per instrument, which is better
 * anyway: each states its own limit.
 *
 * `pnpm sources:check` re-tests every one of them.
 */
const SP_MATERSKE =
  'https://www.socpoist.sk/socialne-poistenie/nemocenske-poistenie/materske/dalsie-informacie-materske';
/** Zákon č. 571/2009 Z. z. o rodičovskom príspevku. */
const RODICOVSKY_ZAKON = 'https://www.slov-lex.sk/pravne-predpisy/SK/ZZ/2009/571/';
const KROS_2026 = 'https://web.kros.sk/blog/pracujuci-rodicia-a-socialny-system-prehlad-davok-2026/';
const NBS_LTV = 'https://nbs.sk/financna-stabilita/nastroje-fs/ltv/';
const NBS_DSTI = 'https://nbs.sk/financna-stabilita/nastroje-fs/dsti/';
const NBS_DTI = 'https://nbs.sk/financna-stabilita/nastroje-fs/dti/';
/** NBS interest-rate statistics: credit-institution deposit and loan rates. */
const NBS_RATES = 'https://nbs.sk/statisticke-udaje/financne-trhy/urokove-sadzby/';
/** EC 2024 Ageing Report country fiche — three pillars, and the declining benefit ratio. */
const EC_AGEING_SK =
  'https://economy-finance.ec.europa.eu/document/download/9d858e5d-9263-4055-a008-162bf459da4e_en?filename=2024-ageing-report-country-fiche-Slovakia.pdf';
const VANGUARD_CASH =
  'https://corporate.vanguard.com/content/corporatesite/us/en/corp/articles/beyond-emergency-funds-a-smarter-cash-strategy.html';
const EUROSTAT_UNEXPECTED =
  'https://ec.europa.eu/eurostat/databrowser/view/ilc_mdes04/default/table?lang=en';

const VERIFIED_AT = '2026-08-25';

/** Weeks of materské. All three confirmed against Sociálna poisťovňa on the VERIFIED_AT date. */
const MATERNITY_WEEKS_SINGLE = 34;
const MATERNITY_WEEKS_SINGLE_PARENT = 37;
const MATERNITY_WEEKS_MULTIPLE = 43;

/** 75 % of the daily assessment base — confirmed at Sociálna poisťovňa. Approximated here as a share of net pay. */
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
  sources: [SP_MATERSKE, RODICOVSKY_ZAKON, KROS_2026],

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
      source: NBS_LTV,
      unverified: true,
      note: 'NBS base limit is 80 % of value; up to 20 % of new loans may reach 90 % (from 1 Jan 2027, 90 % becomes the explicit tier for first-time buyers up to 35). The 90 here is the exception ceiling, i.e. deliberately permissive as a planning default.',
    },
    ltvMaxPctUnder36: null,
    dstiMaxPct: { value: 60, verifiedAt: VERIFIED_AT, source: NBS_DSTI },
    dstiMaxPctUnder36: null,
    dtiMaxMultiple: { value: 8, verifiedAt: VERIFIED_AT, source: NBS_DTI },
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
    source: NBS_RATES,
    unverified: true,
    note: 'Top of the domestic market, above the NBS average for household deposits. Never present as a product recommendation.',
  },
  typicalMortgageRatePct: {
    value: 3.5,
    verifiedAt: VERIFIED_AT,
    source: NBS_RATES,
    unverified: true,
    note: 'NBS statistics, new business in housing loans. Default suggestion only.',
  },
  statutoryRetirementAgeYears: {
    value: 64,
    verifiedAt: VERIFIED_AT,
    source:
      'https://www.socpoist.sk/socialne-poistenie/dochodkove-poistenie/vseobecne-informacie/dochodkovy-vek',
    unverified: true,
    note: 'Indexed to life expectancy and reduced by six months per child raised (max 18), so it moves by cohort and by family — 64 y 2 m for the 1968 cohort. A single number cannot be right for every user.',
  },
  typicalConsumerLoanRatePct: {
    value: 8.5,
    verifiedAt: VERIFIED_AT,
    source: NBS_RATES,
    unverified: true,
    note: 'NBS statistics, new business in household consumer credit. Default suggestion only.',
  },
  typicalCreditCardRatePct: {
    value: 19.0,
    verifiedAt: VERIFIED_AT,
    source: NBS_RATES,
    unverified: true,
    note: 'Revolving credit and overdrafts. Default suggestion only.',
  },
  targetInvestingShareOfNetPct: {
    value: 9,
    verifiedAt: VERIFIED_AT,
    source: EC_AGEING_SK,
    unverified: true,
    note: 'BENCHMARK, not a calculation. Lower than the Czech figure for one concrete reason, not by fudge: Slovakia HAS a mandatory funded pillar taking 4 % of the gross assessment base, which is real forced saving the household need not repeat. Set against a public benefit ratio projected to FALL from 38 % (2022) to 33 % (2070) — EC 2024 Ageing Report. Expressed against NET income.',
  },
  cashComfortMonthsMax: {
    value: 6,
    verifiedAt: VERIFIED_AT,
    source: VANGUARD_CASH,
    unverified: true,
    note: 'Same reasoning as CZ. Note the Slovak starting point is the opposite problem: the household saving rate is 8.1 % against an EU average of 14.3 %, and only about one household in ten holds any investment at all (NBS HFCS 2023) — so this ceiling will bind far more rarely here than the target above.',
  },
  advisoryDebtServiceSharePct: {
    value: 35,
    verifiedAt: VERIFIED_AT,
    source: NBS_DSTI,
    unverified: true,
    note: 'OUR OWN advisory figure. NBS\'s 60 % DSTI is binding and stress-tested, but it is the point at which a bank MUST refuse the loan — a legal ceiling, never a household target. The score gives zero at the regulatory ceiling on purpose.',
  },
  cannotFaceUnexpectedExpensePct: {
    value: 26.0,
    verifiedAt: VERIFIED_AT,
    source: EUROSTAT_UNEXPECTED,
    note: 'Eurostat EU-SILC ilc_mdes04, 2025: 26.0 % of Slovak households cannot face an unexpected expense, against an EU-27 average of 29.2 %. Better than the EU average and still more than one household in four.',
  },
};
