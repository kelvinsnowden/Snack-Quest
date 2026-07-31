import 'server-only';

/**
 * Whatchimp credentials, read lazily — same discipline as
 * `lib/integrations/daraja/config.ts`. Modeled on the WhatsApp Cloud
 * API's request/response shape (the shape most WhatsApp BSPs,
 * including Whatchimp, wrap) since Whatchimp's own API reference
 * hasn't been verified against real credentials yet — flagged
 * explicitly rather than silently assumed correct; see
 * PLATFORM_ARCHITECTURE_V2.md §21 Open Question 2.
 */

export class WhatchimpConfigError extends Error {
  constructor(missing: string) {
    super(
      `Missing required Whatchimp configuration: ${missing}. See .env.local.example.`,
    );
    this.name = 'WhatchimpConfigError';
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new WhatchimpConfigError(name);
  }
  return value;
}

export interface WhatchimpConfig {
  apiKey: string;
  phoneNumberId: string;
  baseUrl: string;
  webhookVerifyToken: string;
}

export function getWhatchimpConfig(): WhatchimpConfig {
  return {
    apiKey: requireEnv('WHATCHIMP_API_KEY'),
    phoneNumberId: requireEnv('WHATCHIMP_PHONE_NUMBER_ID'),
    baseUrl: process.env.WHATCHIMP_BASE_URL ?? 'https://api.whatchimp.com/v1',
    webhookVerifyToken: requireEnv('WHATCHIMP_WEBHOOK_VERIFY_TOKEN'),
  };
}
