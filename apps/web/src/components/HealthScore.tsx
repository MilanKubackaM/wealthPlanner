'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { HealthScore as Score, ScoreDimension } from '@wealthplanner/engine';
import { decimal, percent, type UiLocale } from '@/lib/format';

/**
 * One number for how well the money is arranged, and the four reasons for it.
 *
 * Two things this component refuses to do, both of them for the same reason — a score is a
 * claim, and a claim without its basis is a horoscope:
 *
 *   1. It never shows the overall figure alone. The dimensions are in the DOM whether or not
 *      the panel is expanded, so the reasons are always one keystroke and one Ctrl+F away,
 *      never a fetch.
 *   2. It never states a grade without the measurement beside it. "Reserve 60 %" is an
 *      opinion; "covers 1.8 of the recommended 3 months" is a fact, and the fact is what
 *      changes behaviour. Every row carries its own numbers.
 *
 * The wording of the advice lives in the message catalogue keyed by the engine's `advice` id,
 * so the engine holds no Czech or Slovak copy and this component holds no arithmetic. Neither
 * can drift into the other's job.
 */

/** Four bands. Deliberately coarse: a score precise to the point is a score pretending. */
function toneOf(score: number): 'critical' | 'warning' | 'good' | 'excellent' {
  if (score < 40) return 'critical';
  if (score < 70) return 'warning';
  if (score < 90) return 'good';
  return 'excellent';
}

/** The ring, drawn as one SVG circle whose dash offset is the score. */
function Ring({ value, label }: { value: number; label: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="ring" data-tone={toneOf(value)}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ring-track" cx="50" cy="50" r={radius} />
        <circle
          className="ring-value"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          /* Clamped so a 0 still shows the track and a 100 does not wrap past itself. */
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, value)) / 100)}
        />
      </svg>
      <span className="ring-figure">
        <strong>{value}</strong>
        <span className="ring-unit" aria-hidden="true">
          %
        </span>
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function HealthScore({ health, locale }: { health: Score; locale: UiLocale }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  /* next-intl types keys literally; the advice keys are assembled from the engine's ids. */
  const tx = (key: string, values?: Record<string, string | number>) =>
    t(key as never, values as never);

  /* One decimal throughout: these are readings, not measurements to the second place. */
  const pct = (value: number | undefined) => percent(value ?? 0, locale, 1);
  const months = (value: number | undefined) =>
    t('score.months', { count: decimal(value ?? 0, locale) });

  /**
   * The numbers for one row, chosen per dimension rather than dumped. A row that printed
   * every fact it had would be a row nobody reads.
   */
  function factLine(d: ScoreDimension): string {
    const f = d.facts;
    switch (d.id) {
      case 'reserve':
        return t('score.factReserve', {
          cover: months(f.coverMonths),
          peers: pct(f.peerCannotCoverPct),
        });
      case 'investing':
        return d.advice === 'investing-cash-heavy'
          ? t('score.factInvestingCash', {
              cash: months(f.cashMonths),
              max: months(f.cashMonthsMax),
              share: pct(f.investingSharePct),
            })
          : t('score.factInvesting', {
              share: pct(f.investingSharePct),
              target: pct(f.investingTargetPct),
            });
      case 'debt':
        return d.advice === 'debt-costlier-than-returns'
          ? t('score.factDebtExpensive', {
              rate: pct(f.worstDebtRatePct),
              expected: pct(f.expectedReturnPct),
              share: pct(f.debtSharePct),
            })
          : t('score.factDebt', {
              share: pct(f.debtSharePct),
              advisory: pct(f.debtAdvisoryPct),
            });
      case 'headroom':
        return t('score.factHeadroom', { share: pct(f.headroomSharePct) });
    }
  }

  return (
    <section className="health" aria-labelledby="health-title">
      <div className="health-head">
        <Ring value={health.overall} label={t('score.ringLabel', { value: health.overall })} />
        <div className="health-lead">
          <h3 id="health-title" className="health-title">
            {t('score.title')}
          </h3>
          <p className="health-verdict" data-tone={toneOf(health.overall)}>
            {tx(`score.band.${toneOf(health.overall)}`)}
          </p>
          {/*
            Said out loud rather than left as an invisible reweighting. A user who notices the
            reserve mattering more after adding a child deserves to be told why, not left to
            guess that the maths changed under them.
          */}
          {health.childWeighted && <p className="health-note">{t('score.childWeighted')}</p>}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-expanded={open}
            aria-controls="health-rows"
            onClick={() => setOpen(!open)}
          >
            {open ? t('score.hide') : t('score.show')}
          </button>
        </div>
      </div>

      {/*
        `hidden` rather than unmounted: the reasons behind a score must be findable by Ctrl+F
        and reachable by a screen reader's own navigation, and they cost nothing to keep.
      */}
      <ul id="health-rows" className="health-rows" hidden={!open}>
        {health.dimensions.map((d) => (
          <li key={d.id} className="health-row" data-tone={toneOf(d.score)}>
            <div className="health-row-head">
              <span className="health-row-name">{tx(`score.dimension.${d.id}`)}</span>
              <span className="health-row-score tabular">
                {d.score}
                <span aria-hidden="true">%</span>
              </span>
            </div>
            {/* The measurement first, then what to do about it. Fact before verdict. */}
            <p className="health-row-fact tabular">{factLine(d)}</p>
            <p className="health-row-advice">{tx(`score.advice.${d.advice}`)}</p>
            {/*
              A real <progress>, not a div with a width. The value is dynamic, so a div would
              need an inline style — and the style ratchet was right to refuse it, because the
              element that means "this much out of a hundred" already exists, comes with the
              right role and value semantics for free, and needs no aria-label to explain a
              coloured rectangle to a screen reader.
            */}
            <progress
              className="health-bar"
              value={d.score}
              max={100}
              aria-label={t('score.barLabel', {
                name: tx(`score.dimension.${d.id}`),
                value: d.score,
              })}
            />
          </li>
        ))}
      </ul>

      {/*
        The disclaimer is not boilerplate and does not get to be small. The score is the most
        authoritative-looking thing on the page and the two claims it must never make are that
        it is a comparison with other people and that it is a retirement calculation.
      */}
      <p className="health-caveat">{t('score.caveat')}</p>
    </section>
  );
}
