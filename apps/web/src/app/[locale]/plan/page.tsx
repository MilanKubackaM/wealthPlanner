import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PlannerClient } from '@/components/PlannerClient';
import { currentYearMonth } from '@/lib/format';
import type { AppLocale } from '@/i18n/routing';

export default async function PlanPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const startMonth = currentYearMonth();
  const today = new Date().toLocaleDateString(locale === 'sk' ? 'sk-SK' : 'cs-CZ');

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: '60ch' }}>
        <h1 style={{ fontSize: 26 }}>{t('nav.plan')}</h1>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 15 }}>
          {t('brand.tagline')}
        </p>
      </div>
      <PlannerClient locale={locale as AppLocale} startMonth={startMonth} today={today} />
    </div>
  );
}
