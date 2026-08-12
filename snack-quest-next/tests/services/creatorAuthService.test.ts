import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { referralLinkRepository } from '@/repositories/referralLinkRepository';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import {
  creatorAuthService,
  CreatorAlreadyRegisteredError,
  CreatorNotProvisionedError,
  InvalidCreatorRegistrationError,
} from '@/services/creatorAuthService';
import { getIdTokenForUid } from '../helpers/authEmulator';

/**
 * The real creator sign-up/sign-in handshake, end to end against the
 * emulator (§ Creator Portal auth) — mirrors
 * tests/services/staffAuthService.test.ts's structure, but proves the
 * self-service parts unique to creators: idempotent registration on
 * `creatorProfiles` existence (not `users` existence, so an existing
 * customer can join without a second account), and that the two
 * Firestore documents a client can never write directly do get
 * written here.
 */

const createdUids: string[] = [];

async function cleanCollections() {
  for (const name of [
    'users',
    'creatorProfiles',
    'referralLinks',
    'domainEvents',
    'outboundMessages',
    'notificationTemplates',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
  // The registration-order counter (§ referral system overhaul) — cleared so each
  // test's first registration deterministically claims registration #1.
  await adminFirestore.recursiveDelete(
    adminFirestore
      .collection('businesses')
      .doc('snack-quest')
      .collection('counters'),
  );
}

async function createAuthUser(email: string): Promise<string> {
  const record = await adminAuth.createUser({
    email,
    password: 'test-password-123',
  });
  createdUids.push(record.uid);
  return record.uid;
}

beforeEach(async () => {
  await cleanCollections();
});

afterEach(async () => {
  await Promise.all(
    createdUids
      .splice(0)
      .map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)),
  );
});

describe('CreatorAuthService.register', () => {
  it('rejects an empty display name without touching Firestore', async () => {
    const uid = await createAuthUser('blank-name@example.com');
    const idToken = await getIdTokenForUid(uid);

    await expect(
      creatorAuthService.register(idToken, '   '),
    ).rejects.toBeInstanceOf(InvalidCreatorRegistrationError);
    expect(await creatorRepository.findById(uid)).toBeNull();
  });

  it('provisions a brand-new creator: users + creatorProfiles docs, custom claims, a unique referral code, and one permanent referral link', async () => {
    const uid = await createAuthUser('new-creator@example.com');
    const idToken = await getIdTokenForUid(uid);

    const { cookie, session } = await creatorAuthService.register(
      idToken,
      'Amina Yusuf',
    );

    expect(cookie).toBeTruthy();
    expect(session).toEqual({
      uid,
      email: 'new-creator@example.com',
      displayName: 'Amina Yusuf',
      photoURL: null,
      businessId: 'snack-quest',
      status: 'pending',
      onboardingCompleted: false,
    });

    const user = await userRepository.findById(uid);
    expect(user?.roles).toEqual(['creator']);
    expect(user?.displayName).toBe('Amina Yusuf');

    const profile = await creatorRepository.findById(uid);
    expect(profile).toMatchObject({
      businessId: 'snack-quest',
      status: 'pending',
      onboardingCompleted: false,
      tier: 'bronze',
      availableCashKes: 0,
      // Flat for every affiliate now (§ flat affiliate commission) —
      // no early-registration tier to be the first creator of.
      commissionRateKes: 300,
    });
    expect(profile?.referralCode).toMatch(/^[A-Z]+\d{4}$/);

    // Exactly one permanent link, auto-generated, using the same code as the profile — nothing left for the creator to create themselves.
    const { links } = await referralLinkRepository.listByOwner(
      'snack-quest',
      uid,
    );
    expect(links).toHaveLength(1);
    expect(links[0].data).toMatchObject({
      businessId: 'snack-quest',
      code: profile?.referralCode,
      ownerId: uid,
      discountKes: 250,
      commissionKes: 300,
      isActive: true,
      clickCount: 0,
      conversionCount: 0,
    });

    const authUser = await adminAuth.getUser(uid);
    expect(authUser.customClaims).toEqual({
      roles: ['creator'],
      businessId: 'snack-quest',
    });
  });

  it('queues a welcome email once the notificationTemplates catalog has the template', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'creator_registered_welcome_email',
      channel: 'email',
      subject: 'Welcome, {{displayName}}!',
      bodyTemplate: 'Hi {{displayName}}, your code is {{referralCode}}. {{portalUrl}}',
      htmlBodyTemplate: null,
      requiredParams: ['displayName', 'referralCode', 'portalUrl'],
      version: 1,
      isActive: true,
    });
    const uid = await createAuthUser('welcome-email@example.com');
    const idToken = await getIdTokenForUid(uid);

    await creatorAuthService.register(idToken, 'Amina Yusuf');

    const profile = await creatorRepository.findById(uid);
    const outbound = await outboundMessageRepository.findById(`email:creator-welcome:${uid}`);
    expect(outbound?.recipientRef).toBe('welcome-email@example.com');
    expect(outbound?.renderedBody).toBe(
      `Hi Amina Yusuf, your code is ${profile?.referralCode}. http://localhost:3000/creator`,
    );
  });

  it('gives every creator the same commission, whenever they registered', async () => {
    // Registration order used to decide the rate. It no longer does —
    // the tenth creator earns exactly what the first one does.
    const rates: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const uid = await createAuthUser(`creator-order-${i}@example.com`);
      const idToken = await getIdTokenForUid(uid);
      await creatorAuthService.register(idToken, `Creator Number ${i}`);

      const profile = await creatorRepository.findById(uid);
      const { links } = await referralLinkRepository.listByOwner('snack-quest', uid);
      rates.push(profile!.commissionRateKes, links[0].data.commissionKes);
      expect(links[0].data.discountKes).toBe(250);
    }

    expect(rates).toEqual([300, 300, 300, 300, 300, 300]);
  });

  it('adds the creator role to an existing customer account instead of creating a duplicate identity', async () => {
    const uid = await createAuthUser('existing-customer@example.com');
    await userRepository.create(
      uid,
      {
        email: 'existing-customer@example.com',
        roles: ['customer'],
        displayName: 'Existing Customer',
        photoURL: null,
      },
      uid,
    );
    const idToken = await getIdTokenForUid(uid);

    const { session } = await creatorAuthService.register(
      idToken,
      'Existing Customer',
    );

    expect(session.displayName).toBe('Existing Customer');
    const user = await userRepository.findById(uid);
    expect(user?.roles.sort()).toEqual(['creator', 'customer']);
  });

  // The production dead end: an account existed in Firebase Auth (an
  // admin's, but a half-finished sign-up looks identical) with no
  // creator profile. Signing up again was refused by Auth for the
  // duplicate email, and signing in was refused here for the missing
  // profile, so the person could not get in by any route. The register
  // form now recovers by signing in and re-submitting that token, which
  // is this call — it has to provision without stripping the role the
  // account already had.
  it('provisions a creator on an account that already exists with another role, keeping that role', async () => {
    const uid = await createAuthUser('owner@example.com');
    await userRepository.create(
      uid,
      {
        email: 'owner@example.com',
        roles: ['super_admin'],
        displayName: 'Site Owner',
        photoURL: null,
      },
      uid,
    );
    const idToken = await getIdTokenForUid(uid);

    await expect(creatorAuthService.login(idToken)).rejects.toBeInstanceOf(
      CreatorNotProvisionedError,
    );

    const { session } = await creatorAuthService.register(idToken, 'Site Owner');
    expect(session.status).toBe('pending');

    const user = await userRepository.findById(uid);
    expect(user?.roles.sort()).toEqual(['creator', 'super_admin']);

    // And the account that could not sign in a moment ago now can.
    const after = await creatorAuthService.login(idToken);
    expect(after.session.uid).toBe(uid);
  });

  it('rejects a uid that already has a creator profile', async () => {
    const uid = await createAuthUser('already-creator@example.com');
    const idToken = await getIdTokenForUid(uid);
    await creatorAuthService.register(idToken, 'Already Creator');

    await expect(
      creatorAuthService.register(idToken, 'Already Creator'),
    ).rejects.toBeInstanceOf(CreatorAlreadyRegisteredError);
  });
});

describe('CreatorAuthService.login', () => {
  it('rejects an authenticated user with no creator profile at all', async () => {
    const uid = await createAuthUser('nobody@example.com');
    const idToken = await getIdTokenForUid(uid);

    await expect(creatorAuthService.login(idToken)).rejects.toBeInstanceOf(
      CreatorNotProvisionedError,
    );
  });

  it('establishes a real session for a registered creator and re-syncs custom claims', async () => {
    const uid = await createAuthUser('login-creator@example.com');
    const registerToken = await getIdTokenForUid(uid);
    await creatorAuthService.register(registerToken, 'Login Creator');

    const idToken = await getIdTokenForUid(uid);
    const { cookie, session } = await creatorAuthService.login(idToken);

    expect(cookie).toBeTruthy();
    expect(session.uid).toBe(uid);
    expect(session.status).toBe('pending');
  });
});

describe('CreatorAuthService.verifySessionCookie', () => {
  it('round-trips a cookie issued by register back into the same session', async () => {
    const uid = await createAuthUser('round-trip@example.com');
    const idToken = await getIdTokenForUid(uid);
    const { cookie } = await creatorAuthService.register(idToken, 'Round Trip');

    const verified = await creatorAuthService.verifySessionCookie(cookie);
    expect(verified).toEqual({
      uid,
      email: 'round-trip@example.com',
      displayName: 'Round Trip',
      photoURL: null,
      businessId: 'snack-quest',
      status: 'pending',
      onboardingCompleted: false,
    });
  });

  it('returns null for a garbage cookie value', async () => {
    await expect(
      creatorAuthService.verifySessionCookie('not-a-real-cookie'),
    ).resolves.toBeNull();
  });
});
