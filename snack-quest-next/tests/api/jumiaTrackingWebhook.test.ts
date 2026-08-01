import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  parseTrackingWebhookMock,
  applyTrackingUpdateMock,
  recordIfNewMock,
  markProcessedMock,
  markFailedMock,
  verifyJumiaWebhookRequestMock,
} = vi.hoisted(() => ({
  parseTrackingWebhookMock: vi.fn(),
  applyTrackingUpdateMock: vi.fn(),
  recordIfNewMock: vi.fn(),
  markProcessedMock: vi.fn(),
  markFailedMock: vi.fn(),
  verifyJumiaWebhookRequestMock: vi.fn(),
}));

vi.mock('@/lib/integrations/jumia/jumiaGateway', () => ({
  jumiaGateway: { parseTrackingWebhook: parseTrackingWebhookMock },
}));

vi.mock('@/services/deliveryService', () => ({
  deliveryService: { applyTrackingUpdate: applyTrackingUpdateMock },
}));

vi.mock('@/repositories/webhookEventRepository', () => ({
  webhookEventRepository: {
    recordIfNew: recordIfNewMock,
    markProcessed: markProcessedMock,
    markFailed: markFailedMock,
  },
}));

vi.mock('@/lib/webhooks/verifyJumiaWebhookRequest', () => ({
  verifyJumiaWebhookRequest: verifyJumiaWebhookRequestMock,
}));

import { POST as trackingRoute } from '@/app/api/webhooks/jumia/[businessId]/route';

/**
 * Route-handler-level tests for the Jumia tracking webhook (§
 * Logistics: wire tracking webhook consumption) — `DeliveryService.
 * applyTrackingUpdate`'s real transition logic is covered by
 * tests/services/deliveryServiceAdmin.test.ts; this proves the wire:
 * origin verification first, payload parsing, idempotent recording,
 * and always acking 200 to a verified, well-formed request regardless
 * of whether a matching shipment was found.
 */

function request(businessId: string, body: unknown): Request {
  return new Request(`http://localhost/api/webhooks/jumia/${businessId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function call(businessId: string, body: unknown) {
  return trackingRoute(request(businessId, body), { params: Promise.resolve({ businessId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/webhooks/jumia/[businessId]', () => {
  it('rejects a request verifyJumiaWebhookRequest flags as invalid, without parsing the payload', async () => {
    verifyJumiaWebhookRequestMock.mockResolvedValue({ ok: false, response: new Response('Forbidden', { status: 403 }) });

    const response = await call('biz-1', {});

    expect(response.status).toBe(403);
    expect(parseTrackingWebhookMock).not.toHaveBeenCalled();
  });

  it('400s a payload the gateway reports as malformed', async () => {
    verifyJumiaWebhookRequestMock.mockResolvedValue({ ok: true });
    parseTrackingWebhookMock.mockImplementation(() => {
      throw new Error('Malformed Jumia tracking webhook payload: missing shipment_ref/status');
    });

    const response = await call('biz-1', { garbage: true });

    expect(response.status).toBe(400);
    expect(recordIfNewMock).not.toHaveBeenCalled();
  });

  it('acks 200 without reprocessing on a duplicate delivery', async () => {
    verifyJumiaWebhookRequestMock.mockResolvedValue({ ok: true });
    parseTrackingWebhookMock.mockReturnValue({
      courierShipmentRef: 'JUMIA-REF-1',
      status: 'delivered',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
    });
    recordIfNewMock.mockResolvedValue({ isNew: false });

    const response = await call('biz-1', { shipment_ref: 'JUMIA-REF-1', status: 'delivered' });

    expect(response.status).toBe(200);
    expect(applyTrackingUpdateMock).not.toHaveBeenCalled();
  });

  it('applies the update and marks the event processed on a new, matched delivery', async () => {
    verifyJumiaWebhookRequestMock.mockResolvedValue({ ok: true });
    const tracking = { courierShipmentRef: 'JUMIA-REF-1', status: 'delivered', lastUpdatedAt: '2026-01-01T00:00:00Z' };
    parseTrackingWebhookMock.mockReturnValue(tracking);
    recordIfNewMock.mockResolvedValue({ isNew: true });
    applyTrackingUpdateMock.mockResolvedValue({ shipmentId: 'shipment-1' });

    const response = await call('biz-1', { shipment_ref: 'JUMIA-REF-1', status: 'delivered' });

    expect(response.status).toBe(200);
    expect(applyTrackingUpdateMock).toHaveBeenCalledWith('biz-1', tracking);
    expect(markProcessedMock).toHaveBeenCalledWith('biz-1', 'jumia', 'JUMIA-REF-1:delivered:2026-01-01T00:00:00Z');
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it('still acks 200 but marks the event failed when no shipment matches', async () => {
    verifyJumiaWebhookRequestMock.mockResolvedValue({ ok: true });
    parseTrackingWebhookMock.mockReturnValue({ courierShipmentRef: 'no-match', status: 'delivered', lastUpdatedAt: '2026-01-01T00:00:00Z' });
    recordIfNewMock.mockResolvedValue({ isNew: true });
    applyTrackingUpdateMock.mockResolvedValue(null);

    const response = await call('biz-1', { shipment_ref: 'no-match', status: 'delivered' });

    expect(response.status).toBe(200);
    expect(markFailedMock).toHaveBeenCalled();
    expect(markProcessedMock).not.toHaveBeenCalled();
  });
});
