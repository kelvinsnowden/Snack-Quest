import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { machineService } from '@/services/machineService';
import { isRegisteredAdapterKey, listAdapterRegistrations } from '@/lib/vending/adapterRegistry';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/**
 * Provisions a new physical Discovery Machine (§ MACHINE INSTALLATION
 * WORKFLOW, § DEVICE SECURITY). A machine never registers itself —
 * only a staff action can mint the device credential a gateway will
 * be flashed with, which is why this is a staff-session route (the
 * same auth model `/api/admin/**` already uses), not a device-auth
 * one. The plaintext secret in the response is returned exactly once;
 * there is no way to retrieve it again after this call.
 *
 * Admins only: registering a machine hands out the secret a device
 * signs with, so a warehouse login is not enough to mint one.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'machines.create')) {
    return forbiddenForPermission('machines.create');
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

  if (machineCode !== undefined && machineCode !== null && (typeof machineCode !== 'string' || !machineCode)) {
    return Response.json({ error: 'machineCode must be a non-empty string when provided (omit it to have one generated)' }, { status: 400 });
  }
  if (typeof serialNumber !== 'string' || !serialNumber) {
    return Response.json({ error: 'serialNumber is required' }, { status: 400 });
  }
  if (!isRegisteredAdapterKey(manufacturer)) {
    const keys = listAdapterRegistrations().map((entry) => entry.key);
    return Response.json({ error: `manufacturer must be a registered adapter key: ${keys.join(', ')}` }, { status: 400 });
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
    const { machineId, machineCode: assignedMachineCode, credential } = await machineService.provisionDevice({
      businessId: session.businessId,
      machineCode: (machineCode as string | null | undefined) ?? null,
      serialNumber,
      manufacturer,
      model,
      hardwareVersion: (hardwareVersion as string | null) ?? null,
      firmwareVersion: (firmwareVersion as string | null) ?? null,
      ownerPartnerId: (ownerPartnerId as string | null) ?? null,
      actor: session.uid,
    });
    return Response.json({ machineId, machineCode: assignedMachineCode, credential }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'could not register machine' }, { status: 400 });
  }
}
