import { verifyLeadToken } from '@/lib/leads/leadLinks';
import { leadNurtureService } from '@/services/leadNurtureService';

/** `POST /api/leads/stop-emails` `{ token }` — the confirm button behind the unsubscribe link in lead emails. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const leadId = typeof body?.token === 'string' ? verifyLeadToken(body.token) : null;
  if (!leadId) return Response.json({ error: 'This link isn’t valid.' }, { status: 400 });
  const found = await leadNurtureService.stopEmails(leadId);
  return found ? Response.json({ ok: true }) : Response.json({ error: 'This link isn’t valid.' }, { status: 404 });
}
