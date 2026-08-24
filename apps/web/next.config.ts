import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/*
 * Security headers live HERE rather than in vercel.json, deliberately.
 *
 * Vercel reads vercel.json from the project's Root Directory. This app deploys with Root
 * Directory = apps/web, so a vercel.json at the repository root is silently ignored — the
 * headers would look configured and simply not be served. Declaring them in the framework
 * config removes the question: they apply in `next dev`, in `next start`, on Vercel, and on
 * anything else that ever hosts this app.
 *
 * The Content-Security-Policy allows no third-party origin at all, which this app can afford
 * because it talks to none: the whole simulation runs inline in the page and no household
 * number ever leaves the browser. 'unsafe-inline' is required for the scripts and styles Next
 * itself inlines for hydration.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* Workspace packages ship TypeScript source, so Next compiles them itself. */
  transpilePackages: ['@wealthplanner/engine', '@wealthplanner/jurisdictions'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
