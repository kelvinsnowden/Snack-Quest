import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Behavioral assertions for the rules added alongside Order/Delivery/
 * Referral wiring (PLATFORM_ARCHITECTURE_V2.md §4/§8/§12): shipments,
 * referralLinks, referralAttributions, creatorProfiles/earningsLedger.
 */

let testEnv: RulesTestEnvironment;

const CREATOR_UID = 'creator-1';
const OTHER_UID = 'creator-2';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-fulfillment-referral',
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
});

describe('shipments security rules', () => {
  it('blocks any client read or write, even by an admin write', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'shipments', 'shipment-1'), {
        orderId: 'order-1',
        status: 'pending',
      }),
    );
  });

  it('lets an admin read', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'shipments', 'shipment-1'), {
        orderId: 'order-1',
        status: 'pending',
      });
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'shipments', 'shipment-1')));
  });
});

describe('referralLinks security rules', () => {
  it('lets the owning creator read their own link', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'referralLinks', 'link-1'), {
        code: 'CREATOR10',
        ownerId: CREATOR_UID,
        discountKes: 200,
        commissionKes: 300,
        isActive: true,
      });
    });
    const ctx = testEnv.authenticatedContext(CREATOR_UID, { roles: ['creator'] });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'referralLinks', 'link-1')));
  });

  it('blocks a different creator from reading someone else’s link', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'referralLinks', 'link-1'), {
        code: 'CREATOR10',
        ownerId: CREATOR_UID,
        discountKes: 200,
        commissionKes: 300,
        isActive: true,
      });
    });
    const ctx = testEnv.authenticatedContext(OTHER_UID, { roles: ['creator'] });
    await assertFails(getDoc(doc(ctx.firestore(), 'referralLinks', 'link-1')));
  });

  it('blocks a creator from writing their own link (server/admin-only)', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, { roles: ['creator'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'referralLinks', 'link-1'), {
        code: 'CREATOR10',
        ownerId: CREATOR_UID,
        discountKes: 200,
        commissionKes: 300,
        isActive: true,
      }),
    );
  });
});

describe('referralAttributions security rules', () => {
  it('lets the credited creator read their own attribution', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'referralAttributions', 'attr-1'), {
        referralLinkId: 'link-1',
        creatorId: CREATOR_UID,
        orderId: 'order-1',
        commissionKes: 300,
        status: 'awarded',
      });
    });
    const ctx = testEnv.authenticatedContext(CREATOR_UID, { roles: ['creator'] });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'referralAttributions', 'attr-1')));
  });

  it('blocks any client write', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, { roles: ['creator'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'referralAttributions', 'attr-1'), {
        referralLinkId: 'link-1',
        creatorId: CREATOR_UID,
        orderId: 'order-1',
        commissionKes: 300,
        status: 'awarded',
      }),
    );
  });
});

describe('creatorProfiles/earningsLedger security rules', () => {
  it('lets the owning creator read their own ledger entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'creatorProfiles', CREATOR_UID, 'earningsLedger', 'entry-1'),
        { type: 'referral_commission', amountKes: 300 },
      );
    });
    const ctx = testEnv.authenticatedContext(CREATOR_UID, { roles: ['creator'] });
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID, 'earningsLedger', 'entry-1')),
    );
  });

  it('blocks any client write, even by the owning creator', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, { roles: ['creator'] });
    await assertFails(
      setDoc(
        doc(ctx.firestore(), 'creatorProfiles', CREATOR_UID, 'earningsLedger', 'entry-1'),
        { type: 'referral_commission', amountKes: 300 },
      ),
    );
  });
});
