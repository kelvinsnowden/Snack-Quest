import { adminAuth } from '@/lib/firebase/admin';

/**
 * Exchanges a uid for a real Firebase ID token, entirely against the
 * local Auth emulator (never a real network call) — the same trust
 * level as every Firestore-emulator call already used throughout this
 * suite. `createCustomToken` is a real Admin SDK call; the exchange
 * itself replicates what `signInWithCustomToken` on the client SDK
 * would do, using the emulator's own REST API directly since there's
 * no browser in a vitest/node environment to run the client SDK in.
 */
export async function getIdTokenForUid(uid: string): Promise<string> {
  const customToken = await adminAuth.createCustomToken(uid);
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
  const response = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const data = (await response.json()) as { idToken?: string };
  if (!data.idToken) {
    throw new Error(`Auth emulator sign-in failed: ${JSON.stringify(data)}`);
  }
  return data.idToken;
}
