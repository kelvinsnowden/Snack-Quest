import 'server-only';

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Admin SDK initialization (TDD §17 / §6). Server-only by construction —
 * the `server-only` import throws at build time if this module is ever
 * pulled into a Client Component bundle. Import this ONLY from
 * services/, repositories/, app/api/, or proxy.ts (TDD §13 boundary).
 *
 * Firebase Storage is deliberately not initialized here (§ Vercel Blob
 * migration): Firebase is Auth + Firestore only now — file storage
 * lives entirely in Vercel Blob (`lib/integrations/vercelBlob/`,
 * `services/storageService.ts`), which needs no `storageBucket` and no
 * Firebase billing-plan upgrade to work.
 */

const isEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// The Admin SDK's Firestore/Auth clients auto-detect the emulators
// from these *_EMULATOR_HOST env vars — they must be set before the
// first getFirestore()/getAuth() call below.
if (isEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
}

function createAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0];
  }

  if (isEmulator) {
    // No real credentials needed against the emulators — a project ID
    // is enough for the Admin SDK to address the right emulator project.
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? 'demo-project';
    return initializeApp({ projectId });
  }

  return initializeApp({
    credential: cert({
      projectId: requireEnv('FIREBASE_ADMIN_PROJECT_ID'),
      clientEmail: requireEnv('FIREBASE_ADMIN_CLIENT_EMAIL'),
      // Vercel env vars store literal "\n" sequences, not real newlines.
      privateKey: requireEnv('FIREBASE_ADMIN_PRIVATE_KEY').replace(
        /\\n/g,
        '\n',
      ),
    }),
  });
}

// Lazy: app/SDK creation is deferred to first actual use, not import
// time. Route Handlers pull this module in transitively (via
// Services/Repositories), and Next.js's build-time "collect page
// data" step imports every route module to inspect its config —
// without this, that step would call requireEnv() and fail the build
// in any environment without real credentials configured, even though
// no request was ever made. A Proxy keeps every existing call site
// (`adminFirestore.collection(...)`, `adminAuth.verifyIdToken(...)`)
// unchanged; only the first property access triggers real init.
function lazy<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      instance ??= factory();
      const value = Reflect.get(instance as object, prop, receiver);
      return typeof value === 'function' ? value.bind(instance) : value;
    },
  });
}

let cachedApp: App | undefined;
function getAdminApp(): App {
  cachedApp ??= createAdminApp();
  return cachedApp;
}

export const adminAuth: Auth = lazy(() => getAuth(getAdminApp()));
export const adminFirestore: Firestore = lazy(() => getFirestore(getAdminApp()));
