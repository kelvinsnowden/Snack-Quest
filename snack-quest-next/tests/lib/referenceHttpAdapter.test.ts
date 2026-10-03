import { describe, expect, it } from 'vitest';
import { ReferenceHttpAdapter } from '@/lib/vending/adapters/referenceHttpAdapter';
import { HardwareAuthenticationError, HardwareTimeoutError, HardwareUnreachableError } from '@/lib/vending/hardwareAdapter';

/**
 * The reference outbound adapter against a fake implementation of the
 * example "Reference Manufacturer API" contract. This proves the
 * mechanics any real HTTP-API adapter needs; it says nothing about any
 * real manufacturer's API, which has to be tested against that API.
 */

type FakeBehaviour = 'normal' | 'refuse' | 'server_error' | 'unreachable' | 'hang' | 'unauthorized';

function fakeManufacturer(behaviour: { vend?: FakeBehaviour; status?: FakeBehaviour } = {}) {
  const calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
  const vends = new Map<string, { state: string; failureCode?: string }>();
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ method: init.method ?? 'GET', url, headers, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const isVend = /\/vends\//.test(url);
    const mode = (isVend && init.method === 'PUT' ? behaviour.vend : behaviour.status) ?? 'normal';
    if (mode === 'unreachable') {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (mode === 'hang') {
      return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }
    if (mode === 'unauthorized') {
      return Response.json({ error: 'bad key' }, { status: 401 });
    }
    if (mode === 'server_error') {
      return Response.json({ error: 'boom' }, { status: 503 });
    }
    if (headers.authorization !== 'Bearer ref-key') {
      return Response.json({}, { status: 401 });
    }
    const vendMatch = url.match(/\/v1\/machines\/([^/]+)\/vends\/([^/]+)$/);
    if (vendMatch && init.method === 'PUT') {
      if (mode === 'refuse') {
        return Response.json({ accepted: false, reason: 'motor fault' }, { status: 422 });
      }
      vends.set(decodeURIComponent(vendMatch[2]), vends.get(decodeURIComponent(vendMatch[2])) ?? { state: 'pending' });
      return Response.json({ accepted: true }, { status: 201 });
    }
    if (vendMatch) {
      const vend = vends.get(decodeURIComponent(vendMatch[2]));
      return vend ? Response.json(vend) : Response.json({}, { status: 404 });
    }
    if (/\/v1\/machines\/MFR-1$/.test(url)) {
      return Response.json({ online: true, doorOpen: false, temperatureC: 4.5, faults: ['F2'], firmware: '9.1', serial: 'S-1', model: 'R1', paymentDeviceOk: true });
    }
    return Response.json({}, { status: 404 });
  };
  return { calls, vends, fetchImpl };
}

function adapterFor(fake: ReturnType<typeof fakeManufacturer>, timeoutMs = 1000) {
  return new ReferenceHttpAdapter({
    baseUrl: 'https://mfr.example.test',
    apiKey: 'ref-key',
    fetchImpl: fake.fetchImpl,
    timeoutMs,
    retryDelaysMs: [0, 0],
    resolveManufacturerMachineId: async (machineId) => (machineId === 'sq-1' ? 'MFR-1' : null),
  });
}

describe('ReferenceHttpAdapter', () => {
  it('with no configuration reports no capabilities and fails its connection test honestly', async () => {
    const adapter = new ReferenceHttpAdapter(null);
    expect(Object.values(adapter.capabilities()).every((value) => value === false)).toBe(true);
    expect(await adapter.testConnection('sq-1')).toMatchObject({ ok: false, errorKind: 'protocol' });
  });

  it('vends idempotently under the command reference, translating the machine and slot ids', async () => {
    const fake = fakeManufacturer();
    const result = await adapterFor(fake).authorizeVend('sq-1', 'A01', { commandRef: 'DSP-1', manufacturerSlotId: 'spiral_01' });
    expect(result).toEqual({ vendRef: 'DSP-1', authorized: true, reason: null, delivery: 'synchronous' });
    expect(fake.calls[0]).toMatchObject({ method: 'PUT', url: 'https://mfr.example.test/v1/machines/MFR-1/vends/DSP-1', body: { slot: 'spiral_01' } });
    expect(fake.calls[0].headers['idempotency-key']).toBe('DSP-1');
  });

  it('refuses to vend without a command reference rather than risk a non-idempotent dispense', async () => {
    const fake = fakeManufacturer();
    expect((await adapterFor(fake).authorizeVend('sq-1', 'A01')).authorized).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it('a manufacturer refusal is a clean refusal with their reason', async () => {
    const result = await adapterFor(fakeManufacturer({ vend: 'refuse' })).authorizeVend('sq-1', 'A01', { commandRef: 'DSP-2' });
    expect(result).toMatchObject({ authorized: false, reason: 'motor fault' });
  });

  it('manufacturer API unavailable: retries the idempotent write, then reports it provably undelivered', async () => {
    const fake = fakeManufacturer({ vend: 'unreachable' });
    await expect(adapterFor(fake).authorizeVend('sq-1', 'A01', { commandRef: 'DSP-3' })).rejects.toThrow(HardwareUnreachableError);
    expect(fake.calls).toHaveLength(3);
  });

  it('network timeout: reports the outcome as unknown and never retries the write', async () => {
    const fake = fakeManufacturer({ vend: 'hang' });
    await expect(adapterFor(fake, 30).authorizeVend('sq-1', 'A01', { commandRef: 'DSP-4' })).rejects.toThrow(HardwareTimeoutError);
    expect(fake.calls).toHaveLength(1);
  });

  it('a 5xx on a vend is ambiguous — unknown, not a refusal', async () => {
    await expect(adapterFor(fakeManufacturer({ vend: 'server_error' })).authorizeVend('sq-1', 'A01', { commandRef: 'DSP-5' })).rejects.toThrow(HardwareTimeoutError);
  });

  it('rejected credentials are classified as authentication, for integration health', async () => {
    const adapter = adapterFor(fakeManufacturer({ status: 'unauthorized', vend: 'unauthorized' }));
    await expect(adapter.authorizeVend('sq-1', 'A01', { commandRef: 'DSP-6' })).rejects.toThrow(HardwareAuthenticationError);
    expect(await adapter.testConnection('sq-1')).toMatchObject({ ok: false, errorKind: 'authentication' });
  });

  it('reads status from the manufacturer and passes the connection test', async () => {
    const adapter = adapterFor(fakeManufacturer());
    expect(await adapter.getMachineStatus('sq-1')).toMatchObject({ online: true, temperatureCelsius: 4.5, faults: ['F2'] });
    expect(await adapter.getMachineInfo('sq-1')).toMatchObject({ manufacturerMachineId: 'MFR-1', firmwareVersion: '9.1' });
    expect((await adapter.testConnection('sq-1')).ok).toBe(true);
  });

  it('looks up a vend by command reference, mapping the manufacturer\'s states and failure codes', async () => {
    const fake = fakeManufacturer();
    const adapter = adapterFor(fake);
    await adapter.authorizeVend('sq-1', 'A01', { commandRef: 'DSP-7' });
    expect((await adapter.getDispenseStatus('sq-1', 'DSP-7')).state).toBe('pending');
    fake.vends.set('DSP-7', { state: 'failed', failureCode: 'jam' });
    expect((await adapter.getDispenseStatus('sq-1', 'DSP-7')).state).toBe('jam');
    // Never received at all — itself a definitive answer for a timed-out vend.
    expect((await adapter.getDispenseStatus('sq-1', 'DSP-NEVER')).state).toBe('failed');
  });

  it('translates native webhook events, keeping unknown kinds under their native name', () => {
    const parsed = adapterFor(fakeManufacturer()).parseWebhook({
      id: 'delivery-1',
      events: [
        { id: 'e1', kind: 'door.open', machine: 'MFR-1' },
        { id: 'e2', kind: 'vend.failed', machine: 'MFR-1', slot: 'spiral_01', detail: { requestId: 'DSP-8', failureCode: 'empty', reason: 'no stock' } },
        { id: 'e3', kind: 'coin.jam', machine: 'MFR-1' },
      ],
    });
    expect(parsed.deliveryId).toBe('delivery-1');
    expect(parsed.events.map((event) => event.type)).toEqual(['DOOR_OPENED', 'DISPENSE_FAILED', 'coin.jam']);
    expect(parsed.events[1].data).toMatchObject({ vendRef: 'DSP-8', status: 'no_product', failureReason: 'no stock' });
  });
});
