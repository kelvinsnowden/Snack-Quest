/**
 * Move the customer-facing delivery prices to the final structure
 * (§ delivery repricing):
 *
 *   Next Day   KES 250   unchanged
 *   Same Day   KES 300   was 439
 *   Express    KES 500   new
 *
 * These are what a customer pays. They have nothing to do with what
 * Tushop bills Snack Quest (KES 35 per optimised km plus 3% of
 * declared value) and are deliberately not derived from it — see
 * lib/delivery/courierCost.ts.
 *
 * Why a script rather than the seed: `seedFargoPickupPoints.mjs`
 * skips any rule that already exists, on purpose, so it never
 * clobbers a price an admin has adjusted. That is the right default
 * and it is also why it cannot perform this change — in production
 * the Same Day rule already exists at 439, so the seed would leave it
 * exactly where it is.
 *
 * Idempotent: safe to run twice. Prints every before/after value and
 * refuses to touch a rule whose current price is already correct.
 *
 * Run against production:
 *   FIREBASE_ADMIN_PROJECT_ID=snack-quest-os \
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   SNACK_QUEST_BUSINESS_ID=snack-quest \
 *   node scripts/repriceCustomerDelivery.mjs
 *
 * Add --dry-run to print the plan and write nothing.
 */

import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');

const BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';
const SHIPPING_ORIGIN = 'Nairobi';
const PACKAGE_CATEGORY = 'small';
const COURIER = 'tushop';

/** The target prices. Kept in step with FARGO_SEED_FEES_KES. */
const TARGET_FEES = {
  'Nairobi Metro — Next Day': 250,
  'Nairobi Metro — Same Day': 300,
  'Nairobi Metro — Express': 500,
};

function zoneRuleId(zone) {
  return `${zone}:${SHIPPING_ORIGIN}:${PACKAGE_CATEGORY}:${COURIER}`
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/—/g, '-');
}

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
  console.log(`business ${BUSINESS_ID}${DRY_RUN ? '   (DRY RUN, nothing will be written)' : ''}\n`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [zone, target] of Object.entries(TARGET_FEES)) {
    const ref = db.collection('deliveryZoneRules').doc(zoneRuleId(zone));
    const snap = await ref.get();

    if (!snap.exists) {
      console.log(`  CREATE  ${zone.padEnd(28)} -> KES ${target}`);
      if (!DRY_RUN) {
        await ref.set({
          businessId: BUSINESS_ID,
          zone,
          shippingOrigin: SHIPPING_ORIGIN,
          packageCategory: PACKAGE_CATEGORY,
          courier: COURIER,
          feeKes: target,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'repriceCustomerDelivery',
        });
      }
      created += 1;
      continue;
    }

    const current = snap.data()?.feeKes;
    if (current === target) {
      console.log(`  OK      ${zone.padEnd(28)}    KES ${current}`);
      unchanged += 1;
      continue;
    }

    console.log(`  UPDATE  ${zone.padEnd(28)} KES ${current} -> KES ${target}`);
    if (!DRY_RUN) {
      await ref.update({
        feeKes: target,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'repriceCustomerDelivery',
      });
    }
    updated += 1;
  }

  console.log(`\n  created ${created}   updated ${updated}   already correct ${unchanged}`);

  if (DRY_RUN) {
    console.log('\n  dry run: nothing was written.');
    return;
  }

  // Read back rather than trust the writes. A price is the number a
  // customer is charged; "probably fine" is not good enough.
  console.log('\n  verifying:');
  let bad = 0;
  for (const [zone, target] of Object.entries(TARGET_FEES)) {
    const snap = await db.collection('deliveryZoneRules').doc(zoneRuleId(zone)).get();
    const actual = snap.data()?.feeKes;
    const ok = actual === target;
    if (!ok) bad += 1;
    console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${zone.padEnd(28)} KES ${actual}`);
  }
  if (bad > 0) {
    throw new Error(`${bad} rule(s) did not end up at the target price`);
  }
  console.log('\n  all customer-facing delivery prices verified.');
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
