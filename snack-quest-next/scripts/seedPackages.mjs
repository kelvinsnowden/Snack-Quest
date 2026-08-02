// Seeds the real Snack Quest boxes (PLATFORM_ARCHITECTURE_V2.md §5) so
// the Conversation Domain has real data to present, not hardcoded
// strings. Idempotent — skips if any active package already exists
// for this business. Plain ESM (not TypeScript) deliberately, so it
// runs with no build step: `npm run seed:packages`. Run
// `npm run seed:business` first — packages belong to a business.
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

const PACKAGES = [
  {
    name: 'Starter Box',
    description: 'A curated starter selection of Kenyan snacks.',
    priceKes: 2500,
    isActive: true,
    imageUrl: null,
  },
  {
    name: 'Deluxe Box',
    description: 'A bigger, more varied snack selection.',
    priceKes: 3500,
    isActive: true,
    imageUrl: null,
  },
  {
    name: 'Premium Box',
    description: 'Our top-tier snack box with premium and imported treats.',
    priceKes: 5000,
    isActive: true,
    imageUrl: null,
  },
];

async function main() {
  const app = createApp();
  const db = getFirestore(app);
  const businessId = SNACK_QUEST_BUSINESS_ID;

  const existing = await db
    .collection('packages')
    .where('businessId', '==', businessId)
    .where('isActive', '==', true)
    .get();
  if (!existing.empty) {
    console.log(
      `packages already seeded for business ${businessId} (${existing.size} active) — skipping`,
    );
    return;
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  for (const pkg of PACKAGES) {
    const ref = db.collection('packages').doc();
    batch.set(ref, {
      ...pkg,
      businessId,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      updatedBy: 'system',
      deletedAt: null,
    });
  }
  await batch.commit();
  console.log(`Seeded ${PACKAGES.length} packages for business ${businessId}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
