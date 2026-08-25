import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LandingHero } from '@/components/LandingHero';
import { RotatingHeadline } from '@/components/RotatingHeadline';
import { currentYearMonth } from '@/lib/format';
import type { AppLocale } from '@/i18n/routing';

/**
 * The landing page is a headline, two buttons, and a worked example. That is the whole design.
 *
 * It used to carry a paragraph explaining what a monthly simulator is, a line about privacy and
 * pricing, a paragraph interpreting the example, and three cards of forty words each. All of it
 * true, none of it read: a stranger deciding whether to spend a minute here does not read six
 * paragraphs first, and every one of them pushed the chart — the only thing that actually makes
 * the argument — further down the page. The detail still exists on /metodika, which is exactly
 * where someone who wants it will look.
 */

/**
 * The three claims, as three words and a mark each. Icons are inline SVG on purpose: the CSP
 * forbids a third-party origin, and an icon font for three glyphs would be absurd.
 *
 * `stroke="currentColor"` and no fill, so they take the card's text colour and work in both
 * themes without a second copy.
 */
const MARKS = [
  {
    key: 'landing.whyMonthlyTitle',
    /* A month grid: the unit the whole product is built on. */
    path: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9.5h18M8 2.5v3M16 2.5v3" />
        <path d="M7.5 13.5h3v3h-3z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: 'landing.verifiedTitle',
    /* A tick inside a shield: checked, and checked against something. */
    path: (
      <>
        <path d="M12 2.75 20 6v6.5c0 4.2-3.3 7.5-8 8.75-4.7-1.25-8-4.55-8-8.75V6z" />
        <path d="m8.75 12 2.25 2.25L15.5 9.5" />
      </>
    ),
  },
  {
    key: 'landing.openSourceTitle',
    /* Code brackets: the model is readable, not merely described. */
    path: <path d="M8.5 5.5 3.5 12l5 6.5M15.5 5.5l5 6.5-5 6.5" />,
  },
] as const;

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  /* The start month is resolved on the server so the client never disagrees with it. */
  const startMonth = currentYearMonth();

  return (
    <div className="stack-lg">
      <section className="hero">
        {/* The strings are resolved here, on the server, so the client component carries no
            message dependency. t.raw is the house idiom for an array. */}
        <RotatingHeadline slogans={t.raw('landing.slogans') as string[]} />
        <div className="hero-actions">
          <Link href="/plan" className="btn btn-primary btn-lg">
            {t('landing.cta')}
          </Link>
          <Link href="/metodika" className="btn btn-secondary btn-lg">
            {t('landing.ctaMethodology')}
          </Link>
        </div>
      </section>

      <LandingHero locale={locale as AppLocale} startMonth={startMonth} />

      <section className="marks">
        {MARKS.map((mark) => (
          <div key={mark.key} className="mark">
            <svg
              className="mark-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {mark.path}
            </svg>
            <h2 className="mark-label">{t(mark.key)}</h2>
          </div>
        ))}
      </section>
    </div>
  );
}
