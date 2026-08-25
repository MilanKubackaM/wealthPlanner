import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LandingHero } from '@/components/LandingHero';
import { RotatingHeadline } from '@/components/RotatingHeadline';
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
        {/* The strings are resolved here, on the server, so the client component carries no
            message dependency. t.raw is the house idiom for an array. */}
        <RotatingHeadline slogans={t.raw('landing.slogans') as string[]} />
        <p style={{ margin: 0, fontSize: 18, color: 'var(--ink-secondary)' }}>
          {t('landing.lead')}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/plan" className="btn btn-primary btn-lg">
            {t('landing.cta')}
          </Link>
          <Link href="/metodika" className="btn btn-secondary btn-lg">
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
