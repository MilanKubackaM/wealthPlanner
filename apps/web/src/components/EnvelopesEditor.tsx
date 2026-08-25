'use client';

import { useTranslations } from 'next-intl';
import type { Envelope, Person, ProjectionResult } from '@wealthplanner/engine';
import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import { money, type UiLocale } from '@/lib/format';
import { ChoiceField, NumberField, TextField } from './fields';

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
  soloLabel,
  onChange,
}: {
  envelopes: Envelope[];
  people: Person[];
  result: ProjectionResult;
  currency: CurrencyCode;
  locale: UiLocale;
  /** Set for a one-adult household, where "Osoba 1" is the wrong name for the only person. */
  soloLabel?: string;
  onChange: (next: Envelope[]) => void;
}) {
  const t = useTranslations();

  /*
   * The shared/personal control stays even for one adult. It looks like a distinction without
   * a difference, but it is load-bearing: it decides whether the envelope backs the household
   * reserve, which is what `sharedEnvelopeTotal` reports.
   */
  const ownerOptions = [
    { value: 'shared', label: t('envelopes.shared') },
    ...people.map((person, index) => ({
      value: person.id,
      label: person.label || soloLabel || t('planner.person', { n: index + 1 }),
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
              <div className="grid-12">
                <TextField
                  id={`env-name-${envelope.id}`}
                  label={t('envelopes.name')}
                  value={envelope.label}
                  span={6}
                  onChange={(label) => update(index, { label })}
                />
                <NumberField
                  id={`env-amount-${envelope.id}`}
                  kind="money.balance"
                  label={t('envelopes.amount')}
                  value={envelope.amount}
                  span={3}
                  locale={locale}
                  currency={currency}
                  onChange={(amount) => update(index, { amount })}
                />
                <NumberField
                  id={`env-target-${envelope.id}`}
                  kind="money.balance"
                  label={t('envelopes.target')}
                  value={envelope.target}
                  span={3}
                  locale={locale}
                  currency={currency}
                  onChange={(target) => update(index, { target })}
                />
                <ChoiceField<string>
                  id={`env-owner-${envelope.id}`}
                  label={t('envelopes.owner')}
                  variant="select"
                  value={envelope.owner}
                  options={ownerOptions}
                  span={6}
                  hint={t('envelopes.countsHint')}
                  onChange={(owner) => update(index, { owner, countsTowardReserve: owner === 'shared' })}
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
                  className="btn btn-ghost btn-sm"
                  style={{ marginInlineStart: 'auto' }}
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
          className="btn btn-secondary btn-sm"
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
