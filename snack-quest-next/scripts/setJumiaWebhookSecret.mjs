// Generates and stores a real, random per-business Jumia tracking-
// webhook secret (§ Logistics: wire tracking webhook consumption,
// types/business.ts's JumiaIntegrationSecret.webhookSecret) — same
// mechanism and same rationale as scripts/setDarajaWebhookSecret.mjs
// (see that script's own comment): Jumia signs nothing, so a secret
// this codebase generates and embeds in the webhook URL it registers
// is the one honest verification mechanism available. Unlike Daraja's
// callback URL (submitted fresh on every API call), Jumia's tracking
// webhook URL is registered once with Jumia, so after running this
// you must also update that registered URL to
// `.../api/webhooks/jumia/<businessId>?key=<the printed secret>`.
//
// Plain ESM, no build step: `npm run secure:jumia-webhook`.
import { randomBytes } from 'node:crypto';
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

const businessId = process.argv[2] ?? process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';

async function main() {
  const app = createApp();
  const db = getFirestore(app);

  const secretRef = db.collection('businesses').doc(businessId).collection('integrationSecrets').doc('jumia');
  const existing = await secretRef.get();
  if (!existing.exists) {
    throw new Error(
      `businesses/${businessId}/integrationSecrets/jumia does not exist yet — run \`npm run seed:business\` (with JUMIA_* env vars set) first.`,
    );
  }

  const webhookSecret = randomBytes(32).toString('hex');
  await secretRef.set({ webhookSecret, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  console.log(`\nGenerated and stored a new Jumia tracking-webhook secret for businesses/${businessId}.`);
  console.log(`Update the webhook URL registered with Jumia to:\n`);
  console.log(`  <host>/api/webhooks/jumia/${businessId}?key=${webhookSecret}\n`);
  console.log('This value is shown ONCE and not stored anywhere else. Save it now if you need a record of it.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
