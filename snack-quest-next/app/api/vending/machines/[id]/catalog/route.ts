import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { MachineNotFoundError } from '@/repositories/machineRepository';

/**
 * The customer screen's own read (§ MACHINE CUSTOMER CATALOG,
 * § CUSTOMER SCREEN MUST BE THIN, docs/MACHINE_ASSORTMENT.md §3).
 * Device-authenticated and scoped to the authenticated token's own
 * machine — a machine's gateway can only ever fetch its own catalog,
 * the same discipline every other device route already holds. Every
 * decision in the response (price, sellability, display order) is
 * already made server-side; the screen renders it and decides nothing.
 *
 * `catalogVersion` is what a real gateway's local cache would compare
 * against its last-fetched version (§ LOCAL MACHINE CATALOG CACHE) —
 * an ISO timestamp of now, since this route always computes a fresh
 * read rather than serving a stale one; a gateway holding its own
 * cache decides for itself whether a re-fetch is worth it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  const { id } = await params;
  if (id !== auth.machineId) {
    // A device may only ever fetch its own catalog — never revealed
    // to exist for another machine, the same "not found, never
    // forbidden" discipline `GET /api/vending/payments/[id]` already
    // holds for cross-machine probing.
    return Response.json({ error: `Machine ${id} not found` }, { status: 404 });
  }

  try {
    const items = await machineAssortmentService.getSellableCatalog(auth.businessId, auth.machineId);
    return Response.json({ catalogVersion: new Date().toISOString(), items });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
