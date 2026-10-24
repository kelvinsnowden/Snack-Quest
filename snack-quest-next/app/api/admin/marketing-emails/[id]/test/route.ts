import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { marketingEmailService, MarketingEmailNotFoundError } from '@/services/marketingEmailService';
import { hasPermission } from '@/lib/auth/permissions';

/**
 * Sends a saved campaign once to the signed-in staff member's own
 * address (§ Admin: Marketing Emails) — the way to see the real email,
 * and to check a "Send as" address is accepted, before it goes to
 * anyone else. Only ever to the caller, so it needs the same
 * permission as writing a campaign, not sending one.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'marketing.messages.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await marketingEmailService.sendTest(session.businessId, id, session.email);
    return Response.json({ to: session.email });
  } catch (error) {
    if (error instanceof MarketingEmailNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    // The provider's own words are what tell staff why "Send as" was refused.
    const message = error instanceof Error ? error.message : String(error);
    console.error('[marketing-emails/test] test send failed', message);
    return Response.json({ error: `The test didn’t send: ${message}` }, { status: 502 });
  }
}
