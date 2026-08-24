'use client';

import { useTranslations } from 'next-intl';
import type { Envelope, Person, ProjectionResult } from '@wealthplanner/engine';
import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import { money, type UiLocale } from '@/lib/format';
import { NumberInput, SelectInput } from './fields';

/**
 * Envelopes are what make a reserve figure believable rather than naïve: "we have 200 000" is
 * a different statement from "we have 200 000, of which 120 000 is already earmarked for a car
 * and a holiday". The engine treats them as descriptive — they report, they do not alter the
 * projection — and a test asserts exactly that, so nobody later mistakes them for a cash flow.
 */
export function EnvelopesEditor({
  envelopes,
  people,
  result,
  currency,
  locale,
  onChange,
}: {
  envelopes: Envelope[];
  people: Person[];
  result: ProjectionResult;
  currency: CurrencyCode;
  locale: UiLocale;
  onChange: (next: Envelope[]) => void;
}) {
  const t = useTranslations();

  const ownerOptions = [
    { value: 'shared', label: t('envelopes.shared') },
    ...people.map((person, index) => ({
      value: person.id,
      label: person.label || t('planner.person', { n: index + 1 }),
    })),
  ];

  function update(index: number, patch: Partial<Envelope>) {
    onChange(envelopes.map((envelope, i) => (i === index ? { ...envelope, ...patch } : envelope)));
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink-secondary)' }}>
          {t('envelopes.title')}
        </h3>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12, maxWidth: '66ch' }}>
          {t('envelopes.body')}
        </p>
      </div>

      {envelopes.length > 0 && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
          <span>
            <span className="muted">{t('envelopes.sharedTotal')}: </span>
            <strong className="tabular">
              {money(result.sharedEnvelopeTotal, currency, locale)}
            </strong>
          </span>
          <span>
            <span className="muted">{t('envelopes.personalTotal')}: </span>
            <strong className="tabular">
              {money(result.personalEnvelopeTotal, currency, locale)}
            </strong>
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {envelopes.map((envelope, index) => {
          const pct = envelope.target > 0 ? Math.round((envelope.amount / envelope.target) * 100) : 0;
          return (
            <div
              key={envelope.id}
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
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                }}
              >
                <div className="field">
                  <label htmlFor={`env-name-${envelope.id}`}>{t('envelopes.name')}</label>
                  <input
                    id={`env-name-${envelope.id}`}
                    value={envelope.label}
                    onChange={(event) => update(index, { label: event.target.value })}
                  />
                </div>
                <NumberInput
                  id={`env-amount-${envelope.id}`}
                  label={t('envelopes.amount')}
                  value={envelope.amount}
                  min={0}
                  step={currency === 'CZK' ? 1_000 : 50}
                  onChange={(amount) => update(index, { amount })}
                />
                <NumberInput
                  id={`env-target-${envelope.id}`}
                  label={t('envelopes.target')}
                  value={envelope.target}
                  min={0}
                  step={currency === 'CZK' ? 5_000 : 250}
                  onChange={(target) => update(index, { target })}
                />
                <SelectInput
                  id={`env-owner-${envelope.id}`}
                  label={t('envelopes.owner')}
                  value={envelope.owner}
                  options={ownerOptions}
                  onChange={(owner) =>
                    update(index, { owner, countsTowardReserve: owner === 'shared' })
                  }
                  hint={t('envelopes.countsHint')}
                />
              </div>

              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
              >
                {/* A meter, with the percentage in text beside it — never a bar alone. */}
                <div
                  role="img"
                  aria-label={t('envelopes.progress', { pct })}
                  style={{
                    flex: '1 1 160px',
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--grid)',
                    overflow: 'hidden',
                    minWidth: 120,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, pct))}%`,
                      height: '100%',
                      background:
                        pct >= 100 ? 'var(--status-good)' : 'var(--series-reserve)',
                    }}
                  />
                </div>
                <span className="muted tabular" style={{ fontSize: 12 }}>
                  {t('envelopes.progress', { pct })}
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '4px 10px', fontSize: 13, marginInlineStart: 'auto' }}
                  onClick={() => onChange(envelopes.filter((_, i) => i !== index))}
                >
                  {t('envelopes.remove')}
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          className="btn"
          style={{ justifySelf: 'start' }}
          onClick={() =>
            onChange([
              ...envelopes,
              {
                id: `e${envelopes.length + 1}-${envelopes.length}`,
                label: '',
                owner: 'shared',
                amount: 0,
                target: currency === 'CZK' ? 50_000 : 2_000,
                countsTowardReserve: true,
              },
            ])
          }
        >
          {t('envelopes.add')}
        </button>
      </div>
    </section>
  );
}
