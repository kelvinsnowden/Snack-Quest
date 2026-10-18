import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { planogramTemplateRepository } from '@/repositories/planogramTemplateRepository';

/** `DELETE` — removes a planogram template. Machines it was applied to keep their slots. */
export async function DELETE(request: Request, { params }: { params: Promise<{ templateId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.slots.configure')) return forbiddenForPermission('machines.slots.configure');
  const { templateId } = await params;
  if (!(await planogramTemplateRepository.delete(session.businessId, templateId))) return Response.json({ error: 'Template not found.' }, { status: 404 });
  await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'delete_planogram_template', entityType: 'planogramTemplate', entityId: templateId });
  return Response.json({ ok: true });
}
