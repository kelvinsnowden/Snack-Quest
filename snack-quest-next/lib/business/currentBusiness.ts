import { cache } from 'react';
import { businessRepository } from '@/repositories/businessRepository';
import { getCurrentBusinessId } from './currentBusinessId';
import type { Business } from '@/types';

/**
 * The public marketing site's one tenant lookup, `cache()`-wrapped so
 * every Server Component on a given request (header, footer, page
 * body) that needs the business's name/WhatsApp number shares one
 * Firestore read instead of one each — same pattern as
 * `getCreatorSession` (lib/auth/creatorSession.ts).
 */
export const getCurrentBusiness = cache(async (): Promise<Business | null> => {
  return businessRepository.findById(getCurrentBusinessId());
});
