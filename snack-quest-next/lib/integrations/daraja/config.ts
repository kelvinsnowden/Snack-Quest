import 'server-only';

/**
 * Daraja credentials, read lazily (only when a Gateway method actually
 * runs), not at module load — so importing `DarajaGateway` never
 * crashes a build or an unrelated request just because credentials
 * aren't configured yet. Keyed by env var today; the seam for a real
 * second tenant (PLATFORM_ARCHITECTURE_V2.md §17) is resolving these
 * from `businesses/{businessId}` instead — deferred until a second
 * tenant exists, per that section's own reasoning.
 */

export class DarajaConfigError extends Error {
  constructor(missing: string) {
    super(
      `Missing required Daraja configuration: ${missing}. Register a Daraja sandbox app at https://developer.safaricom.co.ke and set it in .env.local (see .env.local.example).`,
    );
    this.name = 'DarajaConfigError';
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new DarajaConfigError(name);
  }
  return value;
}

export interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  baseUrl: string;
}

export function getDarajaConfig(): DarajaConfig {
  const env = process.env.DARAJA_ENV === 'production' ? 'production' : 'sandbox';
  return {
    consumerKey: requireEnv('DARAJA_CONSUMER_KEY'),
    consumerSecret: requireEnv('DARAJA_CONSUMER_SECRET'),
    shortcode: requireEnv('DARAJA_SHORTCODE'),
    passkey: requireEnv('DARAJA_PASSKEY'),
    callbackUrl: requireEnv('DARAJA_CALLBACK_URL'),
    baseUrl:
      env === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke',
  };
}
