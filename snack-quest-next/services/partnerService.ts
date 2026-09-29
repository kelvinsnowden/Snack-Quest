import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import type { Partner, PartnerMachineAgreement, PartnerStatus } from '@/types';

/** A request an owner record can't accept — bad input or a rule it would break. The message is written for the person who made it. */
export class PartnerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerValidationError';
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(
  value: string | null | undefined,
  max: number,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length > max)
    throw new PartnerValidationError(
      `${label} is too long (${max} characters at most).`,
    );
  return trimmed || null;
}

/**
 * Partner records and machine-ownership scoping
 * (§ multi-machine partner architecture, § RBAC). No login/session
 * flow lives here — see `docs/VENDING_FOUNDATION.md`'s RBAC section
 * for exactly what this pass does and does not build. What this
 * provides is the data a real partner session will read from once one
 * exists: one partner, many machines, one account.
 */
class PartnerService {
  /**
   * The contact email is also how the owner claims their portal login —
   * whoever signs up with it gets this owner's machines and money. So it
   * must be a real address and no other owner in the business may hold
   * it, otherwise a sign-up could claim the wrong record.
   */
  private async checkContactEmail(
    businessId: string,
    contactEmail: string | null,
    exceptPartnerId: string | null,
  ): Promise<string | null> {
    if (!contactEmail) return null;
    const normalized = contactEmail.trim().toLowerCase();
    if (!EMAIL.test(normalized) || normalized.length > 200)
      throw new PartnerValidationError(
        'That email address doesn’t look right.',
      );
    const other = await partnerRepository.findOtherByContactEmail(
      businessId,
      normalized,
      exceptPartnerId,
    );
    if (other)
      throw new PartnerValidationError(
        `Another owner (${other.data.name}) already uses that email.`,
      );
    return normalized;
  }

  async create(input: {
    businessId: string;
    name: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    note?: string | null;
    actor: string;
  }): Promise<string> {
    const name = cleanText(input.name, 120, 'Name');
    if (!name) throw new PartnerValidationError('Name is required.');
    const contactEmail = await this.checkContactEmail(
      input.businessId,
      cleanText(input.contactEmail, 200, 'Email'),
      null,
    );
    return partnerRepository.create({
      businessId: input.businessId,
      name,
      contactEmail,
      contactPhone: cleanText(input.contactPhone, 40, 'Phone'),
      status: 'active',
      note: cleanText(input.note, 1000, 'Note'),
      authUid: null,
      availableCashKes: 0,
      lifetimeEarnedKes: 0,
      createdBy: input.actor,
    });
  }

  async findById(
    businessId: string,
    partnerId: string,
  ): Promise<Partner | null> {
    return partnerRepository.findById(businessId, partnerId);
  }

  /**
   * Edits an owner's details. Once the owner has claimed their login the
   * email is only a contact address — their sign-in stays with the
   * account that claimed it. Suspending stops their portal access on
   * their next request (`partnerAuthService` re-checks status every
   * time); it doesn't touch their machines or money.
   */
  async update(
    businessId: string,
    partnerId: string,
    changes: {
      name?: string;
      contactEmail?: string | null;
      contactPhone?: string | null;
      note?: string | null;
      status?: PartnerStatus;
    },
    actor: string,
  ): Promise<{ before: Partner; after: Partner }> {
    const before = await partnerRepository.findById(businessId, partnerId);
    if (!before || before.deletedAt)
      throw new PartnerValidationError('Owner not found.');
    const next: Partial<
      Pick<
        Partner,
        'name' | 'contactEmail' | 'contactPhone' | 'note' | 'status'
      >
    > = {};
    if (changes.name !== undefined) {
      const name = cleanText(changes.name, 120, 'Name');
      if (!name) throw new PartnerValidationError('Name is required.');
      next.name = name;
    }
    if (changes.contactEmail !== undefined)
      next.contactEmail = await this.checkContactEmail(
        businessId,
        cleanText(changes.contactEmail, 200, 'Email'),
        partnerId,
      );
    if (changes.contactPhone !== undefined)
      next.contactPhone = cleanText(changes.contactPhone, 40, 'Phone');
    if (changes.note !== undefined)
      next.note = cleanText(changes.note, 1000, 'Note');
    if (changes.status !== undefined) {
      if (changes.status !== 'active' && changes.status !== 'suspended')
        throw new PartnerValidationError('Status must be active or suspended.');
      next.status = changes.status;
    }
    if (Object.keys(next).length === 0)
      throw new PartnerValidationError('Nothing to change.');
    await partnerRepository.update(partnerId, next, actor);
    return { before, after: { ...before, ...next } };
  }

  async listAgreements(businessId: string, partnerId: string) {
    return partnerMachineAgreementRepository.listByPartner(
      businessId,
      partnerId,
    );
  }

  /**
   * Records an agreement between an owner and one of their machines. The
   * terms stay whatever staff type — nothing is filled in by default: a
   * blank revenue share stays blank (settlements then show no split),
   * never a made-up percentage.
   */
  async createAgreement(input: {
    businessId: string;
    partnerId: string;
    machineId: string;
    status: 'draft' | 'active';
    revenueSharePartnerPct: number | null;
    operatingCostNote: string | null;
    effectiveFrom: Date | null;
    documentRef: string | null;
    note: string | null;
    actor: string;
  }): Promise<string> {
    const partner = await partnerRepository.findById(
      input.businessId,
      input.partnerId,
    );
    if (!partner || partner.deletedAt)
      throw new PartnerValidationError('Owner not found.');
    const machine = await machineRepository.findById(
      input.businessId,
      input.machineId,
    );
    if (!machine) throw new PartnerValidationError('Machine not found.');
    if (machine.ownerPartnerId !== input.partnerId)
      throw new PartnerValidationError(
        `${machine.machineCode} doesn’t belong to ${partner.name}. Give them the machine first.`,
      );
    if (input.status === 'active' && partner.status !== 'active')
      throw new PartnerValidationError(
        'That owner is suspended; an agreement can only start as a draft.',
      );
    const pct = input.revenueSharePartnerPct;
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100))
      throw new PartnerValidationError(
        'Owner’s share must be between 0 and 100 percent.',
      );
    return partnerMachineAgreementRepository.createChecked({
      businessId: input.businessId,
      partnerId: input.partnerId,
      machineId: input.machineId,
      status: input.status,
      revenueSharePartnerPct: pct,
      operatingCostNote: cleanText(
        input.operatingCostNote,
        1000,
        'Operating cost note',
      ),
      effectiveFrom: (input.effectiveFrom
        ? Timestamp.fromDate(input.effectiveFrom)
        : input.status === 'active'
          ? Timestamp.now()
          : null) as unknown as PartnerMachineAgreement['effectiveFrom'],
      effectiveTo: null,
      documentRef: cleanText(input.documentRef, 500, 'Document reference'),
      note: cleanText(input.note, 1000, 'Note'),
      createdBy: input.actor,
    });
  }

  /** Starts a draft agreement or ends one. Only an agreement on a machine the owner still holds can start. */
  async transitionAgreement(
    businessId: string,
    partnerId: string,
    agreementId: string,
    to: 'active' | 'terminated',
    actor: string,
  ): Promise<PartnerMachineAgreement> {
    const agreement = await partnerMachineAgreementRepository.findById(
      businessId,
      agreementId,
    );
    if (!agreement || agreement.partnerId !== partnerId)
      throw new PartnerValidationError('Agreement not found.');
    if (to === 'active') {
      const machine = await machineRepository.findById(
        businessId,
        agreement.machineId,
      );
      if (!machine || machine.ownerPartnerId !== partnerId)
        throw new PartnerValidationError(
          'This owner no longer has that machine, so the agreement can’t start.',
        );
    }
    return partnerMachineAgreementRepository.transition(
      businessId,
      agreementId,
      to,
      actor,
    );
  }

  async listByBusiness(businessId: string) {
    return partnerRepository.listByBusiness(businessId);
  }

  /**
   * A partner's whole fleet, in one call — the "27 machines, one
   * read" requirement (§ RBAC, docs/ANALYTICS_ROLLUPS.md's own framing
   * of this exact problem for traffic rollups). Every machine here is
   * already scoped to this partner by `machineRepository.listByPartner`'s
   * own query, not filtered client-side after a wider read.
   */
  async listMachines(businessId: string, partnerId: string) {
    return machineRepository.listByPartner(businessId, partnerId);
  }
}

export const partnerService = new PartnerService();
