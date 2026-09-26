import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineCommandService, CommandNotSupportedError } from '@/services/machineCommandService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { serializeMachineCommand } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { MachineCommandType } from '@/types';

const VALID_COMMAND_TYPES: MachineCommandType[] = ['restart'];

/**
 * The remote command center's staff-facing surface (§ types/machineCommand.ts).
 * `POST` writes what was asked; delivery to the machine happens
 * elsewhere (`GET /api/vending/commands`, device-authenticated) —
 * this route never touches the hardware adapter directly, unlike the
 * slots PATCH route, because the whole reason a command exists is
 * that the server cannot assume it can synchronously reach this
 * machine (§ types/machineCommand.ts's own doc comment).
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
  const url = new URL(request.url);
  const limit = url.searchParams.get('limit');
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const { commands, nextCursor } = await machineCommandService.listHistoryForMachine(session.businessId, id, {
    limit: limit ? Number(limit) : undefined,
    cursor,
  });
  return Response.json({
    commands: commands.map(({ id: commandId, data }) => serializeMachineCommand(commandId, data)),
    nextCursor,
  });
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

  const { commandType, payload } = (body ?? {}) as Record<string, unknown>;
  if (typeof commandType !== 'string' || !VALID_COMMAND_TYPES.includes(commandType as MachineCommandType)) {
    return Response.json({ error: `commandType must be one of: ${VALID_COMMAND_TYPES.join(', ')}` }, { status: 400 });
  }
  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return Response.json({ error: 'payload must be an object when provided' }, { status: 400 });
  }

  try {
    const { commandId, commandRef } = await machineCommandService.issueCommand({
      businessId: session.businessId,
      machineId: id,
      commandType: commandType as MachineCommandType,
      payload: (payload as Record<string, unknown> | undefined) ?? null,
      requestedBy: session.uid,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'issue_machine_command',
      entityType: 'machineCommand',
      entityId: commandId,
      after: { machineId: id, commandType, payload: payload ?? null },
      machineId: id,
    });
    return Response.json({ commandId, commandRef }, { status: 201 });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof CommandNotSupportedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
