/**
 * Runs once when a new server instance starts (Next.js instrumentation).
 * Starts warming Firestore and Firebase Auth without waiting for it, so a
 * cold server's first visitor doesn't also pay for setting them up — see
 * `lib/observability/warmUp.ts`. Awaiting it here would hold the server
 * back from taking that first request instead.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  void import('./lib/observability/warmUp').then(({ warmUp }) => warmUp());
}
