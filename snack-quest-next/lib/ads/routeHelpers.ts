import 'server-only';

import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasAnyPermission, type PermissionKey } from '@/lib/auth/permissions';
import { AdNotFoundError, AdStateError, AdValidationError } from '@/services/advertisingService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';
import type { StaffSession } from '@/services/staffAuthService';

/** Staff session holding at least one of `permissions`, or the response to send instead. */
export async function staffWith(request: Request, permissions: PermissionKey[]): Promise<StaffSession | Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasAnyPermission(session, permissions)) return forbiddenForPermission(permissions[0]);
  return session;
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Maps advertising's expected failures to responses; anything else is a real error. */
export function adErrorResponse(error: unknown): Response {
  if (error instanceof AdValidationError || error instanceof StorageValidationError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof AdStateError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof AdNotFoundError || error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof StorageUploadError) return Response.json({ error: error.message }, { status: 502 });
  throw error;
}

export function iso(value: unknown): string | null {
  return value && typeof (value as { toDate?: () => Date }).toDate === 'function' ? (value as { toDate(): Date }).toDate().toISOString() : null;
}
