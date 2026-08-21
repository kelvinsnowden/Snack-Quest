import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { assertIntegrationEnabled, IntegrationDisabledError } from '../shared/assertEnabled';

/**
 * The TextSMS account a given business's texts go out through
 * (§ Integration Portal: SMS).
 *
 * Resolved per business first, falling back to this deployment's
 * `TEXTSMS_*` environment variables. The fallback is not a preference,
 * just the absence of a choice — exactly the arrangement
 * `smtpEmailGateway` already uses for email, and for the same reason:
 * a deployment-wide account keeps every existing install sending
 * precisely as it did before this existed, while a business that
 * connects its own gets its own sender ID and its own bill.
 *
 * Why this was worth building rather than leaving SMS as env-only:
 * every other channel could be fixed by the person operating the
 * business, and SMS could not. A missing API key meant finding whoever
 * had access to the hosting provider's environment variables, and then
 * a redeploy — during which the campaign that surfaced the problem sat
 * there unsendable. Credentials saved here take effect on the next
 * send, with no deploy at all.
 */
const DEFAULT_BASE_URL = 'https://sms.textsms.co.ke';

export interface TextSmsConfig {
  apiKey: string;
  partnerId: string;
  /** TextSMS's own name for this is `shortcode`; it is the sender ID recipients see. Sent on every request, not set once at account level. */
  senderId: string;
  baseUrl: string;
  /** Which of the two sources actually supplied these — surfaced in the admin UI so "configured" is never ambiguous about *where*. */
  source: TextSmsConfigSource;
}

export type TextSmsConfigSource = 'business' | 'deployment';

/**
 * Thrown when neither source can produce a usable account.
 *
 * The message deliberately leads with the admin page rather than the
 * environment variables: it is the route that the person reading the
 * error can actually walk, and it is the one that works without a
 * redeploy.
 */
export class TextSmsNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextSmsNotConfiguredError';
  }
}

const REQUIRED_ENV = ['TEXTSMS_API_KEY', 'TEXTSMS_PARTNER_ID', 'TEXTSMS_SHORTCODE'] as const;

/** Which deployment-wide SMS settings are absent right now. Empty means the fallback account is usable. */
export function missingTextSmsEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBaseUrl(value: string | null): string {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * A business's own TextSMS account, or `null` if it has not connected
 * one. Throws only for a connected account that an admin has
 * explicitly paused — pausing an integration should stop it, not
 * quietly reroute its traffic through the platform's account and its
 * sender ID.
 */
async function readBusinessConfig(businessId: string): Promise<TextSmsConfig | null> {
  const secret = await businessIntegrationSecretRepository.find(businessId, 'textSms');
  if (!secret) {
    return null;
  }

  const apiKey = nonEmpty(secret.apiKey);
  const partnerId = nonEmpty(secret.partnerId);
  const senderId = nonEmpty(secret.senderId);

  // A half-filled record is treated as "not connected" rather than as
  // an error, so a business that started the form and left it can
  // still receive its order confirmations through the fallback. The
  // admin card already shows it as incomplete.
  if (!apiKey || !partnerId || !senderId) {
    return null;
  }

  assertIntegrationEnabled(businessId, 'textSms', secret);

  return {
    apiKey,
    partnerId,
    senderId,
    baseUrl: normalizeBaseUrl(nonEmpty(secret.baseUrl)),
    source: 'business',
  };
}

/** This deployment's shared TextSMS account, or `null` if its environment variables are unset. */
function readDeploymentConfig(): TextSmsConfig | null {
  if (missingTextSmsEnv().length > 0) {
    return null;
  }
  return {
    apiKey: process.env.TEXTSMS_API_KEY!,
    partnerId: process.env.TEXTSMS_PARTNER_ID!,
    senderId: process.env.TEXTSMS_SHORTCODE!,
    baseUrl: normalizeBaseUrl(nonEmpty(process.env.TEXTSMS_BASE_URL)),
    source: 'deployment',
  };
}

export async function getTextSmsConfig(businessId: string): Promise<TextSmsConfig> {
  const config = (await readBusinessConfig(businessId)) ?? readDeploymentConfig();
  if (config) {
    return config;
  }

  const missingEnv = missingTextSmsEnv();
  throw new TextSmsNotConfiguredError(
    'SMS is not configured. Open Admin → Settings → Integrations, connect TextSMS with your API key, ' +
      'partner ID and sender ID, and it takes effect on the next send — no redeploy. ' +
      `(This deployment has no shared SMS account to fall back on either: ${missingEnv.join(', ')} ${
        missingEnv.length === 1 ? 'is' : 'are'
      } unset.)`,
  );
}

/**
 * Which account this business's texts would actually go out through
 * right now, resolved without dialing the provider.
 *
 * Exists because the two-source arrangement introduces a question the
 * old status-only card could not raise and therefore could not answer
 * badly: with a per-business card reading "not configured" while the
 * deployment fallback quietly works, an operator has no way to tell
 * whether SMS is broken or simply inherited. The Integrations page
 * states the resolved answer outright instead of leaving it to be
 * inferred from two cards.
 */
export type TextSmsResolution =
  | { state: 'configured'; source: TextSmsConfigSource; senderId: string }
  /** Credentials exist but an admin paused them. Distinct from "never set up": it stops sending, and the fix is to un-pause, not to re-enter anything. */
  | { state: 'paused' }
  | { state: 'unconfigured' };

export async function describeTextSmsConfig(businessId: string): Promise<TextSmsResolution> {
  try {
    const config = await getTextSmsConfig(businessId);
    return { state: 'configured', source: config.source, senderId: config.senderId };
  } catch (error) {
    if (error instanceof IntegrationDisabledError) {
      return { state: 'paused' };
    }
    // Anything else — including a Firestore read that failed rather
    // than a credential that is absent — reads as unconfigured. This
    // renders a settings card; it should not be able to take the page
    // down, and "we could not confirm SMS is set up" is the honest
    // reading of a lookup that did not complete.
    return { state: 'unconfigured' };
  }
}
