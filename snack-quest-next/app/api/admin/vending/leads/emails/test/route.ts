import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { leadNurtureService, NurtureSequenceValidationError } from '@/services/leadNurtureService';

/** `POST /api/admin/vending/leads/emails/test` `{ email }` — sends one email from the editor to the signed-in staff member. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.manage')) return forbiddenForPermission('owners.manage');
  if (!session.email) return Response.json({ error: 'Your account has no email address to send a test to.' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  try {
    await leadNurtureService.sendTest(body?.email, session.email);
    return Response.json({ sentTo: session.email });
  } catch (error) {
    if (error instanceof NurtureSequenceValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error('[leads/emails/test] send failed', error);
    return Response.json({ error: 'The test email could not be sent. Check the email settings.' }, { status: 502 });
  }
}
