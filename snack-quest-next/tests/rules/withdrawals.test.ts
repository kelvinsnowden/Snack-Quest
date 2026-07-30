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

describe('walletTransactions security rules', () => {
  it('blocks any client write, even by the transaction owner', async () => {
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['customer'],
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'walletTransactions', 'tx-1'), {
        customerId: CREATOR_UID,
        amount: 100,
        balanceAfter: 100,
        transactionType: 'credit',
        note: 'test',
      }),
    );
  });

  it('lets the owning customer read their own ledger entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'walletTransactions', 'tx-1'), {
        customerId: CREATOR_UID,
        amount: 100,
        balanceAfter: 100,
        transactionType: 'credit',
        note: 'test',
      });
    });
    const ctx = testEnv.authenticatedContext(CREATOR_UID, {
      roles: ['customer'],
    });
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'walletTransactions', 'tx-1')),
    );
  });
});
