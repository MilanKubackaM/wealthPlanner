import { simulate, type ProjectionResult, type ScenarioInput } from '@wealthplanner/engine';

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
    leaveTakenBy: input.people[1]?.id ?? input.people[0]?.id ?? 'p1',
    leavePlan: { parentalMonths: 24, returnToWorkPct: 100 },
  };
  return {
    ...input,
    children: [{ ...base, id: `cmp-${year}`, birth: { ...base.birth, year } }],
  };
}

/**
 * Three columns that answer the product's question directly: the plan without a child, the
 * plan as entered, and the plan with the child a few years later.
 */
export function comparisonVariants(input: ScenarioInput): Variant[] {
  const startYear = input.assumptions.start.year;
  const first = input.children[0];
  const out: Variant[] = [];

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
    {
      key: 'rateUp',
      scenario: {
        ...input,
        mortgages: input.mortgages.map((m) => ({
          ...m,
          annualRatePct: m.annualRatePct + 1,
          /* A refixation already in the plan gets the same shock, or it would mask it. */
          rateResets: m.rateResets.map((r) => ({
            ...r,
            newAnnualRatePct: r.newAnnualRatePct + 1,
          })),
        })),
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

  return rows.map(({ key, scenario }) => ({
    key,
    labelKey: `sensitivity.${key}`,
    result: simulate(scenario),
  }));
}
