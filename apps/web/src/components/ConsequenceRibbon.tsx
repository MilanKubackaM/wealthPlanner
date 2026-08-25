'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProjectionResult } from '@wealthplanner/engine';
import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import { money, monthPhrase, type UiLocale } from '@/lib/format';

/**
 * What replaced the chart inside the wizard.
 *
 * The chart was buying something real — per-answer feedback, and proof that arithmetic is
 * happening — but it was the wrong instrument for it. On a phone the chart sits below the
 * fields and the buttons, so it is off-screen on every step; it splits attention on the one
 * screen in the product whose whole design is one question at a time; and it spends the
 * single memorable picture twenty-five times before the user has earned it.
 *
 * This keeps the property and drops the picture. Three slots, two lines, no SVG, above the
 * fold on a 360px phone:
 *
 *   1. the verdict as colour AND glyph AND word, then the trough written as a sentence
 *   2. the change attributable to THIS step — which is the part the chart could not do, since
 *      it showed the state and left the user to infer which answer moved it
 *   3. how much of the plan is their own numbers rather than a national average
 *
 * The live region is written once per step, never per keystroke: a status region that fires
 * on every digit is unusable with a screen reader.
 */
export function ConsequenceRibbon({
  result,
  baseline,
  currency,
  locale,
  monthsIn,
  answered,
  total,
  stepKey,
  labels,
}: {
  result: ProjectionResult;
  /** The projection as of this step's mount. Null on the first step. */
  baseline: ProjectionResult | null;
  currency: CurrencyCode;
  locale: UiLocale;
  monthsIn: string[];
  answered: number;
  total: number;
  /** Changes when the step changes; that is what re-announces the region. */
  stepKey: string;
  labels: {
    label: string;
    holds: string;
    belowFloor: string;
    deficit: string;
    trough: (amount: string, when: string) => string;
    troughDeficit: (amount: string, when: string) => string;
    stepDown: (amount: string) => string;
    stepUp: (amount: string) => string;
    stepFlat: string;
    completeness: (done: number, total: number) => string;
  };
}) {
  const verdict =
    result.deficitAt !== null ? 'deficit' : result.worstFloorGap < 0 ? 'belowFloor' : 'holds';
  const verdictWord =
    verdict === 'deficit' ? labels.deficit : verdict === 'belowFloor' ? labels.belowFloor : labels.holds;

  const troughSentence =
    result.deficitAt !== null
      ? labels.troughDeficit(
          money(Math.abs(result.minReserve), currency, locale),
          monthPhrase(result.minReserveAt ?? result.deficitAt, monthsIn),
        )
      : labels.trough(
          money(result.minReserve, currency, locale),
          monthPhrase(result.minReserveAt ?? result.monthly[0] ?? null, monthsIn),
        );

  const delta = baseline ? result.minReserve - baseline.minReserve : 0;
  const deltaSentence =
    !baseline || Math.abs(delta) < 1
      ? labels.stepFlat
      : delta < 0
        ? labels.stepDown(money(Math.abs(delta), currency, locale))
        : labels.stepUp(money(Math.abs(delta), currency, locale));

  /* Announced once per step, from the values as they stand when the step changes. */
  const [announcement, setAnnouncement] = useState('');
  const latest = useRef({ verdictWord, troughSentence, deltaSentence });
  latest.current = { verdictWord, troughSentence, deltaSentence };
  useEffect(() => {
    const { verdictWord: v, troughSentence: s, deltaSentence: d } = latest.current;
    setAnnouncement(`${v}. ${s}. ${d}`);
  }, [stepKey]);

  return (
    <div className="ribbon" data-verdict={verdict}>
      <p className="ribbon-label muted">{labels.label}</p>
      <p className="ribbon-line">
        <span className="ribbon-chip" data-verdict={verdict}>
          <span aria-hidden="true">{verdict === 'holds' ? '✓' : '!'}</span>
          {verdictWord}
        </span>
        <span className="ribbon-trough">{troughSentence}</span>
      </p>
      <p className="ribbon-line ribbon-meta">
        <span>{deltaSentence}</span>
        <span className="ribbon-dot" aria-hidden="true">
          ·
        </span>
        <span>{labels.completeness(answered, total)}</span>
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
