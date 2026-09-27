import 'server-only';

import { integrationCredentialRepository } from '@/repositories/integrationCredentialRepository';
import {
  MAX_TIMESTAMP_SKEW_SECONDS,
  NONCE_PATTERN,
  SIGNING_HEADERS,
  canonicalRequest,
  computeSignature,
  signatureMatches,
} from './requestSigning';
import type { IntegrationCredential, IntegrationCredentialKind } from '@/types';

export type IntegrationAuthFailureCode =
  | 'missing_signature'
  | 'unknown_key'
  | 'key_revoked'
  | 'key_expired'
  | 'wrong_key_kind'
  | 'stale_timestamp'
  | 'invalid_nonce'
  | 'invalid_signature'
  | 'replayed_request';

export type IntegrationAuthResult =
  | { ok: true; credential: IntegrationCredential; nonce: string }
  | { ok: false; code: IntegrationAuthFailureCode; message: string; credential: IntegrationCredential | null };

const MESSAGES: Record<IntegrationAuthFailureCode, string> = {
  missing_signature: 'X-SQ-Key-Id, X-SQ-Timestamp, X-SQ-Nonce and X-SQ-Signature are all required',
  unknown_key: 'Unknown key id',
  key_revoked: 'This key has been revoked',
  key_expired: 'This key has expired',
  wrong_key_kind: 'This key cannot be used for this endpoint',
  stale_timestamp: `X-SQ-Timestamp must be within ${MAX_TIMESTAMP_SKEW_SECONDS} seconds of server time`,
  invalid_nonce: 'X-SQ-Nonce must be 16–64 characters of [A-Za-z0-9_-]',
  invalid_signature: 'Signature does not match the request',
  replayed_request: 'This nonce has already been used',
};

function fail(code: IntegrationAuthFailureCode, credential: IntegrationCredential | null = null): IntegrationAuthResult {
  return { ok: false, code, message: MESSAGES[code], credential };
}

/**
 * Verifies a signed manufacturer request (`lib/vending/requestSigning.ts`
 * describes the scheme). Every check that can fail cheaply runs before
 * the HMAC, and the nonce is claimed only *after* the signature
 * verifies — so someone without the secret can neither probe nor burn
 * a legitimate client's nonces.
 *
 * Authentication only: it proves which manufacturer credential signed
 * this. Which machines that credential may touch is decided by the
 * caller against the integration records (`lib/vending/v1/machineApi.ts`).
 */
export async function authenticateIntegrationRequest(
  request: Request,
  rawBody: string,
  businessId: string,
  expectedKind: IntegrationCredentialKind,
  now: Date = new Date(),
): Promise<IntegrationAuthResult> {
  const keyId = request.headers.get(SIGNING_HEADERS.keyId);
  const timestamp = request.headers.get(SIGNING_HEADERS.timestamp);
  const nonce = request.headers.get(SIGNING_HEADERS.nonce);
  const signature = request.headers.get(SIGNING_HEADERS.signature);
  if (!keyId || !timestamp || !nonce || !signature) {
    return fail('missing_signature');
  }

  const credential = await integrationCredentialRepository.findByKeyId(keyId);
  if (!credential || credential.businessId !== businessId) {
    return fail('unknown_key');
  }
  if (credential.revokedAt) {
    return fail('key_revoked', credential);
  }
  if (credential.expiresAt && credential.expiresAt.toMillis() <= now.getTime()) {
    return fail('key_expired', credential);
  }
  if (credential.kind !== expectedKind) {
    return fail('wrong_key_kind', credential);
  }
  const seconds = Number(timestamp);
  if (!/^\d{9,11}$/.test(timestamp) || Math.abs(now.getTime() / 1000 - seconds) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return fail('stale_timestamp', credential);
  }
  if (!NONCE_PATTERN.test(nonce)) {
    return fail('invalid_nonce', credential);
  }

  const url = new URL(request.url);
  const expected = computeSignature(
    integrationCredentialRepository.revealSecret(credential),
    canonicalRequest({ timestamp, nonce, method: request.method, pathWithQuery: url.pathname + url.search, body: rawBody }),
  );
  if (!signatureMatches(signature, expected)) {
    return fail('invalid_signature', credential);
  }

  const expiresAt = new Date((seconds + MAX_TIMESTAMP_SKEW_SECONDS * 2) * 1000);
  if (!(await integrationCredentialRepository.claimNonce(keyId, nonce, expiresAt))) {
    return fail('replayed_request', credential);
  }
  await integrationCredentialRepository.recordUse(keyId);
  return { ok: true, credential, nonce };
}
