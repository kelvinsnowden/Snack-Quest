import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { KioskExperiencePatch, KioskLayer, KioskLayerScope, KioskLayerVersion, KioskPublishedIndex } from '@/types';

const LAYERS = 'kioskLayers';
const VERSIONS = 'kioskLayerVersions';
const INDEX = 'kioskPublishedIndex';

export function kioskLayerId(businessId: string, scope: KioskLayerScope, scopeId: string): string {
  return `${businessId}_${scope}_${scopeId}`;
}

export function kioskLayerKey(scope: KioskLayerScope, scopeId: string): string {
  return `${scope}:${scopeId}`;
}

export class KioskLayerNotFoundError extends Error {
  constructor(message = 'That screen design layer has nothing saved yet.') {
    super(message);
    this.name = 'KioskLayerNotFoundError';
  }
}

export class KioskVersionNotFoundError extends Error {
  constructor(versionNumber: number) {
    super(`Version ${versionNumber} of this layer doesn’t exist.`);
    this.name = 'KioskVersionNotFoundError';
  }
}

/**
 * `kioskLayers` (one editable draft per scope), `kioskLayerVersions`
 * (immutable published versions) and `kioskPublishedIndex` (one document
 * per business naming the live version of every published layer).
 * Publishing writes all three in one transaction, so the index can never
 * point at a version that doesn't exist.
 */
class KioskLayerRepository {
  async get(businessId: string, scope: KioskLayerScope, scopeId: string): Promise<KioskLayer | null> {
    const snapshot = await adminFirestore.collection(LAYERS).doc(kioskLayerId(businessId, scope, scopeId)).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as KioskLayer;
    return data.businessId === businessId ? data : null;
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: KioskLayer }[]> {
    const snapshot = await adminFirestore.collection(LAYERS).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as KioskLayer }));
  }

  async saveDraft(businessId: string, scope: KioskLayerScope, scopeId: string, draft: KioskExperiencePatch, actor: string): Promise<void> {
    const ref = adminFirestore.collection(LAYERS).doc(kioskLayerId(businessId, scope, scopeId));
    await adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const now = FieldValue.serverTimestamp();
      if (!snapshot.exists) {
        tx.set(ref, { businessId, scope, scopeId, draft, draftUpdatedAt: now, draftUpdatedBy: actor, publishedVersionId: null, publishedVersionNumber: 0, createdAt: now, updatedAt: now });
      } else {
        // `set` without merge on the draft field: a removed override must disappear, not linger from a deep merge.
        tx.update(ref, { draft, draftUpdatedAt: now, draftUpdatedBy: actor, updatedAt: now });
      }
    });
  }

  /**
   * Writes a new immutable version and makes it live. `config` is what
   * gets published — the layer's draft, or an old version's config on a
   * rollback — and it is checked by the caller before this runs.
   */
  async publish(input: {
    businessId: string;
    scope: KioskLayerScope;
    scopeId: string;
    config: KioskExperiencePatch;
    note: string;
    rolledBackFrom: number | null;
    actor: string;
  }): Promise<{ versionId: string; versionNumber: number }> {
    const layerRef = adminFirestore.collection(LAYERS).doc(kioskLayerId(input.businessId, input.scope, input.scopeId));
    const indexRef = adminFirestore.collection(INDEX).doc(input.businessId);
    return adminFirestore.runTransaction(async (tx) => {
      const [layerSnap, indexSnap] = await Promise.all([tx.get(layerRef), tx.get(indexRef)]);
      if (!layerSnap.exists || (layerSnap.data() as KioskLayer).businessId !== input.businessId) throw new KioskLayerNotFoundError();
      const layer = layerSnap.data() as KioskLayer;
      const versionNumber = layer.publishedVersionNumber + 1;
      const versionRef = adminFirestore.collection(VERSIONS).doc(`${layerRef.id}_v${versionNumber}`);
      const now = FieldValue.serverTimestamp();
      const version: Omit<KioskLayerVersion, 'publishedAt'> & { publishedAt: FieldValue } = {
        businessId: input.businessId,
        layerId: layerRef.id,
        scope: input.scope,
        scopeId: input.scopeId,
        versionNumber,
        config: input.config,
        note: input.note,
        rolledBackFrom: input.rolledBackFrom,
        publishedBy: input.actor,
        publishedAt: now,
      };
      // `create`, not `set`: a version id is written once, ever.
      tx.create(versionRef, version);
      tx.update(layerRef, { publishedVersionId: versionRef.id, publishedVersionNumber: versionNumber, updatedAt: now });
      const key = kioskLayerKey(input.scope, input.scopeId);
      if (indexSnap.exists) {
        tx.update(indexRef, { [`layers.${key}`]: { versionId: versionRef.id, versionNumber }, updatedAt: now });
      } else {
        tx.set(indexRef, { businessId: input.businessId, layers: { [key]: { versionId: versionRef.id, versionNumber } }, updatedAt: now });
      }
      return { versionId: versionRef.id, versionNumber };
    });
  }

  /** Takes a layer off the machines it covers (they fall back to the next layer up). Its versions and draft stay. */
  async withdraw(businessId: string, scope: KioskLayerScope, scopeId: string): Promise<void> {
    const layerRef = adminFirestore.collection(LAYERS).doc(kioskLayerId(businessId, scope, scopeId));
    const indexRef = adminFirestore.collection(INDEX).doc(businessId);
    await adminFirestore.runTransaction(async (tx) => {
      const [layerSnap, indexSnap] = await Promise.all([tx.get(layerRef), tx.get(indexRef)]);
      if (!layerSnap.exists || (layerSnap.data() as KioskLayer).businessId !== businessId) throw new KioskLayerNotFoundError();
      const now = FieldValue.serverTimestamp();
      tx.update(layerRef, { publishedVersionId: null, updatedAt: now });
      if (indexSnap.exists) tx.update(indexRef, { [`layers.${kioskLayerKey(scope, scopeId)}`]: FieldValue.delete(), updatedAt: now });
    });
  }

  async getIndex(businessId: string): Promise<KioskPublishedIndex | null> {
    const snapshot = await adminFirestore.collection(INDEX).doc(businessId).get();
    return snapshot.exists ? (snapshot.data() as KioskPublishedIndex) : null;
  }

  async getVersions(businessId: string, versionIds: string[]): Promise<Map<string, KioskLayerVersion>> {
    const found = new Map<string, KioskLayerVersion>();
    if (versionIds.length === 0) return found;
    const snapshots = await adminFirestore.getAll(...versionIds.map((id) => adminFirestore.collection(VERSIONS).doc(id)));
    for (const snapshot of snapshots) {
      const data = snapshot.data() as KioskLayerVersion | undefined;
      if (data && data.businessId === businessId) found.set(snapshot.id, data);
    }
    return found;
  }

  async listVersions(businessId: string, scope: KioskLayerScope, scopeId: string, limit = 50): Promise<{ id: string; data: KioskLayerVersion }[]> {
    const snapshot = await adminFirestore
      .collection(VERSIONS)
      .where('layerId', '==', kioskLayerId(businessId, scope, scopeId))
      .orderBy('versionNumber', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as KioskLayerVersion })).filter(({ data }) => data.businessId === businessId);
  }

  async findVersion(businessId: string, scope: KioskLayerScope, scopeId: string, versionNumber: number): Promise<KioskLayerVersion> {
    const snapshot = await adminFirestore.collection(VERSIONS).doc(`${kioskLayerId(businessId, scope, scopeId)}_v${versionNumber}`).get();
    const data = snapshot.data() as KioskLayerVersion | undefined;
    if (!data || data.businessId !== businessId) throw new KioskVersionNotFoundError(versionNumber);
    return data;
  }
}

export const kioskLayerRepository = new KioskLayerRepository();
