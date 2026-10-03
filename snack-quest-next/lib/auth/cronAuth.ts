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
  return secretsMatch(authHeader, `Bearer ${expectedSecret}`);
}

/**
 * Compares a presented shared secret with the expected one in constant
 * time, so response timing never reveals how much of a guess was right.
 */
export function secretsMatch(presented: string, expected: string): boolean {
  const presentedBytes = Buffer.from(presented, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return presentedBytes.length === expectedBytes.length && timingSafeEqual(presentedBytes, expectedBytes);
}
