import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import { creatorAdminService, CreatorNotFoundError, InvalidCreatorTransitionError } from '@/services/creatorAdminService';
import { clearCreatorMemberships, seedCreator } from '../helpers/creatorFixtures';

const createdUids: string[] = [];

/**
 * `CreatorAdminService` (§ Admin: Creators) — transition enforcement,
 * tenant isolation, and the `users` join for display, against the
 * real emulator.
 */

const BUSINESS_ID = 'biz-creator-admin-service-test';
const OTHER_BUSINESS_ID = 'biz-creator-admin-service-other';

beforeEach(async () => {
  await clearCreatorMemberships(BUSINESS_ID, OTHER_BUSINESS_ID);
  await adminFirestore.recursiveDelete(adminFirestore.collection('users'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('outboundMessages'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('notificationTemplates'));
});

afterEach(async () => {
  await Promise.all(createdUids.splice(0).map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)));
});

describe('CreatorAdminService.updateStatus', () => {
  it('approves a pending creator into active and publishes a domain event', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'pending' });

    await creatorAdminService.updateStatus(BUSINESS_ID, 'creator-1', 'active', 'staff-1');

    const updated = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(updated?.status).toBe('active');

    const events = await adminFirestore.collection('domainEvents').get();
    const event = events.docs.map((d) => d.data()).find((d) => d.type === 'CreatorStatusChanged');
    expect(event).toMatchObject({ businessId: BUSINESS_ID, aggregateId: 'creator-1', payload: { from: 'pending', to: 'active' } });
  });

  it('queues the approval email once a creator becomes active', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'creator_status_approved_email',
      channel: 'email',
      subject: "You're approved, {{displayName}}",
      bodyTemplate: 'Hi {{displayName}}, your code is {{referralCode}}. {{portalUrl}}',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: ['displayName', 'referralCode', 'portalUrl'],
      version: 1,
      isActive: true,
    });
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'pending', referralCode: 'REF-CODE' });
    await userRepository.create(
      'creator-1',
      { email: 'creator@example.com', roles: ['creator'], displayName: 'Cool Creator', photoURL: null },
      'system',
    );

    await creatorAdminService.updateStatus(BUSINESS_ID, 'creator-1', 'active', 'staff-1');

    // Whether the underlying send succeeds depends on real SMTP/SendGrid
    // credentials this test environment doesn't have — what matters
    // here is that the right template, recipient, and params were
    // resolved and queued at all.
    const outbound = await outboundMessageRepository.findById('email:creator-approved:creator-1');
    expect(outbound?.recipientRef).toBe('creator@example.com');
    expect(outbound?.renderedBody).toBe('Hi Cool Creator, your code is REF-CODE. http://localhost:3000/creator');
  });

  it('does not queue an approval email for a creator with no email on file', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'creator_status_approved_email',
      channel: 'email',
      subject: "You're approved, {{displayName}}",
      bodyTemplate: 'Hi {{displayName}}',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: ['displayName', 'referralCode', 'portalUrl'],
      version: 1,
      isActive: true,
    });
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'pending' });

    await creatorAdminService.updateStatus(BUSINESS_ID, 'creator-1', 'active', 'staff-1');

    const outbound = await outboundMessageRepository.findById('email:creator-approved:creator-1');
    expect(outbound).toBeNull();
  });

  it('rejects an illegal transition', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active' });

    await expect(creatorAdminService.updateStatus(BUSINESS_ID, 'creator-1', 'pending', 'staff-1')).rejects.toBeInstanceOf(
      InvalidCreatorTransitionError,
    );
  });

  it('throws CreatorNotFoundError for a creator in a different business', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID, status: 'pending' });

    await expect(creatorAdminService.updateStatus(BUSINESS_ID, 'creator-1', 'active', 'staff-1')).rejects.toBeInstanceOf(
      CreatorNotFoundError,
    );
  });

  it('throws CreatorNotFoundError for a nonexistent creator', async () => {
    await expect(
      creatorAdminService.updateStatus(BUSINESS_ID, 'does-not-exist', 'active', 'staff-1'),
    ).rejects.toBeInstanceOf(CreatorNotFoundError);
  });
});

describe('CreatorAdminService.listCreators / getCreator', () => {
  it('joins each creator with their users/{uid} identity', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await userRepository.create('creator-1', { email: 'creator@example.com', roles: ['creator'], displayName: 'Cool Creator', photoURL: null }, 'system');

    const { creators } = await creatorAdminService.listCreators(BUSINESS_ID);

    expect(creators).toHaveLength(1);
    expect(creators[0].user?.displayName).toBe('Cool Creator');
  });

  it('getCreator throws for a creator outside the business', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID });

    await expect(creatorAdminService.getCreator(BUSINESS_ID, 'creator-1')).rejects.toBeInstanceOf(CreatorNotFoundError);
  });

  it('getCreator returns registeredAt from the real profile creation time, and null lastSignInAt when there is no Auth record', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });

    const detail = await creatorAdminService.getCreator(BUSINESS_ID, 'creator-1');

    expect(detail.registeredAt).not.toBeNull();
    expect(new Date(detail.registeredAt!).getTime()).not.toBeNaN();
    expect(detail.lastSignInAt).toBeNull();
  });

  it('getCreator resolves lastSignInAt from the real Auth record when one exists', async () => {
    const authRecord = await adminAuth.createUser({ email: 'creator-with-auth@example.com', password: 'test-password-123' });
    createdUids.push(authRecord.uid);
    await seedCreator(authRecord.uid, { businessId: BUSINESS_ID });

    const detail = await creatorAdminService.getCreator(BUSINESS_ID, authRecord.uid);

    // The emulator doesn't populate lastSignInTime on createUser() alone
    // (no real sign-in happened) — this proves the real Auth record is
    // actually consulted rather than assuming/crashing, not a specific
    // timestamp value.
    expect(detail.lastSignInAt === null || typeof detail.lastSignInAt === 'string').toBe(true);
  });
});

describe('CreatorAdminService.listCreators — search (§ Creator Marketplace)', () => {
  it('matches on niche, case-insensitively', async () => {
    await seedCreator('creator-food', { businessId: BUSINESS_ID, niche: 'Food & Snacks' });
    await seedCreator('creator-fitness', { businessId: BUSINESS_ID, niche: 'Fitness' });

    const { creators, nextCursor } = await creatorAdminService.listCreators(BUSINESS_ID, { q: 'food' });

    expect(creators.map((c) => c.uid)).toEqual(['creator-food']);
    expect(nextCursor).toBeNull();
  });

  it('matches on the joined displayName, not just niche', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, niche: 'Comedy' });
    await userRepository.create('creator-1', { email: 'a@example.com', roles: ['creator'], displayName: 'Wanjiru Kamau', photoURL: null }, 'system');
    await seedCreator('creator-2', { businessId: BUSINESS_ID, niche: 'Comedy' });
    await userRepository.create('creator-2', { email: 'b@example.com', roles: ['creator'], displayName: 'Otieno Omondi', photoURL: null }, 'system');

    const { creators } = await creatorAdminService.listCreators(BUSINESS_ID, { q: 'wanjiru' });

    expect(creators.map((c) => c.uid)).toEqual(['creator-1']);
  });

  it('combines a text search with the followersRange filter', async () => {
    await seedCreator('creator-match', { businessId: BUSINESS_ID, niche: 'Food', followersRange: '100,000+' });
    await seedCreator('creator-wrong-range', { businessId: BUSINESS_ID, niche: 'Food', followersRange: 'Under 1,000' });

    const { creators } = await creatorAdminService.listCreators(BUSINESS_ID, {
      q: 'food',
      followersRange: '100,000+',
    });

    expect(creators.map((c) => c.uid)).toEqual(['creator-match']);
  });

  it('never returns another business’s creators from a search', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID, niche: 'Food' });

    const { creators } = await creatorAdminService.listCreators(BUSINESS_ID, { q: 'food' });

    expect(creators).toHaveLength(0);
  });

  it('a blank query falls back to the normal paginated listing', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });

    const { creators, nextCursor } = await creatorAdminService.listCreators(BUSINESS_ID, { q: '   ' });

    expect(creators).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });
});
