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
 * Behavioral assertions for the creatorMemberships rules in
 * firestore.rules (TDD §9/§21, § Creator Marketplace migration):
 * owner-or-admin reads, the diff().affectedKeys() guard that blocks a
 * creator from writing to their own financial fields directly, and —
 * now that the collection is nested under `businesses/{businessId}`
 * rather than a flat `businessId` field — that the path itself is
 * what enforces tenant isolation.
 */

let testEnv: RulesTestEnvironment;

const BUSINESS_ID = 'biz-1';
const OTHER_BUSINESS_ID = 'biz-2';
const CREATOR_UID = 'creator-1';
const OTHER_UID = 'creator-2';

const seedProfile = {
  businessId: BUSINESS_ID,
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

function membershipPath(
  businessId: string,
  uid: string,
): [string, string, string, string] {
  return ['businesses', businessId, 'creatorMemberships', uid];
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // A dedicated project namespace, distinct from other rules test
    // files sharing this emulator instance — clearFirestore() wipes an
    // entire project, so files running concurrently against the same
    // project ID would stomp on each other's seeded data.
    projectId: 'demo-project-creator-memberships',
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
      doc(context.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID)),
      seedProfile,
    );
  });
});

describe('creatorMemberships security rules', () => {
  it('lets a creator read their own membership', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID))),
    );
  });

  it("blocks a creator from reading another creator's membership", async () => {
    const ctx = testEnv.authenticatedContext(OTHER_UID, {
      roles: ['creator'],
    });
    await assertFails(
      getDoc(doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID))),
    );
  });

  it('blocks an unauthenticated read', async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID))),
    );
  });

  it('lets an admin read any membership in their own business', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', {
      roles: ['admin'],
      businessId: BUSINESS_ID,
    });
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID))),
    );
  });

  it('lets a creator update a non-financial field on their own membership', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertSucceeds(
      updateDoc(
        doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID)),
        {
          bio: 'Updated bio',
        },
      ),
    );
  });

  it('blocks a creator from writing to their own financial fields', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertFails(
      updateDoc(
        doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID)),
        {
          availableCashKes: 999999,
        },
      ),
    );
  });

  it('blocks a creator from writing to their own commissionRateKes', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertFails(
      updateDoc(
        doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID)),
        {
          commissionRateKes: 999999,
        },
      ),
    );
  });

  it('lets an admin write to financial fields', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', {
      roles: ['admin'],
      businessId: BUSINESS_ID,
    });
    await assertSucceeds(
      updateDoc(
        doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID)),
        {
          availableCashKes: 5000,
        },
      ),
    );
  });

  // § security audit — an admin from a different business must not be
  // able to read or edit this creator's real earnings. Now enforced by
  // the nested path itself (`businessId` is the parent match's path
  // variable), not a `resource.data.businessId` field check — proves
  // the migration's path-based scoping actually works, not just the
  // field-based version it replaced.
  it('blocks an admin from a different business at the literal nested path', async () => {
    const ctx = testEnv.authenticatedContext('admin-2', {
      roles: ['admin'],
      businessId: OTHER_BUSINESS_ID,
    });
    await assertFails(
      getDoc(doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID))),
    );
    await assertFails(
      updateDoc(
        doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, CREATOR_UID)),
        {
          availableCashKes: 999999,
        },
      ),
    );
  });

  it('blocks direct client creation of a creator membership', async () => {
    const ctx = testEnv.authenticatedContext(OTHER_UID, {
      roles: ['creator'],
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), ...membershipPath(BUSINESS_ID, OTHER_UID)), {
        referralCode: 'XYZ',
      }),
    );
  });
});
