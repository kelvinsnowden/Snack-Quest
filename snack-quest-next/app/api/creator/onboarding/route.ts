import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';
import {
  creatorProfileService,
  InvalidOnboardingInputError,
  OnboardingAlreadyCompletedError,
} from '@/services/creatorProfileService';
import type { PaymentPreference } from '@/types';

/** Completes a creator's onboarding (§ Creator Portal auth) — the one profile write every new creator makes between registering and reaching the dashboard. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyCreatorSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { bio, niche, followersRange, paymentPreference, socialHandles } = (body ?? {}) as {
    bio?: unknown;
    niche?: unknown;
    followersRange?: unknown;
    paymentPreference?: unknown;
    socialHandles?: unknown;
  };

  if (typeof bio !== 'string' || typeof niche !== 'string' || typeof followersRange !== 'string') {
    return Response.json({ error: 'bio, niche, and followersRange must be strings' }, { status: 400 });
  }
  if (paymentPreference !== 'mpesa' && paymentPreference !== 'bank') {
    return Response.json({ error: 'paymentPreference must be "mpesa" or "bank"' }, { status: 400 });
  }
  if (socialHandles !== undefined && (typeof socialHandles !== 'object' || socialHandles === null || Array.isArray(socialHandles))) {
    return Response.json({ error: 'socialHandles must be an object' }, { status: 400 });
  }

  const handles = Object.fromEntries(
    Object.entries((socialHandles as Record<string, unknown>) ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );

  try {
    await creatorProfileService.completeOnboarding(session.businessId, session.uid, {
      bio,
      niche,
      followersRange,
      paymentPreference: paymentPreference as PaymentPreference,
      socialHandles: handles,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidOnboardingInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof OnboardingAlreadyCompletedError) {
      return Response.json({ error: 'Onboarding is already complete' }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not complete onboarding' },
      { status: 500 },
    );
  }
}
