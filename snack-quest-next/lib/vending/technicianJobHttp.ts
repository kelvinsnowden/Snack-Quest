import 'server-only';

import { MaintenanceNotFoundError, MaintenanceStateError } from '@/services/maintenanceService';
import { TechnicianJobError } from '@/services/technicianJobService';

export function technicianErrorResponse(error: unknown): Response {
  if (error instanceof TechnicianJobError || error instanceof MaintenanceStateError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof MaintenanceNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  throw error;
}
