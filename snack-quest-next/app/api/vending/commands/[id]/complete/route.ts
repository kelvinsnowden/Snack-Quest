import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineCommandService } from '@/services/machineCommandService';
import { MachineCommandNotFoundError, IllegalCommandTransitionError } from '@/repositories/machineCommandRepository';

/**
 * A device's own report of what happened after acknowledging a
 * command (§ types/machineCommand.ts) — applied verbatim, the same
 * "the device's own claim is a fact to record, never a fact to
 * embellish" discipline `MachineTransactionService.applyVendResult`
 * already holds for vend results.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { success, error: reportedError } = (body ?? {}) as Record<string, unknown>;
  if (typeof success !== 'boolean') {
    return Response.json({ error: 'success must be a boolean' }, { status: 400 });
  }
  if (reportedError !== undefined && reportedError !== null && typeof reportedError !== 'string') {
    return Response.json({ error: 'error must be a string when provided' }, { status: 400 });
  }

  try {
    await machineCommandService.complete(auth.businessId, id, auth.machineId, {
      success,
      error: (reportedError as string | null | undefined) ?? null,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MachineCommandNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalCommandTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
