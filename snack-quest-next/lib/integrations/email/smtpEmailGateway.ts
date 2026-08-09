import 'server-only';

import nodemailer from 'nodemailer';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { getAuthEmailConfig } from '../authEmail/config';
import { sendGridGateway } from './sendGridGateway';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type { EmailGateway, EmailSendResult } from '../types';

/**
 * Sends this app's own email — order confirmations, creator notices —
 * through the same SMTP account configured in Admin for Firebase's
 * password-reset mail (§ one email provider for everything).
 *
 * The point is that a business connects Mailgun (or anyone) once,
 * against a domain it has actually verified, and every message a
 * customer or creator receives then comes from that domain: the reset
 * link Firebase sends, and the receipt this app sends. Two senders
 * meant two reputations to keep clean and two ways to land in spam.
 *
 * Falls back to the platform-wide SendGrid credentials when a business
 * has not configured SMTP. That keeps every existing deployment
 * sending exactly as it did before this existed — the fallback is not
 * a preference, just the absence of a choice.
 */

const GATEWAY_NAME = 'smtp-email';

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
      const transport = nodemailer.createTransport({
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
