import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: sessionMock }));

import { adminFirestore } from '@/lib/firebase/admin';
import { ReferenceHttpAdapter } from '@/lib/vending/adapters/referenceHttpAdapter';
import { ProtocolNotConfiguredError } from '@/lib/vending/hardwareAdapter';
import { assertPublicHost, isPrivateAddress, UnsafeManufacturerUrlError, validateManufacturerBaseUrl } from '@/lib/vending/outboundUrl';
import { manufacturerApiCredentialService, ManufacturerApiCredentialError } from '@/services/manufacturerApiCredentialService';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineService } from '@/services/machineService';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { GET as manufacturerRoute } from '@/app/api/vending/integrations/manufacturers/[id]/route';
import { GET as listRoute } from '@/app/api/vending/integrations/manufacturers/[id]/api-credentials/route';
import { PUT as setRoute } from '@/app/api/vending/integrations/manufacturers/[id]/api-credentials/[environment]/route';
import { POST as rollbackRoute } from '@/app/api/vending/integrations/manufacturers/[id]/api-credentials/[environment]/rollback/route';
import { POST as revokeRoute } from '@/app/api/vending/integrations/manufacturers/[id]/api-credentials/[environment]/revoke/route';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';

/**
 * Snack Quest's credentials for calling manufacturer APIs: encrypted at
 * rest, scoped to manufacturer × environment, server-only, audited,
 * rotatable with roll-back, revocable — and the adapter gets them from
 * the credential service at call time, never from the environment.
 */

const BUSINESS_ID = 'biz-outbound-credentials';
const KEY_ONE = 'mfr-live-key-0000000001';
const KEY_TWO = 'mfr-live-key-0000000002';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };

beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '8'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let manufacturerId: string;
let machineId: string;

async function outboundManufacturer(slug: string) {
  const id = await manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: slug, slug, integrationType: 'manufacturer_api', defaultAdapterKey: 'reference_http' }, 'staff-1');
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, id, 'technical_review', 'staff-1');
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, id, 'credentials', 'staff-1');
  const modelId = await manufacturerRegistryService.createModel(BUSINESS_ID, { manufacturerId: id, name: `${slug}-M`, slug: 'm', declaredCapabilities: ['vend', 'dispense_confirmation', 'heartbeat'] }, 'staff-1');
  return { manufacturerId: id, modelId };
}

beforeEach(async () => {
  sessionMock.mockResolvedValue({ uid: 'admin-1', email: 'a@example.com', displayName: 'A', roles: ['admin'], businessId: BUSINESS_ID });
  await clearIntegrationCollections(BUSINESS_ID);
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
  const ids = await outboundManufacturer('outco');
  manufacturerId = ids.manufacturerId;
  ({ machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, serialNumber: 'SN-OUT', manufacturer: 'reference_http', model: 'm', actor: 'staff-1' }));
  await machineIntegrationService.configure(BUSINESS_ID, { machineId, ...ids, manufacturerMachineId: 'THEIR-1', environment: 'sandbox' }, 'staff-1');
});

function vendServer() {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, auth: new Headers(init.headers).get('authorization') });
    return init.method === 'PUT' ? Response.json({ accepted: true }, { status: 201 }) : Response.json({ online: true, doorOpen: false, faults: [] });
  };
  return { calls, fetchImpl };
}

const adapterWith = (fetchImpl: typeof fetch | ((url: string, init: RequestInit) => Promise<Response>)) =>
  new ReferenceHttpAdapter({ credentialFor: (id) => manufacturerApiCredentialService.resolveForMachine(id), fetchImpl: fetchImpl as never, retryDelaysMs: [0] });

describe('storage', () => {
  it('is encrypted at rest, and nothing but a fingerprint ever leaves the service', async () => {
    const summary = await manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'sandbox', { baseUrl: 'https://api.outco.example', apiKey: KEY_ONE }, 'admin-1');
    const raw = JSON.stringify((await adminFirestore.collection('manufacturerApiCredentials').doc(`${manufacturerId}__sandbox`).get()).data());
    expect(raw).not.toContain(KEY_ONE);
    expect(JSON.stringify(summary)).not.toContain(KEY_ONE);
    expect(JSON.stringify(summary)).not.toContain('secretEncrypted');
    expect(summary.current?.fingerprint).toMatch(/\S/);
  });

  it('refuses to store a key when encryption is not configured — never plaintext', async () => {
    const saved = process.env.SECRET_ENCRYPTION_KEY;
    delete process.env.SECRET_ENCRYPTION_KEY;
    try {
      await expect(manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'sandbox', { baseUrl: 'https://api.outco.example', apiKey: KEY_ONE }, 'admin-1')).rejects.toBeInstanceOf(ManufacturerApiCredentialError);
    } finally {
      process.env.SECRET_ENCRYPTION_KEY = saved;
    }
  });

  it('is scoped to one business: another business cannot read or change it', async () => {
    await manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'sandbox', { baseUrl: 'https://api.outco.example', apiKey: KEY_ONE }, 'admin-1');
    expect(await manufacturerApiCredentialService.listSummaries('biz-someone-else', manufacturerId)).toEqual([]);
    await expect(manufacturerApiCredentialService.revoke('biz-someone-else', manufacturerId, 'sandbox', 'x', 'intruder')).rejects.toThrow();
  });
});

describe('the adapter gets its credential from the service, per machine environment', () => {
  it('calls with the sandbox key for a sandbox machine; a production key is never used for it', async () => {
    await manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'sandbox', { baseUrl: 'https://sandbox.outco.example', apiKey: KEY_ONE }, 'admin-1');
    await adminFirestore.collection('manufacturers').doc(manufacturerId).update({ onboardingStage: 'production' });
    await manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'production', { baseUrl: 'https://1.1.1.1', apiKey: KEY_TWO }, 'admin-1');
    const server = vendServer();
    const result = await adapterWith(server.fetchImpl).authorizeVend(machineId, 'A01', { commandRef: 'DSP-1', manufacturerSlotId: 'spiral_01' });
    expect(result.authorized).toBe(true);
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].url.startsWith('https://sandbox.outco.example/')).toBe(true);
    expect(server.calls[0].auth).toBe(`Bearer ${KEY_ONE}`);
  });

  it('with no credential the vend is refused before anything is sent (provably undelivered)', async () => {
    const server = vendServer();
    await expect(adapterWith(server.fetchImpl).authorizeVend(machineId, 'A01', { commandRef: 'DSP-2' })).rejects.toBeInstanceOf(ProtocolNotConfiguredError);
    expect(server.calls).toHaveLength(0);
  });

  it('rotation takes effect on the next call; roll-back restores the old key; revocation stops calls at once', async () => {
    await manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'sandbox', { baseUrl: 'https://api.outco.example', apiKey: KEY_ONE }, 'admin-1');
    const rotated = await manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'sandbox', { baseUrl: 'https://api.outco.example', apiKey: KEY_TWO }, 'admin-1');
    expect(rotated.current?.version).toBe(2);
    expect(rotated.previous?.version).toBe(1);
    const server = vendServer();
    const adapter = adapterWith(server.fetchImpl);
    await adapter.authorizeVend(machineId, 'A01', { commandRef: 'DSP-3' });
    expect(server.calls.at(-1)?.auth).toBe(`Bearer ${KEY_TWO}`);

    await manufacturerApiCredentialService.rollBack(BUSINESS_ID, manufacturerId, 'sandbox', 'admin-1');
    await adapter.authorizeVend(machineId, 'A01', { commandRef: 'DSP-4' });
    expect(server.calls.at(-1)?.auth).toBe(`Bearer ${KEY_ONE}`);

    await manufacturerApiCredentialService.revoke(BUSINESS_ID, manufacturerId, 'sandbox', 'leaked', 'admin-1');
    const before = server.calls.length;
    await expect(adapter.authorizeVend(machineId, 'A01', { commandRef: 'DSP-5' })).rejects.toBeInstanceOf(ProtocolNotConfiguredError);
    expect(server.calls.length).toBe(before);
    const raw = JSON.stringify((await adminFirestore.collection('manufacturerApiCredentials').doc(`${manufacturerId}__sandbox`).get()).data());
    expect(raw).not.toContain('secretEncrypted');
  });
});

describe('gates', () => {
  it('activation is blocked, and payments are declined, while no credential is configured', async () => {
    const integration = (await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId))!;
    expect(await machineIntegrationService.activationBlockers(BUSINESS_ID, integration)).toContain('No sandbox API credential is configured for this manufacturer');
    await manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'sandbox', { baseUrl: 'https://api.outco.example', apiKey: KEY_ONE }, 'admin-1');
    expect(await machineIntegrationService.activationBlockers(BUSINESS_ID, integration)).not.toContain('No sandbox API credential is configured for this manufacturer');

    await machineIntegrationRepository.setState(BUSINESS_ID, machineId, 'active', 'staff-1');
    expect((await machineIntegrationService.dispenseGate(BUSINESS_ID, machineId, 'pre_payment')).allowed).toBe(true);
    await manufacturerApiCredentialService.revoke(BUSINESS_ID, manufacturerId, 'sandbox', 'rotating provider', 'admin-1');
    expect(await machineIntegrationService.dispenseGate(BUSINESS_ID, machineId, 'pre_payment')).toMatchObject({ allowed: false, reason: 'no manufacturer API credential configured' });
  });
});

describe('base URL safety (SSRF)', () => {
  it.each([
    ['http://api.outco.example', 'https'],
    ['https://169.254.169.254/latest/meta-data', 'metadata'],
    ['https://10.0.0.5', 'private'],
    ['https://192.168.1.10', 'private'],
    ['https://[::1]', 'private'],
    ['https://metadata.google.internal', 'metadata'],
    ['http://169.254.169.254', 'metadata'],
    ['https://user:pass@api.outco.example', 'credentials'],
    ['https://api.outco.example/#x', 'fragments'],
    ['not a url', 'valid URL'],
  ])('refuses %s', (url, reason) => {
    expect(() => validateManufacturerBaseUrl(url, { allowLocalHttp: false })).toThrow(new RegExp(reason));
  });

  it('allows a local sandbox server only when explicitly permitted (sandbox, outside production)', () => {
    expect(validateManufacturerBaseUrl('http://localhost:4010', { allowLocalHttp: true }).host).toBe('localhost:4010');
    expect(() => validateManufacturerBaseUrl('http://localhost:4010', { allowLocalHttp: false })).toThrow(UnsafeManufacturerUrlError);
    expect(() => validateManufacturerBaseUrl('http://169.254.169.254', { allowLocalHttp: true })).toThrow(/metadata/);
  });

  it('a production credential cannot point at a private address', async () => {
    await adminFirestore.collection('manufacturers').doc(manufacturerId).update({ onboardingStage: 'production' });
    await expect(manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'production', { baseUrl: 'http://localhost:4010', apiKey: KEY_ONE }, 'admin-1')).rejects.toBeInstanceOf(UnsafeManufacturerUrlError);
  });

  it('a hostname that resolves to a private address is refused (DNS check)', async () => {
    await expect(assertPublicHost('sneaky.outco.example', async () => [{ address: '10.1.2.3' }])).rejects.toBeInstanceOf(UnsafeManufacturerUrlError);
    await expect(assertPublicHost('fine.outco.example', async () => [{ address: '93.184.216.34' }])).resolves.toBeUndefined();
    expect(['127.0.0.1', '100.64.0.1', '172.16.0.1', '::ffff:10.0.0.1', 'fd00::1', 'fe80::1'].every(isPrivateAddress)).toBe(true);
    expect(['8.8.8.8', '2606:4700::1111'].some(isPrivateAddress)).toBe(false);
  });
});

describe('admin routes', () => {
  const ctx = (environment = 'sandbox') => ({ params: Promise.resolve({ id: manufacturerId, environment }) });
  const put = (body: unknown) => new Request('http://localhost/x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const post = (body: unknown = {}) => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('are admin-only', async () => {
    sessionMock.mockResolvedValue({ uid: 'w-1', email: 'w@example.com', displayName: 'W', roles: ['warehouse'], businessId: BUSINESS_ID });
    expect((await setRoute(put({ baseUrl: 'https://api.outco.example', apiKey: KEY_ONE }), ctx('sandbox'))).status).toBe(403);
    expect((await listRoute(new Request('http://localhost/x'), ctx())).status).toBe(403);
    sessionMock.mockResolvedValue(null);
    expect((await setRoute(put({ baseUrl: 'https://api.outco.example', apiKey: KEY_ONE }), ctx('sandbox'))).status).toBe(401);
  });

  it('set → rotate → roll back → revoke, each audit-logged, and no response or audit entry ever contains a key', async () => {
    const responses = [
      await setRoute(put({ baseUrl: 'https://api.outco.example', apiKey: KEY_ONE }), ctx('sandbox')),
      await setRoute(put({ baseUrl: 'https://api.outco.example', apiKey: KEY_TWO }), ctx('sandbox')),
      await rollbackRoute(post(), ctx('sandbox')),
      await revokeRoute(post({ reason: 'provider change' }), ctx('sandbox')),
      await listRoute(new Request('http://localhost/x'), ctx()),
      await manufacturerRoute(new Request('http://localhost/x'), ctx()),
    ];
    const bodies = await Promise.all(responses.map(async (response) => ({ status: response.status, text: await response.text() })));
    expect(bodies.map((b) => b.status)).toEqual([200, 200, 200, 200, 200, 200]);
    for (const { text } of bodies) {
      expect(text).not.toContain(KEY_ONE);
      expect(text).not.toContain(KEY_TWO);
      expect(text).not.toContain('secretEncrypted');
    }
    const audit = (await adminFirestore.collection('auditLogs').where('businessId', '==', BUSINESS_ID).get()).docs.map((doc) => doc.data());
    expect(audit.map((entry) => entry.action).sort()).toEqual(['revoke_manufacturer_api_credential', 'roll_back_manufacturer_api_credential', 'rotate_manufacturer_api_credential', 'set_manufacturer_api_credential']);
    expect(JSON.stringify(audit)).not.toContain(KEY_ONE);
    expect(JSON.stringify(audit)).not.toContain(KEY_TWO);
    const history = JSON.parse(bodies[5].text).credentialHistory as { action: string }[];
    expect(history.map((entry) => entry.action)).toContain('revoke_manufacturer_api_credential');
  });

  it('an unsafe URL is a 400 with the reason, and nothing is stored', async () => {
    for (const environment of ['sandbox', 'production']) {
      // Cloud metadata is refused even for sandbox, where local servers are otherwise allowed in development.
      const response = await setRoute(put({ baseUrl: 'https://169.254.169.254', apiKey: KEY_ONE }), ctx(environment));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/refused/);
    }
    expect(await manufacturerApiCredentialService.listSummaries(BUSINESS_ID, manufacturerId)).toEqual([]);
  });
});
