import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { businessRepository } from '@/repositories/businessRepository';
import { getCurrentBusinessId } from './currentBusinessId';
import type { Business } from '@/types';

/**
 * The public marketing site's one tenant lookup.
 *
 * Two layers of caching, because they solve different problems:
 *
 * `cache()` is per-request — it stops the header, footer and page body
 * of a single render each issuing their own Firestore read.
 *
 * `unstable_cache` is across requests, and that is the one that shows
 * up as speed (§ CTA responsiveness). The marketing layout is
 * `force-dynamic` because stock has to be live, so before this every
 * single page view — every tap on a CTA — paid a Firestore round trip
 * just to render the site name and WhatsApp number in the header.
 * Those change roughly never.
 *
 * Five minutes is chosen against what this data actually is: a
 * business name, a phone number, social links. Nobody edits those and
 * then needs the change visible in the same breath, and if they do,
 * five minutes is not a support call. Stock and prices are NOT read
 * through here — they come from `packageRepository` on each page, and
 * stay live.
 */
const CACHE_TTL_SECONDS = 300;

const loadBusiness = unstable_cache(
  async (businessId: string): Promise<Business | null> =>
    businessRepository.findById(businessId),
  ['marketing-current-business'],
  { revalidate: CACHE_TTL_SECONDS, tags: ['business'] },
);

export const getCurrentBusiness = cache(async (): Promise<Business | null> => {
  return loadBusiness(getCurrentBusinessId());
});
