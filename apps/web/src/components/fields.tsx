'use client';

import { useEffect, useState } from 'react';
import type { YearMonth } from '@wealthplanner/engine';

/**
 * Numeric inputs keep their own text while focused, so a half-typed value never gets
 * rewritten under the user's cursor, and commit a number on every change so the chart
 * recomputes as they type. A full simulation costs under a millisecond, so there is no
 * reason to make them wait for it.
 */
export function NumberInput({
  value,
  onChange,
  label,
  hint,
  suffix,
  min,
  max,
  step = 1,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  hint?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  id: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {suffix ? <span className="muted"> · {suffix}</span> : null}
      </label>
      <input
        id={id}
        inputMode="decimal"
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(String(value));
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next === '' || next === '-') {
            onChange(0);
            return;
          }
          const parsed = Number(next);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function SelectInput<T extends string>({
  value,
  onChange,
  label,
  options,
  id,
  hint,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  options: Array<{ value: T; label: string }>;
  id: string;
  hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function MonthYearInput({
  value,
  onChange,
  label,
  months,
  id,
  minYear,
  maxYear,
}: {
  value: YearMonth;
  onChange: (value: YearMonth) => void;
  label: string;
  months: string[];
  id: string;
  minYear: number;
  maxYear: number;
}) {
  return (
    <div className="field">
      <label htmlFor={`${id}-month`}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          id={`${id}-month`}
          value={value.month}
          onChange={(event) => onChange({ ...value, month: Number(event.target.value) })}
          style={{ flex: '1 1 auto' }}
        >
          {months.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
        <input
          id={`${id}-year`}
          type="number"
          value={value.year}
          min={minYear}
          max={maxYear}
          onChange={(event) => onChange({ ...value, year: Number(event.target.value) })}
          style={{ width: 96 }}
          aria-label={label}
        />
      </div>
    </div>
  );
}

export function Fieldset({
  title,
  children,
  columns = 2,
}: {
  title?: string;
  children: React.ReactNode;
  columns?: number;
}) {
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {title ? (
        <h3 style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink-secondary)' }}>{title}</h3>
      ) : null}
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: `repeat(auto-fit, minmax(${columns > 1 ? 190 : 240}px, 1fr))`,
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'critical' | 'warning' | 'good';
}) {
  const color =
    tone === 'critical'
      ? 'var(--status-critical)'
      : tone === 'warning'
        ? 'var(--status-warning)'
        : tone === 'good'
          ? 'var(--status-good)'
          : 'var(--ink)';
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '12px 14px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--ink-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 650, color, lineHeight: 1.15 }}>{value}</div>
    </div>
  );
}
