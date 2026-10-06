import 'server-only';

import { kioskExperienceService, KioskPublishBlockedError } from '@/services/kioskExperienceService';
import { kioskOwnerProposalRepository } from '@/repositories/kioskOwnerProposalRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { checkKioskExperience, KioskConfigValidationError, mergeKioskExperience, parseKioskPatch } from '@/lib/kiosk/experienceConfig';
import { OWNER_EDITABLE_KIOSK_KEYS, type KioskExperiencePatch, type KioskOwnerProposal } from '@/types';

export class OwnerDesignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnerDesignError';
  }
}

/** Only the owner-editable keys of a patch. */
export function ownerEditablePart(patch: KioskExperiencePatch): KioskExperiencePatch {
  const part: KioskExperiencePatch = {};
  for (const key of OWNER_EDITABLE_KIOSK_KEYS) {
    if (patch[key] !== undefined) (part as Record<string, unknown>)[key] = patch[key];
  }
  return part;
}

/**
 * Owners proposing a screen design for their own machines (§ OWNER SCREEN
 * DESIGN). An owner edits the owner-editable parts of their layer —
 * colours, wording and translations, languages, badges, product cards,
 * menu sections — and submits; it reaches machines only when Snack Quest
 * staff with `kiosk.publish` accept it. Idle and advertising settings are
 * never the owner's. Every proposal is checked like a publish (contrast,
 * the snack grid), so an owner can't submit an unreadable screen.
 */
class KioskOwnerDesignService {
  /** The owner layer's live config with `proposal` in place of its owner-editable parts. */
  private async combined(businessId: string, partnerId: string, proposal: KioskExperiencePatch): Promise<KioskExperiencePatch> {
    const live = await kioskExperienceService.livePatch(businessId, 'owner', partnerId);
    const combined: KioskExperiencePatch = { ...live };
    for (const key of OWNER_EDITABLE_KIOSK_KEYS) delete combined[key];
    return { ...combined, ...ownerEditablePart(proposal) };
  }

  /** What the owner's editor needs. */
  async ownerState(businessId: string, partnerId: string) {
    const [inherited, live, proposal, machines] = await Promise.all([
      kioskExperienceService.inheritedConfig(businessId, 'owner', partnerId),
      kioskExperienceService.livePatch(businessId, 'owner', partnerId),
      kioskOwnerProposalRepository.get(businessId, partnerId),
      machineRepository.listByPartner(businessId, partnerId),
    ]);
    // What the owner's editable parts inherit: the fleet design, plus whatever staff set on the owner layer that the owner can't change.
    const staffOnly: KioskExperiencePatch = { ...live };
    for (const key of OWNER_EDITABLE_KIOSK_KEYS) delete staffOnly[key];
    const base = mergeKioskExperience(inherited, staffOnly);
    const editing = proposal && proposal.status !== 'accepted' ? proposal.patch : ownerEditablePart(live);
    return { base, live: ownerEditablePart(live), proposal, editing, machines: machines
        .filter(({ data }) => data.status !== 'decommissioned')
        .map(({ id, data }) => ({ id, code: data.machineCode, widthPx: data.display?.widthPx ?? 1080, heightPx: data.display?.heightPx ?? 1920, profileSet: Boolean(data.display) }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }

  /**
   * Saves the owner's proposal; `submit` also sends it for review, which
   * needs a design that would pass the publish checks. Anything outside
   * the owner-editable parts is refused rather than dropped, so an owner
   * is never told something saved that didn't.
   */
  async saveProposal(businessId: string, partnerId: string, actor: string, input: unknown, submit: boolean) {
    if (!(await partnerRepository.findById(businessId, partnerId))) throw new OwnerDesignError('Owner not found.');
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const foreign = Object.keys(input).filter((key) => !(OWNER_EDITABLE_KIOSK_KEYS as readonly string[]).includes(key));
      if (foreign.length > 0) throw new OwnerDesignError(`These settings are Snack Quest’s to change: ${foreign.join(', ')}.`);
    }
    const patch = parseKioskPatch(input);
    const inherited = await kioskExperienceService.inheritedConfig(businessId, 'owner', partnerId);
    const check = checkKioskExperience(mergeKioskExperience(inherited, await this.combined(businessId, partnerId, patch)));
    if (submit && check.errors.length > 0) throw new KioskPublishBlockedError(check);
    await kioskOwnerProposalRepository.save(businessId, partnerId, patch, submit, actor);
    return { patch, check };
  }

  listSubmitted(businessId: string): Promise<KioskOwnerProposal[]> {
    return kioskOwnerProposalRepository.listSubmitted(businessId);
  }

  async findProposal(businessId: string, partnerId: string): Promise<KioskOwnerProposal | null> {
    return kioskOwnerProposalRepository.get(businessId, partnerId);
  }

  /**
   * Staff accept a submitted proposal: it is claimed first (so a second
   * reviewer, or an owner edit since it was read, is refused), then
   * published on the owner layer over its live config. If publishing fails
   * the proposal goes back to waiting for review.
   */
  async accept(businessId: string, partnerId: string, actor: string, note: string, seenUpdatedAtMillis?: number) {
    const proposal = await kioskOwnerProposalRepository.get(businessId, partnerId);
    if (!proposal || proposal.status !== 'submitted') throw new OwnerDesignError('That proposal is no longer waiting for review.');
    const cleanNote = note.trim().slice(0, 160);
    if (!cleanNote) throw new OwnerDesignError('Say what this version changes — it goes in the version history.');
    await kioskOwnerProposalRepository.review(businessId, partnerId, { status: 'accepted', actor, note: cleanNote }, seenUpdatedAtMillis).catch((error: Error) => {
      throw new OwnerDesignError(error.message);
    });
    try {
      const config = await this.combined(businessId, partnerId, proposal.patch);
      const published = await kioskExperienceService.publishPatch(businessId, 'owner', partnerId, config, `Owner’s proposal: ${cleanNote}`, actor, OWNER_EDITABLE_KIOSK_KEYS);
      await kioskOwnerProposalRepository.setPublishedVersion(businessId, partnerId, published.versionNumber);
      return published;
    } catch (error) {
      await kioskOwnerProposalRepository.reopen(businessId, partnerId);
      throw error;
    }
  }

  async decline(businessId: string, partnerId: string, actor: string, note: string, seenUpdatedAtMillis?: number): Promise<void> {
    const reason = note.trim().slice(0, 500);
    if (reason.length < 3) throw new OwnerDesignError('Tell the owner why, so they can change it.');
    await kioskOwnerProposalRepository.review(businessId, partnerId, { status: 'declined', actor, note: reason }, seenUpdatedAtMillis).catch((error: Error) => {
      throw new OwnerDesignError(error.message);
    });
  }

  /** The screen `machineId` would show with the owner's current proposal in place. The machine must be that owner's. */
  async previewProposal(businessId: string, partnerId: string, machineId: string) {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine || machine.ownerPartnerId !== partnerId) throw new OwnerDesignError('not found');
    const proposal = await kioskOwnerProposalRepository.get(businessId, partnerId);
    const patch = await this.combined(businessId, partnerId, proposal && proposal.status !== 'accepted' ? proposal.patch : ownerEditablePart(await kioskExperienceService.livePatch(businessId, 'owner', partnerId)));
    return { machine, resolved: await kioskExperienceService.previewForMachineWith(businessId, machineId, { scope: 'owner', scopeId: partnerId, patch }) };
  }
}

export const kioskOwnerDesignService = new KioskOwnerDesignService();
export { KioskConfigValidationError, KioskPublishBlockedError };
