import type { CashAccount, InvestmentSleeve, ScenarioInput } from '@wealthplanner/engine';

/**
 * The one place that maps what a household actually has — several accounts, several
 * investments, each with its own rate — onto what the engine models.
 *
 * Why a mapping instead of generalising the engine: the engine's two investment concepts are
 * not interchangeable, and collapsing them would break the product's central claim.
 *
 *   - `jointInvesting` is the throttled household contribution. When cash runs short the model
 *     pauses THIS, and it is where the reserve's overflow is swept. There can only be one such
 *     pot, because "what gets paused first" is an ordering, not a set.
 *   - sleeves are additional pots. Each already has its own return, balance and contribution,
 *     which is exactly what a second investment with a different expected return needs.
 *
 * So pot 0 is `jointInvesting` and pots 1..n are sleeves on the first person, marked as not
 * funded from pocket money so they are a real extra outflow rather than capped by an
 * allowance. That coupling is deliberate, it is the only place it exists, and it is tested.
 */

export interface Pot {
  id: string;
  label: string;
  /** What is in it today. */
  balance: number;
  /** Expected annual return, percent. One number per pot — never a rate AND a return. */
  annualReturnPct: number;
  monthlyContribution: number;
  /**
   * True for pot 0 only: the one the model pauses when cash is short, and the one the
   * reserve's overflow is swept into. The UI says so rather than leaving it implicit.
   */
  primary: boolean;
}

const POT_PREFIX = 'pot';

export function readPots(scenario: ScenarioInput): Pot[] {
  const first = scenario.people[0];
  const extra = (first?.investments ?? []).filter((sleeve) => !sleeve.fundedFromPocketMoney);
  return [
    {
      id: 'primary',
      label: scenario.jointInvesting.label ?? '',
      balance: scenario.jointInvesting.startingBalance,
      annualReturnPct: scenario.jointInvesting.annualReturnPct,
      monthlyContribution: scenario.jointInvesting.monthlyContribution,
      primary: true,
    },
    ...extra.map((sleeve) => ({
      id: sleeve.id,
      label: sleeve.label,
      balance: sleeve.startingBalance,
      annualReturnPct: sleeve.annualReturnPct,
      monthlyContribution: sleeve.monthlyContribution,
      primary: false,
    })),
  ];
}

export function writePots(scenario: ScenarioInput, pots: Pot[]): ScenarioInput {
  const primary = pots.find((pot) => pot.primary) ?? {
    label: '',
    balance: 0,
    annualReturnPct: scenario.jointInvesting.annualReturnPct,
    monthlyContribution: 0,
  };
  const first = scenario.people[0];
  /* Pocket-money sleeves are a different feature and are left exactly as they were. */
  const pocketSleeves = (first?.investments ?? []).filter((sleeve) => sleeve.fundedFromPocketMoney);
  const extra: InvestmentSleeve[] = pots
    .filter((pot) => !pot.primary)
    .map((pot) => ({
      id: pot.id,
      label: pot.label,
      monthlyContribution: pot.monthlyContribution,
      annualReturnPct: pot.annualReturnPct,
      startingBalance: pot.balance,
      fundedFromPocketMoney: false,
    }));

  return {
    ...scenario,
    jointInvesting: {
      ...scenario.jointInvesting,
      label: primary.label,
      startingBalance: primary.balance,
      annualReturnPct: primary.annualReturnPct,
      monthlyContribution: primary.monthlyContribution,
    },
    people: scenario.people.map((person, index) =>
      index === 0 ? { ...person, investments: [...pocketSleeves, ...extra] } : person,
    ),
  };
}

export function newPot(scenario: ScenarioInput, existing: Pot[]): Pot {
  return {
    id: `${POT_PREFIX}${existing.length + 1}-${scenario.people[0]?.id ?? 'p1'}`,
    label: '',
    balance: 0,
    annualReturnPct: 7,
    monthlyContribution: scenario.currency === 'CZK' ? 2_000 : 100,
    primary: false,
  };
}

/* ------------------------------------------------------------------ cash ---- */

export function readAccounts(scenario: ScenarioInput): CashAccount[] {
  const accounts = scenario.reserve.accounts;
  /* An explicitly empty list is an answer — "we hold no cash" — and stays empty. */
  if (accounts) return accounts;
  /* A plan that only carries a total still has to edit as one account. */
  return [
    {
      id: 'cash1',
      label: '',
      amount: scenario.reserve.balance,
      annualRatePct: scenario.reserve.annualRatePct,
    },
  ];
}

/**
 * The aggregate the engine actually uses. The rate is balance-weighted, so at the first month
 * the interest is exactly the sum of the accounts' interest.
 *
 * It drifts slightly over the projection, because a higher-rate account would in reality grow
 * faster and shift the mix — the same order of approximation as the engine's documented
 * `annual / 12` compounding, and stated here rather than hidden.
 */
export function aggregateAccounts(accounts: CashAccount[]): {
  balance: number;
  annualRatePct: number;
} {
  const balance = accounts.reduce((sum, account) => sum + account.amount, 0);
  if (balance <= 0) {
    /* No money means no meaningful blend; keep the best rate on offer for when it is funded. */
    const best = accounts.reduce((max, account) => Math.max(max, account.annualRatePct), 0);
    return { balance, annualRatePct: best };
  }
  const weighted = accounts.reduce(
    (sum, account) => sum + account.amount * account.annualRatePct,
    0,
  );
  return { balance, annualRatePct: Math.round((weighted / balance) * 1000) / 1000 };
}

export function writeAccounts(scenario: ScenarioInput, accounts: CashAccount[]): ScenarioInput {
  const { balance, annualRatePct } = aggregateAccounts(accounts);
  return { ...scenario, reserve: { ...scenario.reserve, balance, annualRatePct, accounts } };
}

export function newAccount(existing: CashAccount[]): CashAccount {
  return {
    id: `cash${existing.length + 1}`,
    label: '',
    amount: 0,
    /* A current account earns nothing, and that is the commonest second account there is. */
    annualRatePct: 0,
  };
}
