import type { MetadataRoute } from 'next';

/**
 * Installable as a PWA. This buys most of the mobile value at a fraction of the cost of a
 * native app, and it delays the App Store legal-entity problem until there is a reason to
 * take it on. Note that iOS only delivers web push once a PWA is on the home screen, which
 * is why the native app remains the plan for notifications rather than this.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dovolíme si? — simulátor rodinných financí',
    short_name: 'Dovolíme si?',
    description:
      'Měsíc po měsíci spočítaný rozpočet domácnosti na dalších 25 let. Zdarma, bez registrace, data zůstávají v prohlížeči.',
    start_url: '/cs/plan',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f9f9f7',
    theme_color: '#2a78d6',
    lang: 'cs',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
