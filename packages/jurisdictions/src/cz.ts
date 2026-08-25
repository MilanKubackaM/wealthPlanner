import type { Jurisdiction, LeaveContext, LeavePhase, LeavePlan, LeaveRegime } from './types';

/*
 * Every URL below was fetched and read on the VERIFIED_AT date, not guessed from a pattern.
 * Four of the originals had rotted: ČNB moved the credit-limit page from /dohled-financni-trh/
 * to /financni-stabilita/makroobezretnostni-politika/, MPSV moved to mpsv.gov.cz (the benefit
 * itself is administered by Úřad práce, which is what we now link), and the two zakonyprolidi.cz
 * deep links are replaced by the administering authority's own page — a page that states the
 * number beats a statute the reader then has to search.
 *
 * `pnpm sources:check` re-tests every one of them.
 */
const CSSZ_PPM = 'https://www.cssz.gov.cz/penezita-pomoc-v-materstvi';
const UP_RODICOVSKY = 'https://up.gov.cz/rodicovsky-prispevek';
const CNB_LIMITS =
  'https://www.cnb.cz/cs/financni-stabilita/makroobezretnostni-politika/stanoveni-horni-hranice-uverovych-ukazatelu/';
/** Harmonised interest-rate statistics: deposit rates (B3) and new household loans (B4). */
const CNB_RATES = 'https://www.cnb.cz/cs/statistika/menova_bankovni_stat/harm_stat_data/mir_cs.htm';
/** EC 2024 Ageing Report country fiche — the pillar structure and the benefit ratio. */
const EC_AGEING_CZ =
  'https://economy-finance.ec.europa.eu/document/download/ee54a263-d496-44a3-9b3a-b5c48567c6dd_en?filename=2024-ageing-report-country-fiche-Czechia.pdf';
const VANGUARD_CASH =
  'https://corporate.vanguard.com/content/corporatesite/us/en/corp/articles/beyond-emergency-funds-a-smarter-cash-strategy.html';
const EUROSTAT_UNEXPECTED =
  'https://ec.europa.eu/eurostat/databrowser/view/ilc_mdes04/default/table?lang=en';

const VERIFIED_AT = '2026-08-25';

/** Weeks of peněžitá pomoc v mateřství. Verified against ČSSZ. */
const MATERNITY_WEEKS_SINGLE = 28;
const MATERNITY_WEEKS_MULTIPLE = 37;

/** 70 % of the reduced daily assessment base. Approximated here as a share of net pay. */
const MATERNITY_SHARE_OF_NET = 0.7;

/**
 * Total rodičovský příspěvek for one child. Confirmed against Úřad práce on the VERIFIED_AT
 * date: 350 000 Kč for children born from 1 Jan 2024 (300 000 Kč for earlier births, which
 * this model does not attempt to reproduce).
 */
const PARENTAL_TOTAL_ALLOWANCE_CZK = 350_000;

/**
 * Monthly drawing ceiling when the parent received maternity benefit first. The statutory
 * rule is 70 % of thirty times the daily assessment base, so the real ceiling is per-person;
 * 60 000 Kč is a deliberate stand-in near the top of the common range.
 */
const PARENTAL_MONTHLY_CEILING_CZK = 60_000;

/** Monthly drawing ceiling with no preceding maternity benefit. Úřad práce: 15 000 Kč. */
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
  sources: [CSSZ_PPM, UP_RODICOVSKY],

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
    dstiMaxPct: {
      value: 45,
      verifiedAt: VERIFIED_AT,
      source: CNB_LIMITS,
      unverified: true,
      note: 'NOT currently binding: ČNB deactivated the DSTI limit on 1 July 2023 and only LTV binds today. 45 % is the value as originally set (April 2022) and is kept as a prudence reference, not as a legal limit.',
    },
    dstiMaxPctUnder36: {
      value: 50,
      verifiedAt: VERIFIED_AT,
      source: CNB_LIMITS,
      unverified: true,
      note: 'Same caveat as dstiMaxPct — deactivated, kept as a reference.',
    },
    dtiMaxMultiple: {
      value: 8.5,
      verifiedAt: VERIFIED_AT,
      source: CNB_LIMITS,
      unverified: true,
      note: 'Also deactivated. ČNB has switched the binding DTI limit off and on more than once, which is the whole reason this row carries a date.',
    },
  },
  securitiesExemptionMonths: {
    value: 36,
    verifiedAt: VERIFIED_AT,
    source: 'https://financnisprava.gov.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby',
    unverified: true,
    note: 'Three-year holding test for securities (five years for business stakes). The 40M CZK annual cap on the exemption was removed from 1 Jan 2026. Read the Finanční správa page for the scope.',
  },
  typicalTopSavingsRatePct: {
    value: 4.25,
    verifiedAt: VERIFIED_AT,
    source: CNB_RATES,
    unverified: true,
    note: 'Top of the market, above the ČNB average for household deposits. Changes continuously; never present as a product recommendation.',
  },
  typicalMortgageRatePct: {
    value: 4.5,
    verifiedAt: VERIFIED_AT,
    source: 'https://www.cbamonitor.cz/',
    unverified: true,
    note: 'ČBA Hypomonitor average for new loans (4,90 % when last read). Default suggestion only.',
  },
  statutoryRetirementAgeYears: {
    value: 65,
    verifiedAt: VERIFIED_AT,
    source: 'https://www.cssz.gov.cz/starobni-duchod-podrobne',
    unverified: true,
    note: 'ČSSZ: 65 for the 1965 cohort, then rising by birth year to 67 for anyone born after 1988. A single number cannot be right for every user — never state it as their retirement age.',
  },
  typicalConsumerLoanRatePct: {
    value: 9.5,
    verifiedAt: VERIFIED_AT,
    source: CNB_RATES,
    unverified: true,
    note: 'ČNB harmonised statistics, table B4 — new business in household consumer credit. Default suggestion only.',
  },
  typicalCreditCardRatePct: {
    value: 22.0,
    verifiedAt: VERIFIED_AT,
    source: CNB_RATES,
    unverified: true,
    note: 'ČNB harmonised statistics, table B4 — revolving credit and overdrafts. Default suggestion only.',
  },
  targetInvestingShareOfNetPct: {
    value: 12,
    verifiedAt: VERIFIED_AT,
    source: EC_AGEING_CZ,
    unverified: true,
    note: 'BENCHMARK, not a calculation. Czechia has no funded second pillar and no occupational scheme at all, so the entire funded provision is voluntary and unmatched — the US "15 % of gross including the employer match" cannot be applied here. Anchored instead on the first pillar replacing ~40 % of earnings long-run (EC 2024 Ageing Report, benefit ratio 42.7 % in 2022 falling to ~40 %), leaving a large self-funded gap. Expressed against NET income.',
  },
  cashComfortMonthsMax: {
    value: 6,
    verifiedAt: VERIFIED_AT,
    source: VANGUARD_CASH,
    unverified: true,
    note: 'Above this, held cash reads as an allocation mistake rather than prudence. Vanguard reads the conventional 3–6 months as three months in CASH plus the rest in accessible but INVESTED assets; Dimson-Marsh-Staunton put the equity-over-cash real premium at ~4.7 pp a year over 1900-2024 across 35 markets, which is the entire cost of getting this wrong.',
  },
  advisoryDebtServiceSharePct: {
    value: 35,
    verifiedAt: VERIFIED_AT,
    source: CNB_LIMITS,
    unverified: true,
    note: 'OUR OWN advisory figure, deliberately far below any regulatory number. ČNB\'s 45 % DSTI is deactivated and was in any case the point at which a bank must refuse the loan — a legal ceiling, never a household target.',
  },
  cannotFaceUnexpectedExpensePct: {
    value: 18.7,
    verifiedAt: VERIFIED_AT,
    source: EUROSTAT_UNEXPECTED,
    note: 'Eurostat EU-SILC ilc_mdes04, 2025: 18.7 % of Czech households cannot face an unexpected expense, against an EU-27 average of 29.2 %. Used only so the score can say "better than most households" and have it be true.',
  },
};
