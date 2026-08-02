// Generates and stores a real, random per-business Daraja webhook
// secret (§ Secure the Daraja and Whatchimp webhook routes,
// types/business.ts's DarajaIntegrationSecret.webhookSecret). This is
// the one honest security mechanism available for Daraja callbacks —
// Safaricom signs nothing — and it needs no manual re-registration
// with Safaricom: every CallBackURL/ResultURL/QueueTimeOutURL this
// codebase submits is constructed fresh on every API call
// (lib/integrations/daraja/config.ts), so the secret takes effect
// immediately for every future request.
//
// Plain ESM (not TypeScript) deliberately, matching every other seed
// script here — no build step, just `npm run secure:daraja-webhook`.
// Idempotent to run again (generates and stores a fresh secret, i.e.
// this doubles as a rotation tool), but NOT idempotent in output: the
// generated value is only ever printed once, right here — nowhere in
// this codebase stores or logs it again after this.
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

  const secretRef = db.collection('businesses').doc(businessId).collection('integrationSecrets').doc('daraja');
  const existing = await secretRef.get();
  if (!existing.exists) {
    throw new Error(
      `businesses/${businessId}/integrationSecrets/daraja does not exist yet — run \`npm run seed:business\` (with DARAJA_* env vars set) first.`,
    );
  }

  const webhookSecret = randomBytes(32).toString('hex');
  await secretRef.set({ webhookSecret, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  console.log(`\nGenerated and stored a new Daraja webhook secret for businesses/${businessId}.`);
  console.log('It takes effect immediately for every future Daraja API call — no manual Safaricom re-registration needed.');
  console.log('\nThis value is shown ONCE and not stored anywhere else. Save it now if you need a record of it:\n');
  console.log(`  ${webhookSecret}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
