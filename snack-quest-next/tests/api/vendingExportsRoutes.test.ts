import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  audit: vi.fn(),
  findMachine: vi.fn(),
  listMachines: vi.fn(),
  listMovements: vi.fn(),
  listOwners: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: mocks.session }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: mocks.audit }));
vi.mock('@/repositories/machineRepository', () => ({ machineRepository: { findById: mocks.findMachine, listAllForBusiness: mocks.listMachines } }));
vi.mock('@/repositories/machineInventoryMovementRepository', () => ({ machineInventoryMovementRepository: { listByMachineInRange: mocks.listMovements } }));
vi.mock('@/repositories/partnerRepository', () => ({ partnerRepository: { listByBusiness: mocks.listOwners } }));

import { GET as stockExport } from '@/app/api/vending/machines/[id]/stock-movements/export/route';
import { GET as ownersExport } from '@/app/api/vending/partners/export/route';

const ADMIN = { uid: 'staff-1', email: 'a@example.com', displayName: 'A', roles: ['admin'], businessId: 'biz-1' };
const stock = (qs = '') => stockExport(new Request(`http://localhost/api/vending/machines/m-1/stock-movements/export${qs}`), { params: Promise.resolve({ id: 'm-1' }) });
const owners = () => ownersExport(new Request('http://localhost/api/vending/partners/export'));

const movement = (overrides: Record<string, unknown> = {}) => ({
  id: 'mv-1',
  data: {
    businessId: 'biz-1',
    machineId: 'm-1',
    slotId: 'm-1__A01',
    productId: 'p-1',
    reason: 'restock',
    quantityDelta: 5,
    beforeQuantity: 2,
    afterQuantity: 7,
    sourceTransactionId: null,
    restockTaskId: 'task-1',
    batchId: null,
    expiresAt: null,
    note: '=HYPERLINK("http://evil")',
    actor: 'staff-2',
    createdAt: Timestamp.fromDate(new Date('2026-09-01T09:30:00Z')),
    ...overrides,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(ADMIN);
  mocks.findMachine.mockResolvedValue({ machineCode: 'SQ-001', businessId: 'biz-1' });
  mocks.listMovements.mockResolvedValue([movement()]);
});

describe('GET /api/vending/machines/[id]/stock-movements/export', () => {
  it('needs machine_inventory.export', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await stock()).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ ...ADMIN, effectivePermissions: ['machines.view'] });
    const denied = await stock();
    expect(denied.status).toBe(403);
    expect((await denied.json()).permission).toBe('machine_inventory.export');
    expect(mocks.listMovements).not.toHaveBeenCalled();
  });

  it("404s a machine that isn't in the caller's business", async () => {
    mocks.findMachine.mockResolvedValueOnce(null);
    expect((await stock()).status).toBe(404);
    expect(mocks.findMachine).toHaveBeenCalledWith('biz-1', 'm-1');
    expect(mocks.listMovements).not.toHaveBeenCalled();
  });

  it('refuses bad, impossible, reversed and over-long ranges', async () => {
    for (const qs of ['?from=2026-9-1', '?from=2026-02-30', '?from=2026-09-10&to=2026-09-01', '?from=2024-01-01&to=2026-01-01']) {
      expect((await stock(qs)).status).toBe(400);
    }
    expect(mocks.listMovements).not.toHaveBeenCalled();
  });

  it('writes whole Nairobi days, oldest first, formula-safe, and audits the download', async () => {
    const response = await stock('?from=2026-09-01&to=2026-09-02');
    expect(response.status).toBe(200);
    const [, machineId, since, until] = mocks.listMovements.mock.calls[0];
    expect(machineId).toBe('m-1');
    expect((since as Date).toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect((until as Date).toISOString()).toBe('2026-09-02T21:00:00.000Z');
    const csv = await response.text();
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toContain('Reason');
    expect(row).toContain('2026-09-01 12:30:00');
    expect(row).toContain('A01,p-1,restock,2,5,7');
    expect(row).not.toMatch(/,=HYPERLINK/);
    expect(response.headers.get('X-Truncated')).toBe('false');
    expect(mocks.audit).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'export_stock_movements', entityId: 'm-1', machineId: 'm-1' }));
  });

  it('says when it cut the file short', async () => {
    mocks.listMovements.mockResolvedValueOnce(Array.from({ length: 10001 }, (_, i) => movement({ note: null, actor: `a-${i}` })));
    const response = await stock();
    expect(response.headers.get('X-Truncated')).toBe('true');
    expect((await response.text()).trim().split('\r\n')).toHaveLength(10001);
  });
});

describe('GET /api/vending/partners/export', () => {
  it('needs owners.export', async () => {
    mocks.session.mockResolvedValueOnce({ ...ADMIN, effectivePermissions: ['owners.view'] });
    const denied = await owners();
    expect(denied.status).toBe(403);
    expect((await denied.json()).permission).toBe('owners.export');
    expect(mocks.listOwners).not.toHaveBeenCalled();
  });

  it("lists each owner with the machines they own now, leaving out retired ones, and audits it", async () => {
    mocks.listOwners.mockResolvedValue([
      { id: 'p-1', data: { name: 'Wanjiru', status: 'active', contactPhone: '254711000111', contactEmail: 'w@example.com', authUid: 'uid-1' } },
      { id: 'p-2', data: { name: '@Other', status: 'suspended', contactPhone: null, contactEmail: null, authUid: null } },
    ]);
    mocks.listMachines.mockResolvedValue([
      { id: 'm-1', data: { machineCode: 'SQ-002', ownerPartnerId: 'p-1', status: 'active' } },
      { id: 'm-2', data: { machineCode: 'SQ-001', ownerPartnerId: 'p-1', status: 'active' } },
      { id: 'm-3', data: { machineCode: 'SQ-OLD', ownerPartnerId: 'p-1', status: 'decommissioned' } },
    ]);
    const response = await owners();
    expect(response.status).toBe(200);
    const lines = (await response.text()).trim().split('\r\n');
    expect(lines[1]).toBe('Wanjiru,active,254711000111,w@example.com,yes,2,SQ-001 SQ-002');
    expect(lines[2].startsWith('@Other')).toBe(false);
    expect(lines[2]).toContain(',suspended,,,no,0,');
    expect(mocks.audit).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'export_owners', after: { rowCount: 2 } }));
  });
});
