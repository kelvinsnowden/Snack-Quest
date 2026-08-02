// Manual, on-demand export of every Firebase Auth user (§ Disaster
// recovery) — staff and creators alike, since Auth is a single
// project-wide identity store, not partitioned per tenant the way
// Firestore data is. Complements exportBusinessData.mjs: losing
// Firestore is a data-loss disaster, losing Auth is a "nobody can log
// in, including super_admin" disaster, and they're recovered
// differently (Firestore data is restored document-by-document; Auth
// users are recreated with `auth.importUsers`, which needs each
// user's password hash — this is why we export it, not because it's
// otherwise useful).
//
// Plain ESM, no build step: `npm run backup:export-auth-users`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const isEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
if (isEmulator) {
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

async function main() {
  const app = createApp();
  const auth = getAuth(app);

  const users = [];
  let nextPageToken;
  do {
    const page = await auth.listUsers(1000, nextPageToken);
    users.push(...page.users.map((user) => user.toJSON()));
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  mkdirSync('backups', { recursive: true });
  const exportedAt = new Date().toISOString();
  const filePath = `backups/auth-users-${exportedAt.replace(/[:.]/g, '-')}.json`;
  writeFileSync(filePath, JSON.stringify({ exportedAt, users }, null, 2));

  console.log(`Exported ${users.length} Auth user(s) to ${filePath}`);
  console.log('This file contains password hashes — store it somewhere encrypted, never commit it.');
  console.log('To restore: see docs/DISASTER_RECOVERY.md — auth.importUsers() with the same hash algorithm config.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
