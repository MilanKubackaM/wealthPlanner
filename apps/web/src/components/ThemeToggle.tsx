'use client';

import { useEffect, useState } from 'react';

/**
 * Three states, not two: an explicit choice stamps data-theme on <html>; with nothing
 * stamped the OS setting decides. The stamp is remembered per browser, and every read and
 * write is guarded because storage throws in private windows.
 */
export function ThemeToggle({ toDark, toLight }: { toDark: string; toLight: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('wealthplanner.theme');
    } catch {
      /* ignore */
    }
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.dataset.theme = stored;
      setDark(stored === 'dark');
      return;
    }
    setDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('wealthplanner.theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      className="btn"
      style={{ padding: '5px 10px', fontSize: 13 }}
      onClick={toggle}
      aria-pressed={dark === true}
    >
      {dark ? toLight : toDark}
    </button>
  );
}
