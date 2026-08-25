'use client';

import { useEffect, useRef } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { ThemeToggle } from './ThemeToggle';
import type { AppLocale } from '@/i18n/routing';

/**
 * Three tiers in one bar: identity, destinations, utilities. Destinations are furniture
 * (--ink-secondary, weight 500), not content links — with ONE exception.
 *
 * `/plan` carries the accent, because the bar used to hold a primary "try it" button that went
 * to exactly that route. Removing the button would have left nothing in the bar pointing at the
 * product, so the accent moved onto the destination the button duplicated rather than being
 * deleted along with it. One accented thing in the bar, same as before; one fewer control.
 *
 * The bar has a FIXED height on desktop and cannot wrap. The scrolled state changes background,
 * border and shadow only — a sticky element that changes height reflows the document under it.
 *
 * No hamburger: three destinations do not justify a focus trap, a scroll lock, an outside-click
 * handler and an aria-expanded state. On mobile the bar becomes two rows and stops being sticky,
 * because 102px of permanent chrome on a 640px viewport is a sixth of a page whose whole value
 * is a chart.
 */

type Labels = {
  brand: string;
  plan: string;
  parameters: string;
  methodology: string;
  navLabel: string;
  langLabel: string;
  themeLabel: string;
  skip: string;
};

const ROUTES = [
  { href: '/plan', key: 'plan', primary: true },
  { href: '/parametre', key: 'parameters', primary: false },
  { href: '/metodika', key: 'methodology', primary: false },
] as const;

export function SiteNav({ locale, labels }: { locale: AppLocale; labels: Labels }) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);

  /* Background/border/shadow only. Written straight to the DOM so a scroll never re-renders React. */
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = headerRef.current;
      if (el) el.dataset.scrolled = window.scrollY > 8 ? 'true' : 'false';
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  const other: AppLocale = locale === 'cs' ? 'sk' : 'cs';

  return (
    <>
      <a className="skip-link" href="#main">
        {labels.skip}
      </a>

      <header className="nav" ref={headerRef} data-scrolled="false">
        <div className="wrap nav-inner">
          <Link href="/" className="nav-brand">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              {/* The product in one glyph: a reserve that dips and recovers. */}
              <path
                d="M2 7 C6 7 7 19 12 19 C17 19 18 5 22 5"
                fill="none"
                stroke="var(--accent-strong)"
                strokeWidth="2.25"
                strokeLinecap="round"
              />
              <circle cx="12" cy="19" r="2.4" fill="var(--accent-strong)" />
            </svg>
            <span>{labels.brand}</span>
          </Link>

          <nav className="nav-routes" aria-label={labels.navLabel}>
            <ul>
              {ROUTES.map(({ href, key, primary }) => {
                const active = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className="nav-link"
                      data-active={active}
                      data-primary={primary || undefined}
                      data-label={labels[key]}
                      aria-current={active ? 'page' : undefined}
                    >
                      {labels[key]}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="nav-utils">
            {/* Two options, so two segments — not a menu behind a tap. Both keep the route. */}
            <div className="seg" role="group" aria-label={labels.langLabel}>
              <Link href={pathname} locale={locale} aria-current="true" hrefLang={locale}>
                {locale.toUpperCase()}
              </Link>
              <Link href={pathname} locale={other} hrefLang={other}>
                {other.toUpperCase()}
              </Link>
            </div>

            <ThemeToggle label={labels.themeLabel} />

          </div>
        </div>
      </header>
    </>
  );
}
