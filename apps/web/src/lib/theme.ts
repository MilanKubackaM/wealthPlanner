/**
 * The theme's storage key, in a plain module on purpose.
 *
 * It has to be read by both the server layout (which inlines the first-paint boot script) and
 * two client components. A constant exported from a `'use client'` module is NOT a value on the
 * server — it arrives as a client reference proxy, and interpolating that into the inline
 * script produced `localStorage.getItem('function(){throw Error("Attempted to call
 * THEME_KEY() from the server…")}')`, whose own apostrophe closed the string and broke the
 * script on every page. Shared constants belong outside the client boundary.
 */
export const THEME_KEY = 'wealthplanner.theme';
export type Theme = 'light' | 'dark';
