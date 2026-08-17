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
 * Behavioral assertions for the `reviews` rules (§ homepage reviews).
 *
 * Two properties matter here and are worth proving rather than reading
 * off the rules file. A pending review — an unmoderated stranger's
 * words and photos — must not be readable by the public before anyone
 * has looked at it. And no client may write to this collection at all,
 * even though the submission form is public: it goes through
 * `POST /api/reviews`, which is what validates the text, checks the
 * photos are really images, rate-limits by phone, and forces
 * `status: 'pending'`. A direct client write would skip every one of
 * those.
 */

let testEnv: RulesTestEnvironment;

const CUSTOMER_UID = 'customer-1';

const publishedReview = {
  businessId: 'snack-quest',
  customerName: 'Wanjiru K.',
  rating: 5,
  body: 'The wasabi crisps were a genuine shock.',
  photos: [],
  status: 'published',
  contactPhone: null,
};

const pendingReview = { ...publishedReview, status: 'pending', contactPhone: '254712345678' };

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-project-reviews',
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

async function seed(id: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'reviews', id), data);
  });
}

describe('reviews security rules', () => {
  it('lets anyone read a published review', async () => {
    await seed('review-1', publishedReview);

    const ctx = testEnv.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'reviews', 'review-1')));
  });

  it('hides a pending review from the public until it has been moderated', async () => {
    await seed('review-1', pendingReview);

    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(getDoc(doc(ctx.firestore(), 'reviews', 'review-1')));
  });

  it('hides a rejected review too', async () => {
    await seed('review-1', { ...publishedReview, status: 'rejected' });

    const ctx = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), 'reviews', 'review-1')));
  });

  it('lets an admin read a pending review, since moderating one means reading it', async () => {
    await seed('review-1', pendingReview);

    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'], businessId: 'snack-quest' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'reviews', 'review-1')));
  });

  it('blocks a client from submitting a review directly, bypassing every check the route makes', async () => {
    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(setDoc(doc(ctx.firestore(), 'reviews', 'forged'), publishedReview));
  });

  it('blocks a client from publishing their own pending review', async () => {
    await seed('review-1', pendingReview);

    const ctx = testEnv.authenticatedContext(CUSTOMER_UID, { roles: ['customer'] });
    await assertFails(updateDoc(doc(ctx.firestore(), 'reviews', 'review-1'), { status: 'published' }));
  });

  it('blocks even an admin from writing directly — moderation goes through the service', async () => {
    await seed('review-1', pendingReview);

    const ctx = testEnv.authenticatedContext('admin-1', { roles: ['admin'] });
    await assertFails(updateDoc(doc(ctx.firestore(), 'reviews', 'review-1'), { status: 'published' }));
  });
});
