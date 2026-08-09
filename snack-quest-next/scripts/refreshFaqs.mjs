// Brings the live FAQ entries in line with the current customer flow
// (§ Website Becomes the Primary Commerce Channel), where an order is
// placed and paid for on the website and WhatsApp is support.
//
// The seeded answers predate that change and were actively wrong:
// they told customers to "reply PAY" on WhatsApp, which is not a thing
// they can do any more. `seedFaqs.mjs` only runs on an empty
// collection, so it cannot fix an installation that is already live —
// hence this script: `npm run faqs:refresh`.
//
// Deliberately conservative, because `faqs` is Admin-editable content
// and someone else's writing may be in there:
//
//   - UPDATES only entries whose question text matches one this script
//     knows it authored, and only when the answer has actually drifted.
//   - ADDS a new entry only when no entry with that question exists.
//   - NEVER deletes, never un-deletes, and never touches an entry it
//     doesn't recognise. An FAQ written in Admin survives untouched.
//
// Plain ESM (not TypeScript) for the same reason as the other scripts:
// it runs with no build step.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { FAQS } from './faqContent.mjs';

const SNACK_QUEST_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';

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

async function main() {
  const db = getFirestore(createApp());
  const businessId = SNACK_QUEST_BUSINESS_ID;

  const snapshot = await db.collection('faqs').where('businessId', '==', businessId).get();

  // Soft-deleted entries are matched too, so that a question an admin
  // deliberately removed is never silently resurrected as a new one.
  const existing = new Map();
  for (const doc of snapshot.docs) {
    existing.set(doc.data().question.trim().toLowerCase(), doc);
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  const added = [];
  const updated = [];
  const skipped = [];

  for (const faq of FAQS) {
    const match = existing.get(faq.question.trim().toLowerCase());

    if (!match) {
      batch.set(db.collection('faqs').doc(), {
        ...faq,
        businessId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: 'system',
        updatedBy: 'system',
        deletedAt: null,
      });
      added.push(faq.question);
      continue;
    }

    const current = match.data();
    if (current.deletedAt) {
      skipped.push(`${faq.question} (deleted in Admin)`);
      continue;
    }
    if (current.answer === faq.answer) {
      skipped.push(`${faq.question} (already current)`);
      continue;
    }
    batch.update(match.ref, { answer: faq.answer, updatedAt: now, updatedBy: 'system' });
    updated.push(faq.question);
  }

  await batch.commit();

  const untouched = snapshot.docs.filter(
    (doc) => !FAQS.some((faq) => faq.question.trim().toLowerCase() === doc.data().question.trim().toLowerCase()),
  );

  console.log(`Added ${added.length}:`);
  for (const q of added) console.log(`  + ${q}`);
  console.log(`Updated ${updated.length}:`);
  for (const q of updated) console.log(`  ~ ${q}`);
  console.log(`Skipped ${skipped.length}:`);
  for (const q of skipped) console.log(`  . ${q}`);
  console.log(`Left alone (not authored by this script) ${untouched.length}:`);
  for (const doc of untouched) console.log(`  = ${doc.data().question}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
