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
 * Behavioral assertions for the tenant foundation's rules
 * (types/business.ts): `businesses` is admin-read/server-write only;
 * `integrationSecrets` is unconditional deny, no exceptions, ever —
 * the single most sensitive collection in the schema.
 */

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-business',
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

describe('businesses security rules', () => {
  it('lets an admin read a business profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'businesses', 'biz-1'), {
        name: 'Snack Quest',
        currency: 'KES',
      });
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'biz-1' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'businesses', 'biz-1')));
  });

  it('blocks any client write, even by an admin', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'businesses', 'biz-1'), {
        name: 'Snack Quest',
        currency: 'KES',
      }),
    );
  });

  it('blocks a non-admin from reading a business profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'businesses', 'biz-1'), {
        name: 'Snack Quest',
        currency: 'KES',
      });
    });
    const ctx = testEnv.authenticatedContext('creator-1', { roles: ['creator'] });
    await assertFails(getDoc(doc(ctx.firestore(), 'businesses', 'biz-1')));
  });

  // § security audit — an admin's role claim alone used to be enough;
  // `businessId` is what actually confines them to their own tenant.
  it('blocks an admin from a different business from reading this one', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'businesses', 'biz-1'), {
        name: 'Snack Quest',
        currency: 'KES',
      });
    });
    const ctx = testEnv.authenticatedContext('admin-2', { roles: ['admin'], businessId: 'biz-2' });
    await assertFails(getDoc(doc(ctx.firestore(), 'businesses', 'biz-1')));
  });
});

describe('businesses/integrationSecrets security rules', () => {
  it('blocks any client read, even by an admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'businesses', 'biz-1', 'integrationSecrets', 'daraja'),
        { consumerKey: 'secret' },
      );
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      getDoc(doc(ctx.firestore(), 'businesses', 'biz-1', 'integrationSecrets', 'daraja')),
    );
  });

  it('blocks any client write, even by an admin', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'businesses', 'biz-1', 'integrationSecrets', 'daraja'), {
        consumerKey: 'secret',
      }),
    );
  });
});
