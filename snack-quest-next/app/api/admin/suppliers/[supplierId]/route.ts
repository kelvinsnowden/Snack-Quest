import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  supplierService,
  SupplierNotFoundError,
  InvalidSupplierInputError,
} from '@/services/supplierService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

interface UpdateSupplierBody {
  name?: unknown;
  contactName?: unknown;
  phone?: unknown;
  email?: unknown;
  notes?: unknown;
  isActive?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ supplierId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { supplierId } = await params;

  let body: UpdateSupplierBody;
  try {
    body = (await request.json()) as UpdateSupplierBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'contactName', 'phone', 'notes'] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string') {
        return Response.json(
          { error: `"${key}" must be a string when provided.` },
          { status: 400 },
        );
      }
      patch[key] = body[key];
    }
  }
  if (body.email !== undefined) {
    if (body.email !== null && typeof body.email !== 'string') {
      return Response.json(
        { error: '"email" must be a string or null when provided.' },
        { status: 400 },
      );
    }
    patch.email = body.email;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      return Response.json(
        { error: '"isActive" must be a boolean when provided.' },
        { status: 400 },
      );
    }
    patch.isActive = body.isActive;
  }

  try {
    await supplierService.updateSupplier(
      session.businessId,
      supplierId,
      patch,
      session.uid,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'supplier.update',
      entityType: 'supplier',
      entityId: supplierId,
      after: patch,
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SupplierNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidSupplierInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not update supplier',
      },
      { status: 400 },
    );
  }
}
