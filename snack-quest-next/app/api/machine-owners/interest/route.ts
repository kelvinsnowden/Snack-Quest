import {
  machineOwnerInterestService,
  MachineOwnerInterestValidationError,
  MachineOwnerInterestRateLimitError,
} from '@/services/machineOwnerInterestService';

/**
 * `POST /api/machine-owners/interest` (§ machine-owner lead-generation
 * landing page) — where the public `/own` application form submits.
 *
 * Public and unauthenticated, same rationale as `/api/invest/interest`:
 * the people this exists to hear from are strangers, and the only
 * thing this endpoint does is write — no `GET`, no list, no lookup,
 * and the security rule on `machineOwnerInterests` denies every
 * client read outright.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;

  try {
    const result = await machineOwnerInterestService.submit({
      fullName: payload.fullName,
      whatsapp: payload.whatsapp,
      email: payload.email,
      capitalRange: payload.capitalRange,
      locationAccess: payload.locationAccess,
      locationCount: payload.locationCount,
      locationTypes: payload.locationTypes,
      ownerProfile: payload.ownerProfile,
      buildingPortfolio: payload.buildingPortfolio,
      submitterIp:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        undefined,
    });

    /* A duplicate answers 201 exactly as a first submission does — see `investorInterestService`'s own doc comment for why. */
    return Response.json({ interestId: result.interestId }, { status: 201 });
  } catch (error) {
    if (error instanceof MachineOwnerInterestValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MachineOwnerInterestRateLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    console.error('[machine-owners/interest] submission failed', error);
    return Response.json({ error: 'Something went wrong saving your details. Please try again.' }, { status: 500 });
  }
}
