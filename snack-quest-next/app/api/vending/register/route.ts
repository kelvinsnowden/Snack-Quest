import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineService } from '@/services/machineService';
import type { Machine } from '@/types';

const VALID_MANUFACTURERS: Machine['manufacturer'][] = ['mock', 'shengma', 'other'];

/**
 * Provisions a new physical Discovery Machine (§ MACHINE INSTALLATION
 * WORKFLOW, § DEVICE SECURITY). A machine never registers itself —
 * only a staff action can mint the device credential a gateway will
 * be flashed with, which is why this is a staff-session route (the
 * same auth model `/api/admin/**` already uses), not a device-auth
 * one. The plaintext secret in the response is returned exactly once;
 * there is no way to retrieve it again after this call.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const {
    machineCode,
    serialNumber,
    manufacturer,
    model,
    hardwareVersion,
    firmwareVersion,
    ownerPartnerId,
  } = (body ?? {}) as Record<string, unknown>;

  if (typeof machineCode !== 'string' || !machineCode) {
    return Response.json({ error: 'machineCode is required' }, { status: 400 });
  }
  if (typeof serialNumber !== 'string' || !serialNumber) {
    return Response.json({ error: 'serialNumber is required' }, { status: 400 });
  }
  if (typeof manufacturer !== 'string' || !VALID_MANUFACTURERS.includes(manufacturer as Machine['manufacturer'])) {
    return Response.json({ error: `manufacturer must be one of: ${VALID_MANUFACTURERS.join(', ')}` }, { status: 400 });
  }
  if (typeof model !== 'string' || !model) {
    return Response.json({ error: 'model is required' }, { status: 400 });
  }
  if (hardwareVersion !== undefined && hardwareVersion !== null && typeof hardwareVersion !== 'string') {
    return Response.json({ error: 'hardwareVersion must be a string when provided' }, { status: 400 });
  }
  if (firmwareVersion !== undefined && firmwareVersion !== null && typeof firmwareVersion !== 'string') {
    return Response.json({ error: 'firmwareVersion must be a string when provided' }, { status: 400 });
  }
  if (ownerPartnerId !== undefined && ownerPartnerId !== null && typeof ownerPartnerId !== 'string') {
    return Response.json({ error: 'ownerPartnerId must be a string when provided' }, { status: 400 });
  }

  try {
    const { machineId, credential } = await machineService.provisionDevice({
      businessId: session.businessId,
      machineCode,
      serialNumber,
      manufacturer: manufacturer as Machine['manufacturer'],
      model,
      hardwareVersion: (hardwareVersion as string | null) ?? null,
      firmwareVersion: (firmwareVersion as string | null) ?? null,
      ownerPartnerId: (ownerPartnerId as string | null) ?? null,
      actor: session.uid,
    });
    return Response.json({ machineId, credential }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'could not register machine' }, { status: 400 });
  }
}
