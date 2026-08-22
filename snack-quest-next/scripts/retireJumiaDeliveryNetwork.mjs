// Retires the Jumia pickup network in production (§ Jumia to Fargo
// migration) — the 209 stations and their six zone rules.
//
// Safe to delete rather than deactivate, but only because it verifies
// that first: it refuses to touch anything if any order references a
// Jumia station or was delivered by Jumia. Deactivating instead would
// leave 209 dead rows the admin station list still has to page through,
// for no recoverable value — the dataset they came from is in git
// history if it is ever wanted back.
//
//   node scripts/retireJumiaDeliveryNetwork.mjs            # dry run
//   node scripts/retireJumiaDeliveryNetwork.mjs --commit   # delete
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BUSINESS_ID = process.env.BUSINESS_ID ?? 'snack-quest';
const COMMIT = process.argv.includes('--commit');

initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.SA_KEY, 'utf8'))) });
const db = getFirestore();

async function main() {
  const [stations, rules, orders] = await Promise.all([
    db.collection('pickupStations').where('businessId', '==', BUSINESS_ID).where('courier', '==', 'jumia').get(),
    db.collection('deliveryZoneRules').where('businessId', '==', BUSINESS_ID).where('courier', '==', 'jumia').get(),
    db.collection('orders').where('businessId', '==', BUSINESS_ID).get(),
  ]);

  const stationIds = new Set(stations.docs.map((d) => d.id));
  const referencing = orders.docs.filter((d) => {
    const delivery = d.data()?.delivery ?? {};
    return delivery.provider === 'jumia' || (delivery.pickupStationId && stationIds.has(delivery.pickupStationId));
  });

  console.log(`Jumia pickup stations: ${stations.size}`);
  console.log(`Jumia delivery zone rules: ${rules.size}`);
  console.log(`Orders scanned: ${orders.size}`);
  console.log(`Orders referencing Jumia: ${referencing.length}`);

  if (referencing.length > 0) {
    console.error(
      '\nREFUSING TO DELETE. Orders still reference this network, and removing it would leave them\n' +
        'rendering a station that no longer exists. Deactivate rather than delete, or migrate those\n' +
        'orders first. Affected order ids:',
    );
    console.error(referencing.map((d) => d.id).join('\n'));
    process.exit(1);
  }

  if (!COMMIT) {
    console.log('\nDRY RUN. Nothing written. Re-run with --commit to delete.');
    console.log(`Would delete ${stations.size} stations and ${rules.size} zone rules.`);
    return;
  }

  let deleted = 0;
  let batch = db.batch();
  for (const [index, doc] of [...stations.docs, ...rules.docs].entries()) {
    batch.delete(doc.ref);
    deleted += 1;
    if ((index + 1) % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  console.log(`\nDeleted ${deleted} documents. Run seedFargoPickupPoints.mjs --commit next.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
