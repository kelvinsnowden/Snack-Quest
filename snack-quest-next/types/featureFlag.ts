import type { Timestamp } from 'firebase/firestore';

/**
 * `businesses/{businessId}/featureFlags/{key}` — a tenant-scoped
 * runtime switch (§ Phase 6: Feature flags). Subcollection of
 * `businesses`, not a top-level collection, same placement as
 * `integrationSecrets` — this is per-tenant config, not global.
 * Absent (no doc) reads as **disabled**: a flag nobody has ever
 * touched must never silently turn a feature on, so `FeatureFlagService`
 * always fails closed rather than assuming an unwritten flag means
 * "on by default."
 */
export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy: string;
}
