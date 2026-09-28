import 'server-only';

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { claimRequestNonce, verifySignedRequest } from '@/lib/vending/integrationAuth';
import { scopeOf } from '@/lib/vending/credentialLifecycle';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';
import { defaultRateLimiter, type RateLimitCheck, type RateLimitDecision } from '@/lib/rateLimit/rateLimiter';
import { logger, type Logger } from '@/lib/observability/logger';
import { authFailureRule, clientErrorRule, credentialRule, machineRule, manufacturerRule, webhookRule, type MachineEndpointClass } from '@/lib/vending/v1/rateLimits';
import { machineRepository } from '@/repositories/machineRepository';
import { manufacturerRepository } from '@/repositories/manufacturerRepository';
import { getCachedManufacturerStatus } from '@/lib/vending/credentialCache';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { DispenseCommandNotFoundError, IllegalDispenseCommandTransitionError } from '@/repositories/machineDispenseCommandRepository';
import { MachineCommandNotFoundError } from '@/repositories/machineCommandRepository';
import { IllegalTransactionTransitionError } from '@/repositories/machineTransactionRepository';
import { IdempotencyKeyReusedError } from '@/services/machineTransactionService';
import type { IntegrationCredential, IntegrationCredentialStatus, Machine, MachineIntegration } from '@/types';

/**
 * Shared plumbing for the Snack Quest Machine API, version 1
 * (`/api/v1/*`, docs/SNACK_QUEST_MACHINE_API_V1.md) — the stable,
 * external contract manufacturers build against.
 *
 * Every request goes through the same pipeline, in this order, and the
 * order is the security design:
 *
 *   1. read the raw body (size-capped) — bytes, not a decoded string;
 *   2. verify the HMAC signature over those bytes (cheap checks first,
 *      credential from a short cache; failures counted per IP), then
 *      refuse a suspended manufacturer;
 *   3. resolve which machine it addresses, and whether this credential
 *      may reach it (manufacturer, environment, machine scope);
 *   4. claim the nonce (replay protection) — only after the signature is
 *      verified, so nobody without the secret can burn a nonce, and
 *      atomically, so two copies of one request can't both pass;
 *   5. charge rate limits — only now, so neither forged nor replayed
 *      requests can spend a real machine's budget (a throttled request
 *      has spent its nonce; every retry is re-signed anyway);
 *   6. parse JSON and run the handler.
 *
 * Every response — success, refusal, crash — has the same envelope, a
 * stable machine-readable `code` on errors, and an `SQ-Request-Id` that
 * appears in our logs, so any single request can be traced from the
 * manufacturer's side to ours. No response carries a Firestore document
 * id.
 */

export const API_VERSION = '1';
const MAX_BODY_BYTES = 256 * 1024;
const SIGNAL_WRITE_INTERVAL_MS = 30_000;

interface ResponseMeta {
  requestId: string;
  rateLimit?: RateLimitDecision | null;
  credentialStatus?: IntegrationCredentialStatus;
  credential?: IntegrationCredential | null;
  clientRequestId?: string | null;
}

function headersFor(meta: ResponseMeta | null): Record<string, string> {
  const headers: Record<string, string> = { 'SQ-API-Version': API_VERSION, 'Cache-Control': 'no-store' };
  if (!meta) {
    return headers;
  }
  headers['SQ-Request-Id'] = meta.requestId;
  if (meta.clientRequestId) {
    headers['SQ-Client-Request-Id'] = meta.clientRequestId;
  }
  if (meta.rateLimit) {
    headers['SQ-RateLimit-Policy'] = meta.rateLimit.rule.name;
    headers['SQ-RateLimit-Limit'] = String(meta.rateLimit.rule.limit);
    headers['SQ-RateLimit-Remaining'] = String(meta.rateLimit.remaining);
    headers['SQ-RateLimit-Reset'] = String(meta.rateLimit.resetSeconds);
  }
  if (meta.credentialStatus === 'rotating' && meta.credential?.graceEndsAt) {
    // Tells a client still on the old key, on every response, that it has been replaced and when it stops working.
    headers['SQ-Credential-Status'] = 'rotating';
    headers['SQ-Credential-Grace-Ends'] = meta.credential.graceEndsAt.toDate().toISOString();
  }
  return headers;
}

export function v1Json(data: unknown, status = 200, meta: ResponseMeta | null = null): Response {
  return Response.json({ data, meta: { apiVersion: API_VERSION, ...(meta ? { requestId: meta.requestId } : {}) } }, { status, headers: headersFor(meta) });
}

export function v1Error(status: number, code: string, message: string, details?: unknown, meta: ResponseMeta | null = null, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) }, meta: { apiVersion: API_VERSION, ...(meta ? { requestId: meta.requestId } : {}) } },
    { status, headers: { ...headersFor(meta), ...extraHeaders } },
  );
}

/** Raised by a handler for a request that is well-formed JSON but breaks the contract — a 422 by default, or the given status (e.g. 409 for a state conflict). */
export class ContractViolationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422, readonly details?: unknown) {
    super(message);
    this.name = 'ContractViolationError';
  }
}

/** A handler charging an extra budget (e.g. per event in a batch) and finding it exhausted. */
export class RateLimitedError extends Error {
  constructor(readonly decision: RateLimitDecision) {
    super(`Rate limit ${decision.rule.name} exceeded`);
    this.name = 'RateLimitedError';
  }
}

export interface MachineApiContext {
  businessId: string;
  machine: Machine & { id: string };
  integration: MachineIntegration;
  credential: IntegrationCredential;
  requestId: string;
  body: unknown;
  log: Logger;
  /** Charges an additional per-machine budget; throws `RateLimitedError` when exhausted. */
  charge(endpoint: MachineEndpointClass, cost: number): Promise<void>;
}

/** Validates a body against a zod schema; a failure becomes a 422 listing every problem at once. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    throw new BodyValidationError(details);
  }
  return result.data;
}

class BodyValidationError extends Error {
  constructor(readonly details: { path: string; message: string }[]) {
    super('Request body does not match the schema');
    this.name = 'BodyValidationError';
  }
}

class InvalidJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJsonError';
  }
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim() || null;
  }
  return request.headers.get('x-real-ip');
}

function clientRequestId(request: Request): string | null {
  const value = request.headers.get('x-sq-client-request-id');
  return value && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) ? value : null;
}

async function readRawBody(request: Request): Promise<Uint8Array | { status: number; code: string; message: string }> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    return { status: 413, code: 'payload_too_large', message: `Request bodies are limited to ${MAX_BODY_BYTES} bytes` };
  }
  // Read incrementally and stop at the limit: a body sent without a
  // Content-Length (chunked) is never buffered past MAX_BODY_BYTES.
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { status: 413, code: 'payload_too_large', message: `Request bodies are limited to ${MAX_BODY_BYTES} bytes` };
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // Content-Type is deliberately not enforced: the body is always parsed
  // as JSON and the signature covers its exact bytes, so a client whose
  // HTTP stack sends text/plain loses nothing and gains nothing.
  return bytes;
}

function parseJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0) {
    return undefined;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new InvalidJsonError('Request body is not valid UTF-8');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidJsonError('Request body is not valid JSON');
  }
}

/** Firestore gRPC codes that mean "try again": ABORTED (contention), DEADLINE_EXCEEDED, UNAVAILABLE, RESOURCE_EXHAUSTED. */
function isRetryableDatastoreError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 10 || code === 4 || code === 14 || code === 8;
}

function rateLimitedResponse(decision: RateLimitDecision, meta: ResponseMeta): Response {
  return v1Error(
    429,
    'rate_limited',
    `Rate limit "${decision.rule.name}" exceeded (${decision.rule.limit} per ${decision.rule.windowSeconds}s). Retry after ${decision.resetSeconds}s.`,
    { policy: decision.rule.name, limit: decision.rule.limit, windowSeconds: decision.rule.windowSeconds },
    { ...meta, rateLimit: decision },
    { 'Retry-After': String(decision.resetSeconds) },
  );
}

/**
 * Maps a thrown error to its response. Anything not recognised is a 500
 * `internal_error` — still in the envelope, still carrying the request
 * id, and logged with the stack so the request id finds it.
 */
async function runHandler(handler: () => Promise<Response>, meta: ResponseMeta, log: Logger, onClientError: () => Promise<void>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof InvalidJsonError) {
      await onClientError();
      return v1Error(400, 'invalid_json', error.message, undefined, meta);
    }
    if (error instanceof BodyValidationError) {
      await onClientError();
      return v1Error(422, 'validation_failed', error.message, error.details, meta);
    }
    if (error instanceof RateLimitedError) {
      return rateLimitedResponse(error.decision, meta);
    }
    if (error instanceof ContractViolationError) {
      if (error.status === 422) {
        await onClientError();
      }
      return v1Error(error.status, error.code, error.message, error.details, meta);
    }
    if (error instanceof UnrecognisedHardwarePayloadError) {
      await onClientError();
      return v1Error(422, 'unrecognised_payload', error.message, undefined, meta);
    }
    if (error instanceof IdempotencyKeyReusedError) {
      await onClientError();
      return v1Error(409, 'idempotency_key_reused', `${error.message}. Use a new eventId for a different report.`, undefined, meta);
    }
    if (error instanceof DispenseCommandNotFoundError || error instanceof MachineCommandNotFoundError) {
      return v1Error(404, 'command_not_found', 'No such command for this machine', undefined, meta);
    }
    if (error instanceof IllegalDispenseCommandTransitionError) {
      return v1Error(409, 'invalid_command_state', `Command is ${error.from}; it cannot move to ${error.to}`, { currentStatus: error.from }, meta);
    }
    if (error instanceof IllegalTransactionTransitionError) {
      return v1Error(409, 'invalid_command_state', error.message, undefined, meta);
    }
    if (isRetryableDatastoreError(error)) {
      log.warn('v1 request hit a retryable datastore error', { error });
      return v1Error(503, 'temporarily_unavailable', 'Temporarily unavailable — retry with the same eventId', undefined, meta, { 'Retry-After': '2' });
    }
    log.error('v1 request failed', { error, stack: error instanceof Error ? error.stack : undefined });
    return v1Error(500, 'internal_error', 'Internal error — retry with the same eventId; quote the request id if it persists', undefined, meta);
  }
}

interface AuthenticatedRequest {
  businessId: string;
  requestId: string;
  meta: ResponseMeta;
  log: Logger;
  credential: IntegrationCredential;
  credentialStatus: IntegrationCredentialStatus;
  nonce: string;
  timestamp: number;
  rawBody: Uint8Array;
  ip: string | null;
}

async function authenticate(
  request: Request,
  kind: IntegrationCredential['kind'],
  route: string,
): Promise<{ ok: true; auth: AuthenticatedRequest } | { ok: false; response: Response; credential: IntegrationCredential | null; code?: string }> {
  const requestId = randomUUID();
  const clientId = clientRequestId(request);
  const url = new URL(request.url);
  const log = logger.child({ component: 'machine-api-v1', requestId, clientRequestId: clientId, route, method: request.method });
  const meta: ResponseMeta = { requestId, clientRequestId: clientId };

  const raw = await readRawBody(request);
  if (!(raw instanceof Uint8Array)) {
    log.info('v1 request refused', { status: raw.status, code: raw.code });
    // An oversized body is refused before authentication; it still costs the sender.
    const ip = clientIp(request);
    if (ip) {
      await defaultRateLimiter().record(`ip:${ip}:auth_failures`, authFailureRule());
    }
    return { ok: false, response: v1Error(raw.status, raw.code, raw.message, undefined, meta), credential: null };
  }
  const businessId = getCurrentBusinessId();
  const result = await verifySignedRequest({
    method: request.method,
    pathWithQuery: url.pathname + url.search,
    headers: request.headers,
    rawBody: raw,
    businessId,
    kind,
    ip: clientIp(request),
  });
  if (!result.ok) {
    log.info('v1 authentication failed', { status: result.status, code: result.code, keyId: request.headers.get('x-sq-key-id') });
    const extra: Record<string, string> = result.status === 429 ? { 'Retry-After': '60' } : {};
    // A drifted clock is the commonest way a healthy machine goes silent.
    // Say what time it is, so a client can correct its offset and retry
    // instead of failing until someone visits the machine.
    const details = result.code === 'stale_timestamp' ? { serverTime: new Date().toISOString(), serverTimestamp: Math.floor(Date.now() / 1000) } : undefined;
    return { ok: false, response: v1Error(result.status, result.code, result.message, details, meta, extra), credential: result.credential, code: result.code };
  }
  // A suspended manufacturer's keys stop working everywhere at once —
  // not just for new dispenses. Cached with the credential (≤ 30 s).
  const manufacturerStatus = await getCachedManufacturerStatus(result.credential.manufacturerId, async (manufacturerId) => (await manufacturerRepository.findById(businessId, manufacturerId))?.status ?? null);
  if (manufacturerStatus !== 'active') {
    log.warn('v1 request from a suspended or unknown manufacturer refused', { keyId: result.credential.keyId, manufacturerId: result.credential.manufacturerId });
    return { ok: false, response: v1Error(403, 'manufacturer_suspended', 'This manufacturer is suspended', undefined, meta), credential: null };
  }
  const authed: ResponseMeta = { ...meta, credential: result.credential, credentialStatus: result.credentialStatus };
  return {
    ok: true,
    auth: {
      businessId,
      requestId,
      meta: authed,
      log: log.child({ keyId: result.credential.keyId, manufacturerId: result.credential.manufacturerId, environment: result.credential.environment }),
      credential: result.credential,
      credentialStatus: result.credentialStatus,
      nonce: result.nonce,
      timestamp: result.timestamp,
      rawBody: raw,
      ip: clientIp(request),
    },
  };
}

async function finishRequest(auth: AuthenticatedRequest, checks: RateLimitCheck[], clientErrorKey: string | null, run: (onClientError: () => Promise<void>) => Promise<Response>): Promise<Response> {
  const limiter = defaultRateLimiter();
  // The nonce is claimed before any budget is charged: a replayed request
  // must not spend the victim machine's allowance. The replay is charged
  // to the replaying address instead. (A legitimate request refused by a
  // limit below loses its nonce — harmless: every retry is re-signed.)
  if (!(await claimRequestNonce(auth.credential.keyId, auth.nonce, auth.timestamp))) {
    auth.log.warn('v1 replayed request refused');
    if (auth.ip) {
      await limiter.record(`ip:${auth.ip}:auth_failures`, authFailureRule());
    }
    return v1Error(401, 'replayed_request', 'This nonce has already been used', undefined, auth.meta);
  }
  if (clientErrorKey && (await limiter.isOver(clientErrorKey, clientErrorRule()))) {
    const decision: RateLimitDecision = { allowed: false, rule: clientErrorRule(), remaining: 0, resetSeconds: 60 };
    auth.log.warn('v1 request refused: too many invalid requests', { policy: decision.rule.name });
    return rateLimitedResponse(decision, auth.meta);
  }
  const decision = await limiter.check(checks);
  auth.meta.rateLimit = decision;
  if (!decision.allowed) {
    auth.log.warn('v1 request rate limited', { policy: decision.rule.name, limit: decision.rule.limit });
    return rateLimitedResponse(decision, auth.meta);
  }
  const onClientError = async () => {
    if (clientErrorKey) {
      await limiter.record(clientErrorKey, clientErrorRule());
    }
  };
  const startedAt = Date.now();
  const response = await runHandler(() => run(onClientError), auth.meta, auth.log, onClientError);
  auth.log.info('v1 request', { status: response.status, durationMs: Date.now() - startedAt });
  return response;
}

/**
 * Authenticates a request addressed to one machine and hands the
 * handler everything it needs. The credential may reach only machines
 * whose integration names its manufacturer *and* its environment — and,
 * for a machine-scoped key, only that one machine. Every refusal to
 * reach a machine is the same 404, so the API never confirms another
 * manufacturer's machine codes. (The one exception: your *own* machine
 * addressed with the wrong environment's key gets a 403 that says so —
 * that tells you nothing you don't already own.)
 */
export async function handleMachineRequest(
  request: Request,
  machineCode: string,
  endpoint: MachineEndpointClass,
  handler: (context: MachineApiContext) => Promise<Response>,
): Promise<Response> {
  const authenticated = await authenticate(request, 'api', endpoint);
  if (!authenticated.ok) {
    if (authenticated.credential) {
      await recordAuthFailureAgainstMachine(authenticated.credential, machineCode, authenticated.code);
    }
    return authenticated.response;
  }
  const auth = authenticated.auth;
  const log = auth.log.child({ machineCode });
  const notFound = () => v1Error(404, 'machine_not_found', 'No machine with this code is available to these credentials', undefined, auth.meta);

  const integration = await machineIntegrationRepository.findByMachineCode(auth.businessId, machineCode);
  if (!integration || integration.manufacturerId !== auth.credential.manufacturerId) {
    return notFound();
  }
  const scope = scopeOf(auth.credential);
  if (scope.type === 'machine' && scope.machineId !== integration.machineId) {
    return notFound();
  }
  if (integration.environment !== auth.credential.environment) {
    return v1Error(
      403,
      'environment_mismatch',
      `This is a ${integration.environment} machine; this request was signed with a ${auth.credential.environment} key`,
      undefined,
      auth.meta,
    );
  }
  const machine = await machineRepository.findById(auth.businessId, integration.machineId);
  if (!machine) {
    return notFound();
  }

  const machineKey = `m:${integration.machineId}`;
  const checks: RateLimitCheck[] = [
    { key: `${machineKey}:${endpoint}`, rule: machineRule(endpoint) },
    { key: `k:${auth.credential.keyId}`, rule: credentialRule(auth.credential.rateLimitPerMinute) },
    { key: `mf:${auth.credential.manufacturerId}`, rule: manufacturerRule() },
  ];
  const limiter = defaultRateLimiter();
  return finishRequest(auth, checks, `${machineKey}:client_errors`, async () => {
    const body = parseJson(auth.rawBody);
    await recordSignalIfStale(integration, 'api_request');
    return handler({
      businessId: auth.businessId,
      machine: { ...machine, id: integration.machineId },
      integration,
      credential: auth.credential,
      requestId: auth.requestId,
      body,
      log,
      charge: async (extra, cost) => {
        const decision = await limiter.check([{ key: `${machineKey}:${extra}`, rule: machineRule(extra), cost }]);
        if (!decision.allowed) {
          throw new RateLimitedError(decision);
        }
      },
    }).then((response) => withMeta(response, auth.meta));
  });
}

/** For endpoints not addressed to one machine yet (`/connect`, webhooks). */
export async function handleIntegrationRequest(
  request: Request,
  kind: IntegrationCredential['kind'],
  endpoint: 'connect' | 'webhook',
  handler: (context: { businessId: string; credential: IntegrationCredential; requestId: string; body: unknown; log: Logger }) => Promise<Response>,
): Promise<Response> {
  const authenticated = await authenticate(request, kind, endpoint);
  if (!authenticated.ok) {
    return authenticated.response;
  }
  const auth = authenticated.auth;
  const checks: RateLimitCheck[] =
    endpoint === 'webhook'
      ? [
          { key: `k:${auth.credential.keyId}:webhooks`, rule: webhookRule(auth.credential.rateLimitPerMinute) },
          { key: `mf:${auth.credential.manufacturerId}`, rule: manufacturerRule() },
        ]
      : [
          { key: `k:${auth.credential.keyId}`, rule: credentialRule(auth.credential.rateLimitPerMinute) },
          { key: `mf:${auth.credential.manufacturerId}`, rule: manufacturerRule() },
          { key: `k:${auth.credential.keyId}:connect`, rule: { ...machineRule('connect'), limit: Math.max(machineRule('connect').limit, 600) } },
        ];
  return finishRequest(auth, checks, `k:${auth.credential.keyId}:client_errors`, async () => {
    const body = parseJson(auth.rawBody);
    return handler({ businessId: auth.businessId, credential: auth.credential, requestId: auth.requestId, body, log: auth.log }).then((response) => withMeta(response, auth.meta));
  });
}

/** Handlers build their responses with `v1Json`; this adds the request's own headers (request id, rate limit, rotation notice). */
function withMeta(response: Response, meta: ResponseMeta): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(headersFor(meta))) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
  return new Response(response.body, { status: response.status, headers });
}

/** Handlers should build JSON with this, so the request id is in the body too. */
export function v1Ok(context: { requestId: string }, data: unknown, status = 200): Response {
  return v1Json(data, status, { requestId: context.requestId });
}

async function recordSignalIfStale(integration: MachineIntegration, kind: 'api_request'): Promise<void> {
  const last = integration.signals?.[kind];
  if (last && Date.now() - last.toMillis() < SIGNAL_WRITE_INTERVAL_MS) {
    return;
  }
  await machineIntegrationRepository.recordSignal(integration.machineId, kind);
}

/**
 * A signed request that failed authentication, from a known key, aimed
 * at one of that key's own manufacturer's machines, is an integration
 * health fact worth showing (expired key, clock drift, a bug in their
 * signing). Anything else — unknown keys, another manufacturer's
 * machine — is not attributed anywhere. At most one write a minute per
 * machine, so a flood can't turn this into write amplification.
 */
async function recordAuthFailureAgainstMachine(credential: IntegrationCredential, machineCode: string, reason = 'authentication_failed'): Promise<void> {
  try {
    const integration = await machineIntegrationRepository.findByMachineCode(credential.businessId, machineCode);
    if (!integration || credential.manufacturerId !== integration.manufacturerId) {
      return;
    }
    const last = integration.lastError;
    if (last?.kind === 'authentication' && last.at && Date.now() - last.at.toMillis() < 60_000) {
      return;
    }
    await machineIntegrationRepository.recordError(integration.machineId, 'authentication', `${reason} for key ${credential.keyId}`);
  } catch (error) {
    logger.warn('could not attribute auth failure to machine', { machineCode, error });
  }
}
