import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { referralLinkRepository } from '@/repositories/referralLinkRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { createInTransaction as createAttributionInTransaction } from '@/repositories/referralAttributionRepository';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import {
  referralService,
  ReferralLinkNotFoundError,
} from '@/services/referralService';
import { seedCreator } from '../helpers/creatorFixtures';

/**
 * `ReferralService`'s admin-facing methods (§ referral system
 * overhaul): a link is created only by `CreatorAuthService.register()`
 * now (covered in tests/services/creatorAuthService.test.ts), so
 * every test here seeds its own link directly via
 * `referralLinkRepository.create()` — the same underlying write that
 * transactional path ultimately makes — rather than through a service
 * method that no longer exists. `ReferralService.setActive` is the
 * only mutation left on the admin surface.
 */

const BUSINESS_ID = 'biz-referral-service-test';
const OTHER_BUSINESS_ID = 'biz-referral-service-other';

function seedLink(
  overrides: Partial<Parameters<typeof referralLinkRepository.create>[0]> = {},
) {
  return referralLinkRepository.create(
    {
      businessId: BUSINESS_ID,
      code: 'SAVE10',
      ownerId: 'creator-1',
      discountKes: 250,
      commissionKes: 500,
      isActive: true,
      clickCount: 0,
      conversionCount: 0,
      ...overrides,
    },
    'system',
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('referralLinks'),
  );
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('referralAttributions'),
  );
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('creatorProfiles'),
  );
  await adminFirestore.recursiveDelete(adminFirestore.collection('users'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('outboundMessages'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('notificationTemplates'));
});

describe('ReferralService.setActive', () => {
  it('flips a link active/inactive', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    const linkId = await seedLink();

    await referralService.setActive(BUSINESS_ID, linkId, false, 'staff-1');

    const link = await referralLinkRepository.findById(BUSINESS_ID, linkId);
    expect(link?.isActive).toBe(false);
  });

  it('throws ReferralLinkNotFoundError for a link outside the business', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID });
    const linkId = await referralLinkRepository.create(
      {
        businessId: OTHER_BUSINESS_ID,
        code: 'X',
        ownerId: 'creator-1',
        discountKes: 250,
        commissionKes: 500,
        isActive: true,
        clickCount: 0,
        conversionCount: 0,
      },
      'system',
    );

    await expect(
      referralService.setActive(BUSINESS_ID, linkId, false, 'staff-1'),
    ).rejects.toBeInstanceOf(ReferralLinkNotFoundError);
  });

  it('throws ReferralLinkNotFoundError for a link that does not exist', async () => {
    await expect(
      referralService.setActive(BUSINESS_ID, 'no-such-link', false, 'staff-1'),
    ).rejects.toBeInstanceOf(ReferralLinkNotFoundError);
  });
});

describe('ReferralService.listLinks / listCommissions', () => {
  it('joins links with their owning creator identity', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await userRepository.create(
      'creator-1',
      {
        email: 'creator@example.com',
        roles: ['creator'],
        displayName: 'Cool Creator',
        photoURL: null,
      },
      'system',
    );
    await seedLink();

    const { links } = await referralService.listLinks(BUSINESS_ID);

    expect(links).toHaveLength(1);
    expect(links[0].owner?.displayName).toBe('Cool Creator');
  });

  it('joins commissions with the credited creator identity', async () => {
    await userRepository.create(
      'creator-1',
      {
        email: 'creator@example.com',
        roles: ['creator'],
        displayName: 'Cool Creator',
        photoURL: null,
      },
      'system',
    );
    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, {
        businessId: BUSINESS_ID,
        referralLinkId: 'link-1',
        creatorId: 'creator-1',
        orderId: 'order-1',
        conversationId: 'conv-1',
        discountKes: 250,
        commissionKes: 500,
      });
    });

    const { commissions } = await referralService.listCommissions(BUSINESS_ID);

    expect(commissions).toHaveLength(1);
    expect(commissions[0].creator?.displayName).toBe('Cool Creator');
    expect(commissions[0].data.commissionKes).toBe(500);
  });
});

describe('ReferralService.awardCommission', () => {
  it('increments both the link and the creator conversion counters, alongside the existing credit', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    const linkId = await seedLink();

    await referralService.awardCommission({
      businessId: BUSINESS_ID,
      referralLinkId: linkId,
      ownerId: 'creator-1',
      orderId: 'order-1',
      conversationId: 'conv-1',
      discountKes: 250,
      commissionKes: 500,
    });

    const link = await referralLinkRepository.findById(BUSINESS_ID, linkId);
    expect(link?.conversionCount).toBe(1);
    const creator = await creatorRepository.findById('creator-1');
    expect(creator?.totalConversions).toBe(1);
    expect(creator?.availableCashKes).toBe(500);
  });

  it('queues a commission-earned email for the credited creator', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'referral_commission_earned_email',
      channel: 'email',
      subject: 'You earned KES {{commissionKes}}',
      bodyTemplate: 'Hi {{displayName}}, you earned KES {{commissionKes}}. {{portalUrl}}',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: ['displayName', 'commissionKes', 'portalUrl'],
      version: 1,
      isActive: true,
    });
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await userRepository.create(
      'creator-1',
      { email: 'creator@example.com', roles: ['creator'], displayName: 'Cool Creator', photoURL: null },
      'system',
    );
    const linkId = await seedLink();

    await referralService.awardCommission({
      businessId: BUSINESS_ID,
      referralLinkId: linkId,
      ownerId: 'creator-1',
      orderId: 'order-1',
      conversationId: 'conv-1',
      discountKes: 250,
      commissionKes: 500,
    });

    const outbound = await outboundMessageRepository.findById('email:commission:order-1:creator-1');
    expect(outbound?.recipientRef).toBe('creator@example.com');
    expect(outbound?.renderedBody).toBe('Hi Cool Creator, you earned KES 500. http://localhost:3000/creator/earnings');
  });
});

describe('ReferralService.listLinksForCreator', () => {
  it('returns only the given creator’s own links', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await seedCreator('creator-2', { businessId: BUSINESS_ID });
    await seedLink({ ownerId: 'creator-1', code: 'MINE' });
    await seedLink({ ownerId: 'creator-2', code: 'THEIRS' });

    const { links } = await referralService.listLinksForCreator(
      BUSINESS_ID,
      'creator-1',
    );

    expect(links).toHaveLength(1);
    expect(links[0].data.code).toBe('MINE');
  });
});

describe('ReferralService.recordClick', () => {
  it('increments both the link and creator click counters and returns the link', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    const linkId = await seedLink();

    const result = await referralService.recordClick(BUSINESS_ID, 'save10');

    expect(result?.code).toBe('SAVE10');
    const link = await referralLinkRepository.findById(BUSINESS_ID, linkId);
    expect(link?.clickCount).toBe(1);
    const creator = await creatorRepository.findById('creator-1');
    expect(creator?.totalClicks).toBe(1);
  });

  it('returns null and touches nothing for an unknown code', async () => {
    const result = await referralService.recordClick(
      BUSINESS_ID,
      'no-such-code',
    );
    expect(result).toBeNull();
  });
});

describe('ReferralService.listCommissionsForCreator', () => {
  it('returns only the given creator’s own commission history', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    const linkId = await seedLink();
    await referralService.awardCommission({
      businessId: BUSINESS_ID,
      referralLinkId: linkId,
      ownerId: 'creator-1',
      orderId: 'order-1',
      conversationId: 'conv-1',
      discountKes: 250,
      commissionKes: 500,
    });
    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, {
        businessId: BUSINESS_ID,
        referralLinkId: linkId,
        creatorId: 'someone-else',
        orderId: 'order-2',
        conversationId: 'conv-2',
        discountKes: 10,
        commissionKes: 5,
      });
    });

    const { attributions } = await referralService.listCommissionsForCreator(
      BUSINESS_ID,
      'creator-1',
    );

    expect(attributions).toHaveLength(1);
    expect(attributions[0].data.orderId).toBe('order-1');
  });
});
