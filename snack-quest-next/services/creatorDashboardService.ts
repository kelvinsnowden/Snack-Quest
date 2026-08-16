import 'server-only';

import { creatorRepository } from '@/repositories/creatorRepository';
import { userRepository } from '@/repositories/userRepository';
import type { CreatorProfile } from '@/types';

/**
 * Assembles a creator's dashboard view (TDD §4). This is the reference
 * Service every later Service is reviewed against — it owns the
 * business rules, the Repository owns persistence only.
 *
 * TDD §4's table describes this Service's eventual full scope as
 * "profile + recent submissions + recent withdrawals." Recent
 * submissions/withdrawals aggregation is deferred to Phase 1
 * (IMPLEMENTATION_GUIDE.md), once CampaignRepository/WithdrawalRepository
 * exist — this Phase 0 reference implementation deliberately calls
 * creatorRepository only, per the Implementation Guide's Phase 0 file
 * order, and contains the first real business rule: access-level
 * gating based on profile status and onboarding completion.
 */

export class CreatorNotFoundError extends Error {
  constructor(uid: string) {
    super(`No creator profile found for uid ${uid}`);
    this.name = 'CreatorNotFoundError';
  }
}

export type CreatorDashboardAccessLevel = 'full' | 'limited' | 'suspended';

export interface CreatorDashboardView {
  profile: CreatorProfile;
  accessLevel: CreatorDashboardAccessLevel;
}

function resolveAccessLevel(
  profile: CreatorProfile,
): CreatorDashboardAccessLevel {
  if (profile.status === 'suspended') {
    return 'suspended';
  }
  if (!profile.onboardingCompleted || profile.status === 'pending') {
    return 'limited';
  }
  return 'full';
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  tier: CreatorProfile['tier'];
  lifetimeEarningsKes: number;
  totalConversions: number;
}

export interface CreatorLeaderboard {
  top: LeaderboardEntry[];
  /** Null when the caller isn't an `active` creator — a pending/suspended creator hasn't really participated, matching the leaderboard query's own `status == 'active'` scope. */
  myRank: number | null;
  totalActiveCreators: number;
}

class CreatorDashboardService {
  async getDashboard(businessId: string, uid: string): Promise<CreatorDashboardView> {
    const profile = await creatorRepository.findById(businessId, uid);
    if (!profile) {
      throw new CreatorNotFoundError(uid);
    }

    return {
      profile,
      accessLevel: resolveAccessLevel(profile),
    };
  }

  /**
   * § Creator Portal leaderboards — top earners plus the caller's own
   * rank, computed with a cheap `.count()` aggregation rather than
   * reading every competing creator's document.
   */
  async getLeaderboard(businessId: string, uid: string): Promise<CreatorLeaderboard> {
    const [profile, top, totalActiveCreators] = await Promise.all([
      creatorRepository.findById(businessId, uid),
      creatorRepository.listTopByBusiness(businessId, 10),
      creatorRepository.countActive(businessId),
    ]);

    const withIdentity = await Promise.all(
      top.map(async ({ id, data }) => {
        const user = await userRepository.findById(id);
        return {
          uid: id,
          displayName: user?.displayName ?? 'Unknown creator',
          photoURL: user?.photoURL ?? null,
          tier: data.tier,
          lifetimeEarningsKes: data.lifetimeEarningsKes,
          totalConversions: data.totalConversions,
        };
      }),
    );

    let myRank: number | null = null;
    if (profile && profile.businessId === businessId && profile.status === 'active') {
      const above = await creatorRepository.countActiveAboveEarnings(businessId, profile.lifetimeEarningsKes);
      myRank = above + 1;
    }

    return { top: withIdentity, myRank, totalActiveCreators };
  }
}

export const creatorDashboardService = new CreatorDashboardService();
