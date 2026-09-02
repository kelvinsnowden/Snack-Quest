/**
 * Give one creator a chosen referral code (§ creator code rename).
 *
 * Codes are assigned automatically at sign-up as up to six letters of
 * the display name plus four random digits — "Baby Step" becomes
 * something like BABYST4821 — because `lib/creators/referralCode.ts`
 * needs uniqueness without a Firestore uniqueness constraint to lean
 * on. A creator who is going to say their code out loud wants
 * BABYSTEP, and nothing in the system requires the digits; they are
 * only how the generator avoids collisions.
 *
 * Why a script rather than a screen: the code is read-only everywhere
 * in the app today (creator dashboard, admin creator detail), and it
 * should stay that way. Handing every admin a text box that silently
 * breaks live links is worse than a deliberate, checked, one-off.
 *
 * THE CODE LIVES IN TWO PLACES and they have to move together:
 *
 *   creatorProfiles/{uid}.referralCode  what the creator is shown
 *   referralLinks/{id}.code             what a purchase is checked
 *                                       against (ReferralService
 *                                       .validateCode reads this one)
 *
 * Change only the first and the creator reads out a code that pays
 * them nothing. Both are written in a single transaction here, so
 * there is no moment where they disagree.
 *
 * Past orders are NOT touched. `orders.referralCode` records the code
 * a customer actually typed, and rewriting history to match a new
 * spelling would falsify the record that commission was paid on.
 *
 * The old code stops working the moment this runs — there is one
 * active link per creator and its code is being replaced. Anything
 * already printed or posted with the old code will no longer
 * attribute. That is inherent in renaming a code, and it is why the
 * script says so before it writes.
 *
 * Usage:
 *   node scripts/renameCreatorReferralCode.mjs --name "baby step" --code BABYSTEP --dry-run
 *   node scripts/renameCreatorReferralCode.mjs --name "baby step" --code BABYSTEP
 *
 * `--uid <uid>` may be given instead of `--name` when two creators
 * share a display name. Credentials come from
 * GOOGLE_APPLICATION_CREDENTIALS, same as every other script here.
 *
 * Idempotent: a creator already on the target code is reported and
 * left alone, so a re-run after a partial failure is safe.
 */

import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');
const BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';
const ACTOR = 'script:renameCreatorReferralCode';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Letters only, which is the whole point of the request, and upper
 * case because `validateCode` upper-cases what the customer typed
 * before looking it up — a lower-case code in the database could
 * never match.
 */
function normalizeCode(raw) {
  const code = (raw ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3,20}$/.test(code)) {
    throw new Error(
      `--code must be 3-20 letters with no digits, spaces or punctuation. Got: ${JSON.stringify(raw)}`,
    );
  }
  return code;
}

/** "baby step", "Baby Step" and "BabyStep" are the same person. */
function loose(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Both conventions this repo's scripts use: the emulator switch from
 * `.env.local` for a rehearsal, and real credentials otherwise. Being
 * runnable against the emulator is not a nicety here — it is how the
 * refusals (name not found, code taken, no active link) get exercised
 * before this is ever pointed at production.
 */
const IS_EMULATOR = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
if (IS_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
}

function boot() {
  if (IS_EMULATOR) {
    initializeApp({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? 'demo-project' });
    return getFirestore();
  }
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp(
    keyPath
      ? { credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) }
      : { credential: applicationDefault() },
  );
  return getFirestore();
}

/** Every creator in this business, with the display name that identifies them. */
async function loadCreators(db) {
  const profiles = await db
    .collection('creatorProfiles')
    .where('businessId', '==', BUSINESS_ID)
    .get();

  return Promise.all(
    profiles.docs.map(async (doc) => {
      const user = await db.collection('users').doc(doc.id).get();
      return {
        uid: doc.id,
        referralCode: doc.data().referralCode ?? null,
        displayName: user.exists ? (user.data().displayName ?? null) : null,
      };
    }),
  );
}

function findTarget(creators, { uid, name }) {
  if (uid) {
    const match = creators.find((c) => c.uid === uid);
    if (!match) {
      throw new Error(`No creator ${uid} in business ${BUSINESS_ID}.`);
    }
    return match;
  }

  const needle = loose(name);
  const matches = creators.filter((c) => loose(c.displayName) === needle);
  if (matches.length === 0) {
    // Near misses help far more than "not found" when the name in
    // Firestore is spelled differently from the one in your head.
    const near = creators
      .filter((c) => loose(c.displayName).includes(needle) || needle.includes(loose(c.displayName)))
      .map((c) => `${c.displayName} (${c.uid})`);
    throw new Error(
      `No creator named ${JSON.stringify(name)} in business ${BUSINESS_ID}.` +
        (near.length ? `\nDid you mean: ${near.join(', ')}` : ''),
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} creators are named ${JSON.stringify(name)}. Re-run with --uid <uid>:\n` +
        matches.map((c) => `  ${c.uid}`).join('\n'),
    );
  }
  return matches[0];
}

/**
 * Nobody else may already hold this code, in either place it is
 * stored. Checked before the transaction for a clear message, and
 * again inside it so a concurrent sign-up cannot slip between.
 */
async function assertAvailable(db, code, uid) {
  const [profiles, links] = await Promise.all([
    db
      .collection('creatorProfiles')
      .where('businessId', '==', BUSINESS_ID)
      .where('referralCode', '==', code)
      .get(),
    db
      .collection('referralLinks')
      .where('businessId', '==', BUSINESS_ID)
      .where('code', '==', code)
      .get(),
  ]);

  const otherProfile = profiles.docs.find((d) => d.id !== uid);
  if (otherProfile) {
    throw new Error(`Code ${code} already belongs to creator ${otherProfile.id}.`);
  }
  const otherLink = links.docs.find((d) => d.data().ownerId !== uid);
  if (otherLink) {
    throw new Error(`Code ${code} is already on referral link ${otherLink.id}.`);
  }
}

async function main() {
  const db = boot();
  const code = normalizeCode(arg('--code'));
  const uid = arg('--uid');
  const name = arg('--name');
  if (!uid && !name) {
    throw new Error('Pass --name "<display name>" or --uid <uid>.');
  }

  console.log(`business ${BUSINESS_ID}${DRY_RUN ? '   (DRY RUN, nothing will be written)' : ''}\n`);

  const creators = await loadCreators(db);
  const target = findTarget(creators, { uid, name });
  console.log(`creator      ${target.displayName ?? '(no display name)'}  ${target.uid}`);
  console.log(`current code ${target.referralCode ?? '(none)'}`);
  console.log(`new code     ${code}`);

  const links = await db
    .collection('referralLinks')
    .where('businessId', '==', BUSINESS_ID)
    .where('ownerId', '==', target.uid)
    .where('isActive', '==', true)
    .get();

  if (links.empty) {
    throw new Error(
      `Creator ${target.uid} has no active referral link. Their code would change on the profile ` +
        `but no purchase could use it, so nothing has been written.`,
    );
  }
  console.log(`active links ${links.docs.map((d) => `${d.id} (${d.data().code})`).join(', ')}`);

  if (target.referralCode === code && links.docs.every((d) => d.data().code === code)) {
    console.log('\nAlready on this code everywhere. Nothing to do.');
    return;
  }

  await assertAvailable(db, code, target.uid);

  const oldCodes = [
    ...new Set([target.referralCode, ...links.docs.map((d) => d.data().code)].filter(Boolean)),
  ];
  console.log(`\nAfter this, ${oldCodes.join(' and ')} stop attributing. Anything already shared`);
  console.log('with the old code will no longer pay commission.');

  if (DRY_RUN) {
    console.log('\nDRY RUN — no writes made.');
    return;
  }

  await db.runTransaction(async (tx) => {
    // Re-checked inside the transaction: a sign-up between the check
    // above and this write could otherwise take the code.
    const clash = await tx.get(
      db
        .collection('referralLinks')
        .where('businessId', '==', BUSINESS_ID)
        .where('code', '==', code),
    );
    if (clash.docs.some((d) => d.data().ownerId !== target.uid)) {
      throw new Error(`Code ${code} was taken while this script was running. Nothing written.`);
    }

    const now = FieldValue.serverTimestamp();
    tx.update(db.collection('creatorProfiles').doc(target.uid), {
      referralCode: code,
      updatedAt: now,
      updatedBy: ACTOR,
    });
    for (const link of links.docs) {
      tx.update(link.ref, { code, updatedAt: now, updatedBy: ACTOR });
    }
  });

  // Read back rather than trusting the write, the same as every other
  // script here: a rename that half-applied is the one outcome worth
  // catching immediately.
  const [profileAfter, linksAfter] = await Promise.all([
    db.collection('creatorProfiles').doc(target.uid).get(),
    db
      .collection('referralLinks')
      .where('businessId', '==', BUSINESS_ID)
      .where('ownerId', '==', target.uid)
      .where('isActive', '==', true)
      .get(),
  ]);

  const profileOk = profileAfter.data()?.referralCode === code;
  const linksOk = linksAfter.docs.every((d) => d.data().code === code);
  console.log(`\nprofile  ${profileOk ? 'PASS' : 'FAIL'}  ${profileAfter.data()?.referralCode}`);
  console.log(
    `links    ${linksOk ? 'PASS' : 'FAIL'}  ${linksAfter.docs.map((d) => d.data().code).join(', ')}`,
  );
  if (!profileOk || !linksOk) {
    throw new Error('Verification failed — the two places disagree. Investigate before sharing the code.');
  }
  console.log(`\nDone. ${target.displayName ?? target.uid} now uses ${code}.`);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
