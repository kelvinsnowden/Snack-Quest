import 'server-only';

import { decryptSecret, encryptSecret, isEncryptionConfigured } from '@/lib/secrets/secretCipher';
import { secretFingerprint } from '@/lib/vending/credentialLifecycle';
import { isProductionDeployment } from '@/lib/vending/deploymentEnvironment';
import { assertPublicHost, validateManufacturerBaseUrl } from '@/lib/vending/outboundUrl';
import { manufacturerApiCredentialRepository } from '@/repositories/manufacturerApiCredentialRepository';
import { manufacturerRepository, ManufacturerNotFoundError } from '@/repositories/manufacturerRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import type { MachineIntegrationEnvironment, ManufacturerApiCredential } from '@/types';

/**
 * Snack Quest's credentials for calling manufacturers' APIs (Model A).
 *
 * One credential per manufacturer per environment, encrypted at rest,
 * set and rotated through the admin console (every change audit-logged
 * by the route), revocable, and readable in plaintext **only** here, on
 * the server, by the adapter that is about to make a call. Nothing a
 * browser can reach ever returns more than the fingerprint.
 *
 * Environment variables remain for infrastructure secrets (the
 * encryption key itself); no manufacturer credential lives in them.
 */

export class ManufacturerApiCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManufacturerApiCredentialError';
  }
}

export interface ManufacturerApiCredentialSummary {
  environment: MachineIntegrationEnvironment;
  baseUrl: string;
  status: ManufacturerApiCredential['status'];
  current: { version: number; fingerprint: string; setAt: string; setBy: string } | null;
  previous: { version: number; fingerprint: string; retiredAt: string } | null;
  revokedAt: string | null;
  revokedReason: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface ResolvedManufacturerApiCredential {
  baseUrl: string;
  apiKey: string;
  version: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: ResolvedManufacturerApiCredential | null; expiresAt: number }>();

function cacheTtl(): number {
  return process.env.NODE_ENV === 'test' ? 0 : CACHE_TTL_MS;
}

function summarize(credential: ManufacturerApiCredential): ManufacturerApiCredentialSummary {
  const iso = (value: { toDate(): Date } | null | undefined) => (value ? value.toDate().toISOString() : null);
  return {
    environment: credential.environment,
    baseUrl: credential.baseUrl,
    status: credential.status,
    current: credential.current ? { version: credential.current.version, fingerprint: credential.current.fingerprint, setAt: iso(credential.current.setAt)!, setBy: credential.current.setBy } : null,
    previous: credential.previous ? { version: credential.previous.version, fingerprint: credential.previous.fingerprint, retiredAt: iso(credential.previous.retiredAt)! } : null,
    revokedAt: iso(credential.revokedAt),
    revokedReason: credential.revokedReason,
    updatedAt: iso(credential.updatedAt)!,
    updatedBy: credential.updatedBy,
  };
}

class ManufacturerApiCredentialService {
  /**
   * Sets the base URL and (optionally) a new API key. A new key on a
   * configured credential is a rotation: the old one is kept as
   * `previous` for roll-back. Refuses to store a key without encryption
   * configured — never plaintext at rest.
   */
  async set(
    businessId: string,
    manufacturerId: string,
    environment: MachineIntegrationEnvironment,
    input: { baseUrl: string; apiKey?: string | null },
    actor: string,
  ): Promise<ManufacturerApiCredentialSummary> {
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new ManufacturerApiCredentialError('environment must be sandbox or production');
    }
    if (!(await manufacturerRepository.findById(businessId, manufacturerId))) {
      throw new ManufacturerNotFoundError(manufacturerId);
    }
    // A local fake manufacturer (http://localhost:4010) is for local development only — never on a deployed build, preview or production.
    const url = validateManufacturerBaseUrl(input.baseUrl, { allowLocalHttp: environment === 'sandbox' && process.env.NODE_ENV !== 'production' && !isProductionDeployment() });
    if (isProductionDeployment() || environment === 'production') {
      await assertPublicHost(url.hostname);
    }
    const apiKey = input.apiKey?.trim() ?? '';
    if (input.apiKey !== undefined && input.apiKey !== null && apiKey.length < 8) {
      throw new ManufacturerApiCredentialError('the API key looks too short (at least 8 characters)');
    }
    if (apiKey && !isEncryptionConfigured()) {
      throw new ManufacturerApiCredentialError('SECRET_ENCRYPTION_KEY is not set on this deployment, so credentials cannot be stored encrypted — refusing to store one in plaintext');
    }
    const existing = await manufacturerApiCredentialRepository.find(businessId, manufacturerId, environment);
    if (!apiKey && !existing?.current) {
      throw new ManufacturerApiCredentialError('an API key is required the first time (and after revocation)');
    }
    const saved = await manufacturerApiCredentialRepository.put(
      businessId,
      manufacturerId,
      environment,
      { baseUrl: url.toString().replace(/\/$/, ''), version: apiKey ? { secretEncrypted: encryptSecret(apiKey), fingerprint: secretFingerprint(apiKey), setBy: actor } : null },
      actor,
    );
    this.invalidate(manufacturerId, environment);
    return summarize(saved);
  }

  async rollBack(businessId: string, manufacturerId: string, environment: MachineIntegrationEnvironment, actor: string): Promise<void> {
    await manufacturerApiCredentialRepository.rollBack(businessId, manufacturerId, environment, actor);
    this.invalidate(manufacturerId, environment);
  }

  async revoke(businessId: string, manufacturerId: string, environment: MachineIntegrationEnvironment, reason: string, actor: string): Promise<void> {
    if (!reason.trim()) {
      throw new ManufacturerApiCredentialError('a reason is required to revoke a credential');
    }
    await manufacturerApiCredentialRepository.revoke(businessId, manufacturerId, environment, reason.trim(), actor);
    this.invalidate(manufacturerId, environment);
  }

  async listSummaries(businessId: string, manufacturerId: string): Promise<ManufacturerApiCredentialSummary[]> {
    return (await manufacturerApiCredentialRepository.listForManufacturer(businessId, manufacturerId)).map(summarize);
  }

  async isConfigured(businessId: string, manufacturerId: string, environment: MachineIntegrationEnvironment): Promise<boolean> {
    const credential = await manufacturerApiCredentialRepository.find(businessId, manufacturerId, environment);
    return Boolean(credential?.current && credential.status === 'active');
  }

  /**
   * The plaintext credential for the manufacturer and environment of one
   * machine — for adapters only, at the moment of a call. Null when none
   * is configured or it was revoked; the adapter then refuses the call
   * (a refused vend is provably undelivered, so it is refunded).
   */
  async resolveForMachine(machineId: string): Promise<ResolvedManufacturerApiCredential | null> {
    const integration = await machineIntegrationRepository.findForAdapter(machineId);
    if (!integration) {
      return null;
    }
    const cacheKey = `${integration.manufacturerId}__${integration.environment}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
    const credential = await manufacturerApiCredentialRepository.find(integration.businessId, integration.manufacturerId, integration.environment);
    const value = credential?.status === 'active' && credential.current ? { baseUrl: credential.baseUrl, apiKey: decryptSecret(credential.current.secretEncrypted), version: credential.current.version } : null;
    if (value && isProductionDeployment()) {
      await assertPublicHost(new URL(value.baseUrl).hostname);
    }
    const ttl = cacheTtl();
    if (ttl > 0) {
      cache.set(cacheKey, { value, expiresAt: Date.now() + ttl });
    }
    return value;
  }

  private invalidate(manufacturerId: string, environment: MachineIntegrationEnvironment): void {
    cache.delete(`${manufacturerId}__${environment}`);
  }
}

export const manufacturerApiCredentialService = new ManufacturerApiCredentialService();
export { ManufacturerApiCredentialService };
