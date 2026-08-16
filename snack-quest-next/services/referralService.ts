import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import {
  referralLinkRepository,
  incrementConversionCountInTransaction as incrementLinkConversionInTransaction,
} from '@/repositories/referralLinkRepository';
import {
  createInTransaction as createAttributionInTransaction,
  referralAttributionRepository,
} from '@/repositories/referralAttributionRepository';
import { creditInTransaction as creditCreatorInTransaction } from '@/repositories/creatorEarningsLedgerRepository';
import {
  creatorRepository,
  incrementConversionCountInTransaction as incrementCreatorConversionInTransaction,
} from '@/repositories/creatorRepository';
import { userRepository } from '@/repositories/userRepository';
import { publishEvent } from '@/lib/events/eventBus';
import { notificationService } from '@/services/notificationService';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { assertCreatorFinancialWritesNotFrozen } from '@/lib/creators/creatorFinancialFreeze';
import type { ReferralAttribution, ReferralLink, User } from '@/types';

/**
 * Owns referral validation, commission crediting, and referral-link
 * management (PLATFORM_ARCHITECTURE_V2.md §8). A real customer either
 * has a valid code (gets a discount, the creator gets credited) or
 * doesn't (order proceeds at full price); attribution windows and
 * fraud scoring stay out of scope until a real need arrives, but
 * click/conversion counts are now real (§ Creator Portal referral
 * links) — clicks via `app/r/[code]/route.ts`, conversions in the same
 * transaction as the commission credit below. Commissions are credited
 * automatically the instant a valid code is used (`awardCommission()`)
 * — there is no admin approval gate before that credit happens;
 * § Admin: Referrals is oversight of what already happened, not a
 * queue to approve.
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
  /**
   * Returns null for an invalid/inactive/unknown code — never blocks
   * the purchase.
   *
   * Codes are normalized the same way `recordClick` normalizes them,
   * and for the same reason: `referralLinks.code` is stored uppercase,
   * `findByCode` is an exact-match query, and a customer typing their
   * creator's code into the checkout form types it however they saw it
   * written. Before this, `save10` found nothing while `SAVE10`
   * worked — the order went through at full price with no error
   * anywhere, and the creator earned nothing. The website checkout
   * made that path reachable by real customers rather than only by the
   * bot, which had already matched on text it echoed back.
   */
  async validateCode(
    businessId: string,
    code: string,
  ): Promise<ValidatedReferral | null> {
    const match = await referralLinkRepository.findByCode(businessId, code.trim().toUpperCase());
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
    await assertCreatorFinancialWritesNotFrozen(input.businessId);

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
      creditCreatorInTransaction(tx, input.businessId, input.ownerId, {
        type: 'referral_commission',
        orderId: input.orderId,
        referralLinkId: input.referralLinkId,
        amountKes: input.commissionKes,
      });
      incrementLinkConversionInTransaction(tx, input.referralLinkId);
      incrementCreatorConversionInTransaction(tx, input.businessId, input.ownerId);
    });

    await publishEvent(
      input.businessId,
      'ReferralAwarded',
      'order',
      input.orderId,
      {
        referralLinkId: input.referralLinkId,
        creatorId: input.ownerId,
        commissionKes: input.commissionKes,
      },
    );

    const creator = await userRepository.findById(input.ownerId);
    if (creator?.email) {
      try {
        await notificationService.send(input.businessId, {
          channel: 'email',
          templateCode: 'referral_commission_earned_email',
          recipientType: 'creator',
          recipientId: input.ownerId,
          recipientRef: creator.email,
          params: {
            displayName: creator.displayName,
            commissionKes: String(input.commissionKes),
            portalUrl: `${getSiteUrl()}/creator/earnings`,
          },
          dedupeKey: `commission:${input.orderId}:${input.ownerId}`,
        });
      } catch {
        // Best-effort — the commission credit itself already succeeded above.
      }
    }
  }

  /**
   * Admin: Referrals oversight only (§ referral system overhaul) —
   * every creator's one permanent link is created automatically at
   * registration and never editable afterward; the only lever left
   * here is pausing/resuming it (e.g. suspected fraud), never
   * changing its code, discount, or commission.
   */
  async setActive(
    businessId: string,
    linkId: string,
    isActive: boolean,
    actor: string,
  ): Promise<void> {
    const existing = await referralLinkRepository.findById(businessId, linkId);
    if (!existing) {
      throw new ReferralLinkNotFoundError(linkId);
    }
    await referralLinkRepository.update(linkId, { isActive }, actor);
  }

  /** § Creator Portal referral links — a creator's own links, no identity join needed since they're already the owner. */
  async listLinksForCreator(
    businessId: string,
    ownerId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{
    links: { id: string; data: ReferralLink }[];
    nextCursor: string | null;
  }> {
    return referralLinkRepository.listByOwner(businessId, ownerId, options);
  }

  /** § Creator Portal commission views — a creator's own commission history, same "already earned, no approval queue" reality as `referralAttributionRepository`'s own doc comment describes. */
  async listCommissionsForCreator(
    businessId: string,
    creatorId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{
    attributions: { id: string; data: ReferralAttribution }[];
    nextCursor: string | null;
  }> {
    return referralAttributionRepository.listByCreator(
      businessId,
      creatorId,
      options,
    );
  }

  /**
   * § app/r/[code]/route.ts — a real click-through. Fails soft (returns
   * null) for an unknown or inactive code so the redirect route can
   * fall back gracefully rather than error a customer's tap.
   */
  async recordClick(
    businessId: string,
    code: string,
  ): Promise<ReferralLink | null> {
    const match = await referralLinkRepository.findByCode(
      businessId,
      code.trim().toUpperCase(),
    );
    if (!match) {
      return null;
    }
    await Promise.all([
      referralLinkRepository.incrementClickCount(match.id),
      creatorRepository.incrementClickCount(businessId, match.data.ownerId),
    ]);
    return match.data;
  }

  /** Admin: Referrals list, joined with each owning creator's `users/{uid}` identity for display. */
  async listLinks(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ links: ReferralLinkListItem[]; nextCursor: string | null }> {
    const { links, nextCursor } = await referralLinkRepository.listByBusiness(
      businessId,
      options,
    );
    const withOwner = await Promise.all(
      links.map(async ({ id, data }) => ({
        id,
        data,
        owner: await userRepository.findById(data.ownerId),
      })),
    );
    return { links: withOwner, nextCursor };
  }

  /** Admin: Referrals commission ledger, joined with each credited creator's identity. */
  async listCommissions(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ commissions: CommissionListItem[]; nextCursor: string | null }> {
    const { attributions, nextCursor } =
      await referralAttributionRepository.listByBusiness(businessId, options);
    const withCreator = await Promise.all(
      attributions.map(async ({ id, data }) => ({
        id,
        data,
        creator: await userRepository.findById(data.creatorId),
      })),
    );
    return { commissions: withCreator, nextCursor };
  }
}

export const referralService = new ReferralService();
