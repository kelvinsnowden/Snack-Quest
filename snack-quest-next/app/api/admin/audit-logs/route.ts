import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { auditLogRepository } from '@/repositories/auditLogRepository';

/** Lists this business's staff-action trail (§ Admin: Audit Logs), newest first, optionally filtered to one entity type. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType') ?? undefined;
  const cursor = searchParams.get('cursor') ?? undefined;

  const { logs, nextCursor } = await auditLogRepository.listByBusiness(session.businessId, {
    entityType,
    cursor,
  });

  return Response.json({
    logs: logs.map(({ id, data }) => ({ id, ...data })),
    nextCursor,
  });
}
