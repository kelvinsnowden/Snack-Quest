import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { ownerInvoiceService, OwnerInvoiceChangeRefusedError } from '@/services/ownerInvoiceService';

/**
 * Staff settle an owner invoice by hand (§ OWNER BILLING):
 * - `{ action: 'recordPayment', reference, amountKes }` — paid another way
 *   (bank, cash), in full;
 * - `{ action: 'void', reason }` — the charge is cancelled; a cancelled fee
 *   invoice waives that period on the subscription.
 * Either moves a fee invoice's subscription on, as paying it does.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ invoiceId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'owner_finance.invoices.manage')) {
    return forbiddenForPermission('owner_finance.invoices.manage');
  }
  const { invoiceId } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    const actor = session.email || session.uid;
    let invoice;
    if (body.action === 'recordPayment') {
      if (typeof body.reference !== 'string' || typeof body.amountKes !== 'number') {
        return Response.json({ error: 'Give the payment reference and amount.' }, { status: 400 });
      }
      invoice = await ownerInvoiceService.recordPayment(session.businessId, invoiceId, { reference: body.reference, amountKes: body.amountKes, actor });
    } else if (body.action === 'void') {
      if (typeof body.reason !== 'string') {
        return Response.json({ error: 'Say why it is cancelled.' }, { status: 400 });
      }
      invoice = await ownerInvoiceService.voidInvoice(session.businessId, invoiceId, body.reason);
    } else {
      return Response.json({ error: 'action must be recordPayment or void' }, { status: 400 });
    }
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: body.action === 'void' ? 'void_owner_invoice' : 'record_owner_invoice_payment',
      entityType: 'ownerInvoice',
      entityId: invoiceId,
      before: { status: 'open' },
      after: { status: invoice.status, totalKes: invoice.totalKes, reference: invoice.payment?.reference ?? null, voidReason: invoice.voidReason },
      machineId: invoice.machineId,
    });
    return Response.json({ ok: true, status: invoice.status });
  } catch (error) {
    if (error instanceof OwnerInvoiceChangeRefusedError) {
      return Response.json({ error: error.message }, { status: error.message === 'Invoice not found.' ? 404 : 409 });
    }
    throw error;
  }
}
