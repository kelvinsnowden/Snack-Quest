import 'server-only';

import { adminAuth } from '@/lib/firebase/admin';

/**
 * Checks a Firebase session cookie and loads the account it belongs to,
 * for every portal's session (staff, owner, creator).
 *
 * The answer is exactly what checking first and loading second gives: the
 * cookie must be validly signed and unexpired, Firebase Auth must still
 * consider the session live (not revoked, account not disabled), and the
 * account must load. The difference is time. The revocation check is a
 * network call to Firebase Auth, and the account load is a Firestore read;
 * they used to run one after the other on every page and every API call.
 * The signature is checked locally first (it needs no network once
 * Google's public keys are cached), then the two network calls run
 * together, so a request waits for the slower of them, not both.
 */
export async function verifySessionAndLoad<T>(cookie: string, load: (uid: string) => Promise<T | null>): Promise<T | null> {
  let uid: string;
  try {
    uid = (await adminAuth.verifySessionCookie(cookie, false)).uid;
  } catch {
    return null;
  }
  const [stillLive, account] = await Promise.all([
    adminAuth.verifySessionCookie(cookie, true).then(
      () => true,
      () => false,
    ),
    load(uid),
  ]);
  return stillLive ? account : null;
}
