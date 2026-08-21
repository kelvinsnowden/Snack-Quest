import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingSmsService, MarketingSmsValidationError } from '@/services/marketingSmsService';
import { parseSmsDraftBody, type SmsDraftBody } from '@/lib/marketingSms/parseDraftBody';

/**
 * What this campaign would reach and cost, without sending it
 * (§ Admin: Marketing SMS).
 *
 * Resolves the audience through exactly the same method the send does,
 * so the numbers an operator approves are the numbers that will
 * happen — including the opt-outs it will skip and the segments it
 * will bill. A preview computed a second way would eventually disagree
 * with the send, and the disagreement would be discovered by spending
 * money.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: SmsDraftBody;
  try {
    body = (await request.json()) as SmsDraftBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = parseSmsDraftBody(body);
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const preview = await marketingSmsService.previewAudience(
      session.businessId,
      parsed.input.segment,
      parsed.input.customRecipients,
      parsed.input.bodyText,
      parsed.input.linkUrl,
      parsed.input.offerText,
    );
    return Response.json(preview);
  } catch (error) {
    // A bad merge tag is a message the composer must show, not a 500.
    if (error instanceof MarketingSmsValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
