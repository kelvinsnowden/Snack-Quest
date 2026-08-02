import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';
import { creatorProfileService, InvalidProfileUpdateError } from '@/services/creatorProfileService';
import { CreatorNotFoundError } from '@/services/creatorDashboardService';
import type { PaymentPreference } from '@/types';

/** A creator editing their own profile after onboarding (§ Creator Portal profile management). */
export async function PATCH(request: Request): Promise<Response> {
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

  const { bio, niche, followersRange, paymentPreference, payoutPhoneNumber, socialHandles } = (body ?? {}) as {
    bio?: unknown;
    niche?: unknown;
    followersRange?: unknown;
    paymentPreference?: unknown;
    payoutPhoneNumber?: unknown;
    socialHandles?: unknown;
  };

  if (typeof bio !== 'string' || typeof niche !== 'string' || typeof followersRange !== 'string') {
    return Response.json({ error: 'bio, niche, and followersRange must be strings' }, { status: 400 });
  }
  if (paymentPreference !== 'mpesa' && paymentPreference !== 'bank') {
    return Response.json({ error: 'paymentPreference must be "mpesa" or "bank"' }, { status: 400 });
  }
  if (payoutPhoneNumber !== null && typeof payoutPhoneNumber !== 'string') {
    return Response.json({ error: 'payoutPhoneNumber must be a string or null' }, { status: 400 });
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
    await creatorProfileService.updateProfile(session.uid, {
      bio,
      niche,
      followersRange,
      paymentPreference: paymentPreference as PaymentPreference,
      payoutPhoneNumber: payoutPhoneNumber?.trim() || null,
      socialHandles: handles,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidProfileUpdateError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CreatorNotFoundError) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not update profile' },
      { status: 500 },
    );
  }
}
