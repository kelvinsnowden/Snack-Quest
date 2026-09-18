import {
  investorInterestService,
  InvestorInterestValidationError,
  InvestorInterestRateLimitError,
} from '@/services/investorInterestService';

/**
 * `POST /api/invest/interest` (§ investor interest page) — where the
 * public `/invest` form submits.
 *
 * Public and unauthenticated, like the review route, and for the same
 * reason: the people we most want to hear from are strangers. What
 * makes that safe is the direction of travel — this endpoint only ever
 * writes. There is no `GET`, no list, no lookup by email, and the
 * security rule on `investorInterests` denies every client read
 * outright, so the one thing an attacker might actually want from a
 * lead list is not reachable from here at all.
 *
 * No money is collected on this page and none can be: nothing in this
 * route touches Daraja, a payment intent or an order.
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
    const result = await investorInterestService.submit({
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      location: payload.location,
      indicativeAmount: payload.indicativeAmount,
      investorType: payload.investorType,
      motivation: payload.motivation,
      heardFrom: payload.heardFrom,
      wantsUpdates: payload.wantsUpdates,
      referrer: payload.referrer,
      /*
       * Read from the proxy header rather than trusted from the body.
       * A client-supplied address would make the rate limit a
       * formality — anything wanting to get past it would simply send
       * a different one each time.
       */
      submitterIp:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        undefined,
    });

    /*
     * A duplicate answers 201 exactly as a first submission does. The
     * person tapped submit and we have their details — from where they
     * stand nothing is different, and saying otherwise would both
     * confuse somebody who double-tapped and confirm to a prober that
     * an address is on the list.
     */
    return Response.json({ interestId: result.interestId }, { status: 201 });
  } catch (error) {
    if (error instanceof InvestorInterestValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof InvestorInterestRateLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    console.error('[invest/interest] submission failed', error);
    return Response.json(
      { error: 'Something went wrong saving your details. Please try again.' },
      { status: 500 },
    );
  }
}
