import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo/siteUrl';

/**
 * Only the public marketing routes are meant for search engines — every
 * other top-level segment is an authenticated operational surface
 * (Admin/Agent/Warehouse/Finance/Creator Portal), a webhook/API route,
 * or a personal referral redirect (`/r/[code]`), none of which should
 * ever show up in search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/agent', '/warehouse', '/finance', '/creator', '/api', '/r'],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
