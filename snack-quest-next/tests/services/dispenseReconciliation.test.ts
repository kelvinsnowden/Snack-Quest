import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { ReferenceHttpAdapter } from '@/lib/vending/adapters/referenceHttpAdapter';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { MachineSlotService } from '@/services/machineSlotService';
import { machineService } from '@/services/machineService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';

/**
 * § "network timeout" and "manufacturer API unavailable" at the service
 * level: a real outbound HTTP adapter (against a fake manufacturer)
 * times out mid-vend, the transaction goes to manual review instead of
 * being retried, and the reconciliation sweep later asks the
 * manufacturer what actually happened — using the command reference it
 * was sent as its idempotency key.
 */

const BUSINESS_ID = 'biz-dispense-reconciliation';

function flakyManufacturer() {
  const state = { hangVends: true, vends: new Map<string, { state: string; failureCode?: string }>(), statusUnavailable: false };
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const vend = url.match(/\/vends\/([^/]+)$/);
    if (vend && init.method === 'PUT') {
      // The manufacturer receives the vend and starts it — then the response is lost.
      state.vends.set(decodeURIComponent(vend[1]), { state: 'dispensing' });
      if (state.hangVends) {
        return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      }
      return Response.json({ accepted: true }, { status: 201 });
    }
    if (vend) {
      if (state.statusUnavailable) {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      }
      const record = state.vends.get(decodeURIComponent(vend[1]));
      return record ? Response.json(record) : Response.json({}, { status: 404 });
    }
    return Response.json({ online: true });
  };
  return { state, fetchImpl };
}

let manufacturer: ReturnType<typeof flakyManufacturer>;
let service: MachineTransactionService;
let slots: MachineSlotService;

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  manufacturer = flakyManufacturer();
  const adapter = new ReferenceHttpAdapter({ baseUrl: 'https://m.example.test', apiKey: 'k', fetchImpl: manufacturer.fetchImpl, timeoutMs: 30, retryDelaysMs: [0], resolveManufacturerMachineId: async () => 'MFR-9' });
  const mock = new MockVendingAdapter();
  const resolver = (key: string) => (key === 'reference_http' ? adapter : mock);
  service = new MachineTransactionService(resolver);
  slots = new MachineSlotService(resolver);
});

async function paidSaleThatTimesOut() {
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, serialNumber: 'SN', manufacturer: 'reference_http', model: 'R', actor: 'staff-1' });
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'p', productCatalogue: 'package', priceKes: 100, capacity: 5, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 3 });
  const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await service.markPaymentVerified(BUSINESS_ID, id, 'R-1');
  await service.authorizeVend(BUSINESS_ID, id);
  return id;
}

describe('recovering a dispense whose outcome was lost', () => {
  it('a timeout is manual review, never an automatic retry', async () => {
    const id = await paidSaleThatTimesOut();
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('manual_review');
    expect((await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id))?.status).toBe('unknown');
  });

  it('the sweep leaves it alone while the manufacturer is still dispensing or unreachable', async () => {
    const id = await paidSaleThatTimesOut();
    expect(await service.reconcileUnknownDispenses(BUSINESS_ID)).toEqual({ resolved: 0, stillUnknown: 1 });
    manufacturer.state.statusUnavailable = true;
    expect(await service.reconcileUnknownDispenses(BUSINESS_ID)).toEqual({ resolved: 0, stillUnknown: 1 });
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('manual_review');
  });

  it('resolves to dispensed once the manufacturer confirms it — exactly once', async () => {
    const id = await paidSaleThatTimesOut();
    const command = await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id);
    manufacturer.state.vends.set(command!.commandRef, { state: 'dispensed' });
    expect(await service.reconcileUnknownDispenses(BUSINESS_ID)).toEqual({ resolved: 1, stillUnknown: 0 });
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('dispensed');
    expect((await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id))?.status).toBe('dispensed');
    expect(await service.reconcileUnknownDispenses(BUSINESS_ID)).toEqual({ resolved: 0, stillUnknown: 0 });
  });

  it('resolves to a refund when the manufacturer reports the vend failed', async () => {
    const id = await paidSaleThatTimesOut();
    const command = await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id);
    manufacturer.state.vends.set(command!.commandRef, { state: 'failed', failureCode: 'jam' });
    await service.reconcileUnknownDispenses(BUSINESS_ID);
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))).toMatchObject({ status: 'paid_vend_failed', dispenseFailureStatus: 'jam' });
  });
});
