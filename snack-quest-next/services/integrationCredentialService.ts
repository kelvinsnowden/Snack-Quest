import 'server-only';

import { manufacturerRepository, ManufacturerNotFoundError } from '@/repositories/manufacturerRepository';
import { integrationCredentialRepository } from '@/repositories/integrationCredentialRepository';
import { isEncryptionConfigured } from '@/lib/secrets/secretCipher';
import { isProductionDeployment } from '@/lib/vending/deploymentEnvironment';
import {
  MANUFACTURER_ONBOARDING_STAGES,
  type IntegrationCredential,
  type IntegrationCredentialKind,
  type IssuedIntegrationCredential,
  type MachineIntegrationEnvironment,
} from '@/types';

export class CredentialIssuanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialIssuanceError';
  }
}

export class IntegrationCredentialNotFoundError extends Error {
  constructor(keyId: string) {
    super(`Credential ${keyId} not found`);
    this.name = 'IntegrationCredentialNotFoundError';
  }
}

/** A credential as the admin console may see it — everything except the secret, which is never readable after issue. */
export type IntegrationCredentialSummary = Omit<IntegrationCredential, 'secretEncrypted'>;

/**
 * Issuing and revoking manufacturer credentials (§ AUTHENTICATION,
 * § MANUFACTURER ONBOARDING: "Credentials → Test Environment →
 * Certification → Production"). Sandbox keys become available at the
 * credentials stage; production keys only once the manufacturer has
 * reached production — so no manufacturer can talk to a live machine
 * before one of its models has been certified.
 */
class IntegrationCredentialService {
  async issue(
    businessId: string,
    manufacturerId: string,
    input: { kind: IntegrationCredentialKind; environment: MachineIntegrationEnvironment; label: string; expiresAt?: Date | null },
    actor: string,
  ): Promise<IssuedIntegrationCredential> {
    const manufacturer = await manufacturerRepository.findById(businessId, manufacturerId);
    if (!manufacturer) {
      throw new ManufacturerNotFoundError(manufacturerId);
    }
    if (manufacturer.status !== 'active') {
      throw new CredentialIssuanceError(`${manufacturer.name} is suspended — no credentials can be issued`);
    }
    if (input.kind !== 'api' && input.kind !== 'webhook') {
      throw new CredentialIssuanceError('kind must be api or webhook');
    }
    const stageIndex = MANUFACTURER_ONBOARDING_STAGES.indexOf(manufacturer.onboardingStage);
    if (input.environment === 'sandbox' && stageIndex < MANUFACTURER_ONBOARDING_STAGES.indexOf('credentials')) {
      throw new CredentialIssuanceError(`Sandbox credentials are issued from the "credentials" onboarding stage; ${manufacturer.name} is at "${manufacturer.onboardingStage}"`);
    }
    if (input.environment === 'production' && manufacturer.onboardingStage !== 'production') {
      throw new CredentialIssuanceError(`Production credentials require the "production" onboarding stage; ${manufacturer.name} is at "${manufacturer.onboardingStage}"`);
    }
    if (input.environment !== 'sandbox' && input.environment !== 'production') {
      throw new CredentialIssuanceError('environment must be sandbox or production');
    }
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw new CredentialIssuanceError('expiresAt must be in the future');
    }
    // The signing secret is stored encrypted only when a key is
    // configured (secretCipher's dev fallback stores it as-is). That
    // fallback is fine for sandbox keys in local development, never for
    // a key that can reach live machines or any key minted on the
    // production deployment.
    if ((input.environment === 'production' || isProductionDeployment()) && !isEncryptionConfigured()) {
      throw new CredentialIssuanceError('SECRET_ENCRYPTION_KEY must be configured before production credentials can be issued');
    }
    return integrationCredentialRepository.issue({
      businessId,
      manufacturerId,
      kind: input.kind,
      environment: input.environment,
      label: input.label.trim() || `${input.kind} (${input.environment})`,
      issuedBy: actor,
      expiresAt: input.expiresAt ?? null,
    });
  }

  async revoke(businessId: string, keyId: string, reason: string, actor: string): Promise<void> {
    if (!reason.trim()) {
      throw new CredentialIssuanceError('A reason is required to revoke a credential');
    }
    if (!(await integrationCredentialRepository.revoke(businessId, keyId, actor, reason.trim()))) {
      throw new IntegrationCredentialNotFoundError(keyId);
    }
  }

  async listForManufacturer(businessId: string, manufacturerId: string): Promise<IntegrationCredentialSummary[]> {
    const credentials = await integrationCredentialRepository.listByManufacturer(businessId, manufacturerId);
    return credentials.map((credential) => ({
      businessId: credential.businessId,
      manufacturerId: credential.manufacturerId,
      kind: credential.kind,
      environment: credential.environment,
      keyId: credential.keyId,
      secretPrefix: credential.secretPrefix,
      label: credential.label,
      issuedAt: credential.issuedAt,
      issuedBy: credential.issuedBy,
      expiresAt: credential.expiresAt,
      revokedAt: credential.revokedAt,
      revokedBy: credential.revokedBy,
      revokedReason: credential.revokedReason,
      lastUsedAt: credential.lastUsedAt,
    }));
  }
}

export const integrationCredentialService = new IntegrationCredentialService();
export { IntegrationCredentialService };
