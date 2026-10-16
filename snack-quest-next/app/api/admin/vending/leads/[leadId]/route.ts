import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import {
  vendingLeadService,
  VendingLeadNotFoundError,
  VendingLeadValidationError,
} from '@/services/vendingLeadService';

/**
 * `PATCH /api/admin/vending/leads/{leadId}` (§ vending leads CRM) —
 * move a lead through the pipeline, change its segment, set or clear
 * its follow-up date, add a note, and/or stop its nurture emails
 * (`stopEmails: true`). Any combination in one call.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'owners.manage')) {
    return forbiddenForPermission('owners.manage');
  }

  const { leadId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  try {
    await vendingLeadService.updateLead(
      leadId,
      {
        status: input.status,
        segment: input.segment,
        nextFollowUpAtMs: input.nextFollowUpAtMs,
        note: input.note,
        stopEmails: input.stopEmails,
      },
      { uid: session.uid, name: session.displayName || null },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof VendingLeadValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof VendingLeadNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
