/**
 * The public origin the marketing site is served from — used for
 * `metadataBase`, canonical/OG URLs, `sitemap.ts`, and `robots.ts`. Real
 * production deployments must set `NEXT_PUBLIC_SITE_URL`; local dev falls
 * back to localhost so metadata generation never throws when it's unset.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}
