import { czechia, slovakia, type JurisdictionCode } from '@wealthplanner/jurisdictions';
import type { ScenarioInput, YearMonth } from '@wealthplanner/engine';

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
 *   SK median mortgage ~100 000 EUR at ~3.5 %.
 */

export interface DefaultsMeta {
  incomeSource: string;
  mortgageSource: string;
}

export const DEFAULTS_META: Record<JurisdictionCode, DefaultsMeta> = {
  CZ: {
    incomeSource: 'https://csu.gov.cz/rychle-informace/prumerne-mzdy-1-ctvrtleti-2026',
    mortgageSource: 'https://www.cbamonitor.cz/',
  },
  SK: {
    incomeSource: 'https://www.finsider.sk/servis/cista-mzda-z-priemernej-mzdy/',
    mortgageSource: 'https://nbs.sk/',
  },
};

function czDefaults(start: YearMonth): ScenarioInput {
  return {
    jurisdiction: 'CZ',
    currency: 'CZK',
    leaveRegime: czechia.leave,
    assumptions: {
      start,
      horizonYear: start.year + 34,
      cpiPct: 2.5,
      reserveFloorMonths: 3,
    },
    people: [
      {
        id: 'p1',
        label: '',
        netMonthlyIncome: 39_000,
        incomeGrowthPct: 2,
        pocketMoney: 6_000,
        investments: [],
      },
      {
        id: 'p2',
        label: '',
        netMonthlyIncome: 39_000,
        incomeGrowthPct: 2,
        pocketMoney: 6_000,
        investments: [],
      },
    ],
    mortgages: [
      {
        id: 'm1',
        label: '',
        balance: 4_510_000,
        annualRatePct: 4.5,
        monthlyPayment: 24_200,
        rateResets: [],
      },
    ],
    expenses: [
      { id: 'utilities', label: '', monthlyAmount: 6_500, kind: 'fixed', inflates: true },
      { id: 'insurance', label: '', monthlyAmount: 1_200, kind: 'fixed', inflates: true },
      { id: 'groceries', label: '', monthlyAmount: 14_000, kind: 'fixed', inflates: true },
      { id: 'other', label: '', monthlyAmount: 8_000, kind: 'variable', inflates: true },
    ],
    reserve: { balance: 200_000, annualRatePct: 4, sweepCap: 600_000 },
    jointInvesting: { monthlyContribution: 5_000, annualReturnPct: 7, startingBalance: 0 },
    children: [],
    oneOffs: [],
    envelopes: [],
  };
}

function skDefaults(start: YearMonth): ScenarioInput {
  return {
    jurisdiction: 'SK',
    currency: 'EUR',
    leaveRegime: slovakia.leave,
    assumptions: {
      start,
      horizonYear: start.year + 34,
      cpiPct: 2.5,
      reserveFloorMonths: 3,
    },
    people: [
      {
        id: 'p1',
        label: '',
        netMonthlyIncome: 1_218,
        incomeGrowthPct: 2,
        pocketMoney: 150,
        investments: [],
      },
      {
        id: 'p2',
        label: '',
        netMonthlyIncome: 1_218,
        incomeGrowthPct: 2,
        pocketMoney: 150,
        investments: [],
      },
    ],
    mortgages: [
      {
        id: 'm1',
        label: '',
        balance: 100_000,
        annualRatePct: 3.5,
        monthlyPayment: 500,
        rateResets: [],
      },
    ],
    expenses: [
      { id: 'utilities', label: '', monthlyAmount: 250, kind: 'fixed', inflates: true },
      { id: 'insurance', label: '', monthlyAmount: 40, kind: 'fixed', inflates: true },
      { id: 'groceries', label: '', monthlyAmount: 500, kind: 'fixed', inflates: true },
      { id: 'other', label: '', monthlyAmount: 250, kind: 'variable', inflates: true },
    ],
    reserve: { balance: 8_000, annualRatePct: 2, sweepCap: 25_000 },
    jointInvesting: { monthlyContribution: 200, annualReturnPct: 7, startingBalance: 0 },
    children: [],
    oneOffs: [],
    envelopes: [],
  };
}

export function defaultScenario(jurisdiction: JurisdictionCode, start: YearMonth): ScenarioInput {
  return jurisdiction === 'SK' ? skDefaults(start) : czDefaults(start);
}

/**
 * The demo the landing page shows: the same national-average household, plus a child in
 * three years. That single addition is what turns a comfortable projection into a cash
 * trough, which is the entire point the product is making.
 */
export function demoScenario(jurisdiction: JurisdictionCode, start: YearMonth): ScenarioInput {
  const base = defaultScenario(jurisdiction, start);
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
        leaveTakenBy: 'p2',
        leavePlan: { parentalMonths: 24, returnToWorkPct: 100 },
      },
    ],
  };
}

/** Reattaches the non-serialisable leave regime after loading a scenario from storage. */
export function withRegime(input: ScenarioInput): ScenarioInput {
  const jurisdiction = input.jurisdiction === 'SK' ? slovakia : czechia;
  return { ...input, leaveRegime: jurisdiction.leave, currency: jurisdiction.currency };
}
