import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineAssortmentService, ProductNotFoundError } from '@/services/machineAssortmentService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { serializeMachineAssortment } from '@/lib/vending/serialize';
import type { MachineAssortment } from '@/types';

const VALID_CATALOGUES: MachineAssortment['productCatalogue'][] = ['snackItem', 'package'];

/**
 * A machine's own assortment (§ MACHINE ASSORTMENT,
 * docs/MACHINE_ASSORTMENT.md) — Snack Quest's own decision that a
 * machine should carry a product, distinct from `GET .../catalog`
 * (device-authenticated, sellable-only, never merchandising intent) and
 * from `.../slots` (physical placement). `GET` is the staff view of
 * every row regardless of `assorted`/`visible`; `POST` assorts (or
 * re-enables) a product.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  const rows = await machineAssortmentService.listByMachine(session.businessId, id);
  return Response.json({ assortment: rows.map(serializeMachineAssortment) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const {
    productId,
    productCatalogue,
    displayOrder,
    category,
    customerFacingName,
    customerFacingDescription,
    customerFacingImageUrl,
    promotionalState,
  } = (body ?? {}) as Record<string, unknown>;

  if (typeof productId !== 'string' || !productId) {
    return Response.json({ error: 'productId is required' }, { status: 400 });
  }
  if (typeof productCatalogue !== 'string' || !VALID_CATALOGUES.includes(productCatalogue as MachineAssortment['productCatalogue'])) {
    return Response.json({ error: `productCatalogue must be one of: ${VALID_CATALOGUES.join(', ')}` }, { status: 400 });
  }

  try {
    await machineAssortmentService.assortProduct({
      businessId: session.businessId,
      machineId: id,
      productId,
      productCatalogue: productCatalogue as MachineAssortment['productCatalogue'],
      displayOrder: typeof displayOrder === 'number' ? displayOrder : undefined,
      category: typeof category === 'string' ? category : undefined,
      customerFacingName: typeof customerFacingName === 'string' ? customerFacingName : undefined,
      customerFacingDescription: typeof customerFacingDescription === 'string' ? customerFacingDescription : undefined,
      customerFacingImageUrl: typeof customerFacingImageUrl === 'string' ? customerFacingImageUrl : undefined,
      promotionalState: typeof promotionalState === 'string' ? (promotionalState as MachineAssortment['promotionalState']) : undefined,
      actor: session.uid,
    });
    const row = await machineAssortmentService
      .listByMachine(session.businessId, id)
      .then((rows) => rows.find((r) => r.productId === productId && r.productCatalogue === productCatalogue));
    return Response.json({ assortment: row ? serializeMachineAssortment(row) : null }, { status: 201 });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ProductNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
