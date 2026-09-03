import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

/**
 * `businesses/{businessId}/referralCodes/{code}` is closed to clients
 * entirely (§ creators choose their own code).
 *
 * Write being denied is the obvious half: the collection exists so
 * that `tx.create` can make claiming a code atomic, and a client that
 * could write it could take a code without registering, or overwrite
 * somebody else's claim.
 *
 * Read being denied is the half worth a test of its own. Every
 * document ID in here is a referral code in use, so a readable
 * collection is a directory of every creator's code — including an
 * admin's. Availability is answered by `GET /api/creator/referral-code`,
 * which says free or taken and nothing about who holds it.
 */

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-referral-codes',
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
    await setDoc(doc(context.firestore(), 'businesses/biz-1/referralCodes/SNACKS'), {
      businessId: 'biz-1',
      code: 'SNACKS',
      ownerId: 'creator-1',
    });
  });
});

describe('referral code reservations', () => {
  it('does not let a creator read the list of codes in use', async () => {
    const ctx = testEnv.authenticatedContext('creator-2', {
      roles: ['creator'],
      businessId: 'biz-1',
    });
    await assertFails(getDoc(doc(ctx.firestore(), 'businesses/biz-1/referralCodes/SNACKS')));
  });

  /** Not even an admin: this is a lookup table, and the API answers the only question worth asking. */
  it('does not let an admin read them either', async () => {
    const ctx = testEnv.authenticatedContext('admin-1', {
      roles: ['admin'],
      businessId: 'biz-1',
    });
    await assertFails(getDoc(doc(ctx.firestore(), 'businesses/biz-1/referralCodes/SNACKS')));
  });

  /** Claiming a code from a client would be taking one without registering. */
  it('blocks a client from claiming a code', async () => {
    const ctx = testEnv.authenticatedContext('creator-2', {
      roles: ['creator'],
      businessId: 'biz-1',
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), 'businesses/biz-1/referralCodes/FREECODE'), {
        businessId: 'biz-1',
        code: 'FREECODE',
        ownerId: 'creator-2',
      }),
    );
  });

  /** And releasing somebody else's claim would let it be stolen a moment later. */
  it('blocks a client from deleting a claim', async () => {
    const ctx = testEnv.authenticatedContext('creator-2', {
      roles: ['creator'],
      businessId: 'biz-1',
    });
    await assertFails(deleteDoc(doc(ctx.firestore(), 'businesses/biz-1/referralCodes/SNACKS')));
  });
});
