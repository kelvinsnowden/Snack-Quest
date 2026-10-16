import { verifyLeadToken } from '@/lib/leads/leadLinks';
import { CallSlotTakenError, LeadBookingError, leadNurtureService } from '@/services/leadNurtureService';

/**
 * `POST /api/leads/call` `{ token, atMs, whatsapp }` — a lead booking or
 * moving their WhatsApp call from the link in their email (§ lead
 * nurture). The signed token is the only credential.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const leadId = typeof body?.token === 'string' ? verifyLeadToken(body.token) : null;
  if (!leadId) return Response.json({ error: 'This booking link isn’t valid.' }, { status: 400 });

  try {
    const atMs = await leadNurtureService.bookCall(leadId, { atMs: body?.atMs, whatsapp: body?.whatsapp });
    return Response.json({ atMs });
  } catch (error) {
    if (error instanceof CallSlotTakenError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof LeadBookingError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
