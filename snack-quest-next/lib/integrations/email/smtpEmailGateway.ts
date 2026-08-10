import 'server-only';

import nodemailer from 'nodemailer';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { getAuthEmailConfig, type AuthEmailConfig } from '../authEmail/config';
import { sendGridGateway } from './sendGridGateway';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type { EmailGateway, EmailSendResult } from '../types';

/**
 * Sends this app's own email — order confirmations, creator notices —
 * through a business's own connected SMTP account, once one exists
 * (§ Integration Portal: auth email). Firebase's own auto-sent auth
 * email (the Creator Portal's "forgot password") is unrelated to this
 * — see `authEmail/config.ts` for why the two are deliberately kept
 * apart.
 *
 * Falls back to the platform-wide SendGrid credentials when a business
 * has not configured SMTP. That keeps every existing deployment
 * sending exactly as it did before this existed — the fallback is not
 * a preference, just the absence of a choice.
 */

const GATEWAY_NAME = 'smtp-email';

function buildTransport(config: AuthEmailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // `secure` means "TLS from the first byte", which is what SSL
    // on 465 is. STARTTLS opens in the clear and upgrades, so it
    // is `secure: false` plus `requireTLS` — false alone would let
    // a downgrade pass silently.
    secure: config.securityMode === 'SSL',
    requireTLS: config.securityMode === 'START_TLS',
    auth: { user: config.username, pass: config.password },
  });
}

class SmtpEmailGateway implements EmailGateway {
  async send(input: {
    businessId: string;
    to: string;
    subject: string;
    body: string;
  }): Promise<EmailSendResult> {
    const configured = await businessIntegrationSecretRepository.find(
      input.businessId,
      'authEmail',
    );
    // `enabled === false` is an explicit pause, and it should pause
    // this too rather than quietly routing around it — but a business
    // that never set SMTP up at all is a different case, and falls
    // back rather than failing.
    if (!configured || !configured.host) {
      return sendGridGateway.send(input);
    }

    const config = await getAuthEmailConfig(input.businessId);

    return withCircuitBreaker(GATEWAY_NAME, async () => {
      const transport = buildTransport(config);

      const info = await transport.sendMail({
        from: config.senderName
          ? { name: config.senderName, address: config.senderEmail }
          : config.senderEmail,
        to: input.to,
        subject: input.subject,
        text: input.body,
      });

      return { providerMessageId: info.messageId };
    });
  }
}

export const smtpEmailGateway = new SmtpEmailGateway();

/**
 * Real "Test connection" (§ Integration Portal) for the auth-email
 * integration — opens a connection to the SMTP server and
 * authenticates, without sending anything. This replaced a check
 * against Firebase's Identity Platform config (see git history and
 * `authEmail/config.ts`'s doc comment for why that was removed): this
 * one actually dials the real server, so a wrong password fails right
 * here rather than only being discoverable by sending a real message.
 */
export async function testAuthEmailConnection(businessId: string): Promise<void> {
  const config = await getAuthEmailConfig(businessId);
  const transport = buildTransport(config);
  await transport.verify();
}
