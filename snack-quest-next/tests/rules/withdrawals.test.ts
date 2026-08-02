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
 * Behavioral assertions for the withdrawals rules in firestore.rules
 * (TDD §9/§21): owner-scoped create with a pending-only shape,
 * admin/server-only status transitions (this is the unified collection
 * that replaces the current system's three inconsistent withdrawal
 * implementations — CREATOR_PORTAL_TECH_DEBT.md §1 — so its rules are
 * the direct enforcement of that fix).
 */

let testEnv: RulesTestEnvironment;

const CREATOR_UID = 'creator-1';
const OTHER_UID = 'creator-2';
const WITHDRAWAL_ID = 'withdrawal-1';

const seedWithdrawal = {
  ownerId: CREATOR_UID,
  ownerType: 'creator',
  amountKes: 500,
  phoneNumber: '+254700000000',
  status: 'pending',
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // A dedicated project namespace, distinct from other rules test
    // files sharing this emulator instance — clearFirestore() wipes an
    // entire project, so files running concurrently against the same
    // project ID would stomp on each other's seeded data.
    projectId: 'demo-project-withdrawals',
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

describe('withdrawals security rules', () => {
  it('lets an owner create their own pending withdrawal', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertSucceeds(
      setDoc(
        doc(ctx.firestore(), 'withdrawals', WITHDRAWAL_ID),
        seedWithdrawal,
      ),
    );
  });

  it('blocks creating a withdrawal for someone else', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'withdrawals', WITHDRAWAL_ID), {
        ...seedWithdrawal,
        ownerId: OTHER_UID,
      }),
    );
  });

  it('blocks creating a withdrawal in a non-pending status', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'withdrawals', WITHDRAWAL_ID), {
        ...seedWithdrawal,
        status: 'approved',
      }),
    );
  });

  it('blocks the owner from approving their own withdrawal', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'withdrawals', WITHDRAWAL_ID),
        seedWithdrawal,
      );
    });
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['creator'],
    });
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'withdrawals', WITHDRAWAL_ID), {
        status: 'approved',
      }),
    );
  });

  it('lets an admin approve a withdrawal', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'withdrawals', WITHDRAWAL_ID),
        seedWithdrawal,
      );
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'withdrawals', WITHDRAWAL_ID), {
        status: 'approved',
      }),
    );
  });

  it('blocks a non-owner from reading a withdrawal', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'withdrawals', WITHDRAWAL_ID),
        seedWithdrawal,
      );
    });
    const ctx = testEnv.authenticatedContext(OTHER_UID, {
      roles: ['creator'],
    });
    await assertFails(
      getDoc(doc(ctx.firestore(), 'withdrawals', WITHDRAWAL_ID)),
    );
  });
});

describe('customerWallets security rules (§ Phase 4: Customer loyalty / Quest system)', () => {
  const WALLET_ID = 'biz-1:254712345678';

  it('blocks any client write, even from an admin', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['admin'],
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'customerWallets', WALLET_ID), {
        businessId: 'biz-1',
        phoneNumber: '254712345678',
        balanceKes: 100,
        lifetimeCreditsEarnedKes: 100,
      }),
    );
  });

  it('blocks a signed-in customer from reading a wallet — no client identity exists to grant self-access against', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'customerWallets', WALLET_ID), {
        businessId: 'biz-1',
        phoneNumber: '254712345678',
        balanceKes: 100,
        lifetimeCreditsEarnedKes: 100,
      });
    });
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['customer'],
    });
    await assertFails(getDoc(doc(ctx.firestore(), 'customerWallets', WALLET_ID)));
  });

  it('lets an admin read a wallet', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'customerWallets', WALLET_ID), {
        businessId: 'biz-1',
        phoneNumber: '254712345678',
        balanceKes: 100,
        lifetimeCreditsEarnedKes: 100,
      });
    });
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['admin'],
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'customerWallets', WALLET_ID)));
  });

  it("blocks any client write to a wallet's ledger, even from an admin", async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['admin'],
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'customerWallets', WALLET_ID, 'ledger', 'entry-1'), {
        type: 'admin_adjustment',
        amountKes: 100,
        balanceAfterKes: 100,
        note: 'test',
        orderId: null,
        createdBy: CREATOR_UID,
      }),
    );
  });
});
