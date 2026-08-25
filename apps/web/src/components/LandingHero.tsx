'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { analyse, criterionFor, detectProblems, simulate, type YearMonth } from '@wealthplanner/engine';
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

  const { scenario, result, headline, fixes } = useMemo(() => {
    const code = countryFor(locale);
    const s = demoScenario(code, startMonth);
    const r = simulate(s);
    const problems = detectProblems(s, r, {
      typicalSavingsRatePct: jurisdictionFor(code).typicalTopSavingsRatePct.value,
      retirementAgeYears: jurisdictionFor(code).statutoryRetirementAgeYears.value,
    });
    const fixable = problems.filter((p) => criterionFor(p) !== null);
    const analysed = fixable.length > 0 ? analyse(s, [fixable[0]!]) : [];
    return {
      scenario: s,
      result: r,
      headline: fixable[0] ?? null,
      /*
       * All of them, least drastic first — up to three.
       *
       * This used to take `fixes[0]` and drop the rest on the floor. The engine finds three
       * verified ways out of the demo's deficit, and showing one made the product look like it
       * has a single opinion. The whole claim is that it searches the input space and proves
       * what it finds; a list of alternatives IS the claim, and one line is the claim hidden.
       */
      fixes: (analysed[0]?.fixes ?? []).slice(0, 3),
    };
  }, [locale, startMonth]);

  const currency = scenario.currency;

  /* Read off the scenario, never typed into the copy: the story cannot contradict the chart. */
  const mortgage = scenario.housing.kind === 'own' ? scenario.housing.mortgages[0] : undefined;
  const story = {
    income: money(scenario.people[0]?.netMonthlyIncome ?? 0, currency, locale),
    mortgage: money(mortgage?.balance ?? 0, currency, locale),
    reserve: money(scenario.reserve.balance, currency, locale),
    invest: money(scenario.jointInvesting.monthlyContribution, currency, locale),
    childYear: scenario.children[0]?.birth.year ?? scenario.assumptions.start.year + 3,
  };

  const headlineSentence = headline
    ? t(`problems.${headline.id}.title`, {
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
      })
    : t('landing.healthy', { floor: money(result.reserveFloor, currency, locale) });

  /* next-intl types keys literally; the lever labels are assembled. */
  const tx = (key: string) => t(key as never);

  return (
    <div className="card example" style={{ display: 'grid', gap: 16 }}>
      <header className="example-head">
        <p className="example-badge">{t('landing.exampleBadge')}</p>
        <h2 className="example-title">{t('landing.exampleTitle')}</h2>
        <p className="example-story">{t('landing.exampleStory', story)}</p>
      </header>

      <ReserveChart
        result={result}
        currency={currency}
        locale={locale}
        months={months}
        labels={chartLabels(t)}
      />

      <p
        style={{
          margin: 0,
          fontSize: 19,
          fontWeight: 600,
          lineHeight: 1.35,
          letterSpacing: '-0.01em',
        }}
      >
        {headlineSentence}
      </p>

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
              return (
                <li key={option.leverId} className="suggest-item">
                  <div className="suggest-row">
                    <p className="suggest-what">
                      <span className="suggest-lever">{tx(`fixes.levers.${key}`)}</span>
                      <span className="suggest-change">
                        <span className="muted tabular">{show(option.from)}</span>
                        <span aria-hidden="true"> → </span>
                        <strong className="tabular">{show(option.to)}</strong>
                      </span>
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-expanded={open}
                      onClick={() => setOpenProof(open ? null : option.leverId)}
                    >
                      {open ? t('fixes.hideProof') : t('fixes.showProof')}
                    </button>
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
        </section>
      )}

      <footer className="example-foot">
        <p>{t('landing.exampleYours')}</p>
        <Link href="/plan" className="btn btn-primary">
          {t('landing.cta')}
        </Link>
      </footer>
    </div>
  );
}
