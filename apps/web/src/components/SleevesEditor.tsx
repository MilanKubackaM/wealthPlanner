'use client';

import { useTranslations } from 'next-intl';
import type { InvestmentSleeve, Person } from '@wealthplanner/engine';
import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import type { UiLocale } from '@/lib/format';
import { NumberInput } from './fields';

/**
 * Per-person investment sleeves. This is the couple-specific detail that the market leader is
 * missing (its most-requested unshipped feature is a household account), and the "paid from
 * pocket money" flag is the one the prototype claimed in its copy but never enforced — so it
 * is a real checkbox here, wired to the engine's cap.
 */
export function SleevesEditor({
  person,
  personIndex,
  currency,
  locale,
  onChange,
}: {
  person: Person;
  personIndex: number;
  currency: CurrencyCode;
  locale: UiLocale;
  onChange: (next: InvestmentSleeve[]) => void;
}) {
  const t = useTranslations();
  const sleeves = person.investments;
  const name = person.label || t('planner.person', { n: personIndex + 1 });

  const fromPocketTotal = sleeves
    .filter((sleeve) => sleeve.fundedFromPocketMoney)
    .reduce((sum, sleeve) => sum + sleeve.monthlyContribution, 0);
  const overcommitted = fromPocketTotal > person.pocketMoney + 0.01;

  function update(index: number, patch: Partial<InvestmentSleeve>) {
    onChange(sleeves.map((sleeve, i) => (i === index ? { ...sleeve, ...patch } : sleeve)));
  }

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink-secondary)' }}>
        {t('sleeves.title', { name })}
      </h3>

      {sleeves.map((sleeve, index) => (
        <div
          key={sleeve.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 12,
            display: 'grid',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            }}
          >
            <div className="field">
              <label htmlFor={`sl-name-${sleeve.id}`}>{t('sleeves.name')}</label>
              <input
                id={`sl-name-${sleeve.id}`}
                value={sleeve.label}
                onChange={(event) => update(index, { label: event.target.value })}
              />
            </div>
            <NumberInput
              id={`sl-monthly-${sleeve.id}`}
              label={t('sleeves.monthly')}
              value={sleeve.monthlyContribution}
              min={0}
              step={currency === 'CZK' ? 500 : 25}
              onChange={(monthlyContribution) => update(index, { monthlyContribution })}
            />
            <NumberInput
              id={`sl-return-${sleeve.id}`}
              label={t('sleeves.return')}
              suffix="%"
              step={0.5}
              value={sleeve.annualReturnPct}
              onChange={(annualReturnPct) => update(index, { annualReturnPct })}
            />
            <NumberInput
              id={`sl-start-${sleeve.id}`}
              label={t('sleeves.start')}
              value={sleeve.startingBalance}
              min={0}
              step={currency === 'CZK' ? 10_000 : 500}
              onChange={(startingBalance) => update(index, { startingBalance })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
              htmlFor={`sl-pocket-${sleeve.id}`}
            >
              <input
                id={`sl-pocket-${sleeve.id}`}
                type="checkbox"
                checked={sleeve.fundedFromPocketMoney}
                onChange={(event) =>
                  update(index, { fundedFromPocketMoney: event.target.checked })
                }
              />
              {t('sleeves.fromPocket')}
            </label>
            <button
              type="button"
              className="btn"
              style={{ padding: '4px 10px', fontSize: 13, marginInlineStart: 'auto' }}
              onClick={() => onChange(sleeves.filter((_, i) => i !== index))}
            >
              {t('sleeves.remove')}
            </button>
          </div>
        </div>
      ))}

      {overcommitted && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--status-serious)',
            display: 'flex',
            gap: 6,
          }}
        >
          <span aria-hidden="true">!</span>
          {t('sleeves.fromPocketHint')}
        </p>
      )}

      <button
        type="button"
        className="btn"
        style={{ justifySelf: 'start' }}
        onClick={() =>
          onChange([
            ...sleeves,
            {
              id: `${person.id}-s${sleeves.length + 1}`,
              label: '',
              monthlyContribution: 0,
              annualReturnPct: 7,
              startingBalance: 0,
              fundedFromPocketMoney: true,
            },
          ])
        }
      >
        {t('sleeves.add')}
      </button>
    </section>
  );
}
