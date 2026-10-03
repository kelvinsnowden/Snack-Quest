import 'server-only';

import { KioskConfigValidationError, KioskPublishBlockedError, OwnerDesignError } from '@/services/kioskOwnerDesignService';
import { KioskScopeError } from '@/services/kioskExperienceService';

/** Maps owner screen design failures to responses; anything else is a real error. */
export function ownerDesignErrorResponse(error: unknown): Response {
  if (error instanceof KioskConfigValidationError) return Response.json({ error: error.message, problems: error.problems }, { status: 400 });
  if (error instanceof KioskPublishBlockedError) return Response.json({ error: error.message, problems: error.check.errors }, { status: 409 });
  if (error instanceof OwnerDesignError) return Response.json({ error: error.message }, { status: error.message === 'not found' || error.message === 'Owner not found.' ? 404 : 409 });
  if (error instanceof KioskScopeError) return Response.json({ error: 'not found' }, { status: 404 });
  throw error;
}
