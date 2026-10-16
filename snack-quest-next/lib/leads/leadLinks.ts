import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed links that let one lead act on their own record without an
 * account — book a call, stop the emails (§ lead nurture). The token is
 * the lead id plus an HMAC of it, so a link works only for the lead it
 * was sent to and cannot be guessed for anyone else.
 *
 * `LEAD_LINK_SECRET` if set, else `CRON_SECRET` — both server-only.
 * Rotating the secret invalidates every link already emailed.
 */
const SIGNATURE_CHARS = 20;

function secret(): string | null {
  return process.env.LEAD_LINK_SECRET || process.env.CRON_SECRET || null;
}

function sign(leadId: string, key: string): string {
  return createHmac('sha256', key).update(`lead:${leadId}`).digest('base64url').slice(0, SIGNATURE_CHARS);
}

export function buildLeadToken(leadId: string): string {
  const key = secret();
  if (!key) throw new Error('LEAD_LINK_SECRET (or CRON_SECRET) must be set to email leads a booking link.');
  return `${leadId}.${sign(leadId, key)}`;
}

/** The lead id the token was issued for, or null. Never throws — this parses a public URL. */
export function verifyLeadToken(token: string): string | null {
  const key = secret();
  if (!key || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const leadId = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(leadId, key));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return leadId;
}

export function bookCallUrl(siteUrl: string, leadId: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/call/${buildLeadToken(leadId)}`;
}

export function stopEmailsUrl(siteUrl: string, leadId: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/call/${buildLeadToken(leadId)}/stop`;
}
