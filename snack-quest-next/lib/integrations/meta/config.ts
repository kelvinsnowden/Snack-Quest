import 'server-only';

export class MetaConfigError extends Error {
  constructor(missing: string) {
    super(`Missing required Meta configuration: ${missing}. See .env.local.example.`);
    this.name = 'MetaConfigError';
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MetaConfigError(name);
  }
  return value;
}

export interface MetaConfig {
  pixelId: string;
  accessToken: string;
  apiVersion: string;
}

export function getMetaConfig(): MetaConfig {
  return {
    pixelId: requireEnv('META_PIXEL_ID'),
    accessToken: requireEnv('META_ACCESS_TOKEN'),
    apiVersion: process.env.META_API_VERSION ?? 'v21.0',
  };
}
