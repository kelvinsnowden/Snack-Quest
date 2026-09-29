import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { csvCell } from '@/services/vendingSalesService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Every machine owner as CSV (`owners.export`): contact details, status, portal sign-in and the machines they own now. Contact details are personal data, so the download is audited. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.export')) return forbiddenForPermission('owners.export');

  const [owners, machines] = await Promise.all([partnerRepository.listByBusiness(session.businessId), machineRepository.listAllForBusiness(session.businessId)]);
  const machinesByOwner = new Map<string, string[]>();
  for (const { data } of machines) {
    if (!data.ownerPartnerId || data.status === 'decommissioned') continue;
    machinesByOwner.set(data.ownerPartnerId, [...(machinesByOwner.get(data.ownerPartnerId) ?? []), data.machineCode]);
  }
  const header = ['Owner', 'Status', 'Phone', 'Email', 'Can sign in to the portal', 'Machines', 'Machine codes'];
  const lines = owners.map(({ id, data }) => {
    const codes = (machinesByOwner.get(id) ?? []).sort();
    return [csvCell(data.name), data.status, csvCell(data.contactPhone ?? ''), csvCell(data.contactEmail ?? ''), data.authUid ? 'yes' : 'no', String(codes.length), csvCell(codes.join(' '))];
  });
  const csv = [header.map(csvCell), ...lines].map((line) => line.join(',')).join('\r\n') + '\r\n';
  await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'export_owners', entityType: 'partner', entityId: 'all', after: { rowCount: lines.length } });
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="machine-owners.csv"', 'Cache-Control': 'no-store' } });
}
