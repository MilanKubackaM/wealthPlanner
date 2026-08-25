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
    /** For a plan whose reserve never falls below where it started. */
    neverDips: (amount: string) => string;
    troughDeficit: (amount: string, when: string) => string;
    stepDown: (amount: string) => string;
    stepUp: (amount: string) => string;
    stepFlat: string;
    completeness: (done: number, total: number) => string;
    /** Shown instead of a verdict while the plan is still entirely the national average. */
    pristine: string;
  };
}) {
  /*
   * With no answers there is no consequence, so there is nothing to be a verdict about.
   *
   * This band used to print "the reserve holds — lowest 200 000 Kč in August 2026" on the very
   * first screen of a brand-new session, which is a verdict on a household the user has not
   * described. It is the same flaw the chart was removed for: confident before the inputs are.
   * Until one number is theirs, the band says only what it is looking at.
   */
  const pristine = answered === 0;

  const verdict =
    result.deficitAt !== null ? 'deficit' : result.worstFloorGap < 0 ? 'belowFloor' : 'holds';
  const verdictWord =
    verdict === 'deficit' ? labels.deficit : verdict === 'belowFloor' ? labels.belowFloor : labels.holds;

  /*
   * `minReserveAt` is null when the reserve never drops below its opening balance — simulate()
   * seeds the minimum with day one. Naming a month there produced "lowest reserve 200 000 Kč in
   * August 2026", which is the starting balance in the starting month: true, and meaningless.
   * That case gets a sentence of its own.
   */
  const troughSentence =
    result.deficitAt !== null
      ? labels.troughDeficit(
          money(Math.abs(result.minReserve), currency, locale),
          monthPhrase(result.minReserveAt ?? result.deficitAt, monthsIn),
        )
      : result.minReserveAt === null
        ? labels.neverDips(money(result.minReserve, currency, locale))
        : labels.trough(
            money(result.minReserve, currency, locale),
            monthPhrase(result.minReserveAt, monthsIn),
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
    setAnnouncement(pristine ? labels.pristine : `${v}. ${s}. ${d}`);
    /* Announced per step, never per keystroke — a live region firing on every digit is unusable. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  if (pristine) {
    return (
      <div className="ribbon" data-verdict="pristine">
        <p className="ribbon-label muted">{labels.label}</p>
        <p className="ribbon-line ribbon-pristine">{labels.pristine}</p>
        <p className="ribbon-line ribbon-meta">{labels.completeness(answered, total)}</p>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>
    );
  }

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
