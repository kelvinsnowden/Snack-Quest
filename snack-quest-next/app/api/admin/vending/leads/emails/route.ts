import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { leadNurtureService, NurtureSequenceValidationError } from '@/services/leadNurtureService';

/** `PUT /api/admin/vending/leads/emails` `{ emails }` — saves the lead email sequence from the editor (§ lead nurture). */
export async function PUT(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.manage')) return forbiddenForPermission('owners.manage');

  const body = (await request.json().catch(() => null)) as { emails?: unknown } | null;
  try {
    const emails = await leadNurtureService.saveSequence(body?.emails, session.displayName || null);
    return Response.json({ emails });
  } catch (error) {
    if (error instanceof NurtureSequenceValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
