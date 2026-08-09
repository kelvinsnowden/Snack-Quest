// Seeds the FAQ entries that used to live as a static list
// (previously lib/content/faqs.ts, now Admin-managed via the `faqs`
// collection — § Admin: FAQ). Idempotent — skips if any FAQ already
// exists for this business. Plain ESM (not TypeScript) deliberately,
// so it runs with no build step: `npm run seed:faqs`. Run
// `npm run seed:business` first — FAQs belong to a business.
//
// The copy itself lives in `faqContent.mjs`, shared with
// `refreshFaqs.mjs` — this script only ever runs on an empty
// collection, so that one is what updates an installation already
// carrying the old answers.
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
  const app = createApp();
  const db = getFirestore(app);
  const businessId = SNACK_QUEST_BUSINESS_ID;

  const existing = await db.collection('faqs').where('businessId', '==', businessId).get();
  if (!existing.empty) {
    console.log(`FAQs already seeded for business ${businessId} (${existing.size} found) — skipping`);
    return;
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  for (const faq of FAQS) {
    const ref = db.collection('faqs').doc();
    batch.set(ref, {
      ...faq,
      businessId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      updatedBy: 'system',
      deletedAt: null,
    });
  }
  await batch.commit();
  console.log(`Seeded ${FAQS.length} FAQs for business ${businessId}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
