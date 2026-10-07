import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { snackCatalogExportService } from '@/services/snackCatalogExportService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

// Every snack photo is fetched from storage while the zip streams.
export const maxDuration = 300;

/**
 * The snack catalogue as a zip (`products.view`): every photo in this
 * business's `snacks/` storage, `catalog.csv` and an offline
 * `index.html`. Cost is only included for `products.cost.view`, same as
 * the Snacks page. The export itself is audited.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'products.view')) return forbiddenForPermission('products.view');

  const showCost = hasPermission(session, 'products.cost.view');
  const catalog = await snackCatalogExportService.export(session.businessId, { showCost });

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'export_snack_catalog',
    entityType: 'business',
    entityId: session.businessId,
    after: { snackCount: catalog.snackCount, imageCount: catalog.imageCount, includesCost: showCost },
  });

  return new Response(catalog.stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${catalog.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
