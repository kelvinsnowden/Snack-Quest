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
                  action_source: 'chat',
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
 * "Test Connection" (§ Integration Portal) — `GET /{pixel-id}?fields=id`
 * is the real, public, documented Meta Graph API way to validate an
 * access token against a specific Pixel ID with no side effects, unlike
 * `sendEvent` above (which dispatches a real, permanent conversion
 * event). Real API, unlike Whatchimp/Jumia's honest "modeled, not
 * verified" caveat — see this file's own class-level comment.
 */
export async function testMetaConnection(businessId: string): Promise<void> {
  const config = await getMetaConfig(businessId);
  const response = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${config.pixelId}?fields=id&access_token=${encodeURIComponent(config.accessToken)}`,
  );
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Meta connection test failed: ${response.status} ${body}`);
  }
}
