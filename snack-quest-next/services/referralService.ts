import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { referralLinkRepository, type ReferralLinkInput } from '@/repositories/referralLinkRepository';
import {
  createInTransaction as createAttributionInTransaction,
  referralAttributionRepository,
} from '@/repositories/referralAttributionRepository';
import { creditInTransaction as creditCreatorInTransaction } from '@/repositories/creatorEarningsLedgerRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { userRepository } from '@/repositories/userRepository';
import { publishEvent } from '@/lib/events/eventBus';
import type { ReferralAttribution, ReferralLink, User } from '@/types';

/**
 * Owns referral validation, commission crediting, and referral-link
 * management (PLATFORM_ARCHITECTURE_V2.md §8). Minimal by design: a
 * real customer today either has a valid code (gets a discount, the
 * creator gets credited) or doesn't (order proceeds at full price) —
 * attribution windows, click tracking, and fraud scoring aren't part
 * of completing an order and aren't built yet. Commissions are
 * credited automatically the instant a valid code is used
 * (`awardCommission()`) — there is no admin approval gate before that
 * credit happens; § Admin: Referrals is oversight of what already
 * happened, not a queue to approve.
 */

export interface ValidatedReferral {
  referralLinkId: string;
  ownerId: string;
  discountKes: number;
  commissionKes: number;
}

export class ReferralLinkNotFoundError extends Error {
  constructor(linkId: string) {
    super(`Referral link ${linkId} not found`);
    this.name = 'ReferralLinkNotFoundError';
  }
}

export class DuplicateReferralCodeError extends Error {
  constructor(code: string) {
    super(`Referral code "${code}" is already in use`);
    this.name = 'DuplicateReferralCodeError';
  }
}

export class CreatorNotEligibleError extends Error {
  constructor(creatorId: string) {
    super(`${creatorId} is not an active creator for this business`);
    this.name = 'CreatorNotEligibleError';
  }
}

export interface ReferralLinkListItem {
  id: string;
  data: ReferralLink;
  owner: Pick<User, 'displayName' | 'email'> | null;
}

export interface CommissionListItem {
  id: string;
  data: ReferralAttribution;
  creator: Pick<User, 'displayName' | 'email'> | null;
}

class ReferralService {
  /** Returns null for an invalid/inactive/unknown code — never blocks the purchase. */
  async validateCode(businessId: string, code: string): Promise<ValidatedReferral | null> {
    const match = await referralLinkRepository.findByCode(businessId, code);
    if (!match) {
      return null;
    }
    return {
      referralLinkId: match.id,
      ownerId: match.data.ownerId,
      discountKes: match.data.discountKes,
      commissionKes: match.data.commissionKes,
    };
  }

  async awardCommission(input: {
    businessId: string;
    referralLinkId: string;
    ownerId: string;
    orderId: string;
    conversationId: string;
    discountKes: number;
    commissionKes: number;
  }): Promise<void> {
    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, {
        businessId: input.businessId,
        referralLinkId: input.referralLinkId,
        creatorId: input.ownerId,
        orderId: input.orderId,
        conversationId: input.conversationId,
        discountKes: input.discountKes,
        commissionKes: input.commissionKes,
      });
      creditCreatorInTransaction(tx, input.ownerId, {
        type: 'referral_commission',
        orderId: input.orderId,
        referralLinkId: input.referralLinkId,
        amountKes: input.commissionKes,
      });
    });

    await publishEvent(input.businessId, 'ReferralAwarded', 'order', input.orderId, {
      referralLinkId: input.referralLinkId,
      creatorId: input.ownerId,
      commissionKes: input.commissionKes,
    });
  }

  async createLink(
    input: Omit<ReferralLinkInput, 'code'> & { code: string },
    actor: string,
  ): Promise<string> {
    const creator = await creatorRepository.findById(input.ownerId);
    if (!creator || creator.businessId !== input.businessId) {
      throw new CreatorNotEligibleError(input.ownerId);
    }

    const code = input.code.trim().toUpperCase();
    await this.assertCodeAvailable(input.businessId, code);

    return referralLinkRepository.create({ ...input, code }, actor);
  }

  async updateLink(
    businessId: string,
    linkId: string,
    patch: Partial<ReferralLinkInput>,
    actor: string,
  ): Promise<void> {
    const existing = await referralLinkRepository.findById(businessId, linkId);
    if (!existing) {
      throw new ReferralLinkNotFoundError(linkId);
    }

    const normalizedPatch = { ...patch };
    if (normalizedPatch.code !== undefined) {
      normalizedPatch.code = normalizedPatch.code.trim().toUpperCase();
      if (normalizedPatch.code !== existing.code) {
        await this.assertCodeAvailable(businessId, normalizedPatch.code);
      }
    }

    await referralLinkRepository.update(linkId, normalizedPatch, actor);
  }

  /** Admin: Referrals list, joined with each owning creator's `users/{uid}` identity for display. */
  async listLinks(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ links: ReferralLinkListItem[]; nextCursor: string | null }> {
    const { links, nextCursor } = await referralLinkRepository.listByBusiness(businessId, options);
    const withOwner = await Promise.all(
      links.map(async ({ id, data }) => ({ id, data, owner: await userRepository.findById(data.ownerId) })),
    );
    return { links: withOwner, nextCursor };
  }

  /** Admin: Referrals commission ledger, joined with each credited creator's identity. */
  async listCommissions(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ commissions: CommissionListItem[]; nextCursor: string | null }> {
    const { attributions, nextCursor } = await referralAttributionRepository.listByBusiness(businessId, options);
    const withCreator = await Promise.all(
      attributions.map(async ({ id, data }) => ({
        id,
        data,
        creator: await userRepository.findById(data.creatorId),
      })),
    );
    return { commissions: withCreator, nextCursor };
  }

  private async assertCodeAvailable(businessId: string, code: string): Promise<void> {
    if (await referralLinkRepository.existsByCode(businessId, code)) {
      throw new DuplicateReferralCodeError(code);
    }
  }
}

export const referralService = new ReferralService();
