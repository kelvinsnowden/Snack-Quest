import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { locationRepository } from '@/repositories/locationRepository';
import {
  DEFAULT_COMMERCIAL_TERMS,
  INVENTORY_OWNERS,
  MACHINE_OWNERSHIP_TYPES,
  MAINTENANCE_RESPONSIBILITIES,
  OWNER_COST_BASES,
  SETTLEMENT_MODELS,
  ownershipTypeOf,
  type CommercialTerms,
  type Machine,
  type MachineEconomicProfile,
  type MachineOwnershipType,
  type PartnerMachineAgreement,
} from '@/types';

export class EconomicProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EconomicProfileValidationError';
  }
}

/** Fills the terms an agreement doesn't state with the behaviour the system already had — never with an invented figure. */
export function resolveTerms(stored: Partial<CommercialTerms> | undefined): CommercialTerms {
  return { ...DEFAULT_COMMERCIAL_TERMS, ...(stored ?? {}) };
}

/** Validates a partial set of terms from a request. Returns only the fields given. */
export function parseCommercialTerms(input: unknown): Partial<CommercialTerms> {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object') throw new EconomicProfileValidationError('"terms" must be an object.');
  const raw = input as Record<string, unknown>;
  const terms: Partial<CommercialTerms> = {};
  const oneOf = <T extends string>(key: keyof CommercialTerms, allowed: readonly T[]): T | undefined => {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
      throw new EconomicProfileValidationError(`"${key}" must be one of: ${allowed.join(', ')}.`);
    }
    return value as T;
  };
  const inventoryOwner = oneOf('inventoryOwner', INVENTORY_OWNERS);
  if (inventoryOwner) terms.inventoryOwner = inventoryOwner;
  const ownerCostBasis = oneOf('ownerCostBasis', OWNER_COST_BASES);
  if (ownerCostBasis) terms.ownerCostBasis = ownerCostBasis;
  const settlementModel = oneOf('settlementModel', SETTLEMENT_MODELS);
  if (settlementModel) terms.settlementModel = settlementModel;
  const maintenanceResponsibility = oneOf('maintenanceResponsibility', MAINTENANCE_RESPONSIBILITIES);
  if (maintenanceResponsibility) terms.maintenanceResponsibility = maintenanceResponsibility;
  if (raw.adRevenueSharePartnerPct !== undefined) {
    const pct = raw.adRevenueSharePartnerPct;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new EconomicProfileValidationError('"adRevenueSharePartnerPct" must be a number from 0 to 100.');
    }
    terms.adRevenueSharePartnerPct = pct;
  }
  if (raw.showLandedCostToOwner !== undefined) {
    if (typeof raw.showLandedCostToOwner !== 'boolean') throw new EconomicProfileValidationError('"showLandedCostToOwner" must be true or false.');
    terms.showLandedCostToOwner = raw.showLandedCostToOwner;
  }
  return terms;
}

/**
 * One machine's economic profile (§ MACHINE ECONOMIC PROFILE,
 * docs/OS_MASTER_GAP_ANALYSIS.md §3.1): who owns it, on what terms, who
 * owns its stock, how it settles. Settlement, the machine P&L, the owner
 * portal and every sale's snapshot read this — nothing assembles the same
 * answer from raw fields elsewhere.
 */
class MachineEconomicProfileService {
  async resolve(businessId: string, machineId: string): Promise<MachineEconomicProfile> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);
    return this.resolveFor(businessId, machineId, machine);
  }

  /** The profile of a machine already read, so a caller holding it doesn't read it twice. */
  async resolveFor(businessId: string, machineId: string, machine: Pick<Machine, 'ownershipType' | 'ownerPartnerId' | 'locationId'>): Promise<MachineEconomicProfile> {
    const ownershipType = ownershipTypeOf(machine);
    const [agreement, location] = await Promise.all([
      ownershipType === 'snack_quest' ? Promise.resolve(null) : partnerMachineAgreementRepository.findActiveForMachine(businessId, machineId),
      machine.locationId ? locationRepository.findById(businessId, machine.locationId) : Promise.resolve(null),
    ]);
    return this.compose(machineId, machine, ownershipType, agreement, location?.expenses?.locationCommissionPct ?? null);
  }

  compose(
    machineId: string,
    machine: Pick<Machine, 'ownerPartnerId' | 'locationId'>,
    ownershipType: MachineOwnershipType,
    agreement: { id: string; data: PartnerMachineAgreement } | null,
    locationCommissionPct: number | null,
  ): MachineEconomicProfile {
    if (ownershipType === 'snack_quest') {
      // Snack Quest's own machine: its stock is Snack Quest's, there is nobody to settle with, and no owner terms apply.
      return {
        machineId,
        ownershipType,
        partnerId: null,
        agreementId: null,
        terms: { ...DEFAULT_COMMERCIAL_TERMS, inventoryOwner: 'snack_quest', adRevenueSharePartnerPct: 0 },
        settlesWithOwner: false,
        locationId: machine.locationId,
        locationCommissionPct,
        termsAreDefault: false,
      };
    }
    return {
      machineId,
      ownershipType,
      partnerId: machine.ownerPartnerId,
      agreementId: agreement?.id ?? null,
      terms: resolveTerms(agreement?.data.terms),
      settlesWithOwner: machine.ownerPartnerId !== null,
      locationId: machine.locationId,
      locationCommissionPct,
      termsAreDefault: !agreement?.data.terms || Object.keys(agreement.data.terms).length === 0,
    };
  }

  /**
   * Sets who owns a machine. A Snack Quest machine has no owner; an owner
   * machine keeps its owner (reassigning an owner is its own workflow,
   * `machineService.reassignOwner`, with history and checks).
   */
  async setOwnershipType(businessId: string, machineId: string, ownershipType: MachineOwnershipType, actor: string): Promise<{ before: MachineOwnershipType; after: MachineOwnershipType }> {
    if (!(MACHINE_OWNERSHIP_TYPES as readonly string[]).includes(ownershipType)) {
      throw new EconomicProfileValidationError(`"ownershipType" must be one of: ${MACHINE_OWNERSHIP_TYPES.join(', ')}.`);
    }
    return adminFirestore.runTransaction(async (tx) => {
      const ref = adminFirestore.collection('machines').doc(machineId);
      const snapshot = await tx.get(ref);
      const machine = snapshot.data() as Machine | undefined;
      if (!machine || machine.businessId !== businessId) throw new MachineNotFoundError(machineId);
      const before = ownershipTypeOf(machine);
      if (ownershipType === 'snack_quest' && machine.ownerPartnerId) {
        throw new EconomicProfileValidationError('This machine still has an owner. Take it back from the owner first, then mark it as Snack Quest’s.');
      }
      if (ownershipType !== 'snack_quest' && !machine.ownerPartnerId) {
        throw new EconomicProfileValidationError('Assign the owner first; the ownership type describes who they are.');
      }
      tx.update(ref, { ownershipType, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
      return { before, after: ownershipType };
    });
  }
}

export const machineEconomicProfileService = new MachineEconomicProfileService();
