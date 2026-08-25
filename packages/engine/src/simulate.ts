import type { LeavePhase } from '@wealthplanner/jurisdictions';
import { ENGINE_VERSION } from './version';
import { addMonths, growthFactor, monthlyRate, monthsBetween, toAbsolute } from './time';
import type {
  Child,
  MonthlyPoint,
  Mortgage,
  ProjectionResult,
  ScenarioInput,
  YearMonth,
  YearlyPoint,
} from './types';

interface LiabilityState {
  id: string;
  balance: number;
  annualRatePct: number;
  monthlyPayment: number;
}

interface MortgageState {
  id: string;
  balance: number;
  annualRatePct: number;
  monthlyPayment: number;
  appliedResets: Set<number>;
}

interface SleeveState {
  personId: string;
  id: string;
  balance: number;
  monthlyContribution: number;
  annualReturnPct: number;
  fundedFromPocketMoney: boolean;
}

/**
 * Order of operations inside one month, fixed and documented so that changing it is
 * a deliberate act with an engine-version bump:
 *
 *   1. grow incomes (per person) and expenses (CPI)
 *   2. resolve leave phases per person, taking the most favourable ACTIVE benefit and
 *      never falling back to full salary while any leave window is open
 *   3. amortise debts: mortgages (applying any rate reset effective this month), then
 *      every other liability by the same arithmetic minus the fixation
 *   4. accrue reserve interest on the OPENING balance, then apply net cash flow
 *   5. throttle the joint DCA to whatever cash is actually available
 *   6. sweep any reserve above the cap into joint investing
 *   7. grow investment balances
 *
 * Rent is deliberately NOT a step of its own. It has no balance, no interest, no fixation
 * and no payoff, so it is an expense: it joins `fixedExpenses`, which means it enters both
 * `spending` (ahead of the DCA throttle — a household does not skip rent to keep a standing
 * order) and the reserve floor, with no further edits. It indexes by its OWN escalator, not
 * by the CPI. It creates neither an asset nor a liability, so it cannot reach net worth
 * even by accident.
 *
 * Step 4 accrues interest before cash flow. This slightly overstates interest in
 * surplus months and understates it in deficit months; it matches the original
 * prototype and is kept for comparability.
 */
export function simulate(input: ScenarioInput): ProjectionResult {
  const { assumptions, reserve: reserveInput, jointInvesting, leaveRegime } = input;

  const start = assumptions.start;
  const lastMonthAbs = toAbsolute({ year: assumptions.horizonYear, month: 11 });
  const totalMonths = Math.max(1, lastMonthAbs - toAbsolute(start) + 1);

  /* Housing is a union; only the owning branch has anything to amortise. */
  const mortgageDefs: Mortgage[] = input.housing.kind === 'own' ? input.housing.mortgages : [];
  const rent = input.housing.kind === 'rent' ? input.housing.rent : null;

  const mortgages: MortgageState[] = mortgageDefs.map((m) => ({
    id: m.id,
    balance: m.balance,
    annualRatePct: m.annualRatePct,
    monthlyPayment: m.monthlyPayment,
    appliedResets: new Set<number>(),
  }));

  const liabilities: LiabilityState[] = input.liabilities.map((l) => ({
    id: l.id,
    balance: l.balance,
    annualRatePct: l.annualRatePct,
    monthlyPayment: l.monthlyPayment,
  }));

  const sleeves: SleeveState[] = [];
  for (const person of input.people) {
    for (const sleeve of person.investments) {
      sleeves.push({
        personId: person.id,
        id: sleeve.id,
        balance: sleeve.startingBalance,
        monthlyContribution: sleeve.monthlyContribution,
        annualReturnPct: sleeve.annualReturnPct,
        fundedFromPocketMoney: sleeve.fundedFromPocketMoney,
      });
    }
  }

  const childrenByPerson = new Map<string, Child[]>();
  for (const child of input.children) {
    const list = childrenByPerson.get(child.leaveTakenBy) ?? [];
    list.push(child);
    childrenByPerson.set(child.leaveTakenBy, list);
  }

  let reserve = reserveInput.balance;
  let joint = jointInvesting.startingBalance;
  const reserveMonthlyRate = monthlyRate(reserveInput.annualRatePct);
  const jointMonthlyRate = monthlyRate(jointInvesting.annualReturnPct);

  const monthly: MonthlyPoint[] = [];
  const yearly: YearlyPoint[] = [];

  let minReserve = reserve;
  let minReserveAt: YearMonth | null = null;
  let deficitAt: YearMonth | null = null;
  let pausedMonths = 0;
  let pausedAmount = 0;
  let pausedFrom: YearMonth | null = null;
  let mortgagePaidYear: number | null = null;
  let liabilitiesClearedYear: number | null = null;
  let foregoneIncome = 0;
  let worstFloorGap = Number.POSITIVE_INFINITY;
  let worstFloorGapAt: YearMonth | null = null;
  let floorAtWorst = 0;
  let fixedMonthlyOutgoings = 0;
  let reserveFloor = 0;

  for (let t = 0; t < totalMonths; t++) {
    const ym = addMonths(start, t);
    const cpiFactor = growthFactor(assumptions.cpiPct, t);

    /* ---- 1 + 2: income per person, with leave resolved ---- */
    let income = 0;
    const incomeByPerson: Record<string, number> = {};
    const phaseByPerson: Record<string, string> = {};

    for (const person of input.people) {
      const base = person.netMonthlyIncome * growthFactor(person.incomeGrowthPct, t);
      const kids = childrenByPerson.get(person.id) ?? [];

      let activeBest: LeavePhase | null = null;
      let anyWindowStillOpen = false;
      let lastEndingPlanReturnPct: number | null = null;
      let lastEndAbs = -Infinity;

      for (const child of kids) {
        const monthsSinceBirth = monthsBetween(child.birth, ym);
        const totalLeave = leaveRegime.totalLeaveMonths(child.leavePlan);
        const endAbs = toAbsolute(child.birth) + totalLeave;
        if (endAbs > lastEndAbs) {
          lastEndAbs = endAbs;
          lastEndingPlanReturnPct = child.leavePlan.returnToWorkPct;
        }
        if (toAbsolute(ym) < endAbs) anyWindowStillOpen = true;

        const phase = leaveRegime.incomeFor({
          monthsSinceBirth,
          baseNetIncome: base,
          plan: child.leavePlan,
        });
        if (phase) {
          /*
           * Overlapping windows must not overwrite one another — the prototype's bug.
           * A parent draws one benefit, so take the most favourable active one, and
           * never fall through to full salary while a window is open.
           */
          if (!activeBest || phase.income > activeBest.income) activeBest = phase;
        }
      }

      let personIncome: number;
      if (activeBest) {
        personIncome = activeBest.income;
        phaseByPerson[person.id] = activeBest.kind;
      } else if (kids.length > 0 && !anyWindowStillOpen && lastEndingPlanReturnPct !== null) {
        personIncome = (base * lastEndingPlanReturnPct) / 100;
        phaseByPerson[person.id] = 'work';
      } else {
        personIncome = base;
        phaseByPerson[person.id] = 'work';
      }

      foregoneIncome += Math.max(0, base - personIncome);
      incomeByPerson[person.id] = personIncome;
      income += personIncome;
    }

    /* ---- 3: mortgages ---- */
    let mortgagePayment = 0;
    let mortgageBalance = 0;
    for (const state of mortgages) {
      const def = mortgageDefs.find((m) => m.id === state.id);
      if (def) applyRateResets(state, def, ym);
      if (state.balance > 0) {
        const interest = (state.balance * state.annualRatePct) / 100 / 12;
        const pay = Math.min(state.monthlyPayment, state.balance + interest);
        state.balance = state.balance + interest - pay;
        mortgagePayment += pay;
        if (state.balance < 1) {
          state.balance = 0;
          if (mortgagePaidYear === null) mortgagePaidYear = ym.year;
        }
      }
      mortgageBalance += state.balance;
    }

    /*
     * ---- 3 (continued): every other debt ----
     * Same arithmetic as a mortgage, minus the fixation resets. Kept inside step 3 rather
     * than added as an eighth step: /metodika renders exactly seven steps from both message
     * catalogues, and this is definitionally the same operation as the line above it.
     */
    let liabilityPayment = 0;
    let liabilityBalance = 0;
    for (const state of liabilities) {
      if (state.balance > 0) {
        const interest = (state.balance * state.annualRatePct) / 100 / 12;
        const pay = Math.min(state.monthlyPayment, state.balance + interest);
        state.balance = state.balance + interest - pay;
        liabilityPayment += pay;
        if (state.balance < 1) state.balance = 0;
      }
      liabilityBalance += state.balance;
    }
    if (liabilityBalance === 0 && liabilitiesClearedYear === null && liabilities.length > 0) {
      liabilitiesClearedYear = ym.year;
    }

    /* ---- expenses, pocket money, child costs, one-offs ---- */
    let fixedExpenses = 0;
    let variableExpenses = 0;
    for (const e of input.expenses) {
      const amount = e.monthlyAmount * (e.inflates ? cpiFactor : 1);
      if (e.kind === 'fixed') fixedExpenses += amount;
      else variableExpenses += amount;
    }

    let rentPayment = 0;
    if (rent) {
      /* The lease's own escalator. growthFactor already handles the compounding. */
      rentPayment = rent.monthlyAmount * growthFactor(rent.annualIndexationPct, t);
      if (rent.countsTowardReserveFloor) fixedExpenses += rentPayment;
      else variableExpenses += rentPayment;
    }

    let pocketTotal = 0;
    for (const person of input.people) pocketTotal += person.pocketMoney * cpiFactor;

    let childCost = 0;
    for (const child of input.children) childCost += childCostFor(child, ym, cpiFactor);

    let oneOffIncome = 0;
    let oneOffExpense = 0;
    for (const o of input.oneOffs) {
      if (o.at.year === ym.year && o.at.month === ym.month) {
        if (o.amount >= 0) oneOffIncome += o.amount;
        else oneOffExpense += -o.amount;
      }
    }

    /*
     * Personal sleeves funded from pocket money are paid out of the allowance that is
     * already leaving the household, so they add no extra outflow — but they are capped
     * at the allowance. Sleeves not funded from pocket money are an extra outflow.
     */
    const pocketBudget = new Map<string, number>();
    for (const person of input.people) pocketBudget.set(person.id, person.pocketMoney * cpiFactor);
    let extraInvestingOutflow = 0;
    const sleeveContribution = new Map<string, number>();
    for (const sleeve of sleeves) {
      if (sleeve.fundedFromPocketMoney) {
        const left = pocketBudget.get(sleeve.personId) ?? 0;
        const applied = Math.max(0, Math.min(sleeve.monthlyContribution, left));
        pocketBudget.set(sleeve.personId, left - applied);
        sleeveContribution.set(sleeve.id, applied);
      } else {
        sleeveContribution.set(sleeve.id, sleeve.monthlyContribution);
        extraInvestingOutflow += sleeve.monthlyContribution;
      }
    }

    income += oneOffIncome;
    const spending =
      mortgagePayment +
      liabilityPayment +
      fixedExpenses +
      variableExpenses +
      pocketTotal +
      childCost +
      extraInvestingOutflow +
      oneOffExpense;

    if (t === 0) {
      /*
       * A contractual debt payment is as fixed as a mortgage payment, so it belongs in the
       * reserve target. Omitting it understates the floor by reserveFloorMonths × payment,
       * i.e. the model would tell a household with a car loan to hold less cash than it needs.
       */
      fixedMonthlyOutgoings = mortgagePayment + liabilityPayment + fixedExpenses;
      reserveFloor = assumptions.reserveFloorMonths * fixedMonthlyOutgoings;
    }

    /* ---- 4: reserve interest on opening balance, then cash flow ---- */
    const available = reserve * (1 + reserveMonthlyRate) + (income - spending);

    /* ---- 5: throttle DCA ---- */
    const dcaTarget = jointInvesting.monthlyContribution;
    const dcaActual = Math.min(dcaTarget, Math.max(0, available));
    if (dcaActual < dcaTarget - 0.01) {
      pausedMonths++;
      pausedAmount += dcaTarget - dcaActual;
      if (pausedFrom === null) pausedFrom = ym;
    }

    reserve = available - dcaActual;

    if (reserve < minReserve) {
      minReserve = reserve;
      minReserveAt = ym;
    }
    if (reserve < 0 && deficitAt === null) deficitAt = ym;

    const floorThisMonth =
      assumptions.reserveFloorMonths * (mortgagePayment + liabilityPayment + fixedExpenses);
    const gap = reserve - floorThisMonth;
    if (gap < worstFloorGap) {
      worstFloorGap = gap;
      worstFloorGapAt = ym;
      floorAtWorst = floorThisMonth;
    }

    /* ---- 6: sweep ---- */
    let sweep = 0;
    if (reserveInput.sweepCap !== null && reserve > reserveInput.sweepCap) {
      sweep = reserve - reserveInput.sweepCap;
      reserve = reserveInput.sweepCap;
    }

    /* ---- 7: grow investments ---- */
    joint = joint * (1 + jointMonthlyRate) + dcaActual + sweep;
    for (const sleeve of sleeves) {
      const contribution = sleeveContribution.get(sleeve.id) ?? 0;
      sleeve.balance = sleeve.balance * (1 + monthlyRate(sleeve.annualReturnPct)) + contribution;
    }

    let personalTotal = 0;
    for (const sleeve of sleeves) personalTotal += sleeve.balance;

    monthly.push({
      index: t,
      year: ym.year,
      month: ym.month,
      income,
      spending,
      mortgagePayment,
      rentPayment,
      housingPayment: mortgagePayment + rentPayment,
      liabilityPayment,
      childCost,
      reserve,
      jointInvestments: joint,
      personalInvestments: personalTotal,
      mortgageBalance,
      liabilityBalance,
      dcaTarget,
      dcaActual,
      floor: floorThisMonth,
      sweep,
      surplus: income - spending - dcaActual,
      incomeByPerson,
      phaseByPerson,
    });

    if (ym.month === 11 || t === totalMonths - 1) {
      const personalByPerson: Record<string, number> = {};
      for (const sleeve of sleeves) {
        personalByPerson[sleeve.personId] = (personalByPerson[sleeve.personId] ?? 0) + sleeve.balance;
      }
      yearly.push({
        year: ym.year,
        reserve,
        jointInvestments: joint,
        personalInvestments: personalByPerson,
        mortgageBalance,
        liabilityBalance,
        /*
         * Reserve enters at face value, including negative. Never clamped to zero.
         * Other debts are subtracted for the same reason the mortgage is: a car loan is a
         * real claim on the household. Rent is absent because it creates no liability.
         */
        netWorth: reserve + joint + personalTotal - mortgageBalance - liabilityBalance,
      });
    }
  }

  /*
   * Envelopes are descriptive in v1: they document what the cash reserve is earmarked for
   * without changing the cash flow. The shared total is surfaced so the UI can show how much
   * of the reserve is already committed, rather than the field sitting unused.
   */
  let sharedEnvelopeTotal = 0;
  let personalEnvelopeTotal = 0;
  for (const e of input.envelopes) {
    if (e.countsTowardReserve) sharedEnvelopeTotal += e.amount;
    else personalEnvelopeTotal += e.amount;
  }

  const firstMonth = monthly.length > 0 ? monthly[0] : undefined;
  const lastYear = yearly.length > 0 ? yearly[yearly.length - 1] : undefined;

  return {
    engineVersion: ENGINE_VERSION,
    monthly,
    yearly,
    minReserve,
    minReserveAt,
    deficitAt,
    pausedMonths,
    pausedAmount,
    pausedFrom,
    mortgagePaidYear,
    liabilitiesClearedYear,
    fixedMonthlyOutgoings,
    reserveFloor,
    firstSurplus: firstMonth ? firstMonth.surplus : 0,
    foregoneIncome,
    finalNetWorth: lastYear ? lastYear.netWorth : 0,
    worstFloorGap: Number.isFinite(worstFloorGap) ? worstFloorGap : 0,
    worstFloorGapAt,
    floorAtWorst,
    sharedEnvelopeTotal,
    personalEnvelopeTotal,
  };
}

function applyRateResets(state: MortgageState, def: Mortgage, ym: YearMonth): void {
  const now = toAbsolute(ym);
  def.rateResets.forEach((reset, i) => {
    if (state.appliedResets.has(i)) return;
    if (toAbsolute(reset.at) <= now) {
      state.annualRatePct = reset.newAnnualRatePct;
      if (typeof reset.newMonthlyPayment === 'number') {
        state.monthlyPayment = reset.newMonthlyPayment;
      }
      state.appliedResets.add(i);
    }
  });
}

/**
 * Child cost, with a linear taper over the final `costTaperYears` instead of the
 * prototype's cliff at exactly 22 years.
 */
function childCostFor(child: Child, ym: YearMonth, cpiFactor: number): number {
  const ageMonths = monthsBetween(child.birth, ym);
  if (ageMonths < 0) return 0;
  const endMonths = child.costUntilAgeYears * 12;
  if (ageMonths >= endMonths) return 0;

  const taperMonths = Math.max(0, child.costTaperYears * 12);
  const taperStart = endMonths - taperMonths;
  let factor = 1;
  if (taperMonths > 0 && ageMonths >= taperStart) {
    factor = 1 - (ageMonths - taperStart) / taperMonths;
  }
  return child.monthlyCost * cpiFactor * Math.max(0, factor);
}
