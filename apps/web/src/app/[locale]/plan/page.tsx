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
    <div className="stack">
      {/*
        Heading only. The subtitle moved into PlannerClient because it names the projection's
        horizon, and the horizon is a value the user edits — a server-rendered "25 rokov" was
        simply wrong for anyone who changed it.
      */}
      <h1 className="plan-h1">{t('nav.plan')}</h1>
      <PlannerClient locale={locale as AppLocale} startMonth={startMonth} today={today} />
    </div>
  );
}
