import { ADMIN_ONLY, ADMIN_OR_WAREHOUSE } from '@/lib/auth/requireStaffRole';
import { readJsonObject, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { machineSlotService } from '@/services/machineSlotService';
import { RegistryValidationError } from '@/services/manufacturerRegistryService';
import { slotMappingHistoryRepository } from '@/repositories/slotMappingHistoryRepository';
import { toJsonSafe } from '@/lib/vending/serializeIntegration';

/** The mapping's full history for this machine, newest first — append-only, never rewritten. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_OR_WAREHOUSE, async (session) => {
    const history = await slotMappingHistoryRepository.listForMachine(session.businessId, id);
    return Response.json(toJsonSafe({ history }));
  });
}

/**
 * Sets which manufacturer slot name each Snack Quest slot answers to
 * (`{ mappings: [{ slotCode, manufacturerSlotId | null }] }`). Applied
 * all-or-nothing; refused if two slots would end up claiming one
 * manufacturer name. Admins only: the mapping decides which motor turns
 * for a paid sale, so a wrong one dispenses the wrong product.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    if (!Array.isArray(body.mappings) || body.mappings.length === 0) {
      throw new RegistryValidationError('mappings must be a non-empty array');
    }
    const mappings = body.mappings.map((entry) => {
      const { slotCode, manufacturerSlotId } = (entry ?? {}) as Record<string, unknown>;
      if (typeof slotCode !== 'string' || (manufacturerSlotId !== null && typeof manufacturerSlotId !== 'string')) {
        throw new RegistryValidationError('each mapping needs a slotCode string and a manufacturerSlotId string or null');
      }
      return { slotCode, manufacturerSlotId: manufacturerSlotId === '' ? null : (manufacturerSlotId as string | null) };
    });
    const slots = await machineSlotService.setSlotMappings(session.businessId, id, mappings, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'set_slot_mapping', entityType: 'machine', entityId: id, after: { mappings }, machineId: id });
    return Response.json({ slots: slots.map((slot) => ({ slotCode: slot.slotCode, manufacturerSlotId: slot.manufacturerSlotId ?? null })) });
  });
}
