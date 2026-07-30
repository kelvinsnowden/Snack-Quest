import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from 'firebase/storage';

/**
 * Client SDK initialization (TDD §17 / §6). Browser-safe — only reads
 * NEXT_PUBLIC_* env vars. This is the SDK used for the deliberate,
 * rules-enforced, owner-scoped read exception described in TDD §2
 * principle 8 and §4's "Reconciling" subsection — never for writes to
 * financial or moderated fields, those go through Route Handlers /
 * Server Actions calling a Service.
 */

const isEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

function createClientApp(): FirebaseApp {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0];
  }

  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

const app = createClientApp();

export const clientAuth: Auth = getAuth(app);
export const clientFirestore: Firestore = getFirestore(app);
export const clientStorage: FirebaseStorage = getStorage(app);

// Emulator connectors are idempotent-guarded via a global flag: React
// Fast Refresh re-executes this module in dev, and calling
// connect*Emulator twice on the same instance throws.
declare global {
  var __firebaseEmulatorsConnected: boolean | undefined;
}

if (
  isEmulator &&
  typeof window !== 'undefined' &&
  !globalThis.__firebaseEmulatorsConnected
) {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', {
    disableWarnings: true,
  });
  connectFirestoreEmulator(clientFirestore, '127.0.0.1', 8080);
  connectStorageEmulator(clientStorage, '127.0.0.1', 9199);
  globalThis.__firebaseEmulatorsConnected = true;
}
