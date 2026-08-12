import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingEmailService } from '@/services/marketingEmailService';
import type { MarketingEmailSegment } from '@/types';

const SEGMENTS: MarketingEmailSegment[] = ['all_creators', 'active_creators', 'pending_creators', 'suspended_creators', 'custom'];

interface RecipientsBody {
  segment?: unknown;
  customRecipients?: unknown;
}

/** A live recipient count for the composer's segment picker and its "Send to N recipients?" confirmation — resolves the real segment, never an estimate (§ Admin: Marketing Emails). */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: RecipientsBody;
  try {
    body = (await request.json()) as RecipientsBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body.segment !== 'string' || !SEGMENTS.includes(body.segment as MarketingEmailSegment)) {
    return Response.json({ error: `"segment" must be one of: ${SEGMENTS.join(', ')}.` }, { status: 400 });
  }
  if (
    body.customRecipients !== undefined &&
    body.customRecipients !== null &&
    (!Array.isArray(body.customRecipients) || body.customRecipients.some((entry) => typeof entry !== 'string'))
  ) {
    return Response.json({ error: '"customRecipients" must be an array of strings or null.' }, { status: 400 });
  }

  const count = await marketingEmailService.previewRecipientCount(
    session.businessId,
    body.segment as MarketingEmailSegment,
    (body.customRecipients as string[] | null | undefined) ?? null,
  );
  return Response.json({ count });
}
