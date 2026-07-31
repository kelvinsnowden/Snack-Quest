import type { CreatorTier } from '@/types';

/**
 * Display labels for `CreatorProfile.tier` (§ Creator Portal
 * leaderboards). Every creator starts and stays `'bronze'` today —
 * there's no threshold-based auto-upgrade anywhere in this codebase,
 * and no admin UI to change it either, so this is honestly just a
 * label map for a real-but-currently-static field, not a progression
 * system this file implies exists.
 */
export const CREATOR_TIER_LABELS: Record<CreatorTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};
