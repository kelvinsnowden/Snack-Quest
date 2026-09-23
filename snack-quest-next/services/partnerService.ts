import 'server-only';

import { partnerRepository } from '@/repositories/partnerRepository';
import { machineRepository } from '@/repositories/machineRepository';
import type { Partner } from '@/types';

/**
 * Partner records and machine-ownership scoping
 * (§ multi-machine partner architecture, § RBAC). No login/session
 * flow lives here — see `docs/VENDING_FOUNDATION.md`'s RBAC section
 * for exactly what this pass does and does not build. What this
 * provides is the data a real partner session will read from once one
 * exists: one partner, many machines, one account.
 */
class PartnerService {
  async create(input: { businessId: string; name: string; contactEmail?: string | null; contactPhone?: string | null; actor: string }): Promise<string> {
    return partnerRepository.create({
      businessId: input.businessId,
      name: input.name,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      status: 'active',
      note: null,
      createdBy: input.actor,
    });
  }

  async findById(businessId: string, partnerId: string): Promise<Partner | null> {
    return partnerRepository.findById(businessId, partnerId);
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
