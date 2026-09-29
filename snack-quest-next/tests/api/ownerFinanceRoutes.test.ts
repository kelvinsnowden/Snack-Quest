import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  audit: vi.fn(),
  previewDraft: vi.fn(),
  setAdjustment: vi.fn(),
  discardDraft: vi.fn(),
  findById: vi.fn(),
  listByPartner: vi.fn(),
  findMachine: vi.fn(),
  listMachinesByPartner: vi.fn(),
  findPartner: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: mocks.session }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: mocks.audit }));
vi.mock('@/services/machineSettlementService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineSettlementService')>('@/services/machineSettlementService');
  return { ...actual, machineSettlementService: { previewDraft: mocks.previewDraft, setAdjustment: mocks.setAdjustment, discardDraft: mocks.discardDraft, findById: mocks.findById, listByPartner: mocks.listByPartner } };
});
vi.mock('@/repositories/machineRepository', async () => {
  const actual = await vi.importActual<typeof import('@/repositories/machineRepository')>('@/repositories/machineRepository');
  return { ...actual, machineRepository: { findById: mocks.findMachine, listByPartner: mocks.listMachinesByPartner } };
});
vi.mock('@/services/partnerService', async () => {
  const actual = await vi.importActual<typeof import('@/services/partnerService')>('@/services/partnerService');
  return { ...actual, partnerService: { findById: mocks.findPartner } };
});

import { POST as preview } from '@/app/api/vending/machines/[id]/settlements/preview/route';
import { PATCH as adjust, DELETE as discard } from '@/app/api/vending/settlements/[id]/route';
import { POST as finalize } from '@/app/api/vending/settlements/[id]/finalize/route';
import { GET as exportCsv } from '@/app/api/vending/partners/[partnerId]/settlements/export/route';
import { SettlementChangeRefusedError } from '@/services/machineSettlementService';

/** Owner finance routes: preview and corrections need settlement-manage, finalize needs the reviewed amount, the CSV needs owner-finance view. */

const staff = (permissions: string[]) => ({ uid: 'staff-1', email: 's@example.com', displayName: 'S', roles: ['admin'], businessId: 'biz-1', permissions: [], effectivePermissions: permissions });
const MANAGE = staff(['owner_finance.view', 'owner_finance.settlements.manage']);
const req = (body?: unknown, method = 'POST', url = 'http://localhost/x') => new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = <T,>(value: T) => ({ params: Promise.resolve(value) });
const ts = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMachine.mockResolvedValue({ ownerPartnerId: 'p-1', machineCode: 'SQ-1' });
  mocks.previewDraft.mockResolvedValue({ draft: { grossSalesKes: 300, refundsKes: 0, cogsKes: 100, unpricedSaleCount: 0, subscriptionChargedKes: 0, distributableOwnerKes: 200, failedVendRefundsKes: 0, outcomeConflictCount: 0, agreementId: null, partnerShareKes: null }, overlapsSettlementId: null });
  mocks.setAdjustment.mockResolvedValue({ before: 0, after: -50 });
  mocks.findById.mockResolvedValue({ machineId: 'm-1' });
  mocks.discardDraft.mockResolvedValue({ machineId: 'm-1', partnerId: 'p-1', periodStart: ts('2026-08-01T00:00:00Z'), periodEnd: ts('2026-09-01T00:00:00Z'), grossSalesKes: 300, cogsKes: 100, subscriptionChargedKes: 0, distributableOwnerKes: 200, adjustmentKes: 0 });
});

describe('owner finance routes', () => {
  it('preview and corrections need settlements.manage; viewing money alone is not enough', async () => {
    mocks.session.mockResolvedValue(staff(['owner_finance.view']));
    for (const response of [
      await preview(req({ periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' }), ctx({ id: 'm-1' })),
      await adjust(req({ adjustmentKes: -50, reason: 'x' }, 'PATCH'), ctx({ id: 's-1' })),
      await discard(req(undefined, 'DELETE'), ctx({ id: 's-1' })),
    ]) {
      expect(response.status).toBe(403);
      expect((await response.json()).permission).toBe('owner_finance.settlements.manage');
    }
    expect(mocks.previewDraft).not.toHaveBeenCalled();
    expect(mocks.setAdjustment).not.toHaveBeenCalled();
    expect(mocks.discardDraft).not.toHaveBeenCalled();
  });

  it('previews a finished period for the machine’s owner, and refuses a period still running or an unowned machine', async () => {
    mocks.session.mockResolvedValue(MANAGE);
    const response = await preview(req({ periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' }), ctx({ id: 'm-1' }));
    expect(response.status).toBe(200);
    expect((await response.json()).preview.distributableOwnerKes).toBe(200);
    expect(mocks.previewDraft).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1', partnerId: 'p-1' }));

    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await preview(req({ periodStart: '2026-08-01T00:00:00Z', periodEnd: future }), ctx({ id: 'm-1' }))).status).toBe(400);
    mocks.findMachine.mockResolvedValueOnce({ ownerPartnerId: null });
    expect((await preview(req({ periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' }), ctx({ id: 'm-1' }))).status).toBe(409);
  });

  it('adjusts and discards drafts with an audit entry, and maps refusals to 409', async () => {
    mocks.session.mockResolvedValue(MANAGE);
    expect((await adjust(req({ adjustmentKes: -50, reason: 'Damaged stock' }, 'PATCH'), ctx({ id: 's-1' }))).status).toBe(200);
    expect(mocks.setAdjustment).toHaveBeenCalledWith('biz-1', 's-1', -50, 'Damaged stock', 'staff-1');
    expect(mocks.audit).toHaveBeenLastCalledWith(expect.any(Request), expect.objectContaining({ action: 'adjust_settlement', before: { adjustmentKes: 0 }, after: { adjustmentKes: -50, reason: 'Damaged stock' } }));
    expect((await adjust(req({ adjustmentKes: '-50' }, 'PATCH'), ctx({ id: 's-1' }))).status).toBe(400);
    mocks.setAdjustment.mockRejectedValueOnce(new SettlementChangeRefusedError('Only a draft can be adjusted.'));
    expect((await adjust(req({ adjustmentKes: 5, reason: 'x' }, 'PATCH'), ctx({ id: 's-1' }))).status).toBe(409);

    expect((await discard(req(undefined, 'DELETE'), ctx({ id: 's-1' }))).status).toBe(200);
    expect(mocks.audit).toHaveBeenLastCalledWith(expect.any(Request), expect.objectContaining({ action: 'discard_settlement_draft', after: null, before: expect.objectContaining({ distributableOwnerKes: 200 }) }));
  });

  it('finalize needs the reviewed amount', async () => {
    mocks.session.mockResolvedValue(staff(['owner_finance.settlements.finalize']));
    expect((await finalize(req(undefined), ctx({ id: 's-1' }))).status).toBe(400);
    expect((await finalize(req({ expectedAmountKes: '200' }), ctx({ id: 's-1' }))).status).toBe(400);
  });

  it('exports an owner’s settlements as CSV with what each credits, and audits the export', async () => {
    mocks.session.mockResolvedValue(staff(['owner_finance.view']));
    mocks.findPartner.mockResolvedValue({ name: 'Acme Kiosks Ltd' });
    mocks.listMachinesByPartner.mockResolvedValue([{ id: 'm-1', data: { machineCode: 'SQ-1' } }]);
    mocks.listByPartner.mockResolvedValue([{ id: 's-1', data: { machineId: 'm-1', periodStart: ts('2026-08-01T00:00:00+03:00'), periodEnd: ts('2026-09-01T00:00:00+03:00'), status: 'finalized', grossSalesKes: 300, refundsKes: 0, cogsKes: 100, unpricedSaleCount: 0, subscriptionChargedKes: 0, adjustmentKes: -50, adjustmentReason: '=cmd()', distributableOwnerKes: 200, finalizedAt: ts('2026-09-02T10:00:00Z') } }]);
    const response = await exportCsv(req(undefined, 'GET'), ctx({ partnerId: 'p-1' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('settlements-Acme-Kiosks-Ltd.csv');
    const lines = (await response.text()).trim().split('\r\n');
    expect(lines[1]).toBe("s-1,SQ-1,2026-08-01,2026-08-31,finalized,300,0,100,0,0,-50,'=cmd(),150,2026-09-02");
    expect(mocks.audit).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'export_owner_settlements', after: { rowCount: 1 } }));

    mocks.session.mockResolvedValue(staff(['owners.view']));
    expect((await exportCsv(req(undefined, 'GET'), ctx({ partnerId: 'p-1' }))).status).toBe(403);
  });
});
