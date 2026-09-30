import 'server-only';

import { MachineNotFoundError } from '@/repositories/machineRepository';
import { KioskLayerNotFoundError, KioskVersionNotFoundError } from '@/repositories/kioskLayerRepository';
import { KioskConfigValidationError } from '@/lib/kiosk/experienceConfig';
import { KioskPublishBlockedError, KioskScopeError } from '@/services/kioskExperienceService';

/** Maps the kiosk builder's expected failures to responses; anything else is rethrown as a real error. */
export function kioskErrorResponse(error: unknown): Response {
  if (error instanceof KioskConfigValidationError) return Response.json({ error: error.message, problems: error.problems }, { status: 400 });
  if (error instanceof KioskPublishBlockedError) return Response.json({ error: error.message, check: error.check }, { status: 409 });
  if (error instanceof KioskScopeError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof KioskLayerNotFoundError || error instanceof KioskVersionNotFoundError || error instanceof MachineNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  throw error;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
