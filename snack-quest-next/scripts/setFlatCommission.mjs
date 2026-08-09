// Brings every existing affiliate onto the single flat commission
// rate (§ flat affiliate commission). The tiered scheme — KES 500 for
// a business's first 50 creators, KES 300 for everyone after — is
// gone; CreatorAuthService.register() now assigns CREATOR_COMMISSION_KES
// to every new creator, and this brings the already-registered ones
// into line.
//
// Writes two places, because the rate is stored in two and both are
// read: creatorProfiles.commissionRateKes (what the Creator Portal
// shows a creator they earn) and referralLinks.commissionKes (what
// ReferralService.validateCode actually freezes onto a checkout
// snapshot). Leaving either behind would mean a creator seeing one
// number and being paid another.
//
// Deliberately does NOT touch:
//
//   - conversationCheckoutSnapshots. A commission is a promise made
//     when an order was priced, and the snapshot froze it there. An
//     order already in flight pays out at the rate it was quoted at.
//   - referralAttributions or creatorEarningsLedger. Those are records
//     of commission already earned and, in some cases, already
//     withdrawn. Rewriting history to match a new rate would be
//     falsifying a ledger.
//   - discountKes. The customer-facing discount is unchanged at KES 250.
//   - campaigns.commissionRateKes. Paid content campaigns are a
//     separate program with per-campaign rates an admin sets; this is
//     the affiliate referral rate only.
//
// Idempotent: anything already at the target rate is skipped, so a
// re-run is a no-op and the printed counts stay meaningful.
//
// Dry run first, then apply:
//   npm run commission:flatten -- --dry-run
//   npm run commission:flatten
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

// Mirrors lib/creators/referralEconomics.ts — this script is plain ESM
// with no build step, so it can't import the TypeScript constant.
const CREATOR_COMMISSION_KES = 300;

const BATCH_LIMIT = 400;
const dryRun = process.argv.includes('--dry-run');

async function main() {
  createApp();
  const db = getFirestore();

  const profiles = await db.collection('creatorProfiles').get();
  const links = await db.collection('referralLinks').get();

  const staleProfiles = profiles.docs.filter((doc) => doc.data().commissionRateKes !== CREATOR_COMMISSION_KES);
  const staleLinks = links.docs.filter((doc) => doc.data().commissionKes !== CREATOR_COMMISSION_KES);

  console.log(
    `${profiles.size} creator profile(s), ${links.size} referral link(s) total.\n` +
      `${staleProfiles.length} profile(s) and ${staleLinks.length} link(s) are not yet at KES ${CREATOR_COMMISSION_KES}.`,
  );

  for (const doc of staleProfiles) {
    console.log(`  profile ${doc.id}: ${doc.data().commissionRateKes} -> ${CREATOR_COMMISSION_KES}`);
  }
  for (const doc of staleLinks) {
    console.log(`  link ${doc.id} (${doc.data().code}): ${doc.data().commissionKes} -> ${CREATOR_COMMISSION_KES}`);
  }

  if (dryRun) {
    console.log('\nDry run — nothing written.');
    return;
  }
  if (staleProfiles.length === 0 && staleLinks.length === 0) {
    console.log('\nNothing to do.');
    return;
  }

  const writes = [
    ...staleProfiles.map((doc) => ({ ref: doc.ref, patch: { commissionRateKes: CREATOR_COMMISSION_KES } })),
    ...staleLinks.map((doc) => ({ ref: doc.ref, patch: { commissionKes: CREATOR_COMMISSION_KES } })),
  ];

  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) {
      batch.update(write.ref, {
        ...write.patch,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'script:setFlatCommission',
      });
    }
    await batch.commit();
  }

  console.log(
    `\nDone. Updated ${staleProfiles.length} profile(s) and ${staleLinks.length} link(s) to KES ${CREATOR_COMMISSION_KES}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
