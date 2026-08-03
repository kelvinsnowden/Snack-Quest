// One-time backfill for the referral system overhaul (§ referral
// system overhaul) — collapses every creator down to exactly one
// permanent referral link, matching what CreatorAuthService.register()
// now does automatically for new sign-ups.
//
// For every business, ranks its creators by their real registration
// order (creatorProfiles.createdAt, ascending): the first 50 are
// permanently locked into the EARLY_CREATOR_COMMISSION_KES rate on
// their profile, everyone after that into STANDARD_CREATOR_COMMISSION_KES
// — this is stored in the new creatorProfile.commissionRateKes field,
// computed from true history, not from whenever this script happens
// to run.
//
// A creator's permanent link, however, does NOT reset to the new
// fixed discount/commission: per an explicit product decision, a
// creator's existing economics carry over onto their new link (their
// most-recently-created old link's discountKes/commissionKes), so
// nobody's real payout silently changes. A creator who never created
// a link before gets the fresh defaults (KES 250 discount, their
// tier's commission). Every one of a creator's old links is
// deactivated; the new link is a fresh document (a fresh code,
// matching their existing creatorProfiles.referralCode) so any
// already-shared old codes stop working — this was an explicit
// product decision, not an oversight.
//
// Also seeds businesses/{id}/counters/creatorRegistrations with the
// business's real current creator count, so the very next real
// registration continues the count correctly instead of restarting
// at 1.
//
// Idempotent: a creator profile that already has commissionRateKes
// set is skipped — either already migrated, or created after this
// change shipped (CreatorAuthService.register() already sets it).
// Plain ESM, no build step: `npm run migrate:referral-links`.
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

const EARLY_CREATOR_LIMIT = 50;
const EARLY_CREATOR_COMMISSION_KES = 500;
const STANDARD_CREATOR_COMMISSION_KES = 300;
const REFERRAL_DISCOUNT_KES = 250;

function resolveCommissionRateKes(registrationNumber) {
  return registrationNumber <= EARLY_CREATOR_LIMIT
    ? EARLY_CREATOR_COMMISSION_KES
    : STANDARD_CREATOR_COMMISSION_KES;
}

async function migrateBusiness(db, businessId) {
  const creatorsSnap = await db
    .collection('creatorProfiles')
    .where('businessId', '==', businessId)
    .orderBy('createdAt', 'asc')
    .get();

  console.log(`\n[${businessId}] ${creatorsSnap.size} creator(s) found`);

  let migrated = 0;
  let skipped = 0;
  let registrationNumber = 0;

  for (const creatorDoc of creatorsSnap.docs) {
    registrationNumber += 1;
    const creator = creatorDoc.data();
    const uid = creatorDoc.id;

    if (typeof creator.commissionRateKes === 'number') {
      skipped += 1;
      continue;
    }

    const commissionRateKes = resolveCommissionRateKes(registrationNumber);

    // Most-recently-created existing link's economics carry over onto
    // the new permanent link — an explicit product decision to never
    // silently change what an existing creator earns, even though
    // the link itself is being replaced with a fresh one.
    const existingLinksSnap = await db
      .collection('referralLinks')
      .where('businessId', '==', businessId)
      .where('ownerId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    const mostRecentLink = existingLinksSnap.docs[0]?.data() ?? null;
    const newDiscountKes = mostRecentLink
      ? mostRecentLink.discountKes
      : REFERRAL_DISCOUNT_KES;
    const newCommissionKes = mostRecentLink
      ? mostRecentLink.commissionKes
      : commissionRateKes;

    const codeCollision = await db
      .collection('referralLinks')
      .where('businessId', '==', businessId)
      .where('code', '==', creator.referralCode)
      .limit(1)
      .get();
    if (!codeCollision.empty) {
      console.warn(
        `  ! ${uid}: a referralLinks doc already uses code "${creator.referralCode}" — skipping to avoid a collision. Investigate manually.`,
      );
      continue;
    }

    const batch = db.batch();

    for (const oldLinkDoc of existingLinksSnap.docs) {
      batch.update(oldLinkDoc.ref, {
        isActive: false,
        updatedAt: Timestamp.now(),
        updatedBy: 'migration',
      });
    }

    const newLinkRef = db.collection('referralLinks').doc();
    batch.set(newLinkRef, {
      businessId,
      code: creator.referralCode,
      ownerId: uid,
      discountKes: newDiscountKes,
      commissionKes: newCommissionKes,
      isActive: true,
      clickCount: 0,
      conversionCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'migration',
      updatedBy: 'migration',
      deletedAt: null,
    });

    batch.update(creatorDoc.ref, {
      commissionRateKes,
      updatedAt: Timestamp.now(),
      updatedBy: 'migration',
    });

    await batch.commit();
    migrated += 1;
    console.log(
      `  #${registrationNumber} ${uid}: commissionRateKes=${commissionRateKes}, new link ${newLinkRef.id} (discount=${newDiscountKes}, commission=${newCommissionKes}), deactivated ${existingLinksSnap.size} old link(s)`,
    );
  }

  const counterRef = db
    .collection('businesses')
    .doc(businessId)
    .collection('counters')
    .doc('creatorRegistrations');
  await counterRef.set({ count: creatorsSnap.size }, { merge: true });

  console.log(
    `[${businessId}] done — migrated ${migrated}, skipped ${skipped} (already migrated), counter seeded to ${creatorsSnap.size}`,
  );
}

async function main() {
  const app = createApp();
  const db = getFirestore(app);

  const targetBusinessId = process.env.SNACK_QUEST_BUSINESS_ID;
  const businessIds = targetBusinessId
    ? [targetBusinessId]
    : (await db.collection('businesses').get()).docs.map((doc) => doc.id);

  if (businessIds.length === 0) {
    console.log('No businesses found — nothing to migrate.');
    return;
  }

  for (const businessId of businessIds) {
    await migrateBusiness(db, businessId);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
