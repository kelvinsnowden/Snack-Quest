import 'server-only';

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { authenticateIntegrationRequest } from '@/lib/vending/integrationAuth';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';
import { machineRepository } from '@/repositories/machineRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { DispenseCommandNotFoundError, IllegalDispenseCommandTransitionError } from '@/repositories/machineDispenseCommandRepository';
import { MachineCommandNotFoundError } from '@/repositories/machineCommandRepository';
import { IllegalTransactionTransitionError } from '@/repositories/machineTransactionRepository';
import type { IntegrationCredential, Machine, MachineIntegration } from '@/types';

/**
 * Shared plumbing for the Snack Quest Machine API, version 1
 * (`/api/v1/*`, docs/SNACK_QUEST_MACHINE_API_V1.md) — the stable,
 * external contract manufacturers build against.
 *
 * Every response has the same envelope, every error a stable machine-
 * readable `code`, and no response ever carries a Firestore document
 * id: machines are addressed by their Snack Quest machine code, slots
 * by the manufacturer's own slot name, commands by their public
 * reference. What's stored internally can change without this contract
 * changing.
 */

export const API_VERSION = '1';
const MAX_BODY_BYTES = 256 * 1024;

const VERSION_HEADERS = { 'SQ-API-Version': API_VERSION, 'Cache-Control': 'no-store' };

export function v1Json(data: unknown, status = 200): Response {
  return Response.json({ data, meta: { apiVersion: API_VERSION } }, { status, headers: VERSION_HEADERS });
}

export function v1Error(status: number, code: string, message: string, details?: unknown): Response {
  return Response.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) }, meta: { apiVersion: API_VERSION } },
    { status, headers: VERSION_HEADERS },
  );
}

/** Raised by a handler for a request that is well-formed JSON but breaks the contract — a 422 by default, or the given status (e.g. 409 for a state conflict). */
export class ContractViolationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) {
    super(message);
    this.name = 'ContractViolationError';
  }
}

export type MachinePrincipal =
  | { kind: 'integration'; credential: IntegrationCredential; requestId: string }
  | { kind: 'device'; credentialId: string; requestId: string };

export interface MachineApiContext {
  businessId: string;
  machine: Machine & { id: string };
  integration: MachineIntegration | null;
  principal: MachinePrincipal;
  body: unknown;
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

async function readBody(request: Request): Promise<{ raw: string; parsed: unknown } | Response> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    return v1Error(413, 'payload_too_large', `Request bodies are limited to ${MAX_BODY_BYTES} bytes`);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return v1Error(413, 'payload_too_large', `Request bodies are limited to ${MAX_BODY_BYTES} bytes`);
  }
  if (!raw) {
    return { raw, parsed: undefined };
  }
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch {
    return v1Error(400, 'invalid_json', 'Request body is not valid JSON');
  }
}

async function runHandler(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof BodyValidationError) {
      return v1Error(422, 'validation_failed', error.message, error.details);
    }
    if (error instanceof ContractViolationError) {
      return v1Error(error.status, error.code, error.message);
    }
    if (error instanceof UnrecognisedHardwarePayloadError) {
      return v1Error(422, 'unrecognised_payload', error.message);
    }
    if (error instanceof DispenseCommandNotFoundError || error instanceof MachineCommandNotFoundError) {
      return v1Error(404, 'command_not_found', 'No such command for this machine');
    }
    if (error instanceof IllegalDispenseCommandTransitionError) {
      return v1Error(409, 'invalid_command_state', `Command is ${error.from}; it cannot move to ${error.to}`);
    }
    if (error instanceof IllegalTransactionTransitionError) {
      return v1Error(409, 'invalid_command_state', error.message);
    }
    throw error;
  }
}

const NOT_FOUND = () => v1Error(404, 'machine_not_found', 'No machine with this code is available to these credentials');

/**
 * Authenticates a request addressed to one machine and hands the
 * handler everything it needs. Two ways in:
 *
 * - **Integration credential** (HMAC-signed): the manufacturer's cloud
 *   speaking for many machines. It may reach only machines whose
 *   integration names its manufacturer *and* its environment.
 * - **Device credential** (`Authorization: Bearer <id>:<secret>`): a
 *   machine's own firmware speaking for itself only.
 *
 * Every refusal to reach a machine is the same 404 — whether the
 * machine doesn't exist or belongs to someone else — so the API never
 * confirms another manufacturer's machine codes.
 */
export async function handleMachineRequest(
  request: Request,
  machineCode: string,
  handler: (context: MachineApiContext) => Promise<Response>,
): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) {
    return body;
  }
  const businessId = getCurrentBusinessId();

  let principal: MachinePrincipal;
  let machine: (Machine & { id: string }) | null = null;
  let integration: MachineIntegration | null = null;

  if (request.headers.get('authorization')?.startsWith('Bearer ')) {
    const auth = await authenticateDevice(request, businessId);
    if (!auth.ok) {
      return v1Error(401, 'unauthenticated', `Device credential rejected: ${auth.reason}`);
    }
    const found = await machineRepository.findById(businessId, auth.machineId);
    if (!found || found.machineCode !== machineCode) {
      return NOT_FOUND();
    }
    machine = { ...found, id: auth.machineId };
    integration = await machineIntegrationRepository.findByMachineId(businessId, auth.machineId);
    principal = { kind: 'device', credentialId: auth.credentialId, requestId: randomUUID() };
  } else {
    const auth = await authenticateIntegrationRequest(request, body.raw, businessId, 'api');
    if (!auth.ok) {
      await recordAuthFailureAgainstMachine(businessId, machineCode, auth.credential, auth.message);
      return v1Error(401, auth.code, auth.message);
    }
    integration = await machineIntegrationRepository.findByMachineCode(businessId, machineCode);
    if (!integration || integration.manufacturerId !== auth.credential.manufacturerId || integration.environment !== auth.credential.environment) {
      return NOT_FOUND();
    }
    const found = await machineRepository.findById(businessId, integration.machineId);
    if (!found) {
      return NOT_FOUND();
    }
    machine = { ...found, id: integration.machineId };
    principal = { kind: 'integration', credential: auth.credential, requestId: auth.nonce };
  }

  await machineIntegrationRepository.recordSignal(machine.id, 'api_request');
  return runHandler(() => handler({ businessId, machine: machine!, integration, principal, body: body.parsed }));
}

/** For endpoints not addressed to one machine yet (`/connect`, webhooks) — integration credentials only. */
export async function handleIntegrationRequest(
  request: Request,
  kind: IntegrationCredential['kind'],
  handler: (context: { businessId: string; credential: IntegrationCredential; requestId: string; body: unknown }) => Promise<Response>,
): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) {
    return body;
  }
  const businessId = getCurrentBusinessId();
  const auth = await authenticateIntegrationRequest(request, body.raw, businessId, kind);
  if (!auth.ok) {
    return v1Error(401, auth.code, auth.message);
  }
  return runHandler(() => handler({ businessId, credential: auth.credential, requestId: auth.nonce, body: body.parsed }));
}

/**
 * A signed request that failed authentication, from a known key, aimed
 * at one of that key's own manufacturer's machines, is an integration
 * health fact worth showing (expired key, clock drift, a bug in their
 * signing). Anything else — unknown keys, another manufacturer's
 * machine — is not attributed anywhere.
 */
async function recordAuthFailureAgainstMachine(businessId: string, machineCode: string, credential: IntegrationCredential | null, message: string): Promise<void> {
  if (!credential) {
    return;
  }
  const integration = await machineIntegrationRepository.findByMachineCode(businessId, machineCode);
  if (integration && integration.manufacturerId === credential.manufacturerId) {
    await machineIntegrationRepository.recordError(integration.machineId, 'authentication', message);
  }
}
