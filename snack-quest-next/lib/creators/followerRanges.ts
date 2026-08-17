/**
 * The bounded set a creator picks their audience size from at
 * registration and in their profile (components/creator/OnboardingForm.tsx,
 * components/creator/ProfileForm.tsx — both previously duplicated this
 * array; this is the one source of truth now). Also the only real
 * filter dimension for creator search by follower range (§ Creator
 * Marketplace, admin creator search): since every stored
 * `CreatorProfile.followersRange` value comes from this exact list,
 * filtering on it is a plain equality match, not a range query.
 */
export const FOLLOWER_RANGES = [
  'Under 1,000',
  '1,000–5,000',
  '5,000–20,000',
  '20,000–100,000',
  '100,000+',
] as const;

export type FollowerRange = (typeof FOLLOWER_RANGES)[number];
