import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineLocationHistoryRepository } from '@/repositories/machineLocationHistoryRepository';
import { deviceCredentialRepository } from '@/repositories/deviceCredentialRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { machineOwnershipHistoryRepository } from '@/repositories/machineOwnershipHistoryRepository';
import { machineSubscriptionRepository } from '@/repositories/machineSubscriptionRepository';
import { FieldValue } from 'firebase-admin/firestore';
import type { DispenseConfirmationStrategy } from '@/lib/vending/hardwareAdapter';
import { isRegisteredAdapterKey, UnsupportedManufacturerError } from '@/lib/vending/adapterRegistry';
import {
  MACHINE_STATUS_TRANSITIONS,
  type Machine,
  type MachineStatus,
  type IssuedDeviceCredential,
} from '@/types';

export class IllegalMachineStatusTransitionError extends Error {
  constructor(from: MachineStatus, to: MachineStatus) {
    super(`Cannot move machine from "${from}" to "${to}"`);
    this.name = 'IllegalMachineStatusTransitionError';
  }
}

export class PartnerDoesNotOwnMachineError extends Error {
  constructor(partnerId: string, machineId: string) {
    super(`Partner ${partnerId} does not own machine ${machineId}`);
    this.name = 'PartnerDoesNotOwnMachineError';
  }
}

export class OwnerReassignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnerReassignmentError';
  }
}

/** `SQ-MCH-000001` — Snack Quest's own machine identity, zero-padded so codes sort in registration order. */
export function formatMachineCode(sequence: number): string {
  return `SQ-MCH-${String(sequence).padStart(6, '0')}`;
}

function machineCodeCounterRef(businessId: string) {
  return adminFirestore.collection('businesses').doc(businessId).collection('counters').doc('machines');
}

export interface ProvisionMachineInput {
  businessId: string;
  /** Omit (or null) to have Snack Quest generate the next `SQ-MCH-nnnnnn`. Supplied only for machines whose code predates generation. */
  machineCode?: string | null;
  serialNumber: string;
  /** A registered adapter key — see `Machine.manufacturer`. */
  manufacturer: string;
  model: string;
  hardwareVersion?: string | null;
  firmwareVersion?: string | null;
  ownerPartnerId?: string | null;
  /** Overrides the platform default reserve baseline (§ KSh 100,000 MACHINE STOCK BASELINE) — null/omitted uses the default. */
  inventoryReserveTargetKes?: number | null;
  /** Which physical method this machine's hardware uses to confirm a dispense (§ DISPENSE CONFIRMATION STRATEGIES) — null/omitted until staff record what the physical machine actually uses. */
  dispenseConfirmationStrategy?: DispenseConfirmationStrategy | null;
  actor: string;
}

/**
 * Machine lifecycle, status transitions, location history and
 * partner-scoping enforcement (§ CORE ENTITIES 1, § RBAC:
 * "a partner must only be able to access machines they own").
 *
 * The one rule every method here answers to: a machine's own report
 * of itself is never trusted as more than a report. `provisionDevice`
 * is the only place a credential is minted, and even that credential
 * only ever *authenticates* a request — it grants no authority beyond
 * "this request really is from that one machine", nothing about the
 * business meaning of what it then asks to do.
 */
class MachineService {
  /**
   * Creates the machine record and issues its first device credential
   * in one call — the whole provisioning act (§ MACHINE INSTALLATION
   * WORKFLOW starts here, at `PROVISIONING`). Returns the plaintext
   * secret exactly once; there is no way to retrieve it again, only
   * to rotate it via `rotateDeviceCredential`.
   */
  async provisionDevice(input: ProvisionMachineInput): Promise<{ machineId: string; machineCode: string; credential: IssuedDeviceCredential }> {
    if (!isRegisteredAdapterKey(input.manufacturer)) {
      throw new UnsupportedManufacturerError(input.manufacturer);
    }
    const machineCode = input.machineCode ?? (await this.allocateMachineCode(input.businessId));
    const existing = await machineRepository.findByMachineCode(input.businessId, machineCode);
    if (existing) {
      throw new Error(`machineCode "${machineCode}" is already in use by machine ${existing.id}`);
    }
    if (input.ownerPartnerId) {
      const partner = await partnerRepository.findById(input.businessId, input.ownerPartnerId);
      if (!partner) {
        throw new Error(`Partner ${input.ownerPartnerId} not found`);
      }
    }

    const machineId = await machineRepository.create({
      businessId: input.businessId,
      machineCode,
      serialNumber: input.serialNumber,
      manufacturer: input.manufacturer,
      manufacturerId: null,
      modelId: null,
      model: input.model,
      hardwareVersion: input.hardwareVersion ?? null,
      firmwareVersion: input.firmwareVersion ?? null,
      status: 'provisioning',
      ownerPartnerId: input.ownerPartnerId ?? null,
      ownershipType: input.ownerPartnerId ? 'third_party' : 'snack_quest',
      locationId: null,
      latitude: null,
      longitude: null,
      address: null,
      venueName: null,
      installedAt: null,
      lastSeenAt: null,
      inventoryReserveTargetKes: input.inventoryReserveTargetKes ?? null,
      dispenseConfirmationStrategy: input.dispenseConfirmationStrategy ?? null,
      createdBy: input.actor,
    });

    const credential = await deviceCredentialRepository.issue({
      businessId: input.businessId,
      machineId,
      issuedBy: input.actor,
    });

    return { machineId, machineCode, credential };
  }

  /**
   * The next `SQ-MCH-nnnnnn`, allocated in a transaction on
   * `businesses/{id}/counters/machines` (the same counter pattern order
   * numbers use) so two concurrent registrations can never mint the
   * same code. A gap from a registration that later fails is harmless;
   * a duplicate would not be.
   */
  private async allocateMachineCode(businessId: string): Promise<string> {
    const ref = machineCodeCounterRef(businessId);
    const sequence = await adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const next = ((snapshot.data()?.value as number | undefined) ?? 0) + 1;
      tx.set(ref, { value: next }, { merge: true });
      return next;
    });
    return formatMachineCode(sequence);
  }

  async rotateDeviceCredential(businessId: string, machineId: string, actor: string): Promise<IssuedDeviceCredential> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    return deviceCredentialRepository.issue({ businessId, machineId, issuedBy: actor });
  }

  /**
   * Issues a new screen key and, when `revokeOthers` is set, revokes every
   * other active key for the machine at once — the response to a leaked
   * key. Without it the old key keeps working until someone revokes it,
   * so the screen isn't cut off before it's re-paired.
   */
  async replaceDeviceCredential(businessId: string, machineId: string, actor: string, options: { revokeOthers: boolean; reason: string | null }): Promise<{ issued: IssuedDeviceCredential; revokedIds: string[] }> {
    const issued = await this.rotateDeviceCredential(businessId, machineId, actor);
    const revokedIds: string[] = [];
    if (options.revokeOthers) {
      const active = await deviceCredentialRepository.listActiveByMachine(businessId, machineId);
      for (const { id } of active) {
        if (id === issued.credentialId) continue;
        await deviceCredentialRepository.revoke(businessId, id, actor, options.reason ?? 'Replaced by a new key');
        revokedIds.push(id);
      }
    }
    return { issued, revokedIds };
  }

  /** Immediate revocation, per `DeviceCredential`'s own doc comment — the next request with this secret is rejected, no grace window. */
  async revokeDeviceCredential(businessId: string, credentialId: string, actor: string, reason: string): Promise<void> {
    await deviceCredentialRepository.revoke(businessId, credentialId, actor, reason);
  }

  async updateStatus(businessId: string, machineId: string, to: MachineStatus, actor: string): Promise<void> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    const allowed = MACHINE_STATUS_TRANSITIONS[machine.status] ?? [];
    if (!allowed.includes(to)) {
      throw new IllegalMachineStatusTransitionError(machine.status, to);
    }
    await machineRepository.updateStatus(businessId, machineId, to, actor);
  }

  /**
   * Moves a machine to a new location, closing whatever history entry
   * was open and opening a new one, in the same transaction as the
   * update to the machine's own location fields — see
   * `MachineLocationHistoryEntry`'s own doc comment for why these
   * three writes must never be allowed to disagree.
   */
  async relocate(
    businessId: string,
    machineId: string,
    location: { locationId: string | null; latitude: number | null; longitude: number | null; address: string | null; venueName: string | null },
    actor: string,
    reason: string | null = null,
  ): Promise<void> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    await adminFirestore.runTransaction(async (tx) => {
      await machineLocationHistoryRepository.closeCurrentInTransaction(tx, businessId, machineId);
      machineLocationHistoryRepository.openInTransaction(tx, {
        businessId,
        machineId,
        ...location,
        movedBy: actor,
        reason,
      });
      machineRepository.updateLocationInTransaction(tx, machineId, location, actor);
    });
  }

  /**
   * Hands a machine to another owner (or back to Snack Quest with
   * `partnerId: null`). Refused while the current owner still has an
   * active agreement on it — terminate that first, so the agreement's
   * end date and the ownership change line up and no settlement is
   * computed on the wrong terms. The history close/open and the
   * machine's own `ownerPartnerId`/`ownerSince` are one transaction.
   *
   * On a machine's first reassignment the owner it had since
   * registration is written into the history too, so settlements can
   * check who owned it for any period after registration.
   */
  async reassignOwner(businessId: string, machineId: string, partnerId: string | null, actor: string, reason: string | null = null): Promise<void> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    if ((machine.ownerPartnerId ?? null) === partnerId) {
      throw new OwnerReassignmentError('The machine already belongs to that owner.');
    }
    if (machine.status === 'decommissioned') {
      throw new OwnerReassignmentError('A retired machine can’t change owner.');
    }
    if (partnerId !== null) {
      const partner = await partnerRepository.findById(businessId, partnerId);
      if (!partner || partner.deletedAt) {
        throw new OwnerReassignmentError(`Owner ${partnerId} not found.`);
      }
      if (partner.status !== 'active') {
        throw new OwnerReassignmentError('That owner is suspended. Reactivate them before giving them a machine.');
      }
    }
    const agreement = await partnerMachineAgreementRepository.findActiveForMachine(businessId, machineId);
    if (agreement) {
      throw new OwnerReassignmentError('This machine still has an active agreement with its current owner. End that agreement first.');
    }
    // Settlements take the machine's open subscription off whoever owns it, so the old owner's must end first.
    const subscription = await machineSubscriptionRepository.findActiveForMachine(businessId, machineId);
    if (subscription) {
      throw new OwnerReassignmentError('This machine still has a subscription for its current owner. Cancel it first.');
    }

    await adminFirestore.runTransaction(async (tx) => {
      const ref = machineRepository.getRef(machineId);
      const snapshot = await tx.get(ref);
      const current = snapshot.data() as Machine | undefined;
      if (!current || current.businessId !== businessId) {
        throw new MachineNotFoundError(machineId);
      }
      if ((current.ownerPartnerId ?? null) !== (machine.ownerPartnerId ?? null)) {
        throw new OwnerReassignmentError('Someone else changed this machine’s owner just now. Reload and try again.');
      }
      const open = await machineOwnershipHistoryRepository.findOpenInTransaction(tx, businessId, machineId);
      if (open.length === 0) {
        machineOwnershipHistoryRepository.recordOriginalInTransaction(tx, {
          businessId,
          machineId,
          partnerId: current.ownerPartnerId ?? null,
          since: current.createdAt ? (current.createdAt as unknown as { toDate(): Date }).toDate() : new Date(0),
          changedBy: actor,
        });
      }
      for (const doc of open) {
        machineOwnershipHistoryRepository.closeInTransaction(tx, doc.ref);
      }
      machineOwnershipHistoryRepository.openInTransaction(tx, { businessId, machineId, partnerId, changedBy: actor, reason });
      // Ownership follows the owner: no owner is a Snack Quest machine; an owner keeps the type already chosen for them (a third party unless set).
      const ownershipType = partnerId === null ? 'snack_quest' : current.ownershipType && current.ownershipType !== 'snack_quest' ? current.ownershipType : 'third_party';
      tx.update(ref, { ownerPartnerId: partnerId, ownershipType, ownerSince: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
    });
  }

  async findById(businessId: string, machineId: string): Promise<Machine | null> {
    return machineRepository.findById(businessId, machineId);
  }

  async listByBusiness(businessId: string, options: { status?: MachineStatus; limit?: number; cursor?: string } = {}) {
    return machineRepository.listByBusiness(businessId, options);
  }

  /** The enforcement primitive behind partner RBAC — every partner-scoped read of one machine goes through this rather than `findById` alone. */
  async assertPartnerOwnsMachine(businessId: string, partnerId: string, machineId: string): Promise<Machine> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    if (machine.ownerPartnerId !== partnerId) {
      throw new PartnerDoesNotOwnMachineError(partnerId, machineId);
    }
    return machine;
  }

  async listByPartner(businessId: string, partnerId: string) {
    return machineRepository.listByPartner(businessId, partnerId);
  }

  async fleetStatusSummary(businessId: string): Promise<Record<MachineStatus, number> & { total: number }> {
    const all = await machineRepository.listAllStatuses(businessId);
    const summary: Record<MachineStatus, number> = {
      provisioning: 0,
      installing: 0,
      testing: 0,
      active: 0,
      maintenance: 0,
      offline: 0,
      decommissioned: 0,
    };
    for (const { status } of all) {
      summary[status] += 1;
    }
    return { ...summary, total: all.length };
  }
}

export const machineService = new MachineService();
export { MachineNotFoundError, MachineService };
