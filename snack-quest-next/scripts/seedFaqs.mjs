// Seeds the FAQ entries that used to live as a static list
// (previously lib/content/faqs.ts, now Admin-managed via the `faqs`
// collection — § Admin: FAQ). Idempotent — skips if any FAQ already
// exists for this business. Plain ESM (not TypeScript) deliberately,
// so it runs with no build step: `npm run seed:faqs`. Run
// `npm run seed:business` first — FAQs belong to a business.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

const FAQS = [
  {
    question: 'Do I need to download an app?',
    answer: 'No. Every order happens over WhatsApp: no app, no account, nothing to install.',
  },
  {
    question: 'How do I pay?',
    answer:
      'Once you confirm your box and delivery details, reply PAY and we send an M-Pesa STK push to your phone. Nothing is charged until you approve that prompt.',
  },
  {
    question: 'Where do you deliver?',
    answer:
      "We offer door delivery in Nairobi. Outside Nairobi, you can choose a pickup station from our courier network, we'll show you options and fees for your area during checkout.",
  },
  {
    question: 'How long does delivery take?',
    answer:
      "It depends on your delivery method and location. We'll give you an estimate on WhatsApp before you pay, and you can always ask for an update on your order afterward.",
  },
  {
    question: 'Can I change or cancel my order?',
    answer:
      "Message us on WhatsApp as soon as possible. If your order hasn't been packed yet, we can usually adjust or cancel it.",
  },
  {
    question: 'What if something arrives damaged or wrong?',
    answer:
      'Message us with a photo and your order details. We handle refunds and replacements directly, no ticket system, just a reply on the same thread.',
  },
  {
    question: 'How does the Creator Program work?',
    answer:
      'Sign up, get your own referral link, and share it. When someone orders through your link, you earn commission credited to your creator balance, which you can withdraw to M-Pesa.',
  },
];

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
