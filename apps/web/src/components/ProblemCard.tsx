'use client';

import { useState } from 'react';
import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import type { Problem, Recommendation } from '@wealthplanner/engine';
import { money, monthLabel, monthPhrase, percent, type UiLocale } from '@/lib/format';

/**
 * A problem plus the fixes that provably remove it. The engine hands over structured facts
 * only — no prose, no provider names — so every sentence here is assembled from the message
 * catalogue and can be translated without touching the model.
 */

export interface ProblemCardProps {
  problem: Problem;
  fixes: Recommendation[];
  currency: CurrencyCode;
  locale: UiLocale;
  months: string[];
  monthsIn: string[];
  t: (key: string, values?: Record<string, string | number>) => string;
  /**
   * The assumptions this recommendation rests on, rendered with the card rather than in a
   * footnote at the bottom of the page. A number is only as good as what it assumed, and the
   * reader should not have to go looking for that.
   */
  assumptions?: string;
  onApply: (fix: Recommendation) => void;
}

const SEVERITY_COLOR: Record<Problem['severity'], string> = {
  critical: 'var(--status-critical)',
  warning: 'var(--status-warning)',
  info: 'var(--ink-muted)',
};

/* Status colour never carries meaning alone — each severity ships with a glyph. */
const SEVERITY_GLYPH: Record<Problem['severity'], string> = {
  critical: '!',
  warning: '!',
  info: 'i',
};

/** `children[0].leavePlan.parentalMonths` → `children.parentalMonths` */
function leverKey(leverId: string): string {
  return leverId.replace(/\[\d+\]/g, '').replace('.leavePlan.', '.').replace(/\./g, '_');
}

function isMonthLever(leverId: string): boolean {
  return leverId.endsWith('parentalMonths');
}

export function ProblemCard({
  problem,
  fixes,
  currency,
  locale,
  months,
  monthsIn,
  t,
  assumptions,
  onApply,
}: ProblemCardProps) {
  const [openProof, setOpenProof] = useState<string | null>(null);
  const f = problem.facts;

  const values: Record<string, string | number> = {
    when: monthPhrase(f.at ?? null, monthsIn),
    worstWhen: monthPhrase(f.worstAt ?? f.at ?? null, monthsIn),
    amount: money(f.amount ?? 0, currency, locale),
    gap: money(f.gap ?? 0, currency, locale),
    floor: money(f.floor ?? 0, currency, locale),
    months: f.months ?? 0,
    rate: percent(f.ratePct ?? 0, locale),
    suggested: percent(f.suggestedRatePct ?? 0, locale),
  };

  return (
    <article
      className="card"
      style={{
        borderLeft: `3px solid ${SEVERITY_COLOR[problem.severity]}`,
        display: 'grid',
        gap: 12,
      }}
    >
      <header style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span
          aria-hidden="true"
          style={{
            flex: '0 0 auto',
            width: 20,
            height: 20,
            borderRadius: 999,
            background: SEVERITY_COLOR[problem.severity],
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            display: 'grid',
            placeItems: 'center',
            marginTop: 2,
          }}
        >
          {SEVERITY_GLYPH[problem.severity]}
        </span>
        <div>
          <h3 style={{ fontSize: 17, fontWeight: 650 }}>
            {t(`problems.${problem.id}.title`, values)}
          </h3>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            {t(`problems.${problem.id}.body`, values)}
          </p>
        </div>
      </header>

      {fixes.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink-secondary)' }}>
            {t('fixes.heading')}
          </p>
          {fixes.map((fix) => {
            const key = fix.leverId;
            const isOpen = openProof === key;
            const fmt = (v: number) =>
              isMonthLever(fix.leverId)
                ? t('planner.months', { count: Math.round(v) })
                : money(v, currency, locale);
            return (
              <div
                key={key}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  display: 'grid',
                  gap: 8,
                  background: 'var(--surface-raised)',
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
                  <span style={{ fontSize: 14 }}>
                    {t(`fixes.levers.${leverKey(fix.leverId)}`)}:{' '}
                    <span className="tabular muted">{fmt(fix.from)}</span>
                    {' → '}
                    <strong className="tabular">{fmt(fix.to)}</strong>
                  </span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '5px 10px', fontSize: 13 }}
                      onClick={() => setOpenProof(isOpen ? null : key)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? t('fixes.hideProof') : t('fixes.showProof')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '5px 12px', fontSize: 13 }}
                      onClick={() => onApply(fix)}
                    >
                      {t('fixes.apply')}
                    </button>
                  </span>
                </div>

                {isOpen && (
                  <div className="scroll-x">
                    <table
                      className="tabular"
                      style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}
                    >
                      <thead>
                        <tr>
                          <th style={proofTh} />
                          <th style={proofTh}>{t('fixes.proofBefore')}</th>
                          <th style={proofTh}>{t('fixes.proofAfter')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th scope="row" style={proofRowTh}>
                            {t('fixes.proofMinReserve')}
                          </th>
                          <td style={proofTd}>{money(fix.before.minReserve, currency, locale)}</td>
                          <td style={{ ...proofTd, fontWeight: 600 }}>
                            {money(fix.after.minReserve, currency, locale)}
                          </td>
                        </tr>
                        <tr>
                          <th scope="row" style={proofRowTh}>
                            {t('fixes.proofDeficit')}
                          </th>
                          <td style={proofTd}>
                            {fix.before.deficitAt
                              ? monthLabel(fix.before.deficitAt, months)
                              : t('fixes.proofNever')}
                          </td>
                          <td style={{ ...proofTd, fontWeight: 600 }}>
                            {fix.after.deficitAt
                              ? monthLabel(fix.after.deficitAt, months)
                              : t('fixes.proofNever')}
                          </td>
                        </tr>
                        <tr>
                          <th scope="row" style={proofRowTh}>
                            {t('fixes.proofPaused')}
                          </th>
                          <td style={proofTd}>
                            {t('fixes.proofMonths', { count: fix.before.pausedMonths })}
                          </td>
                          <td style={{ ...proofTd, fontWeight: 600 }}>
                            {t('fixes.proofMonths', { count: fix.after.pausedMonths })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {fixes.length === 0 && problem.severity !== 'info' && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {t('fixes.none')}
        </p>
      )}

      {assumptions && fixes.length > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {assumptions}
        </p>
      )}
    </article>
  );
}

const proofTh: React.CSSProperties = {
  textAlign: 'right',
  padding: '4px 10px',
  color: 'var(--ink-muted)',
  fontWeight: 500,
  borderBottom: '1px solid var(--grid)',
};
const proofRowTh: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 10px',
  color: 'var(--ink-secondary)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};
const proofTd: React.CSSProperties = {
  textAlign: 'right',
  padding: '4px 10px',
  whiteSpace: 'nowrap',
};
