import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateDeviceMock, getSellableCatalogMock, getCatalogVersionMock } = vi.hoisted(() => ({
  authenticateDeviceMock: vi.fn(),
  getSellableCatalogMock: vi.fn(),
  getCatalogVersionMock: vi.fn(),
}));

vi.mock('@/lib/vending/deviceAuth', () => ({
  authenticateDevice: authenticateDeviceMock,
}));

vi.mock('@/services/machineAssortmentService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineAssortmentService')>('@/services/machineAssortmentService');
  return { ...actual, machineAssortmentService: { getSellableCatalog: getSellableCatalogMock, getCatalogVersion: getCatalogVersionMock } };
});

import { GET as catalogGet } from '@/app/api/vending/machines/[id]/catalog/route';
import { MachineNotFoundError } from '@/repositories/machineRepository';

beforeEach(() => {
  vi.clearAllMocks();
  getCatalogVersionMock.mockResolvedValue('2026-01-01T00:00:00.000Z');
});

function call(id = 'm-1') {
  return catalogGet(new Request(`http://localhost/api/vending/machines/${id}/catalog`), { params: Promise.resolve({ id }) });
}

describe('GET /api/vending/machines/[id]/catalog', () => {
  it('401s without a valid device credential', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'missing_header' });
    const response = await call();
    expect(response.status).toBe(401);
    expect(getSellableCatalogMock).not.toHaveBeenCalled();
  });

  it("404s a request for a different machine's catalog, never revealing it exists", async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    const response = await call('someone-elses-machine');
    expect(response.status).toBe(404);
    expect(getSellableCatalogMock).not.toHaveBeenCalled();
  });

  it('404s a machine the service reports as not found', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    getSellableCatalogMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await call('m-1');
    expect(response.status).toBe(404);
  });

  it("200s the authenticated machine's own sellable catalog", async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    getSellableCatalogMock.mockResolvedValue([
      { productId: 'sku-1', productCatalogue: 'snackItem', slotCode: 'A01', name: 'Korean Spicy Snack', description: null, imageUrl: null, category: null, priceKes: 350, sellable: true, displayOrder: 1, promotionalState: 'none' },
    ]);

    const response = await call('m-1');
    expect(response.status).toBe(200);
    expect(getSellableCatalogMock).toHaveBeenCalledWith('biz-1', 'm-1');
    expect(getCatalogVersionMock).toHaveBeenCalledWith('biz-1', 'm-1');
    const body = await response.json();
    expect(body.catalogVersion).toBe('2026-01-01T00:00:00.000Z');
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ productId: 'sku-1', sellable: true, priceKes: 350 });
  });

  it('returns the exact same catalogVersion across two reads when the underlying data has not changed', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    getSellableCatalogMock.mockResolvedValue([]);

    const first = await (await call('m-1')).json();
    const second = await (await call('m-1')).json();
    expect(first.catalogVersion).toBe(second.catalogVersion);
  });
});
