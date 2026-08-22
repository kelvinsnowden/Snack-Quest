// Seeds the Fargo Courier pickup network and its three delivery-zone
// rules (§ Jumia to Fargo migration). Replaces seedPickupStations.mjs,
// which seeded Jumia's 209 stations from a dataset that no longer
// exists.
//
// Only the UPCOUNTRY points are seeded. Inside Fargo's Nairobi radius a
// parcel goes to the customer's door, so those 35 metro branches are
// real Fargo locations that no customer ever picks — seeding them would
// put a list of 35 branches in front of Nairobi customers who are not
// meant to visit any of them.
//
// Idempotent: re-running updates a point in place and never clobbers a
// fee an admin has already set.
//
//   node scripts/seedFargoPickupPoints.mjs            # dry run
//   node scripts/seedFargoPickupPoints.mjs --commit   # write
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUSINESS_ID = process.env.BUSINESS_ID ?? 'snack-quest';
const COURIER = 'fargo';
const SHIPPING_ORIGIN = 'Nairobi';
const PACKAGE_CATEGORY = 'small';
const COMMIT = process.argv.includes('--commit');

// Mirrors lib/delivery/fargoPricing.ts. Duplicated rather than imported
// because this is a plain ESM script with no TypeScript build step —
// the pricing test asserts these same figures, so a drift shows up
// there rather than silently in production.
const ZONES = {
  'Nairobi Metro — Next Day': 250,
  'Nairobi Metro — Same Day': 439,
  Upcountry: 450,
};
const UPCOUNTRY_ZONE = 'Upcountry';

function zoneRuleId(zone) {
  return `${zone}:${SHIPPING_ORIGIN}:${PACKAGE_CATEGORY}:${COURIER}`
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/—/g, '-');
}

/** Stable per point, so a re-run updates rather than duplicates. */
function pointId(name) {
  return `fargo-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function searchTokens(point) {
  return [...new Set(
    [point.name, point.town, point.county, point.location]
      .filter(Boolean)
      .flatMap((value) => value.toLowerCase().split(/[^a-z0-9']+/))
      .filter((token) => token.length > 1),
  )];
}

async function main() {
  const raw = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'fargoPickupPoints.raw.json'), 'utf8'));
  const customerFacing = raw.points.filter((p) => p.region === 'upcountry');
  const metroOnly = raw.points.filter((p) => p.region === 'nairobi-metro');

  console.log(`Fargo points in dataset: ${raw.points.length}`);
  console.log(`  seeding (upcountry, customer-facing): ${customerFacing.length}`);
  console.log(`  skipped (metro — door delivery, never picked): ${metroOnly.length}`);

  if (!COMMIT) {
    console.log('\nDRY RUN. Re-run with --commit to write.');
    console.log(`Would seed ${customerFacing.length} pickup points and ${Object.keys(ZONES).length} zone rules.`);
    console.log('Sample:', JSON.stringify(customerFacing.slice(0, 2).map((p) => p.name)));
    return;
  }

  initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.SA_KEY, 'utf8'))) });
  const db = getFirestore();

  let written = 0;
  let batch = db.batch();
  for (const [index, point] of customerFacing.entries()) {
    batch.set(
      db.collection('pickupStations').doc(pointId(point.name)),
      {
        businessId: BUSINESS_ID,
        courier: COURIER,
        name: `Fargo ${point.name}`,
        // Coordinates are not in the dataset and are not read anywhere
        // in this codebase. Zero rather than a fabricated position: a
        // wrong coordinate is worse than an obviously absent one.
        latitude: 0,
        longitude: 0,
        description: point.phone ? `${point.location} · ${point.phone}` : point.location,
        county: point.county,
        town: point.town,
        zone: UPCOUNTRY_ZONE,
        shippingOrigin: SHIPPING_ORIGIN,
        packageCategory: PACKAGE_CATEGORY,
        deliveryFeeKes: ZONES[UPCOUNTRY_ZONE],
        isActive: true,
        searchTokens: searchTokens(point),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'seedFargoPickupPoints',
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    written += 1;
    if ((index + 1) % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  console.log(`pickupStations: ${written} written.`);

  // Zone rules carry the real figures. `merge: false` would clobber a
  // fee an admin had adjusted, so an existing rule is left alone.
  let created = 0;
  for (const [zone, feeKes] of Object.entries(ZONES)) {
    const ref = db.collection('deliveryZoneRules').doc(zoneRuleId(zone));
    if ((await ref.get()).exists) {
      console.log(`  zone "${zone}" already exists — left as is.`);
      continue;
    }
    await ref.set({
      businessId: BUSINESS_ID,
      zone,
      shippingOrigin: SHIPPING_ORIGIN,
      packageCategory: PACKAGE_CATEGORY,
      courier: COURIER,
      feeKes,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'seedFargoPickupPoints',
    });
    created += 1;
  }
  console.log(`deliveryZoneRules: ${created} created.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
