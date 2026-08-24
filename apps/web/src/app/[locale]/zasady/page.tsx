import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <div style={{ display: 'grid', gap: 22, maxWidth: '72ch' }}>
      <div>
        <h1 style={{ fontSize: 26 }}>{t('privacy.title')}</h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 16 }}>
          {t('privacy.lead')}
        </p>
      </div>
      {[1, 2, 3, 4, 5].map((n) => (
        <section key={n}>
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>{t(`privacy.s${n}title`)}</h2>
          <p style={{ margin: 0, fontSize: 15 }}>{t(`privacy.s${n}`)}</p>
        </section>
      ))}
    </div>
  );
}
