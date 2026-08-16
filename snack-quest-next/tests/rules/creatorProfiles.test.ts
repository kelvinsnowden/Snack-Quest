import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Behavioral assertions for the creatorProfiles rules in
 * firestore.rules (TDD §9/§21): owner-or-admin reads, and the
 * diff().affectedKeys() guard that blocks a creator from writing to
 * their own financial fields directly.
 */

let testEnv: RulesTestEnvironment;

const CREATOR_UID = 'creator-1';
const OTHER_UID = 'creator-2';

const seedProfile = {
  businessId: 'biz-1',
  referralCode: 'ABC123',
  tier: 'bronze',
  availableCashKes: 1000,
  pendingEarningsKes: 0,
  lifetimeEarningsKes: 1000,
  commissionRateKes: 500,
  status: 'active',
  onboardingCompleted: true,
  bio: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: CREATOR_UID,
  updatedBy: CREATOR_UID,
  deletedAt: null,
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // A dedicated project namespace, distinct from other rules test
    // files sharing this emulator instance — clearFirestore() wipes an
    // entire project, so files running concurrently against the same
    // project ID would stomp on each other's seeded data.
    projectId: 'demo-project-creator-profiles',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'creatorProfiles', CREATOR_UID),
      seedProfile,
    );
  });
});

describe('creatorProfiles security rules', () => {
  it('lets a creator read their own profile', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID)),
    );
  });

  it("blocks a creator from reading another creator's profile", async () => {
    const ctx = testEnv.authenticatedContext(OTHER_UID, {
      roles: ['creator'],
    });
    await assertFails(
      getDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID)),
    );
  });

  it('blocks an unauthenticated read', async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID)),
    );
  });

  it('lets an admin read any creator profile', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' });
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID)),
    );
  });

  it('lets a creator update a non-financial field on their own profile', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID), {
        bio: 'Updated bio',
      }),
    );
  });

  it('blocks a creator from writing to their own financial fields', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID), {
        availableCashKes: 999999,
      }),
    );
  });

  it('blocks a creator from writing to their own commissionRateKes', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID), {
        commissionRateKes: 999999,
      }),
    );
  });

  it('lets an admin write to financial fields', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' });
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID), {
        availableCashKes: 5000,
      }),
    );
  });

  // § security audit — an admin from a different business must not be
  // able to read or edit this creator's real earnings.
  it('blocks an admin from a different business', async () => {
    const ctx = testEnv.authenticatedContext('admin-2', { roles: ['admin'], businessId: 'biz-2' });
    await assertFails(getDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID)));
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID), {
        availableCashKes: 999999,
      }),
    );
  });

  it('blocks direct client creation of a creator profile', async () => {
    const ctx = testEnv.authenticatedContext(OTHER_UID, {
      roles: ['creator'],
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'creatorProfiles', OTHER_UID), {
        referralCode: 'XYZ',
      }),
    );
  });
});
