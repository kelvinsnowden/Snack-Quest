// Manual, on-demand disaster-recovery export for a single tenant's
// Firestore data (§ Disaster recovery). Writes a single JSON snapshot
// to local disk — no Cloud Storage bucket, no Blaze billing plan
// required, unlike Firestore's own scheduled backups / exports (see
// docs/DISASTER_RECOVERY.md for why those aren't available on this
// project's current Spark plan). Run before risky operations (a bulk
// migration, a provider cutover) or periodically as a cheap manual
// safety net until the business owner upgrades to Blaze and enables
// real automated backups.
//
// Deliberately excludes `integrationSecrets` (encrypted provider
// credentials) — a backup file is not an appropriate place for those,
// encrypted or not; they're recovered by re-entering them through the
// Integration Portal, same as any other tenant's first-time setup.
//
// Plain ESM, no build step: `npm run backup:export -- --businessId=snack-quest`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

/** Top-level collections that carry a `businessId` field (see firestore.rules for the full, current set). */
const TENANT_COLLECTIONS = [
  'customerProfiles',
  'staffProfiles',
  'campaigns',
  'campaignSubmissions',
  'withdrawals',
  'refunds',
  'customerWallets',
  'orders',
  'notifications',
  'auditLogs',
  'webhookEvents',
  'outboundGatewayCalls',
  'conversations',
  'packages',
  'inventoryMovements',
  'suppliers',
  'purchaseOrders',
  'inventoryBatches',
  'marketingSpendEntries',
  'conversationCheckoutSnapshots',
  'paymentIntents',
  'domainEvents',
  'scheduledJobRuns',
  'shipments',
  'referralLinks',
  'referralAttributions',
  'deliveryZoneRules',
  'creatorProfiles',
];

/** Subcollections worth carrying along with their parent — financial/audit trails that can't be reconstructed from anywhere else. */
const SUBCOLLECTIONS_BY_PARENT = {
  customerWallets: ['ledger'],
  orders: ['items'],
  conversations: ['messages'],
  paymentIntents: ['attempts'],
  creatorProfiles: ['earningsLedger'],
};

/** Recursively converts Firestore `Timestamp`/`GeoPoint`/`DocumentReference` values to plain JSON-safe values. */
function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?.path === 'string' && typeof value?.id === 'string') return value.path; // DocumentReference
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) out[key] = toPlain(v);
    return out;
  }
  return value;
}

async function dumpCollection(db, businessId, collectionName) {
  const snapshot = await db.collection(collectionName).where('businessId', '==', businessId).get();
  const docs = [];
  for (const doc of snapshot.docs) {
    const record = { id: doc.id, ...toPlain(doc.data()) };
    const subNames = SUBCOLLECTIONS_BY_PARENT[collectionName] ?? [];
    for (const subName of subNames) {
      const subSnapshot = await doc.ref.collection(subName).get();
      record[subName] = subSnapshot.docs.map((sub) => ({ id: sub.id, ...toPlain(sub.data()) }));
    }
    docs.push(record);
  }
  return docs;
}

async function main() {
  const businessId = process.argv
    .find((arg) => arg.startsWith('--businessId='))
    ?.split('=')[1];
  if (!businessId) {
    throw new Error('Usage: node scripts/exportBusinessData.mjs --businessId=<id>');
  }

  const app = createApp();
  const db = getFirestore(app);

  const businessDoc = await db.collection('businesses').doc(businessId).get();
  if (!businessDoc.exists) {
    throw new Error(`No business found with id "${businessId}".`);
  }
  const featureFlagsSnapshot = await businessDoc.ref.collection('featureFlags').get();

  const snapshot = {
    exportedAt: new Date().toISOString(),
    businessId,
    business: { id: businessDoc.id, ...toPlain(businessDoc.data()) },
    featureFlags: featureFlagsSnapshot.docs.map((doc) => ({ id: doc.id, ...toPlain(doc.data()) })),
    collections: {},
  };

  const uidsToResolve = new Set();
  for (const collectionName of TENANT_COLLECTIONS) {
    const docs = await dumpCollection(db, businessId, collectionName);
    snapshot.collections[collectionName] = docs;
    if (collectionName === 'staffProfiles' || collectionName === 'creatorProfiles') {
      for (const doc of docs) uidsToResolve.add(doc.id);
    }
    console.log(`  ${collectionName}: ${docs.length} document(s)`);
  }

  const users = [];
  for (const uid of uidsToResolve) {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) users.push({ id: userDoc.id, ...toPlain(userDoc.data()) });
  }
  snapshot.users = users;
  console.log(`  users (linked staff/creator identities): ${users.length} document(s)`);

  mkdirSync('backups', { recursive: true });
  const filePath = `backups/${businessId}-${snapshot.exportedAt.replace(/[:.]/g, '-')}.json`;
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote snapshot to ${filePath}`);
  console.log('This file contains real customer/financial data — store it somewhere encrypted, never commit it.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
