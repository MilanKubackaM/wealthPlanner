'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { THEME_KEY } from '@/lib/theme';

/**
 * Re-applies the chosen theme after every navigation.
 *
 * The theme lives as `data-theme` on <html>, set imperatively — by the inline boot script on
 * first paint, and by the toggle on click. Switching language changes the `[locale]` segment,
 * which re-renders the root layout, and React then reconciles <html> back to its
 * server-rendered attributes: `data-theme` disappears and the page silently falls back to
 * `prefers-color-scheme`. Someone on a dark OS who had chosen light got thrown into dark by
 * clicking "SK". The boot script cannot help — it only runs on a full document load.
 *
 * A layout effect rather than a plain one, so the attribute is restored before the browser
 * paints and there is no frame of the wrong theme. Guarded by a window check because this
 * component is server-rendered too, and React warns about useLayoutEffect there — and the
 * end-to-end suite fails on any console output.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ThemeSync() {
  /* next/navigation, deliberately: next-intl's usePathname strips the locale, so it would not
     change on the one navigation this component exists for. */
  const pathname = usePathname();

  useIsomorphicLayoutEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      const root = document.documentElement;
      if (stored === 'dark' || stored === 'light') {
        if (root.dataset.theme !== stored) root.dataset.theme = stored;
      } else if (root.dataset.theme) {
        /* No stored choice means "follow the system", which is the absence of the attribute. */
        delete root.dataset.theme;
      }
    } catch {
      /* Private windows and blocked storage both throw; the system preference then stands. */
    }
  }, [pathname]);

  return null;
}
