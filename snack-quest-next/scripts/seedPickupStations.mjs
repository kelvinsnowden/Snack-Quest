// Imports the complete, official Jumia pickup station dataset
// (data/jumiaPickupStations.raw.json — 209 stations, unmodified,
// unfiltered, unsummarized) into Firestore, scoped to a business, so
// every station is selectable during checkout. Idempotent per-station
// (deterministic doc IDs derived from the source record itself), so
// re-running this script after the raw file is updated adds new
// stations and updates existing ones without ever duplicating or
// dropping one. Plain ESM (not TypeScript) deliberately, so it runs
// with no build step: `npm run seed:pickup-stations`.
//
// Also seeds `deliveryZoneRules` — one row per distinct computed zone
// — but every fee is seeded as `null` ("not yet configured"), never a
// fabricated KES number. This codebase has no real Jumia small-package
// rate card; see PLATFORM_ARCHITECTURE_V2.md and this script's own
// summary output for what to do about that.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STATION_GEOGRAPHY, deriveGeography } from './lib/pickupStationGeography.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNACK_QUEST_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';
const SHIPPING_ORIGIN = 'Nairobi';
const PACKAGE_CATEGORY = 'small';
const COURIER = 'jumia';

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

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Deterministic doc ID from the source record itself — stable across re-imports, disambiguates the two identically-named "G4S Lodwar Station" entries by coordinate. */
function stationDocId(businessId, record) {
  const namePart = slugify(record.station_name);
  const latPart = record.latitude.toFixed(6).replace(/[.-]/g, (m) => (m === '-' ? 'n' : '_'));
  const lonPart = record.longitude.toFixed(6).replace(/[.-]/g, (m) => (m === '-' ? 'n' : '_'));
  return `${businessId}--${namePart}--${latPart}-${lonPart}`;
}

function deliveryZoneRuleId(zone, shippingOrigin, packageCategory, courier) {
  return `${zone}:${shippingOrigin}:${packageCategory}:${courier}`.toLowerCase().replace(/\s+/g, '-');
}

function buildSearchTokens(record, geography) {
  const tokens = new Set();
  for (const raw of [record.station_name, geography.town, geography.county]) {
    if (!raw) continue;
    for (const word of raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      tokens.add(word);
    }
  }
  return [...tokens];
}

async function main() {
  const app = createApp();
  const db = getFirestore(app);
  const businessId = SNACK_QUEST_BUSINESS_ID;

  const rawPath = join(__dirname, '..', 'data', 'jumiaPickupStations.raw.json');
  const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
  console.log(`Loaded ${raw.length} stations from ${rawPath}`);

  const now = FieldValue.serverTimestamp();
  const zonesSeen = new Set();
  const unmappedStations = [];

  // Firestore batches cap at 500 writes; 209 stations comfortably fits
  // in one, but chunk anyway so this keeps working as the source file grows.
  const BATCH_LIMIT = 400;
  let batch = db.batch();
  let opsInBatch = 0;
  let created = 0;
  let updated = 0;

  async function flushIfNeeded() {
    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  for (const record of raw) {
    const geography = deriveGeography(record.station_name);
    if (!geography.county) {
      unmappedStations.push(record.station_name);
    } else {
      zonesSeen.add(geography.county);
    }

    const docId = stationDocId(businessId, record);
    const ref = db.collection('pickupStations').doc(docId);
    const existing = await ref.get();

    const data = {
      businessId,
      courier: COURIER,
      name: record.station_name,
      latitude: record.latitude,
      longitude: record.longitude,
      description: record.description,
      county: geography.county,
      town: geography.town,
      zone: geography.county, // zone == county today; see types/pickupStation.ts
      shippingOrigin: SHIPPING_ORIGIN,
      packageCategory: PACKAGE_CATEGORY,
      deliveryFeeKes: 0, // placeholder — see deliveryZoneRules below, never fabricated
      isActive: true,
      searchTokens: buildSearchTokens(record, geography),
      updatedAt: now,
      updatedBy: 'system',
    };

    if (existing.exists) {
      batch.set(ref, data, { merge: true });
      updated++;
    } else {
      batch.set(ref, {
        ...data,
        createdAt: now,
        createdBy: 'system',
        deletedAt: null,
      });
      created++;
    }
    opsInBatch++;
    await flushIfNeeded();
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }
  console.log(`pickupStations: ${created} created, ${updated} updated (${raw.length} total in source).`);

  // Seed deliveryZoneRules for every distinct zone this dataset
  // produced — idempotent, never overwrites a fee an admin already set.
  let zoneRulesCreated = 0;
  for (const zone of zonesSeen) {
    const ruleRef = db
      .collection('deliveryZoneRules')
      .doc(deliveryZoneRuleId(zone, SHIPPING_ORIGIN, PACKAGE_CATEGORY, COURIER));
    const existing = await ruleRef.get();
    if (existing.exists) continue;
    await ruleRef.set({
      businessId,
      zone,
      shippingOrigin: SHIPPING_ORIGIN,
      packageCategory: PACKAGE_CATEGORY,
      courier: COURIER,
      feeKes: null,
      createdAt: now,
      updatedAt: now,
    });
    zoneRulesCreated++;
  }
  console.log(
    `deliveryZoneRules: ${zoneRulesCreated} new zone(s) seeded with feeKes: null (${zonesSeen.size} distinct zones total).`,
  );

  console.log('\n--- IMPORTANT ---');
  console.log(
    `${unmappedStations.length} station(s) have no confidently-derivable county/town and were imported with county: null, town: null, zone: null (still fully importable and selectable, just not filterable by county/town search):`,
  );
  for (const name of unmappedStations) console.log(`  - ${name}`);
  console.log(
    '\nEvery deliveryZoneRules.feeKes is null — this codebase has no real Jumia small-package',
    '\nrate card. Delivery is free (KES 0) until real per-zone fees are entered via',
    '\ndeliveryZoneRuleRepository.setFee(businessId, zone, shippingOrigin, packageCategory, courier, feeKes).',
  );
  console.log(`\nCovered by scripts/lib/pickupStationGeography.mjs: ${Object.keys(STATION_GEOGRAPHY).length} station names.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
