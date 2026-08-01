import 'server-only';

import { featureFlagRepository } from '@/repositories/featureFlagRepository';
import { FEATURE_FLAG_CATALOG, getFlagDefinition } from '@/lib/featureFlags/catalog';

export class UnknownFeatureFlagError extends Error {
  constructor(key: string) {
    super(`"${key}" is not a known feature flag.`);
    this.name = 'UnknownFeatureFlagError';
  }
}

export interface FeatureFlagView {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  /** `false` once an admin has explicitly saved this flag for this business — `true` means it's still just showing the catalog default. */
  isOverridden: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Owns tenant-scoped runtime feature flags (§ Phase 6). Every flag
 * this service knows about comes from `FEATURE_FLAG_CATALOG` — a
 * business can never end up with a flag key nothing in code checks,
 * and every code-gated feature always has a visible admin toggle.
 * Fails closed: `isEnabled()` for a key with no catalog entry is
 * always `false`, never a silent no-op pass-through.
 */
class FeatureFlagService {
  async listFlags(businessId: string): Promise<FeatureFlagView[]> {
    const stored = await featureFlagRepository.listByBusiness(businessId);
    const storedByKey = new Map(stored.map(({ data }) => [data.key, data]));

    return FEATURE_FLAG_CATALOG.map((definition) => {
      const override = storedByKey.get(definition.key);
      return {
        key: definition.key,
        name: definition.name,
        description: definition.description,
        enabled: override ? override.enabled : definition.defaultEnabled,
        isOverridden: Boolean(override),
        updatedAt: override ? isoFromTimestampLike(override.updatedAt) : null,
        updatedBy: override?.updatedBy ?? null,
      };
    });
  }

  /** The real gate — call this anywhere in the app that needs to check a flag before running a feature's code path. Unknown keys fail closed (`false`), never throw, so a gate check can never itself take down the feature it's protecting. */
  async isEnabled(businessId: string, key: string): Promise<boolean> {
    const definition = getFlagDefinition(key);
    if (!definition) {
      return false;
    }
    const stored = await featureFlagRepository.get(businessId, key);
    return stored ? stored.enabled : definition.defaultEnabled;
  }

  async setEnabled(businessId: string, key: string, enabled: boolean, actor: string): Promise<FeatureFlagView> {
    const definition = getFlagDefinition(key);
    if (!definition) {
      throw new UnknownFeatureFlagError(key);
    }
    await featureFlagRepository.set(
      businessId,
      { key: definition.key, name: definition.name, description: definition.description, enabled },
      actor,
    );
    const flags = await this.listFlags(businessId);
    return flags.find((f) => f.key === key)!;
  }
}

function isoFromTimestampLike(value: unknown): string | null {
  const timestamp = value as { toDate?: () => Date } | undefined;
  return timestamp?.toDate ? timestamp.toDate().toISOString() : null;
}

export const featureFlagService = new FeatureFlagService();
export { FeatureFlagService };
