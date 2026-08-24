import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider>
          <RegisterServiceWorker />
          <header
            style={{
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}
          >
            <div
              className="wrap"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                minHeight: 58,
                flexWrap: 'wrap',
              }}
            >
              <Link
                href="/"
                style={{
                  fontWeight: 700,
                  color: 'var(--ink)',
                  textDecoration: 'none',
                  fontSize: 16,
                  letterSpacing: '-0.02em',
                }}
              >
                {t('brand.name')}
              </Link>
              <nav
                style={{
                  display: 'flex',
                  gap: 14,
                  fontSize: 14,
                  marginInlineStart: 'auto',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <Link href="/plan">{t('nav.plan')}</Link>
                <Link href="/parametre">{t('nav.parameters')}</Link>
                <Link href="/metodika">{t('nav.methodology')}</Link>
                <Link href="/zasady">{t('nav.privacy')}</Link>
                <Link href="/" locale={locale === 'cs' ? 'sk' : 'cs'} hrefLang={locale === 'cs' ? 'sk' : 'cs'}>
                  {locale === 'cs' ? 'SK' : 'CZ'}
                </Link>
                <ThemeToggle toDark={t('nav.toDark')} toLight={t('nav.toLight')} />
              </nav>
            </div>
          </header>

          <main className="wrap" style={{ paddingBlock: '28px 56px' }}>
            {children}
          </main>

          <footer
            style={{ borderTop: '1px solid var(--border)', paddingBlock: 24, fontSize: 13 }}
          >
            <div className="wrap" style={{ display: 'grid', gap: 8 }}>
              <p className="muted" style={{ margin: 0, maxWidth: '72ch' }}>
                {t('disclaimer.long')}
              </p>
              <p className="muted" style={{ margin: 0 }}>
                <a href="https://github.com/MilanKubackaM/wealthPlanner">
                  {t('methodology.sourceCode')}
                </a>
              </p>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
