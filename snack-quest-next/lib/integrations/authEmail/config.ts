import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { assertIntegrationEnabled } from '../shared/assertEnabled';

/**
 * The SMTP account Firebase Authentication sends its own emails
 * through — password resets, and email verification if it is ever
 * switched on (§ Integration Portal: auth email).
 *
 * Unlike every other integration here, nothing in this app ever calls
 * this SMTP server itself. Firebase does. What this integration owns
 * is the *configuration*: the credentials are stored and encrypted the
 * same way as every other provider's, and then pushed into the
 * project's Identity Platform config, which is the only place Firebase
 * reads them from.
 *
 * Why it needs to exist at all: with no SMTP configured, Firebase
 * sends from `noreply@<project>.firebaseapp.com`, a domain the
 * business does not own and cannot authenticate with SPF or DKIM.
 * Password-reset mail from an unfamiliar domain is exactly the profile
 * spam filters are built to catch, so the creator who most needs the
 * email is the one least likely to see it.
 */

export type SmtpSecurityMode = 'SSL' | 'START_TLS';

export interface AuthEmailConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  senderEmail: string;
  senderName: string | null;
  securityMode: SmtpSecurityMode;
}

export class InvalidAuthEmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthEmailConfigError';
  }
}

/** Ports outside this are almost always a typo, and Identity Platform rejects them with a far less helpful message than this one. */
function parsePort(raw: unknown): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidAuthEmailConfigError(
      `SMTP port must be a whole number between 1 and 65535 — got "${String(raw)}". Most providers use 587 for STARTTLS or 465 for SSL.`,
    );
  }
  return port;
}

function parseSecurityMode(raw: unknown): SmtpSecurityMode {
  const value = String(raw ?? 'START_TLS').toUpperCase();
  if (value !== 'SSL' && value !== 'START_TLS') {
    throw new InvalidAuthEmailConfigError(
      `SMTP security mode must be either "START_TLS" or "SSL" — got "${String(raw)}".`,
    );
  }
  return value;
}

export async function getAuthEmailConfig(businessId: string): Promise<AuthEmailConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'authEmail');
  assertIntegrationEnabled(businessId, 'authEmail', secret);

  return {
    host: String(secret.host),
    port: parsePort(secret.port),
    username: String(secret.username),
    password: String(secret.password),
    senderEmail: String(secret.senderEmail),
    senderName: secret.senderName ? String(secret.senderName) : null,
    securityMode: parseSecurityMode(secret.securityMode),
  };
}
