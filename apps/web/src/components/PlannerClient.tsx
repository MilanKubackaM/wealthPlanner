'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  analyse,
  buildLevers,
  detectProblems,
  simulate,
  type Recommendation,
  type ScenarioInput,
  type YearMonth,
} from '@wealthplanner/engine';
import { jurisdictionFor, type JurisdictionCode } from '@wealthplanner/jurisdictions';
import { defaultScenario, withRegime } from '@/lib/defaults';
import { exportPlan, importPlan, loadPlan, savePlan } from '@/lib/storage';
import { money, monthPhrase, type UiLocale } from '@/lib/format';
import { ReserveChart } from './ReserveChart';
import { ProblemCard } from './ProblemCard';
import { Fieldset, MonthYearInput, NumberInput, SelectInput, StatTile } from './fields';
import { Compare } from './Compare';
import { EnvelopesEditor } from './EnvelopesEditor';
import { SleevesEditor } from './SleevesEditor';
import { decodeScenario, shareUrl } from '@/lib/share';
import { Sensitivity } from './Sensitivity';

/**
 * The planner. Two different recompute rhythms, chosen from measurement rather than taste:
 *
 *   simulate()  ~0.9 ms  → runs synchronously on every keystroke, so the chart tracks typing.
 *   recommend() ~89 ms   → about a hundred full simulations per pass, so it is debounced and
 *                          run inside a transition. On a slow phone that figure is several
 *                          hundred milliseconds, and blocking a keystroke on it would make
 *                          the whole product feel broken.
 */

const RECOMMEND_DEBOUNCE_MS = 220;

type Stage = 'onboarding' | 'plan';

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
  const months = t.raw('months') as string[];
  const monthsIn = t.raw('monthsIn') as string[];

  const [scenario, setScenario] = useState<ScenarioInput>(() =>
    defaultScenario(locale === 'sk' ? 'SK' : 'CZ', startMonth),
  );
  const [stage, setStage] = useState<Stage>('onboarding');
  const [step, setStep] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [staleEngine, setStaleEngine] = useState(false);
  const [importError, setImportError] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [fromLink, setFromLink] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /*
   * A shared link wins over anything in storage — someone who opens a link came to see THAT
   * plan. Otherwise a stored plan skips onboarding, because nobody wants the wizard twice.
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
          setStage('plan');
          return;
        }
      }
      const stored = loadPlan();
      if (stored && !cancelled) {
        setScenario(stored.scenario);
        setSavedAt(stored.savedAt);
        setStaleEngine(stored.staleEngine);
        setStage('plan');
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(() => simulate(scenario), [scenario]);

  const [analysis, setAnalysis] = useState<ReturnType<typeof analyse>>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const jurisdiction = jurisdictionFor(scenario.jurisdiction);
    const handle = setTimeout(() => {
      const problems = detectProblems(scenario, result, {
        typicalSavingsRatePct: jurisdiction.typicalTopSavingsRatePct.value,
      });
      startTransition(() => setAnalysis(analyse(scenario, problems)));
    }, RECOMMEND_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [scenario, result]);

  const patch = useCallback((next: Partial<ScenarioInput>) => {
    setScenario((current) => ({ ...current, ...next }));
  }, []);

  const applyFix = useCallback((fix: Recommendation) => {
    setScenario((current) => {
      const lever = buildLevers(current).find((l) => l.id === fix.leverId);
      return lever ? lever.set(current, fix.to) : current;
    });
  }, []);

  const setJurisdiction = useCallback(
    (code: JurisdictionCode) => {
      /* Switching country changes the currency, the benefit rules and every sane default. */
      setScenario(defaultScenario(code, startMonth));
    },
    [startMonth],
  );

  const currency = scenario.currency;
  const jurisdiction = jurisdictionFor(scenario.jurisdiction);

  function handleSave() {
    savePlan(scenario);
    const stored = loadPlan();
    setSavedAt(stored?.savedAt ?? null);
    setStaleEngine(false);
  }

  function handleExport() {
    const blob = new Blob([exportPlan(scenario)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'plan.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    try {
      const url = await shareUrl(scenario, window.location.origin, window.location.pathname);
      await navigator.clipboard.writeText(url);
      setShareState('copied');
    } catch {
      setShareState('failed');
    }
    setTimeout(() => setShareState('idle'), 2500);
  }

  async function handleImportFile(file: File) {
    const parsed = importPlan(await file.text());
    if (parsed) {
      setScenario(withRegime(parsed));
      setImportError(false);
      setStage('plan');
    } else {
      setImportError(true);
    }
  }

  /* ------------------------------------------------------------------ fields ---- */

  const personFields = (index: number) => {
    const person = scenario.people[index];
    if (!person) return null;
    return (
      <Fieldset key={person.id} title={t('planner.person', { n: index + 1 })}>
        <NumberInput
          id={`income-${person.id}`}
          label={t('planner.netIncome')}
          value={person.netMonthlyIncome}
          step={currency === 'CZK' ? 1000 : 50}
          min={0}
          onChange={(v) =>
            patch({
              people: scenario.people.map((p, i) =>
                i === index ? { ...p, netMonthlyIncome: v } : p,
              ),
            })
          }
        />
        <NumberInput
          id={`growth-${person.id}`}
          label={t('planner.incomeGrowth')}
          suffix="%"
          value={person.incomeGrowthPct}
          step={0.5}
          onChange={(v) =>
            patch({
              people: scenario.people.map((p, i) => (i === index ? { ...p, incomeGrowthPct: v } : p)),
            })
          }
        />
        <NumberInput
          id={`pocket-${person.id}`}
          label={t('planner.pocketMoney')}
          value={person.pocketMoney}
          step={currency === 'CZK' ? 500 : 25}
          min={0}
          onChange={(v) =>
            patch({
              people: scenario.people.map((p, i) => (i === index ? { ...p, pocketMoney: v } : p)),
            })
          }
        />
      </Fieldset>
    );
  };

  const mortgage = scenario.mortgages[0];
  const mortgageFields = mortgage ? (
    <Fieldset title={t('planner.mortgage')}>
      <NumberInput
        id="m-balance"
        label={t('planner.mortgageBalance')}
        value={mortgage.balance}
        step={currency === 'CZK' ? 50_000 : 2_000}
        min={0}
        onChange={(v) => patch({ mortgages: [{ ...mortgage, balance: v }] })}
      />
      <NumberInput
        id="m-rate"
        label={t('planner.mortgageRate')}
        suffix="%"
        value={mortgage.annualRatePct}
        step={0.1}
        min={0}
        onChange={(v) => patch({ mortgages: [{ ...mortgage, annualRatePct: v }] })}
      />
      <NumberInput
        id="m-payment"
        label={t('planner.mortgagePayment')}
        value={mortgage.monthlyPayment}
        step={currency === 'CZK' ? 500 : 25}
        min={0}
        onChange={(v) => patch({ mortgages: [{ ...mortgage, monthlyPayment: v }] })}
      />
      {mortgage.rateResets.length === 0 ? (
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              patch({
                mortgages: [
                  {
                    ...mortgage,
                    rateResets: [
                      {
                        at: { year: startMonth.year + 3, month: 0 },
                        newAnnualRatePct: jurisdiction.typicalMortgageRatePct.value + 1,
                      },
                    ],
                  },
                ],
              })
            }
          >
            {t('planner.refixAdd')}
          </button>
          <span className="hint">
            {t('planner.refixHint', {
              rate: `${jurisdiction.typicalMortgageRatePct.value} %`,
            })}
          </span>
        </div>
      ) : (
        <>
          <MonthYearInput
            id="refix-at"
            label={t('planner.refixAt')}
            months={months}
            value={mortgage.rateResets[0]!.at}
            minYear={startMonth.year}
            maxYear={scenario.assumptions.horizonYear}
            onChange={(at) =>
              patch({
                mortgages: [
                  { ...mortgage, rateResets: [{ ...mortgage.rateResets[0]!, at }] },
                ],
              })
            }
          />
          <NumberInput
            id="refix-rate"
            label={t('planner.refixRate')}
            suffix="%"
            step={0.1}
            value={mortgage.rateResets[0]!.newAnnualRatePct}
            onChange={(v) =>
              patch({
                mortgages: [
                  {
                    ...mortgage,
                    rateResets: [{ ...mortgage.rateResets[0]!, newAnnualRatePct: v }],
                  },
                ],
              })
            }
          />
        </>
      )}
    </Fieldset>
  ) : null;

  const expenseLabel = (id: string) =>
    ({
      utilities: t('planner.expenseUtilities'),
      insurance: t('planner.expenseInsurance'),
      groceries: t('planner.expenseGroceries'),
      other: t('planner.expenseOther'),
    })[id] ?? id;

  const expenseFields = (
    <Fieldset title={t('planner.expenses')}>
      {scenario.expenses.map((expense, index) => (
        <NumberInput
          key={expense.id}
          id={`exp-${expense.id}`}
          label={expenseLabel(expense.id)}
          suffix={expense.kind === 'fixed' ? t('planner.expenseFixed') : t('planner.expenseVariable')}
          value={expense.monthlyAmount}
          step={currency === 'CZK' ? 500 : 25}
          min={0}
          onChange={(v) =>
            patch({
              expenses: scenario.expenses.map((e, i) =>
                i === index ? { ...e, monthlyAmount: v } : e,
              ),
            })
          }
        />
      ))}
    </Fieldset>
  );

  const reserveFields = (
    <>
      <Fieldset title={t('planner.reserve')}>
        <NumberInput
          id="r-balance"
          label={t('planner.reserveBalance')}
          value={scenario.reserve.balance}
          step={currency === 'CZK' ? 10_000 : 500}
          min={0}
          onChange={(v) => patch({ reserve: { ...scenario.reserve, balance: v } })}
        />
        <NumberInput
          id="r-rate"
          label={t('planner.reserveRate')}
          suffix="%"
          step={0.25}
          value={scenario.reserve.annualRatePct}
          onChange={(v) => patch({ reserve: { ...scenario.reserve, annualRatePct: v } })}
        />
        <NumberInput
          id="r-cap"
          label={t('planner.sweepCap')}
          hint={t('planner.sweepHint')}
          value={scenario.reserve.sweepCap ?? 0}
          step={currency === 'CZK' ? 50_000 : 2_000}
          min={0}
          onChange={(v) =>
            patch({ reserve: { ...scenario.reserve, sweepCap: v <= 0 ? null : v } })
          }
        />
      </Fieldset>
      <Fieldset title={t('planner.investing')}>
        <NumberInput
          id="dca"
          label={t('planner.dca')}
          value={scenario.jointInvesting.monthlyContribution}
          step={currency === 'CZK' ? 500 : 25}
          min={0}
          onChange={(v) =>
            patch({ jointInvesting: { ...scenario.jointInvesting, monthlyContribution: v } })
          }
        />
        <NumberInput
          id="ret"
          label={t('planner.expectedReturn')}
          suffix="%"
          step={0.5}
          value={scenario.jointInvesting.annualReturnPct}
          onChange={(v) =>
            patch({ jointInvesting: { ...scenario.jointInvesting, annualReturnPct: v } })
          }
        />
      </Fieldset>
    </>
  );

  const childFields = (
    <Fieldset title={t('planner.children')} columns={1}>
      <div style={{ display: 'grid', gap: 14 }}>
        {scenario.children.map((child, index) => (
          <div
            key={child.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 14 }}>{t('planner.childLabel', { n: index + 1 })}</strong>
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 10px', fontSize: 13 }}
                onClick={() =>
                  patch({ children: scenario.children.filter((_, i) => i !== index) })
                }
              >
                {t('planner.childRemove')}
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              }}
            >
              <MonthYearInput
                id={`child-birth-${child.id}`}
                label={t('planner.childBirth')}
                months={months}
                value={child.birth}
                minYear={startMonth.year}
                maxYear={scenario.assumptions.horizonYear}
                onChange={(birth) =>
                  patch({
                    children: scenario.children.map((c, i) => (i === index ? { ...c, birth } : c)),
                  })
                }
              />
              <NumberInput
                id={`child-cost-${child.id}`}
                label={t('planner.childCost')}
                value={child.monthlyCost}
                step={currency === 'CZK' ? 500 : 25}
                min={0}
                onChange={(v) =>
                  patch({
                    children: scenario.children.map((c, i) =>
                      i === index ? { ...c, monthlyCost: v } : c,
                    ),
                  })
                }
              />
              <SelectInput
                id={`child-who-${child.id}`}
                label={t('planner.childLeaveBy')}
                value={child.leaveTakenBy}
                options={scenario.people.map((p, i) => ({
                  value: p.id,
                  label: p.label || t('planner.person', { n: i + 1 }),
                }))}
                onChange={(leaveTakenBy) =>
                  patch({
                    children: scenario.children.map((c, i) =>
                      i === index ? { ...c, leaveTakenBy } : c,
                    ),
                  })
                }
              />
              <NumberInput
                id={`child-parental-${child.id}`}
                label={t('planner.childParentalMonths')}
                suffix={t('planner.monthUnit')}
                value={child.leavePlan.parentalMonths}
                min={0}
                max={36}
                onChange={(v) =>
                  patch({
                    children: scenario.children.map((c, i) =>
                      i === index
                        ? { ...c, leavePlan: { ...c.leavePlan, parentalMonths: v } }
                        : c,
                    ),
                  })
                }
              />
              <NumberInput
                id={`child-return-${child.id}`}
                label={t('planner.childReturnPct')}
                suffix="%"
                hint={t('planner.childReturnHint')}
                value={child.leavePlan.returnToWorkPct}
                min={0}
                max={100}
                step={5}
                onChange={(v) =>
                  patch({
                    children: scenario.children.map((c, i) =>
                      i === index
                        ? { ...c, leavePlan: { ...c.leavePlan, returnToWorkPct: v } }
                        : c,
                    ),
                  })
                }
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          style={{ justifySelf: 'start' }}
          onClick={() =>
            patch({
              children: [
                ...scenario.children,
                {
                  id: `c${scenario.children.length + 1}-${startMonth.year}`,
                  label: '',
                  birth: { year: startMonth.year + 2, month: startMonth.month },
                  monthlyCost: currency === 'CZK' ? 6_000 : 250,
                  costUntilAgeYears: 22,
                  costTaperYears: 3,
                  leaveTakenBy: scenario.people[1]?.id ?? scenario.people[0]?.id ?? 'p1',
                  leavePlan: { parentalMonths: 24, returnToWorkPct: 100 },
                },
              ],
            })
          }
        >
          {t('planner.childAdd')}
        </button>
      </div>
    </Fieldset>
  );

  /* -------------------------------------------------------------- onboarding ---- */

  const STEPS = 4;
  if (stage === 'onboarding') {
    const stepBody = [
      <>
        <SelectInput
          id="country"
          label={t('planner.country')}
          value={scenario.jurisdiction}
          options={[
            { value: 'CZ' as JurisdictionCode, label: t('planner.countryCZ') },
            { value: 'SK' as JurisdictionCode, label: t('planner.countrySK') },
          ]}
          onChange={setJurisdiction}
        />
        {scenario.people.map((_, index) => personFields(index))}
      </>,
      <>
        {mortgageFields}
        {expenseFields}
      </>,
      reserveFields,
      childFields,
    ][step];

    return (
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="card" style={{ display: 'grid', gap: 16 }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('onboarding.progress', { step: step + 1, total: STEPS })}
            </p>
            <h2 style={{ fontSize: 22, marginTop: 4 }}>{t(`onboarding.step${step + 1}.title`)}</h2>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
              {t(`onboarding.step${step + 1}.body`)}
            </p>
          </div>

          {/* progress bar doubles as an affordance that this is short */}
          <div style={{ display: 'flex', gap: 5 }} aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <span
                key={i}
                style={{
                  height: 4,
                  flex: 1,
                  borderRadius: 999,
                  background: i <= step ? 'var(--accent)' : 'var(--grid)',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'grid', gap: 18 }}>{stepBody}</div>

          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {t('onboarding.estimateNote')}
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {step > 0 && (
              <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>
                {t('onboarding.back')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (step === STEPS - 1 ? setStage('plan') : setStep((s) => s + 1))}
            >
              {step === STEPS - 1 ? t('onboarding.finish') : t('onboarding.next')}
            </button>
            <button
              type="button"
              className="btn"
              style={{ marginInlineStart: 'auto' }}
              onClick={() => setStage('plan')}
            >
              {t('onboarding.skip')}
            </button>
          </div>
        </div>

        {/* The projection is visible during onboarding, so every answer visibly moves it. */}
        <div className="card">
          <ReserveChart
            result={result}
            currency={currency}
            locale={locale}
            months={months}
            labels={chartLabels(t)}
          />
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------- plan ---- */

  const cashProblems = analysis.filter(({ problem }) => problem.severity !== 'info');
  const infoProblems = analysis.filter(({ problem }) => problem.severity === 'info');

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {fromLink && (
        <p
          className="card"
          style={{ margin: 0, borderLeft: '3px solid var(--accent)', fontSize: 14 }}
        >
          {t('share.loadedFromLink')}
        </p>
      )}

      {staleEngine && (
        <p
          className="card"
          style={{ margin: 0, borderLeft: '3px solid var(--status-warning)', fontSize: 14 }}
        >
          {t('planner.staleEngine')}
        </p>
      )}

      <div className="card">
        <ReserveChart
          result={result}
          currency={currency}
          locale={locale}
          months={months}
          labels={chartLabels(t)}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}
      >
        <StatTile
          label={t('planner.summaryMinReserve')}
          value={money(result.minReserve, currency, locale)}
          tone={result.minReserve < 0 ? 'critical' : result.worstFloorGap < 0 ? 'warning' : 'good'}
        />
        <StatTile
          label={t('planner.summaryNetWorth', { year: scenario.assumptions.horizonYear })}
          value={money(result.finalNetWorth, currency, locale)}
        />
        <StatTile
          label={t('planner.summaryMortgagePaid')}
          value={
            result.mortgagePaidYear
              ? String(result.mortgagePaidYear)
              : t('planner.summaryMortgageNever')
          }
        />
        {result.foregoneIncome > 0 && (
          <StatTile
            label={t('planner.summaryForegone')}
            value={money(result.foregoneIncome, currency, locale)}
          />
        )}
      </div>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 20 }}>{t('problems.heading')}</h2>
          {isPending && (
            <span className="muted" style={{ fontSize: 13 }}>
              {t('planner.recomputing')}
            </span>
          )}
        </div>

        {cashProblems.length === 0 && (
          <div className="card" style={{ borderLeft: '3px solid var(--status-good)' }}>
            <h3 style={{ fontSize: 17 }}>{t('problems.noneTitle')}</h3>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
              {t('problems.noneBody')}
            </p>
          </div>
        )}

        {[...cashProblems, ...infoProblems].map(({ problem, fixes }) => (
          <ProblemCard
            key={problem.id + (problem.facts.personId ?? '') + (problem.facts.childId ?? '')}
            problem={problem}
            fixes={fixes}
            currency={currency}
            locale={locale}
            months={months}
            monthsIn={monthsIn}
            t={t as unknown as (key: string, values?: Record<string, string | number>) => string}
            assumptions={t('assumptions.inline', {
              return: `${scenario.jointInvesting.annualReturnPct} %`,
              cpi: `${scenario.assumptions.cpiPct} %`,
              floor: scenario.assumptions.reserveFloorMonths,
              date: today,
            })}
            onApply={applyFix}
          />
        ))}
      </section>

      <Compare
        scenario={scenario}
        currency={currency}
        locale={locale}
        months={months}
        onApply={(next) => setScenario(next)}
      />

      <Sensitivity scenario={scenario} currency={currency} locale={locale} months={months} />

      <section className="card" style={{ display: 'grid', gap: 20 }}>
        <SelectInput
          id="country-plan"
          label={t('planner.country')}
          value={scenario.jurisdiction}
          options={[
            { value: 'CZ' as JurisdictionCode, label: t('planner.countryCZ') },
            { value: 'SK' as JurisdictionCode, label: t('planner.countrySK') },
          ]}
          onChange={setJurisdiction}
        />
        {scenario.people.map((_, index) => personFields(index))}
        {mortgageFields}
        {expenseFields}
        {reserveFields}
        {scenario.people.map((person, index) => (
          <SleevesEditor
            key={`sleeves-${person.id}`}
            person={person}
            personIndex={index}
            currency={currency}
            locale={locale}
            onChange={(investments) =>
              patch({
                people: scenario.people.map((p, i) => (i === index ? { ...p, investments } : p)),
              })
            }
          />
        ))}
        <EnvelopesEditor
          envelopes={scenario.envelopes}
          people={scenario.people}
          result={result}
          currency={currency}
          locale={locale}
          onChange={(envelopes) => patch({ envelopes })}
        />
        {childFields}
        <Fieldset title={t('planner.assumptions')}>
          <NumberInput
            id="cpi"
            label={t('planner.cpi')}
            suffix="%"
            step={0.25}
            value={scenario.assumptions.cpiPct}
            onChange={(v) => patch({ assumptions: { ...scenario.assumptions, cpiPct: v } })}
          />
          <NumberInput
            id="horizon"
            label={t('planner.horizon')}
            value={scenario.assumptions.horizonYear}
            min={startMonth.year}
            max={startMonth.year + 70}
            onChange={(v) => patch({ assumptions: { ...scenario.assumptions, horizonYear: v } })}
          />
          <NumberInput
            id="floor-months"
            label={t('planner.reserveFloorMonths')}
            suffix={t('planner.monthUnit')}
            value={scenario.assumptions.reserveFloorMonths}
            min={0}
            max={24}
            onChange={(v) =>
              patch({ assumptions: { ...scenario.assumptions, reserveFloorMonths: v } })
            }
          />
        </Fieldset>
      </section>

      <footer style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            {t('planner.save')}
          </button>
          <button type="button" className="btn" onClick={() => void handleShare()}>
            {t('share.button')}
          </button>
          <button type="button" className="btn" onClick={handleExport}>
            {t('planner.export')}
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {t('planner.import')}
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
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!confirm(t('planner.resetConfirm'))) return;
              setScenario(defaultScenario(scenario.jurisdiction, startMonth));
              setStage('onboarding');
              setStep(0);
            }}
          >
            {t('planner.reset')}
          </button>
          {savedAt && (
            <span className="muted" style={{ fontSize: 13 }}>
              {t('planner.saved', {
                when: new Date(savedAt).toLocaleString(locale === 'sk' ? 'sk-SK' : 'cs-CZ'),
              })}
            </span>
          )}
          {importError && (
            <span style={{ fontSize: 13, color: 'var(--status-critical)' }}>
              {t('planner.importFailed')}
            </span>
          )}
          {shareState !== 'idle' && (
            <span
              style={{
                fontSize: 13,
                color: shareState === 'copied' ? 'var(--status-good)' : 'var(--status-critical)',
              }}
            >
              {shareState === 'copied' ? t('share.copied') : t('share.failed')}
            </span>
          )}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {t('share.hint')}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {t('planner.computedAt', { date: today })} {t('disclaimer.short')}
        </p>
      </footer>
    </div>
  );
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
    exportPng: t('chart.exportPng'),
  };
}

/** Exported for the landing page, which needs the same sentence the planner shows. */
export function troughSentence(
  result: { minReserve: number; minReserveAt: YearMonth | null },
  currency: 'CZK' | 'EUR',
  locale: UiLocale,
  monthsIn: string[],
): string {
  return `${money(result.minReserve, currency, locale)} · ${monthPhrase(result.minReserveAt, monthsIn)}`;
}
