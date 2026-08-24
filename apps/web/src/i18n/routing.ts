import { defineRouting } from 'next-intl/routing';

/**
 * Two full locales, not one compromise. Czech and Slovak are mutually intelligible
 * but a finance product written in the wrong one reads as foreign, and nothing marks
 * a foreign tool faster than the wrong declension on a benefit's name.
 */
export const routing = defineRouting({
  locales: ['cs', 'sk'],
  defaultLocale: 'cs',
});

export type AppLocale = (typeof routing.locales)[number];
