import 'server-only';

export class JumiaConfigError extends Error {
  constructor(missing: string) {
    super(
      `Missing required Jumia configuration: ${missing}. See .env.local.example.`,
    );
    this.name = 'JumiaConfigError';
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new JumiaConfigError(name);
  }
  return value;
}

export interface JumiaConfig {
  apiKey: string;
  merchantId: string;
  baseUrl: string;
}

export function getJumiaConfig(): JumiaConfig {
  return {
    apiKey: requireEnv('JUMIA_API_KEY'),
    merchantId: requireEnv('JUMIA_MERCHANT_ID'),
    baseUrl: process.env.JUMIA_BASE_URL ?? 'https://api.jumia.com/logistics/v1',
  };
}
