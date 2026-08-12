import 'server-only';

import { adminAuth } from '@/lib/firebase/admin';
import { creatorRepository } from '@/repositories/creatorRepository';
import { userRepository } from '@/repositories/userRepository';
import { CreatorNotFoundError } from '@/services/creatorDashboardService';
import { publishEvent } from '@/lib/events/eventBus';
import { notificationService } from '@/services/notificationService';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { VALID_CREATOR_TRANSITIONS } from '@/lib/creators/transitions';
import type { CreatorProfile, CreatorStatus, User } from '@/types';

export { CreatorNotFoundError };

export class InvalidCreatorTransitionError extends Error {
  constructor(from: CreatorStatus, to: CreatorStatus) {
    super(`Cannot move a creator from '${from}' to '${to}'`);
    this.name = 'InvalidCreatorTransitionError';
  }
}

export interface CreatorListItem {
  uid: string;
  profile: CreatorProfile;
  user: Pick<User, 'email' | 'displayName' | 'photoURL' | 'phoneNumber'> | null;
}

/** The single creator detail view (§ Admin: Creators) — everything the list row has, plus the two things only worth one extra Auth lookup for a single profile, not every row of a paginated list. */
export interface CreatorDetail extends CreatorListItem {
  registeredAt: string | null;
  /** From Firebase Auth's own session metadata — `null` if they've never signed in (e.g. registered but never completed the flow) or the Auth record is gone. */
  lastSignInAt: string | null;
}

function isoOrNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Owns the Admin: Creators write path (§ Admin: Creators) — approve/
 * reject/reinstate, always through `updateStatus()`'s transition
 * table, and the read path that joins `creatorProfiles` with
 * `users` for display (the profile alone has no name/email).
 */
class CreatorAdminService {
  async listCreators(
    businessId: string,
    options: { status?: CreatorStatus; cursor?: string } = {},
  ): Promise<{ creators: CreatorListItem[]; nextCursor: string | null }> {
    const { creators, nextCursor } = await creatorRepository.listByBusiness(businessId, options);
    const withIdentity = await Promise.all(
      creators.map(async ({ id, data }) => ({
        uid: id,
        profile: data,
        user: await userRepository.findById(id),
      })),
    );
    return { creators: withIdentity, nextCursor };
  }

  async getCreator(businessId: string, uid: string): Promise<CreatorDetail> {
    const profile = await creatorRepository.findById(uid);
    if (!profile || profile.businessId !== businessId) {
      throw new CreatorNotFoundError(uid);
    }
    const [user, authRecord] = await Promise.all([
      userRepository.findById(uid),
      adminAuth.getUser(uid).catch(() => null),
    ]);
    return {
      uid,
      profile,
      user,
      registeredAt: profile.createdAt?.toDate ? profile.createdAt.toDate().toISOString() : null,
      lastSignInAt: isoOrNull(authRecord?.metadata.lastSignInTime),
    };
  }

  async updateStatus(businessId: string, uid: string, next: CreatorStatus, actor: string): Promise<void> {
    const profile = await creatorRepository.findById(uid);
    if (!profile || profile.businessId !== businessId) {
      throw new CreatorNotFoundError(uid);
    }
    if (!VALID_CREATOR_TRANSITIONS[profile.status].includes(next)) {
      throw new InvalidCreatorTransitionError(profile.status, next);
    }

    await creatorRepository.update(uid, { status: next, updatedBy: actor });
    await publishEvent(businessId, 'CreatorStatusChanged', 'creatorProfile', uid, {
      from: profile.status,
      to: next,
      actor,
    });

    if (next === 'active') {
      const user = await userRepository.findById(uid);
      if (user?.email) {
        try {
          await notificationService.send(businessId, {
            channel: 'email',
            templateCode: 'creator_status_approved_email',
            recipientType: 'creator',
            recipientId: uid,
            recipientRef: user.email,
            params: {
              displayName: user.displayName,
              referralCode: profile.referralCode,
              portalUrl: `${getSiteUrl()}/creator`,
            },
            dedupeKey: `creator-approved:${uid}`,
          });
        } catch {
          // Best-effort — the status change itself already succeeded above.
        }
      }
    }
  }
}

export const creatorAdminService = new CreatorAdminService();
export { CreatorAdminService };
