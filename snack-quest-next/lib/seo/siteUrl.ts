/**
 * The public origin the marketing site is served from — used for
 * `metadataBase`, canonical/OG URLs, `sitemap.ts`, and `robots.ts`.
 *
 * `NEXT_PUBLIC_SITE_URL` is the only value that yields the real,
 * customer-facing domain, so a production deployment must still set it.
 * The Vercel fallback below exists because the previous behavior — falling
 * straight through to `http://localhost:3000` — silently published
 * `localhost` canonical tags, OG image URLs, sitemap entries, and
 * Organization JSON-LD to the live site whenever the variable was missing
 * (observed in production). Search engines and social scrapers cannot
 * resolve `localhost`; the deployment's own Vercel origin is not the
 * branded domain, but it is at least real and reachable.
 *
 * Every caller is a Server Component or metadata route (verified: no
 * `'use client'` file imports this), so reading the server-only `VERCEL_*`
 * variable here is safe — it is neither inlined into nor needed by the
 * client bundle.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  // Injected automatically by Vercel: the project's stable production
  // hostname, without a scheme (e.g. "snack-quest.vercel.app").
  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProductionUrl) {
    return `https://${vercelProductionUrl.replace(/\/$/, '')}`;
  }

  return 'http://localhost:3000';
}
