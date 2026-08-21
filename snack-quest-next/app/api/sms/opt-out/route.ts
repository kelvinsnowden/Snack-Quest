import { verifyOptOutToken } from '@/lib/sms/optOutLink';
import { smsOptOutRepository } from '@/repositories/smsOptOutRepository';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * `POST /api/sms/opt-out` — the customer-facing end of the opt-out link
 * carried by every marketing SMS.
 *
 * POST, not GET, even though the link in the message is a GET. Link
 * scanners, SMS clients and messaging previews fetch URLs without a
 * human ever tapping them, and an opt-out that fires on prefetch would
 * silently unsubscribe customers who never asked. The page behind the
 * link renders a single confirm button that calls this — one tap, which
 * keeps the opt-out as easy as it must be, while requiring a real one.
 *
 * Public and unauthenticated by necessity: the recipient is a guest
 * customer with no account (see `types/smsOptOut.ts`). The signed token
 * is the authorisation — it proves we issued this link for this number,
 * so nobody can opt out a number they merely happen to know.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { token } = (body ?? {}) as { token?: unknown };
  if (typeof token !== 'string' || !token) {
    return Response.json({ error: 'token is required' }, { status: 400 });
  }

  const phoneNumber = verifyOptOutToken(token);
  if (!phoneNumber) {
    // Deliberately the same answer for a forged token and a malformed
    // one: distinguishing them would confirm which numbers we hold.
    return Response.json({ error: 'This link is not valid.' }, { status: 400 });
  }

  await smsOptOutRepository.recordOptOut({
    businessId: getCurrentBusinessId(),
    phoneNumber,
    source: 'customer_link',
  });

  return Response.json({ ok: true });
}
