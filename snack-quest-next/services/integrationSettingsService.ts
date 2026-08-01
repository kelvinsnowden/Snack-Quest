import 'server-only';

import {
  businessIntegrationSecretRepository,
  IntegrationSecretNotFoundError,
} from '@/repositories/businessIntegrationSecretRepository';
import { getIntegrationFieldManifest, getRequiredFieldKeys, type IntegrationFieldSpec } from '@/lib/integrations/fieldManifest';
import { testDarajaConnection } from '@/lib/integrations/daraja/darajaGateway';
import { testWhatchimpConnection } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { testJumiaConnection } from '@/lib/integrations/jumia/jumiaGateway';
import { testMetaConnection } from '@/lib/integrations/meta/metaConversionGateway';
import type { IntegrationProvider, IntegrationSecretMap, IntegrationSecretMeta } from '@/types';

export class IntegrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationValidationError';
  }
}

export class UnknownIntegrationProviderError extends Error {
  constructor(provider: string) {
    super(`"${provider}" is not a recognized integration provider.`);
    this.name = 'UnknownIntegrationProviderError';
  }
}

export type IntegrationStatus = 'connected' | 'missing' | 'invalid' | 'connection_failed' | 'disabled';

export interface IntegrationFieldView {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  helpText: string | null;
  type: 'text' | 'select';
  options: readonly string[] | null;
  /** Real value for non-secret fields; last 4 characters (masked) for secret fields; `null` if never set. */
  value: string | null;
  configured: boolean;
}

export interface IntegrationSummary {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestStatus: 'success' | 'failure' | null;
  lastTestError: string | null;
  fields: IntegrationFieldView[];
}

const PROVIDERS: IntegrationProvider[] = ['daraja', 'whatchimp', 'jumia', 'meta'];

const TEST_CONNECTORS: Record<IntegrationProvider, (businessId: string) => Promise<void>> = {
  daraja: testDarajaConnection,
  whatchimp: testWhatchimpConnection,
  jumia: testJumiaConnection,
  meta: testMetaConnection,
};

function maskSecretValue(value: string): string {
  if (value.length <= 4) {
    return '••••';
  }
  return `••••${value.slice(-4)}`;
}

function fieldView(spec: IntegrationFieldSpec, secret: Record<string, unknown> | null): IntegrationFieldView {
  const raw = secret?.[spec.key];
  const hasValue = typeof raw === 'string' && raw.length > 0;
  return {
    key: spec.key,
    label: spec.label,
    secret: spec.secret,
    required: spec.required,
    helpText: spec.helpText ?? null,
    type: spec.type ?? 'text',
    options: spec.options ?? null,
    value: hasValue ? (spec.secret ? maskSecretValue(raw as string) : (raw as string)) : null,
    configured: hasValue,
  };
}

function computeStatus(
  provider: IntegrationProvider,
  secret: (Partial<IntegrationSecretMeta> & Record<string, unknown>) | null,
): IntegrationStatus {
  if (!secret) {
    return 'missing';
  }
  if (secret.enabled === false) {
    return 'disabled';
  }
  const required = getRequiredFieldKeys(provider);
  const missingRequired = required.some((key) => !secret[key] || String(secret[key]).length === 0);
  if (missingRequired) {
    return 'missing';
  }
  if (secret.lastTestStatus === 'failure') {
    // Best-effort distinction, not a verified provider error taxonomy
    // (see the Gateway test functions' own honesty caveats where they
    // apply) — a 401/403 in the message reads as a credentials
    // problem, anything else as a connectivity/provider problem.
    const message = secret.lastTestError ?? '';
    return /\b(401|403)\b/.test(message) ? 'invalid' : 'connection_failed';
  }
  return 'connected';
}

function toSummary(provider: IntegrationProvider, secret: Record<string, unknown> | null): IntegrationSummary {
  const manifest = getIntegrationFieldManifest(provider);
  return {
    provider,
    status: computeStatus(provider, secret),
    enabled: secret?.enabled !== false,
    lastTestedAt: secret?.lastTestedAt ? isoFromTimestampLike(secret.lastTestedAt) : null,
    lastTestStatus: (secret?.lastTestStatus as 'success' | 'failure' | null | undefined) ?? null,
    lastTestError: (secret?.lastTestError as string | null | undefined) ?? null,
    fields: manifest.map((spec) => fieldView(spec, secret)),
  };
}

function isoFromTimestampLike(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function assertKnownProvider(provider: string): asserts provider is IntegrationProvider {
  if (!PROVIDERS.includes(provider as IntegrationProvider)) {
    throw new UnknownIntegrationProviderError(provider);
  }
}

class IntegrationSettingsService {
  async listSummaries(businessId: string): Promise<IntegrationSummary[]> {
    const secrets = await Promise.all(
      PROVIDERS.map((provider) => businessIntegrationSecretRepository.find(businessId, provider)),
    );
    return PROVIDERS.map((provider, i) => toSummary(provider, secrets[i] as Record<string, unknown> | null));
  }

  async getSummary(businessId: string, provider: string): Promise<IntegrationSummary> {
    assertKnownProvider(provider);
    const secret = await businessIntegrationSecretRepository.find(businessId, provider);
    return toSummary(provider, secret as Record<string, unknown> | null);
  }

  /**
   * Merges `patch` onto the existing secret (or creates it, for a
   * first-time setup) — blank/omitted fields in the form mean "leave
   * unchanged", never "clear", so an admin editing just the callback
   * URL never has to re-type the consumer secret. Returns masked
   * before/after summaries for the caller's audit log entry — never
   * the real values.
   */
  async updateSecret(
    businessId: string,
    provider: string,
    patch: Record<string, unknown>,
    actor: string,
  ): Promise<{ before: IntegrationSummary; after: IntegrationSummary }> {
    assertKnownProvider(provider);
    void actor; // recorded by the Route layer's audit log call, same convention as businessSettingsService

    const manifest = getIntegrationFieldManifest(provider);
    const validKeys = new Set(manifest.map((f) => f.key));
    const cleanPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'enabled') {
        if (typeof value !== 'boolean') {
          throw new IntegrationValidationError('"enabled" must be a boolean.');
        }
        cleanPatch.enabled = value;
        continue;
      }
      if (!validKeys.has(key)) {
        continue;
      }
      if (value !== '' && value !== null && value !== undefined) {
        if (typeof value !== 'string') {
          throw new IntegrationValidationError(`"${key}" must be a string.`);
        }
        cleanPatch[key] = value;
      }
    }

    const before = await this.getSummary(businessId, provider);

    const existing = await businessIntegrationSecretRepository.find(businessId, provider);
    const merged: Record<string, unknown> = { ...(existing ?? {}), ...cleanPatch };
    for (const key of getRequiredFieldKeys(provider)) {
      if (!merged[key] || String(merged[key]).length === 0) {
        const label = manifest.find((f) => f.key === key)?.label ?? key;
        throw new IntegrationValidationError(`"${label}" is required.`);
      }
    }

    await businessIntegrationSecretRepository.update(
      businessId,
      provider,
      cleanPatch as Partial<IntegrationSecretMap[typeof provider]>,
    );

    const after = await this.getSummary(businessId, provider);
    return { before, after };
  }

  /**
   * Real, live "Test Connection" (§ Integration Portal) — dispatches to
   * the provider's own side-effect-free check (see each Gateway file's
   * `test*Connection` for exactly what real call is made and why it's
   * safe). Persists the result so the portal shows a real status
   * without re-testing on every page load.
   */
  async testConnection(businessId: string, provider: string): Promise<{ success: boolean; error: string | null }> {
    assertKnownProvider(provider);

    let existing;
    try {
      existing = await businessIntegrationSecretRepository.get(businessId, provider);
    } catch (error) {
      if (error instanceof IntegrationSecretNotFoundError) {
        return { success: false, error: 'This integration has no credentials configured yet.' };
      }
      throw error;
    }
    if (existing.enabled === false) {
      return { success: false, error: 'This integration is disabled — enable it before testing.' };
    }

    const connector = TEST_CONNECTORS[provider];
    try {
      await connector(businessId);
      await businessIntegrationSecretRepository.recordTestResult(businessId, provider, { status: 'success', error: null });
      return { success: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed.';
      await businessIntegrationSecretRepository.recordTestResult(businessId, provider, { status: 'failure', error: message });
      return { success: false, error: message };
    }
  }
}

export const integrationSettingsService = new IntegrationSettingsService();
export { IntegrationSettingsService };
