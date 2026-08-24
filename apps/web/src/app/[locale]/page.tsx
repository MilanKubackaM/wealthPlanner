import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LandingHero } from '@/components/LandingHero';
import { currentYearMonth } from '@/lib/format';
import type { AppLocale } from '@/i18n/routing';

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  /* The start month is resolved on the server so the client never disagrees with it. */
  const startMonth = currentYearMonth();

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <section style={{ display: 'grid', gap: 14, maxWidth: '58ch' }}>
        <h1 style={{ fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 700 }}>{t('landing.h1')}</h1>
        <p style={{ margin: 0, fontSize: 18, color: 'var(--ink-secondary)' }}>{t('landing.lead')}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/plan" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            {t('landing.cta')}
          </Link>
          <Link href="/metodika" className="btn" style={{ textDecoration: 'none' }}>
            {t('landing.ctaMethodology')}
          </Link>
        </div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
          {t('landing.privacy')}{' '}
          <span className="muted" style={{ fontWeight: 400 }}>
            {t('landing.free')}
          </span>
        </p>
      </section>

      <LandingHero locale={locale as AppLocale} startMonth={startMonth} />

      <section
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        {(
          [
            ['landing.whyMonthlyTitle', 'landing.whyMonthly'],
            ['landing.verifiedTitle', 'landing.verified'],
            ['landing.openSourceTitle', 'landing.openSource'],
          ] as const
        ).map(([title, body]) => (
          <div key={title} className="card">
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>{t(title)}</h2>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              {t(body)}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
