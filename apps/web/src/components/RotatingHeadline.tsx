'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A rotating <h1> that is one heading, not a slot machine.
 *
 * Height: every slogan is rendered into the SAME grid cell, so the row's intrinsic height
 * is max(all slogans) — resolved by the browser on the server-rendered HTML, and re-resolved
 * for free on resize, zoom and font-size change. No measurement pass exists, so no measured
 * value can go stale and nothing shifts at hydration.
 *
 * Accessibility: the only non-hidden text in the heading is a visually-hidden copy of
 * slogans[0]. The accessible name is therefore stable and announced once. The visual stack is
 * aria-hidden and there is no live region — a screen reader user never hears the rotation.
 *
 * Determinism: the initial state is the literal index 0 on both server and client. The
 * reduced-motion decision is taken in an effect, after hydration, so the first client paint is
 * byte-identical to the server HTML.
 */

const HOLD_MS = 4200;

export function RotatingHeadline({ slogans }: { slogans: string[] }) {
  const [{ current, leaving }, setSlot] = useState<{ current: number; leaving: number | null }>({
    current: 0,
    leaving: null,
  });
  const [rotate, setRotate] = useState(false);
  const [paused, setPaused] = useState(false);
  const hostRef = useRef<HTMLHeadingElement>(null);

  /* Rotate only if there is something to rotate to and the user has not asked us not to. */
  useEffect(() => {
    if (slogans.length < 2) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setRotate(!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [slogans.length]);

  /* Pause while the pointer or the keyboard is in this part of the page, or the tab is hidden. */
  useEffect(() => {
    const section = hostRef.current?.closest('section') ?? null;
    const onVisibility = () => setPaused(document.visibilityState === 'hidden');
    const onFocusIn = () => setPaused(true);
    const onFocusOut = () => setPaused(false);

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    section?.addEventListener('focusin', onFocusIn);
    section?.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      section?.removeEventListener('focusin', onFocusIn);
      section?.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  useEffect(() => {
    if (!rotate || paused) return;
    const id = window.setInterval(() => {
      setSlot((s) => ({ current: (s.current + 1) % slogans.length, leaving: s.current }));
    }, HOLD_MS);
    return () => window.clearInterval(id);
  }, [rotate, paused, slogans.length]);

  return (
    <h1
      ref={hostRef}
      className="headline"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {/* The one thing assistive tech reads. Absolutely positioned, so it never affects height. */}
      <span className="visually-hidden">{slogans[0]}</span>

      <span className="headline-stack" aria-hidden="true">
        {slogans.map((text, i) => (
          <span
            key={text}
            className="headline-slot"
            data-state={i === current ? 'current' : i === leaving ? 'leaving' : 'idle'}
          >
            {text}
          </span>
        ))}
      </span>
    </h1>
  );
}
