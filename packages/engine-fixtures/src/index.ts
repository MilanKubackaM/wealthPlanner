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
    expenses: [
      { id: 'utilities', label: 'Utilities', monthlyAmount: 8_000, kind: 'fixed', inflates: true },
      { id: 'insurance', label: 'Insurance', monthlyAmount: 1_500, kind: 'fixed', inflates: true },
      { id: 'groceries', label: 'Groceries', monthlyAmount: 22_000, kind: 'fixed', inflates: true },
      { id: 'leisure', label: 'Leisure', monthlyAmount: 12_000, kind: 'variable', inflates: true },
    ],
    reserve: { balance: 400_000, annualRatePct: 4, sweepCap: 900_000 },
    jointInvesting: { monthlyContribution: 10_000, annualReturnPct: 7, startingBalance: 0 },
    children: [],
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
        investments: [],
      },
      {
        id: 'b',
        label: 'B',
        netMonthlyIncome: 1_600,
        incomeGrowthPct: 2,
        pocketMoney: 300,
        investments: [],
      },
    ],
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
  return { ...base, mortgages: [] };
}

export const ALL_FIXTURES = {
  czCoupleWithMortgage,
  czCoupleWithChild,
  czCoupleWithOverlappingChildren,
  czCoupleUnderStress,
  skCoupleWithChild,
  zeroIncomeHousehold,
  paidOffNoChildren,
} as const;

export type FixtureName = keyof typeof ALL_FIXTURES;
