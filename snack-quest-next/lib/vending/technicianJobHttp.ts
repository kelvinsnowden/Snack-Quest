import 'server-only';

import { MaintenanceNotFoundError, MaintenanceStateError } from '@/services/maintenanceService';
import { TechnicianJobError } from '@/services/technicianJobService';
import { IllegalRestockTaskTransitionError, RestockTaskItemIncompleteError, RestockTaskItemMismatchError, RestockTaskQuantityError } from '@/services/restockTaskService';

export function technicianErrorResponse(error: unknown): Response {
  if (error instanceof TechnicianJobError || error instanceof MaintenanceStateError || error instanceof IllegalRestockTaskTransitionError || error instanceof RestockTaskItemIncompleteError || error instanceof RestockTaskItemMismatchError || error instanceof RestockTaskQuantityError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof MaintenanceNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  throw error;
}
