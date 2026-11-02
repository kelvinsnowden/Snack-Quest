import { defaultRateLimiter } from '@/lib/rateLimit/rateLimiter';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { partnerPortalAccessService } from '@/services/partnerPortalAccessService';
import { logger } from '@/lib/observability/logger';

/** A few links an hour per address and per email is plenty for someone who lost theirs, and too few to flood an inbox. */
const PER_IP = { name: 'owner-password-link-ip', limit: 10, windowSeconds: 60 * 60 };
const PER_EMAIL = { name: 'owner-password-link-email', limit: 3, windowSeconds: 60 * 60 };

/**
 * "First time, or forgot your password?" on the owner sign-in page: emails a
 * link to set a password if this is an owner's email. The answer is the same
 * whether it is or not, so nobody can use it to find out who is an owner.
 */
export async function POST(request: Request): Promise<Response> {
  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Enter the email address Snack Quest has for you.' }, { status: 400 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
  try {
    const decision = await defaultRateLimiter().check([
      { key: `owner-password-link:ip:${ip}`, rule: PER_IP },
      { key: `owner-password-link:email:${email}`, rule: PER_EMAIL },
    ]);
    if (!decision.allowed) {
      return Response.json({ error: 'Too many requests. Check your inbox (and spam) for the last link, or try again in an hour.' }, { status: 429 });
    }
  } catch (error) {
    logger.warn('owner password link rate limit check failed', { error: error instanceof Error ? error.message : String(error) });
  }
  try {
    await partnerPortalAccessService.requestLink(getCurrentBusinessId(), email);
  } catch (error) {
    // Logged, never shown: the answer must not depend on whether this is an owner.
    logger.error('owner password link not sent', { error: error instanceof Error ? error.message : String(error) });
  }
  return Response.json({ ok: true });
}
