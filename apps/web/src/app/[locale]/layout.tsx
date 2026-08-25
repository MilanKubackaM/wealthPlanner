import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { SiteNav } from '@/components/SiteNav';
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';
import '../globals.css';

/* Stamped before first paint, so a stored theme that disagrees with the OS never flashes.
   Legal under the CSP in next.config.ts: script-src includes 'unsafe-inline'. It only writes an
   attribute on <html>, which React does not hydrate, so it cannot cause a mismatch. */
const THEME_BOOT =
  "try{var t=localStorage.getItem('wealthplanner.theme');" +
  "if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}";

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <RegisterServiceWorker />

          <SiteNav
            locale={locale as AppLocale}
            labels={{
              brand: t('brand.name'),
              plan: t('nav.plan'),
              parameters: t('nav.parameters'),
              methodology: t('nav.methodology'),
              cta: t('nav.cta'),
              navLabel: t('nav.label'),
              langLabel: t('nav.langLabel'),
              themeLabel: t('nav.theme'),
              skip: t('nav.skip'),
            }}
          />

          <main id="main" className="wrap main">
            {children}
          </main>

          <footer style={{ borderTop: '1px solid var(--border)', paddingBlock: 24, fontSize: 13 }}>
            <div className="wrap" style={{ display: 'grid', gap: 8 }}>
              <p className="muted" style={{ margin: 0, maxWidth: '72ch' }}>
                {t('disclaimer.long')}
              </p>
              <p
                className="muted"
                style={{ margin: 0, display: 'flex', gap: 14, flexWrap: 'wrap' }}
              >
                {/* /zasady lives here, not in the nav — a legal document, not a destination. */}
                <Link href="/zasady">{t('nav.privacy')}</Link>
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
