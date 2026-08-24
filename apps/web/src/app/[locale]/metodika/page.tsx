import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ENGINE_VERSION } from '@wealthplanner/engine';

export default async function MethodologyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const limits = t.raw('methodology.limits') as string[];

  return (
    <div style={{ display: 'grid', gap: 26, maxWidth: '74ch' }}>
      <div>
        <h1 style={{ fontSize: 26 }}>{t('methodology.title')}</h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
          {t('methodology.lead')}
        </p>
      </div>

      <section className="card">
        <h2 style={{ fontSize: 17, marginBottom: 10 }}>{t('methodology.orderTitle')}</h2>
        <ol style={{ margin: 0, paddingInlineStart: 22, display: 'grid', gap: 6, fontSize: 14 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <li key={n}>{t(`methodology.order${n}`)}</li>
          ))}
        </ol>
        <p className="muted" style={{ marginBottom: 0, marginTop: 12, fontSize: 13 }}>
          {t('methodology.orderNote')}
        </p>
      </section>

      <section className="card">
        <h2 style={{ fontSize: 17, marginBottom: 10 }}>{t('methodology.searchTitle')}</h2>
        <ol style={{ margin: 0, paddingInlineStart: 22, display: 'grid', gap: 6, fontSize: 14 }}>
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>{t(`methodology.search${n}`)}</li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2 style={{ fontSize: 17, marginBottom: 10 }}>{t('methodology.limitsTitle')}</h2>
        <ul style={{ margin: 0, paddingInlineStart: 22, display: 'grid', gap: 6, fontSize: 14 }}>
          {limits.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          {t('methodology.engineVersion', { version: ENGINE_VERSION })}
        </p>
        <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          {t('methodology.engineVersionNote')}
        </p>
      </section>
    </div>
  );
}
