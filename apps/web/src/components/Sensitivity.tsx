'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ScenarioInput } from '@wealthplanner/engine';
import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import { sensitivityRows } from '@/lib/variants';
import { money, monthLabel, type UiLocale } from '@/lib/format';

/**
 * The honest answer to "what if the projection is wrong". Each row is the whole simulation run
 * again with one assumption moved, so a user can see which assumption their plan actually
 * depends on — and it converts the product's biggest liability into a feature.
 */
export function Sensitivity({
  scenario,
  currency,
  locale,
  months,
}: {
  scenario: ScenarioInput;
  currency: CurrencyCode;
  locale: UiLocale;
  months: string[];
}) {
  const t = useTranslations();
  const rows = useMemo(() => sensitivityRows(scenario), [scenario]);
  const baseline = rows[0]?.result;

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 20 }}>{t('sensitivity.heading')}</h2>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, maxWidth: '68ch' }}>
          {t('sensitivity.body')}
        </p>
      </div>

      <div className="scroll-x">
        <table
          className="tabular"
          style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}
        >
          <thead>
            <tr>
              <th scope="col" style={{ ...th, textAlign: 'left' }}>
                {t('sensitivity.colVariant')}
              </th>
              <th scope="col" style={th}>
                {t('sensitivity.colMinReserve')}
              </th>
              <th scope="col" style={th}>
                {t('sensitivity.colWhen')}
              </th>
              <th scope="col" style={th}>
                {t('sensitivity.colDeficit')}
              </th>
              <th scope="col" style={th}>
                {t('sensitivity.colNetWorth', { year: scenario.assumptions.horizonYear })}
              </th>
              <th scope="col" style={th}>
                {t('sensitivity.colPaid')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isBase = index === 0;
              const worseThanBase =
                baseline && !isBase && row.result.minReserve < baseline.minReserve - 1;
              return (
                <tr key={row.key}>
                  <th
                    scope="row"
                    style={{
                      ...td,
                      textAlign: 'left',
                      fontWeight: isBase ? 650 : 500,
                      whiteSpace: 'normal',
                    }}
                  >
                    {t(row.labelKey as never)}
                  </th>
                  <td
                    style={{
                      ...td,
                      fontWeight: isBase ? 650 : 400,
                      color:
                        row.result.minReserve < 0
                          ? 'var(--status-critical)'
                          : worseThanBase
                            ? 'var(--ink)'
                            : undefined,
                    }}
                  >
                    {money(row.result.minReserve, currency, locale)}
                  </td>
                  <td style={td}>{monthLabel(row.result.minReserveAt, months)}</td>
                  <td style={td}>
                    {row.result.deficitAt ? (
                      <span style={{ color: 'var(--status-critical)', fontWeight: 600 }}>
                        {monthLabel(row.result.deficitAt, months)}
                      </span>
                    ) : (
                      t('sensitivity.deficitNo')
                    )}
                  </td>
                  <td style={{ ...td, fontWeight: isBase ? 650 : 400 }}>
                    {money(row.result.finalNetWorth, currency, locale)}
                  </td>
                  <td style={td}>
                    {row.result.mortgagePaidYear ?? t('sensitivity.notPaid')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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
