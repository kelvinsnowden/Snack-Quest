import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type {
  IntegrationErrorKind,
  IntegrationSignalKind,
  MachineIntegration,
  MachineIntegrationState,
} from '@/types';

const COLLECTION = 'machineIntegrations';
/** One claim doc per (manufacturer, manufacturer machine id) — makes that pair unique across the fleet, enforced in the same transaction as the integration write. */
const IDENTITY_CLAIMS = 'machineIntegrationIdentities';

export class MachineIntegrationNotFoundError extends Error {
  constructor(machineId: string) {
    super(`Machine ${machineId} has no integration configured`);
    this.name = 'MachineIntegrationNotFoundError';
  }
}

export class ManufacturerMachineIdInUseError extends Error {
  constructor(manufacturerMachineId: string, otherMachineId: string) {
    super(`Manufacturer machine id "${manufacturerMachineId}" is already bound to machine ${otherMachineId}`);
    this.name = 'ManufacturerMachineIdInUseError';
  }
}

function identityClaimId(businessId: string, manufacturerId: string, manufacturerMachineId: string): string {
  // Firestore ids may not contain '/'; manufacturer ids occasionally do.
  return `${businessId}:${manufacturerId}:${encodeURIComponent(manufacturerMachineId)}`;
}

export type MachineIntegrationConfig = Pick<
  MachineIntegration,
  | 'businessId'
  | 'machineId'
  | 'machineCode'
  | 'manufacturerId'
  | 'modelId'
  | 'manufacturerMachineId'
  | 'controllerType'
  | 'controllerVersion'
  | 'firmwareVersion'
  | 'integrationType'
  | 'integrationVersion'
  | 'adapterKey'
  | 'environment'
>;

const EMPTY_SIGNALS: Record<IntegrationSignalKind, null> = {
  heartbeat: null,
  api_request: null,
  dispense_success: null,
  inventory_sync: null,
  webhook: null,
};

const ZERO_ERRORS: Record<IntegrationErrorKind, number> = {
  connection: 0,
  authentication: 0,
  timeout: 0,
  protocol: 0,
};

/**
 * `machineIntegrations/{machineId}` reads/writes. Persistence only —
 * `machineIntegrationService` owns CONFIGURE → TEST → ACTIVATE.
 */
class MachineIntegrationRepository {
  /**
   * Writes (or rewrites) a machine's integration config and drops it
   * back to `configured` — any config change invalidates a previous
   * test and activation. Health history (signals, error counts)
   * survives a reconfiguration; it describes the machine, not the
   * config. Also mirrors the adapter/manufacturer/model onto the
   * machine document so the adapter resolver keeps working
   * synchronously from `Machine.manufacturer`.
   */
  async configure(config: MachineIntegrationConfig, actor: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(config.machineId);
    const machineRef = adminFirestore.collection('machines').doc(config.machineId);
    const claimRef = adminFirestore
      .collection(IDENTITY_CLAIMS)
      .doc(identityClaimId(config.businessId, config.manufacturerId, config.manufacturerMachineId));

    await adminFirestore.runTransaction(async (tx) => {
      const [existing, claim] = await Promise.all([tx.get(ref), tx.get(claimRef)]);
      const claimedBy = claim.exists ? (claim.data()?.machineId as string) : null;
      if (claimedBy && claimedBy !== config.machineId) {
        throw new ManufacturerMachineIdInUseError(config.manufacturerMachineId, claimedBy);
      }
      const previous = existing.exists ? (existing.data() as MachineIntegration) : null;
      if (
        previous &&
        (previous.manufacturerId !== config.manufacturerId || previous.manufacturerMachineId !== config.manufacturerMachineId)
      ) {
        tx.delete(
          adminFirestore
            .collection(IDENTITY_CLAIMS)
            .doc(identityClaimId(previous.businessId, previous.manufacturerId, previous.manufacturerMachineId)),
        );
      }
      tx.set(claimRef, { businessId: config.businessId, machineId: config.machineId });

      const now = FieldValue.serverTimestamp();
      tx.set(ref, {
        ...config,
        state: 'configured' satisfies MachineIntegrationState,
        lastConnectionTest: null,
        activatedAt: null,
        activatedBy: null,
        suspendedAt: null,
        suspendedReason: null,
        signals: previous?.signals ?? EMPTY_SIGNALS,
        errorCounts: previous?.errorCounts ?? ZERO_ERRORS,
        lastError: previous?.lastError ?? null,
        lastReportedStatus: previous?.lastReportedStatus ?? null,
        createdAt: previous?.createdAt ?? now,
        createdBy: previous?.createdBy ?? actor,
        updatedAt: now,
        updatedBy: actor,
        deletedAt: null,
      });
      tx.update(machineRef, {
        manufacturer: config.adapterKey,
        manufacturerId: config.manufacturerId,
        modelId: config.modelId,
        updatedAt: now,
        updatedBy: actor,
      });
    });
  }

  async findByMachineId(businessId: string, machineId: string): Promise<MachineIntegration | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(machineId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineIntegration;
    return data.businessId === businessId ? data : null;
  }

  /**
   * For adapters, which only ever receive a machine id — a globally
   * unique document id that Snack Quest itself resolved, never a value
   * taken from a request — so no tenant check is needed or possible.
   */
  async findForAdapter(machineId: string): Promise<MachineIntegration | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(machineId).get();
    return snapshot.exists ? (snapshot.data() as MachineIntegration) : null;
  }

  async findByMachineCode(businessId: string, machineCode: string): Promise<MachineIntegration | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineCode', '==', machineCode)
      .limit(1)
      .get();
    return snapshot.empty ? null : (snapshot.docs[0].data() as MachineIntegration);
  }

  async findByManufacturerMachineId(businessId: string, manufacturerId: string, manufacturerMachineId: string): Promise<MachineIntegration | null> {
    const claim = await adminFirestore
      .collection(IDENTITY_CLAIMS)
      .doc(identityClaimId(businessId, manufacturerId, manufacturerMachineId))
      .get();
    if (!claim.exists) {
      return null;
    }
    return this.findByMachineId(businessId, claim.data()?.machineId as string);
  }

  async listByBusiness(businessId: string): Promise<MachineIntegration[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => doc.data() as MachineIntegration);
  }

  async listByModel(businessId: string, modelId: string): Promise<MachineIntegration[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('modelId', '==', modelId)
      .get();
    return snapshot.docs.map((doc) => doc.data() as MachineIntegration);
  }

  async setState(
    businessId: string,
    machineId: string,
    state: MachineIntegrationState,
    actor: string,
    extra: Partial<Pick<MachineIntegration, 'suspendedReason'>> = {},
  ): Promise<void> {
    const ref = await this.requireRef(businessId, machineId);
    const now = FieldValue.serverTimestamp();
    await ref.update({
      state,
      ...(state === 'active' ? { activatedAt: now, activatedBy: actor, suspendedAt: null, suspendedReason: null } : {}),
      ...(state === 'suspended' ? { suspendedAt: now, suspendedReason: extra.suspendedReason ?? null } : {}),
      updatedAt: now,
      updatedBy: actor,
    });
  }

  async recordConnectionTest(
    businessId: string,
    machineId: string,
    result: { ok: boolean; detail: string; latencyMs: number | null },
    actor: string,
  ): Promise<void> {
    const ref = await this.requireRef(businessId, machineId);
    await ref.update({
      lastConnectionTest: { ...result, at: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  /** Best-effort bookkeeping on hot paths (every heartbeat) — a machine with no integration record is simply not tracked, never an error. */
  async recordSignal(machineId: string, kind: IntegrationSignalKind): Promise<void> {
    await this.updateIfExists(machineId, { [`signals.${kind}`]: FieldValue.serverTimestamp() });
  }

  async recordError(machineId: string, kind: IntegrationErrorKind, message: string): Promise<void> {
    await this.updateIfExists(machineId, {
      [`errorCounts.${kind}`]: FieldValue.increment(1),
      lastError: { kind, message: message.slice(0, 500), at: FieldValue.serverTimestamp() },
    });
  }

  async setLastReportedStatus(machineId: string, status: Omit<NonNullable<MachineIntegration['lastReportedStatus']>, 'reportedAt'>): Promise<void> {
    await this.updateIfExists(machineId, { lastReportedStatus: { ...status, reportedAt: FieldValue.serverTimestamp() } });
  }

  async updateFirmware(machineId: string, facts: Partial<Pick<MachineIntegration, 'firmwareVersion' | 'controllerType' | 'controllerVersion' | 'integrationVersion'>>): Promise<void> {
    const defined = Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined && value !== null));
    if (Object.keys(defined).length > 0) {
      await this.updateIfExists(machineId, defined);
    }
  }

  private async updateIfExists(machineId: string, update: Record<string, unknown>): Promise<void> {
    try {
      await adminFirestore.collection(COLLECTION).doc(machineId).update(update);
    } catch (error) {
      // NOT_FOUND (5): a pre-registry machine with no integration record.
      if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 5) {
        return;
      }
      throw error;
    }
  }

  private async requireRef(businessId: string, machineId: string) {
    const ref = adminFirestore.collection(COLLECTION).doc(machineId);
    const snapshot = await ref.get();
    if (!snapshot.exists || (snapshot.data() as MachineIntegration).businessId !== businessId) {
      throw new MachineIntegrationNotFoundError(machineId);
    }
    return ref;
  }
}

export const machineIntegrationRepository = new MachineIntegrationRepository();
