import { czechia, slovakia } from '@wealthplanner/jurisdictions';
import type { ScenarioInput } from '@wealthplanner/engine';

/**
 * Fixtures use round, plausible, INVENTED figures. No real household's numbers appear
 * here — the prototype shipped a real family's balances as HTML default values, which is
 * exactly the mistake this package exists to avoid repeating.
 */

const START = { year: 2026, month: 8 }; // September 2026

export function czCoupleWithMortgage(): ScenarioInput {
  return {
    jurisdiction: 'CZ',
    currency: 'CZK',
    leaveRegime: czechia.leave,
    assumptions: {
      start: START,
      horizonYear: 2060,
      cpiPct: 2.5,
      reserveFloorMonths: 3,
    },
    people: [
      {
        id: 'a',
        label: 'A',
        netMonthlyIncome: 60_000,
        incomeGrowthPct: 2,
        pocketMoney: 10_000,
        birthYear: 1991,
        investments: [
          {
            id: 'a-etf',
            label: 'ETF',
            monthlyContribution: 3_000,
            annualReturnPct: 7,
            startingBalance: 100_000,
            fundedFromPocketMoney: true,
          },
        ],
      },
      {
        id: 'b',
        label: 'B',
        netMonthlyIncome: 45_000,
        incomeGrowthPct: 2,
        pocketMoney: 10_000,
        birthYear: 1993,
        investments: [
          {
            id: 'b-etf',
            label: 'ETF',
            monthlyContribution: 2_000,
            annualReturnPct: 7,
            startingBalance: 50_000,
            fundedFromPocketMoney: true,
          },
        ],
      },
    ],
    housing: {
      kind: 'own',
      mortgages: [
        {
          id: 'm1',
          label: 'Mortgage',
          balance: 4_500_000,
          annualRatePct: 4.5,
          monthlyPayment: 24_000,
          rateResets: [],
        },
      ],
    },
    liabilities: [],
    expenses: [
      { id: 'utilities', label: 'Utilities', monthlyAmount: 8_000, kind: 'fixed', inflates: true },
      { id: 'insurance', label: 'Insurance', monthlyAmount: 1_500, kind: 'fixed', inflates: true },
      { id: 'groceries', label: 'Groceries', monthlyAmount: 22_000, kind: 'fixed', inflates: true },
      { id: 'leisure', label: 'Leisure', monthlyAmount: 12_000, kind: 'variable', inflates: true },
    ],
    reserve: { balance: 400_000, annualRatePct: 4, sweepCap: 900_000 },
    jointInvesting: { monthlyContribution: 10_000, annualReturnPct: 7, startingBalance: 0 },
    children: [],
    childrenIntent: 'undecided',
    oneOffs: [],
    envelopes: [],
  };
}

export function czCoupleWithChild(): ScenarioInput {
  const base = czCoupleWithMortgage();
  return {
    ...base,
    children: [
      {
        id: 'c1',
        label: 'First child',
        birth: { year: 2029, month: 6 },
        monthlyCost: 6_000,
        costUntilAgeYears: 22,
        costTaperYears: 3,
        leaveTakenBy: 'b',
        leavePlan: { parentalMonths: 24, returnToWorkPct: 100 },
      },
    ],
    childrenIntent: 'yes',
  };
}

/** Two children whose leave windows overlap — the case the prototype got wrong. */
export function czCoupleWithOverlappingChildren(): ScenarioInput {
  const base = czCoupleWithChild();
  const first = base.children[0];
  if (!first) throw new Error('fixture invariant: expected one child');
  return {
    ...base,
    children: [
      first,
      {
        ...first,
        id: 'c2',
        label: 'Second child',
        birth: { year: 2030, month: 6 },
        leavePlan: { parentalMonths: 24, returnToWorkPct: 80 },
      },
    ],
  };
}

/** A household that cannot sustain its plan — used to exercise the recommendation search. */
export function czCoupleUnderStress(): ScenarioInput {
  const base = czCoupleWithChild();
  return {
    ...base,
    jointInvesting: { ...base.jointInvesting, monthlyContribution: 14_000 },
  };
}

export function skCoupleWithChild(): ScenarioInput {
  return {
    jurisdiction: 'SK',
    currency: 'EUR',
    leaveRegime: slovakia.leave,
    assumptions: { start: START, horizonYear: 2060, cpiPct: 2.5, reserveFloorMonths: 3 },
    people: [
      {
        id: 'a',
        label: 'A',
        netMonthlyIncome: 2_000,
        incomeGrowthPct: 2,
        pocketMoney: 300,
        birthYear: 1990,
        investments: [],
      },
      {
        id: 'b',
        label: 'B',
        netMonthlyIncome: 1_600,
        incomeGrowthPct: 2,
        pocketMoney: 300,
        birthYear: 1992,
        investments: [],
      },
    ],
    housing: {
      kind: 'own',
      mortgages: [
        {
          id: 'm1',
          label: 'Mortgage',
          balance: 140_000,
          annualRatePct: 3.5,
          monthlyPayment: 700,
          rateResets: [{ at: { year: 2031, month: 0 }, newAnnualRatePct: 4.5 }],
        },
      ],
    },
    liabilities: [],
    expenses: [
      { id: 'utilities', label: 'Utilities', monthlyAmount: 250, kind: 'fixed', inflates: true },
      { id: 'groceries', label: 'Groceries', monthlyAmount: 500, kind: 'fixed', inflates: true },
      { id: 'leisure', label: 'Leisure', monthlyAmount: 250, kind: 'variable', inflates: true },
    ],
    reserve: { balance: 12_000, annualRatePct: 2, sweepCap: 25_000 },
    jointInvesting: { monthlyContribution: 300, annualReturnPct: 7, startingBalance: 0 },
    children: [
      {
        id: 'c1',
        label: 'First child',
        birth: { year: 2029, month: 3 },
        monthlyCost: 250,
        costUntilAgeYears: 22,
        costTaperYears: 3,
        leaveTakenBy: 'b',
        leavePlan: { parentalMonths: 24, returnToWorkPct: 100 },
      },
    ],
    childrenIntent: 'yes',
    oneOffs: [],
    envelopes: [],
  };
}

/** Degenerate: no income at all. Must not crash or produce NaN. */
export function zeroIncomeHousehold(): ScenarioInput {
  const base = czCoupleWithMortgage();
  return {
    ...base,
    people: base.people.map((p) => ({ ...p, netMonthlyIncome: 0, investments: [] })),
    jointInvesting: { ...base.jointInvesting, monthlyContribution: 0 },
  };
}

/** Degenerate: mortgage already repaid, no children, nothing to do. */
export function paidOffNoChildren(): ScenarioInput {
  const base = czCoupleWithMortgage();
  /* `own` with no mortgage is "owns outright" — a real household, and not the same as renting. */
  return { ...base, housing: { kind: 'own', mortgages: [] }, childrenIntent: 'no' };
}

/**
 * One adult, one child. NOT the couple minus a person: a naive splice of the couple fixture
 * keeps a two-income mortgage and produces a −24M absurdity with zero available fixes, which
 * teaches nothing. This household is solvent but tight, which is the interesting case.
 */
export function czSingleWithChild(): ScenarioInput {
  const base = czCoupleWithMortgage();
  const first = base.people[0];
  if (!first) throw new Error('fixture invariant: expected a person');
  return {
    ...base,
    /*
     * One income, and everything scaled to it: a lone parent underwritten for a 3.1M
     * mortgage is not a tight household, it is an impossible one, and a fixture that is
     * permanently insolvent gives the recommender nothing to find. Income growth is 3 %
     * here rather than the couple's 2 % so that a single earner is not slowly overtaken by
     * a 2.5 % CPI — otherwise every long-horizon single fixture ends in the same
     * arithmetic insolvency and stops testing anything about leave.
     */
    people: [{ ...first, incomeGrowthPct: 3, pocketMoney: 4_000, investments: [] }],
    housing: {
      kind: 'own',
      mortgages: [
        {
          id: 'm1',
          label: 'Mortgage',
          balance: 1_900_000,
          annualRatePct: 4.5,
          monthlyPayment: 10_500,
          rateResets: [],
        },
      ],
    },
    expenses: [
      { id: 'utilities', label: 'Utilities', monthlyAmount: 5_000, kind: 'fixed', inflates: true },
      { id: 'insurance', label: 'Insurance', monthlyAmount: 800, kind: 'fixed', inflates: true },
      { id: 'groceries', label: 'Groceries', monthlyAmount: 9_000, kind: 'fixed', inflates: true },
      { id: 'leisure', label: 'Leisure', monthlyAmount: 5_000, kind: 'variable', inflates: true },
    ],
    /*
     * Calibrated, not guessed: this household saves steadily for three years, hits the sweep
     * cap, and is then tipped into a shallow deficit by a 24-month leave — which is the shape
     * the recommender is meant to fix (cheapest verified fix: 24 → 21 months).
     */
    reserve: { balance: 300_000, annualRatePct: 4, sweepCap: 700_000 },
    jointInvesting: { monthlyContribution: 6_000, annualReturnPct: 7, startingBalance: 0 },
    children: [
      {
        id: 'c1',
        label: 'First child',
        birth: { year: 2029, month: 6 },
        monthlyCost: 6_000,
        costUntilAgeYears: 22,
        costTaperYears: 3,
        leaveTakenBy: 'a',
        /* A lone parent: the flag that finally has a setter, and it changes SK maternity. */
        leavePlan: { parentalMonths: 24, returnToWorkPct: 100, singleParent: true },
      },
    ],
    childrenIntent: 'yes',
  };
}

/** A renting couple. Rent must raise the floor, index by its own escalator, and never be an asset. */
export function czCoupleRenting(): ScenarioInput {
  const base = czCoupleWithMortgage();
  return {
    ...base,
    people: base.people.map((p) => ({ ...p, incomeGrowthPct: 3 })),
    housing: {
      kind: 'rent',
      rent: {
        id: 'r1',
        label: 'Rent',
        monthlyAmount: 26_000,
        /* Above every income's growth rate on purpose: this is the fixture that must make
         * housing-cost-outgrowing-income fire. */
        annualIndexationPct: 3.5,
        countsTowardReserveFloor: true,
      },
    },
    reserve: { balance: 300_000, annualRatePct: 4, sweepCap: 800_000 },
  };
}

/** The household this refactor exists for: one adult, renting, with a car loan. */
export function czSingleRentingWithCarLoan(): ScenarioInput {
  const base = czSingleWithChild();
  return {
    ...base,
    housing: {
      kind: 'rent',
      rent: {
        id: 'r1',
        label: 'Rent',
        monthlyAmount: 12_500,
        annualIndexationPct: 3.5,
        countsTowardReserveFloor: true,
      },
    },
    liabilities: [
      {
        id: 'l1',
        label: 'Car loan',
        kind: 'car-loan',
        balance: 240_000,
        /* Above the 7 % assumed return, so this fixture exercises liability-rate-exceeds-return. */
        annualRatePct: 8.9,
        monthlyPayment: 5_200,
        remainingTermMonths: 52,
        revolving: false,
      },
    ],
  };
}

export const ALL_FIXTURES = {
  czCoupleWithMortgage,
  czCoupleWithChild,
  czCoupleWithOverlappingChildren,
  czCoupleUnderStress,
  skCoupleWithChild,
  zeroIncomeHousehold,
  paidOffNoChildren,
  czSingleWithChild,
  czCoupleRenting,
  czSingleRentingWithCarLoan,
} as const;

export type FixtureName = keyof typeof ALL_FIXTURES;
