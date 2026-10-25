import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerInvoiceService } from '@/services/ownerInvoiceService';

/**
 * Where one of the owner's invoices stands — what the Pay button polls
 * while the M-Pesa prompt is on their phone. Asks Safaricom directly once
 * the callback is overdue, so a lost callback doesn't leave it looking
 * unpaid.
 */
export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { invoiceId } = await params;
  const invoice = await ownerInvoiceService.findForPartner(session.businessId, session.partnerId, invoiceId);
  if (!invoice) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  return Response.json({
    status: invoice.status,
    promptPending: invoice.pendingPrompt !== null,
    receipt: invoice.payment?.reference ?? null,
  });
}
