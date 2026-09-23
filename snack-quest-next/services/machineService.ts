import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineLocationHistoryRepository } from '@/repositories/machineLocationHistoryRepository';
import { deviceCredentialRepository } from '@/repositories/deviceCredentialRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
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

export interface ProvisionMachineInput {
  businessId: string;
  machineCode: string;
  serialNumber: string;
  manufacturer: Machine['manufacturer'];
  model: string;
  hardwareVersion?: string | null;
  firmwareVersion?: string | null;
  ownerPartnerId?: string | null;
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
  async provisionDevice(input: ProvisionMachineInput): Promise<{ machineId: string; credential: IssuedDeviceCredential }> {
    const existing = await machineRepository.findByMachineCode(input.businessId, input.machineCode);
    if (existing) {
      throw new Error(`machineCode "${input.machineCode}" is already in use by machine ${existing.id}`);
    }
    if (input.ownerPartnerId) {
      const partner = await partnerRepository.findById(input.businessId, input.ownerPartnerId);
      if (!partner) {
        throw new Error(`Partner ${input.ownerPartnerId} not found`);
      }
    }

    const machineId = await machineRepository.create({
      businessId: input.businessId,
      machineCode: input.machineCode,
      serialNumber: input.serialNumber,
      manufacturer: input.manufacturer,
      model: input.model,
      hardwareVersion: input.hardwareVersion ?? null,
      firmwareVersion: input.firmwareVersion ?? null,
      status: 'provisioning',
      ownerPartnerId: input.ownerPartnerId ?? null,
      locationId: null,
      latitude: null,
      longitude: null,
      address: null,
      venueName: null,
      installedAt: null,
      lastSeenAt: null,
      createdBy: input.actor,
    });

    const credential = await deviceCredentialRepository.issue({
      businessId: input.businessId,
      machineId,
      issuedBy: input.actor,
    });

    return { machineId, credential };
  }

  async rotateDeviceCredential(businessId: string, machineId: string, actor: string): Promise<IssuedDeviceCredential> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    return deviceCredentialRepository.issue({ businessId, machineId, issuedBy: actor });
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
export { MachineNotFoundError };
