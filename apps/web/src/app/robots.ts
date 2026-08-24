import type { MetadataRoute } from 'next';

/**
 * Deliberately excluded from search engines for now. The product is not ready to be found by
 * strangers before the statutory parameters are verified from primary sources and a lawyer has
 * looked at the advice boundary. Flip this to `allow` when both are done — and note that the
 * page-level noindex in the locale layout has to come off at the same time, or this file alone
 * will do nothing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
