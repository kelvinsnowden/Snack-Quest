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
 * Behavioral assertions for `users/{uid}` (types/user.ts, § Admin auth
 * foundation): the shared identity root whose `roles` field is copied
 * onto the Firebase Auth custom claim every rule and route guard
 * trusts elsewhere — so this is the one collection where a client
 * self-assigning `roles: ['admin']` would matter, and the rule must
 * block it even though nothing downstream currently trusts Firestore
 * `roles` alone without a matching `staffProfiles` document too
 * (defense in depth, not the only layer).
 */

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-users',
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

describe('users security rules', () => {
  it('lets a signed-in user create their own doc with only the customer role', async () => {
    const ctx = testEnv.authenticatedContext('user-1', {});
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'users', 'user-1'), {
        email: 'jane@example.com',
        roles: ['customer'],
        displayName: 'Jane',
        photoURL: null,
      }),
    );
  });

  it('blocks a user from self-creating with an elevated role', async () => {
    const ctx = testEnv.authenticatedContext('user-1', {});
    await assertFails(
      setDoc(doc(ctx.firestore(), 'users', 'user-1'), {
        email: 'jane@example.com',
        roles: ['admin'],
        displayName: 'Jane',
        photoURL: null,
      }),
    );
  });

  it('blocks creating a document for a different uid', async () => {
    const ctx = testEnv.authenticatedContext('user-1', {});
    await assertFails(
      setDoc(doc(ctx.firestore(), 'users', 'someone-else'), {
        email: 'jane@example.com',
        roles: ['customer'],
        displayName: 'Jane',
        photoURL: null,
      }),
    );
  });

  it('lets a user update their own displayName', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'user-1'), {
        email: 'jane@example.com',
        roles: ['customer'],
        displayName: 'Jane',
        photoURL: null,
      });
    });
    const ctx = testEnv.authenticatedContext('user-1', {});
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', 'user-1'), { displayName: 'Jane K.' }),
    );
  });

  it('blocks a user from self-escalating their own roles', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'user-1'), {
        email: 'jane@example.com',
        roles: ['customer'],
        displayName: 'Jane',
        photoURL: null,
      });
    });
    const ctx = testEnv.authenticatedContext('user-1', {});
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', 'user-1'), { roles: ['admin'] }),
    );
  });

  it('lets an admin change another user\'s roles', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'user-1'), {
        email: 'jane@example.com',
        roles: ['customer'],
        displayName: 'Jane',
        photoURL: null,
      });
    });
    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', 'user-1'), { roles: ['customer', 'creator'] }),
    );
  });

  it('lets an owner read their own doc, blocks a stranger', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'user-1'), {
        email: 'jane@example.com',
        roles: ['customer'],
        displayName: 'Jane',
        photoURL: null,
      });
    });
    const owner = testEnv.authenticatedContext('user-1', {});
    await assertSucceeds(getDoc(doc(owner.firestore(), 'users', 'user-1')));

    const stranger = testEnv.authenticatedContext('user-2', {});
    await assertFails(getDoc(doc(stranger.firestore(), 'users', 'user-1')));
  });
});
