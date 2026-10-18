import 'server-only';

import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import type { StaffSession } from '@/services/staffAuthService';
import { forbiddenForPermission, hasPermission, type PermissionKey } from '@/lib/auth/permissions';
import { MaintenanceNotFoundError, MaintenanceStateError } from '@/services/maintenanceService';
import { TechnicianJobError } from '@/services/technicianJobService';
import type { TechnicianJobKind } from '@/types';

/** Who may give out a kind of job, and who may do it. */
export const ASSIGN_PERMISSION: Record<TechnicianJobKind, PermissionKey> = { maintenance: 'maintenance.manage', restock: 'restock.plan' };
export const WORK_PERMISSION: Record<TechnicianJobKind, PermissionKey> = { maintenance: 'maintenance.manage', restock: 'restock.execute' };

export async function staffSession(request: Request): Promise<StaffSession | Response> {
  const session = await verifyStaffSessionFromRequest(request);
  return session ?? Response.json({ error: 'unauthorized' }, { status: 401 });
}

export function requirePermission(session: StaffSession, permission: PermissionKey): Response | null {
  return hasPermission(session, permission) ? null : forbiddenForPermission(permission);
}

export function technicianErrorResponse(error: unknown): Response {
  if (error instanceof TechnicianJobError || error instanceof MaintenanceStateError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof MaintenanceNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  throw error;
}
