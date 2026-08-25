'use client';

import { THEME_KEY } from '@/lib/theme';

/**
 * Stateless on purpose. The current theme is stamped on <html> before first paint by
 * THEME_BOOT in the layout and re-applied after every navigation by <ThemeSync/>. Which icon
 * shows is decided by CSS (.i-sun / .i-moon) from the same selectors the tokens use — so there is no React state to disagree with the server, no
 * post-hydration label flip, and no aria-pressed that can lie. The accessible name is the
 * action ("switch light/dark mode"), which is constant; the current theme is conveyed by the
 * whole page.
 */
export function ThemeToggle({ label }: { label: string }) {
  function toggle() {
    const root = document.documentElement;
    const isDark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = isDark ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private windows throw */
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon btn-sm"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <svg className="i-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
      <svg className="i-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
