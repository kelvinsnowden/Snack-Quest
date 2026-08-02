// Provisions the first real staff/admin account (§ Admin auth
// foundation) — there is no self-registration into the Admin Portal
// by design (firestore.rules: staffProfiles is super_admin-write-only),
// so a super_admin has to exist before anyone can create the next one
// through a future "invite staff" admin flow. Idempotent — safe to
// re-run; updates the existing account/profile rather than erroring.
// Plain ESM, no build step: `npm run seed:staff`.
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const isEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
if (isEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
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

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const app = createApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  const businessId = process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';
  const email = requireEnv('ADMIN_SEED_EMAIL');
  const password = requireEnv('ADMIN_SEED_PASSWORD');
  const displayName = process.env.ADMIN_SEED_NAME ?? 'Snack Quest Admin';

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    await auth.updateUser(userRecord.uid, { password, displayName });
    console.log(`Auth user already existed for ${email} (${userRecord.uid}) — password/name refreshed.`);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') {
      throw error;
    }
    userRecord = await auth.createUser({ email, password, displayName });
    console.log(`Created Auth user for ${email} (${userRecord.uid}).`);
  }

  const uid = userRecord.uid;
  const roles = ['super_admin'];

  await auth.setCustomUserClaims(uid, { roles, businessId });

  const now = FieldValue.serverTimestamp();
  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        email,
        roles,
        displayName,
        photoURL: null,
        createdAt: now,
        updatedAt: now,
        createdBy: 'system',
        updatedBy: 'system',
        deletedAt: null,
      },
      { merge: true },
    );

  await db
    .collection('staffProfiles')
    .doc(uid)
    .set(
      {
        businessId,
        role: 'super_admin',
        permissions: [],
        department: 'Leadership',
        createdAt: now,
        updatedAt: now,
        createdBy: 'system',
        updatedBy: 'system',
        deletedAt: null,
      },
      { merge: true },
    );

  console.log(`Seeded super_admin staff account for ${email} on business ${businessId}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
