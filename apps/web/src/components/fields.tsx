'use client';

import { useEffect, useId, useState } from 'react';
import type { YearMonth } from '@wealthplanner/engine';
import type { CurrencyCode } from '@wealthplanner/jurisdictions';
import { CURRENCY_SYMBOL, groupNumber, parseNumber, type UiLocale } from '@/lib/format';

/**
 * One editable value, specified once and reused everywhere.
 *
 * What this replaces, and why each piece is here:
 *
 * - `type="number"` is gone. It mutates its own value on a scroll wheel or a trackpad swipe
 *   while focused, which on a long editing page silently rewrites the plan as the user
 *   scrolls past. Owning the parsing is the price of fixing that, and it buys the rest.
 * - The unit is an affix INSIDE the control, never smuggled into the label. The old field
 *   rendered "Roční růst příjmu · %", and the single most important unit in a financial
 *   planner — the currency — appeared on no field at all.
 * - Parsing accepts what this app itself prints: `money()` groups with U+00A0, so pasting
 *   the app's own output back in used to produce NaN, silently. So does a decimal comma.
 * - An empty field commits NOTHING. It used to commit 0 on the first keystroke of a retype,
 *   which flashed a catastrophic projection mid-edit.
 * - `min`/`max` are enforced on commit. They used to reach the DOM and be ignored, so
 *   `max={36}` on a field the engine clamps at 28 was purely decorative.
 * - Every field declares a `span` on a 12-column grid. `repeat(auto-fit, minmax(...))` with
 *   five different minima across five files is what produced orphan columns at almost every
 *   intermediate width, and it is the largest single reason the editor looked broken.
 */

export type NumberKind =
  | 'money.monthly'
  | 'money.balance'
  | 'money.large'
  | 'percent.rate'
  | 'percent.growth'
  | 'percent.share'
  | 'months'
  | 'years'
  | 'year'
  | 'count';

interface KindSpec {
  stepCZK: number;
  stepEUR: number;
  min?: number;
  max?: number;
  precision: number;
  money: boolean;
  percent: boolean;
}

/**
 * Three money scales and three percent scales for the whole product. Before this, "a monthly
 * amount" had four different arrow-key granularities and "an annual rate" had three, with no
 * rule anyone could hold in their head.
 */
const KINDS: Record<NumberKind, KindSpec> = {
  'money.monthly': { stepCZK: 500, stepEUR: 20, min: 0, precision: 0, money: true, percent: false },
  'money.balance': { stepCZK: 10_000, stepEUR: 500, min: 0, precision: 0, money: true, percent: false },
  'money.large': { stepCZK: 50_000, stepEUR: 2_000, min: 0, precision: 0, money: true, percent: false },
  'percent.rate': { stepCZK: 0.1, stepEUR: 0.1, min: 0, max: 40, precision: 1, money: false, percent: true },
  'percent.growth': { stepCZK: 0.25, stepEUR: 0.25, min: -5, max: 20, precision: 2, money: false, percent: true },
  'percent.share': { stepCZK: 5, stepEUR: 5, min: 0, max: 100, precision: 0, money: false, percent: true },
  months: { stepCZK: 1, stepEUR: 1, min: 0, precision: 0, money: false, percent: false },
  years: { stepCZK: 1, stepEUR: 1, min: 1, max: 70, precision: 0, money: false, percent: false },
  year: { stepCZK: 1, stepEUR: 1, precision: 0, money: false, percent: false },
  count: { stepCZK: 1, stepEUR: 1, min: 0, precision: 0, money: false, percent: false },
};

export type Span = 2 | 3 | 4 | 6 | 12;

export function stepFor(kind: NumberKind, currency: CurrencyCode): number {
  const spec = KINDS[kind];
  return currency === 'CZK' ? spec.stepCZK : spec.stepEUR;
}

export interface NumberFieldProps {
  id: string;
  kind: NumberKind;
  label: string;
  value: number;
  onChange: (value: number) => void;
  locale: UiLocale;
  currency: CurrencyCode;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  clamp?: boolean;
  hint?: string;
  error?: string | null;
  note?: { tone: 'info' | 'warning'; text: string } | null;
  /** True when the value is still the prefilled national average. Drives the badge. */
  estimate?: boolean;
  estimateLabel?: string;
  span?: Span;
  disabled?: boolean;
  autoFocus?: boolean;
  errorMax?: (max: number) => string;
  errorMin?: (min: number) => string;
}

export function NumberField({
  id,
  kind,
  label,
  value,
  onChange,
  locale,
  currency,
  unit,
  step,
  min,
  max,
  clamp = true,
  hint,
  error,
  note,
  estimate,
  estimateLabel,
  span = 6,
  disabled,
  autoFocus,
  errorMax,
  errorMin,
}: NumberFieldProps) {
  const spec = KINDS[kind];
  const effStep = step ?? stepFor(kind, currency);
  const effMin = min ?? spec.min;
  const effMax = max ?? spec.max;
  const affix = unit ?? (spec.money ? CURRENCY_SYMBOL[currency] : spec.percent ? '%' : undefined);

  const [text, setText] = useState(() => groupNumber(value, locale, spec.precision));
  const [focused, setFocused] = useState(false);
  const [bound, setBound] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setText(groupNumber(value, locale, spec.precision));
  }, [value, focused, locale, spec.precision]);

  function commit(next: number): void {
    let out = next;
    let message: string | null = null;
    if (clamp && effMax !== undefined && out > effMax) {
      out = effMax;
      message = errorMax ? errorMax(effMax) : null;
    }
    if (clamp && effMin !== undefined && out < effMin) {
      out = effMin;
      message = errorMin ? errorMin(effMin) : null;
    }
    setBound(message);
    onChange(out);
  }

  function nudge(direction: 1 | -1, multiplier: number): void {
    const raw = parseNumber(text) ?? value;
    const next = Math.round((raw + direction * effStep * multiplier) / effStep) * effStep;
    commit(Number(next.toFixed(spec.precision)));
    setText(groupNumber(next, locale, spec.precision));
  }

  const shown = error ?? bound;
  const describedBy = shown ? `${id}-err` : hint ? `${id}-hint` : undefined;

  return (
    <div className={`f span-${span}`}>
      <label className="f-label" htmlFor={id}>
        <span>{label}</span>
        {affix ? <span className="sr-only">{` (${affix})`}</span> : null}
        {estimate && estimateLabel ? <span className="f-badge">{estimateLabel}</span> : null}
      </label>
      <div className="f-control" data-invalid={shown ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined}>
        <input
          id={id}
          type="text"
          inputMode={spec.precision > 0 ? 'decimal' : 'numeric'}
          enterKeyHint="next"
          autoComplete="off"
          disabled={disabled}
          autoFocus={autoFocus}
          value={text}
          aria-invalid={shown ? true : undefined}
          aria-describedby={describedBy}
          onFocus={(event) => {
            setFocused(true);
            /* Raw digits while the caret is in the field: grouping fights the cursor. */
            setText(value === 0 ? '' : String(Number(value.toFixed(spec.precision))));
            event.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            const parsed = parseNumber(text);
            if (parsed !== null) commit(Number(parsed.toFixed(spec.precision)));
            setText(groupNumber(parsed ?? value, locale, spec.precision));
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              nudge(1, event.shiftKey ? 10 : 1);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              nudge(-1, event.shiftKey ? 10 : 1);
            } else if (event.key === 'PageUp') {
              event.preventDefault();
              nudge(1, 10);
            } else if (event.key === 'PageDown') {
              event.preventDefault();
              nudge(-1, 10);
            } else if (event.key === 'Enter') {
              const parsed = parseNumber(text);
              if (parsed !== null) commit(Number(parsed.toFixed(spec.precision)));
            }
          }}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const parsed = parseNumber(next);
            /* null means "nothing yet" — the model keeps its last value. Never commit 0. */
            if (parsed !== null) commit(Number(parsed.toFixed(spec.precision)));
          }}
        />
        {affix ? (
          <span className="f-unit" aria-hidden="true">
            {affix}
          </span>
        ) : null}
      </div>
      {shown ? (
        <span className="f-error" id={`${id}-err`}>
          {shown}
        </span>
      ) : hint ? (
        <span className="f-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {note ? (
        <span className="f-note" data-tone={note.tone}>
          <span aria-hidden="true">{note.tone === 'warning' ? '!' : 'i'}</span>
          {note.text}
        </span>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder,
  maxLength = 40,
  span = 6,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
  span?: Span;
}) {
  return (
    <div className={`f span-${span}`}>
      <label className="f-label" htmlFor={id}>
        <span>{label}</span>
      </label>
      <div className="f-control">
        <input
          id={id}
          type="text"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {hint ? (
        <span className="f-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A choice. `segmented` for two or three short options, `cards` for the branch questions the
 * wizard is built out of, `select` once there are five or more. A one-option `<select>` is
 * never rendered — the caller renders a sentence instead.
 */
export function ChoiceField<T extends string>({
  id,
  label,
  variant,
  value,
  options,
  onChange,
  hint,
  span = 12,
}: {
  id: string;
  label: string;
  variant: 'segmented' | 'cards' | 'select';
  value: T | null;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  hint?: string;
  span?: Span;
}) {
  if (variant === 'select') {
    return (
      <div className={`f span-${span}`}>
        <label className="f-label" htmlFor={id}>
          <span>{label}</span>
        </label>
        <div className="f-control">
          <select id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value as T)}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {hint ? <span className="f-hint">{hint}</span> : null}
      </div>
    );
  }

  return (
    <fieldset className={`f span-${span}`} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="f-label">{label}</legend>
      <div className={variant === 'cards' ? 'choice-cards' : 'choice-seg'} role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={variant === 'cards' ? 'choice-card' : 'btn btn-secondary'}
              data-selected={selected ? 'true' : undefined}
              onClick={() => onChange(option.value)}
            >
              <span className="choice-label">{option.label}</span>
              {option.hint ? <span className="choice-hint">{option.hint}</span> : null}
            </button>
          );
        })}
      </div>
      {hint ? <span className="f-hint">{hint}</span> : null}
    </fieldset>
  );
}

export function MonthYearField({
  id,
  label,
  value,
  onChange,
  months,
  minYear,
  maxYear,
  precision = 'month',
  hint,
  error,
  span = 6,
}: {
  id: string;
  label: string;
  value: YearMonth;
  onChange: (value: YearMonth) => void;
  months: string[];
  minYear: number;
  maxYear: number;
  precision?: 'month' | 'year';
  hint?: string;
  error?: string | null;
  span?: Span;
}) {
  return (
    <div className={`f span-${span}`}>
      {/* One label, pointing at one control. The old version put an aria-label on the year
          input as well, so the year read out as the whole field's name. */}
      <label className="f-label" htmlFor={precision === 'year' ? `${id}-year` : `${id}-month`}>
        <span>{label}</span>
      </label>
      <div className="f-row">
        {precision === 'month' ? (
          <div className="f-control" style={{ flex: '1 1 auto' }}>
            <select
              id={`${id}-month`}
              value={value.month}
              onChange={(event) => onChange({ ...value, month: Number(event.target.value) })}
            >
              {months.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="f-control" style={{ flex: '0 1 7.5em', minWidth: '5.5em' }}>
          <input
            id={`${id}-year`}
            type="text"
            inputMode="numeric"
            value={String(value.year)}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              const parsed = parseNumber(event.target.value);
              if (parsed === null) return;
              const year = Math.round(parsed);
              if (year < minYear || year > maxYear) {
                onChange({ ...value, year });
                return;
              }
              onChange({ ...value, year });
            }}
          />
        </div>
      </div>
      {error ? <span className="f-error">{error}</span> : hint ? <span className="f-hint">{hint}</span> : null}
    </div>
  );
}

/** A group of fields on the 12-column grid, optionally collapsible with a live summary. */
export function FieldGroup({
  id,
  title,
  subtitle,
  summary,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  id?: string;
  title?: string;
  subtitle?: string;
  summary?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const generated = useId();
  const bodyId = `${id ?? generated}-body`;

  return (
    <section className="fg" id={id}>
      {title ? (
        collapsible ? (
          <h3 className="fg-h">
            <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
              <svg className="disc-chev" viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
                <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="fg-title">{title}</span>
              {summary ? <span className="fg-sum">{summary}</span> : null}
            </button>
          </h3>
        ) : (
          <h3 className="fg-h">
            <span className="fg-title">{title}</span>
            {summary ? <span className="fg-sum">{summary}</span> : null}
          </h3>
        )
      ) : null}
      {subtitle ? <p className="fg-sub muted">{subtitle}</p> : null}
      <div className="grid-12" id={bodyId} hidden={collapsible && !open ? true : undefined}>
        {children}
      </div>
    </section>
  );
}

/**
 * A list of things the user can add and remove. Replaces four hand-rolled card-plus-remove
 * implementations (children, envelopes, sleeves, and now debts), each of which re-declared
 * its own border, padding, gap and 13px remove button.
 */
export function Repeater<T>({
  items,
  itemTitle,
  addLabel,
  removeLabel,
  emptyState,
  max,
  onAdd,
  onRemove,
  renderItem,
}: {
  items: T[];
  itemTitle: (item: T, index: number) => string;
  addLabel: string;
  removeLabel: string;
  emptyState?: string;
  max?: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  return (
    <div className="rep">
      {items.length === 0 && emptyState ? <p className="muted rep-empty">{emptyState}</p> : null}
      {items.map((item, index) => (
        <div className="rep-item" key={index}>
          <div className="rep-head">
            <span className="rep-title">{itemTitle(item, index)}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(index)}>
              {removeLabel}
            </button>
          </div>
          <div className="grid-12">{renderItem(item, index)}</div>
        </div>
      ))}
      {max === undefined || items.length < max ? (
        <button type="button" className="btn btn-secondary btn-sm rep-add" onClick={onAdd}>
          {addLabel}
        </button>
      ) : null}
    </div>
  );
}

/** For the controls that are mechanism rather than fact. Closed by default. */
export function AdvancedDisclosure({
  id,
  label,
  defaultOpen = false,
  children,
}: {
  id: string;
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="span-12 adv">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-expanded={open}
        aria-controls={`${id}-adv`}
        onClick={() => setOpen(!open)}
      >
        <svg className="disc-chev" viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
          <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {label}
      </button>
      <div className="grid-12" id={`${id}-adv`} hidden={!open ? true : undefined}>
        {children}
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'critical' | 'serious' | 'warning' | 'good';
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      {/* The tone comes from a token that passes 7:1 as TEXT. The chart's status fills do
          not — one of them is 1.79:1 — and this is a 22px number. */}
      <div className="stat-value" data-tone={tone}>
        {value}
      </div>
    </div>
  );
}
