/**
 * The staff session cookie's name — split into its own module with no
 * other imports so `proxy.ts` (the cheap, Optimistic-tier check) can
 * read it without pulling in `lib/auth/session.ts`'s Firebase
 * Admin/Firestore dependency chain, which belongs only in the Secure
 * tier (Server Components/Route Handlers — see `requireStaffSession`).
 */
export const STAFF_SESSION_COOKIE = 'sq_staff_session';
