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
 * Behavioral assertions for the Conversation Domain rules
 * (PLATFORM_ARCHITECTURE_V2.md §6/§15): conversations, packages,
 * conversationCheckoutSnapshots, paymentIntents, domainEvents.
 */

let testEnv: RulesTestEnvironment;

const CUSTOMER_UID = 'customer-1';
const OTHER_UID = 'customer-2';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-conversation-domain',
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

describe('conversations security rules', () => {
  it('blocks any client write, even by the owning customer', async () => {
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'conversations', 'conv-1'), {
        phoneNumber: '254700000000',
        customerId: CUSTOMER_UID,
        status: 'active',
      }),
    );
  });

  it('lets the identified customer read their own conversation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'conversations', 'conv-1'), {
        phoneNumber: '254700000000',
        customerId: CUSTOMER_UID,
        status: 'active',
      });
    });
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'conversations', 'conv-1')));
  });

  it('blocks a different customer from reading someone else’s conversation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'conversations', 'conv-1'), {
        phoneNumber: '254700000000',
        customerId: CUSTOMER_UID,
        status: 'active',
      });
    });
    const ctx = testEnv.authenticatedContext(OTHER_UID, { roles: ['customer'] });
    await assertFails(getDoc(doc(ctx.firestore(), 'conversations', 'conv-1')));
  });
});

describe('packages security rules', () => {
  it('lets anyone signed in read an active package', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'packages', 'box-1'), {
        name: 'Starter Box',
        priceKes: 2500,
        isActive: true,
      });
    });
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'packages', 'box-1')));
  });

  it('blocks a non-admin from writing a package', async () => {
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'packages', 'box-1'), {
        name: 'Starter Box',
        priceKes: 2500,
        isActive: true,
      }),
    );
  });

  it('lets an admin write a package', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'packages', 'box-1'), {
        name: 'Starter Box',
        priceKes: 2500,
        isActive: true,
        businessId: 'biz-1',
      }),
    );
  });
});

describe('conversationCheckoutSnapshots security rules', () => {
  it('blocks any client read or write, even by an admin write', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'conversationCheckoutSnapshots', 'snap-1'), {
        conversationId: 'conv-1',
        totalKes: 2500,
      }),
    );
  });
});

describe('paymentIntents security rules', () => {
  it('lets the owning customer read their own intent', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'paymentIntents', 'intent-1'), {
        customerId: CUSTOMER_UID,
        amountKes: 2500,
        status: 'processing',
      });
    });
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'paymentIntents', 'intent-1')));
  });

  it('blocks any client write', async () => {
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'paymentIntents', 'intent-1'), {
        customerId: CUSTOMER_UID,
        amountKes: 2500,
        status: 'pending',
      }),
    );
  });
});

describe('domainEvents security rules', () => {
  it('blocks any client write', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'domainEvents', 'evt-1'), { type: 'Test' }),
    );
  });

  it('lets an admin read', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'domainEvents', 'evt-1'), { type: 'Test', businessId: 'biz-1' });
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'domainEvents', 'evt-1')));
  });
});
