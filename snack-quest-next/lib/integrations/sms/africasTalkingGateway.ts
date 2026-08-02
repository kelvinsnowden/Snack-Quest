import 'server-only';

import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type { SmsGateway, SmsSendResult } from '../types';

const GATEWAY_NAME = 'africasTalking';

/**
 * Real Africa's Talking Messaging API via fetch (§ Notification
 * breadth) — chosen over Twilio because it's the standard Kenya-
 * market SMS provider (this business already runs entirely on
 * Kenyan rails: M-Pesa/Daraja, KES, Nairobi/Mombasa county coverage),
 * and it's swappable behind `SmsGateway` without touching
 * `NotificationService` if that choice ever needs revisiting.
 */
interface AfricasTalkingConfig {
  apiKey: string;
  username: string;
  baseUrl: string;
}

function getConfig(): AfricasTalkingConfig {
  const apiKey = process.env.AFRICAS_TALKING_API_KEY;
  const username = process.env.AFRICAS_TALKING_USERNAME;
  if (!apiKey || !username) {
    throw new Error(
      'Missing AFRICAS_TALKING_API_KEY or AFRICAS_TALKING_USERNAME — required to send SMS. See .env.local.example.',
    );
  }
  // Africa's Talking's own convention: the literal username "sandbox" always talks to the sandbox host; any real username talks to production.
  const baseUrl = username === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
  return { apiKey, username, baseUrl };
}

interface AfricasTalkingResponse {
  SMSMessageData?: {
    Message: string;
    Recipients: Array<{ number: string; status: string; statusCode: number; messageId: string; cost: string }>;
  };
}

class AfricasTalkingGateway implements SmsGateway {
  async send(input: { to: string; body: string }): Promise<SmsSendResult> {
    const config = getConfig();

    return withCircuitBreaker(GATEWAY_NAME, async () => {
      const response = await fetch(`${config.baseUrl}/version1/messaging`, {
        method: 'POST',
        headers: {
          apiKey: config.apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ username: config.username, to: input.to, message: input.body }).toString(),
      });

      const data = (await response.json().catch(() => ({}))) as AfricasTalkingResponse;
      const recipient = data.SMSMessageData?.Recipients?.[0];

      // statusCode 101 is Africa's Talking's own "Success" code — anything else (or a missing recipient entry) is a real failure, not assumed success.
      if (!response.ok || !recipient || recipient.statusCode !== 101) {
        throw new Error(
          `Africa's Talking send failed: ${recipient?.status ?? data.SMSMessageData?.Message ?? `HTTP ${response.status}`}`,
        );
      }

      return { providerMessageId: recipient.messageId };
    });
  }
}

export const africasTalkingGateway = new AfricasTalkingGateway();
export { AfricasTalkingGateway };
