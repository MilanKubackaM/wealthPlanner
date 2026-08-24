'use client';

import { useEffect } from 'react';

/** Registers the offline shell. Silent on failure — offline is a bonus, never a requirement. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    const timer = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
