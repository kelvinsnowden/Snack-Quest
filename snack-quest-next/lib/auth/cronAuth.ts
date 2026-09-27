import { timingSafeEqual } from 'node:crypto';

/**
 * `Authorization: Bearer ${CRON_SECRET}` — how Vercel Cron (and any
 * external scheduler given the secret) authenticates to `/api/cron/*`.
 * Compared in constant time; an unset secret refuses everything.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!expectedSecret || !authHeader) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${expectedSecret}`, 'utf8');
  const presented = Buffer.from(authHeader, 'utf8');
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
