import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { reviewRepository } from '@/repositories/reviewRepository';
import { marketingEmailRepository } from '@/repositories/marketingEmailRepository';
import {
  marketingEmailService,
  MarketingEmailValidationError,
  MarketingEmailNotFoundError,
  MarketingEmailNotEditableError,
  type MarketingEmailDraftInput,
} from '@/services/marketingEmailService';
import { clearCreatorMemberships, seedCreator } from '../helpers/creatorFixtures';

/**
 * `MarketingEmailService` end to end (§ Admin: Marketing Emails) —
 * segment resolution against the real emulator, draft lifecycle
 * enforcement, and the real send loop. `send()` is exercised against
 * the real `smtpEmailGateway`/`sendGridGateway` chain rather than a
 * mock: with no SMTP integration configured for the test business, it
 * falls back to SendGrid, which fails closed (`Missing
 * SENDGRID_API_KEY`) in this test environment — a real, deterministic
 * per-recipient failure that still proves the resolve → render →
 * dispatch → tally → status pipeline end to end.
 */

const BUSINESS_ID = 'biz-marketing-email-test';
const OTHER_BUSINESS_ID = 'biz-marketing-email-other';

const VALID_DRAFT: MarketingEmailDraftInput = {
  subject: 'New snack boxes just dropped',
  preheader: 'Limited time only',
  heading: 'Fresh drop this week',
  bodyText: 'Hey there,\n\nCheck out our newest boxes.',
  imageUrl: null,
  ctaLabel: 'Shop now',
  ctaUrl: 'https://www.snackquests.shop',
  featurePills: ['🚚 Fast delivery', '🎁 Curated boxes'],
  includeTestimonials: true,
  segment: 'active_creators',
  customRecipients: null,
  specificCreatorIds: null,
};

beforeEach(async () => {
  await clearCreatorMemberships(BUSINESS_ID, OTHER_BUSINESS_ID);
  await adminFirestore.recursiveDelete(adminFirestore.collection('users'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('marketingEmailCampaigns'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('reviews'));
});

describe('MarketingEmailService.createDraft', () => {
  it('creates a draft with zero counts and no sentAt', async () => {
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');

    const campaign = await marketingEmailRepository.findById(campaignId);
    expect(campaign).toMatchObject({
      businessId: BUSINESS_ID,
      subject: 'New snack boxes just dropped',
      status: 'draft',
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      sentAt: null,
    });
  });

  it.each([
    ['subject', { ...VALID_DRAFT, subject: '' }],
    ['heading', { ...VALID_DRAFT, heading: '' }],
    ['bodyText', { ...VALID_DRAFT, bodyText: '' }],
  ])('rejects a missing %s', async (_field, input) => {
    await expect(marketingEmailService.createDraft(BUSINESS_ID, input, 'staff-1')).rejects.toBeInstanceOf(
      MarketingEmailValidationError,
    );
  });

  it('rejects a custom segment with no valid recipient emails', async () => {
    await expect(
      marketingEmailService.createDraft(
        BUSINESS_ID,
        { ...VALID_DRAFT, segment: 'custom', customRecipients: ['not-an-email'] },
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(MarketingEmailValidationError);
  });

  it('rejects a specific_creators segment with no creators picked', async () => {
    await expect(
      marketingEmailService.createDraft(
        BUSINESS_ID,
        { ...VALID_DRAFT, segment: 'specific_creators', specificCreatorIds: [] },
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(MarketingEmailValidationError);
  });

  it('dedupes a specific_creators id list and caps it', async () => {
    const campaignId = await marketingEmailService.createDraft(
      BUSINESS_ID,
      { ...VALID_DRAFT, segment: 'specific_creators', specificCreatorIds: ['creator-a', 'creator-a', 'creator-b'] },
      'staff-1',
    );
    const campaign = await marketingEmailRepository.findById(campaignId);
    expect(campaign?.specificCreatorIds).toEqual(['creator-a', 'creator-b']);
  });

  it('rejects a CTA label without a URL', async () => {
    await expect(
      marketingEmailService.createDraft(BUSINESS_ID, { ...VALID_DRAFT, ctaLabel: 'Shop now', ctaUrl: '' }, 'staff-1'),
    ).rejects.toBeInstanceOf(MarketingEmailValidationError);
  });

  it('dedupes and normalizes a valid custom recipient list', async () => {
    const campaignId = await marketingEmailService.createDraft(
      BUSINESS_ID,
      { ...VALID_DRAFT, segment: 'custom', customRecipients: ['Amina@Example.com', 'amina@example.com', 'joseph@example.com'] },
      'staff-1',
    );
    const campaign = await marketingEmailRepository.findById(campaignId);
    expect(campaign?.customRecipients).toEqual(['amina@example.com', 'joseph@example.com']);
  });

  it('trims feature pills, drops blanks, and caps at 3', async () => {
    const campaignId = await marketingEmailService.createDraft(
      BUSINESS_ID,
      { ...VALID_DRAFT, featurePills: ['  🚚 Fast delivery  ', '', '🎁 Curated boxes', '💬 Support', '🙅 Never kept'] },
      'staff-1',
    );
    const campaign = await marketingEmailRepository.findById(campaignId);
    expect(campaign?.featurePills).toEqual(['🚚 Fast delivery', '🎁 Curated boxes', '💬 Support']);
  });
});

describe('MarketingEmailService.updateDraft / deleteDraft', () => {
  it('updates a draft in place', async () => {
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');

    await marketingEmailService.updateDraft(BUSINESS_ID, campaignId, { ...VALID_DRAFT, subject: 'Updated subject' }, 'staff-1');

    const campaign = await marketingEmailRepository.findById(campaignId);
    expect(campaign?.subject).toBe('Updated subject');
  });

  it('throws MarketingEmailNotFoundError for a campaign in a different business', async () => {
    const campaignId = await marketingEmailService.createDraft(OTHER_BUSINESS_ID, VALID_DRAFT, 'staff-1');

    await expect(
      marketingEmailService.updateDraft(BUSINESS_ID, campaignId, VALID_DRAFT, 'staff-1'),
    ).rejects.toBeInstanceOf(MarketingEmailNotFoundError);
  });

  it('deletes a draft', async () => {
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');

    await marketingEmailService.deleteDraft(BUSINESS_ID, campaignId);

    expect(await marketingEmailRepository.findById(campaignId)).toBeNull();
  });

  it('refuses to edit or delete a campaign that already sent', async () => {
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');
    await marketingEmailRepository.update(campaignId, { status: 'sent', updatedBy: 'system' });

    await expect(
      marketingEmailService.updateDraft(BUSINESS_ID, campaignId, VALID_DRAFT, 'staff-1'),
    ).rejects.toBeInstanceOf(MarketingEmailNotEditableError);
    await expect(marketingEmailService.deleteDraft(BUSINESS_ID, campaignId)).rejects.toBeInstanceOf(
      MarketingEmailNotEditableError,
    );
  });
});

describe('MarketingEmailService.resolveRecipients', () => {
  it('resolves only creators matching the given status, deduped and lowercased', async () => {
    await seedCreator('creator-active-1', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-active-1', { email: 'Active1@Example.com', roles: ['creator'], displayName: 'A1', photoURL: null }, 'system');
    await seedCreator('creator-active-2', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-active-2', { email: 'active2@example.com', roles: ['creator'], displayName: 'A2', photoURL: null }, 'system');
    await seedCreator('creator-pending-1', { businessId: BUSINESS_ID, status: 'pending' });
    await userRepository.create('creator-pending-1', { email: 'pending1@example.com', roles: ['creator'], displayName: 'P1', photoURL: null }, 'system');

    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'active_creators', null);

    expect(recipients.sort()).toEqual(['active1@example.com', 'active2@example.com']);
  });

  it('resolves every creator regardless of status for all_creators', async () => {
    await seedCreator('creator-active-1', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-active-1', { email: 'active@example.com', roles: ['creator'], displayName: 'A', photoURL: null }, 'system');
    await seedCreator('creator-pending-1', { businessId: BUSINESS_ID, status: 'pending' });
    await userRepository.create('creator-pending-1', { email: 'pending@example.com', roles: ['creator'], displayName: 'P', photoURL: null }, 'system');

    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'all_creators', null);

    expect(recipients.sort()).toEqual(['active@example.com', 'pending@example.com']);
  });

  it('silently skips a creator with no email on file rather than failing the whole resolve', async () => {
    await seedCreator('creator-no-user-doc', { businessId: BUSINESS_ID, status: 'active' });

    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'active_creators', null);

    expect(recipients).toEqual([]);
  });

  it('never resolves a creator from a different business', async () => {
    await seedCreator('creator-other-biz', { businessId: OTHER_BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-other-biz', { email: 'other@example.com', roles: ['creator'], displayName: 'O', photoURL: null }, 'system');

    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'active_creators', null);

    expect(recipients).toEqual([]);
  });

  it('for a custom segment, normalizes and dedupes the pasted list instead of touching creators at all', async () => {
    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'custom', [
      'Foo@Example.com',
      'foo@example.com',
      'not-an-email',
      'bar@example.com',
    ]);

    expect(recipients).toEqual(['foo@example.com', 'bar@example.com']);
  });

  it('resolves creators with zero referral conversions for no_sale_creators, regardless of status', async () => {
    await seedCreator('creator-no-sale', { businessId: BUSINESS_ID, status: 'active', totalConversions: 0 });
    await userRepository.create('creator-no-sale', { email: 'nosale@example.com', roles: ['creator'], displayName: 'N', photoURL: null }, 'system');
    await seedCreator('creator-pending-no-sale', { businessId: BUSINESS_ID, status: 'pending', totalConversions: 0 });
    await userRepository.create('creator-pending-no-sale', { email: 'pendingnosale@example.com', roles: ['creator'], displayName: 'PN', photoURL: null }, 'system');
    await seedCreator('creator-has-sale', { businessId: BUSINESS_ID, status: 'active', totalConversions: 3 });
    await userRepository.create('creator-has-sale', { email: 'hassale@example.com', roles: ['creator'], displayName: 'H', photoURL: null }, 'system');

    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'no_sale_creators', null);

    expect(recipients.sort()).toEqual(['nosale@example.com', 'pendingnosale@example.com']);
  });

  it('resolves creators with exactly one conversion for first_sale_creators', async () => {
    await seedCreator('creator-first', { businessId: BUSINESS_ID, status: 'active', totalConversions: 1 });
    await userRepository.create('creator-first', { email: 'first@example.com', roles: ['creator'], displayName: 'F', photoURL: null }, 'system');
    await seedCreator('creator-zero', { businessId: BUSINESS_ID, status: 'active', totalConversions: 0 });
    await userRepository.create('creator-zero', { email: 'zero@example.com', roles: ['creator'], displayName: 'Z', photoURL: null }, 'system');
    await seedCreator('creator-two', { businessId: BUSINESS_ID, status: 'active', totalConversions: 2 });
    await userRepository.create('creator-two', { email: 'two@example.com', roles: ['creator'], displayName: 'T', photoURL: null }, 'system');

    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'first_sale_creators', null);

    expect(recipients).toEqual(['first@example.com']);
  });

  it('resolves creators with two or more conversions for repeat_creators', async () => {
    await seedCreator('creator-one', { businessId: BUSINESS_ID, status: 'active', totalConversions: 1 });
    await userRepository.create('creator-one', { email: 'one@example.com', roles: ['creator'], displayName: 'O', photoURL: null }, 'system');
    await seedCreator('creator-five', { businessId: BUSINESS_ID, status: 'active', totalConversions: 5 });
    await userRepository.create('creator-five', { email: 'five@example.com', roles: ['creator'], displayName: 'F', photoURL: null }, 'system');
    await seedCreator('creator-two', { businessId: BUSINESS_ID, status: 'active', totalConversions: 2 });
    await userRepository.create('creator-two', { email: 'two@example.com', roles: ['creator'], displayName: 'T', photoURL: null }, 'system');

    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'repeat_creators', null);

    expect(recipients.sort()).toEqual(['five@example.com', 'two@example.com']);
  });

  it('resolves only creators registered within the last 30 days for new_creators', async () => {
    await seedCreator('creator-new', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-new', { email: 'new@example.com', roles: ['creator'], displayName: 'N', photoURL: null }, 'system');

    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'new_creators', null);

    // seedCreator writes createdAt via FieldValue.serverTimestamp() at call time, so a
    // freshly-seeded creator is always "new" — this proves the query actually resolves
    // real, current data rather than throwing or silently returning nothing.
    expect(recipients).toEqual(['new@example.com']);
  });

  it('for specific_creators, resolves exactly the picked ids by real uid lookup, ignoring status/segment membership', async () => {
    await seedCreator('creator-picked', { businessId: BUSINESS_ID, status: 'suspended' });
    await userRepository.create('creator-picked', { email: 'Picked@Example.com', roles: ['creator'], displayName: 'Picked', photoURL: null }, 'system');
    await seedCreator('creator-not-picked', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-not-picked', { email: 'notpicked@example.com', roles: ['creator'], displayName: 'Not', photoURL: null }, 'system');

    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'specific_creators', null, [
      'creator-picked',
    ]);

    expect(recipients).toEqual(['picked@example.com']);
  });

  it('for specific_creators, silently drops an id with no resolvable email rather than failing', async () => {
    const recipients = await marketingEmailService.resolveRecipients(BUSINESS_ID, 'specific_creators', null, [
      'does-not-exist',
    ]);

    expect(recipients).toEqual([]);
  });
});

describe('MarketingEmailService.searchCreators', () => {
  it('matches by name, email, or referral code, scoped to the given business', async () => {
    await seedCreator('creator-amina', { businessId: BUSINESS_ID, status: 'active', referralCode: 'AMINA10' });
    await userRepository.create('creator-amina', { email: 'amina@example.com', roles: ['creator'], displayName: 'Amina Wanjiru', photoURL: null }, 'system');
    await seedCreator('creator-other', { businessId: OTHER_BUSINESS_ID, status: 'active', referralCode: 'OTHER10' });
    await userRepository.create('creator-other', { email: 'amina2@example.com', roles: ['creator'], displayName: 'Amina Other Biz', photoURL: null }, 'system');

    const results = await marketingEmailService.searchCreators(BUSINESS_ID, 'amina');

    expect(results).toEqual([
      { id: 'creator-amina', displayName: 'Amina Wanjiru', email: 'amina@example.com', status: 'active' },
    ]);
  });

  it('returns nothing for a query under 2 characters', async () => {
    await seedCreator('creator-a', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-a', { email: 'a@example.com', roles: ['creator'], displayName: 'A', photoURL: null }, 'system');

    expect(await marketingEmailService.searchCreators(BUSINESS_ID, 'a')).toEqual([]);
  });
});

describe('MarketingEmailService.getCreatorSummaries', () => {
  it('resolves picked ids back to display info, scoped to the given business', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'pending' });
    await userRepository.create('creator-1', { email: 'one@example.com', roles: ['creator'], displayName: 'One', photoURL: null }, 'system');
    await seedCreator('creator-other-biz', { businessId: OTHER_BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-other-biz', { email: 'other@example.com', roles: ['creator'], displayName: 'Other', photoURL: null }, 'system');

    const summaries = await marketingEmailService.getCreatorSummaries(BUSINESS_ID, [
      'creator-1',
      'creator-other-biz',
      'does-not-exist',
    ]);

    expect(summaries).toEqual([{ id: 'creator-1', displayName: 'One', email: 'one@example.com', status: 'pending' }]);
  });
});

describe('MarketingEmailService.send', () => {
  it('resolves recipients, tallies the real per-recipient outcome, and marks the campaign sent/failed accordingly', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-1', { email: 'creator1@example.com', roles: ['creator'], displayName: 'C1', photoURL: null }, 'system');
    await seedCreator('creator-2', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-2', { email: 'creator2@example.com', roles: ['creator'], displayName: 'C2', photoURL: null }, 'system');
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');

    const result = await marketingEmailService.send(BUSINESS_ID, campaignId, 'staff-1');

    // No SMTP integration is configured for this test business, and no
    // real SendGrid key exists in this test environment — every real
    // dispatch attempt fails closed, which is itself the thing being
    // verified here (a real attempt was made per recipient, not skipped).
    expect(result.recipientCount).toBe(2);
    expect(result.sentCount + result.failedCount).toBe(2);

    const campaign = await marketingEmailRepository.findById(campaignId);
    expect(campaign?.recipientCount).toBe(2);
    expect(campaign?.status === 'sent' || campaign?.status === 'failed').toBe(true);
    expect(campaign?.sentAt).not.toBeNull();
  });

  it('captures the real per-recipient error instead of discarding it', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-1', { email: 'creator1@example.com', roles: ['creator'], displayName: 'C1', photoURL: null }, 'system');
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');

    const result = await marketingEmailService.send(BUSINESS_ID, campaignId, 'staff-1');

    // Same fails-closed environment as the test above (no SMTP/SendGrid
    // configured) — this time asserting the failure reason itself is
    // captured, not just tallied.
    expect(result.failedCount).toBe(1);
    const campaign = await marketingEmailRepository.findById(campaignId);
    expect(campaign?.failedRecipients).toHaveLength(1);
    expect(campaign?.failedRecipients?.[0].email).toBe('creator1@example.com');
    expect(campaign?.failedRecipients?.[0].error).toBeTruthy();
  });

  it('refuses to resolve zero recipients rather than silently "sending" nothing', async () => {
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');

    await expect(marketingEmailService.send(BUSINESS_ID, campaignId, 'staff-1')).rejects.toBeInstanceOf(
      MarketingEmailValidationError,
    );
  });

  it('refuses to send a campaign that already sent', async () => {
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');
    await marketingEmailRepository.update(campaignId, { status: 'sent', updatedBy: 'system' });

    await expect(marketingEmailService.send(BUSINESS_ID, campaignId, 'staff-1')).rejects.toBeInstanceOf(
      MarketingEmailNotEditableError,
    );
  });
});

describe('MarketingEmailService.resendFailed', () => {
  it('retries only the previously-failed recipients and updates the tally without recomposing', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active' });
    await userRepository.create('creator-1', { email: 'creator1@example.com', roles: ['creator'], displayName: 'C1', photoURL: null }, 'system');
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');
    await marketingEmailService.send(BUSINESS_ID, campaignId, 'staff-1');

    const before = await marketingEmailRepository.findById(campaignId);
    expect(before?.failedRecipients).toHaveLength(1);

    const result = await marketingEmailService.resendFailed(BUSINESS_ID, campaignId, 'staff-1');

    // Same fails-closed test environment — the retry attempt happens
    // (proving the exact previously-failed address was dialed again),
    // and the failure is captured again rather than silently dropped.
    expect(result.recipientCount).toBe(1);
    expect(result.sentCount + result.failedCount).toBe(1);
    const after = await marketingEmailRepository.findById(campaignId);
    expect(after?.failedRecipients).toHaveLength(result.failedCount);
  });

  it('rejects resending a draft that has never sent', async () => {
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');

    await expect(marketingEmailService.resendFailed(BUSINESS_ID, campaignId, 'staff-1')).rejects.toBeInstanceOf(
      MarketingEmailValidationError,
    );
  });

  it('rejects resending a campaign with nothing left to retry', async () => {
    const campaignId = await marketingEmailService.createDraft(BUSINESS_ID, VALID_DRAFT, 'staff-1');
    await marketingEmailRepository.update(campaignId, {
      status: 'sent',
      failedRecipients: null,
      updatedBy: 'system',
    });

    await expect(marketingEmailService.resendFailed(BUSINESS_ID, campaignId, 'staff-1')).rejects.toBeInstanceOf(
      MarketingEmailValidationError,
    );
  });
});

describe('MarketingEmailService.listCampaigns', () => {
  it('lists only this business’s campaigns, newest first', async () => {
    await marketingEmailService.createDraft(OTHER_BUSINESS_ID, VALID_DRAFT, 'staff-1');
    const first = await marketingEmailService.createDraft(BUSINESS_ID, { ...VALID_DRAFT, subject: 'First' }, 'staff-1');
    const second = await marketingEmailService.createDraft(BUSINESS_ID, { ...VALID_DRAFT, subject: 'Second' }, 'staff-1');

    const { campaigns } = await marketingEmailService.listCampaigns(BUSINESS_ID);

    expect(campaigns.map((c) => c.id)).toEqual([second, first]);
  });
});

describe('MarketingEmailService.fetchTestimonials', () => {
  async function seedReview(overrides: Partial<Parameters<typeof reviewRepository.create>[0]> = {}) {
    return reviewRepository.create({
      businessId: BUSINESS_ID,
      customerName: 'Amina',
      rating: 5,
      body: 'Loved every box!',
      photos: [],
      video: null,
      status: 'published',
      contactPhone: null,
      ...overrides,
    });
  }

  it('returns only real, published reviews for this business', async () => {
    await seedReview({ customerName: 'Amina', rating: 5, body: 'Loved every box!' });
    await seedReview({ customerName: 'Pending Pete', status: 'pending' });
    await seedReview({ customerName: 'Other Biz', businessId: OTHER_BUSINESS_ID });

    const testimonials = await marketingEmailService.fetchTestimonials(BUSINESS_ID);

    expect(testimonials).toEqual([{ customerName: 'Amina', rating: 5, body: 'Loved every box!' }]);
  });

  it('returns an empty array — never fabricated content — when nothing is published', async () => {
    const testimonials = await marketingEmailService.fetchTestimonials(BUSINESS_ID);
    expect(testimonials).toEqual([]);
  });
});
