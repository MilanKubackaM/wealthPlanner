'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  analyse,
  buildLevers,
  detectProblems,
  simulate,
  type Child,
  type Liability,
  type ProjectionResult,
  type Recommendation,
  type ScenarioInput,
  type YearMonth,
} from '@wealthplanner/engine';
import { jurisdictionFor, type JurisdictionCode } from '@wealthplanner/jurisdictions';
import {
  countryFor,
  defaultMortgage,
  defaultRent,
  defaultScenario,
  withRegime,
  type HouseholdSize,
} from '@/lib/defaults';
import { clearPlan, exportPlan, hasPlanFor, importPlan, loadPlan, savePlan } from '@/lib/storage';
import { loadUiState, saveUiState } from '@/lib/uiState';
import { money, monthPhrase, percent, type UiLocale } from '@/lib/format';
import { ReserveChart } from './ReserveChart';
import { ProblemCard } from './ProblemCard';
import {
  AdvancedDisclosure,
  ChoiceField,
  FieldGroup,
  MonthYearField,
  NumberField,
  Repeater,
  StatTile,
  TextField,
} from './fields';
import { ConsequenceRibbon } from './ConsequenceRibbon';
import { Disclosure, SectionRail, usePrinting } from './Disclosure';
import { Compare } from './Compare';
import { EnvelopesEditor } from './EnvelopesEditor';
import { SleevesEditor } from './SleevesEditor';
import { decodeScenario, shareUrl } from '@/lib/share';
import { sensitivityRows } from '@/lib/variants';
import { Sensitivity } from './Sensitivity';

/**
 * The planner. Two different recompute rhythms, chosen from measurement rather than taste:
 *
 *   simulate()  ~0.9 ms  → runs synchronously on every keystroke, so the numbers track typing.
 *   recommend() ~89 ms   → about a hundred full simulations per pass, so it is debounced and
 *                          run inside a transition. On a slow phone that figure is several
 *                          hundred milliseconds, and blocking a keystroke on it would make
 *                          the whole product feel broken.
 *
 * Two structural decisions that are easy to undo by accident:
 *
 *   1. There is NO chart inside the wizard. See ConsequenceRibbon for the argument.
 *   2. The plan page is disclosure sections, not one long scroll and not tabs. Every collapsed
 *      header carries a live summary, so collapsing costs no information.
 */

const RECOMMEND_DEBOUNCE_MS = 220;

type Stage = 'onboarding' | 'plan';

const STEP_IDS = ['shape', 'income', 'housing', 'debts', 'expenses', 'cash', 'children'] as const;
type StepId = (typeof STEP_IDS)[number];

const SECTION_IDS = [
  'verdikt',
  'nalezy',
  'srovnani',
  'citlivost',
  'cisla',
  'predpoklady',
  'export',
] as const;
type SectionId = (typeof SECTION_IDS)[number];

/**
 * Verdict and findings open, because they are the answer and the only actions. Everything
 * else closed: it is available, it is summarised in its header, and it is not in the way.
 */
const SECTION_DEFAULTS: Record<SectionId, boolean> = {
  verdikt: true,
  nalezy: true,
  srovnani: false,
  citlivost: false,
  cisla: false,
  predpoklady: false,
  export: true,
};

/** The UI's three-way housing question, mapped onto the engine's two-way union. */
type HousingChoice = 'mortgage' | 'rent' | 'own';

function housingChoiceOf(scenario: ScenarioInput): HousingChoice {
  if (scenario.housing.kind === 'rent') return 'rent';
  return scenario.housing.mortgages.length > 0 ? 'mortgage' : 'own';
}

/**
 * The real maximum number of parental months this regime will pay, discovered by asking it
 * rather than by hardcoding a number per country. In Slovakia the benefit stops at the third
 * birthday, so after 8 months of maternity the usable maximum is 28 — while the old field
 * offered 36, and a Slovak user could type 36, watch nothing change, and reasonably conclude
 * the model was broken.
 */
function maxParentalMonths(scenario: ScenarioInput): number {
  const regime = scenario.leaveRegime;
  const base = { returnToWorkPct: 100 };
  let best = 1;
  for (let m = 1; m <= 48; m++) {
    const total = regime.totalLeaveMonths({ ...base, parentalMonths: m });
    const prev = regime.totalLeaveMonths({ ...base, parentalMonths: m - 1 });
    if (total > prev) best = m;
  }
  return best;
}

/** Every field the completeness meter counts. Shape-dependent, so it is derived, not a constant. */
function trackedPaths(scenario: ScenarioInput): string[] {
  const paths: string[] = [];
  scenario.people.forEach((_, i) => {
    paths.push(`people[${i}].netMonthlyIncome`, `people[${i}].birthYear`);
  });
  if (scenario.housing.kind === 'rent') {
    paths.push('housing.rent.monthlyAmount', 'housing.rent.annualIndexationPct');
  } else if (scenario.housing.mortgages.length > 0) {
    paths.push('housing.mortgage.balance', 'housing.mortgage.annualRatePct', 'housing.mortgage.monthlyPayment');
  }
  scenario.expenses.forEach((e) => paths.push(`expenses.${e.id}`));
  paths.push('reserve.balance', 'reserve.annualRatePct', 'jointInvesting.monthlyContribution');
  scenario.liabilities.forEach((_, i) => paths.push(`liabilities[${i}].balance`));
  scenario.children.forEach((_, i) => paths.push(`children[${i}].birth`, `children[${i}].monthlyCost`));
  return paths;
}

export function PlannerClient({
  locale,
  startMonth,
  today,
}: {
  locale: UiLocale;
  startMonth: YearMonth;
  today: string;
}) {
  const t = useTranslations();
  /* next-intl types message keys literally; the planner assembles several of them. */
  const tx = (key: string, values?: Record<string, string | number>) =>
    t(key as never, values as never);
  const months = t.raw('months') as string[];
  const monthsIn = t.raw('monthsIn') as string[];

  const country = countryFor(locale);

  const [scenario, setScenario] = useState<ScenarioInput>(() =>
    defaultScenario(country, startMonth),
  );
  const [stage, setStage] = useState<Stage>('onboarding');
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [staleEngine, setStaleEngine] = useState(false);
  const [importError, setImportError] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  /* The four async actions used to be inert and silent until a toast appeared elsewhere. */
  const [busy, setBusy] = useState<string | null>(null);
  const [fromLink, setFromLink] = useState(false);
  const [linkCountry, setLinkCountry] = useState<JurisdictionCode | null>(null);
  const [otherCountry, setOtherCountry] = useState<JurisdictionCode | null>(null);
  const [sections, setSections] = useState<Record<string, boolean>>(SECTION_DEFAULTS);
  const [recap, setRecap] = useState<Array<{ label: string; delta: number }>>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const printing = usePrinting();

  /*
   * Precedence, in this order and for these reasons:
   *
   *   1. a `#p=` fragment — opening a link is an explicit act, so it wins even over the
   *      locale. A country mismatch is DISCLOSED, never converted: the link's numbers are
   *      the whole point of the link.
   *   2. localStorage FOR THIS LOCALE'S COUNTRY. A plan stored for the other country is
   *      offered, never loaded — before the key was per country, a Czech plan was restored
   *      onto the Slovak planner with Czech mortgage figures and Czech benefit rules.
   *   3. the country default.
   *
   * The effect depends on `locale` so that nothing survives a country change by accident.
   */
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const fragment = window.location.hash;
      if (fragment.startsWith('#p=')) {
        const shared = await decodeScenario(fragment);
        if (shared && !cancelled) {
          setScenario(shared);
          setFromLink(true);
          setLinkCountry(shared.jurisdiction !== country ? shared.jurisdiction : null);
          setStage('plan');
          return;
        }
      }
      const stored = loadPlan(country);
      if (stored && !cancelled) {
        setScenario(stored.scenario);
        setSavedAt(stored.savedAt);
        setStaleEngine(stored.staleEngine);
        setTouched(stored.touched);
        setStage('plan');
        return;
      }
      if (!cancelled) {
        const other: JurisdictionCode = country === 'CZ' ? 'SK' : 'CZ';
        if (hasPlanFor(other)) setOtherCountry(other);
        setScenario(defaultScenario(country, startMonth));
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [country, startMonth]);

  /* Section state is remembered separately from the plan, and unknown ids fall back to the
     defaults so a section added in a later release is never inherited as collapsed. */
  useEffect(() => {
    const stored = loadUiState();
    setSections({ ...SECTION_DEFAULTS, ...stored.sections });
    const target = new URLSearchParams(window.location.search).get('s');
    if (target && (SECTION_IDS as readonly string[]).includes(target)) {
      setSections((current) => ({ ...current, [target]: true }));
      requestAnimationFrame(() => {
        document.getElementById(`${target}-btn`)?.focus();
        document.getElementById(target)?.scrollIntoView({ block: 'start' });
      });
    }
  }, []);

  const result = useMemo(() => simulate(scenario), [scenario]);

  const [analysis, setAnalysis] = useState<ReturnType<typeof analyse>>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const jurisdiction = jurisdictionFor(scenario.jurisdiction);
    const handle = setTimeout(() => {
      const problems = detectProblems(scenario, result, {
        typicalSavingsRatePct: jurisdiction.typicalTopSavingsRatePct.value,
        retirementAgeYears: jurisdiction.statutoryRetirementAgeYears.value,
      });
      startTransition(() => setAnalysis(analyse(scenario, problems)));
    }, RECOMMEND_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [scenario, result]);

  const markTouched = useCallback((path: string) => {
    setTouched((current) => (current.includes(path) ? current : [...current, path]));
  }, []);

  const patch = useCallback((next: Partial<ScenarioInput>) => {
    setScenario((current) => ({ ...current, ...next }));
  }, []);

  /** Every edit goes through here, so the "your numbers vs the average" count cannot drift. */
  const edit = useCallback(
    (path: string, next: Partial<ScenarioInput>) => {
      markTouched(path);
      patch(next);
    },
    [markTouched, patch],
  );

  const applyFix = useCallback((fix: Recommendation) => {
    setScenario((current) => {
      const lever = buildLevers(current).find((l) => l.id === fix.leverId);
      return lever ? lever.set(current, fix.to) : current;
    });
  }, []);

  const currency = scenario.currency;
  const jurisdiction = jurisdictionFor(scenario.jurisdiction);
  const size: HouseholdSize = scenario.people.length === 1 ? 1 : 2;
  const solo = size === 1;
  const tracked = trackedPaths(scenario);
  const answered = touched.filter((path) => tracked.includes(path)).length;

  const personName = (index: number) =>
    scenario.people[index]?.label ||
    (solo ? t('planner.personSolo') : t('planner.person', { n: index + 1 }));

  /* ------------------------------------------------------------- persistence ---- */

  function handleSave() {
    setBusy('save');
    savePlan(scenario, touched);
    const stored = loadPlan(scenario.jurisdiction);
    setSavedAt(stored?.savedAt ?? null);
    setStaleEngine(false);
    setBusy(null);
  }

  function handleExport() {
    setBusy('export');
    const blob = new Blob([exportPlan(scenario, touched)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'plan.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setBusy(null);
  }

  async function handleShare() {
    setBusy('share');
    try {
      const url = await shareUrl(scenario, window.location.origin, window.location.pathname);
      await navigator.clipboard.writeText(url);
      setShareState('copied');
    } catch {
      setShareState('failed');
    }
    setBusy(null);
    setTimeout(() => setShareState('idle'), 2500);
  }

  async function handleImportFile(file: File) {
    setBusy('import');
    const parsed = importPlan(await file.text());
    setBusy(null);
    if (parsed) {
      setScenario(withRegime(parsed));
      setImportError(false);
      setStage('plan');
    } else {
      setImportError(true);
    }
  }

  function toggleSection(id: SectionId, soloClick: boolean) {
    setSections((current) => {
      const next = soloClick
        ? (Object.fromEntries(SECTION_IDS.map((s) => [s, s === id])) as Record<string, boolean>)
        : { ...current, [id]: !current[id] };
      saveUiState({ sections: next });
      /* replaceState, never pushState: the back button must not walk through an accordion. */
      const params = new URLSearchParams(window.location.search);
      if (next[id]) params.set('s', id);
      else params.delete('s');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      return next;
    });
  }

  function setAllSections(open: boolean) {
    const next = Object.fromEntries(
      SECTION_IDS.map((s) => [s, s === 'verdikt' ? true : open]),
    ) as Record<string, boolean>;
    setSections(next);
    saveUiState({ sections: next });
  }

  function jumpTo(id: SectionId) {
    setSections((current) => {
      const next = { ...current, [id]: true };
      saveUiState({ sections: next });
      return next;
    });
    /* The rail is a deep link too, or reloading loses the section the reader chose. */
    const params = new URLSearchParams(window.location.search);
    params.set('s', id);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${params.toString()}${window.location.hash}`,
    );
    requestAnimationFrame(() => {
      document.getElementById(`${id}-btn`)?.focus();
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    });
  }

  /* -------------------------------------------------------------- scenario ops --- */

  function setHouseholdSize(next: HouseholdSize) {
    setScenario((current) => {
      /*
       * Re-derive the defaults at the new size for everything the user has NOT edited. A lone
       * adult prefilled with a couple's groceries and a couple's mortgage sees a projection
       * that is nonsense before they have typed anything — and re-deriving the fields they
       * DID edit would throw their work away, which is what the old country switch did.
       */
      const fresh = defaultScenario(current.jurisdiction, startMonth, next);
      const keep = (path: string) => touched.includes(path);
      const people =
        next === 1
          ? [{ ...(current.people[0] ?? fresh.people[0]!) }]
          : [
              { ...(current.people[0] ?? fresh.people[0]!) },
              { ...(current.people[1] ?? fresh.people[1] ?? { ...fresh.people[0]!, id: 'p2' }) },
            ];
      return {
        ...current,
        people,
        expenses: current.expenses.map((expense) => {
          const fallback = fresh.expenses.find((e) => e.id === expense.id);
          return keep(`expenses.${expense.id}`) || !fallback ? expense : { ...expense, monthlyAmount: fallback.monthlyAmount };
        }),
        housing: keep('housing.mortgage.balance') ? current.housing : fresh.housing,
        reserve: keep('reserve.balance') ? current.reserve : fresh.reserve,
        jointInvesting: keep('jointInvesting.monthlyContribution')
          ? current.jointInvesting
          : fresh.jointInvesting,
        /* A lone parent takes the leave, and SK maternity is longer for one. */
        children: current.children.map((child) => ({
          ...child,
          leaveTakenBy: next === 1 ? people[0]!.id : child.leaveTakenBy,
          leavePlan: { ...child.leavePlan, singleParent: next === 1 },
        })),
      };
    });
  }

  function setHousingChoice(choice: HousingChoice) {
    setScenario((current) => {
      if (choice === 'rent') return { ...current, housing: defaultRent(current.jurisdiction, size) };
      if (choice === 'own') return { ...current, housing: { kind: 'own', mortgages: [] } };
      return { ...current, housing: defaultMortgage(current.jurisdiction, size) };
    });
  }

  function setChildrenIntent(intent: ScenarioInput['childrenIntent']) {
    setScenario((current) => {
      if (intent !== 'yes') return { ...current, childrenIntent: intent, children: [] };
      if (current.children.length > 0) return { ...current, childrenIntent: intent };
      return { ...current, childrenIntent: intent, children: [newChild(current, startMonth)] };
    });
  }

  function newChild(current: ScenarioInput, start: YearMonth): Child {
    return {
      id: `c${current.children.length + 1}`,
      label: '',
      birth: { year: start.year + 2, month: start.month },
      monthlyCost: current.currency === 'CZK' ? 6_000 : 250,
      costUntilAgeYears: 22,
      costTaperYears: 3,
      leaveTakenBy: current.people[current.people.length - 1]?.id ?? current.people[0]?.id ?? 'p1',
      leavePlan: {
        parentalMonths: Math.min(24, maxParentalMonths(current)),
        returnToWorkPct: 100,
        singleParent: current.people.length === 1,
      },
    };
  }

  function newLiability(current: ScenarioInput): Liability {
    return {
      id: `l${current.liabilities.length + 1}`,
      label: '',
      kind: 'car-loan',
      balance: current.currency === 'CZK' ? 300_000 : 12_000,
      annualRatePct: jurisdictionFor(current.jurisdiction).typicalConsumerLoanRatePct.value,
      monthlyPayment: current.currency === 'CZK' ? 6_000 : 250,
      remainingTermMonths: 60,
      revolving: false,
    };
  }

  /* ----------------------------------------------------------------- fields ----- */

  const estimateLabel = t('onboarding.badgeEstimate');
  const errorMax = (max: number) => t('fieldError.max', { max });
  const errorMin = (min: number) => t('fieldError.min', { min });

  const numberProps = {
    locale,
    currency,
    estimateLabel,
    errorMax,
    errorMin,
  } as const;

  const incomeFields = (
    <>
      {scenario.people.map((person, index) => (
        <NumberField
          key={`income-${person.id}`}
          id={`income-${person.id}`}
          kind="money.monthly"
          label={solo ? t('planner.netIncome') : `${t('planner.netIncome')} — ${personName(index)}`}
          value={person.netMonthlyIncome}
          span={solo ? 6 : 6}
          estimate={!touched.includes(`people[${index}].netMonthlyIncome`)}
          onChange={(v) =>
            edit(`people[${index}].netMonthlyIncome`, {
              people: scenario.people.map((p, i) => (i === index ? { ...p, netMonthlyIncome: v } : p)),
            })
          }
          {...numberProps}
        />
      ))}
    </>
  );

  const shapeFields = (
    <>
      <ChoiceField<'single' | 'couple'>
        id="household-shape"
        label={t('planner.householdShape')}
        variant="cards"
        /* No pre-selection. This one answer restructures every screen after it, it costs one
           tap, and guessing it wrong costs the user a rebuild in the middle of the wizard. */
        value={touched.includes('household.shape') ? (solo ? 'single' : 'couple') : null}
        hint={t('planner.shapeHint')}
        options={[
          { value: 'single', label: t('planner.shapeSingle') },
          { value: 'couple', label: t('planner.shapeCouple') },
        ]}
        onChange={(v) => {
          markTouched('household.shape');
          setHouseholdSize(v === 'single' ? 1 : 2);
        }}
      />
      {scenario.people.map((person, index) => (
        <NumberField
          key={`birth-${person.id}`}
          id={`birth-${person.id}`}
          kind="year"
          label={solo ? t('planner.birthYear') : `${t('planner.birthYear')} — ${personName(index)}`}
          hint={index === 0 ? t('planner.birthYearHint') : undefined}
          value={person.birthYear ?? startMonth.year - 32}
          min={startMonth.year - 90}
          max={startMonth.year}
          span={3}
          estimate={!touched.includes(`people[${index}].birthYear`)}
          onChange={(v) =>
            edit(`people[${index}].birthYear`, {
              people: scenario.people.map((p, i) => (i === index ? { ...p, birthYear: v } : p)),
            })
          }
          {...numberProps}
        />
      ))}
    </>
  );

  const housingChoice = housingChoiceOf(scenario);
  const mortgage = scenario.housing.kind === 'own' ? scenario.housing.mortgages[0] : undefined;
  const rent = scenario.housing.kind === 'rent' ? scenario.housing.rent : undefined;

  function patchMortgage(patchIn: Partial<NonNullable<typeof mortgage>>, path: string) {
    if (!mortgage) return;
    edit(path, { housing: { kind: 'own', mortgages: [{ ...mortgage, ...patchIn }] } });
  }

  function patchRent(patchIn: Partial<NonNullable<typeof rent>>, path: string) {
    if (!rent) return;
    edit(path, { housing: { kind: 'rent', rent: { ...rent, ...patchIn } } });
  }

  const housingFields = (
    <>
      <ChoiceField<HousingChoice>
        id="housing-kind"
        label={t('planner.housingKind')}
        variant="cards"
        value={housingChoice}
        options={[
          { value: 'mortgage', label: t('planner.housingMortgage') },
          { value: 'rent', label: t('planner.housingRent') },
          { value: 'own', label: t('planner.housingOwn') },
        ]}
        onChange={(v) => {
          markTouched('housing.kind');
          setHousingChoice(v);
        }}
      />

      {housingChoice === 'mortgage' && mortgage ? (
        <>
          <NumberField
            id="m-balance"
            kind="money.large"
            label={t('planner.mortgageBalance')}
            value={mortgage.balance}
            span={6}
            estimate={!touched.includes('housing.mortgage.balance')}
            onChange={(v) => patchMortgage({ balance: v }, 'housing.mortgage.balance')}
            {...numberProps}
          />
          <NumberField
            id="m-rate"
            kind="percent.rate"
            label={t('planner.mortgageRate')}
            value={mortgage.annualRatePct}
            span={3}
            estimate={!touched.includes('housing.mortgage.annualRatePct')}
            onChange={(v) => patchMortgage({ annualRatePct: v }, 'housing.mortgage.annualRatePct')}
            {...numberProps}
          />
          <NumberField
            id="m-payment"
            kind="money.monthly"
            label={t('planner.mortgagePayment')}
            value={mortgage.monthlyPayment}
            span={3}
            estimate={!touched.includes('housing.mortgage.monthlyPayment')}
            onChange={(v) => patchMortgage({ monthlyPayment: v }, 'housing.mortgage.monthlyPayment')}
            {...numberProps}
          />
          {/* The refixation is two real fields, not a button beside a paragraph. It is the
              dominant risk in a Czech or Slovak household's next decade. */}
          <MonthYearField
            id="m-refix"
            label={t('planner.refixAt')}
            value={mortgage.rateResets[0]?.at ?? { year: startMonth.year + 3, month: startMonth.month }}
            months={months}
            minYear={startMonth.year}
            maxYear={scenario.assumptions.horizonYear}
            span={6}
            error={
              mortgage.rateResets[0] &&
              mortgage.rateResets[0].at.year * 12 + mortgage.rateResets[0].at.month <
                startMonth.year * 12 + startMonth.month
                ? t('fieldError.refixBeforeStart')
                : null
            }
            onChange={(at) =>
              patchMortgage(
                {
                  rateResets: [
                    {
                      at,
                      newAnnualRatePct:
                        mortgage.rateResets[0]?.newAnnualRatePct ?? mortgage.annualRatePct + 1,
                    },
                  ],
                },
                'housing.mortgage.refix',
              )
            }
          />
          <NumberField
            id="m-refix-rate"
            kind="percent.rate"
            label={t('planner.refixRate')}
            hint={t('planner.refixHint', { rate: percent(jurisdiction.typicalMortgageRatePct.value, locale) })}
            value={mortgage.rateResets[0]?.newAnnualRatePct ?? mortgage.annualRatePct + 1}
            span={6}
            onChange={(v) =>
              patchMortgage(
                {
                  rateResets: [
                    {
                      at:
                        mortgage.rateResets[0]?.at ?? {
                          year: startMonth.year + 3,
                          month: startMonth.month,
                        },
                      newAnnualRatePct: v,
                    },
                  ],
                },
                'housing.mortgage.refix',
              )
            }
            {...numberProps}
          />
        </>
      ) : null}

      {housingChoice === 'rent' && rent ? (
        <>
          <NumberField
            id="rent-amount"
            kind="money.monthly"
            label={t('planner.rentAmount')}
            value={rent.monthlyAmount}
            span={6}
            estimate={!touched.includes('housing.rent.monthlyAmount')}
            onChange={(v) => patchRent({ monthlyAmount: v }, 'housing.rent.monthlyAmount')}
            {...numberProps}
          />
          <NumberField
            id="rent-index"
            kind="percent.rate"
            label={t('planner.rentIndexation')}
            hint={t('planner.rentIndexationHint')}
            value={rent.annualIndexationPct}
            span={6}
            estimate={!touched.includes('housing.rent.annualIndexationPct')}
            onChange={(v) => patchRent({ annualIndexationPct: v }, 'housing.rent.annualIndexationPct')}
            {...numberProps}
          />
          <div className="f span-12">
            <label className="check" htmlFor="rent-floor">
              <input
                id="rent-floor"
                type="checkbox"
                checked={rent.countsTowardReserveFloor}
                onChange={(event) =>
                  patchRent({ countsTowardReserveFloor: event.target.checked }, 'housing.rent.floor')
                }
              />
              <span>
                {t('planner.rentFloor')}
                <span className="f-hint">{t('planner.rentFloorHint')}</span>
              </span>
            </label>
          </div>
        </>
      ) : null}

      {housingChoice === 'own' ? (
        <p className="muted span-12" style={{ margin: 0, fontSize: 14, maxWidth: '66ch' }}>
          {t('planner.housingOwnHint')}
        </p>
      ) : null}
    </>
  );

  const debtFields = (
    <>
      <ChoiceField<'no' | 'yes'>
        id="debts-has"
        label={t('planner.debtsHas')}
        variant="segmented"
        value={scenario.liabilities.length > 0 ? 'yes' : 'no'}
        options={[
          { value: 'no', label: t('planner.debtsNo') },
          { value: 'yes', label: t('planner.debtsYes') },
        ]}
        onChange={(v) => {
          markTouched('liabilities');
          setScenario((current) =>
            v === 'no'
              ? { ...current, liabilities: [] }
              : current.liabilities.length > 0
                ? current
                : { ...current, liabilities: [newLiability(current)] },
          );
        }}
      />
      {scenario.liabilities.length > 0 ? (
        <div className="span-12">
          <Repeater<Liability>
            items={scenario.liabilities}
            max={6}
            itemTitle={(item) => item.label || tx(`planner.debtKind${kindSuffix(item.kind)}`)}
            addLabel={t('planner.debtAdd')}
            removeLabel={t('planner.debtRemove')}
            onAdd={() =>
              setScenario((current) => ({
                ...current,
                liabilities: [...current.liabilities, newLiability(current)],
              }))
            }
            onRemove={(index) =>
              patch({ liabilities: scenario.liabilities.filter((_, i) => i !== index) })
            }
            renderItem={(item, index) => {
              const update = (next: Partial<Liability>, path: string) =>
                edit(path, {
                  liabilities: scenario.liabilities.map((l, i) => (i === index ? { ...l, ...next } : l)),
                });
              const interestOnly = (item.balance * item.annualRatePct) / 100 / 12;
              return (
                <>
                  <ChoiceField<Liability['kind']>
                    id={`debt-kind-${item.id}`}
                    label={t('planner.debtKind')}
                    variant="select"
                    value={item.kind}
                    span={4}
                    options={[
                      { value: 'car-loan', label: t('planner.debtKindCar') },
                      { value: 'consumer-loan', label: t('planner.debtKindConsumer') },
                      { value: 'credit-card', label: t('planner.debtKindCard') },
                      { value: 'other', label: t('planner.debtKindOther') },
                    ]}
                    onChange={(kind) =>
                      update({ kind, revolving: kind === 'credit-card' }, `liabilities[${index}].kind`)
                    }
                  />
                  <NumberField
                    id={`debt-balance-${item.id}`}
                    kind="money.balance"
                    label={t('planner.debtBalance')}
                    value={item.balance}
                    span={4}
                    onChange={(v) => update({ balance: v }, `liabilities[${index}].balance`)}
                    {...numberProps}
                  />
                  <NumberField
                    id={`debt-rate-${item.id}`}
                    kind="percent.rate"
                    label={t('planner.debtRate')}
                    value={item.annualRatePct}
                    span={2}
                    onChange={(v) => update({ annualRatePct: v }, `liabilities[${index}].rate`)}
                    {...numberProps}
                  />
                  <NumberField
                    id={`debt-payment-${item.id}`}
                    kind="money.monthly"
                    label={t('planner.debtPayment')}
                    value={item.monthlyPayment}
                    span={2}
                    /* The error sits on the field that caused it, not in the section footer. */
                    error={
                      item.balance > 0 && item.monthlyPayment <= interestOnly
                        ? t('fieldError.debtPaymentBelowInterest')
                        : null
                    }
                    onChange={(v) => update({ monthlyPayment: v }, `liabilities[${index}].payment`)}
                    {...numberProps}
                  />
                  <AdvancedDisclosure id={`debt-adv-${item.id}`} label={t('planner.debtTerm')}>
                    <NumberField
                      id={`debt-term-${item.id}`}
                      kind="months"
                      label={t('planner.debtTerm')}
                      unit={t('units.months')}
                      value={item.remainingTermMonths}
                      max={480}
                      span={4}
                      onChange={(v) => update({ remainingTermMonths: v }, `liabilities[${index}].term`)}
                      {...numberProps}
                    />
                    <div className="f span-6">
                      <label className="check" htmlFor={`debt-rev-${item.id}`}>
                        <input
                          id={`debt-rev-${item.id}`}
                          type="checkbox"
                          checked={item.revolving}
                          onChange={(event) =>
                            update({ revolving: event.target.checked }, `liabilities[${index}].revolving`)
                          }
                        />
                        <span>{t('planner.debtRevolving')}</span>
                      </label>
                    </div>
                  </AdvancedDisclosure>
                </>
              );
            }}
          />
        </div>
      ) : null}
    </>
  );

  const expenseFields = (
    <>
      {scenario.expenses.map((expense, index) => (
        <NumberField
          key={expense.id}
          id={`exp-${expense.id}`}
          kind="money.monthly"
          label={tx(`planner.expense${expense.id.charAt(0).toUpperCase()}${expense.id.slice(1)}`)}
          hint={expense.kind === 'fixed' ? t('planner.expenseFixed') : t('planner.expenseVariable')}
          value={expense.monthlyAmount}
          span={3}
          estimate={!touched.includes(`expenses.${expense.id}`)}
          onChange={(v) =>
            edit(`expenses.${expense.id}`, {
              expenses: scenario.expenses.map((e, i) => (i === index ? { ...e, monthlyAmount: v } : e)),
            })
          }
          {...numberProps}
        />
      ))}
    </>
  );

  const cashFields = (
    <>
      <NumberField
        id="r-balance"
        kind="money.balance"
        label={t('planner.reserveBalance')}
        value={scenario.reserve.balance}
        span={4}
        estimate={!touched.includes('reserve.balance')}
        onChange={(v) => edit('reserve.balance', { reserve: { ...scenario.reserve, balance: v } })}
        {...numberProps}
      />
      <NumberField
        id="r-rate"
        kind="percent.rate"
        label={t('planner.reserveRate')}
        value={scenario.reserve.annualRatePct}
        span={4}
        estimate={!touched.includes('reserve.annualRatePct')}
        onChange={(v) => edit('reserve.annualRatePct', { reserve: { ...scenario.reserve, annualRatePct: v } })}
        {...numberProps}
      />
      <NumberField
        id="dca"
        kind="money.monthly"
        label={t('planner.dca')}
        value={scenario.jointInvesting.monthlyContribution}
        span={4}
        estimate={!touched.includes('jointInvesting.monthlyContribution')}
        onChange={(v) =>
          edit('jointInvesting.monthlyContribution', {
            jointInvesting: { ...scenario.jointInvesting, monthlyContribution: v },
          })
        }
        {...numberProps}
      />
      <NumberField
        id="dca-return"
        kind="percent.growth"
        label={t('planner.expectedReturn')}
        value={scenario.jointInvesting.annualReturnPct}
        span={4}
        onChange={(v) =>
          edit('jointInvesting.annualReturnPct', {
            jointInvesting: { ...scenario.jointInvesting, annualReturnPct: v },
          })
        }
        {...numberProps}
      />
    </>
  );

  const maxParental = maxParentalMonths(scenario);

  const childFields = (
    <>
      <ChoiceField<ScenarioInput['childrenIntent']>
        id="children-intent"
        label={t('planner.childrenIntent')}
        variant="cards"
        value={scenario.childrenIntent}
        hint={t('planner.childrenIntentHint')}
        options={[
          { value: 'yes', label: t('planner.childrenIntentYes') },
          { value: 'undecided', label: t('planner.childrenIntentUndecided') },
          { value: 'no', label: t('planner.childrenIntentNo') },
        ]}
        onChange={(v) => {
          markTouched('childrenIntent');
          setChildrenIntent(v);
        }}
      />

      {scenario.childrenIntent !== 'yes' ? (
        <p className="muted span-12" style={{ margin: 0, fontSize: 14, maxWidth: '66ch' }}>
          {scenario.childrenIntent === 'no' ? t('planner.childrenNoneNo') : t('planner.childrenNone')}
        </p>
      ) : (
        <div className="span-12">
          <Repeater<Child>
            items={scenario.children}
            max={4}
            itemTitle={(item, index) => item.label || t('planner.childLabel', { n: index + 1 })}
            addLabel={t('planner.childAdd')}
            removeLabel={t('planner.childRemove')}
            onAdd={() =>
              setScenario((current) => ({ ...current, children: [...current.children, newChild(current, startMonth)] }))
            }
            onRemove={(index) => patch({ children: scenario.children.filter((_, i) => i !== index) })}
            renderItem={(child, index) => {
              const update = (next: Partial<Child>, path: string) =>
                edit(path, {
                  children: scenario.children.map((c, i) => (i === index ? { ...c, ...next } : c)),
                });
              const birthAbs = child.birth.year * 12 + child.birth.month;
              const lastAbs = scenario.assumptions.horizonYear * 12 + 11;
              return (
                <>
                  <MonthYearField
                    id={`child-birth-${child.id}`}
                    label={t('planner.childBirth')}
                    value={child.birth}
                    months={months}
                    /* Past births must be enterable: this used to be pinned to the projection
                       start, so an existing child could not be typed in at all. */
                    minYear={startMonth.year - 25}
                    maxYear={scenario.assumptions.horizonYear}
                    span={6}
                    error={
                      birthAbs > lastAbs
                        ? t('fieldError.childOutsideHorizon', { year: scenario.assumptions.horizonYear })
                        : null
                    }
                    onChange={(birth) => update({ birth }, `children[${index}].birth`)}
                  />
                  <NumberField
                    id={`child-cost-${child.id}`}
                    kind="money.monthly"
                    label={t('planner.childCost')}
                    value={child.monthlyCost}
                    span={6}
                    estimate={!touched.includes(`children[${index}].monthlyCost`)}
                    onChange={(v) => update({ monthlyCost: v }, `children[${index}].monthlyCost`)}
                    {...numberProps}
                  />
                  {solo ? (
                    /* Never a one-option select. A sentence says the same thing honestly. */
                    <p className="muted span-12" style={{ margin: 0, fontSize: 13 }}>
                      {t('planner.leaveBySingle')}
                    </p>
                  ) : (
                    <ChoiceField<string>
                      id={`child-leave-${child.id}`}
                      label={t('planner.childLeaveBy')}
                      variant="segmented"
                      value={child.leaveTakenBy}
                      span={12}
                      options={scenario.people.map((person, i) => ({
                        value: person.id,
                        label: personName(i),
                      }))}
                      onChange={(leaveTakenBy) =>
                        update({ leaveTakenBy }, `children[${index}].leaveTakenBy`)
                      }
                    />
                  )}
                  <AdvancedDisclosure id={`child-adv-${child.id}`} label={t('planner.childParentalMonths')}>
                    <NumberField
                      id={`child-parental-${child.id}`}
                      kind="months"
                      label={t('planner.childParentalMonths')}
                      unit={t('units.months')}
                      value={child.leavePlan.parentalMonths}
                      min={0}
                      /* Derived from the regime, not hardcoded: SK stops paying at age three. */
                      max={maxParental}
                      span={6}
                      onChange={(v) =>
                        update(
                          { leavePlan: { ...child.leavePlan, parentalMonths: v } },
                          `children[${index}].parentalMonths`,
                        )
                      }
                      {...numberProps}
                    />
                    <NumberField
                      id={`child-return-${child.id}`}
                      kind="percent.share"
                      label={t('planner.childReturnPct')}
                      hint={t('planner.childReturnHint')}
                      value={child.leavePlan.returnToWorkPct}
                      span={6}
                      onChange={(v) =>
                        update(
                          { leavePlan: { ...child.leavePlan, returnToWorkPct: v } },
                          `children[${index}].returnToWorkPct`,
                        )
                      }
                      {...numberProps}
                    />
                  </AdvancedDisclosure>
                </>
              );
            }}
          />
        </div>
      )}
    </>
  );

  /* ---------------------------------------------------------------- wizard ------ */

  const stepBodies: Record<StepId, React.ReactNode> = {
    shape: shapeFields,
    income: incomeFields,
    housing: housingFields,
    debts: debtFields,
    expenses: expenseFields,
    cash: cashFields,
    children: childFields,
  };

  /* The projection as this step was entered, so the ribbon can attribute the change to it. */
  const stepBaseline = useRef<ProjectionResult | null>(null);
  const stepId = STEP_IDS[step] ?? 'shape';
  useEffect(() => {
    stepBaseline.current = simulate(scenario);
    /* Deliberately keyed on the step alone: re-snapshotting on every edit would make the
       delta always read zero. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /**
   * Three numbers that moved the plan most, each attributed to the step it came from. Measured
   * by reverting ONE group back to the national average and re-simulating — which is the same
   * "change one thing, run it again" the sensitivity panel uses, so the figures mean the same
   * thing in both places.
   */
  function finishWizard() {
    const pristine = defaultScenario(scenario.jurisdiction, startMonth, size);
    const mine = simulate(scenario).minReserve;
    const groups: Array<[string, ScenarioInput]> = [
      [t('planner.housing'), { ...scenario, housing: pristine.housing }],
      [t('planner.expenses'), { ...scenario, expenses: pristine.expenses }],
      [
        t('planner.reserve'),
        { ...scenario, reserve: pristine.reserve, jointInvesting: pristine.jointInvesting },
      ],
      [t('planner.netIncome'), { ...scenario, people: pristine.people }],
      [t('planner.children'), { ...scenario, children: [] }],
      [t('planner.debts'), { ...scenario, liabilities: [] }],
    ];
    const deltas = groups
      .map(([label, without]) => ({ label, delta: mine - simulate(without).minReserve }))
      .filter((entry) => Math.abs(entry.delta) > 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    setRecap(deltas.slice(0, 3));
    setStage('plan');
  }

  if (stage === 'onboarding') {
    const total = STEP_IDS.length;
    return (
      <div className="stack-lg">
        {otherCountry ? (
          <div className="card notice">
            <p style={{ margin: 0, fontSize: 14 }}>{t('planner.otherCountryPlan')}</p>
            <div className="row">
              <a className="btn btn-secondary btn-sm" href={`/${otherCountry === 'SK' ? 'sk' : 'cs'}/plan`}>
                {t('planner.otherCountryOpen')}
              </a>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOtherCountry(null)}>
                {t('planner.otherCountryDismiss')}
              </button>
            </div>
          </div>
        ) : null}

        <div className="card wizard">
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('onboarding.progress', { step: step + 1, total: String(total) })}
            </p>
            <h2 style={{ fontSize: 'var(--text-2xl)', marginTop: 4 }}>{tx(`onboarding.${stepId}.title`)}</h2>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, maxWidth: '60ch' }}>
              {tx(`onboarding.${stepId}.body`)}
            </p>
          </div>

          <div className="wizard-pips" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} data-done={i <= step ? 'true' : undefined} />
            ))}
          </div>

          <div className="grid-12">{stepBodies[stepId]}</div>

          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {t('onboarding.estimateNote')}
          </p>

          <ConsequenceRibbon
            result={result}
            baseline={stepBaseline.current}
            currency={currency}
            locale={locale}
            monthsIn={monthsIn}
            answered={answered}
            total={tracked.length}
            stepKey={stepId}
            labels={{
              label: t('onboarding.ribbon.label'),
              holds: t('onboarding.ribbon.holds'),
              belowFloor: t('onboarding.ribbon.belowFloor'),
              deficit: t('onboarding.ribbon.deficit'),
              trough: (amount, when) => t('onboarding.ribbon.trough', { amount, when }),
              troughDeficit: (amount, when) => t('onboarding.ribbon.troughDeficit', { amount, when }),
              stepDown: (amount) => t('onboarding.ribbon.stepDown', { amount }),
              stepUp: (amount) => t('onboarding.ribbon.stepUp', { amount }),
              stepFlat: t('onboarding.ribbon.stepFlat'),
              completeness: (done, all) => t('onboarding.ribbon.completeness', { done, total: all }),
            }}
          />

          <div className="row">
            {step > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => s - 1)}>
                {t('onboarding.back')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={stepId === 'shape' && !touched.includes('household.shape')}
              onClick={() => (step === total - 1 ? finishWizard() : setStep((s) => s + 1))}
            >
              {step === total - 1 ? t('onboarding.finish') : t('onboarding.next')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => (step === total - 1 ? finishWizard() : setStep((s) => s + 1))}
            >
              {t('onboarding.estimate')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginInlineStart: 'auto' }}
              onClick={finishWizard}
            >
              {t('onboarding.skip')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------- plan ---- */

  const cashProblems = analysis.filter(({ problem }) => problem.severity !== 'info');
  const infoProblems = analysis.filter(({ problem }) => problem.severity === 'info');
  const criticalCount = analysis.filter(({ problem }) => problem.severity === 'critical').length;

  /*
   * The one row of the sensitivity table that matters, lifted into the collapsed header. The
   * other five are for the curious, which is exactly what a collapsed section is for.
   */
  const worstRow = sensitivityRows(scenario)
    .slice(1)
    .reduce<ReturnType<typeof sensitivityRows>[number] | null>(
      (worst, row) => (!worst || row.result.minReserve < worst.result.minReserve ? row : worst),
      null,
    );

  const assumptionsLine = t('assumptions.inline', {
    return: `${scenario.jointInvesting.annualReturnPct} %`,
    cpi: `${scenario.assumptions.cpiPct} %`,
    floor: scenario.assumptions.reserveFloorMonths,
    date: today,
  });

  const thirdTile =
    housingChoice === 'mortgage'
      ? {
          label: t('planner.summaryMortgagePaid'),
          value: result.mortgagePaidYear
            ? String(result.mortgagePaidYear)
            : t('planner.summaryMortgageNever'),
        }
      : housingChoice === 'rent'
        ? {
            label: t('planner.summaryRentAt', { year: scenario.assumptions.horizonYear }),
            value: money(
              result.monthly[result.monthly.length - 1]?.rentPayment ?? 0,
              currency,
              locale,
            ),
          }
        : {
            label: t('planner.summaryInvestAt', { year: scenario.assumptions.horizonYear }),
            value: money(
              (result.yearly[result.yearly.length - 1]?.jointInvestments ?? 0) +
                Object.values(result.yearly[result.yearly.length - 1]?.personalInvestments ?? {}).reduce(
                  (sum, v) => sum + v,
                  0,
                ),
              currency,
              locale,
            ),
          };

  const sectionSummary: Record<SectionId, string | undefined> = {
    verdikt: undefined,
    nalezy:
      cashProblems.length === 0
        ? t('planSections.summary.nalezyNone')
        : t('planSections.summary.nalezy', { count: analysis.length, critical: criticalCount }),
    srovnani: t('planSections.summary.srovnani', { count: 3 }),
    citlivost: worstRow
      ? t('planSections.summary.citlivost', {
          label: tx(worstRow.labelKey),
          amount: money(worstRow.result.minReserve, currency, locale),
        })
      : undefined,
    cisla: t('planSections.summary.cisla', { total: tracked.length, user: answered }),
    predpoklady: t('planSections.summary.predpoklady', {
      ret: percent(scenario.jointInvesting.annualReturnPct, locale),
      cpi: percent(scenario.assumptions.cpiPct, locale),
      year: scenario.assumptions.horizonYear,
    }),
    export: undefined,
  };

  return (
    <div className="stack-lg">
      {fromLink && (
        <p className="card notice" style={{ margin: 0, fontSize: 14 }}>
          {t('share.loadedFromLink')}
          {linkCountry
            ? ` ${t('planner.linkOtherCountry', {
                country: linkCountry === 'SK' ? t('planner.countrySK') : t('planner.countryCZ'),
              })}`
            : ''}
        </p>
      )}

      {staleEngine && (
        <p className="card notice" data-tone="warning" style={{ margin: 0, fontSize: 14 }}>
          {t('planner.staleEngine')}
        </p>
      )}

      {recap.length > 0 && (
        <div className="card notice">
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('onboarding.ribbon.recap')}</p>
          <ul className="recap">
            {recap.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong className="tabular">
                  {item.delta < 0 ? '−' : '+'}
                  {money(Math.abs(item.delta), currency, locale)}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SectionRail
        label={t('planSections.railLabel')}
        items={SECTION_IDS.map((id) => ({ id, label: tx(`planSections.${id}`) }))}
        expandAll={t('planSections.expandAll')}
        collapseAll={t('planSections.collapseAll')}
        onJump={(id) => jumpTo(id as SectionId)}
        onExpandAll={() => setAllSections(true)}
        onCollapseAll={() => setAllSections(false)}
      />

      {/* The verdict is the one section that never collapses: it is the memorable picture, and
          it is what the PNG export is composed from, so it must always be in the DOM. */}
      <section className="card disc" id="verdikt">
        <h2 className="disc-h">
          <span className="disc-title">{t('planSections.verdikt')}</span>
        </h2>
        <div className="stack">
          <ReserveChart
            result={result}
            currency={currency}
            locale={locale}
            months={months}
            labels={chartLabels(t)}
          />
          <div className="stat-row">
            <StatTile
              label={t('planner.summaryMinReserve')}
              value={money(result.minReserve, currency, locale)}
              tone={result.minReserve < 0 ? 'critical' : result.worstFloorGap < 0 ? 'warning' : 'good'}
            />
            <StatTile
              label={t('planner.summaryNetWorth', { year: scenario.assumptions.horizonYear })}
              value={money(result.finalNetWorth, currency, locale)}
            />
            {/* Exactly three tiles, always. The fourth used to appear only when foregone income
                was non-zero, which reflowed the whole row from three columns to four. */}
            <StatTile label={thirdTile.label} value={thirdTile.value} />
          </div>
        </div>
      </section>

      <Disclosure
        id="nalezy"
        title={t('planSections.nalezy')}
        summary={sectionSummary.nalezy}
        open={sections.nalezy ?? true}
        printing={printing}
        soloTitle={t('planSections.solo')}
        onToggle={(soloClick) => toggleSection('nalezy', soloClick)}
      >
        <div className="stack">
          {isPending && (
            <span className="muted" style={{ fontSize: 13 }}>
              {t('planner.recomputing')}
            </span>
          )}

          {cashProblems.length === 0 && (
            <div className="notice" data-tone="good">
              {/* Not an <h3>: the section's own heading is right above it, and a second
                  heading saying the same thing is what made this block read as duplicated. */}
              <p className="notice-title">
                <span aria-hidden="true">✓</span>
                {t('problems.noneTitle')}
              </p>
              <p className="muted notice-body">{t('problems.noneBody')}</p>
            </div>
          )}

          {[...cashProblems, ...infoProblems].map(({ problem, fixes }) => (
            <ProblemCard
              key={
                problem.id +
                (problem.facts.personId ?? '') +
                (problem.facts.childId ?? '') +
                (problem.facts.itemId ?? '')
              }
              problem={problem}
              fixes={fixes}
              currency={currency}
              locale={locale}
              months={months}
              monthsIn={monthsIn}
              t={tx}
              noneKey={solo ? 'fixes.noneSingle' : 'fixes.none'}
              assumptions={assumptionsLine}
              onApply={applyFix}
            />
          ))}
        </div>
      </Disclosure>

      <Disclosure
        id="srovnani"
        title={t('planSections.srovnani')}
        summary={sectionSummary.srovnani}
        open={sections.srovnani ?? false}
        printing={printing}
        soloTitle={t('planSections.solo')}
        onToggle={(soloClick) => toggleSection('srovnani', soloClick)}
      >
        <Compare
          scenario={scenario}
          currency={currency}
          locale={locale}
          months={months}
          hideHeading
          onApply={(next) => setScenario(next)}
        />
      </Disclosure>

      <Disclosure
        id="citlivost"
        title={t('planSections.citlivost')}
        summary={sectionSummary.citlivost}
        open={sections.citlivost ?? false}
        printing={printing}
        soloTitle={t('planSections.solo')}
        onToggle={(soloClick) => toggleSection('citlivost', soloClick)}
      >
        <Sensitivity scenario={scenario} currency={currency} locale={locale} months={months} hideHeading />
      </Disclosure>

      <Disclosure
        id="cisla"
        title={t('planSections.cisla')}
        summary={sectionSummary.cisla}
        open={sections.cisla ?? false}
        printing={printing}
        soloTitle={t('planSections.solo')}
        onToggle={(soloClick) => toggleSection('cisla', soloClick)}
      >
        <div className="stack-lg">
          <div className="row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (!confirm(t('planner.changeCountryConfirm'))) return;
                setScenario(defaultScenario(scenario.jurisdiction === 'SK' ? 'CZ' : 'SK', startMonth, size));
                setTouched([]);
              }}
            >
              {t('planner.changeCountry')} ·{' '}
              {scenario.jurisdiction === 'SK' ? t('planner.countrySK') : t('planner.countryCZ')}
            </button>
          </div>

          <FieldGroup title={t('planner.householdShape')}>{shapeFields}</FieldGroup>
          <FieldGroup title={t('planner.netIncome')}>{incomeFields}</FieldGroup>
          <FieldGroup title={t('planner.housing')}>{housingFields}</FieldGroup>
          <FieldGroup title={t('planner.debts')}>{debtFields}</FieldGroup>
          <FieldGroup title={t('planner.expenses')}>{expenseFields}</FieldGroup>
          <FieldGroup title={t('planner.reserve')}>
            {cashFields}
            <AdvancedDisclosure id="sweep-adv" label={t('planner.sweepCap')}>
              <NumberField
                id="r-cap"
                kind="money.large"
                label={t('planner.sweepCap')}
                hint={t('planner.sweepHint')}
                value={scenario.reserve.sweepCap ?? 0}
                span={6}
                onChange={(v) => edit('reserve.sweepCap', { reserve: { ...scenario.reserve, sweepCap: v } })}
                {...numberProps}
              />
              {scenario.people.map((person, index) => (
                <NumberField
                  key={`pocket-${person.id}`}
                  id={`pocket-${person.id}`}
                  kind="money.monthly"
                  label={solo ? t('planner.pocketMoney') : `${t('planner.pocketMoney')} — ${personName(index)}`}
                  value={person.pocketMoney}
                  span={6}
                  onChange={(v) =>
                    edit(`people[${index}].pocketMoney`, {
                      people: scenario.people.map((p, i) => (i === index ? { ...p, pocketMoney: v } : p)),
                    })
                  }
                  {...numberProps}
                />
              ))}
              {scenario.people.map((person, index) => (
                <NumberField
                  key={`growth-${person.id}`}
                  id={`growth-${person.id}`}
                  kind="percent.growth"
                  label={solo ? t('planner.incomeGrowth') : `${t('planner.incomeGrowth')} — ${personName(index)}`}
                  value={person.incomeGrowthPct}
                  span={6}
                  onChange={(v) =>
                    edit(`people[${index}].incomeGrowthPct`, {
                      people: scenario.people.map((p, i) => (i === index ? { ...p, incomeGrowthPct: v } : p)),
                    })
                  }
                  {...numberProps}
                />
              ))}
              {scenario.people.map((person, index) => (
                <TextField
                  key={`name-${person.id}`}
                  id={`name-${person.id}`}
                  label={t('planner.personName')}
                  value={person.label}
                  span={6}
                  onChange={(v) =>
                    patch({
                      people: scenario.people.map((p, i) => (i === index ? { ...p, label: v } : p)),
                    })
                  }
                />
              ))}
            </AdvancedDisclosure>
          </FieldGroup>
          <FieldGroup title={t('planner.children')}>{childFields}</FieldGroup>

          <FieldGroup title={t('planner.personalInvesting')} collapsible defaultOpen={false}>
            <div className="span-12 stack">
              {scenario.people.map((person, index) => (
                <SleevesEditor
                  key={`sleeves-${person.id}`}
                  person={person}
                  personIndex={index}
                  personName={personName(index)}
                  currency={currency}
                  locale={locale}
                  onChange={(investments) =>
                    patch({
                      people: scenario.people.map((p, i) => (i === index ? { ...p, investments } : p)),
                    })
                  }
                />
              ))}
            </div>
          </FieldGroup>

          <FieldGroup title={t('envelopes.title')} collapsible defaultOpen={false}>
            <div className="span-12">
              <EnvelopesEditor
                envelopes={scenario.envelopes}
                people={scenario.people}
                result={result}
                currency={currency}
                locale={locale}
                soloLabel={solo ? t('planner.personSolo') : undefined}
                onChange={(envelopes) => patch({ envelopes })}
              />
            </div>
          </FieldGroup>
        </div>
      </Disclosure>

      <Disclosure
        id="predpoklady"
        title={t('planSections.predpoklady')}
        summary={sectionSummary.predpoklady}
        open={sections.predpoklady ?? false}
        printing={printing}
        soloTitle={t('planSections.solo')}
        onToggle={(soloClick) => toggleSection('predpoklady', soloClick)}
      >
        <div className="grid-12">
          <NumberField
            id="cpi"
            kind="percent.growth"
            label={t('planner.cpi')}
            value={scenario.assumptions.cpiPct}
            span={4}
            onChange={(v) => edit('assumptions.cpiPct', { assumptions: { ...scenario.assumptions, cpiPct: v } })}
            {...numberProps}
          />
          <NumberField
            id="horizon"
            kind="year"
            label={t('planner.horizon')}
            value={scenario.assumptions.horizonYear}
            min={startMonth.year}
            max={startMonth.year + 70}
            span={4}
            onChange={(v) =>
              edit('assumptions.horizonYear', { assumptions: { ...scenario.assumptions, horizonYear: v } })
            }
            {...numberProps}
          />
          <NumberField
            id="floor-months"
            kind="months"
            label={t('planner.reserveFloorMonths')}
            unit={t('units.months')}
            value={scenario.assumptions.reserveFloorMonths}
            min={0}
            max={24}
            span={4}
            onChange={(v) =>
              edit('assumptions.reserveFloorMonths', {
                assumptions: { ...scenario.assumptions, reserveFloorMonths: v },
              })
            }
            {...numberProps}
          />
          <p className="muted span-12" style={{ margin: 0, fontSize: 12 }}>
            {assumptionsLine}
          </p>
        </div>
      </Disclosure>

      <Disclosure
        id="export"
        title={t('planSections.export')}
        open={sections.export ?? true}
        printing={printing}
        soloTitle={t('planSections.solo')}
        onToggle={(soloClick) => toggleSection('export', soloClick)}
      >
        <div className="stack">
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              data-loading={busy === 'save' ? 'true' : undefined}
              aria-busy={busy === 'save' || undefined}
              onClick={handleSave}
            >
              {t('planner.save')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              data-loading={busy === 'share' ? 'true' : undefined}
              aria-busy={busy === 'share' || undefined}
              onClick={() => void handleShare()}
            >
              {t('share.button')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              data-loading={busy === 'export' ? 'true' : undefined}
              aria-busy={busy === 'export' || undefined}
              onClick={handleExport}
            >
              {t('planner.export')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              data-loading={busy === 'import' ? 'true' : undefined}
              aria-busy={busy === 'import' || undefined}
              onClick={() => fileRef.current?.click()}
            >
              {t('planner.import')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              {t('planSections.printPdf')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImportFile(file);
              }}
            />
            {/* Reset wipes the plan. It used to look exactly like Export. */}
            <button
              type="button"
              className="btn btn-danger btn-sm"
              style={{ marginInlineStart: 'auto' }}
              onClick={() => {
                if (!confirm(t('planner.resetConfirm'))) return;
                clearPlan(scenario.jurisdiction);
                setScenario(defaultScenario(scenario.jurisdiction, startMonth, size));
                setTouched([]);
                setRecap([]);
                setStage('onboarding');
                setStep(0);
              }}
            >
              {t('planner.reset')}
            </button>
          </div>
          <div className="row">
            {savedAt && (
              <span className="muted" style={{ fontSize: 13 }}>
                {t('planner.saved', {
                  when: new Date(savedAt).toLocaleString(locale === 'sk' ? 'sk-SK' : 'cs-CZ'),
                })}
              </span>
            )}
            {importError && (
              <span style={{ fontSize: 13, color: 'var(--status-critical-text)' }}>
                {t('planner.importFailed')}
              </span>
            )}
            {shareState !== 'idle' && (
              <span
                style={{
                  fontSize: 13,
                  color:
                    shareState === 'copied'
                      ? 'var(--status-good-text)'
                      : 'var(--status-critical-text)',
                }}
              >
                {shareState === 'copied' ? t('share.copied') : t('share.failed')}
              </span>
            )}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {t('share.hint')}
          </p>
        </div>
      </Disclosure>

      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {t('planner.computedAt', { date: today })} {t('disclaimer.short')}
      </p>
    </div>
  );
}

function kindSuffix(kind: Liability['kind']): string {
  return kind === 'car-loan'
    ? 'Car'
    : kind === 'consumer-loan'
      ? 'Consumer'
      : kind === 'credit-card'
        ? 'Card'
        : 'Other';
}

export function chartLabels(t: ReturnType<typeof useTranslations>) {
  return {
    title: t('chart.title'),
    reserve: t('chart.reserve'),
    floorShort: t('chart.floorShort'),
    trough: t('chart.trough'),
    showTable: t('chart.showTable'),
    hideTable: t('chart.hideTable'),
    tableYear: t('chart.tableYear'),
    tableReserve: t('chart.tableReserve'),
    tableInvest: t('chart.tableInvest'),
    tableMortgage: t('chart.tableMortgage'),
    tableNetWorth: t('chart.tableNetWorth'),
    invest: t('chart.invest'),
    exportPng: t('chart.exportPng'),
  };
}
