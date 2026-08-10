import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { assertIntegrationEnabled } from '../shared/assertEnabled';

/**
 * The SMTP account this app's own outbound email goes through —
 * order confirmations, creator notices, staff invites, see
 * `smtpEmailGateway.ts` (§ Integration Portal: auth email) — once a
 * business connects one, from their own domain rather than a shared
 * platform address.
 *
 * Deliberately *not* pushed into Firebase's Identity Platform config.
 * An earlier attempt did that, so that Firebase's own auto-sent auth
 * email (the Creator Portal's "forgot password", via the client SDK's
 * `sendPasswordResetEmail` — see `ForgotPasswordDialog.tsx`) would
 * also go out from the business's domain. Every real save against a
 * live project failed: Identity Toolkit rejects updating its email
 * templates through that API on a plain Firebase Authentication
 * project — reaching that feature requires upgrading to Identity
 * Platform, which this project isn't set up to require. So that one
 * flow keeps using Firebase's own default `noreply@<project>.
 * firebaseapp.com` sender, unrelated to whatever is configured here;
 * everything else this app sends does not need that upgrade at all.
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

/** Ports outside this are almost always a typo, and the SMTP server would reject them with a far less helpful message than this one. */
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
