// Puts the real Jumia rate card into production (§ pickup delivery
// pricing). Until this runs, every pickup station carries
// `deliveryFeeKes: 0` and every county has its own `deliveryZoneRules`
// row priced `null` — which is why every pickup order so far shipped
// with free delivery.
//
// What it does:
//
//   1. Writes six `deliveryZoneRules`, one per real Jumia zone, priced
//      with the Nairobi-origin small-package column (160/200/250/300/
//      400/450). Snack Quest ships from Nairobi and the largest box is
//      400 x 300 x 120mm, so that is the only row and column that ever
//      applies — see lib/delivery/jumiaZones.ts.
//   2. Re-zones every pickup station from its town/county onto its real
//      Jumia zone, and sets the matching fee.
//   3. Retires the old per-county rule rows, which priced nothing and
//      would otherwise sit in the admin list forever.
//
// What it deliberately does NOT do: guess. Jumia's published zone list
// names ~60 localities; this network has stations in about 90 more
// towns it says nothing about. Those stations are left with
// `zone: null` and `deliveryFeeKes: 0`, and reported at the end for a
// human to assign in Admin > Delivery zones. A zone cannot be inferred
// from distance — Gatundu is 32km from Nairobi and is Zone 5, Nakuru
// is 160km and is Zone 3, and Zones 3-6 overlap almost entirely by
// road distance. A guessed zone is a real customer charged the wrong
// amount on a real order.
//
// Idempotent: re-running re-derives the same zones and rewrites the
// same fees. Safe to run after assigning zones by hand — it only
// overwrites a station's zone when it can resolve one, so manual
// assignments survive.
//
//   npm run pricing:jumia-zones -- --dry-run
//   npm run pricing:jumia-zones
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { STATION_GEOGRAPHY } from './lib/pickupStationGeography.mjs';

const isEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
if (isEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
}

function createApp() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? 'demo-project';
  if (isEmulator) {
    return initializeApp({ projectId });
  }
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    }),
  });
}

// Mirrors lib/delivery/jumiaZones.ts — this script is plain ESM with no
// build step, so it cannot import the TypeScript module.
const ZONE_FEES = {
  'Zone 1': 160,
  'Zone 2': 200,
  'Zone 3': 250,
  'Zone 4': 300,
  'Zone 5': 400,
  'Zone 6': 450,
};

const ZONE_LOCALITIES = {
  'Zone 1': ['Nairobi'],
  'Zone 2': ['Kitengela', 'Kiambu', 'Athi River', 'Kikuyu', 'Thika', 'Kangundo', 'Tala'],
  'Zone 3': ['Limuru', 'Naivasha', 'Gilgil', 'Nakuru', 'Kisumu', 'Eldoret', 'Muranga', "Murang'a", 'Nyeri', 'Karatina', 'Embu', 'Nanyuki', 'Meru', 'Chogoria', 'Maua', 'Kajiado', 'Machakos', 'Masii', 'Kenol'],
  'Zone 4': ['Narok', 'Bomet', 'Sotik', 'Kisii', 'Homabay', 'Homa Bay', 'Oyugis', 'Migori', 'Isiolo', 'Kericho', 'Litein', 'Siaya', 'Bondo', 'Maseno', 'Kakamega'],
  'Zone 5': ['Gatundu', 'Kitale', 'Kapenguria', 'Bungoma', 'Busia', 'Malaba', 'Kehancha', 'Isebania', 'Makueni', 'Emali', 'Kibwezi', 'Loitoktok', 'Garissa'],
  'Zone 6': ['Wajir', 'Kakuma', 'Lamu', 'Lokichar', 'Lodwar', 'Maralal', 'Mpeketoni', 'Marsabit', 'Hola', 'Wundanyi'],
};

const normalize = (value) =>
  (value ?? '')
    .replace(/\(.*?\)/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const LOCALITY_TO_ZONE = new Map();
for (const [zone, localities] of Object.entries(ZONE_LOCALITIES)) {
  for (const locality of localities) {
    LOCALITY_TO_ZONE.set(normalize(locality), zone);
  }
}

function resolveZone(town, county) {
  if (normalize(county) === 'nairobi') {
    return 'Zone 1';
  }
  return LOCALITY_TO_ZONE.get(normalize(town)) ?? null;
}

const SHIPPING_ORIGIN = 'Nairobi';
const PACKAGE_CATEGORY = 'small';
const COURIER = 'jumia';
const BATCH_LIMIT = 400;

const ruleId = (zone) =>
  `${zone}:${SHIPPING_ORIGIN}:${PACKAGE_CATEGORY}:${COURIER}`.toLowerCase().replace(/\s+/g, '-');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  createApp();
  const db = getFirestore();
  const businessId = process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';

  const stationsSnap = await db.collection('pickupStations').where('businessId', '==', businessId).get();
  console.log(`${stationsSnap.size} pickup station(s) for ${businessId}.`);

  const assignments = [];
  const unresolved = new Map();

  for (const doc of stationsSnap.docs) {
    const data = doc.data();
    // Prefer the curated geography for this station name; fall back to
    // whatever town/county the document already carries.
    const geography = STATION_GEOGRAPHY[data.name] ?? {};
    const town = geography.town ?? data.town ?? null;
    const county = geography.county ?? data.county ?? null;
    const zone = resolveZone(town, county);

    if (!zone) {
      // Already assigned by a human in a previous pass — leave it alone.
      if (data.zone && ZONE_FEES[data.zone] !== undefined) {
        assignments.push({ ref: doc.ref, name: data.name, zone: data.zone, feeKes: ZONE_FEES[data.zone], manual: true });
        continue;
      }
      const key = `${town ?? '(unknown town)'} — ${county ?? '(unknown county)'}`;
      unresolved.set(key, (unresolved.get(key) ?? 0) + 1);
      continue;
    }
    assignments.push({ ref: doc.ref, name: data.name, zone, feeKes: ZONE_FEES[zone], manual: false });
  }

  const byZone = {};
  for (const a of assignments) byZone[a.zone] = (byZone[a.zone] ?? 0) + 1;

  console.log('\nResolved zones:');
  for (const zone of Object.keys(ZONE_FEES)) {
    console.log(`  ${zone}  KES ${ZONE_FEES[zone]}  ->  ${byZone[zone] ?? 0} station(s)`);
  }
  const unresolvedCount = [...unresolved.values()].reduce((a, b) => a + b, 0);
  console.log(`\n${assignments.length} station(s) priced, ${unresolvedCount} awaiting a zone.`);

  if (unresolved.size > 0) {
    console.log('\nJumia has not published a zone for these towns — assign them in Admin > Delivery zones:');
    for (const [key, count] of [...unresolved.entries()].sort()) {
      console.log(`  ${key}${count > 1 ? ` x${count}` : ''}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run — nothing written.');
    return;
  }

  // Zone rules first, so a station always points at a rule that exists.
  const ruleBatch = db.batch();
  for (const [zone, feeKes] of Object.entries(ZONE_FEES)) {
    ruleBatch.set(
      db.collection('deliveryZoneRules').doc(ruleId(zone)),
      {
        businessId,
        zone,
        shippingOrigin: SHIPPING_ORIGIN,
        packageCategory: PACKAGE_CATEGORY,
        courier: COURIER,
        feeKes,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await ruleBatch.commit();
  console.log(`\nWrote ${Object.keys(ZONE_FEES).length} zone rule(s).`);

  for (let i = 0; i < assignments.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const a of assignments.slice(i, i + BATCH_LIMIT)) {
      batch.update(a.ref, {
        zone: a.zone,
        deliveryFeeKes: a.feeKes,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'script:applyJumiaZonePricing',
      });
    }
    await batch.commit();
  }
  console.log(`Priced ${assignments.length} station(s).`);

  // The old per-county rows priced nothing and are superseded by the
  // six real zones. Removing them keeps the admin list honest.
  const staleRules = (
    await db.collection('deliveryZoneRules').where('businessId', '==', businessId).get()
  ).docs.filter((doc) => ZONE_FEES[doc.data().zone] === undefined);

  if (staleRules.length > 0) {
    for (let i = 0; i < staleRules.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const doc of staleRules.slice(i, i + BATCH_LIMIT)) batch.delete(doc.ref);
      await batch.commit();
    }
    console.log(`Removed ${staleRules.length} superseded per-county rule(s).`);
  }

  console.log('\nDone.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
