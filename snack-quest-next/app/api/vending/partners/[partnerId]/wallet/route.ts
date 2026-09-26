import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { partnerService } from '@/services/partnerService';
import { listEarningsLedger } from '@/repositories/partnerRepository';
import { serializePartnerWallet, serializePartnerEarningsLedgerEntry } from '@/lib/vending/serialize';

/**
 * A partner's own wallet (§ OWNER WALLET, docs/MACHINE_COMMERCE.md §6):
 * the cached `availableCashKes`/`lifetimeEarnedKes` balance plus the
 * append-only ledger it's derived from, so a reader can verify the
 * balance rather than just trust it. Staff-facing only — there is no
 * partner login to scope this to the partner themselves yet
 * (§ MACHINE_COMMERCE.md §9), so this route is gated the same as every
 * other partner-financial read in this fleet: staff who can already
 * see the whole business's numbers, not partner-specific auth.
 */
export async function GET(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { partnerId } = await params;
  const partner = await partnerService.findById(session.businessId, partnerId);
  if (!partner) {
    return Response.json({ error: `Partner ${partnerId} not found` }, { status: 404 });
  }

  const ledger = await listEarningsLedger(partnerId);
  return Response.json({
    wallet: serializePartnerWallet(partnerId, partner),
    ledger: ledger.map(serializePartnerEarningsLedgerEntry),
  });
}
