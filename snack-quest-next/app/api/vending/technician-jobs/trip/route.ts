import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { technicianErrorResponse } from '@/lib/vending/technicianJobHttp';
import { technicianJobService } from '@/services/technicianJobService';

/** `POST` `{ step: 'pack' | 'leave' }` — moves every restock on the signed-in person's round along together (`advanceTrip`). Needs `restock.execute`. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'restock.execute')) return forbiddenForPermission('restock.execute');
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const step = body.step === 'pack' || body.step === 'leave' ? body.step : null;
  if (!step) return Response.json({ error: 'step must be pack or leave' }, { status: 400 });
  try {
    const result = await technicianJobService.advanceTrip(session.businessId, session.uid, step);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: `technician_trip.${step}`, entityType: 'technicianJob', entityId: session.uid, after: result });
    return Response.json(result);
  } catch (error) {
    return technicianErrorResponse(error);
  }
}
