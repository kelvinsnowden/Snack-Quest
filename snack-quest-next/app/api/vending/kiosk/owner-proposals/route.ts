import { staffWith } from '@/lib/ads/routeHelpers';
import { kioskOwnerDesignService } from '@/services/kioskOwnerDesignService';

/** Owners' screen design proposals waiting for review (`kiosk.view`). */
export async function GET(request: Request): Promise<Response> {
  const session = await staffWith(request, ['kiosk.view']);
  if (session instanceof Response) return session;
  const proposals = await kioskOwnerDesignService.listSubmitted(session.businessId);
  return Response.json({ proposals: proposals.map((proposal) => ({ partnerId: proposal.partnerId, patch: proposal.patch, submittedAt: proposal.submittedAt?.toDate().toISOString() ?? null, updatedAtMillis: proposal.updatedAt.toMillis() })) });
}
