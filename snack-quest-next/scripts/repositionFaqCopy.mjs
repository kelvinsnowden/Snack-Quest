/**
 * Bring the live FAQs in line with the exploring-flavours positioning
 * (§ positioning: explore, not mystery).
 *
 * FAQs are edited in Admin and live in Firestore, so the seed file is
 * only their starting point — changing it does nothing to what a
 * customer reads today. This updates the two that still describe the
 * business as a mystery box company.
 *
 * One of them is not just off-message, it is now wrong. "What's inside
 * is part of the surprise" was true before customers could choose
 * snacks themselves; on a box that offers picks they can, and an FAQ
 * that denies it contradicts the checkout.
 *
 * Matched on the current answer rather than blindly overwritten: if
 * somebody has already edited one of these by hand, that edit is more
 * current than this script and is left alone and reported.
 *
 * Run against production:
 *   FIREBASE_ADMIN_PROJECT_ID=snack-quest-os \
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   node scripts/repositionFaqCopy.mjs
 *
 * Add --dry-run to print the plan and write nothing.
 */

import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');

/** Keyed by question, since that is what identifies an FAQ to a reader. */
const REPLACEMENTS = [
  {
    question: 'What is Snack Quest?',
    expectContains: 'mystery snack box company',
    answer:
      'A Kenya-based snack discovery company. Every box is a hand-picked, personally tasted mix of imported flavours — on boxes that offer it you choose the snacks you most want and we curate the rest — ordered and paid for online, and delivered nationwide.',
  },
  {
    question: 'Can I choose only Japanese or only Korean snacks?',
    expectContains: 'mystery mix',
    answer:
      'Not as a single-country box, no. Every box except Starter Box (which is noodles only) explores all four: Japan, Korea, China, and Thailand. On boxes that offer picks you can choose specific snacks yourself and we curate the rest, but the mix always spans the four countries.',
  },
];

function boot() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp(
    keyPath
      ? { credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) }
      : { credential: applicationDefault() },
  );
  return getFirestore();
}

async function main() {
  const db = boot();
  console.log(DRY_RUN ? 'DRY RUN, nothing will be written\n' : '');

  const docs = (await db.collection('faqs').get()).docs;
  let updated = 0;
  let skipped = 0;

  for (const target of REPLACEMENTS) {
    const match = docs.find((doc) => doc.data().question === target.question);
    if (!match) {
      console.log(`  MISSING  "${target.question}"`);
      skipped += 1;
      continue;
    }
    const current = match.data().answer ?? '';
    if (!current.includes(target.expectContains)) {
      // Already repositioned, or edited by hand since. Either way the
      // stored answer is more current than this script's.
      console.log(`  SKIP     "${target.question}" — already changed`);
      skipped += 1;
      continue;
    }

    console.log(`  UPDATE   "${target.question}"`);
    if (!DRY_RUN) {
      await match.ref.update({ answer: target.answer, updatedAt: FieldValue.serverTimestamp() });
    }
    updated += 1;
  }

  console.log(`\n  updated ${updated}   skipped ${skipped}`);

  if (DRY_RUN) {
    console.log('\n  dry run: nothing was written.');
    return;
  }

  // Read back, and check the whole collection rather than only the two
  // rows touched — the point is that no live FAQ still says it.
  console.log('\n  verifying:');
  let remaining = 0;
  for (const doc of (await db.collection('faqs').get()).docs) {
    const data = doc.data();
    if (/myster/i.test(`${data.question ?? ''} ${data.answer ?? ''}`)) {
      console.log(`    FAIL  ${doc.id} still says it: "${data.question}"`);
      remaining += 1;
    }
  }
  if (remaining > 0) {
    throw new Error(`${remaining} live FAQ(s) still describe the box as a mystery`);
  }
  console.log('    PASS  no live FAQ describes Snack Quest as a mystery box.');
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
