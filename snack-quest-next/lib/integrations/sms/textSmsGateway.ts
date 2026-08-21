import 'server-only';

import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
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
 */
interface TextSmsConfig {
  apiKey: string;
  partnerId: string;
  /**
   * TextSMS's name for the sender ID, sent on *every* request rather
   * than being an account-level setting. That's what makes the
   * launch-time "promotional ID now, branded ID later" swap a single
   * environment-variable change with no code edit and no deploy.
   */
  shortcode: string;
  baseUrl: string;
}

/**
 * The vendor's own Postman collection parameterises the host, so this
 * is their documented production host rather than a value copied from
 * the collection. Overridable precisely because of that — if TextSMS
 * hands over a different host (a per-partner subdomain, say), it is an
 * env-var change, not a code change.
 */
const DEFAULT_BASE_URL = 'https://sms.textsms.co.ke';

/**
 * Which required settings are absent right now. Empty means ready.
 *
 * Named individually rather than as one "missing A, B or C" string,
 * because the answer to "which one" is the whole content of the
 * message: an operator reading it is about to go and look at exactly
 * one row in Vercel.
 */
export function missingTextSmsConfig(): string[] {
  return (['TEXTSMS_API_KEY', 'TEXTSMS_PARTNER_ID', 'TEXTSMS_SHORTCODE'] as const).filter(
    (name) => !process.env[name],
  );
}

function getConfig(): TextSmsConfig {
  const missing = missingTextSmsConfig();
  if (missing.length > 0) {
    throw new Error(
      `SMS is not configured — ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set on this deployment. ` +
        'Check Vercel: a shared team variable also has to be linked to this project, and a change only takes effect on a new deployment.',
    );
  }
  const baseUrl = (process.env.TEXTSMS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return {
    apiKey: process.env.TEXTSMS_API_KEY!,
    partnerId: process.env.TEXTSMS_PARTNER_ID!,
    shortcode: process.env.TEXTSMS_SHORTCODE!,
    baseUrl,
  };
}

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
  /** Throws if this gateway could not send to anyone. Lets a bulk caller stop before the loop rather than failing identically for every recipient. */
  assertReady(): void {
    getConfig();
  }

  async send(input: { to: string; body: string }): Promise<SmsSendResult> {
    const config = getConfig();
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
          shortcode: config.shortcode,
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
