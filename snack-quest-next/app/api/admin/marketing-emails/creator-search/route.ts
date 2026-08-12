import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingEmailService } from '@/services/marketingEmailService';

/** Backs the composer's "specific creators" picker — real creators only, matched by name/email/referral code (§ Admin: Marketing Emails). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const query = new URL(request.url).searchParams.get('q') ?? '';
  const results = await marketingEmailService.searchCreators(session.businessId, query);
  return Response.json({ results });
}
