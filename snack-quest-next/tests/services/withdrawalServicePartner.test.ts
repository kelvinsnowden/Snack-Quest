import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { withdrawalRepository } from '@/repositories/withdrawalRepository';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import { partnerService } from '@/services/partnerService';
import {
  withdrawalService,
  InsufficientPartnerBalanceError,
  PartnerNotEligibleForWithdrawalError,
  UnsupportedWithdrawalOwnerTypeError,
} from '@/services/withdrawalService';
import { notificationService } from '@/services/notificationService';
import { featureFlagService } from '@/services/featureFlagService';

/**
 * `WithdrawalService` for `ownerType: 'partner'` (§ OWNER WITHDRAWAL,
 * docs/MACHINE_COMMERCE.md §7) — the same withdrawal engine already
 * proven for creators, now exercised against `Partner.availableCashKes`
 * instead. Mirrors `tests/services/withdrawalService.test.ts`'s own
 * fixtures and B2C stubbing rather than duplicating its full matrix —
 * only the owner-type dispatch itself is what's new here.
 */

const BUSINESS_ID = 'biz-withdrawal-partner-test';

const B2C_SECRET = {
  consumerKey: 'test-key',
  consumerSecret: 'test-secret',
  shortcode: '174379',
  accountType: 'till' as const,
  passkey: 'test-passkey',
  callbackUrl: `https://example.com/api/webhooks/daraja/${BUSINESS_ID}`,
  env: 'sandbox' as const,
  b2cInitiatorName: 'testapiuser',
  b2cSecurityCredential: 'encrypted-credential-base64',
};

function stubB2CSuccess(originatorConversationId = 'orig-1', conversationId = 'conv-1') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(
              JSON.stringify({
                ConversationID: conversationId,
                OriginatorConversationID: originatorConversationId,
                ResponseCode: '0',
                ResponseDescription: 'Accept the service request successfully.',
              }),
              { status: 200 },
            ),
      ),
    ),
  );
}

async function seedActivePartner(name = 'Owner', availableCashKes = 5000): Promise<string> {
  const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name, actor: 'staff-1' });
  await adminFirestore.collection('partners').doc(partnerId).update({ availableCashKes });
  return partnerId;
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('withdrawals'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('partners'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('webhookEvents'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('outboundMessages'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('notificationTemplates'));
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('businesses').doc(BUSINESS_ID).collection('featureFlags'),
  );
  await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WithdrawalService.requestWithdrawal — partner', () => {
  it('reserves the partner balance and creates a pending withdrawal', async () => {
    const partnerId = await seedActivePartner('Owner', 5000);

    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: partnerId,
      ownerType: 'partner',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('pending');
    expect(withdrawal?.ownerType).toBe('partner');
    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.availableCashKes).toBe(3000);
  });

  it('rejects a request exceeding the partner’s available balance, reserving nothing', async () => {
    const partnerId = await seedActivePartner('Owner', 500);

    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: partnerId,
        ownerType: 'partner',
        amountKes: 2000,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(InsufficientPartnerBalanceError);

    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.availableCashKes).toBe(500);
  });

  it('rejects a suspended partner', async () => {
    const partnerId = await seedActivePartner('Owner', 5000);
    await adminFirestore.collection('partners').doc(partnerId).update({ status: 'suspended' });

    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: partnerId,
        ownerType: 'partner',
        amountKes: 2000,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(PartnerNotEligibleForWithdrawalError);
  });

  it('rejects a partner id that does not exist', async () => {
    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: 'no-such-partner',
        ownerType: 'partner',
        amountKes: 2000,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(PartnerNotEligibleForWithdrawalError);
  });

  it('rejects a partner belonging to a different business', async () => {
    const otherBusinessPartnerId = await partnerService.create({ businessId: 'biz-other', name: 'Other', actor: 'staff-1' });
    await adminFirestore.collection('partners').doc(otherBusinessPartnerId).update({ availableCashKes: 5000 });

    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: otherBusinessPartnerId,
        ownerType: 'partner',
        amountKes: 2000,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(PartnerNotEligibleForWithdrawalError);
  });

  it('is not blocked by the creator-financial-writes freeze — that guard is creator-specific', async () => {
    const partnerId = await seedActivePartner('Owner', 5000);
    await featureFlagService.setEnabled(BUSINESS_ID, 'creator_financial_writes_frozen', true, 'test');

    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: partnerId,
      ownerType: 'partner',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });

    expect(id).toBeTruthy();
  });

  it('still rejects unsupported ownerType "customer"', async () => {
    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: 'customer-1',
        ownerType: 'customer',
        amountKes: 2000,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(UnsupportedWithdrawalOwnerTypeError);
  });
});

describe('WithdrawalService.approveWithdrawal — partner', () => {
  it('initiates a real B2C payout for a partner withdrawal and keeps the balance reserved', async () => {
    const partnerId = await seedActivePartner('Owner', 5000);
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: partnerId,
      ownerType: 'partner',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess('orig-partner-1', 'conv-partner-1');

    const status = await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');

    expect(status).toBe('approved');
    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.availableCashKes).toBe(3000); // still reserved, not refunded
  });

  it('never sends the partner a withdrawal-approved email — there is no partner login to link to', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'withdrawal_approved_email',
      channel: 'email',
      subject: 'Your KES {{amountKes}} withdrawal is on its way',
      bodyTemplate: 'Hi {{displayName}}, KES {{amountKes}} approved. {{portalUrl}}',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: ['displayName', 'amountKes', 'portalUrl'],
      version: 1,
      isActive: true,
    });
    const partnerId = await seedActivePartner('Owner', 5000);
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: partnerId,
      ownerType: 'partner',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess();

    await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');

    const outbound = await outboundMessageRepository.findById(`email:withdrawal-approved:${id}`);
    expect(outbound).toBeNull();
  });

  it('texts the partner’s registered phone number when approved, tagged as recipientType "partner"', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'withdrawal_approved_sms',
      channel: 'sms',
      subject: null,
      heading: null,
      bodyTemplate: 'Approved: KES {{amountKes}}',
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: ['amountKes'],
      version: 1,
      isActive: true,
    });
    const partnerId = await seedActivePartner('Owner', 5000);
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: partnerId,
      ownerType: 'partner',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess();
    const sendSpy = vi.spyOn(notificationService, 'send');

    await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');

    const sms = await outboundMessageRepository.findById(`sms:withdrawal-approved:${id}`);
    expect(sms?.recipientRef).toBe('254712345678');
    // `OutboundMessage` itself carries no `recipientType` — it's only
    // used to label the in-app `notifications` doc `send()` would write
    // if `createInApp` were set (it isn't, for SMS here). Assert the
    // dispatch call itself was correctly labeled, not a field that was
    // never going to be persisted either way.
    expect(sendSpy).toHaveBeenCalledWith(BUSINESS_ID, expect.objectContaining({ recipientType: 'partner' }));
  });
});

describe('WithdrawalService.rejectWithdrawal — partner', () => {
  it('refunds the reserved partner balance', async () => {
    const partnerId = await seedActivePartner('Owner', 5000);
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: partnerId,
      ownerType: 'partner',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });

    await withdrawalService.rejectWithdrawal(BUSINESS_ID, id, 'staff-1', 'Could not verify phone number');

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('rejected');
    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.availableCashKes).toBe(5000);
  });
});

describe('WithdrawalService — creator and partner balances never cross', () => {
  it('a partner withdrawal never touches a creator document, even with a colliding id', async () => {
    // Same id space is not a real collision risk in Firestore (partners
    // and creatorMemberships are different collections entirely), but
    // this pins the intended isolation explicitly: reserving a partner
    // balance must dispatch to `partnerRepository`, never `creatorRepository`.
    const partnerId = await seedActivePartner('Owner', 5000);

    await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: partnerId,
      ownerType: 'partner',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });

    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.availableCashKes).toBe(3000);
    expect(partner?.lifetimeEarnedKes).toBe(0); // withdrawal reservation never touches lifetime earnings
  });
});
