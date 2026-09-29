import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), audit: vi.fn(), findMachine: vi.fn(), reconcileMachine: vi.fn(), align: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: mocks.session }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: mocks.audit }));
vi.mock('@/repositories/machineRepository', () => ({ machineRepository: { findById: mocks.findMachine } }));
vi.mock('@/services/machineInventoryMovementService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineInventoryMovementService')>('@/services/machineInventoryMovementService');
  return { ...actual, machineInventoryMovementService: { reconcileMachine: mocks.reconcileMachine, alignSlotToLedger: mocks.align } };
});

import { GET, POST } from '@/app/api/vending/machines/[id]/stock-check/route';
import { LedgerAlignmentRefusedError } from '@/services/machineInventoryMovementService';

const ADMIN = { uid: 'staff-1', email: 'a@example.com', displayName: 'A', roles: ['admin'], businessId: 'biz-1' };
const ctx = { params: Promise.resolve({ id: 'm-1' }) };
const post = (body: unknown) => POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'm-1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(ADMIN);
  mocks.findMachine.mockResolvedValue({ machineCode: 'SQ-1' });
  mocks.reconcileMachine.mockResolvedValue([{ slotCode: 'A01', productId: 'p', cached: 9, ledgerDerived: 6, matches: false }]);
  mocks.align.mockResolvedValue({ before: 9, after: 6, changed: true });
});

describe('/api/vending/machines/[id]/stock-check', () => {
  it('GET needs machines.view and a machine in the caller business', async () => {
    mocks.session.mockResolvedValueOnce({ ...ADMIN, effectivePermissions: ['sales.view'] });
    expect((await GET(new Request('http://localhost/x'), ctx)).status).toBe(403);
    mocks.findMachine.mockResolvedValueOnce(null);
    expect((await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) })).status).toBe(404);
    expect(mocks.reconcileMachine).not.toHaveBeenCalled();
    const ok = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(await ok.json()).toMatchObject({ mismatches: 1 });
    expect(mocks.reconcileMachine).toHaveBeenCalledWith('biz-1', 'm-1');
  });

  it('POST needs machine_inventory.adjust and a reason, and audits a change', async () => {
    mocks.session.mockResolvedValueOnce({ ...ADMIN, effectivePermissions: ['machines.view'] });
    const denied = await post({ slotCode: 'A01', reason: 'x' });
    expect(denied.status).toBe(403);
    expect((await denied.json()).permission).toBe('machine_inventory.adjust');
    expect((await post({ slotCode: 'A01', reason: ' ' })).status).toBe(400);
    expect(mocks.align).not.toHaveBeenCalled();

    expect((await post({ slotCode: 'A01', reason: 'edited by hand' })).status).toBe(200);
    expect(mocks.align).toHaveBeenCalledWith({ businessId: 'biz-1', machineId: 'm-1', slotCode: 'A01', reason: 'edited by hand' });
    expect(mocks.audit).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'align_slot_count_to_ledger', entityId: 'm-1__A01', before: { currentQuantity: 9 }, after: { currentQuantity: 6, reason: 'edited by hand' } }));
  });

  it('409s a refusal and audits nothing when nothing changed', async () => {
    mocks.align.mockRejectedValueOnce(new LedgerAlignmentRefusedError('below zero'));
    expect((await post({ slotCode: 'A01', reason: 'x' })).status).toBe(409);
    mocks.align.mockResolvedValueOnce({ before: 6, after: 6, changed: false });
    expect((await post({ slotCode: 'A01', reason: 'x' })).status).toBe(200);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
