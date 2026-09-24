import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  verifyStaffSessionFromRequestMock,
  listByMachineMock,
  assortProductMock,
  unassortProductMock,
  linkSlotMock,
  setVisibleMock,
  setPriceOverrideMock,
  listPriceHistoryMock,
} = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  listByMachineMock: vi.fn(),
  assortProductMock: vi.fn(),
  unassortProductMock: vi.fn(),
  linkSlotMock: vi.fn(),
  setVisibleMock: vi.fn(),
  setPriceOverrideMock: vi.fn(),
  listPriceHistoryMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/machineAssortmentService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineAssortmentService')>('@/services/machineAssortmentService');
  return {
    ...actual,
    machineAssortmentService: {
      listByMachine: listByMachineMock,
      assortProduct: assortProductMock,
      unassortProduct: unassortProductMock,
      linkSlot: linkSlotMock,
      setVisible: setVisibleMock,
      setPriceOverride: setPriceOverrideMock,
    },
  };
});

vi.mock('@/repositories/machineAssortmentRepository', async () => {
  const actual = await vi.importActual<typeof import('@/repositories/machineAssortmentRepository')>('@/repositories/machineAssortmentRepository');
  return {
    ...actual,
    machineAssortmentRepository: { listPriceHistory: listPriceHistoryMock },
  };
});

import { GET as assortmentGet, POST as assortmentPost } from '@/app/api/vending/machines/[id]/assortment/route';
import { PATCH as assortmentPatch, GET as priceHistoryGet } from '@/app/api/vending/machines/[id]/assortment/[productCatalogue]/[productId]/route';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { ProductNotFoundError } from '@/services/machineAssortmentService';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const WAREHOUSE_SESSION = { ...STAFF_SESSION, roles: ['warehouse'] };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };
const FINANCE_SESSION = { ...STAFF_SESSION, roles: ['finance'] };

const ASSORTMENT_ROW = {
  businessId: 'biz-1',
  machineId: 'm-1',
  productId: 'sku-1',
  productCatalogue: 'snackItem',
  assorted: true,
  slotCode: null,
  displayOrder: 0,
  category: null,
  customerFacingName: null,
  customerFacingDescription: null,
  customerFacingImageUrl: null,
  priceOverrideKes: null,
  promotionalState: 'none',
  effectiveFrom: null,
  effectiveTo: null,
  visible: true,
  updatedAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
};

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

describe('GET /api/vending/machines/[id]/assortment', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await assortmentGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(401);
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await assortmentGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(403);
  });

  it('200s the serialized assortment for a finance session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    listByMachineMock.mockResolvedValue([ASSORTMENT_ROW]);
    const response = await assortmentGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assortment).toEqual([expect.objectContaining({ productId: 'sku-1', assorted: true })]);
    expect(listByMachineMock).toHaveBeenCalledWith('biz-1', 'm-1');
  });
});

describe('POST /api/vending/machines/[id]/assortment', () => {
  function post(body: unknown) {
    return assortmentPost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: 'm-1' }),
    });
  }

  it('403s a warehouse-only session is allowed, agent is not', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await post({ productId: 'sku-1', productCatalogue: 'snackItem' });
    expect(response.status).toBe(403);
  });

  it('400s a missing productId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE_SESSION);
    const response = await post({ productCatalogue: 'snackItem' });
    expect(response.status).toBe(400);
    expect(assortProductMock).not.toHaveBeenCalled();
  });

  it('400s an invalid productCatalogue', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE_SESSION);
    const response = await post({ productId: 'sku-1', productCatalogue: 'made_up' });
    expect(response.status).toBe(400);
  });

  it('201s and assorts, never letting the client claim a fabricated slot/price', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE_SESSION);
    assortProductMock.mockResolvedValue(undefined);
    listByMachineMock.mockResolvedValue([ASSORTMENT_ROW]);

    const response = await post({ productId: 'sku-1', productCatalogue: 'snackItem' });
    expect(response.status).toBe(201);
    expect(assortProductMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1', productId: 'sku-1', productCatalogue: 'snackItem', actor: 'staff-1' }),
    );

    // § PART 9 — AUDIT LOG: an assortment change is real, staff-attributed, and machine-scoped.
    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'assort_product', entityType: 'machineAssortment', machineId: 'm-1', actorId: 'staff-1' });
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    assortProductMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await post({ productId: 'sku-1', productCatalogue: 'snackItem' });
    expect(response.status).toBe(404);
  });

  it('404s a product that does not exist in the global catalogue', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    assortProductMock.mockRejectedValue(new ProductNotFoundError('snackItem', 'sku-x'));
    const response = await post({ productId: 'sku-x', productCatalogue: 'snackItem' });
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/vending/machines/[id]/assortment/[productCatalogue]/[productId]', () => {
  function patch(body: unknown, catalogue = 'snackItem') {
    return assortmentPatch(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: 'm-1', productCatalogue: catalogue, productId: 'sku-1' }),
    });
  }

  it('400s an invalid productCatalogue in the path', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await patch({ visible: false }, 'made_up');
    expect(response.status).toBe(400);
  });

  it('400s an empty body', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await patch({});
    expect(response.status).toBe(400);
  });

  it('applies unassort, linkSlot, setVisible and setPriceOverride when all are given', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listByMachineMock.mockResolvedValue([ASSORTMENT_ROW]);

    const response = await patch({ unassort: true, slotCode: 'A01', visible: false, priceOverrideKes: 250 });
    expect(response.status).toBe(200);
    expect(unassortProductMock).toHaveBeenCalledWith('biz-1', 'm-1', 'snackItem', 'sku-1');
    expect(linkSlotMock).toHaveBeenCalledWith('biz-1', 'm-1', 'snackItem', 'sku-1', 'A01');
    expect(setVisibleMock).toHaveBeenCalledWith('biz-1', 'm-1', 'snackItem', 'sku-1', false);
    expect(setPriceOverrideMock).toHaveBeenCalledWith('biz-1', 'm-1', 'snackItem', 'sku-1', 250, 'staff-1');
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await patch({ visible: true });
    expect(response.status).toBe(403);
  });
});

describe('GET /api/vending/machines/[id]/assortment/[productCatalogue]/[productId] — price history', () => {
  it('200s the audit trail', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    listPriceHistoryMock.mockResolvedValue([
      { previousPriceOverrideKes: null, newPriceOverrideKes: 250, actor: 'staff-1', createdAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') } },
    ]);
    const response = await priceHistoryGet(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: 'm-1', productCatalogue: 'snackItem', productId: 'sku-1' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.priceHistory).toEqual([expect.objectContaining({ newPriceOverrideKes: 250, actor: 'staff-1' })]);
  });
});
