import 'server-only';

import { createHash } from 'node:crypto';
import { getTiktokConfig } from './config';
import { withRetry } from '../shared/withRetry';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type { ConversionGateway } from '../types';

const GATEWAY_NAME = 'tiktok-events-api';
const TIKTOK_EVENTS_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

/** TikTok requires PII in `user` to be SHA-256 hashed, lowercase, no whitespace — same rule as Meta's Advanced Matching. */
function hashForTiktok(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

interface TiktokEventResponse {
  code: number;
  message: string;
}

/**
 * TikTok Events API v1.3 client (§ close the loop: ad-conversion
 * attribution). Every order this gateway is asked to report is, by
 * definition, web-originated — `AdConversionService` only calls this
 * for orders carrying a real `attributionSnapshot` from the website,
 * since a native WhatsApp message can't have come from a TikTok ad
 * click. `event_source` is therefore always `'web'`, never
 * conditional the way Meta's `action_source` is.
 *
 * Unlike `metaConversionGateway.ts`, this request shape is built from
 * TikTok's public Events API docs, not confirmed against a real
 * Pixel/account yet — the same honest gap this codebase already
 * accepts for Jumia/Daraja specifics pending real-provider
 * verification. Worth a real "Test Connection" run the day a genuine
 * access token is configured, before trusting it for real ad spend.
 */
class TiktokConversionGateway implements ConversionGateway {
  async sendEvent(input: {
    businessId: string;
    eventName: string;
    params: Record<string, unknown>;
    advancedMatching?: Record<string, string>;
    eventSourceUrl?: string;
    clickId?: string;
  }): Promise<void> {
    const config = await getTiktokConfig(input.businessId);

    const user: Record<string, string | string[]> = {};
    if (input.advancedMatching?.phone) {
      user.phone_numbers = [hashForTiktok(input.advancedMatching.phone)];
    }
    if (input.clickId) {
      user.ttclid = input.clickId;
    }

    // Same "never block the customer-facing flow" discipline as Meta's
    // gateway — a failed/slow ad-attribution call must never be able to
    // hold up or fail a real, already-paid order.
    await withCircuitBreaker(`${GATEWAY_NAME}:${input.businessId}`, () =>
      withRetry(async () => {
        const response = await fetch(TIKTOK_EVENTS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Access-Token': config.accessToken },
          body: JSON.stringify({
            event_source: 'web',
            event_source_id: config.pixelCode,
            data: [
              {
                event: input.eventName,
                event_time: Math.floor(Date.now() / 1000),
                user,
                properties: input.params,
                ...(input.eventSourceUrl ? { page: { url: input.eventSourceUrl } } : {}),
              },
            ],
          }),
        });
        const body = (await response.json().catch(() => null)) as TiktokEventResponse | null;
        if (!response.ok || !body || body.code !== 0) {
          throw new Error(`TikTok Events API dispatch failed: ${response.status} ${body?.message ?? 'unknown error'}`);
        }
      }),
    );
  }
}

export const tiktokConversionGateway: ConversionGateway = new TiktokConversionGateway();

/**
 * "Test Connection" (§ Integration Portal) — same shape as
 * `testMetaConnection`: a real, accepted event carrying
 * `test_event_code` so TikTok quarantines it to Events Manager's Test
 * Events tool, never counted in real ad reporting. Requires a hashed
 * placeholder phone number for the same reason Meta's does: an event
 * with zero matching parameters is a weaker connectivity check than
 * one shaped like a genuine order.
 */
export async function testTiktokConnection(businessId: string): Promise<void> {
  const config = await getTiktokConfig(businessId);
  if (!config.testEventCode) {
    throw new Error(
      'TikTok connection test failed: no Test event code configured. Copy one from TikTok Events Manager → your Pixel → Test Events and save it in this integration first — that keeps the test call out of your real ad reporting.',
    );
  }
  const response = await fetch(TIKTOK_EVENTS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Access-Token': config.accessToken },
    body: JSON.stringify({
      event_source: 'web',
      event_source_id: config.pixelCode,
      test_event_code: config.testEventCode,
      data: [
        {
          event: 'TestConnection',
          event_time: Math.floor(Date.now() / 1000),
          // Kenya's conventional "not a real subscriber" block, same
          // placeholder Meta's own test connection uses — a pure
          // connectivity check with no real customer behind it.
          user: { phone_numbers: [hashForTiktok('254700000000')] },
        },
      ],
    }),
  });
  const body = (await response.json().catch(() => null)) as TiktokEventResponse | null;
  if (!response.ok || !body || body.code !== 0) {
    throw new Error(`TikTok connection test failed: ${response.status} ${body?.message ?? ''}`);
  }
}
