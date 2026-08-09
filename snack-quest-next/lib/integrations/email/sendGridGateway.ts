import 'server-only';

import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type { EmailGateway, EmailSendResult } from '../types';

const GATEWAY_NAME = 'sendgrid';
const API_URL = 'https://api.sendgrid.com/v3/mail/send';

/**
 * Real SendGrid v3 Mail Send API via fetch (§ Notification breadth) —
 * no `@sendgrid/mail` dependency, matching Daraja/Whatchimp's own
 * REST-over-fetch approach rather than adding an SDK for one
 * endpoint. Platform-wide credential, not a per-business Firestore
 * secret — see `lib/integrations/types.ts`'s `EmailGateway` comment
 * for why.
 */
class SendGridGateway implements EmailGateway {
  private requireConfig(): { apiKey: string; fromEmail: string } {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
      throw new Error(
        'Missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL — required to send email. See .env.local.example.',
      );
    }
    return { apiKey, fromEmail };
  }

  /** `businessId` is accepted and ignored: this is the platform-wide fallback, one account for the whole deployment (see `smtpEmailGateway` for the per-business path). */
  async send(input: { businessId?: string; to: string; subject: string; body: string }): Promise<EmailSendResult> {
    const { apiKey, fromEmail } = this.requireConfig();

    return withCircuitBreaker(GATEWAY_NAME, async () => {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: input.to }] }],
          from: { email: fromEmail },
          subject: input.subject,
          content: [{ type: 'text/plain', value: input.body }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`SendGrid send failed (${response.status}): ${errorBody}`);
      }

      // v3 mail/send returns 202 with an empty body — the real
      // message id comes back in the X-Message-Id response header,
      // never fabricated when the provider gave a real one.
      const providerMessageId = response.headers.get('x-message-id');
      if (!providerMessageId) {
        throw new Error('SendGrid accepted the request but returned no X-Message-Id header.');
      }
      return { providerMessageId };
    });
  }
}

export const sendGridGateway = new SendGridGateway();
export { SendGridGateway };
