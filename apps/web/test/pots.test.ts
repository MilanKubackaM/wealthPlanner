import { describe, expect, it } from 'vitest';
import { simulate } from '@wealthplanner/engine';
import { defaultScenario } from '../src/lib/defaults';
import {
  aggregateAccounts,
  newAccount,
  newPot,
  readAccounts,
  readPots,
  writeAccounts,
  writePots,
} from '../src/lib/pots';

const START = { year: 2026, month: 8 };

/**
 * This file guards the one deliberate piece of coupling in the app: a household's several
 * accounts and several investments are mapped onto the engine's single reserve and its two
 * investment concepts. If that mapping drifts, a plan silently computes something other than
 * what the user sees on screen — so every property of it is asserted here.
 */
describe('cash accounts', () => {
  it('reads a single account out of a plan that only carries a total', () => {
    const scenario = defaultScenario('CZ', START);
    const bare = { ...scenario, reserve: { ...scenario.reserve, accounts: undefined } };
    const accounts = readAccounts(bare);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.amount).toBe(scenario.reserve.balance);
    expect(accounts[0]?.annualRatePct).toBe(scenario.reserve.annualRatePct);
  });

  it('weights the blended rate by balance, so month one earns exactly what the accounts earn', () => {
    const accounts = [
      { id: 'a', label: 'Current', amount: 100_000, annualRatePct: 0 },
      { id: 'b', label: 'Savings', amount: 300_000, annualRatePct: 4 },
    ];
    const { balance, annualRatePct } = aggregateAccounts(accounts);
    expect(balance).toBe(400_000);
    expect(annualRatePct).toBe(3);
    /* The blend is only worth having if the interest matches. */
    const perAccount = accounts.reduce((sum, a) => sum + (a.amount * a.annualRatePct) / 100 / 12, 0);
    expect((balance * annualRatePct) / 100 / 12).toBeCloseTo(perAccount, 9);
  });

  it('keeps the best rate on offer when every account is empty', () => {
    const { balance, annualRatePct } = aggregateAccounts([
      { id: 'a', label: '', amount: 0, annualRatePct: 0 },
      { id: 'b', label: '', amount: 0, annualRatePct: 4.5 },
    ]);
    expect(balance).toBe(0);
    expect(annualRatePct).toBe(4.5);
  });

  it('survives having no accounts at all — an empty reserve is a real starting point', () => {
    const scenario = writeAccounts(defaultScenario('CZ', START), []);
    expect(scenario.reserve.balance).toBe(0);
    const result = simulate(scenario);
    expect(Number.isFinite(result.minReserve)).toBe(true);
  });

  it('writes the aggregate the engine reads, and keeps the breakdown beside it', () => {
    const base = defaultScenario('SK', START);
    const next = writeAccounts(base, [
      ...readAccounts(base),
      { ...newAccount(readAccounts(base)), amount: 3_500, annualRatePct: 0 },
    ]);
    expect(next.reserve.accounts).toHaveLength(2);
    expect(next.reserve.balance).toBe(base.reserve.balance + 3_500);
    expect(next.reserve.annualRatePct).toBeLessThan(base.reserve.annualRatePct);
  });
});

describe('investment pots', () => {
  it('maps the first pot onto the throttled household contribution', () => {
    const base = defaultScenario('CZ', START);
    const pots = readPots(base);
    expect(pots).toHaveLength(1);
    expect(pots[0]?.primary).toBe(true);
    expect(pots[0]?.monthlyContribution).toBe(base.jointInvesting.monthlyContribution);
  });

  it('round-trips several pots with different returns', () => {
    const base = defaultScenario('CZ', START);
    const pots = readPots(base);
    const extended = [
      { ...pots[0]!, monthlyContribution: 4_000, annualReturnPct: 6 },
      { ...newPot(base, pots), label: 'Crypto', balance: 50_000, annualReturnPct: 12, monthlyContribution: 1_000 },
    ];
    const next = writePots(base, extended);
    expect(next.jointInvesting.monthlyContribution).toBe(4_000);
    expect(next.jointInvesting.annualReturnPct).toBe(6);
    /* And back out again, unchanged. */
    const round = readPots(next);
    expect(round).toHaveLength(2);
    expect(round[1]?.annualReturnPct).toBe(12);
    expect(round[1]?.balance).toBe(50_000);
    expect(round[1]?.monthlyContribution).toBe(1_000);
  });

  it('makes an extra pot a real outflow rather than something capped by pocket money', () => {
    const base = defaultScenario('CZ', START);
    const next = writePots(base, [...readPots(base), newPot(base, readPots(base))]);
    const sleeve = next.people[0]?.investments[0];
    expect(sleeve?.fundedFromPocketMoney).toBe(false);
  });

  it('leaves pocket-money sleeves alone — they are a different feature', () => {
    const base = defaultScenario('CZ', START);
    const withPocket = {
      ...base,
      people: base.people.map((person, i) =>
        i === 0
          ? {
              ...person,
              investments: [
                {
                  id: 'mine',
                  label: 'Mine',
                  monthlyContribution: 1_000,
                  annualReturnPct: 7,
                  startingBalance: 0,
                  fundedFromPocketMoney: true,
                },
              ],
            }
          : person,
      ),
    };
    /* The pocket sleeve must not show up as a household pot… */
    expect(readPots(withPocket)).toHaveLength(1);
    /* …and must still be there after the household pots are rewritten. */
    const next = writePots(withPocket, readPots(withPocket));
    expect(next.people[0]?.investments.some((s) => s.fundedFromPocketMoney)).toBe(true);
  });

  it('lets the household invest in nothing at all', () => {
    const base = defaultScenario('CZ', START);
    const next = writePots(base, []);
    expect(next.jointInvesting.monthlyContribution).toBe(0);
    expect(simulate(next).pausedMonths).toBe(0);
  });

  it('actually changes the projection when a second pot is added', () => {
    const base = defaultScenario('CZ', START);
    const before = simulate(base).finalNetWorth;
    const next = writePots(base, [
      ...readPots(base),
      { ...newPot(base, readPots(base)), monthlyContribution: 3_000, annualReturnPct: 9 },
    ]);
    expect(simulate(next).finalNetWorth).not.toBeCloseTo(before, 2);
  });
});

describe('an explicitly empty list is an answer, not a missing value', () => {
  it('keeps zero accounts once the user has removed them all', () => {
    const base = defaultScenario('CZ', START);
    const emptied = writeAccounts(base, []);
    /* Not "fall back to one row showing the old total" — that would resurrect deleted data. */
    expect(readAccounts(emptied)).toHaveLength(0);
    expect(emptied.reserve.balance).toBe(0);
  });

  it('still offers one row to a plan that never had a breakdown', () => {
    const base = defaultScenario('CZ', START);
    const bare = { ...base, reserve: { ...base.reserve, accounts: undefined } };
    expect(readAccounts(bare)).toHaveLength(1);
  });
});
