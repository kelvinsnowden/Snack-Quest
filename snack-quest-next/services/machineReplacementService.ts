import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { machineAgentKeyService } from '@/services/machineAgentKeyService';
import { canAuthenticate } from '@/lib/vending/credentialLifecycle';
import type { Machine } from '@/types';

const HISTORY = 'machineHardwareHistory';

export class MachineReplacementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MachineReplacementError';
  }
}

export interface ReplacementInput {
  serialNumber: string;
  model?: string | null;
  hardwareVersion?: string | null;
  firmwareVersion?: string | null;
  /** The new unit's id with its manufacturer. Required when the machine has an integration. */
  manufacturerMachineId?: string | null;
  reason: string;
}

/** `machineHardwareHistory/{id}` — one hardware swap: what was there before, what replaced it, why and who. */
export interface MachineHardwareChange {
  businessId: string;
  machineId: string;
  before: { serialNumber: string; model: string; hardwareVersion: string | null; firmwareVersion: string | null; manufacturerMachineId: string | null };
  after: { serialNumber: string; model: string; hardwareVersion: string | null; firmwareVersion: string | null; manufacturerMachineId: string | null };
  reason: string;
  revokedKeys: string[];
  replacedBy: string;
  replacedAt: FirebaseFirestore.Timestamp;
}

/**
 * Replacing a machine's hardware (§ F1) while keeping the machine — its
 * code, slots, catalogue, prices, owner, location, sales and alerts all
 * stay. What changes is what identifies the physical unit:
 *
 * - serial number, model and versions on the machine record;
 * - the integration is re-pointed at the new unit's manufacturer id,
 *   which puts it back to "configured": the new unit must pass its
 *   connection test and be activated before it can sell;
 * - API keys that spoke for this machine only are revoked — they lived
 *   on the old hardware.
 *
 * Only while the machine isn't selling (maintenance, offline or not yet
 * live). Stock in the slots isn't touched: count it on the new unit.
 */
class MachineReplacementService {
  async replace(businessId: string, machineId: string, input: ReplacementInput, actor: string): Promise<{ revokedKeys: string[]; integrationReset: boolean }> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);
    const serialNumber = input.serialNumber?.trim() ?? '';
    const reason = input.reason?.trim() ?? '';
    if (!serialNumber) throw new MachineReplacementError('Enter the new unit’s serial number.');
    if (!reason) throw new MachineReplacementError('Say why it is being replaced.');
    if (machine.status === 'active') throw new MachineReplacementError('Move the machine to Maintenance first, so it isn’t selling while its hardware changes.');
    if (machine.status === 'decommissioned') throw new MachineReplacementError('A retired machine can’t get new hardware.');
    if (serialNumber === machine.serialNumber) throw new MachineReplacementError('That is the current unit’s serial number.');

    const integration = await machineIntegrationRepository.findByMachineId(businessId, machineId);
    const newUnitId = input.manufacturerMachineId?.trim() || null;
    if (integration && !newUnitId) throw new MachineReplacementError('Enter the new unit’s id with its manufacturer, so Snack Quest knows which unit is talking.');

    const after = {
      serialNumber,
      model: input.model?.trim() || machine.model,
      hardwareVersion: input.hardwareVersion?.trim() || null,
      firmwareVersion: input.firmwareVersion?.trim() || null,
    };

    // The integration first: if the new unit id is already taken, nothing has changed yet.
    if (integration && newUnitId) {
      await machineIntegrationService.configure(
        businessId,
        { machineId, manufacturerId: integration.manufacturerId, modelId: integration.modelId, manufacturerMachineId: newUnitId, adapterKey: integration.adapterKey, environment: integration.environment, firmwareVersion: after.firmwareVersion },
        actor,
      );
    }

    const revokedKeys: string[] = [];
    for (const key of await machineAgentKeyService.list(businessId, machineId)) {
      if (!canAuthenticate(key.status)) continue;
      await integrationCredentialService.revoke(businessId, key.keyId, `machine hardware replaced: ${reason}`, actor);
      revokedKeys.push(key.keyId);
    }

    await adminFirestore.collection('machines').doc(machineId).update({
      ...after,
      temperatureBreachSince: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    } satisfies Partial<Record<keyof Machine, unknown>>);
    await adminFirestore.collection(HISTORY).add({
      businessId,
      machineId,
      before: { serialNumber: machine.serialNumber, model: machine.model, hardwareVersion: machine.hardwareVersion ?? null, firmwareVersion: machine.firmwareVersion ?? null, manufacturerMachineId: integration?.manufacturerMachineId ?? null },
      after: { ...after, manufacturerMachineId: newUnitId },
      reason,
      revokedKeys,
      replacedBy: actor,
      replacedAt: FieldValue.serverTimestamp(),
    });
    return { revokedKeys, integrationReset: Boolean(integration) };
  }

  async history(businessId: string, machineId: string): Promise<(MachineHardwareChange & { id: string })[]> {
    const snapshot = await adminFirestore.collection(HISTORY).where('machineId', '==', machineId).get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as MachineHardwareChange) }))
      .filter((entry) => entry.businessId === businessId)
      .sort((a, b) => (b.replacedAt?.toMillis() ?? 0) - (a.replacedAt?.toMillis() ?? 0));
  }
}

export const machineReplacementService = new MachineReplacementService();
