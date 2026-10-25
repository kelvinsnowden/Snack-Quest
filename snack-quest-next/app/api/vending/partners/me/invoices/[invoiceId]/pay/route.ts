import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { normalizeKenyanPhone, InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { ownerInvoiceService, OwnerInvoiceChangeRefusedError, OwnerInvoicePaymentError } from '@/services/ownerInvoiceService';

/**
 * The owner pays one of their invoices: an M-Pesa prompt for the whole
 * amount goes to the phone they give. The invoice is the owner's own
 * (`session.partnerId`, never the body), and the amount and account come
 * from the invoice, never the request.
 */
export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { invoiceId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { phoneNumber } = (body ?? {}) as Record<string, unknown>;
  let phone: string;
  try {
    phone = normalizeKenyanPhone(typeof phoneNumber === 'string' ? phoneNumber : '');
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) return Response.json({ error: 'Enter the M-Pesa number to pay from, like 0712 345 678.' }, { status: 400 });
    throw error;
  }

  try {
    const { checkoutRequestId, customerMessage } = await ownerInvoiceService.startPayment({ businessId: session.businessId, partnerId: session.partnerId, invoiceId, phone });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.partnerId,
      action: 'owner_invoice_payment_prompt',
      entityType: 'ownerInvoice',
      entityId: invoiceId,
      after: { checkoutRequestId },
      source: 'owner_portal',
    });
    return Response.json({ ok: true, message: customerMessage });
  } catch (error) {
    if (error instanceof OwnerInvoiceChangeRefusedError) {
      return Response.json({ error: error.message }, { status: error.message === 'Invoice not found.' ? 404 : 409 });
    }
    if (error instanceof OwnerInvoicePaymentError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
