'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ProjectionResult, ScenarioInput } from '@wealthplanner/engine';
import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import { comparisonVariants } from '@/lib/variants';
import { money, monthLabel, type UiLocale } from '@/lib/format';

/**
 * Small multiples, not an overlay. Three tiny reserve curves side by side, all sharing ONE
 * vertical scale so they can be compared by eye — a per-panel scale would make the worst
 * scenario look identical to the best. The table underneath carries the exact numbers, since
 * a sparkline is for shape, never for reading values off.
 */

const SPARK_W = 260;
const SPARK_H = 96;

export function Compare({
  scenario,
  currency,
  locale,
  months,
  onApply,
}: {
  scenario: ScenarioInput;
  currency: CurrencyCode;
  locale: UiLocale;
  months: string[];
  onApply: (next: ScenarioInput) => void;
}) {
  const t = useTranslations();
  const variants = useMemo(() => comparisonVariants(scenario), [scenario]);

  const domain = useMemo(() => {
    let min = 0;
    let max = 1;
    for (const variant of variants) {
      for (const point of variant.result.monthly) {
        if (point.reserve < min) min = point.reserve;
        if (point.reserve > max) max = point.reserve;
      }
    }
    const span = max - min || 1;
    return { min: min - span * 0.06, max: max + span * 0.06 };
  }, [variants]);

  const label = (key: string, values?: Record<string, string | number>) =>
    t(key as never, values as never);

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 20 }}>{t('compare.heading')}</h2>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, maxWidth: '68ch' }}>
          {t('compare.body')}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        {variants.map((variant) => (
          <figure
            key={variant.key}
            className="card"
            style={{ margin: 0, padding: 14, display: 'grid', gap: 8 }}
          >
            <figcaption style={{ fontSize: 14, fontWeight: 600 }}>
              {label(variant.labelKey, variant.labelValues)}
            </figcaption>
            <Sparkline result={variant.result} domain={domain} />
            <div style={{ fontSize: 13, display: 'grid', gap: 2 }}>
              <span
                className="tabular"
                style={{
                  fontWeight: 650,
                  color:
                    variant.result.minReserve < 0
                      ? 'var(--status-critical)'
                      : variant.result.worstFloorGap < 0
                        ? 'var(--status-warning)'
                        : 'var(--status-good)',
                }}
              >
                {money(variant.result.minReserve, currency, locale)}
              </span>
              <span className="muted">{monthLabel(variant.result.minReserveAt, months)}</span>
            </div>
            {variant.key !== 'current' && (
              <button
                type="button"
                className="btn"
                style={{ padding: '5px 10px', fontSize: 13, justifySelf: 'start' }}
                onClick={() => onApply(variant.scenario)}
              >
                {t('compare.apply')}
              </button>
            )}
          </figure>
        ))}
      </div>

      <div className="scroll-x">
        <table
          className="tabular"
          style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}
        >
          <thead>
            <tr>
              <th scope="col" style={{ ...th, textAlign: 'left' }}>
                {t('compare.colVariant')}
              </th>
              <th scope="col" style={th}>
                {t('compare.colMinReserve')}
              </th>
              <th scope="col" style={th}>
                {t('compare.colWhen')}
              </th>
              <th scope="col" style={th}>
                {t('compare.colDeficit')}
              </th>
              <th scope="col" style={th}>
                {t('compare.colNetWorth', { year: scenario.assumptions.horizonYear })}
              </th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => (
              <tr key={variant.key}>
                <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>
                  {label(variant.labelKey, variant.labelValues)}
                </th>
                <td
                  style={{
                    ...td,
                    color: variant.result.minReserve < 0 ? 'var(--status-critical)' : undefined,
                  }}
                >
                  {money(variant.result.minReserve, currency, locale)}
                </td>
                <td style={td}>{monthLabel(variant.result.minReserveAt, months)}</td>
                <td style={td}>
                  {variant.result.deficitAt
                    ? monthLabel(variant.result.deficitAt, months)
                    : t('compare.deficitNo')}
                </td>
                <td style={td}>{money(variant.result.finalNetWorth, currency, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Sparkline({
  result,
  domain,
}: {
  result: ProjectionResult;
  domain: { min: number; max: number };
}) {
  const points = result.monthly;
  if (points.length === 0) return null;

  const x = (i: number) => (i / Math.max(1, points.length - 1)) * SPARK_W;
  const y = (v: number) =>
    SPARK_H - ((v - domain.min) / (domain.max - domain.min)) * SPARK_H;

  const line = points
    .map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(m.reserve).toFixed(1)}`)
    .join('');
  const zeroY = y(0);
  const showZero = domain.min < 0;
  const troughIndex = points.reduce(
    (worst, m, i) => (m.reserve < (points[worst]?.reserve ?? Infinity) ? i : worst),
    0,
  );
  const trough = points[troughIndex];

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      width="100%"
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {showZero && (
        <>
          <rect
            x="0"
            y={zeroY}
            width={SPARK_W}
            height={Math.max(0, SPARK_H - zeroY)}
            fill="var(--status-critical)"
            opacity="0.07"
          />
          <line
            x1="0"
            x2={SPARK_W}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--status-critical)"
            strokeWidth="1"
          />
        </>
      )}
      <path d={line} fill="none" stroke="var(--series-reserve)" strokeWidth="2" />
      {trough && (
        <circle
          cx={x(troughIndex)}
          cy={y(trough.reserve)}
          r="3.5"
          fill={result.minReserve < 0 ? 'var(--status-critical)' : 'var(--status-warning)'}
          stroke="var(--surface)"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

const th: React.CSSProperties = {
  textAlign: 'right',
  padding: '6px 10px',
  borderBottom: '1px solid var(--axis)',
  color: 'var(--ink-secondary)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  textAlign: 'right',
  padding: '6px 10px',
  borderBottom: '1px solid var(--grid)',
  whiteSpace: 'nowrap',
};
