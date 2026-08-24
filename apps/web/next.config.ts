import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* Workspace packages ship TypeScript source, so Next compiles them itself. */
  transpilePackages: ['@wealthplanner/engine', '@wealthplanner/jurisdictions'],
  experimental: { optimizePackageImports: [] },
};

export default withNextIntl(nextConfig);
