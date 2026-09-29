import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, recordAuditLogMock, review, sales } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  recordAuditLogMock: vi.fn(),
  review: { getSale: vi.fn(), resolve: vi.fn() },
  sales: { exportCsv: vi.fn() },
}));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: recordAuditLogMock }));
vi.mock('@/services/vendingSaleReviewService', async () => {
  const actual = await vi.importActual<typeof import('@/services/vendingSaleReviewService')>('@/services/vendingSaleReviewService');
  return { ...actual, vendingSaleReviewService: review };
});
vi.mock('@/services/vendingSalesService', async () => {
  const actual = await vi.importActual<typeof import('@/services/vendingSalesService')>('@/services/vendingSalesService');
  return { ...actual, vendingSalesService: sales };
});

import { POST as resolveRoute } from '@/app/api/vending/sales/[id]/resolve/route';
import { GET as exportRoute } from '@/app/api/vending/sales/export/route';
import { SaleReviewError } from '@/services/vendingSaleReviewService';
import { SalesFilterError } from '@/services/vendingSalesService';

/**
 * Deciding what happens to a customer's money, and taking the sales list
 * (with M-Pesa receipts) away as a file, are admin and finance decisions —
 * never warehouse, never a support agent, never anyone signed out.
 */

const ADMIN = { uid: 'staff-1', email: 'a@example.com', displayName: 'A', roles: ['admin'], businessId: 'biz-1' };
const FINANCE = { ...ADMIN, uid: 'fin-1', roles: ['finance'] };
const WAREHOUSE = { ...ADMIN, roles: ['warehouse'] };
const AGENT = { ...ADMIN, roles: ['agent'] };

const resolve = (body: unknown, id = 'tx-1') =>
  resolveRoute(new Request(`http://localhost/api/vending/sales/${id}/resolve`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const exportCsv = (query = '') => exportRoute(new Request(`http://localhost/api/vending/sales/export${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  review.getSale.mockResolvedValue({ sale: { status: 'paid_vend_failed', amountKes: 250, machineId: 'm-1' } });
  review.resolve.mockResolvedValue({ status: 'refund_requested', message: 'ok' });
  sales.exportCsv.mockResolvedValue({ csv: 'a,b\r\n', rowCount: 1, truncated: false });
});

describe('POST /api/vending/sales/[id]/resolve', () => {
  it('401s signed out and 403s warehouse and support agents, touching nothing', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await resolve({ action: 'start_refund', note: 'x' })).status).toBe(401);
    for (const session of [WAREHOUSE, AGENT]) {
      verifyStaffSessionFromRequestMock.mockResolvedValue(session);
      expect((await resolve({ action: 'start_refund', note: 'Slot jammed' })).status).toBe(403);
    }
    expect(review.resolve).not.toHaveBeenCalled();
  });

  it('lets finance decide, scoped to the session’s business, and audits the decision with its note', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE);
    const response = await resolve({ action: 'start_refund', note: '  Slot jammed  ', businessId: 'someone-else' });
    expect(response.status).toBe(200);
    expect(review.resolve).toHaveBeenCalledWith('biz-1', 'tx-1', { action: 'start_refund', note: '  Slot jammed  ', reference: null }, 'fin-1');
    expect(recordAuditLogMock).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ businessId: 'biz-1', actorId: 'fin-1', action: 'sale_review_start_refund', entityType: 'machineTransaction', entityId: 'tx-1', machineId: 'm-1', after: expect.objectContaining({ note: 'Slot jammed', status: 'refund_requested' }) }),
    );
  });

  it('400s an unknown action or a missing note', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    expect((await resolve({ action: 'give_free_snacks', note: 'x' })).status).toBe(400);
    expect((await resolve({ action: 'start_refund' })).status).toBe(400);
    expect(review.resolve).not.toHaveBeenCalled();
  });

  it('turns a refused decision into a message a person can act on', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    review.resolve.mockRejectedValueOnce(new SaleReviewError('A refund for this sale is already under way or done. Refresh to see it.', 'conflict'));
    const conflict = await resolve({ action: 'reverse_payment', note: 'again' });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toMatch(/already under way/);
    expect(recordAuditLogMock).not.toHaveBeenCalled();

    review.getSale.mockRejectedValueOnce(new SaleReviewError('No sale with that id.', 'not_found'));
    expect((await resolve({ action: 'start_refund', note: 'x y z' }, 'theirs')).status).toBe(404);
  });
});

describe('GET /api/vending/sales/export', () => {
  it('is admin and finance only', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await exportCsv()).status).toBe(401);
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE);
    expect((await exportCsv()).status).toBe(403);
    expect(sales.exportCsv).not.toHaveBeenCalled();
  });

  it('downloads the filtered CSV and audits the export', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    const response = await exportCsv('?status=refunded&machineCode=SQ-1&from=2026-09-01&to=2026-09-30');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toMatch(/attachment; filename="vending-sales-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(await response.text()).toBe('a,b\r\n');
    expect(sales.exportCsv).toHaveBeenCalledWith('biz-1', { status: 'refunded', machineCode: 'SQ-1', from: '2026-09-01', to: '2026-09-30' });
    expect(recordAuditLogMock).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'export_vending_sales', after: expect.objectContaining({ rowCount: 1 }) }));
  });

  it('400s an unknown status or a bad date', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    expect((await exportCsv('?status=stolen')).status).toBe(400);
    sales.exportCsv.mockRejectedValueOnce(new SalesFilterError('2026-02-30 is not a real date.'));
    const bad = await exportCsv('?from=2026-02-30');
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/not a real date/);
  });
});
