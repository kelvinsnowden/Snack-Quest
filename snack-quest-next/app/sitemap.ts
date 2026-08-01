import type { MetadataRoute } from 'next';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { packageRepository } from '@/repositories/packageRepository';
import { getSiteUrl } from '@/lib/seo/siteUrl';

/**
 * Reads live package data — same reasoning as app/(marketing)/layout.tsx's
 * `force-dynamic`. Without this, `next build` tries to prerender
 * sitemap.xml once at build time and fails against the connected
 * project until the packages composite index is deployed (task: deploy
 * real Firebase project + indexes) — forcing dynamic rendering is the
 * correct fix regardless, since active boxes change independently of
 * deploys.
 */
export const dynamic = 'force-dynamic';

const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/boxes', changeFrequency: 'daily', priority: 0.9 },
  { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/creators', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.4 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const businessId = getCurrentBusinessId();
  const packages = await packageRepository.listActive(businessId);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));

  const boxEntries: MetadataRoute.Sitemap = packages.map(({ id, data }) => ({
    url: `${siteUrl}/boxes/${id}`,
    lastModified: data.updatedAt.toDate(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticEntries, ...boxEntries];
}
