import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { ReferenceHttpAdapter } from '@/lib/vending/adapters/referenceHttpAdapter';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import type { PaymentGateway, StkPushResult } from '@/lib/integrations/types';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { MachineSlotService } from '@/services/machineSlotService';
import { ManufacturerWebhookService } from '@/services/manufacturerWebhookService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineService } from '@/services/machineService';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { integrationCredentialRepository } from '@/repositories/integrationCredentialRepository';
import { dispenseCommandDocId } from '@/types';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';

/**
 * The dispense and payment state matrix, end to end over the outbound
 * path a real manufacturer API integration uses: the customer pays
 * (M-Pesa, faked at the gateway), Safaricom's callback authorizes the
 * vend, the reference adapter calls the manufacturer's HTTP API (faked
 * at fetch), and the outcome arrives by webhook or by lookup. For each
 * case: what the customer's money does, what the machine was told, and
 * what the stock ledger says.
 *
 * | Case                       | Machine told     | Money                         | Stock      |
 * |----------------------------|------------------|-------------------------------|------------|
 * | normal                     | once             | kept (dispensed)              | −1         |
 * | manufacturer unreachable   | never            | refund path (provable)        | unchanged  |
 * | timeout                    | maybe            | held for review, never refund | unchanged  |
 * | machine failure (jam)      | once             | refund path                   | unchanged  |
 * | lost response              | once             | resolved by lookup → kept     | −1         |
 * | duplicate command          | once             | kept                          | −1         |
 * | duplicate webhook          | once             | kept, applied once            | −1 (once)  |
 * | late "dispensed" after a    | once             | refund held; human reviews    | −1         |
 *   refund decision           |                  |                               |            |
 * | customer retries payment   | one prompt       | one charge                    | —          |
 */

const BUSINESS_ID = 'biz-dispense-state-matrix';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = 'd'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

type Mode = 'normal' | 'unreachable' | 'hang' | 'process_then_hang';

/** The manufacturer's API: records every vend it receives, keyed by our command reference (PUT is create-or-return). */
function manufacturer() {
  const vends = new Map<string, string>();
  const puts: string[] = [];
  let mode: Mode = 'normal';
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const match = url.match(/\/vends\/([^/]+)$/);
    if (mode === 'unreachable') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    if (match && init.method === 'PUT') {
      const ref = decodeURIComponent(match[1]);
      puts.push(ref);
      if (mode === 'hang') return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      vends.set(ref, vends.get(ref) ?? 'dispensed');
      if (mode === 'process_then_hang') return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      return Response.json({ accepted: true }, { status: 201 });
    }
    if (match) {
      const state = vends.get(decodeURIComponent(match[1]));
      return state ? Response.json({ state }) : Response.json({ error: 'no such vend' }, { status: 404 });
    }
    return Response.json({ online: true, doorOpen: false, faults: [] });
  };
  return { vends, puts, fetchImpl, setMode: (next: Mode) => (mode = next) };
}

class FakeGateway implements PaymentGateway {
  pushes = 0;
  async initiateStkPush(): Promise<StkPushResult> {
    this.pushes += 1;
    return { merchantRequestId: `mr-${this.pushes}`, checkoutRequestId: `ws_CO_${Date.now()}_${this.pushes}`, responseCode: '0', responseDescription: 'Success', customerMessage: 'Enter your PIN' };
  }
  verifyCallback(): never {
    throw new Error('unused');
  }
  async queryStkStatus(): Promise<never> {
    throw new Error('unused');
  }
}

let api: ReturnType<typeof manufacturer>;
let gateway: FakeGateway;
let service: MachineTransactionService;
let resolver: VendingAdapterResolver;
let machineId: string;
let manufacturerId: string;

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  api = manufacturer();
  gateway = new FakeGateway();
  const adapter = new ReferenceHttpAdapter({ credentialFor: (id) => manufacturerApiCredentialService.resolveForMachine(id), fetchImpl: api.fetchImpl, timeoutMs: 300, retryDelaysMs: [0] });
  resolver = (key) => (key === 'reference_http' ? adapter : defaultVendingAdapterResolver(key));
  service = new MachineTransactionService(resolver, gateway);

  manufacturerId = await manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: 'Matrix Co', slug: 'matrixco', integrationType: 'hybrid', defaultAdapterKey: 'reference_http' }, 'staff-1');
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'technical_review', 'staff-1');
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'credentials', 'staff-1');
  const modelId = await manufacturerRegistryService.createModel(BUSINESS_ID, { manufacturerId, name: 'MX', slug: 'mx', declaredCapabilities: ['vend', 'dispense_confirmation', 'heartbeat'] }, 'staff-1');
  ({ machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, serialNumber: 'SN-MX', manufacturer: 'reference_http', model: 'mx', actor: 'staff-1' }));
  for (const status of ['installing', 'testing', 'active'] as const) await machineService.updateStatus(BUSINESS_ID, machineId, status, 'staff-1');
  const slots = new MachineSlotService(resolver);
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 150, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });
  await slots.setSlotMappings(BUSINESS_ID, machineId, [{ slotCode: 'A01', manufacturerSlotId: 'tray-1' }]);
  await machineIntegrationService.configure(BUSINESS_ID, { machineId, manufacturerId, modelId, manufacturerMachineId: 'MX-1', environment: 'sandbox' }, 'staff-1');
  await manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerId, 'sandbox', { baseUrl: 'https://api.matrixco.example', apiKey: 'matrix-sandbox-key' }, 'staff-1');
  await machineIntegrationRepository.setState(BUSINESS_ID, machineId, 'active', 'staff-1');
});

/** The customer's path: pay, Safaricom confirms, the vend is dispatched. */
async function customerBuys(): Promise<string> {
  const cart = await service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000001' });
  await service.handleMpesaCallback(BUSINESS_ID, { checkoutRequestId: cart.checkoutRequestId, merchantRequestId: cart.merchantRequestId, resultCode: 0, resultDesc: 'Success', amountKes: 150, mpesaReceiptNumber: `R${Date.now()}` });
  return cart.transactions[0].id;
}

async function webhookReport(kind: 'vend.completed' | 'vend.failed', commandRef: string, deliveryId: string, detail: Record<string, unknown> = {}) {
  const key = await integrationCredentialRepository.issue({ businessId: BUSINESS_ID, manufacturerId, kind: 'webhook', environment: 'sandbox', label: 'h', issuedBy: 'staff-1', expiresAt: null });
  return new ManufacturerWebhookService(resolver).ingest(BUSINESS_ID, (await integrationCredentialRepository.findByKeyId(key.keyId))!, 'matrixco', {
    id: deliveryId,
    events: [{ id: `${deliveryId}-e`, kind, machine: 'MX-1', detail: { requestId: commandRef, ...detail } }],
  });
}

async function state(id: string) {
  const [transaction, command, movements, slot] = await Promise.all([
    machineTransactionRepository.findById(BUSINESS_ID, id),
    adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).get(),
    adminFirestore.collection('machineInventoryMovements').where('sourceTransactionId', '==', id).where('reason', '==', 'sale').get(),
    adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).get(),
  ]);
  return { money: transaction?.status, command: command.get('status') as string | undefined, commandRef: command.get('commandRef') as string, saleMovements: movements.size, stock: slot.get('currentQuantity') as number };
}

describe('dispense and payment state matrix (outbound manufacturer API)', () => {
  it('normal: told once, dispensed on the webhook, stock −1', async () => {
    const id = await customerBuys();
    const { commandRef } = await state(id);
    expect(api.puts).toEqual([commandRef]);
    await webhookReport('vend.completed', commandRef, `d-normal-${id}`);
    expect(await state(id)).toMatchObject({ money: 'dispensed', command: 'dispensed', saleMovements: 1, stock: 4 });
  });

  it('manufacturer unreachable: provably never sent → refund path, stock untouched', async () => {
    api.setMode('unreachable');
    const id = await customerBuys();
    expect(api.puts).toEqual([]);
    expect(await state(id)).toMatchObject({ money: 'paid_vend_failed', command: 'rejected', saleMovements: 0, stock: 5 });
  });

  it('timeout: may have dispensed → held for review, never refunded, never re-sent', async () => {
    api.setMode('hang');
    const id = await customerBuys();
    expect(await state(id)).toMatchObject({ money: 'manual_review', command: 'unknown', saleMovements: 0, stock: 5 });
    expect(api.puts).toHaveLength(1);
  });

  it('machine failure (jam reported by webhook): refund path, stock untouched', async () => {
    const id = await customerBuys();
    await webhookReport('vend.failed', (await state(id)).commandRef, `d-jam-${id}`, { failureCode: 'jam', reason: 'spiral jammed' });
    expect(await state(id)).toMatchObject({ money: 'paid_vend_failed', saleMovements: 0, stock: 5 });
  });

  it('lost response: the manufacturer dispensed but the answer never came → unknown, then the lookup finds it dispensed', async () => {
    api.setMode('process_then_hang');
    const id = await customerBuys();
    expect(await state(id)).toMatchObject({ money: 'manual_review', command: 'unknown' });
    api.setMode('normal');
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).update({ nextReconcileAt: null });
    const pulled = await service.reconcileUnknownDispenses(BUSINESS_ID);
    expect(pulled.resolved).toBe(1);
    expect(await state(id)).toMatchObject({ money: 'dispensed', command: 'dispensed', saleMovements: 1, stock: 4 });
    expect(api.vends.size).toBe(1);
  });

  it('duplicate command: two concurrent dispatches of one sale → the manufacturer is told once', async () => {
    const cart = await service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000002' });
    const id = cart.transactions[0].id;
    await service.markPaymentVerified(BUSINESS_ID, id, 'RDUP');
    await Promise.allSettled([service.authorizeVend(BUSINESS_ID, id), service.authorizeVend(BUSINESS_ID, id), service.authorizeVend(BUSINESS_ID, id)]);
    expect(api.puts).toHaveLength(1);
    expect((await state(id)).money).toBe('vend_authorized');
  });

  it('duplicate webhook: the same delivery five times is applied once', async () => {
    const id = await customerBuys();
    const { commandRef } = await state(id);
    for (let i = 0; i < 5; i += 1) await webhookReport('vend.completed', commandRef, `d-dup-${id}`);
    expect(await state(id)).toMatchObject({ money: 'dispensed', saleMovements: 1, stock: 4 });
  });

  it('late "dispensed" after the refund decision (not yet paid out): the refund is put on hold for a human, the stock that left is recorded', async () => {
    const id = await customerBuys();
    const { commandRef } = await state(id);
    await webhookReport('vend.failed', commandRef, `d-fail-${id}`, { failureCode: 'jam' });
    expect((await state(id)).money).toBe('paid_vend_failed');
    await webhookReport('vend.completed', commandRef, `d-late-${id}`);
    expect(await state(id)).toMatchObject({ money: 'manual_review', saleMovements: 1, stock: 4 });
    const transaction = await machineTransactionRepository.findById(BUSINESS_ID, id);
    expect(transaction?.outcomeConflict).toMatchObject({ reportedStatus: 'success', previousStatus: 'paid_vend_failed', resolved: false });
  });

  it('customer retries the payment request: one prompt, one charge — with or without an Idempotency-Key', async () => {
    const auto = await Promise.all([1, 2, 3].map(() => service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000003' }).catch((error: Error) => error)));
    const succeeded = auto.filter((r): r is Exclude<typeof r, Error> => !(r instanceof Error));
    expect(gateway.pushes).toBe(1);
    expect(new Set(succeeded.map((r) => r.checkoutRequestId)).size).toBe(1);
    // Those that raced the first get "in progress" (retry), never a second prompt.
    expect(auto.filter((r) => r instanceof Error).every((e) => (e as Error).name === 'PaymentInitiationInProgressError')).toBe(true);
    const again = await service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000003' });
    expect(again).toMatchObject({ idempotentReplay: true, checkoutRequestId: succeeded[0].checkoutRequestId });
    expect(gateway.pushes).toBe(1);

    const keyed = await service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000004', idempotencyKey: 'kiosk-order-000001' });
    const keyedAgain = await service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000004', idempotencyKey: 'kiosk-order-000001' });
    expect(keyedAgain.checkoutRequestId).toBe(keyed.checkoutRequestId);
    expect(gateway.pushes).toBe(2);
    await expect(service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000009', idempotencyKey: 'kiosk-order-000001' })).rejects.toMatchObject({ name: 'IdempotencyKeyReusedError' });
  });

  it('the same cart again after the first was paid is a new purchase, not a replay', async () => {
    const first = await customerBuys();
    expect((await state(first)).money).toBe('vend_authorized');
    const second = await service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000001' });
    expect(second.idempotentReplay).toBe(false);
    expect(second.transactions[0].id).not.toBe(first);
    expect(gateway.pushes).toBe(2);
  });

  it('a failed prompt can be retried at once (the failure releases the key)', async () => {
    const failing = vi.spyOn(gateway, 'initiateStkPush').mockRejectedValueOnce(new Error('daraja down'));
    await expect(service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000005' })).rejects.toThrow('daraja down');
    failing.mockRestore();
    const retry = await service.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000005' });
    expect(retry.idempotentReplay).toBe(false);
  });
});
