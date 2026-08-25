import { czechia, slovakia, type JurisdictionCode } from '@wealthplanner/jurisdictions';
import type { Housing, ScenarioInput, YearMonth } from '@wealthplanner/engine';
import { upgradePlan } from './migrate';

/**
 * Starting values come from national averages, not from zeros. An empty field is a worse
 * default than an average: the user sees a working projection immediately and edits their
 * way towards the truth, instead of staring at a blank form deciding whether to bother.
 *
 * Sources, all shown to the user on /parametre:
 *   CZ average gross monthly wage Q1 2026: 50 282 CZK (ČSÚ). Net at that level is roughly
 *       78 %, so ~39 000 CZK.
 *   CZ average new mortgage 4.51M CZK, average payment ~24 200 CZK, average rate ~4.5 %
 *       (ČBA Hypomonitor).
 *   SK average gross monthly wage 2026: 1 620 EUR, net 1 218 EUR.
 *   SK mortgage: 130 000 EUR at ~3.5 % over 25 years, payment 650 EUR — see the note on
 *       `skDefaults` for why this is not the figure it used to be.
 *   Rent is a market figure with a ~3x spread between a capital city and a district town,
 *       so it is prefilled and prominently editable, exactly like income.
 */

export interface DefaultsMeta {
  incomeSource: string;
  mortgageSource: string;
  rentSource: string;
}

export const DEFAULTS_META: Record<JurisdictionCode, DefaultsMeta> = {
  CZ: {
    incomeSource: 'https://csu.gov.cz/rychle-informace/prumerne-mzdy-1-ctvrtleti-2026',
    mortgageSource: 'https://www.cbamonitor.cz/',
    rentSource: 'https://www.deloitte.com/cz/cs/issues/real-estate/property-index.html',
  },
  SK: {
    incomeSource: 'https://www.finsider.sk/servis/cista-mzda-z-priemernej-mzdy/',
    mortgageSource: 'https://nbs.sk/statisticke-udaje/',
    rentSource: 'https://www.nbs.sk/statisticke-udaje/vybrane-makroekonomicke-ukazovatele/ceny-nehnutelnosti-na-byvanie',
  },
};

/** One household, one or two adults. Everything downstream branches on this. */
export type HouseholdSize = 1 | 2;

/** The single mapping from a UI locale to a country. Was an inline ternary in three places, */
/** which is precisely how the third place (the restore path) came to be missing it. */
export function countryFor(locale: string): JurisdictionCode {
  return locale === 'sk' ? 'SK' : 'CZ';
}

/**
 * A single-person household is not a couple minus one person. Prefilling one adult with a
 * couple's groceries and a couple's mortgage produces a projection that is nonsense before
 * the user has typed anything.
 *
 * Base is the OECD-modified equivalence scale (a couple is 1.5 adult equivalents), with
 * fixed dwelling costs flattened because a flat's utilities do not halve with its occupancy.
 * ⚠️ These coefficients are ESTIMATES. They carry a verification date on /parametre for the
 * same reason every statutory constant does, and they must be checked against a primary
 * source (ČSÚ / ŠÚ SR household budget surveys) before launch.
 */
export const SINGLE_SCALE = {
  verifiedAt: '2026-08-24',
  unverified: true,
  source: 'https://www.oecd.org/economy/growth/OECD-Note-EquivalenceScales.pdf',
  factors: {
    groceries: 0.62,
    utilities: 0.75,
    insurance: 0.7,
    other: 0.7,
    /*
     * 0.4, not the equivalence scale's 0.67. Housing is the one line where the constraint is
     * not consumption but underwriting AGAINST ONE INCOME, and it is what a naive scale gets
     * badly wrong: a lone earner on the average wage prefilled with 70 % of an average
     * couple's mortgage is insolvent in month one, in both countries. Measured, not guessed.
     */
    mortgage: 0.4,
    rent: 0.6,
    reserve: 0.67,
    /* Discretionary spending is where a single income has least room, so it scales hardest. */
    pocket: 0.6,
    investing: 0.35,
    /* Income is already per person, so it is never scaled. */
    income: 1,
  },
} as const;

/** Rounds to something a human would have typed, so a scaled default never looks computed. */
function tidy(value: number, currency: 'CZK' | 'EUR', scale: 'monthly' | 'balance'): number {
  const step =
    currency === 'CZK' ? (scale === 'monthly' ? 100 : 10_000) : scale === 'monthly' ? 10 : 500;
  return Math.round(value / step) * step;
}

/**
 * The horizon is derived from age rather than pinned to a magic constant: a plan whose
 * horizon stops before the household stops earning answers a question nobody asked. With
 * the default birth year this lands on start.year + 33, one year off the old constant, so
 * no existing chart changes shape.
 */
function horizonFor(start: YearMonth, birthYear: number, retirementAge: number): number {
  return Math.max(birthYear + retirementAge, start.year + 25);
}

function czDefaults(start: YearMonth, size: HouseholdSize): ScenarioInput {
  const f = SINGLE_SCALE.factors;
  const solo = size === 1;
  const s = (value: number, factor: number, scale: 'monthly' | 'balance' = 'monthly') =>
    solo ? tidy(value * factor, 'CZK', scale) : value;
  const birthYear = start.year - 32;
  return {
    jurisdiction: 'CZ',
    currency: 'CZK',
    leaveRegime: czechia.leave,
    assumptions: {
      start,
      horizonYear: horizonFor(start, birthYear, czechia.statutoryRetirementAgeYears.value),
      cpiPct: 2.5,
      reserveFloorMonths: 3,
    },
    people: people(size, birthYear, 39_000, solo ? tidy(6_000 * f.pocket, 'CZK', 'monthly') : 6_000),
    housing: {
      kind: 'own',
      mortgages: [
        {
          id: 'm1',
          label: '',
          balance: s(4_510_000, f.mortgage, 'balance'),
          annualRatePct: czechia.typicalMortgageRatePct.value,
          monthlyPayment: s(24_200, f.mortgage),
          rateResets: [],
        },
      ],
    },
    liabilities: [],
    expenses: [
      { id: 'utilities', label: '', monthlyAmount: s(6_500, f.utilities), kind: 'fixed', inflates: true },
      { id: 'insurance', label: '', monthlyAmount: s(1_200, f.insurance), kind: 'fixed', inflates: true },
      { id: 'groceries', label: '', monthlyAmount: s(14_000, f.groceries), kind: 'fixed', inflates: true },
      { id: 'other', label: '', monthlyAmount: s(8_000, f.other), kind: 'variable', inflates: true },
    ],
    reserve: {
      balance: s(200_000, f.reserve, 'balance'),
      annualRatePct: 4,
      sweepCap: s(600_000, f.reserve, 'balance'),
    },
    jointInvesting: {
      monthlyContribution: s(5_000, f.investing),
      annualReturnPct: 7,
      startingBalance: 0,
    },
    children: [],
    childrenIntent: 'undecided',
    oneOffs: [],
    envelopes: [],
  };
}

/**
 * ⚠️ Two of these numbers changed on 2026-08-24, and the reason is worth recording.
 *
 * The old SK defaults described a household STRUCTURALLY more comfortable than its Czech
 * twin: a mortgage at DSTI 20.5 % and DTI 3.42x (against CZ's 31.0 % and 4.82x) and a cash
 * cushion worth 6.20 months of fixed outgoings with a sweep cap worth 19.38 (against CZ's
 * 4.36 and 13.07). The consequence was measurable: the Slovak landing demo never dipped at
 * all — `minReserve` stayed at the opening balance and the hero fell back to "the plan
 * holds", so the Slovak page could not demonstrate the one thing this product does.
 *
 * The replacements set DTI to 4.45x and restore the same cushion multiples the Czech
 * household has. Neither figure is a published statistic in either version — the old ones
 * cited only the bare NBS domain — so they are documented here as calibrated estimates, and
 * the incomes and expenses (which ARE sourced averages) were deliberately left alone.
 */
function skDefaults(start: YearMonth, size: HouseholdSize): ScenarioInput {
  const f = SINGLE_SCALE.factors;
  const solo = size === 1;
  const s = (value: number, factor: number, scale: 'monthly' | 'balance' = 'monthly') =>
    solo ? tidy(value * factor, 'EUR', scale) : value;
  const birthYear = start.year - 32;
  return {
    jurisdiction: 'SK',
    currency: 'EUR',
    leaveRegime: slovakia.leave,
    assumptions: {
      start,
      horizonYear: horizonFor(start, birthYear, slovakia.statutoryRetirementAgeYears.value),
      cpiPct: 2.5,
      reserveFloorMonths: 3,
    },
    people: people(size, birthYear, 1_218, solo ? tidy(150 * f.pocket, 'EUR', 'monthly') : 150),
    housing: {
      kind: 'own',
      mortgages: [
        {
          id: 'm1',
          label: '',
          /* 130 000 at 3.5 % over 25 years is 650/month, so the payoff year is unchanged. */
          balance: s(130_000, f.mortgage, 'balance'),
          annualRatePct: slovakia.typicalMortgageRatePct.value,
          monthlyPayment: s(650, f.mortgage),
          rateResets: [],
        },
      ],
    },
    liabilities: [],
    expenses: [
      { id: 'utilities', label: '', monthlyAmount: s(250, f.utilities), kind: 'fixed', inflates: true },
      { id: 'insurance', label: '', monthlyAmount: s(40, f.insurance), kind: 'fixed', inflates: true },
      { id: 'groceries', label: '', monthlyAmount: s(500, f.groceries), kind: 'fixed', inflates: true },
      { id: 'other', label: '', monthlyAmount: s(250, f.other), kind: 'variable', inflates: true },
    ],
    reserve: {
      /* 4.36 and 13.09 months of fixed outgoings — the same multiples as the CZ household. */
      balance: s(6_500, f.reserve, 'balance'),
      annualRatePct: 2,
      sweepCap: s(19_500, f.reserve, 'balance'),
    },
    jointInvesting: {
      monthlyContribution: s(200, f.investing),
      annualReturnPct: 7,
      startingBalance: 0,
    },
    children: [],
    childrenIntent: 'undecided',
    oneOffs: [],
    envelopes: [],
  };
}

function people(size: HouseholdSize, birthYear: number, income: number, pocket: number) {
  const one = {
    id: 'p1',
    label: '',
    netMonthlyIncome: income,
    incomeGrowthPct: 2,
    pocketMoney: pocket,
    birthYear,
    investments: [],
  };
  return size === 1 ? [one] : [one, { ...one, id: 'p2' }];
}

export function defaultScenario(
  jurisdiction: JurisdictionCode,
  start: YearMonth,
  size: HouseholdSize = 2,
): ScenarioInput {
  return jurisdiction === 'SK' ? skDefaults(start, size) : czDefaults(start, size);
}

/** The prefilled rent for a household that switches from owning to renting mid-wizard. */
export function defaultRent(jurisdiction: JurisdictionCode, size: HouseholdSize): Housing {
  const monthly = jurisdiction === 'SK' ? 600 : 17_000;
  const currency = jurisdiction === 'SK' ? 'EUR' : 'CZK';
  return {
    kind: 'rent',
    rent: {
      id: 'r1',
      label: '',
      monthlyAmount:
        size === 1 ? tidy(monthly * SINGLE_SCALE.factors.rent, currency, 'monthly') : monthly,
      /* Prefilled from the CPI assumption, but the user's own number from here on. */
      annualIndexationPct: 2.5,
      countsTowardReserveFloor: true,
    },
  };
}

/** The prefilled mortgage for a household that switches back from renting to owning. */
export function defaultMortgage(jurisdiction: JurisdictionCode, size: HouseholdSize): Housing {
  const base = defaultScenario(jurisdiction, { year: 2026, month: 0 }, size);
  return base.housing;
}

/**
 * The demo the landing page shows: the same national-average household, plus a child in
 * three years. That single addition is what turns a comfortable projection into a cash
 * trough, which is the entire point the product is making.
 */
export function demoScenario(jurisdiction: JurisdictionCode, start: YearMonth): ScenarioInput {
  const base = defaultScenario(jurisdiction, start, 2);
  return {
    ...base,
    children: [
      {
        id: 'c1',
        label: '',
        birth: { year: start.year + 3, month: start.month },
        monthlyCost: jurisdiction === 'SK' ? 250 : 6_000,
        costUntilAgeYears: 22,
        costTaperYears: 3,
        leaveTakenBy: base.people[1]?.id ?? base.people[0]?.id ?? 'p1',
        leavePlan: { parentalMonths: 24, returnToWorkPct: 100 },
      },
    ],
    childrenIntent: 'yes',
  };
}

/**
 * Reattaches the non-serialisable leave regime after loading a scenario from anywhere, and
 * upgrades its shape on the way through. The upgrade lives INSIDE this function on purpose:
 * three call sites hydrate a foreign scenario and any one of them could have forgotten it.
 */
export function withRegime(input: ScenarioInput): ScenarioInput {
  const jurisdiction = input.jurisdiction === 'SK' ? slovakia : czechia;
  return {
    ...upgradePlan(input),
    leaveRegime: jurisdiction.leave,
    currency: jurisdiction.currency,
  };
}
