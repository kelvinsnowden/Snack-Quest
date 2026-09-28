import type { IntegrationErrorKind } from '@/types';

/**
 * The integration layer's error taxonomy. Every failure between Snack
 * Quest and a machine is classified into one of these codes, and the
 * code — never the message — decides what happens next. The single
 * question that matters for a dispense is **could the machine have
 * acted on it?** (`delivered`), because that is the difference between
 * "refund now" and "a human must check before anyone refunds or
 * retries".
 *
 * Categories:
 * - `transport` — the network between us and them.
 * - `auth` — credentials were refused.
 * - `protocol` — we reached them and could not understand each other.
 * - `machine` — the machine answered, and the answer is a hardware fact.
 * - `business` — a Snack Quest rule refused it before hardware was involved.
 * - `unknown` — the outcome genuinely cannot be determined.
 */
export type IntegrationFailureCode =
  | 'transport.timeout'
  | 'transport.dns'
  | 'transport.connection_refused'
  | 'transport.tls'
  | 'transport.connection_reset'
  | 'transport.network'
  | 'transport.http_5xx'
  | 'transport.rate_limited'
  | 'transport.redirect'
  | 'auth.invalid_credentials'
  | 'auth.expired_credentials'
  | 'auth.invalid_signature'
  | 'auth.forbidden'
  | 'protocol.malformed_response'
  | 'protocol.conflict'
  | 'protocol.unsupported_capability'
  | 'protocol.invalid_command'
  | 'protocol.not_configured'
  | 'protocol.unknown_machine'
  | 'machine.offline'
  | 'machine.busy'
  | 'machine.jam'
  | 'machine.motor_failure'
  | 'machine.slot_empty'
  | 'machine.door_open'
  | 'machine.temperature_fault'
  | 'machine.sensor_failure'
  | 'business.insufficient_stock'
  | 'business.product_unavailable'
  | 'business.command_expired'
  | 'business.integration_inactive'
  | 'unknown.outcome_undetermined';

export interface RecoveryPolicy {
  /** Could the machine have acted? `no` is proof it didn't; `maybe` forbids both automatic retry and automatic refund. */
  delivered: 'no' | 'maybe';
  /** Safe to repeat the same request automatically (only reads, or keyed writes that provably never arrived). */
  retrySafe: boolean;
  /** For a paid dispense: safe to send the customer down the refund path without a human. */
  refundSafe: boolean;
  /** Worth an operator's attention even once (vs. only when it recurs). */
  operatorAttention: boolean;
  /** How integration health counts it. */
  healthKind: IntegrationErrorKind;
}

const NOT_DELIVERED = (healthKind: IntegrationErrorKind, operatorAttention = false, retrySafe = true): RecoveryPolicy => ({
  delivered: 'no',
  retrySafe,
  refundSafe: true,
  operatorAttention,
  healthKind,
});
const MAYBE_DELIVERED = (healthKind: IntegrationErrorKind): RecoveryPolicy => ({
  delivered: 'maybe',
  retrySafe: false,
  refundSafe: false,
  operatorAttention: true,
  healthKind,
});

export const RECOVERY_POLICY: Record<IntegrationFailureCode, RecoveryPolicy> = {
  // A timeout, reset or 5xx on a write means the request may have been acted on.
  'transport.timeout': MAYBE_DELIVERED('timeout'),
  'transport.connection_reset': MAYBE_DELIVERED('timeout'),
  'transport.http_5xx': MAYBE_DELIVERED('timeout'),
  // 408/429 mean "not processed" by HTTP's own rules — but on a write we
  // don't take the manufacturer's word for it: after the keyed retries
  // run out, the vend goes to status lookup like any other unknown,
  // which costs a delay and never costs a wrong refund.
  'transport.rate_limited': MAYBE_DELIVERED('timeout'),
  'transport.redirect': MAYBE_DELIVERED('protocol'),
  // These fail before a single request byte reaches the other side.
  'transport.dns': NOT_DELIVERED('connection', true),
  'transport.connection_refused': NOT_DELIVERED('connection'),
  'transport.tls': NOT_DELIVERED('connection', true, false),
  'transport.network': NOT_DELIVERED('connection'),
  // Refused at the door — nothing was executed.
  'auth.invalid_credentials': NOT_DELIVERED('authentication', true, false),
  'auth.expired_credentials': NOT_DELIVERED('authentication', true, false),
  'auth.invalid_signature': NOT_DELIVERED('authentication', true, false),
  'auth.forbidden': NOT_DELIVERED('authentication', true, false),
  // A response we can't parse still means the request arrived — and may have been acted on.
  'protocol.malformed_response': MAYBE_DELIVERED('protocol'),
  // A conflict on our own idempotency key means a vend under it may already exist.
  'protocol.conflict': MAYBE_DELIVERED('protocol'),
  'protocol.unsupported_capability': NOT_DELIVERED('protocol', true, false),
  'protocol.invalid_command': NOT_DELIVERED('protocol', true, false),
  'protocol.not_configured': NOT_DELIVERED('protocol', true, false),
  'protocol.unknown_machine': NOT_DELIVERED('protocol', true, false),
  // The machine answered with a definite refusal.
  'machine.offline': NOT_DELIVERED('connection', false, false),
  'machine.busy': NOT_DELIVERED('connection', false, false),
  'machine.jam': NOT_DELIVERED('protocol', true, false),
  'machine.motor_failure': NOT_DELIVERED('protocol', true, false),
  'machine.slot_empty': NOT_DELIVERED('protocol', false, false),
  'machine.door_open': NOT_DELIVERED('protocol', true, false),
  'machine.temperature_fault': NOT_DELIVERED('protocol', true, false),
  'machine.sensor_failure': NOT_DELIVERED('protocol', true, false),
  'business.insufficient_stock': NOT_DELIVERED('protocol', false, false),
  'business.product_unavailable': NOT_DELIVERED('protocol', false, false),
  'business.command_expired': NOT_DELIVERED('timeout', false, false),
  'business.integration_inactive': NOT_DELIVERED('protocol', false, false),
  'unknown.outcome_undetermined': MAYBE_DELIVERED('protocol'),
};

/** Node/undici network error codes → taxonomy. TLS failures happen during the handshake, before the request is sent. */
const NETWORK_CODES: Record<string, IntegrationFailureCode> = {
  ENOTFOUND: 'transport.dns',
  EAI_AGAIN: 'transport.dns',
  ECONNREFUSED: 'transport.connection_refused',
  EHOSTUNREACH: 'transport.network',
  ENETUNREACH: 'transport.network',
  ECONNRESET: 'transport.connection_reset',
  EPIPE: 'transport.connection_reset',
  UND_ERR_SOCKET: 'transport.connection_reset',
  ETIMEDOUT: 'transport.timeout',
  UND_ERR_CONNECT_TIMEOUT: 'transport.network',
  UND_ERR_HEADERS_TIMEOUT: 'transport.timeout',
  UND_ERR_BODY_TIMEOUT: 'transport.timeout',
  CERT_HAS_EXPIRED: 'transport.tls',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'transport.tls',
  SELF_SIGNED_CERT_IN_CHAIN: 'transport.tls',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'transport.tls',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'transport.tls',
  ERR_TLS_CERT_ALTNAME_INVALID: 'transport.tls',
  ERR_SSL_WRONG_VERSION_NUMBER: 'transport.tls',
};

/** Unwraps `error.cause.code` (undici) or `error.code` (node:net) and maps it. Anything unrecognised is a reset — "it may have arrived". */
export function classifyNetworkError(error: unknown): IntegrationFailureCode {
  const cause = (error as { cause?: { code?: unknown } })?.cause;
  const code = typeof cause?.code === 'string' ? cause.code : typeof (error as { code?: unknown })?.code === 'string' ? ((error as { code: string }).code) : null;
  if (code && code in NETWORK_CODES) {
    return NETWORK_CODES[code];
  }
  if (code && /CERT|TLS|SSL/.test(code)) {
    return 'transport.tls';
  }
  return 'transport.connection_reset';
}

export function recoveryFor(code: IntegrationFailureCode): RecoveryPolicy {
  return RECOVERY_POLICY[code];
}

export function failureCategory(code: IntegrationFailureCode): 'transport' | 'auth' | 'protocol' | 'machine' | 'business' | 'unknown' {
  return code.split('.')[0] as ReturnType<typeof failureCategory>;
}
