import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateDeviceMock, initiateMpesaPaymentMock, findByIdMock } = vi.hoisted(() => ({
  authenticateDeviceMock: vi.fn(),
  initiateMpesaPaymentMock: vi.fn(),
  findByIdMock: vi.fn(),
}));

vi.mock('@/lib/vending/deviceAuth', () => ({
  authenticateDevice: authenticateDeviceMock,
}));

vi.mock('@/services/machineTransactionService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineTransactionService')>('@/services/machineTransactionService');
  return { ...actual, machineTransactionService: { initiateMpesaPayment: initiateMpesaPaymentMock, findById: findByIdMock } };
});

import { POST as paymentsPost } from '@/app/api/vending/payments/route';
import { GET as paymentsGet } from '@/app/api/vending/payments/[id]/route';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { SlotUnavailableForSaleError } from '@/services/machineTransactionService';

beforeEach(() => {
  vi.clearAllMocks();
});

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/vending/payments', { method: 'POST', body: JSON.stringify(body) });
}

function getRequest(id: string): Promise<Response> {
  return paymentsGet(new Request(`http://localhost/api/vending/payments/${id}`), { params: Promise.resolve({ id }) });
}

describe('POST /api/vending/payments', () => {
  it('401s without a valid device credential', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'invalid_secret' });
    const response = await paymentsPost(postRequest({ slotId: 'A01', phoneNumber: '0712345678' }));
    expect(response.status).toBe(401);
    expect(initiateMpesaPaymentMock).not.toHaveBeenCalled();
  });

  it("uses the authenticated token's machineId, never a value from the body", async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    initiateMpesaPaymentMock.mockResolvedValue({ id: 'txn-1', transactionRef: 'TXN-ABC', checkoutRequestId: 'ws_CO_1', customerMessage: 'Enter PIN' });

    const response = await paymentsPost(postRequest({ slotId: 'A01', phoneNumber: '0712345678', machineId: 'someone-elses-machine' }));

    expect(response.status).toBe(201);
    expect(initiateMpesaPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1', slotId: 'A01', phoneNumber: '254712345678' }),
    );
  });

  it('400s an invalid phone number before touching the service', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    const response = await paymentsPost(postRequest({ slotId: 'A01', phoneNumber: 'not-a-phone' }));
    expect(response.status).toBe(400);
    expect(initiateMpesaPaymentMock).not.toHaveBeenCalled();
  });

  it('400s a missing slotId', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    const response = await paymentsPost(postRequest({ phoneNumber: '0712345678' }));
    expect(response.status).toBe(400);
  });

  it('409s a slot the service reports as unavailable for sale', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    initiateMpesaPaymentMock.mockRejectedValue(new SlotUnavailableForSaleError('m-1', 'A01', 'out of stock'));
    const response = await paymentsPost(postRequest({ slotId: 'A01', phoneNumber: '0712345678' }));
    expect(response.status).toBe(409);
  });

  it('404s a machine that does not exist', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    initiateMpesaPaymentMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await paymentsPost(postRequest({ slotId: 'A01', phoneNumber: '0712345678' }));
    expect(response.status).toBe(404);
  });
});

describe('GET /api/vending/payments/[id]', () => {
  it('401s without a valid device credential', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'unknown_machine' });
    const response = await getRequest('txn-1');
    expect(response.status).toBe(401);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("404s a transaction belonging to a different machine, rather than revealing it exists", async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    findByIdMock.mockResolvedValue({ machineId: 'someone-elses-machine', status: 'paid', vendRef: null, failureReason: null });
    const response = await getRequest('txn-1');
    expect(response.status).toBe(404);
  });

  it("200s a transaction belonging to the authenticated machine", async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    findByIdMock.mockResolvedValue({ machineId: 'm-1', status: 'vend_authorized', vendRef: 'mock-vend-1', failureReason: null });
    const response = await getRequest('txn-1');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'vend_authorized', vendRef: 'mock-vend-1', failureReason: null });
  });
});
