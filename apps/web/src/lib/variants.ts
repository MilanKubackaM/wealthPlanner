import { simulate, type Mortgage, type ProjectionResult, type ScenarioInput } from '@wealthplanner/engine';
import { defaultMortgage, defaultRent } from './defaults';

/**
 * Scenario variants and sensitivity runs. Both are just "simulate the same household with one
 * thing changed", which at 0.9 ms a run costs nothing — a whole comparison is under 10 ms.
 *
 * Comparison is the product's actual verb: a single projection is a curiosity, two are a
 * decision. Sensitivity is the honest answer to "what if the model is wrong" — a tool that
 * volunteers its own fragility is more trustworthy than one that draws a single confident line.
 */

export interface Variant {
  key: string;
  /** Message key suffix, or an explicit label the caller resolves. */
  labelKey: string;
  labelValues?: Record<string, string | number>;
  scenario: ScenarioInput;
  result: ProjectionResult;
}

function withoutChildren(input: ScenarioInput): ScenarioInput {
  return { ...input, children: [] };
}

function withChildBornIn(input: ScenarioInput, year: number): ScenarioInput {
  const template = input.children[0];
  const base = template ?? {
    id: 'cmp',
    label: '',
    birth: { year, month: input.assumptions.start.month },
    monthlyCost: input.currency === 'CZK' ? 6_000 : 250,
    costUntilAgeYears: 22,
    costTaperYears: 3,
    /* Never fabricate a person id: an unassigned leave is a critical problem, not a default. */
    leaveTakenBy: input.people[1]?.id ?? input.people[0]?.id ?? '',
    leavePlan: { parentalMonths: 24, returnToWorkPct: 100 },
  };
  return {
    ...input,
    children: [{ ...base, id: `cmp-${year}`, birth: { ...base.birth, year } }],
  };
}

/** Maps over the mortgages of an owning household; a renter is returned untouched. */
function mapMortgages(input: ScenarioInput, fn: (m: Mortgage) => Mortgage): ScenarioInput['housing'] {
  if (input.housing.kind !== 'own') return input.housing;
  return { kind: 'own', mortgages: input.housing.mortgages.map(fn) };
}

/**
 * Three columns that answer the product's question directly: the plan without a child, the
 * plan as entered, and the plan with the child a few years later.
 *
 * Unless the household has said it does not want children — in which case inventing two is
 * worse than useless. Before `childrenIntent` existed this branch fired unconditionally, so
 * a user who had just answered "no" was shown three columns about a child and a button
 * offering to adopt one.
 */
export function comparisonVariants(input: ScenarioInput): Variant[] {
  const startYear = input.assumptions.start.year;
  const first = input.children[0];
  const out: Variant[] = [];

  if (input.childrenIntent === 'no' && !first) return childFreeVariants(input);

  const noChild = withoutChildren(input);
  out.push({
    key: 'noChild',
    labelKey: 'compare.noChild',
    scenario: noChild,
    result: simulate(noChild),
  });

  if (first) {
    out.push({
      key: 'current',
      labelKey: 'compare.childIn',
      labelValues: { year: first.birth.year },
      scenario: input,
      result: simulate(input),
    });
    const later = withChildBornIn(input, first.birth.year + 3);
    out.push({
      key: 'later',
      labelKey: 'compare.childIn',
      labelValues: { year: first.birth.year + 3 },
      scenario: later,
      result: simulate(later),
    });
  } else {
    for (const offset of [2, 5]) {
      const variant = withChildBornIn(input, startYear + offset);
      out.push({
        key: `in${offset}`,
        labelKey: 'compare.childIn',
        labelValues: { year: startYear + offset },
        scenario: variant,
        result: simulate(variant),
      });
    }
  }

  return out;
}

/**
 * The child-free household's three columns. The two substitutes are the other decisions this
 * model can actually settle: how much goes in every month, and whether to rent or to own.
 */
function childFreeVariants(input: ScenarioInput): Variant[] {
  const out: Variant[] = [
    { key: 'current', labelKey: 'compare.asEntered', scenario: input, result: simulate(input) },
  ];

  const investMore: ScenarioInput = {
    ...input,
    jointInvesting: {
      ...input.jointInvesting,
      monthlyContribution: Math.round(input.jointInvesting.monthlyContribution * 1.5),
    },
  };
  out.push({
    key: 'investMore',
    labelKey: 'compare.investMore',
    scenario: investMore,
    result: simulate(investMore),
  });

  const size = input.people.length === 1 ? 1 : 2;
  const flipped: ScenarioInput =
    input.housing.kind === 'own'
      ? { ...input, housing: defaultRent(input.jurisdiction, size) }
      : { ...input, housing: defaultMortgage(input.jurisdiction, size) };
  out.push({
    key: 'housingFlip',
    labelKey: input.housing.kind === 'own' ? 'compare.ifRenting' : 'compare.ifOwning',
    scenario: flipped,
    result: simulate(flipped),
  });

  return out;
}

export interface SensitivityRow {
  key: string;
  labelKey: string;
  result: ProjectionResult;
}

/** One changed assumption per row, each a full re-simulation. */
export function sensitivityRows(input: ScenarioInput): SensitivityRow[] {
  const rows: Array<{ key: string; scenario: ScenarioInput }> = [
    { key: 'base', scenario: input },
    {
      key: 'returnDown',
      scenario: {
        ...input,
        jointInvesting: {
          ...input.jointInvesting,
          annualReturnPct: input.jointInvesting.annualReturnPct - 1,
        },
      },
    },
    {
      key: 'cpiUp',
      scenario: {
        ...input,
        assumptions: { ...input.assumptions, cpiPct: input.assumptions.cpiPct + 2 },
      },
    },
    /*
     * The housing shock has to match the housing. A mortgage rate shock is a no-op for a
     * renter, and a table of identical rows is exactly the failure this panel was built to
     * avoid — it happened once already, with three rows showing the same trough.
     */
    input.housing.kind === 'own'
      ? {
          key: 'rateUp',
          scenario: {
            ...input,
            housing: mapMortgages(input, (m) => ({
              ...m,
              annualRatePct: m.annualRatePct + 1,
              /* A refixation already in the plan gets the same shock, or it would mask it. */
              rateResets: m.rateResets.map((r) => ({
                ...r,
                newAnnualRatePct: r.newAnnualRatePct + 1,
              })),
            })),
          },
        }
      : {
          key: 'rentUp',
          scenario: {
            ...input,
            housing: {
              kind: 'rent',
              rent: {
                ...input.housing.rent,
                annualIndexationPct: input.housing.rent.annualIndexationPct + 2,
              },
            },
          },
        },
    {
      key: 'incomeDown',
      scenario: {
        ...input,
        people: input.people.map((p, i) =>
          i === input.people.length - 1
            ? { ...p, netMonthlyIncome: p.netMonthlyIncome * 0.7 }
            : p,
        ),
      },
    },
    {
      key: 'reserveRateDown',
      scenario: {
        ...input,
        reserve: {
          ...input.reserve,
          annualRatePct: Math.max(0, input.reserve.annualRatePct - 2),
        },
      },
    },
  ];

  if (input.liabilities.length > 0) {
    rows.push({
      key: 'liabilityRateUp',
      scenario: {
        ...input,
        liabilities: input.liabilities.map((l) => ({ ...l, annualRatePct: l.annualRatePct + 3 })),
      },
    });
  }

  return rows.map(({ key, scenario }) => ({
    key,
    /*
     * "One income 30 % lower" is a lie to a household with one income — for them it is THE
     * income, and the row deserves to say so.
     */
    labelKey:
      key === 'incomeDown' && input.people.length === 1
        ? 'sensitivity.incomeDownSingle'
        : `sensitivity.${key}`,
    result: simulate(scenario),
  }));
}
