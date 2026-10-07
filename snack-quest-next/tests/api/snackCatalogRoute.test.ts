import { describe, expect, it, vi } from 'vitest';

const { exportMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  exportMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/snackCatalogExportService', () => ({
  snackCatalogExportService: { export: exportMock },
}));
vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));
vi.mock('@/lib/audit/recordAuditLog', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/admin/snack-items/catalog/route';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const request = () => new Request('http://localhost/api/admin/snack-items/catalog');

describe('GET /api/admin/snack-items/catalog', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(exportMock).not.toHaveBeenCalled();
  });

  it('403s without products.view', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ uid: 'u', businessId: 'biz-1', roles: ['admin'], effectivePermissions: [] });
    expect((await GET(request())).status).toBe(403);
    expect(exportMock).not.toHaveBeenCalled();
  });

  it('streams the zip for the session business and audits the export', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ uid: 'u', businessId: 'biz-1', roles: ['admin'] });
    exportMock.mockResolvedValue({
      stream: new Response('zip-bytes').body,
      filename: 'snack-catalog-2026-10-07.zip',
      snackCount: 2,
      imageCount: 2,
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="snack-catalog-2026-10-07.zip"');
    expect(await response.text()).toBe('zip-bytes');
    expect(exportMock).toHaveBeenCalledWith('biz-1', { showCost: expect.any(Boolean) });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'export_snack_catalog', businessId: 'biz-1' }));
  });
});
