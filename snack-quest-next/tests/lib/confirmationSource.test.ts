import { describe, expect, it } from 'vitest';
import { confirmationSourceOf } from '@/lib/payments/confirmationSource';
import type { WebhookEvent } from '@/types';

function event(payload: Record<string, unknown>): WebhookEvent {
  return {
    businessId: 'biz-1',
    provider: 'daraja',
    eventKind: 'stk_callback',
    providerEventId: 'ws_CO_123',
    status: 'processed',
    payload,
    relatedEntityId: null,
    receivedAt: new Date() as unknown as WebhookEvent['receivedAt'],
    processedAt: null,
    error: null,
  } as WebhookEvent;
}

/**
 * Telling a real Safaricom callback from this system asking Safaricom
 * what happened (§ was the callback ever received).
 *
 * Both produce a confirmed payment and a created order, so an order
 * existing proves nothing about the integration. The recovery sweep
 * working is precisely what would hide a broken callback URL — for
 * weeks, until the day the sweep is the thing that fails.
 */
describe('how a payment was confirmed', () => {
  it('reads a real Safaricom body as a callback', () => {
    expect(
      confirmationSourceOf(
        event({
          Body: {
            stkCallback: { CheckoutRequestID: 'ws_CO_123', ResultCode: 0, ResultDesc: 'Success' },
          },
        }),
      ),
    ).toBe('callback');
  });

  it('reads the recovery sweep’s own stamp as a recovery', () => {
    expect(
      confirmationSourceOf(event({ source: 'stk_push_query_recovery', responseCode: '0' })),
    ).toBe('recovery_query');
  });

  /*
   * A payment with no Safaricom record at all — never pushed, or
   * pushed and never answered. Reported as unknown rather than
   * guessed either way.
   */
  it('reports nothing recorded as unknown', () => {
    expect(confirmationSourceOf(null)).toBe('unknown');
  });

  /** A callback body that happens to carry an unrelated `source` key is still a callback. */
  it('only treats the recovery sweep’s exact stamp as recovery', () => {
    expect(confirmationSourceOf(event({ source: 'something-else' }))).toBe('callback');
  });
});
