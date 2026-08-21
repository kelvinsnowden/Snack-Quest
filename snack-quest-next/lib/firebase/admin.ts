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
export const adminFirestore: Firestore = lazy(() => {
  const firestore = getFirestore(getAdminApp());
  /*
   * `undefined` means "absent", the same as it does in TypeScript.
   *
   * Without this, Firestore rejects any document containing an
   * undefined value, so a field declared `ttclid?: string` and assigned
   * from a cookie that is not there takes down the whole write. That is
   * not hypothetical: it is exactly how the public checkout broke for
   * every visitor who arrived without a TikTok or Facebook click
   * cookie, which is nearly all of them.
   *
   * The pattern is pervasive — one route alone has seven optional
   * fields assigned this way — so fixing call sites one at a time is
   * whack-a-mole on the payment path. This aligns Firestore's rule with
   * the type system's.
   *
   * The trade being made: a field intended as `null` but written as
   * `undefined` is now silently omitted rather than throwing. That is
   * survivable here because every repository in this codebase writes
   * `deletedAt: null` explicitly rather than leaving it undefined, and
   * because the alternative is a crash on absent optional data in the
   * one flow that takes money.
   */
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
});

/**
 * An OAuth access token for the same service account the Admin SDK
 * already authenticates as.
 *
 * The Admin SDK covers Auth and Firestore, but a few Google APIs it
 * has no wrapper for still belong to this project — notably Identity
 * Platform's project config, which is where Firebase Auth's outbound
 * email (password resets, verification) is configured. Rather than
 * ship a second credential for those, this reuses the one already in
 * the environment.
 *
 * `credential` is absent when running against the emulators, where
 * there is no real project to call — callers must handle that rather
 * than assume a token is always available.
 */
export async function getAdminAccessToken(): Promise<string> {
  const { credential } = getAdminApp().options;
  if (!credential) {
    throw new Error(
      'No Firebase service-account credential is configured, so Google APIs outside the Admin SDK cannot be called. This is expected against the emulators.',
    );
  }
  const token = await credential.getAccessToken();
  return token.access_token;
}

/** The Google Cloud project these credentials belong to — the project whose Identity Platform config the auth-email integration edits. */
export function getAdminProjectId(): string {
  const projectId = getAdminApp().options.projectId ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
  if (!projectId) {
    throw new Error('Missing required environment variable: FIREBASE_ADMIN_PROJECT_ID');
  }
  return projectId;
}
