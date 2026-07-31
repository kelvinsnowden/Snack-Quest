// Provisions the Snack Quest tenant record and migrates its provider
// credentials from env vars into per-tenant Firestore secrets
// (types/business.ts). Snack Quest is the *first* tenant, seeded the
// same way any future business would be — this script is not special
// beyond running first. Idempotent — safe to re-run after rotating a
// credential. Plain ESM (not TypeScript) deliberately, so it runs
// with no build step: `npm run seed:business`.
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

export const SNACK_QUEST_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const app = createApp();
  const db = getFirestore(app);
  const businessId = SNACK_QUEST_BUSINESS_ID;
  const now = FieldValue.serverTimestamp();

  const businessRef = db.collection('businesses').doc(businessId);
  const existing = await businessRef.get();
  if (existing.exists) {
    console.log(`businesses/${businessId} already exists — updating secrets only`);
  } else {
    await businessRef.set({
      name: 'Snack Quest',
      currency: 'KES',
      whatsappPhoneNumberId: requireEnv('WHATCHIMP_PHONE_NUMBER_ID'),
      countyCoverage: [],
      adminWhatsappPhone: process.env.ADMIN_WHATSAPP_PHONE ?? null,
      whatsappCustomerNumber: process.env.WHATSAPP_CUSTOMER_NUMBER ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      updatedBy: 'system',
      deletedAt: null,
    });
    console.log(`Created businesses/${businessId}`);
  }

  const secretsRef = businessRef.collection('integrationSecrets');

  const secretsToWrite = [];

  if (process.env.DARAJA_CONSUMER_KEY) {
    secretsToWrite.push([
      'daraja',
      {
        consumerKey: requireEnv('DARAJA_CONSUMER_KEY'),
        consumerSecret: requireEnv('DARAJA_CONSUMER_SECRET'),
        shortcode: requireEnv('DARAJA_SHORTCODE'),
        passkey: requireEnv('DARAJA_PASSKEY'),
        callbackUrl: requireEnv('DARAJA_CALLBACK_URL'),
        env: process.env.DARAJA_ENV === 'production' ? 'production' : 'sandbox',
      },
    ]);
  }
  if (process.env.WHATCHIMP_API_KEY) {
    secretsToWrite.push([
      'whatchimp',
      {
        apiKey: requireEnv('WHATCHIMP_API_KEY'),
        phoneNumberId: requireEnv('WHATCHIMP_PHONE_NUMBER_ID'),
        ...(process.env.WHATCHIMP_BASE_URL ? { baseUrl: process.env.WHATCHIMP_BASE_URL } : {}),
        ...(process.env.WHATCHIMP_CATALOG_ID ? { catalogId: process.env.WHATCHIMP_CATALOG_ID } : {}),
      },
    ]);
  }
  if (process.env.JUMIA_API_KEY) {
    secretsToWrite.push([
      'jumia',
      {
        apiKey: requireEnv('JUMIA_API_KEY'),
        merchantId: requireEnv('JUMIA_MERCHANT_ID'),
        ...(process.env.JUMIA_BASE_URL ? { baseUrl: process.env.JUMIA_BASE_URL } : {}),
      },
    ]);
  }
  if (process.env.META_PIXEL_ID) {
    secretsToWrite.push([
      'meta',
      {
        pixelId: requireEnv('META_PIXEL_ID'),
        accessToken: requireEnv('META_ACCESS_TOKEN'),
        ...(process.env.META_API_VERSION ? { apiVersion: process.env.META_API_VERSION } : {}),
      },
    ]);
  }

  if (secretsToWrite.length === 0) {
    console.log(
      'No provider env vars set — business record created/updated, but no integration secrets to migrate. Set DARAJA_*/WHATCHIMP_*/JUMIA_*/META_* in .env.local and re-run to add them.',
    );
  }

  for (const [provider, secret] of secretsToWrite) {
    await secretsRef.doc(provider).set({ ...secret, updatedAt: now });
    console.log(`Wrote businesses/${businessId}/integrationSecrets/${provider}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
