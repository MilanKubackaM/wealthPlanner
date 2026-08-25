'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  analyse,
  buildLevers,
  criterionFor,
  detectProblems,
  simulate,
  type Recommendation,
  type ScenarioInput,
  type YearMonth,
} from '@wealthplanner/engine';
import { jurisdictionFor } from '@wealthplanner/jurisdictions';
import { countryFor, demoScenario } from '@/lib/defaults';
import { money, monthPhrase, type UiLocale } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { ReserveChart } from './ReserveChart';
import { chartLabels } from './PlannerClient';

/**
 * The landing page shows a working projection, already populated, above the fold — not a
 * blank form and not a stock photograph. A stranger has to see the payoff before deciding
 * whether to spend a single minute on this.
 *
 * But an unlabelled chart of numbers nobody entered is a worse first impression than no chart:
 * the visitor cannot tell whether it is their data, sample data, or decoration. So it is named
 * as an example, given the household it belongs to, and told as three sentences — who they are,
 * what the model found, and what the visitor gets if they answer the same questions. Every
 * figure in that story is interpolated from the scenario the chart is drawn from, so the prose
 * and the picture cannot drift apart.
 *
 * The scenario is the national-average household plus a child in three years. That one
 * addition is what turns a comfortable plan into a cash trough.
 */
/** `children[0].leavePlan.parentalMonths` -> `children_parentalMonths` (next-intl reads a dot as a path). */
function leverKey(leverId: string): string {
  return leverId.replace(/\[\d+\]/g, '').replace('.leavePlan.', '.').replace(/\./g, '_');
}

function isMonthLever(leverId: string): boolean {
  return leverId.endsWith('parentalMonths');
}

export function LandingHero({ locale, startMonth }: { locale: UiLocale; startMonth: YearMonth }) {
  const t = useTranslations();
  const months = t.raw('months') as string[];
  const monthsIn = t.raw('monthsIn') as string[];
  /* Which option's proof is open, by lever id. One at a time, and none by default. */
  const [openProof, setOpenProof] = useState<string | null>(null);
  /*
   * The applied option, by lever id.
   *
   * Exactly ONE at a time, and that is a correctness constraint rather than a simplification:
   * each option's before/after was computed against the untouched household, so two of them
   * stacked would be two proofs about a situation that no longer exists. Applying a second one
   * therefore replaces the first, which is also what "one of these" promises.
   */
  const [applied, setApplied] = useState<string | null>(null);

  /* The example as authored, and the findings, which stay computed from THIS one. */
  const { base, fixes } = useMemo(() => {
    const code = countryFor(locale);
    const s = demoScenario(code, startMonth);
    const problems = detectProblems(s, simulate(s), {
      typicalSavingsRatePct: jurisdictionFor(code).typicalTopSavingsRatePct.value,
      retirementAgeYears: jurisdictionFor(code).statutoryRetirementAgeYears.value,
    });
    const fixable = problems.filter((p) => criterionFor(p) !== null);
    const analysed = fixable.length > 0 ? analyse(s, [fixable[0]!]) : [];
    return {
      base: s,
      /*
       * All of them, least drastic first — up to three.
       *
       * This used to take `fixes[0]` and drop the rest on the floor. The engine finds three
       * verified ways out of the demo's deficit, and showing one made the product look like it
       * has a single opinion. The whole claim is that it searches the input space and proves
       * what it finds; a list of alternatives IS the claim, and one line is the claim hidden.
       *
       * Deliberately derived from the UNTOUCHED household, so applying an option does not make
       * the list of options vanish underneath the person who just used it.
       */
      fixes: (analysed[0]?.fixes ?? []).slice(0, 3),
    };
  }, [locale, startMonth]);

  const appliedFix: Recommendation | null = fixes.find((f) => f.leverId === applied) ?? null;

  /* What the chart and the headline are actually about: the household as it now stands. */
  const scenario: ScenarioInput = useMemo(() => {
    if (!appliedFix) return base;
    const lever = buildLevers(base).find((l) => l.id === appliedFix.leverId);
    return lever ? lever.set(base, appliedFix.to) : base;
  }, [base, appliedFix]);

  const result = useMemo(() => simulate(scenario), [scenario]);

  /* Re-detected, so the sentence over the chart reports the household on screen, not the old one. */
  const headline = useMemo(() => {
    const code = countryFor(locale);
    const problems = detectProblems(scenario, result, {
      typicalSavingsRatePct: jurisdictionFor(code).typicalTopSavingsRatePct.value,
      retirementAgeYears: jurisdictionFor(code).statutoryRetirementAgeYears.value,
    });
    return problems.filter((p) => criterionFor(p) !== null)[0] ?? null;
  }, [locale, scenario, result]);

  const currency = base.currency;

  /* Read off the scenario, never typed into the copy: the story cannot contradict the chart. */
  const mortgage = base.housing.kind === 'own' ? base.housing.mortgages[0] : undefined;
  /*
   * Bullets, not a paragraph. Five figures inside one block of prose is a block of prose the
   * visitor skims past; the whole point of the example is that they can absorb the household
   * in a glance and then look at the chart. Each entry is still interpolated from `base`.
   */
  const facts: string[] = [
    t('landing.factIncome', { income: money(base.people[0]?.netMonthlyIncome ?? 0, currency, locale) }),
    t('landing.factMortgage', { mortgage: money(mortgage?.balance ?? 0, currency, locale) }),
    t('landing.factReserve', { reserve: money(base.reserve.balance, currency, locale) }),
    t('landing.factInvest', {
      invest: money(base.jointInvesting.monthlyContribution, currency, locale),
    }),
    t('landing.factChild', {
      childYear: base.children[0]?.birth.year ?? base.assumptions.start.year + 3,
    }),
  ];

  /*
   * The verdict over the chart, in three states.
   *
   * Keyed on the DEFICIT — the finding every option was proven against — and not on "no
   * findings at all", which in this example never happens: each of the three options clears
   * the reserve going below zero and each leaves the milder "below the recommended minimum"
   * behind. A rule of "green only when nothing is left" would therefore never go green, and
   * the visitor would press Apply, watch the chart lift clear of zero, and still be told off.
   *
   *   alarm    — the reserve goes below zero. Red, with an exclamation mark.
   *   fixed    — applied, and nothing is left. Green, with a tick.
   *   improved — applied, the deficit is gone, something milder remains. Green tick on what
   *              was actually solved, and the remainder named underneath in a quieter voice
   *              rather than shouted as the headline. Green because the claim the option made
   *              came true, and the remainder is stated in the same breath, so nothing is hidden.
   */
  const cleared = appliedFix !== null && result.deficitAt === null;
  const verdict: 'alarm' | 'fixed' | 'improved' = !cleared
    ? 'alarm'
    : headline === null
      ? 'fixed'
      : 'improved';

  /** The one highlight, so `<hi>` in a message becomes the eye-catching part of the sentence. */
  const hi = (chunks: React.ReactNode) => <strong className="verdict-amount">{chunks}</strong>;

  const problemValues = headline
    ? {
        when: monthPhrase(headline.facts.at ?? null, monthsIn),
        worstWhen: monthPhrase(headline.facts.worstAt ?? headline.facts.at ?? null, monthsIn),
        amount: money(headline.facts.amount ?? 0, currency, locale),
        gap: money(headline.facts.gap ?? 0, currency, locale),
        floor: money(headline.facts.floor ?? 0, currency, locale),
        months: headline.facts.months ?? 0,
        rate: '',
        suggested: '',
        shareNow: '',
        shareEnd: '',
      }
    : null;

  /*
   * `reserve-deficit` gets its own landing-only copy so the closing amount can be wrapped in
   * `<hi>`. The shared `problems.*.title` messages are rendered by the planner with a plain
   * `t()`, so putting a tag in them would break that call — and this is the one sentence on
   * the site that has to hit the reader in the face. Any other finding falls back to the
   * shared sentence, unhighlighted, rather than being silently dropped.
   */
  const alarmSentence =
    headline && problemValues ? (
      headline.id === 'reserve-deficit' ? (
        t.rich('landing.verdictDeficit', { ...problemValues, hi })
      ) : (
        t(`problems.${headline.id}.title`, problemValues)
      )
    ) : null;

  /* next-intl types keys literally; the lever labels are assembled. */
  const tx = (key: string) => t(key as never);

  return (
    <div className="card example" style={{ display: 'grid', gap: 16 }}>
      <header className="example-head">
        <p className="example-badge">{t('landing.exampleBadge')}</p>
        <h2 className="example-title">{t('landing.exampleTitle')}</h2>
        <p className="example-story">{t('landing.exampleIntro')}</p>
        <ul className="example-facts">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </header>

      <ReserveChart
        result={result}
        currency={currency}
        locale={locale}
        months={months}
        labels={chartLabels(t)}
      />

      {/*
        The one sentence a visitor reads. `role="status"` because pressing Apply changes it
        without moving focus, and the change — red exclamation to green tick — is the whole
        point of pressing the button.
      */}
      <div className="verdict" data-state={verdict} role="status" aria-live="polite">
        <span className="verdict-mark" aria-hidden="true">
          {verdict === 'alarm' ? '!' : '\u2713'}
        </span>
        <div className="verdict-body">
          <p className="verdict-line">
            {/* The colour and the glyph carry meaning, so it is also said in words. */}
            <span className="sr-only">
              {t(verdict === 'alarm' ? 'landing.verdictProblem' : 'landing.verdictSolved')}
              {': '}
            </span>
            {verdict === 'alarm'
              ? (alarmSentence ??
                t.rich('landing.verdictHealthy', {
                  floor: money(result.reserveFloor, currency, locale),
                  hi,
                }))
              : t.rich('landing.verdictFixed', {
                  amount: money(result.minReserve, currency, locale),
                  hi,
                })}
          </p>
          {verdict === 'improved' && alarmSentence ? (
            <p className="verdict-rest">
              {t('landing.verdictRest')} {alarmSentence}
            </p>
          ) : null}
        </div>
      </div>

      {fixes.length > 0 && (
        /* Highlighted as a unit: this is the thing the page most wants the visitor to look at. */
        <section className="suggest" aria-labelledby="suggest-title">
          <h3 id="suggest-title" className="suggest-title">
            {t(fixes.length > 1 ? 'landing.suggestMany' : 'landing.suggestOne', {
              count: fixes.length,
            })}
          </h3>

          <ul className="suggest-list">
            {fixes.map((option) => {
              const key = leverKey(option.leverId);
              const months = isMonthLever(option.leverId);
              const show = (v: number) =>
                months ? t('planner.months', { count: Math.round(v) }) : money(v, currency, locale);
              const open = openProof === option.leverId;
              const isApplied = applied === option.leverId;
              return (
                <li
                  key={option.leverId}
                  className="suggest-item"
                  data-applied={isApplied ? 'true' : undefined}
                >
                  <div className="suggest-row">
                    <p className="suggest-what">
                      <span className="suggest-lever">
                        {tx(`fixes.levers.${key}`)}
                        {/* The accepted change stays named and marked, so it is always clear
                            which one the picture below is showing. */}
                        {isApplied ? (
                          <span className="suggest-badge">
                            <span aria-hidden="true">✓</span>
                            {t('fixes.appliedBadge')}
                          </span>
                        ) : null}
                      </span>
                      <span className="suggest-change">
                        <span className="muted tabular">{show(option.from)}</span>
                        <span aria-hidden="true"> → </span>
                        <strong className="tabular">{show(option.to)}</strong>
                      </span>
                    </p>
                    <span className="suggest-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-expanded={open}
                        onClick={() => setOpenProof(open ? null : option.leverId)}
                      >
                        {open ? t('fixes.hideProof') : t('fixes.showProof')}
                      </button>
                      <button
                        type="button"
                        className={isApplied ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                        onClick={() => setApplied(isApplied ? null : option.leverId)}
                      >
                        {isApplied ? t('fixes.revert') : t('fixes.apply')}
                      </button>
                    </span>
                  </div>

                  {open && (
                    <dl className="tabular suggest-proof">
                      <dt className="muted" />
                      <dt className="muted">{t('fixes.proofBefore')}</dt>
                      <dt className="muted">{t('fixes.proofAfter')}</dt>

                      <dt className="muted">{t('fixes.proofMinReserve')}</dt>
                      <dd>{money(option.before.minReserve, currency, locale)}</dd>
                      <dd className="suggest-after">
                        {money(option.after.minReserve, currency, locale)}
                      </dd>

                      <dt className="muted">{t('fixes.proofDeficit')}</dt>
                      <dd>
                        {option.before.deficitAt
                          ? monthPhrase(option.before.deficitAt, monthsIn)
                          : t('fixes.proofNever')}
                      </dd>
                      <dd className="suggest-after">
                        {option.after.deficitAt
                          ? monthPhrase(option.after.deficitAt, monthsIn)
                          : t('fixes.proofNever')}
                      </dd>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>

          {/* The verdict above the chart now reports the result of pressing Apply, so this
              line is only the invitation to press it — kept, because without it the buttons
              read as a filter rather than as something that redraws the picture. */}
          {appliedFix ? null : <p className="suggest-outcome">{t('fixes.applyHint')}</p>}
        </section>

      )}

      {/* The button, and nothing beside it. The paragraph that used to sit here explained the
          example the bullets and the verdict have already made — a reader who got this far has
          seen the argument, and a fourth restatement of it only delays the click. */}
      <footer className="example-foot">
        <Link href="/plan" className="btn btn-primary">
          {t('landing.cta')}
        </Link>
      </footer>
    </div>
  );
}
