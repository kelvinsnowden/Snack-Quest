// One-time production data migration for the creator-marketplace
// schema fix (§ Creator Marketplace migration) — copies every
// `creatorProfiles/{uid}` doc (plus its `earningsLedger` subcollection)
// to `businesses/{businessId}/creatorMemberships/{uid}`, unchanged
// field-for-field. This is the structural fix that lets one Firebase
// Auth uid hold an independent membership in more than one business;
// see the migration plan for the full cutover procedure (freeze
// financial writes via the `creator_financial_writes_frozen` feature
// flag, run this script, verify, deploy the code cutover, unfreeze).
//
// Never deletes `creatorProfiles` — that's a deliberate, separate,
// later cleanup step after a retention window, not this script's job.
//
// Idempotent by construction: deterministic doc IDs (same uid) and
// plain overwrite semantics, so it's safe to run repeatedly — a dry
// run today and the authoritative run at cutover are the exact same
// invocation.
//
// Real Firestore Timestamp values are copied verbatim (not stringified
// to ISO, unlike exportBusinessData.mjs's toPlain() — this is a live
// migration, not a JSON export).
//
// Plain ESM, no build step:
//   node scripts/migrateCreatorProfilesToBusinessNested.mjs --businessId=<id> [--verify-only]
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

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
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(
        /\\n/g,
        '\n',
      ),
    }),
  });
}

const BATCH_SIZE = 400; // stays under Firestore's 500-write batch limit even with a ledger entry alongside each profile write

function timestampsEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const aTs = typeof a.toMillis === 'function' ? a.toMillis() : null;
  const bTs = typeof b.toMillis === 'function' ? b.toMillis() : null;
  if (aTs !== null && bTs !== null) return aTs === bTs;
  return false;
}

function valuesEqual(a, b) {
  if (a instanceof Timestamp || b instanceof Timestamp)
    return timestampsEqual(a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => valuesEqual(a[key], b[key]));
  }
  return a === b;
}

function diffFields(source, dest) {
  const mismatches = [];
  for (const key of Object.keys(source)) {
    if (!valuesEqual(source[key], dest[key])) {
      mismatches.push(key);
    }
  }
  return mismatches;
}

/** Copies one creator (+ its earningsLedger) from the old flat path to the new nested path. Returns the number of documents written (profile + ledger entries). */
async function copyCreator(db, businessId, uid, sourceData) {
  const destRef = db
    .collection('businesses')
    .doc(businessId)
    .collection('creatorMemberships')
    .doc(uid);

  const ledgerSnapshot = await db
    .collection('creatorProfiles')
    .doc(uid)
    .collection('earningsLedger')
    .get();

  let batch = db.batch();
  let writesInBatch = 0;
  let totalWrites = 0;

  batch.set(destRef, sourceData);
  writesInBatch += 1;
  totalWrites += 1;

  for (const ledgerDoc of ledgerSnapshot.docs) {
    if (writesInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      writesInBatch = 0;
    }
    batch.set(
      destRef.collection('earningsLedger').doc(ledgerDoc.id),
      ledgerDoc.data(),
    );
    writesInBatch += 1;
    totalWrites += 1;
  }

  if (writesInBatch > 0) {
    await batch.commit();
  }

  return { writes: totalWrites, ledgerCount: ledgerSnapshot.size };
}

/** Verifies one creator's copy: every source field matches the destination, ledger entry counts match, and the ledger's own KES sum reconciles against lifetimeEarningsKes on both sides. */
async function verifyCreator(db, businessId, uid, sourceData) {
  const destSnap = await db
    .collection('businesses')
    .doc(businessId)
    .collection('creatorMemberships')
    .doc(uid)
    .get();

  if (!destSnap.exists) {
    return { ok: false, reason: 'destination document missing' };
  }

  const fieldMismatches = diffFields(sourceData, destSnap.data());
  if (fieldMismatches.length > 0) {
    return {
      ok: false,
      reason: `field mismatch: ${fieldMismatches.join(', ')}`,
    };
  }

  const [sourceLedgerSnap, destLedgerSnap] = await Promise.all([
    db
      .collection('creatorProfiles')
      .doc(uid)
      .collection('earningsLedger')
      .get(),
    destSnap.ref.collection('earningsLedger').get(),
  ]);

  if (sourceLedgerSnap.size !== destLedgerSnap.size) {
    return {
      ok: false,
      reason: `earningsLedger doc count mismatch (source=${sourceLedgerSnap.size}, dest=${destLedgerSnap.size})`,
    };
  }

  const sourceLedgerSum = sourceLedgerSnap.docs.reduce(
    (sum, doc) => sum + (doc.data().amountKes ?? 0),
    0,
  );
  const destLedgerSum = destLedgerSnap.docs.reduce(
    (sum, doc) => sum + (doc.data().amountKes ?? 0),
    0,
  );
  if (sourceLedgerSum !== destLedgerSum) {
    return {
      ok: false,
      reason: `earningsLedger amountKes sum mismatch (source=${sourceLedgerSum}, dest=${destLedgerSum})`,
    };
  }
  if (sourceLedgerSum !== sourceData.lifetimeEarningsKes) {
    return {
      ok: false,
      reason: `earningsLedger sum (${sourceLedgerSum}) does not reconcile against lifetimeEarningsKes (${sourceData.lifetimeEarningsKes}) — pre-existing data issue, not introduced by this migration, but must be resolved before cutover`,
    };
  }

  return { ok: true };
}

async function migrateBusiness(db, businessId, { verifyOnly }) {
  const creatorsSnap = await db
    .collection('creatorProfiles')
    .where('businessId', '==', businessId)
    .get();
  console.log(
    `\n[${businessId}] ${creatorsSnap.size} creator(s) found in creatorProfiles`,
  );

  const failures = [];
  let copied = 0;

  for (const doc of creatorsSnap.docs) {
    const uid = doc.id;
    const sourceData = doc.data();

    if (!verifyOnly) {
      const { writes, ledgerCount } = await copyCreator(
        db,
        businessId,
        uid,
        sourceData,
      );
      copied += 1;
      console.log(
        `  copied ${uid} (${writes} write(s), ${ledgerCount} ledger entr${ledgerCount === 1 ? 'y' : 'ies'})`,
      );
    }

    const result = await verifyCreator(db, businessId, uid, sourceData);
    if (result.ok) {
      console.log(`  PASS ${uid}`);
    } else {
      console.error(`  FAIL ${uid}: ${result.reason}`);
      failures.push({ uid, reason: result.reason });
    }
  }

  console.log(
    `[${businessId}] done — ${verifyOnly ? 'verified' : `copied ${copied}`}, ${creatorsSnap.size - failures.length} PASS, ${failures.length} FAIL`,
  );
  return failures;
}

async function main() {
  const args = process.argv.slice(2);
  const businessId =
    args.find((arg) => arg.startsWith('--businessId='))?.split('=')[1] ??
    process.env.SNACK_QUEST_BUSINESS_ID;
  const verifyOnly = args.includes('--verify-only');

  if (!businessId) {
    throw new Error(
      'Usage: node scripts/migrateCreatorProfilesToBusinessNested.mjs --businessId=<id> [--verify-only]',
    );
  }

  const app = createApp();
  const db = getFirestore(app);

  const businessDoc = await db.collection('businesses').doc(businessId).get();
  if (!businessDoc.exists) {
    throw new Error(`No business found with id "${businessId}".`);
  }

  console.log(
    verifyOnly
      ? 'Running in --verify-only mode (no writes).'
      : 'Copying creatorProfiles -> creatorMemberships.',
  );
  const failures = await migrateBusiness(db, businessId, { verifyOnly });

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} creator(s) FAILED verification — do not proceed with cutover:`,
    );
    for (const failure of failures) {
      console.error(`  ${failure.uid}: ${failure.reason}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    '\nAll creators verified clean. Safe to proceed with the code cutover.',
  );
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
