/**
 * Record the delivery speed on orders placed before it was stored
 * (§ order delivery speed).
 *
 * The speed was always chosen and always priced — it just lived in the
 * conversation's `stateBlob` and never reached the order, so Admin
 * could not tell a same-day order from a next-day one. That state is
 * still there, which is what makes this a copy rather than a guess.
 *
 * It is deliberately NOT inferred from `delivery.feeKes`. The fee looks
 * like it would work (250 next day, 300 same day, 500 express) and it
 * would be wrong: same day was KES 439 before the repricing, several
 * orders shipped with a waived fee of 0, and a fee of 250 on an order
 * from before express existed says nothing about a choice that could
 * not be made. An order whose conversation is gone is left alone and
 * reported, and Admin shows "Not recorded" for it — which is true,
 * where a guessed "Next day" would not be.
 *
 * Idempotent: skips an order that already has one, prints every change,
 * then reads back and refuses to report success on a value it did not
 * verify.
 *
 * Run against production:
 *   FIREBASE_ADMIN_PROJECT_ID=snack-quest-os \
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   node scripts/backfillOrderServiceLevel.mjs
 *
 * Add --dry-run to print the plan and write nothing.
 */

import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');
const VALID = new Set(['next-day', 'same-day', 'express']);

function boot() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp(
    keyPath
      ? { credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) }
      : { credential: applicationDefault() },
  );
  return getFirestore();
}

async function main() {
  const db = boot();
  console.log(DRY_RUN ? 'DRY RUN, nothing will be written\n' : '');

  const conversations = new Map();
  for (const doc of (await db.collection('conversations').get()).docs) {
    conversations.set(doc.id, doc.data());
  }

  let written = 0;
  let alreadySet = 0;
  let pickup = 0;
  let unrecoverable = 0;

  for (const doc of (await db.collection('orders').get()).docs) {
    const order = doc.data();
    const delivery = order.delivery ?? {};

    if (delivery.method !== 'door') {
      // Pickup has one speed; there is nothing to record.
      pickup += 1;
      continue;
    }
    if (VALID.has(delivery.serviceLevel)) {
      alreadySet += 1;
      continue;
    }

    const recorded = conversations.get(order.conversationId)?.stateBlob?.serviceLevel;
    if (!VALID.has(recorded)) {
      console.log(`  SKIP    ${doc.id}  no recorded speed on its conversation`);
      unrecoverable += 1;
      continue;
    }

    console.log(`  SET     ${doc.id}  -> ${recorded}`);
    if (!DRY_RUN) {
      await doc.ref.update({
        'delivery.serviceLevel': recorded,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    written += 1;
  }

  console.log(
    `\n  set ${written}   already recorded ${alreadySet}   pickup ${pickup}   not recoverable ${unrecoverable}`,
  );

  if (DRY_RUN) {
    console.log('\n  dry run: nothing was written.');
    return;
  }

  console.log('\n  verifying:');
  let missing = 0;
  for (const doc of (await db.collection('orders').get()).docs) {
    const delivery = doc.data().delivery ?? {};
    if (delivery.method !== 'door') continue;
    if (!VALID.has(delivery.serviceLevel)) {
      const recoverable = VALID.has(
        conversations.get(doc.data().conversationId)?.stateBlob?.serviceLevel,
      );
      // Only a door order whose speed was recoverable and still is not
      // set counts as a failure. One with nothing to recover is a
      // correct "not recorded".
      if (recoverable) {
        console.log(`    FAIL  ${doc.id} still has no speed`);
        missing += 1;
      }
    }
  }
  if (missing > 0) {
    throw new Error(`${missing} door order(s) still missing a recoverable delivery speed`);
  }
  console.log('    PASS  every recoverable door order now records its speed.');
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
