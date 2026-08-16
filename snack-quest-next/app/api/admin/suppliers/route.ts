import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  supplierService,
  InvalidSupplierInputError,
} from '@/services/supplierService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

interface CreateSupplierBody {
  name?: unknown;
  contactName?: unknown;
  phone?: unknown;
  email?: unknown;
  notes?: unknown;
}

/**
 * Creates a supplier (§ Inventory: batches, purchase orders,
 * suppliers, movements, low-stock alerts, expiry, audit trail).
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  let body: CreateSupplierBody;
  try {
    body = (await request.json()) as CreateSupplierBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (
    typeof body.name !== 'string' ||
    typeof body.contactName !== 'string' ||
    typeof body.phone !== 'string'
  ) {
    return Response.json(
      { error: '"name", "contactName", and "phone" are required strings.' },
      { status: 400 },
    );
  }
  if (
    body.email !== undefined &&
    body.email !== null &&
    typeof body.email !== 'string'
  ) {
    return Response.json(
      { error: '"email" must be a string or null when provided.' },
      { status: 400 },
    );
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return Response.json(
      { error: '"notes" must be a string when provided.' },
      { status: 400 },
    );
  }

  try {
    const supplierId = await supplierService.createSupplier(
      session.businessId,
      {
        name: body.name,
        contactName: body.contactName,
        phone: body.phone,
        email: body.email as string | null | undefined,
        notes: body.notes as string | undefined,
      },
      session.uid,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'supplier.create',
      entityType: 'supplier',
      entityId: supplierId,
      after: {
        name: body.name,
        contactName: body.contactName,
        phone: body.phone,
      },
    });

    return Response.json({ supplierId }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidSupplierInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not create supplier',
      },
      { status: 400 },
    );
  }
}
