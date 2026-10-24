import {
  MeetingSlotTakenError,
  OrderMeetingRateLimitError,
  OrderMeetingValidationError,
  orderMeetingService,
} from '@/services/orderMeetingService';

/**
 * `POST /api/leads/meeting` `{ fullName, whatsapp, email, location, mode, atMs }`
 * — someone booking the meeting where they place a machine order, from
 * the public `/meet` page (§ order meetings).
 *
 * Public and unauthenticated, like `/api/machine-owners/interest`: the
 * link goes out in one email to every lead, so there is no per-person
 * token. It only writes; nothing here reads back anyone's booking.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });

  try {
    const { atMs } = await orderMeetingService.book({
      fullName: body.fullName,
      whatsapp: body.whatsapp,
      email: body.email,
      location: body.location,
      mode: body.mode,
      atMs: body.atMs,
      submitterIp:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? undefined,
    });
    return Response.json({ atMs });
  } catch (error) {
    if (error instanceof MeetingSlotTakenError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof OrderMeetingValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof OrderMeetingRateLimitError) return Response.json({ error: error.message }, { status: 429 });
    console.error('[leads/meeting] booking failed', error);
    return Response.json({ error: 'Something went wrong saving your booking. Please try again.' }, { status: 500 });
  }
}
