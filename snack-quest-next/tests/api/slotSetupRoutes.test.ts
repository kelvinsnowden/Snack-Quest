import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  audit: vi.fn(),
  editSlot: vi.fn(),
  releaseQuarantine: vi.fn(),
  copyLayout: vi.fn(),
  listByMachine: vi.fn(),
  setPrice: vi.fn(),
  setEnabled: vi.fn(),
  findBySlotCode: vi.fn(),
  slotPriceHistory: vi.fn(),
  overrideHistory: vi.fn(),
  copyRange: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: mocks.session }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: mocks.audit }));
vi.mock('@/services/machineSlotService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineSlotService')>('@/services/machineSlotService');
  return { ...actual, machineSlotService: { editSlot: mocks.editSlot, releaseQuarantine: mocks.releaseQuarantine, copyLayout: mocks.copyLayout, listByMachine: mocks.listByMachine, setPrice: mocks.setPrice, setEnabled: mocks.setEnabled } };
});
vi.mock('@/repositories/machineSlotRepository', () => ({ machineSlotRepository: { findBySlotCode: mocks.findBySlotCode, listPriceHistory: mocks.slotPriceHistory } }));
vi.mock('@/repositories/machineAssortmentRepository', () => ({ machineAssortmentRepository: { listPriceHistory: mocks.overrideHistory } }));
vi.mock('@/services/machineAssortmentService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineAssortmentService')>('@/services/machineAssortmentService');
  return { ...actual, machineAssortmentService: { copyRange: mocks.copyRange } };
});

import { PUT as editSlot } from '@/app/api/vending/machines/[id]/slots/[slotCode]/route';
import { POST as returnToSale } from '@/app/api/vending/machines/[id]/slots/[slotCode]/return-to-sale/route';
import { POST as copyLayout } from '@/app/api/vending/machines/[id]/slots/copy/route';
import { PATCH as patchSlots } from '@/app/api/vending/machines/[id]/slots/route';
import { GET as priceHistory } from '@/app/api/vending/machines/[id]/price-history/route';
import { POST as copyRange } from '@/app/api/vending/machines/[id]/assortment/copy/route';
import { SlotChangeRefusedError } from '@/services/machineSlotService';

/** Slot setup permissions: configuring slots and setting prices are separate, and a paused slot only comes back through "Return to sale". */

const staff = (permissions: string[]) => ({ uid: 'staff-1', email: 's@example.com', displayName: 'S', roles: ['admin'], businessId: 'biz-1', permissions: [], effectivePermissions: permissions });
const SLOTS = staff(['machines.view', 'machines.slots.configure', 'machines.slots.toggle']);
const SLOTS_AND_PRICES = staff(['machines.view', 'machines.slots.configure', 'machines.slots.toggle', 'pricing.manage', 'machine_catalog.manage']);
const body = (value: unknown, method = 'POST') => new Request('http://localhost/x', { method, body: JSON.stringify(value) });
const slot = { id: 'm1', slotCode: 'A01' };
const ctx = <T,>(value: T) => ({ params: Promise.resolve(value) });
const SLOT_BODY = { productId: 'pkg-1', productCatalogue: 'package', priceKes: 350, capacity: 10, position: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.editSlot.mockResolvedValue({ before: null, after: { ...SLOT_BODY, slotCode: 'A01' } });
  mocks.releaseQuarantine.mockResolvedValue({ reason: 'jam', transactionId: 't-1' });
  mocks.copyLayout.mockResolvedValue({ copied: ['A01'] });
  mocks.copyRange.mockResolvedValue({ added: 2, alreadyCarried: 1 });
  mocks.slotPriceHistory.mockResolvedValue([]);
  mocks.overrideHistory.mockResolvedValue([]);
});

describe('slot setup routes', () => {
  it('a new slot, or a different price, needs pricing.manage as well as slot setup', async () => {
    mocks.session.mockResolvedValue(staff(['machines.view']));
    expect((await (await editSlot(body(SLOT_BODY, 'PUT'), ctx(slot))).json()).permission).toBe('machines.slots.configure');

    mocks.session.mockResolvedValue(SLOTS);
    mocks.findBySlotCode.mockResolvedValue(null);
    const newSlot = await editSlot(body(SLOT_BODY, 'PUT'), ctx(slot));
    expect(newSlot.status).toBe(403);
    expect((await newSlot.json()).permission).toBe('pricing.manage');
    mocks.findBySlotCode.mockResolvedValue({ priceKes: 300 });
    expect((await editSlot(body(SLOT_BODY, 'PUT'), ctx(slot))).status).toBe(403);
    expect(mocks.editSlot).not.toHaveBeenCalled();

    // Same price: slot setup alone is enough.
    mocks.findBySlotCode.mockResolvedValue({ priceKes: 350 });
    mocks.editSlot.mockResolvedValueOnce({ before: { ...SLOT_BODY, priceKes: 350 }, after: { ...SLOT_BODY } });
    expect((await editSlot(body(SLOT_BODY, 'PUT'), ctx(slot))).status).toBe(200);
    expect(mocks.editSlot).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-1', machineId: 'm1', slotCode: 'A01', actor: 'staff-1' }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'configure_slot', entityId: 'm1__A01' }));
  });

  it('creates a slot with pricing.manage, maps refusals to 409 and bad input to 400', async () => {
    mocks.session.mockResolvedValue(SLOTS_AND_PRICES);
    mocks.findBySlotCode.mockResolvedValue(null);
    expect((await editSlot(body(SLOT_BODY, 'PUT'), ctx(slot))).status).toBe(201);
    expect((await editSlot(body({ ...SLOT_BODY, capacity: '10' }, 'PUT'), ctx(slot))).status).toBe(400);
    expect((await editSlot(body({ ...SLOT_BODY, productCatalogue: 'x' }, 'PUT'), ctx(slot))).status).toBe(400);
    mocks.editSlot.mockRejectedValueOnce(new SlotChangeRefusedError('still holds 3'));
    expect((await editSlot(body(SLOT_BODY, 'PUT'), ctx(slot))).status).toBe(409);
  });

  it('returning a slot to sale needs a note, and switching a paused slot back on directly is refused', async () => {
    mocks.session.mockResolvedValue(SLOTS);
    expect((await returnToSale(body({ note: ' ' }), ctx(slot))).status).toBe(400);
    expect((await returnToSale(body({ note: 'Cleared a stuck bag' }), ctx(slot))).status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'return_slot_to_sale', before: { quarantine: { reason: 'jam', transactionId: 't-1' } }, after: { enabled: true, note: 'Cleared a stuck bag' } }));
    mocks.releaseQuarantine.mockRejectedValueOnce(new SlotChangeRefusedError('isn’t paused'));
    expect((await returnToSale(body({ note: 'x' }), ctx(slot))).status).toBe(409);

    mocks.listByMachine.mockResolvedValue([{ slotCode: 'A01', quarantine: { reason: 'jam', transactionId: 't-1' } }]);
    const direct = await patchSlots(body({ slotCode: 'A01', enabled: true }, 'PATCH'), ctx({ id: 'm1' }));
    expect(direct.status).toBe(409);
    expect(mocks.setEnabled).not.toHaveBeenCalled();
    // Switching it off (or leaving it off) is still fine.
    expect((await patchSlots(body({ slotCode: 'A01', enabled: false }, 'PATCH'), ctx({ id: 'm1' }))).status).toBe(200);
  });

  it('copying a layout with prices needs pricing.manage; copying a range with overrides too', async () => {
    mocks.session.mockResolvedValue(SLOTS);
    expect((await copyLayout(body({ fromMachineId: 'm2', includePrices: true }), ctx({ id: 'm1' }))).status).toBe(403);
    expect((await copyLayout(body({ fromMachineId: 'm2' }), ctx({ id: 'm1' }))).status).toBe(200);
    expect(mocks.copyLayout).toHaveBeenCalledWith('biz-1', 'm2', 'm1', { includePrices: false, actor: 'staff-1' });
    expect((await copyLayout(body({}), ctx({ id: 'm1' }))).status).toBe(400);
    expect((await copyRange(body({ fromMachineId: 'm2' }), ctx({ id: 'm1' }))).status).toBe(403);

    mocks.session.mockResolvedValue(staff(['machine_catalog.manage']));
    expect((await (await copyRange(body({ fromMachineId: 'm2', includePriceOverrides: true }), ctx({ id: 'm1' }))).json()).permission).toBe('pricing.manage');
    expect(await (await copyRange(body({ fromMachineId: 'm2' }), ctx({ id: 'm1' }))).json()).toEqual({ added: 2, alreadyCarried: 1 });
    expect(mocks.audit).toHaveBeenLastCalledWith(expect.any(Request), expect.objectContaining({ action: 'copy_machine_range' }));
  });

  it('price history needs a product and merges slot and override changes newest first', async () => {
    mocks.session.mockResolvedValue(SLOTS);
    expect((await priceHistory(new Request('http://localhost/x'), ctx({ id: 'm1' }))).status).toBe(400);
    const at = (iso: string) => ({ toDate: () => new Date(iso) });
    mocks.slotPriceHistory.mockResolvedValue([{ slotCode: 'A01', fromKes: 300, toKes: 350, changedBy: 'a', createdAt: at('2026-09-01T10:00:00Z') }]);
    mocks.overrideHistory.mockResolvedValue([{ previousPriceOverrideKes: null, newPriceOverrideKes: 320, actor: 'b', createdAt: at('2026-09-05T10:00:00Z') }]);
    const { history } = await (await priceHistory(new Request('http://localhost/x?productId=pkg-1'), ctx({ id: 'm1' }))).json();
    expect(history).toEqual([
      { kind: 'override', slotCode: null, fromKes: null, toKes: 320, changedBy: 'b', at: '2026-09-05T10:00:00.000Z' },
      { kind: 'slot', slotCode: 'A01', fromKes: 300, toKes: 350, changedBy: 'a', at: '2026-09-01T10:00:00.000Z' },
    ]);
    expect(mocks.slotPriceHistory).toHaveBeenCalledWith('biz-1', 'm1', 'pkg-1');
  });
});
