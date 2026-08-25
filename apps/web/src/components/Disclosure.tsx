'use client';

import { useEffect, useState } from 'react';

/**
 * One collapsible section of the plan.
 *
 * Not `<details>`: the heading has to be a real `<h2>` for the document outline, the summary
 * line stays visible in both states, and print has to be able to force the panel open from
 * React state — a CSS-only `@media print` override cannot recover content React never
 * rendered.
 *
 * Not a tablist either. Tabs show exactly one panel, and these sections are not peers: the
 * findings are meant to be read before the comparison. Tabs would also break the two things
 * this page is actually for — Ctrl+F across the whole plan, and printing it.
 *
 * `hidden="until-found"` is what makes collapsing honest: in Chromium the browser finds text
 * inside a collapsed panel and opens it. Elsewhere it degrades to plain `hidden`.
 */
export function Disclosure({
  id,
  title,
  summary,
  open,
  printing,
  onToggle,
  soloTitle,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  open: boolean;
  printing: boolean;
  onToggle: (solo: boolean) => void;
  soloTitle?: string;
  children: React.ReactNode;
}) {
  const shown = open || printing;
  return (
    <section className="disc card" id={id} data-open={open ? 'true' : 'false'}>
      <h2 className="disc-h">
        <button
          type="button"
          id={`${id}-btn`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          title={soloTitle}
          onClick={(event) => onToggle(event.shiftKey)}
        >
          <svg className="disc-chev" viewBox="0 0 16 16" aria-hidden="true" width="16" height="16">
            <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="disc-title">{title}</span>
          {summary ? <span className="disc-sum">{summary}</span> : null}
        </button>
      </h2>
      <div
        className="disc-panel"
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-btn`}
        {...(shown ? {} : { hidden: 'until-found' as unknown as boolean })}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * The tab-like affordance the owner asked for, with disclosure semantics underneath: chips
 * that open a section and scroll to it. Sticky, and hidden in print.
 */
export function SectionRail({
  label,
  items,
  expandAll,
  collapseAll,
  onJump,
  onExpandAll,
  onCollapseAll,
}: {
  label: string;
  items: Array<{ id: string; label: string }>;
  expandAll: string;
  collapseAll: string;
  onJump: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <nav className="plan-rail" aria-label={label} data-print="hide">
      <div className="plan-rail-inner">
        {items.map((item) => (
          <button key={item.id} type="button" className="btn btn-ghost btn-sm" onClick={() => onJump(item.id)}>
            {item.label}
          </button>
        ))}
        <span className="plan-rail-spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onExpandAll}>
          {expandAll}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCollapseAll}>
          {collapseAll}
        </button>
      </div>
    </nav>
  );
}

/**
 * True while the browser is preparing to print. Load-bearing: the panels read this so a
 * collapsed plan is never the plan that comes out of the printer.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    const mq = window.matchMedia('print');
    const onChange = (event: MediaQueryListEvent) => setPrinting(event.matches);
    mq.addEventListener?.('change', onChange);
    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
      mq.removeEventListener?.('change', onChange);
    };
  }, []);
  return printing;
}
