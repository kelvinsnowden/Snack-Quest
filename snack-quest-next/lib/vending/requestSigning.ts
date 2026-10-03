import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The Snack Quest request-signing scheme, version 1 — used by every
 * manufacturer-originated request: Machine API calls and webhook
 * deliveries alike (docs/SNACK_QUEST_MACHINE_API_V1.md §3).
 *
 *   X-SQ-Key-Id:    sqk_live_…            (which credential)
 *   X-SQ-Timestamp: 1790000000            (unix seconds)
 *   X-SQ-Nonce:     16–64 chars [A-Za-z0-9_-], unique per request
 *   X-SQ-Signature: v1=<hex HMAC-SHA256(secret, canonical)>
 *
 *   canonical = "v1\n" + timestamp + "\n" + nonce + "\n" + METHOD + "\n"
 *             + path_with_query + "\n" + hex(SHA-256(raw body bytes))
 *
 * Signing the method, path and body hash binds the signature to exactly
 * one request; the timestamp bounds how long a captured request is
 * worth anything; the nonce makes it single-use even inside that window.
 *
 * Pure and dependency-free (no Firestore, no `server-only`) so the
 * simulator, the tests and a manufacturer's own reference code can all
 * sign with exactly the function the server verifies against.
 */

export const SIGNATURE_VERSION = 'v1';
export const MAX_TIMESTAMP_SKEW_SECONDS = 300;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const SIGNING_HEADERS = {
  keyId: 'x-sq-key-id',
  timestamp: 'x-sq-timestamp',
  nonce: 'x-sq-nonce',
  signature: 'x-sq-signature',
} as const;

/** SHA-256 of the body **bytes**. A string is encoded as UTF-8 first; the server always hashes the raw bytes it received, never a re-serialization. */
export function sha256Hex(body: string | Uint8Array): string {
  return typeof body === 'string' ? createHash('sha256').update(body, 'utf8').digest('hex') : createHash('sha256').update(body).digest('hex');
}

export function canonicalRequest(parts: { timestamp: string; nonce: string; method: string; pathWithQuery: string; body: string | Uint8Array }): string {
  return [SIGNATURE_VERSION, parts.timestamp, parts.nonce, parts.method.toUpperCase(), parts.pathWithQuery, sha256Hex(parts.body)].join('\n');
}

export function computeSignature(secret: string, canonical: string): string {
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of a presented `v1=<hex>` header against the
 * expected hex digest. Hex case is not significant (some HMAC libraries
 * emit uppercase); anything that isn't exactly 64 hex digits is refused
 * before comparing.
 */
export function signatureMatches(presentedHeader: string, expectedHex: string): boolean {
  const prefix = `${SIGNATURE_VERSION}=`;
  if (!presentedHeader.startsWith(prefix)) {
    return false;
  }
  const presentedHex = presentedHeader.slice(prefix.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(presentedHex)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(presentedHex, 'utf8'), Buffer.from(expectedHex.toLowerCase(), 'utf8'));
}

/** Builds the four signing headers for a request — what a manufacturer's client does before every call. */
export function signRequest(input: {
  keyId: string;
  secret: string;
  method: string;
  pathWithQuery: string;
  body: string | Uint8Array;
  timestamp?: number;
  nonce?: string;
}): Record<string, string> {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? randomBytes(16).toString('base64url');
  const signature = computeSignature(input.secret, canonicalRequest({ timestamp, nonce, method: input.method, pathWithQuery: input.pathWithQuery, body: input.body }));
  return {
    [SIGNING_HEADERS.keyId]: input.keyId,
    [SIGNING_HEADERS.timestamp]: timestamp,
    [SIGNING_HEADERS.nonce]: nonce,
    [SIGNING_HEADERS.signature]: `${SIGNATURE_VERSION}=${signature}`,
  };
}
