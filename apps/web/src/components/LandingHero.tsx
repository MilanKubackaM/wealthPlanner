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
export function LandingHero({ locale, startMonth }: { locale: UiLocale; startMonth: YearMonth }) {
  const t = useTranslations();
  const months = t.raw('months') as string[];
  const monthsIn = t.raw('monthsIn') as string[];
  const [showProof, setShowProof] = useState(false);

  const { scenario, result, headline, fix, fixAfter } = useMemo(() => {
    const code = countryFor(locale);
    const s = demoScenario(code, startMonth);
    const r = simulate(s);
    const problems = detectProblems(s, r, {
      typicalSavingsRatePct: jurisdictionFor(code).typicalTopSavingsRatePct.value,
      retirementAgeYears: jurisdictionFor(code).statutoryRetirementAgeYears.value,
    });
    const fixable = problems.filter((p) => criterionFor(p) !== null);
    const analysed = fixable.length > 0 ? analyse(s, [fixable[0]!]) : [];
    const first = analysed[0];
    return {
      scenario: s,
      result: r,
      headline: fixable[0] ?? null,
      fix: first?.fixes[0] ?? null,
      fixAfter: first?.fixes[0]?.after ?? null,
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

  const leverKey = fix ? fix.leverId.replace(/\[\d+\]/g, '').replace('.leavePlan.', '.').replace(/\./g, '_') : null;
  const isMonths = fix?.leverId.endsWith('parentalMonths') ?? false;
  const fmt = (v: number) =>
    isMonths ? t('planner.months', { count: Math.round(v) }) : money(v, currency, locale);

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

      {fix && leverKey && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
            background: 'var(--surface-raised)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 15 }}>
              {t(`fixes.levers.${leverKey}`)}: <span className="tabular muted">{fmt(fix.from)}</span>
              {' → '}
              <strong className="tabular">{fmt(fix.to)}</strong>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowProof((v) => !v)}
              aria-expanded={showProof}
            >
              {showProof ? t('fixes.hideProof') : t('fixes.showProof')}
            </button>
          </div>

          {showProof && fixAfter && (
            <dl
              className="tabular"
              style={{
                margin: 0,
                display: 'grid',
                gridTemplateColumns: 'auto auto auto',
                gap: '4px 16px',
                fontSize: 13,
              }}
            >
              <dt className="muted" />
              <dt className="muted">{t('fixes.proofBefore')}</dt>
              <dt className="muted">{t('fixes.proofAfter')}</dt>

              <dt className="muted">{t('fixes.proofMinReserve')}</dt>
              <dd style={{ margin: 0 }}>{money(fix.before.minReserve, currency, locale)}</dd>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                {money(fixAfter.minReserve, currency, locale)}
              </dd>

              <dt className="muted">{t('fixes.proofDeficit')}</dt>
              <dd style={{ margin: 0 }}>
                {fix.before.deficitAt
                  ? monthPhrase(fix.before.deficitAt, monthsIn)
                  : t('fixes.proofNever')}
              </dd>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                {fixAfter.deficitAt
                  ? monthPhrase(fixAfter.deficitAt, monthsIn)
                  : t('fixes.proofNever')}
              </dd>
            </dl>
          )}
        </div>
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
