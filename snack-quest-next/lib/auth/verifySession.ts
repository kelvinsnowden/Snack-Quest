import 'server-only';

import { adminAuth } from '@/lib/firebase/admin';

/**
 * Checks a Firebase session cookie and loads the account it belongs to,
 * for every portal's session (staff, owner, creator).
 *
 * What is always checked, on every request, with no network call:
 * the cookie's signature and expiry (locally, once Google's public keys
 * are cached), and the account itself (`load`, a Firestore read that
 * refuses deleted, suspended or app-revoked accounts — see
 * `User.sessionsRevokedAt`).
 *
 * What costs a network call: asking Firebase Auth whether the session
 * was revoked or the account disabled outside this app (the Firebase
 * console, a password reset). Measured from the production region
 * (`/api/internal/latency-probe`, 2026-10-18) that call takes about
 * 350 ms — seven Firestore reads' worth — and it was paid on every page
 * and every API call. So:
 *
 * - Any request that changes something (`fresh: true`: every non-GET API
 *   call) asks Firebase Auth every time, exactly as before.
 * - A page view or read reuses Firebase Auth's "still live" answer for
 *   this session for up to `SESSION_REVOCATION_CHECK_SECONDS` (default
 *   60) on the same server instance. Set it to 0 to ask on every request.
 *
 * Revocations made through this app (disabling or removing a staff
 * member) also stamp the account in Firestore, which `load` reads on
 * every request, so they take effect immediately either way. Only a
 * change made directly in the Firebase console can take up to that
 * minute to reach a page view.
 *
 * The Firebase Auth call, when made, runs alongside `load`, so a request
 * waits for the slower of the two, not both.
 */
export interface VerifiedSession {
  uid: string;
  /** When the person signed in (the session's `auth_time`), ms since epoch. */
  authTimeMs: number;
}

const confirmedLive = new Map<string, number>();
const MAX_REMEMBERED = 5_000;

function revocationCheckTtlMs(): number {
  const seconds = Number(process.env.SESSION_REVOCATION_CHECK_SECONDS ?? 60);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

export async function verifySessionAndLoad<T>(cookie: string, load: (session: VerifiedSession) => Promise<T | null>, options: { fresh?: boolean } = {}): Promise<T | null> {
  let session: VerifiedSession;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, false);
    session = { uid: decoded.uid, authTimeMs: decoded.auth_time * 1000 };
  } catch {
    return null;
  }

  const key = `${session.uid}:${session.authTimeMs}`;
  const ttl = revocationCheckTtlMs();
  const lastConfirmed = confirmedLive.get(key);
  const mustAsk = options.fresh || ttl === 0 || lastConfirmed === undefined || Date.now() - lastConfirmed > ttl;

  const stillLive = mustAsk
    ? adminAuth.verifySessionCookie(cookie, true).then(
        () => {
          if (confirmedLive.size >= MAX_REMEMBERED) confirmedLive.clear();
          confirmedLive.set(key, Date.now());
          return true;
        },
        () => {
          confirmedLive.delete(key);
          return false;
        },
      )
    : Promise.resolve(true);
  const [live, account] = await Promise.all([stillLive, load(session)]);
  return live ? account : null;
}

/** True when this session began before the account's sessions were revoked through the app. */
export function signedInBeforeRevocation(user: { sessionsRevokedAt?: { toMillis(): number } | null }, authTimeMs: number): boolean {
  return Boolean(user.sessionsRevokedAt && authTimeMs < user.sessionsRevokedAt.toMillis());
}

/** True when the request changes something, so its session must be confirmed with Firebase Auth now. */
export function isChangingRequest(request: Request): boolean {
  return request.method !== 'GET' && request.method !== 'HEAD';
}
