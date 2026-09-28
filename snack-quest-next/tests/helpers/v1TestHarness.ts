import { adminFirestore } from '@/lib/firebase/admin';
import { signRequest } from '@/lib/vending/requestSigning';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { MachineSlotService } from '@/services/machineSlotService';
import { machineService } from '@/services/machineService';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { defaultVendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import type { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import type { MachineIntegrationEnvironment } from '@/types';
import { POST as connectRoute } from '@/app/api/v1/machines/connect/route';
import { GET as describeRoute } from '@/app/api/v1/machines/[machineCode]/route';
import { POST as heartbeatRoute } from '@/app/api/v1/machines/[machineCode]/heartbeat/route';
import { POST as statusRoute } from '@/app/api/v1/machines/[machineCode]/status/route';
import { POST as inventoryRoute } from '@/app/api/v1/machines/[machineCode]/inventory/route';
import { POST as eventsRoute } from '@/app/api/v1/machines/[machineCode]/events/route';
import { GET as commandsRoute } from '@/app/api/v1/machines/[machineCode]/commands/route';
import { POST as ackRoute } from '@/app/api/v1/machines/[machineCode]/commands/[commandId]/ack/route';
import { POST as commandStatusRoute } from '@/app/api/v1/machines/[machineCode]/commands/[commandId]/status/route';
import { POST as webhookRoute } from '@/app/api/v1/webhooks/manufacturers/[slug]/route';
import { provisionMachine } from './integrationFixtures';

/**
 * A signed-request harness over the real v1 route handlers — the same
 * code path a manufacturer's HTTP client reaches, minus the network.
 * Used by the hardening and "horrible day" suites.
 */

export const mockHardware = defaultVendingAdapterResolver('mock') as MockVendingAdapter;

export interface Key {
  keyId: string;
  secret: string;
}

export interface V1Machine {
  machineId: string;
  machineCode: string;
  manufacturerMachineId: string;
}

export async function onboardManufacturer(businessId: string, slug: string, options: { adapterKey?: 'mock' | 'snack_quest_gateway' } = {}) {
  const inbound = options.adapterKey === 'snack_quest_gateway';
  const manufacturerId = await manufacturerRegistryService.createManufacturer(
    businessId,
    { name: slug, slug, integrationType: inbound ? 'snack_quest_api' : 'hybrid', defaultAdapterKey: options.adapterKey ?? 'mock' },
    'staff-1',
  );
  await manufacturerRegistryService.moveToStage(businessId, manufacturerId, 'technical_review', 'staff-1');
  await manufacturerRegistryService.moveToStage(businessId, manufacturerId, 'credentials', 'staff-1');
  const modelId = await manufacturerRegistryService.createModel(
    businessId,
    { manufacturerId, name: `${slug}-M1`, slug: 'm1', declaredCapabilities: ['vend', 'dispense_confirmation', 'inventory_read', 'heartbeat', 'telemetry', 'faults', 'door_status', 'temperature'] },
    'staff-1',
  );
  return { manufacturerId, modelId };
}

/** A registered, active machine with one stocked slot (A01 ↔ the manufacturer's `spiral_01`). */
export async function activeMachine(
  businessId: string,
  ids: { manufacturerId: string; modelId: string },
  options: { manufacturerMachineId?: string; environment?: MachineIntegrationEnvironment; quantity?: number; priceKes?: number; adapterKey?: string } = {},
): Promise<V1Machine> {
  const { machineId, machineCode } = await provisionMachine(businessId, options.adapterKey ?? 'mock');
  // Installed and commissioned, as a machine taking real sales would be.
  for (const status of ['installing', 'testing', 'active'] as const) {
    await machineService.updateStatus(businessId, machineId, status, 'staff-1');
  }
  const quantity = options.quantity ?? 5;
  mockHardware.seedSlot(machineId, 'A01', { quantity });
  const slots = new MachineSlotService(() => mockHardware);
  await slots.configureSlot({ businessId, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: options.priceKes ?? 250, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  await slots.setSlotMappings(businessId, machineId, [{ slotCode: 'A01', manufacturerSlotId: 'spiral_01' }]);
  const manufacturerMachineId = options.manufacturerMachineId ?? `MFR-${machineCode}`;
  await machineIntegrationService.configure(
    businessId,
    { machineId, manufacturerId: ids.manufacturerId, modelId: ids.modelId, manufacturerMachineId, environment: options.environment ?? 'sandbox' },
    'staff-1',
  );
  await machineIntegrationRepository.setState(businessId, machineId, 'active', 'staff-1');
  return { machineId, machineCode, manufacturerMachineId };
}

export async function apiKey(businessId: string, manufacturerId: string, options: { machineId?: string; environment?: MachineIntegrationEnvironment; kind?: 'api' | 'webhook' } = {}): Promise<Key> {
  return integrationCredentialService.issue(
    businessId,
    manufacturerId,
    { kind: options.kind ?? 'api', environment: options.environment ?? 'sandbox', label: 'test', machineId: options.machineId },
    'staff-1',
  );
}

export interface SignOptions {
  method?: 'GET' | 'POST';
  nonce?: string;
  timestamp?: number;
  ip?: string;
  /** Send these exact bytes instead of JSON.stringify(body). */
  rawBody?: string | Uint8Array;
  headers?: Record<string, string>;
}

let ipCounter = 0;

export function signed(key: Key, path: string, body?: unknown, options: SignOptions = {}): Request {
  const method = options.method ?? (body === undefined ? 'GET' : 'POST');
  const raw = options.rawBody ?? (body === undefined ? '' : JSON.stringify(body));
  const headers = signRequest({ keyId: key.keyId, secret: key.secret, method, pathWithQuery: path, body: raw, nonce: options.nonce, timestamp: options.timestamp });
  ipCounter += 1;
  return new Request(`http://localhost${path}`, {
    method,
    headers: { ...headers, 'content-type': 'application/json', 'x-forwarded-for': options.ip ?? `10.0.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}`, ...options.headers },
    body: method === 'GET' ? undefined : (raw as BodyInit),
  });
}

export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  headers: Headers;
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
  requestId: string | null;
}

async function toResult<T>(response: Response): Promise<ApiResult<T>> {
  const json = (await response.json()) as { data?: T; error?: ApiResult['error']; meta?: { requestId?: string } };
  return { status: response.status, headers: response.headers, data: (json.data ?? {}) as T, error: json.error ?? null, requestId: json.meta?.requestId ?? null };
}

const machine = (code: string) => ({ params: Promise.resolve({ machineCode: code }) });
const command = (code: string, commandId: string) => ({ params: Promise.resolve({ machineCode: code, commandId }) });

/** One method per v1 endpoint, each returning status + parsed envelope. */
export function v1(key: Key, machineCode: string, defaults: SignOptions = {}) {
  const base = `/api/v1/machines/${machineCode}`;
  return {
    connect: async (body: unknown, o: SignOptions = {}) => toResult(await connectRoute(signed(key, '/api/v1/machines/connect', body, { ...defaults, ...o }))),
    describe: async (o: SignOptions = {}) => toResult(await describeRoute(signed(key, base, undefined, { ...defaults, ...o }), machine(machineCode))),
    heartbeat: async (body: unknown, o: SignOptions = {}) => toResult(await heartbeatRoute(signed(key, `${base}/heartbeat`, body, { ...defaults, ...o }), machine(machineCode))),
    status: async (body: unknown, o: SignOptions = {}) => toResult(await statusRoute(signed(key, `${base}/status`, body, { ...defaults, ...o }), machine(machineCode))),
    inventory: async (body: unknown, o: SignOptions = {}) => toResult(await inventoryRoute(signed(key, `${base}/inventory`, body, { ...defaults, ...o }), machine(machineCode))),
    events: async (body: unknown, o: SignOptions = {}) => toResult(await eventsRoute(signed(key, `${base}/events`, body, { ...defaults, ...o }), machine(machineCode))),
    commands: async (o: SignOptions = {}) =>
      toResult<{ commands: { commandId: string; type: string; slotId?: string; expiresAt: string }[]; reportOutcomes?: { commandId: string }[]; nextPollSeconds?: number; serverTime?: string }>(
        await commandsRoute(signed(key, `${base}/commands`, undefined, { ...defaults, ...o }), machine(machineCode)),
      ),
    ack: async (commandId: string, o: SignOptions = {}) =>
      toResult(await ackRoute(signed(key, `${base}/commands/${commandId}/ack`, undefined, { method: 'POST', rawBody: '', ...defaults, ...o }), command(machineCode, commandId))),
    report: async (commandId: string, body: unknown, o: SignOptions = {}) =>
      toResult(await commandStatusRoute(signed(key, `${base}/commands/${commandId}/status`, body, { ...defaults, ...o }), command(machineCode, commandId))),
  };
}

export async function webhook(key: Key, slug: string, body: unknown, o: SignOptions = {}) {
  return toResult(await webhookRoute(signed(key, `/api/v1/webhooks/manufacturers/${slug}`, body, o), { params: Promise.resolve({ slug }) }));
}

/** Raw access for tests that must hand-craft a request. */
export const routes = { connectRoute, describeRoute, heartbeatRoute, statusRoute, inventoryRoute, eventsRoute, commandsRoute, ackRoute, commandStatusRoute, webhookRoute, machine, command };
