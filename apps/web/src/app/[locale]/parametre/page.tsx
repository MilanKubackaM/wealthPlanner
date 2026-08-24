import { getTranslations, setRequestLocale } from 'next-intl/server';
import { allParameters } from '@wealthplanner/jurisdictions';

/**
 * The public parameter page. The likeliest cause of a wrong projection is not a maths bug,
 * it is a stale legal constant — so every one of them is listed here with its source and the
 * date it was last checked, and anything unconfirmed says so out loud.
 */
export default async function ParametersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const rows = allParameters();

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: '80ch' }}>
      <div>
        <h1 style={{ fontSize: 26 }}>{t('parameters.title')}</h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
          {t('parameters.lead')}
        </p>
      </div>

      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ fontSize: 17 }}>{t('parameters.leaveHeading')}</h2>
        <p style={{ margin: 0, fontSize: 14 }}>{t('parameters.leaveCz')}</p>
        <p style={{ margin: 0, fontSize: 14 }}>{t('parameters.leaveSk')}</p>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          {t('parameters.leaveDifference')}
        </p>
      </section>

      <div className="scroll-x">
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              {['colParam', 'colValue', 'colVerified', 'colSource'].map((key) => (
                <th
                  key={key}
                  scope="col"
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--axis)',
                    color: 'var(--ink-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t(`parameters.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.jurisdiction}-${row.key}`}>
                <td style={cell}>
                  <strong>{row.jurisdiction}</strong> · {row.key}
                  {row.unverified && (
                    <span
                      style={{
                        marginInlineStart: 8,
                        fontSize: 11,
                        color: 'var(--status-serious)',
                        border: '1px solid var(--status-serious)',
                        borderRadius: 999,
                        padding: '1px 7px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('parameters.unverified')}
                    </span>
                  )}
                </td>
                <td style={{ ...cell, fontVariantNumeric: 'tabular-nums' }}>{String(row.value)}</td>
                <td style={cell}>{row.verifiedAt}</td>
                <td style={{ ...cell, wordBreak: 'break-all' }}>
                  {row.source ? <a href={row.source}>{hostOf(row.source)}</a> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {t('parameters.recheck')}
      </p>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const cell: React.CSSProperties = {
  padding: '7px 10px',
  borderBottom: '1px solid var(--grid)',
  verticalAlign: 'top',
};
