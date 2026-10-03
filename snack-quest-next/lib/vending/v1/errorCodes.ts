/**
 * Every error code the Machine API v1 can return — the catalogue a
 * manufacturer branches on. `code` is stable within v1; `message` is for
 * humans and may change.
 *
 * `retry` is the client rule:
 * - `never`     — the request itself is wrong; fix it, don't repeat it.
 * - `after_fix` — something on the Snack Quest side must change first
 *                 (a key rotated, a machine activated); retrying the same
 *                 request later may succeed.
 * - `backoff`   — transient; retry the same bytes (same eventId) with a
 *                 fresh nonce, honouring Retry-After when present.
 *
 * tests/contract/machineApiContract.test.ts keeps this list, the code
 * that emits the codes, the OpenAPI document and the narrative spec in
 * agreement.
 */
export const V1_ERROR_CODES = {
  // 400/413 — the bytes
  invalid_json: { status: 400, retry: 'never', meaning: 'The body is not valid UTF-8 JSON.' },
  payload_too_large: { status: 413, retry: 'never', meaning: 'The body exceeds the size limit.' },

  // 401 — authentication
  missing_signature: { status: 401, retry: 'never', meaning: 'One of the four X-SQ-* signing headers is missing.' },
  unknown_key: { status: 401, retry: 'never', meaning: 'No credential has this key id.' },
  key_revoked: { status: 401, retry: 'after_fix', meaning: 'The key was revoked. Obtain a new one.' },
  key_expired: { status: 401, retry: 'after_fix', meaning: 'The key expired (or its rotation grace period ended). Use the new key.' },
  wrong_key_kind: { status: 401, retry: 'never', meaning: 'An API key was used for a webhook or vice versa.' },
  stale_timestamp: { status: 401, retry: 'backoff', meaning: 'X-SQ-Timestamp is outside ±300 s. details.serverTimestamp gives the server time: correct your offset and retry.' },
  invalid_nonce: { status: 401, retry: 'never', meaning: 'X-SQ-Nonce is not 16–64 characters of [A-Za-z0-9_-].' },
  invalid_signature: { status: 401, retry: 'never', meaning: 'The signature does not match. Check the canonical string against the test vectors.' },
  replayed_request: { status: 401, retry: 'never', meaning: 'This nonce was already used. Every attempt needs a fresh nonce.' },

  // 403 — authorisation
  environment_mismatch: { status: 403, retry: 'never', meaning: 'A sandbox key addressed a production machine, or vice versa.' },
  manufacturer_suspended: { status: 403, retry: 'after_fix', meaning: 'This manufacturer is suspended.' },

  // 404 — addressing
  machine_not_found: { status: 404, retry: 'never', meaning: 'No machine with this code is available to these credentials.' },
  machine_not_provisioned: { status: 404, retry: 'after_fix', meaning: 'No machine is registered for this manufacturerMachineId under these credentials.' },
  command_not_found: { status: 404, retry: 'never', meaning: 'No such command for this machine.' },
  manufacturer_not_found: { status: 404, retry: 'never', meaning: 'The webhook slug does not belong to these credentials.' },

  // 409 — state
  command_expired: { status: 409, retry: 'never', meaning: 'The command expired before it was acknowledged. DO NOT EXECUTE IT.' },
  invalid_command_state: { status: 409, retry: 'never', meaning: 'The command can no longer move to that state (e.g. already finished). DO NOT EXECUTE IT.' },
  idempotency_key_reused: { status: 409, retry: 'never', meaning: 'This eventId was already used for a different report. Event ids are per occurrence.' },

  // 422 — contract
  validation_failed: { status: 422, retry: 'never', meaning: 'The body does not match the schema; details lists each problem.' },
  dispense_events_not_accepted_here: { status: 422, retry: 'never', meaning: 'DISPENSE_* outcomes go to /commands/{commandId}/status, not /events.' },
  invalid_status_for_command: { status: 422, retry: 'never', meaning: 'That status is not valid for this kind of command.' },
  unrecognised_payload: { status: 422, retry: 'never', meaning: 'The webhook payload is not in the agreed format.' },
  webhooks_not_supported: { status: 422, retry: 'never', meaning: 'This manufacturer integration does not accept webhooks.' },

  // 429 — limits
  rate_limited: { status: 429, retry: 'backoff', meaning: 'A rate limit was exceeded. Retry after Retry-After seconds; see SQ-RateLimit-* headers.' },
  too_many_auth_failures: { status: 429, retry: 'backoff', meaning: 'Too many failed authentications from this address. Fix signing before retrying.' },

  // 5xx — Snack Quest
  internal_error: { status: 500, retry: 'backoff', meaning: 'An unexpected error. Retry with the same eventId; quote SQ-Request-Id to support.' },
  temporarily_unavailable: { status: 503, retry: 'backoff', meaning: 'A dependency is unavailable. Retry with backoff.' },
} as const satisfies Record<string, { status: number; retry: 'never' | 'after_fix' | 'backoff'; meaning: string }>;

export type V1ErrorCode = keyof typeof V1_ERROR_CODES;
