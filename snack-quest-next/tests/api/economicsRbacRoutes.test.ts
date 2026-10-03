import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { effectivePermissions } from '@/lib/auth/permissions';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { priceBookService } from '@/services/priceBookService';

/**
 * Who may see and change the money behind a product (§ PRODUCT MANAGER
 * ROLE, § GRANULAR PERMISSIONS), checked on the real routes with each
 * template's real permissions: a product manager edits products but never
 * sees or sets Snack Quest's cost; finance sees costs but can't change them.
 */

const { verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({ verifyStaffSessionFromRequestMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { GET as getPrices, POST as setPrice } from '@/app/api/admin/products/[productCatalogue]/[productId]/prices/route';
import { GET as listSnacks, POST as createSnack } from '@/app/api/admin/snack-items/route';
import { PATCH as updateSnack } from '@/app/api/admin/snack-items/[id]/route';
import { GET as getPnl } from '@/app/api/vending/machines/[id]/pnl/route';
import { PATCH as setOwnership } from '@/app/api/vending/machines/[id]/economics/route';

const BUSINESS_ID = 'biz-economics-rbac';

function sessionAs(role: 'admin' | 'finance' | 'warehouse' | 'agent', template: string | null = null) {
  return { uid: `staff-${template ?? role}`, email: 'x@example.com', displayName: 'X', roles: [role], businessId: BUSINESS_ID, permissions: [], effectivePermissions: effectivePermissions({ roles: [role], template }) };
}
const PRODUCT_MANAGER = sessionAs('admin', 'product_manager');
const FINANCE = sessionAs('finance');
const ADMIN = sessionAs('admin');
const MARKETING = sessionAs('admin', 'marketing');
const TECHNICIAN = sessionAs('admin', 'machine_operations');

const json = (url: string, method: string, body?: unknown) => new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const priceParams = (productId: string) => ({ params: Promise.resolve({ productCatalogue: 'snackItem', productId }) });

let snackId: string;

beforeEach(async () => {
  vi.clearAllMocks();
  for (const collection of ['snackItems', 'productPrices', 'productPriceCurrent']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  snackId = await snackItemRepository.create({ businessId: BUSINESS_ID, name: 'Pocky', imageUrl: null, expectedUnitCostKes: 180, unitLabel: 'box', origin: 'Japan', sourcingNote: null, isActive: true }, 'staff-1');
  await priceBookService.setPrice({ businessId: BUSINESS_ID, productCatalogue: 'snackItem', productId: snackId, priceType: 'owner_wholesale', amountKes: 250, reason: 'owner price list', actor: 'staff-1' });
});

describe('price book routes', () => {
  it('a product manager sees neither the landed cost nor the owner price — not even in the history', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(PRODUCT_MANAGER);
    const response = await getPrices(json('http://x/api', 'GET'), priceParams(snackId));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.visibleTypes).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/180|250/);
  });

  it('finance sees every price but cannot change any', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE);
    const body = await (await getPrices(json('http://x/api', 'GET'), priceParams(snackId))).json();
    expect(body.current).toMatchObject({ landed_cost: 180, owner_wholesale: 250 });
    expect((await setPrice(json('http://x/api', 'POST', { priceType: 'landed_cost', amountKes: 200, reason: 'test' }), priceParams(snackId))).status).toBe(403);
    expect((await setPrice(json('http://x/api', 'POST', { priceType: 'owner_wholesale', amountKes: 260, reason: 'test' }), priceParams(snackId))).status).toBe(403);
  });

  it('an admin changes a price with a reason; the change is recorded', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    const response = await setPrice(json('http://x/api', 'POST', { priceType: 'landed_cost', amountKes: 200, reason: 'supplier raised prices' }), priceParams(snackId));
    expect(response.status).toBe(201);
    expect((await priceBookService.currentPrices(BUSINESS_ID, 'snackItem', snackId)).landedCostKes).toBe(200);
  });
});

describe('snack routes', () => {
  it('a product manager lists snacks without costs', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(PRODUCT_MANAGER);
    const body = await (await listSnacks(json('http://x/api/admin/snack-items', 'GET'))).json();
    expect(body.items[0].expectedUnitCostKes).toBeNull();
  });

  it('a product manager creates a snack without a cost; its cost stays unset until someone with cost access sets it', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(PRODUCT_MANAGER);
    const response = await createSnack(json('http://x/api/admin/snack-items', 'POST', { name: 'Hi-Chew', unitLabel: 'pack' }));
    expect(response.status).toBe(201);
    const { itemId } = await response.json();
    expect((await snackItemRepository.findById(itemId))?.costPending).toBe(true);
    expect((await priceBookService.currentPrices(BUSINESS_ID, 'snackItem', itemId)).landedCostKes).toBeNull();
  });

  it('a product manager can edit a snack’s details but not its cost', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(PRODUCT_MANAGER);
    const params = { params: Promise.resolve({ id: snackId }) };
    expect((await updateSnack(json('http://x/api', 'PATCH', { name: 'Pocky Chocolate', unitLabel: 'box' }), params)).status).toBe(200);
    expect((await updateSnack(json('http://x/api', 'PATCH', { name: 'Pocky Chocolate', unitLabel: 'box', expectedUnitCostKes: 90 }), params)).status).toBe(403);
    expect((await snackItemRepository.findById(snackId))?.expectedUnitCostKes).toBe(180);
  });

  it('a cost change by someone allowed goes into the price history', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    await updateSnack(json('http://x/api', 'PATCH', { name: 'Pocky', unitLabel: 'box', expectedUnitCostKes: 190, costChangeReason: 'new supplier' }), { params: Promise.resolve({ id: snackId }) });
    const history = await priceBookService.history(BUSINESS_ID, 'snackItem', snackId);
    expect(history.find(({ data }) => data.priceType === 'landed_cost')?.data).toMatchObject({ amountKes: 190, reason: 'new supplier' });
  });
});

describe('machine economics routes', () => {
  it('the P&L needs finance.machine_pnl.view; marketing and technicians are refused', async () => {
    for (const session of [MARKETING, TECHNICIAN, PRODUCT_MANAGER]) {
      verifyStaffSessionFromRequestMock.mockResolvedValue(session);
      expect((await getPnl(json('http://x/api', 'GET'), { params: Promise.resolve({ id: 'any' }) })).status).toBe(403);
    }
  });

  it('only machines.economics.manage may change who owns a machine', async () => {
    for (const session of [FINANCE, TECHNICIAN, PRODUCT_MANAGER, MARKETING]) {
      verifyStaffSessionFromRequestMock.mockResolvedValue(session);
      expect((await setOwnership(json('http://x/api', 'PATCH', { ownershipType: 'snack_quest' }), { params: Promise.resolve({ id: 'any' }) })).status).toBe(403);
    }
  });
});
