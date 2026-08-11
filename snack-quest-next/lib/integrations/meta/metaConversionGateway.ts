import 'server-only';

import { createHash } from 'node:crypto';
import { getMetaConfig } from './config';
import { withRetry } from '../shared/withRetry';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type { ConversionGateway } from '../types';

const GATEWAY_NAME = 'meta-capi';

/** Meta requires PII in `user_data` to be SHA-256 hashed, lowercase, no whitespace. */
function hashForMeta(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Real Meta Conversions API client — this one's request shape is
 * stable, public, well-documented (unlike Whatchimp/Jumia, not an
 * assumption pending real-provider verification). `action_source:
 * 'chat'` reflects reality: this conversion happens inside a WhatsApp
 * conversation, not on a website.
 */
class MetaConversionGateway implements ConversionGateway {
  async sendEvent(input: {
    businessId: string;
    eventName: string;
    params: Record<string, unknown>;
    advancedMatching?: Record<string, string>;
    actionSource?: string;
    eventSourceUrl?: string;
  }): Promise<void> {
    const config = await getMetaConfig(input.businessId);

    const userData: Record<string, string[]> = {};
    if (input.advancedMatching?.phone) {
      userData.ph = [hashForMeta(input.advancedMatching.phone)];
    }

    // Failure here must never block the customer-facing flow (§13) —
    // safe to retry (Meta dedupes on event_id if one is supplied; we
    // don't supply one yet, so a retry could double-count — acceptable
    // for now since accurate ad spend attribution isn't blocking a
    // real order, unlike a payment).
    await withCircuitBreaker(`${GATEWAY_NAME}:${input.businessId}`, () =>
      withRetry(async () => {
        const response = await fetch(
          `https://graph.facebook.com/${config.apiVersion}/${config.pixelId}/events`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: config.accessToken,
              data: [
                {
                  event_name: input.eventName,
                  event_time: Math.floor(Date.now() / 1000),
                  // Defaults to 'chat' for any caller that doesn't say
                  // otherwise — every conversion this codebase sends
                  // predates the website checkout flow, and 'chat' was
                  // always at least honest for those. Callers that know
                  // better (a web-originated order) say so explicitly.
                  action_source: input.actionSource ?? 'chat',
                  ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
                  user_data: userData,
                  custom_data: input.params,
                },
              ],
            }),
          },
        );
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Meta CAPI dispatch failed: ${response.status} ${body}`);
        }
      }),
    );
  }
}

export const metaConversionGateway: ConversionGateway = new MetaConversionGateway();

/**
 * "Test Connection" (§ Integration Portal). Previously a
 * `GET /{pixel-id}?fields=id` metadata read — real and side-effect-free,
 * but the wrong check: a Conversions API access token generated the
 * way Meta's own docs recommend (Events Manager → Pixel → Settings →
 * Conversions API → Generate access token) is deliberately scoped to
 * *sending events*, not reading the Pixel object's own fields, and
 * legitimately gets `(#100) Missing Permission` on that GET call even
 * when it can dispatch real events fine — confirmed against a real
 * Pixel during setup.
 *
 * Tests the capability that actually matters instead: the same
 * `POST /{pixel-id}/events` `sendEvent` uses, carrying `test_event_code`
 * so it's a real, accepted event that's quarantined to Events Manager's
 * Test Events tool and never counted in real ad reporting — side-effect
 * free where it matters (§ Integration Portal's "never mutates
 * production data" rule) without testing the wrong permission.
 *
 * Also carries one hashed placeholder `user_data.ph` — Meta separately
 * rejects any event with zero matching parameters at all
 * (`error_subcode: 2804050`), confirmed against a real Pixel. That
 * requirement is real and applies to this synthetic test event same
 * as a genuine order, so it needs *a* value, just not a real person's.
 */
export async function testMetaConnection(businessId: string): Promise<void> {
  const config = await getMetaConfig(businessId);
  if (!config.testEventCode) {
    throw new Error(
      'Meta connection test failed: no Test event code configured. Copy one from Events Manager → Test Events and save it in this integration first — that keeps the test call out of your real ad reporting.',
    );
  }
  const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.pixelId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: config.accessToken,
      test_event_code: config.testEventCode,
      data: [
        {
          event_name: 'TestConnection',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'chat',
          // Meta rejects (error_subcode 2804050) any event with zero
          // matching parameters in `user_data` — a real requirement,
          // not a permission gap. This is a pure connectivity check
          // with no real customer behind it, so a hashed, obviously-
          // placeholder phone number (Kenya's conventional "not a real
          // subscriber" block, same idea as a US 555-number) satisfies
          // that requirement without describing an actual person.
          user_data: { ph: [hashForMeta('254700000000')] },
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Meta connection test failed: ${response.status} ${body}`);
  }
}
