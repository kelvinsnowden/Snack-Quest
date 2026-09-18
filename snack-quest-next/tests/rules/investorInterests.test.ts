import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, doc, getDoc, getDocs, setDoc, query, where } from 'firebase/firestore';

/**
 * `investorInterests` security rules (§ investor interest page).
 *
 * Stricter than `reviews`, which at least publishes its approved rows.
 * This collection holds named people, their phone numbers and roughly
 * what each might invest — there is no version of it that belongs in a
 * browser. So the rule is an unconditional deny in both directions,
 * for everyone, including an authenticated admin: server code reads it
 * through the Admin SDK, which bypasses rules entirely, so admins lose
 * nothing and the collection gains a rule with no exception in it that
 * could later be widened by mistake.
 *
 * The write half matters just as much as the read half. A public form
 * posting straight to Firestore from the browser would let anyone
 * write anything into this list; it posts to a route instead.
 */

let testEnv: RulesTestEnvironment;

const submission = {
  fullName: 'Wanjiru Kamau',
  email: 'wanjiru@example.com',
  phone: '254712345678',
  location: 'Nairobi',
  investorType: 'angel',
  status: 'new',
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-investor-interests',
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
    await setDoc(doc(context.firestore(), 'investorInterests', 'interest-1'), submission);
  });
});

describe('investorInterests security rules', () => {
  it('refuses a stranger reading one', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'investorInterests', 'interest-1')));
  });

  it('refuses a signed-in customer reading one', async () => {
    const db = testEnv.authenticatedContext('customer-1').firestore();
    await assertFails(getDoc(doc(db, 'investorInterests', 'interest-1')));
  });

  /*
   * The whole list, which is the thing an attacker actually wants —
   * one request returning every lead rather than one document at a
   * time.
   */
  it('refuses listing the collection', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, 'investorInterests')));
  });

  /* Guessing at a known email must not confirm whether it is on the list. */
  it('refuses querying by email', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      getDocs(
        query(collection(db, 'investorInterests'), where('email', '==', 'wanjiru@example.com')),
      ),
    );
  });

  it('refuses a client writing one directly', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'investorInterests', 'forged'), submission));
  });

  it('refuses a signed-in user overwriting one', async () => {
    const db = testEnv.authenticatedContext('customer-1').firestore();
    await assertFails(
      setDoc(doc(db, 'investorInterests', 'interest-1'), { ...submission, status: 'closed' }),
    );
  });

  /*
   * Admins included, deliberately. Every admin path to this data goes
   * through server code holding the Admin SDK, so the rule needs no
   * carve-out — and a rule with no carve-out cannot be loosened by
   * someone editing the condition later.
   */
  it('refuses even an authenticated admin, who reads it server-side instead', async () => {
    const db = testEnv
      .authenticatedContext('admin-1', { role: 'super_admin', businessId: 'snack-quest' })
      .firestore();
    await assertFails(getDoc(doc(db, 'investorInterests', 'interest-1')));
  });
});
