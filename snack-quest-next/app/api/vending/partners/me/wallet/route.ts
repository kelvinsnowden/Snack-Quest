import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { partnerService } from '@/services/partnerService';
import { listEarningsLedger } from '@/repositories/partnerRepository';
import { serializePartnerWallet, serializePartnerEarningsLedgerEntry } from '@/lib/vending/serialize';

/**
 * A partner's own wallet and earnings ledger (§ OWNER WALLET) — the
 * exact same read `app/api/vending/partners/[partnerId]/wallet/route.ts`
 * gives staff, now reachable by the partner themselves via their own
 * session rather than a staff member reading it on their behalf.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const partner = await partnerService.findById(session.businessId, session.partnerId);
  if (!partner) {
    return Response.json({ error: 'Partner not found' }, { status: 404 });
  }

  const ledger = await listEarningsLedger(session.partnerId);
  return Response.json({
    wallet: serializePartnerWallet(session.partnerId, partner),
    ledger: ledger.map(serializePartnerEarningsLedgerEntry),
  });
}
