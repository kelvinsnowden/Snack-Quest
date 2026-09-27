import 'server-only';

import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { integrationCredentialRepository, KEY_ID_PATTERN } from '@/repositories/integrationCredentialRepository';
import { getCachedCredential, noteCredentialUse } from '@/lib/vending/credentialCache';
import { canAuthenticate, credentialStatus, shouldRecordUse } from '@/lib/vending/credentialLifecycle';
import { defaultRateLimiter, type RateLimiter } from '@/lib/rateLimit/rateLimiter';
import { authFailureRule } from '@/lib/vending/v1/rateLimits';
import { sharedKv } from '@/lib/kv/upstashRestClient';
import { logger } from '@/lib/observability/logger';
import {
  MAX_TIMESTAMP_SKEW_SECONDS,
  NONCE_PATTERN,
  SIGNING_HEADERS,
  canonicalRequest,
  computeSignature,
  signatureMatches,
} from './requestSigning';
import type { IntegrationCredential, IntegrationCredentialKind, IntegrationCredentialStatus } from '@/types';

export type IntegrationAuthFailureCode =
  | 'missing_signature'
  | 'unknown_key'
  | 'key_revoked'
  | 'key_expired'
  | 'wrong_key_kind'
  | 'stale_timestamp'
  | 'invalid_nonce'
  | 'invalid_signature'
  | 'replayed_request'
  | 'too_many_auth_failures';

export type IntegrationAuthResult =
  | { ok: true; credential: IntegrationCredential; credentialStatus: IntegrationCredentialStatus; nonce: string; timestamp: number }
  | { ok: false; code: IntegrationAuthFailureCode; status: 401 | 429; message: string; credential: IntegrationCredential | null };

const MESSAGES: Record<IntegrationAuthFailureCode, string> = {
  missing_signature: 'X-SQ-Key-Id, X-SQ-Timestamp, X-SQ-Nonce and X-SQ-Signature are all required',
  unknown_key: 'Unknown key id',
  key_revoked: 'This key has been revoked',
  key_expired: 'This key has expired',
  wrong_key_kind: 'This key cannot be used for this endpoint',
  stale_timestamp: `X-SQ-Timestamp must be unix seconds within ${MAX_TIMESTAMP_SKEW_SECONDS} seconds of server time`,
  invalid_nonce: 'X-SQ-Nonce must be 16–64 characters of [A-Za-z0-9_-]',
  invalid_signature: 'Signature does not match the request',
  replayed_request: 'This nonce has already been used',
  too_many_auth_failures: 'Too many failed authentications from this address; try again shortly',
};

export interface SignedRequestInput {
  method: string;
  /** Exactly the request-target the client sent: path plus `?query` if any. */
  pathWithQuery: string;
  headers: Headers;
  /** The raw body bytes, as received — the signature covers these, never a re-serialization. */
  rawBody: Uint8Array;
  businessId: string;
  kind: IntegrationCredentialKind;
  /** Source address, used only to count *failed* attempts. */
  ip: string | null;
  now?: Date;
}

function fail(code: IntegrationAuthFailureCode, credential: IntegrationCredential | null = null): IntegrationAuthResult {
  return { ok: false, code, status: code === 'too_many_auth_failures' ? 429 : 401, message: MESSAGES[code], credential };
}

/**
 * Verifies a signed manufacturer request (`lib/vending/requestSigning.ts`
 * describes the scheme). Proves *which credential* signed it — nothing
 * about which machines it may touch; `lib/vending/v1/machineApi.ts`
 * decides that.
 *
 * Checks run cheapest-first, and nothing touches Firestore until the
 * request has at least a well-formed key id, a fresh timestamp and a
 * valid nonce. The credential itself comes from a short-lived cache
 * (`credentialCache.ts`). The nonce is **not** claimed here: the caller
 * claims it (`claimRequestNonce`) after rate limiting, so neither a
 * forged request nor a throttled one can burn a legitimate nonce.
 *
 * Every failure is counted against the source IP; an IP over the
 * failure budget is refused before any lookup. Valid traffic is never
 * limited by IP (see `lib/vending/v1/rateLimits.ts`).
 */
export async function verifySignedRequest(input: SignedRequestInput, limiter: RateLimiter = defaultRateLimiter()): Promise<IntegrationAuthResult> {
  const now = input.now ?? new Date();
  const ipKey = input.ip ? `ip:${input.ip}:auth_failures` : null;
  if (ipKey && (await limiter.isOver(ipKey, authFailureRule(), now.getTime()))) {
    return fail('too_many_auth_failures');
  }

  const result = await verify(input, now);
  if (!result.ok && ipKey) {
    await limiter.record(ipKey, authFailureRule(), 1, now.getTime());
  }
  if (result.ok) {
    recordUseInBackground(result.credential, now);
  }
  return result;
}

async function verify(input: SignedRequestInput, now: Date): Promise<IntegrationAuthResult> {
  const keyId = input.headers.get(SIGNING_HEADERS.keyId);
  const timestamp = input.headers.get(SIGNING_HEADERS.timestamp);
  const nonce = input.headers.get(SIGNING_HEADERS.nonce);
  const signature = input.headers.get(SIGNING_HEADERS.signature);
  if (!keyId || !timestamp || !nonce || !signature) {
    return fail('missing_signature');
  }
  if (!KEY_ID_PATTERN.test(keyId)) {
    return fail('unknown_key');
  }
  const seconds = Number(timestamp);
  if (!/^\d{9,11}$/.test(timestamp) || Math.abs(now.getTime() / 1000 - seconds) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return fail('stale_timestamp');
  }
  if (!NONCE_PATTERN.test(nonce)) {
    return fail('invalid_nonce');
  }

  const credential = await getCachedCredential(keyId, (id) => integrationCredentialRepository.findByKeyId(id));
  if (!credential || credential.businessId !== input.businessId) {
    return fail('unknown_key');
  }
  const status = credentialStatus(credential, now);
  if (status === 'revoked') {
    return fail('key_revoked', credential);
  }
  if (!canAuthenticate(status)) {
    return fail('key_expired', credential);
  }
  if (credential.kind !== input.kind) {
    return fail('wrong_key_kind', credential);
  }

  const expected = computeSignature(
    integrationCredentialRepository.revealSecret(credential),
    canonicalRequest({ timestamp, nonce, method: input.method, pathWithQuery: input.pathWithQuery, body: input.rawBody }),
  );
  if (!signatureMatches(signature, expected)) {
    return fail('invalid_signature', credential);
  }
  return { ok: true, credential, credentialStatus: status, nonce, timestamp: seconds };
}

/**
 * Claims a verified request's nonce — the last step before a request is
 * acted on. Returns false for a replay. Stored until well after the
 * timestamp window closes, so a captured request can never be replayed
 * inside it.
 *
 * Firestore by default (correct across instances, one write per
 * request). `MACHINE_API_NONCE_STORE=kv` moves claims to the shared
 * Redis — the main per-request cost at fleet scale — falling back to
 * Firestore if Redis is unreachable, so replay protection never
 * silently switches off.
 */
export async function claimRequestNonce(keyId: string, nonce: string, timestampSeconds: number): Promise<boolean> {
  const expiresAt = new Date((timestampSeconds + MAX_TIMESTAMP_SKEW_SECONDS * 2) * 1000);
  const kv = process.env.MACHINE_API_NONCE_STORE === 'kv' ? sharedKv() : null;
  if (kv) {
    try {
      const id = createHash('sha256').update(`${keyId}\u0000${nonce}`).digest('hex');
      const ttlSeconds = Math.max(60, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
      const [result] = await kv.pipeline([['SET', `nonce:${id}`, '1', 'NX', 'EX', ttlSeconds]]);
      return result === 'OK';
    } catch (error) {
      logger.warn('nonce store unavailable, falling back to Firestore', { error });
    }
  }
  return integrationCredentialRepository.claimNonce(keyId, nonce, expiresAt);
}

/** `lastUsedAt` bookkeeping, throttled and off the request's critical path: a failure here must never fail the request. */
function recordUseInBackground(credential: IntegrationCredential, now: Date): void {
  if (!shouldRecordUse(credential, now)) {
    return;
  }
  const firstUse = !credential.firstUsedAt;
  noteCredentialUse(credential.keyId, Timestamp.fromDate(now));
  integrationCredentialRepository.recordUse(credential.keyId, firstUse).catch((error) => {
    logger.warn('could not record credential use', { keyId: credential.keyId, error });
  });
}
