import 'server-only';

import { creatorRepository } from '@/repositories/creatorRepository';
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

class CreatorDashboardService {
  async getDashboard(uid: string): Promise<CreatorDashboardView> {
    const profile = await creatorRepository.findById(uid);
    if (!profile) {
      throw new CreatorNotFoundError(uid);
    }

    return {
      profile,
      accessLevel: resolveAccessLevel(profile),
    };
  }
}

export const creatorDashboardService = new CreatorDashboardService();
