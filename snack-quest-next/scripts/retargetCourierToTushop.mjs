// Repoints the delivery network at Tushop (§ Tushop is the sole
// partner).
//
// Snack Quest hands every parcel to Tushop. Tushop delivers inside the
// Nairobi radius themselves and uses their own Fargo partnership to
// reach everywhere else — so `courier` on both the pricing rules and
// the pickup points is Tushop, even though a customer outside the
// radius still collects from a Fargo branch. The branch names stay
// Fargo because that is the building they walk into.
//
// Seeded rules and points were written with courier 'fargo' before that
// was understood. The courier is part of the pricing key, so leaving
// them mismatched means every rate lookup misses.
//
//   node scripts/retargetCourierToTushop.mjs            # dry run
//   node scripts/retargetCourierToTushop.mjs --commit
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const BUSINESS_ID = process.env.BUSINESS_ID ?? 'snack-quest';
const COMMIT = process.argv.includes('--commit');
initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.SA_KEY, 'utf8'))) });
const db = getFirestore();

function ruleId(zone) {
  return `${zone}:Nairobi:small:tushop`.toLowerCase().replace(/\s+/g, '-').replace(/—/g, '-');
}

async function main() {
  const [rules, stations] = await Promise.all([
    db.collection('deliveryZoneRules').where('businessId', '==', BUSINESS_ID).get(),
    db.collection('pickupStations').where('businessId', '==', BUSINESS_ID).where('courier', '==', 'fargo').get(),
  ]);
  const stale = rules.docs.filter((d) => d.data().courier !== 'tushop');

  console.log(`zone rules to repoint: ${stale.length}`);
  stale.forEach((d) => console.log(`   ${d.data().zone} | ${d.data().courier} -> tushop | KES ${d.data().feeKes}`));
  console.log(`pickup points to repoint: ${stations.size}`);

  if (!COMMIT) {
    console.log('\nDRY RUN. Re-run with --commit to write.');
    return;
  }

  // The rule's document id encodes the courier, so a repointed rule is
  // a new document — written first, old one deleted after, so a lookup
  // racing this never finds nothing.
  for (const doc of stale) {
    const data = doc.data();
    await db.collection('deliveryZoneRules').doc(ruleId(data.zone)).set({
      ...data,
      courier: 'tushop',
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'retargetCourierToTushop',
    });
    await doc.ref.delete();
    console.log(`  repointed ${data.zone}`);
  }

  let batch = db.batch();
  stations.docs.forEach((d, i) => {
    batch.update(d.ref, { courier: 'tushop', updatedAt: FieldValue.serverTimestamp() });
    if ((i + 1) % 400 === 0) batch.commit().then(() => undefined);
  });
  await batch.commit();
  console.log(`  repointed ${stations.size} pickup points`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
