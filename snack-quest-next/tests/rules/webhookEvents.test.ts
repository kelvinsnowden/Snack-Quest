import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Behavioral assertions for the webhookEvents / outboundGatewayCalls
 * rules in firestore.rules (PLATFORM_ARCHITECTURE_V2.md §7/§13/§15):
 * both are server(Admin SDK)-only, no client access at all, in either
 * direction, for any role including admin.
 */

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-webhook-events',
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

describe('webhookEvents security rules', () => {
  it('blocks any client write, even by an admin', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'webhookEvents', 'daraja:evt-1'), {
        provider: 'daraja',
        providerEventId: 'evt-1',
        status: 'received',
        payload: {},
        relatedEntityId: null,
        error: null,
      }),
    );
  });

  it('blocks any client read, even by an admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'webhookEvents', 'daraja:evt-1'), {
        provider: 'daraja',
        providerEventId: 'evt-1',
        status: 'received',
      });
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      getDoc(doc(ctx.firestore(), 'webhookEvents', 'daraja:evt-1')),
    );
  });
});

describe('outboundGatewayCalls security rules', () => {
  it('blocks any client write, even by an admin', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'outboundGatewayCalls', 'key-1'), {
        status: 'in_flight',
      }),
    );
  });

  it('blocks any client read, even by an admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'outboundGatewayCalls', 'key-1'), {
        status: 'in_flight',
      });
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      getDoc(doc(ctx.firestore(), 'outboundGatewayCalls', 'key-1')),
    );
  });
});
