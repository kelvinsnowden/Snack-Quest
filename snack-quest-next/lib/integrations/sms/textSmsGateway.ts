import 'server-only';

import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import { getTextSmsConfig } from './config';
import type { SmsGateway, SmsSendResult } from '../types';

const GATEWAY_NAME = 'textSms';

/**
 * Real TextSMS bulk-SMS API via fetch (§ Notification breadth) —
 * replaces the previous Africa's Talking adapter, which was never
 * credentialed in production and is recoverable from git history if
 * this provider choice is ever revisited. TextSMS is the account the
 * business actually holds, and it lets a promotional sender ID be
 * swapped for a branded one later without a deploy (see `shortcode`).
 *
 * Sits behind `SmsGateway` exactly as its predecessor did, so
 * `NotificationService` is unaware of which provider is in use.
 *
 * Credentials are resolved per business by `./config.ts` — a business
 * that has connected its own TextSMS account in Admin → Settings →
 * Integrations sends from its own sender ID, and only one that hasn't
 * falls back to this deployment's shared `TEXTSMS_*` variables. That
 * is why every method here takes a `businessId`.
 */

/**
 * `respose-code` is not a typo on our side — it is the key TextSMS
 * actually returns (the "n" is missing in their own payload), and the
 * `textSmsGateway.test.ts` regression test exists to stop a future
 * reader from "correcting" it. `response-code` is read as a fallback
 * only so that a silent vendor-side fix would not break every send;
 * neither spelling is assumed to be present.
 */
interface TextSmsResponseEntry {
  'respose-code'?: number | string;
  'response-code'?: number | string;
  'response-description'?: string;
  mobile?: string;
  /** A JSON number in their success payload — coerced before it meets `SmsSendResult.providerMessageId`, which is a string. */
  messageid?: number | string;
  networkid?: string;
}

interface TextSmsResponse {
  responses?: TextSmsResponseEntry[];
}

const SUCCESS_CODE = 200;

function readCode(entry: TextSmsResponseEntry): number | null {
  const raw = entry['respose-code'] ?? entry['response-code'];
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  const code = Number(raw);
  return Number.isNaN(code) ? null : code;
}

class TextSmsGateway implements SmsGateway {
  /** Throws if this gateway could not send to anyone for this business. Lets a bulk caller stop before the loop rather than failing identically for every recipient. */
  async assertReady(businessId: string): Promise<void> {
    await getTextSmsConfig(businessId);
  }

  async send(input: { businessId: string; to: string; body: string }): Promise<SmsSendResult> {
    const config = await getTextSmsConfig(input.businessId);
    // TextSMS expects a bare `254XXXXXXXXX` MSISDN, which is exactly
    // what this returns — the same normalizer checkout already uses for
    // Daraja. Normalizing at the gateway boundary rather than trusting
    // the caller means any future SMS caller gets provider-correct
    // formatting for free, and a number that isn't a Kenyan mobile
    // fails loudly here instead of being silently rejected upstream.
    const mobile = normalizeKenyanPhone(input.to);

    return withCircuitBreaker(GATEWAY_NAME, async () => {
      const response = await fetch(`${config.baseUrl}/api/services/sendsms/`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        // Unlike Africa's Talking, credentials travel in the body, not
        // a header — `apikey`/`partnerID` casing is the vendor's.
        body: JSON.stringify({
          apikey: config.apiKey,
          partnerID: config.partnerId,
          mobile,
          message: input.body,
          shortcode: config.senderId,
          pass_type: 'plain',
        }),
      });

      const data = (await response.json().catch(() => ({}))) as TextSmsResponse;
      const entry = data.responses?.[0];
      const code = entry ? readCode(entry) : null;

      if (!response.ok || !entry || code !== SUCCESS_CODE) {
        // The vendor's per-code catalogue isn't reproduced here on
        // purpose: surfacing their own code and description verbatim
        // stays accurate even as that catalogue changes, and this
        // string is what lands in `outboundMessages.failureReason`.
        const description = entry?.['response-description'] ?? `HTTP ${response.status}`;
        throw new Error(`TextSMS send failed: ${description}${code === null ? '' : ` (code ${code})`}`);
      }

      if (entry.messageid === undefined || entry.messageid === null || entry.messageid === '') {
        throw new Error('TextSMS send failed: success code returned without a messageid');
      }

      return { providerMessageId: String(entry.messageid) };
    });
  }
}

export const textSmsGateway = new TextSmsGateway();
export { TextSmsGateway };

/**
 * "Test Connection" for the Integrations page (§ Integration Portal).
 *
 * Queries the account's SMS balance, because it is the only TextSMS
 * call that exercises the credentials without sending anyone a real
 * text — a send-based test would cost money and would need a
 * throwaway number to aim at.
 *
 * Two honesty caveats, deliberately not papered over:
 *
 * - A **pass** proves the API key and partner ID are accepted. It does
 *   *not* prove the sender ID is approved for the account, because the
 *   balance call does not take one. An unapproved sender ID is
 *   rejected at send time, and there is no pre-flight for it.
 * - A **failure** is reported with whatever the provider actually
 *   said, rather than being classified. This endpoint is the one part
 *   of the TextSMS API not exercised by a real send in this codebase,
 *   so an unexpected shape is surfaced verbatim instead of being
 *   translated into a confident diagnosis that might be wrong.
 */
export async function testTextSmsConnection(businessId: string): Promise<void> {
  const config = await getTextSmsConfig(businessId);

  const response = await fetch(`${config.baseUrl}/api/services/getbalance/`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: config.apiKey, partnerID: config.partnerId }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`TextSMS rejected the credentials check: HTTP ${response.status}. ${raw.slice(0, 200)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`TextSMS returned a response that was not JSON: ${raw.slice(0, 200)}`);
  }

  // Their balance payload nests the same entry shape a send does.
  const entry = (parsed as { responses?: TextSmsResponseEntry[] }).responses?.[0] ?? (parsed as TextSmsResponseEntry);
  const code = readCode(entry);
  if (code !== null && code !== SUCCESS_CODE) {
    const description = entry['response-description'] ?? 'no description given';
    throw new Error(`TextSMS rejected the credentials check: ${description} (code ${code})`);
  }
}
