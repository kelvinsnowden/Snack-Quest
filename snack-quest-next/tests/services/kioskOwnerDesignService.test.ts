import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { kioskExperienceService, resetKioskExperienceCache } from '@/services/kioskExperienceService';
import { kioskOwnerDesignService, KioskConfigValidationError, KioskPublishBlockedError, OwnerDesignError } from '@/services/kioskOwnerDesignService';

/**
 * Owners proposing their own machines' screen design (§ OWNER SCREEN
 * DESIGN) on the emulator: only the owner-editable parts, checked like a
 * publish, live only after staff accept, and never another owner's machine.
 */

const BUSINESS_ID = 'biz-kiosk-owner-design';
const COLLECTIONS = ['machines', 'partners', 'kioskLayers', 'kioskLayerVersions', 'kioskOwnerProposals', 'machineOwnershipHistory', 'deviceCredentials'];

beforeEach(async () => {
  for (const collection of COLLECTIONS) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  await adminFirestore.collection('kioskPublishedIndex').doc(BUSINESS_ID).delete();
  resetKioskExperienceCache();
});

async function owner(name = 'Owner') {
  return partnerService.create({ businessId: BUSINESS_ID, name, actor: 'staff-1' });
}

async function machine(ownerPartnerId: string) {
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-OD-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId, actor: 'staff-1' });
  return machineId;
}

const live = async (machineId: string) => (await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).config;

describe('what an owner can propose', () => {
  it('refuses idle and advertising settings outright rather than dropping them', async () => {
    const partnerId = await owner();
    await expect(kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { idle: { adsEnabled: false } }, false)).rejects.toBeInstanceOf(OwnerDesignError);
    await expect(kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { theme: { colors: { primary: '#0055aa' } }, idle: { timeoutSeconds: 300 } }, false)).rejects.toThrow(/idle/);
    expect(await kioskOwnerDesignService.findProposal(BUSINESS_ID, partnerId)).toBeNull();
  });

  it('refuses malformed settings', async () => {
    const partnerId = await owner();
    await expect(kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { theme: { colors: { primary: 'url(x)' } } }, false)).rejects.toBeInstanceOf(KioskConfigValidationError);
  });

  it('can save an unreadable design as a draft but not send it', async () => {
    const partnerId = await owner();
    const unreadable = { theme: { colors: { background: '#ffffff', surface: '#ffffff', foreground: '#fefefe', mutedForeground: '#fdfdfd' } } };
    const { check } = await kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', unreadable, false);
    expect(check.errors.length).toBeGreaterThan(0);
    await expect(kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', unreadable, true)).rejects.toBeInstanceOf(KioskPublishBlockedError);
    expect((await kioskOwnerDesignService.findProposal(BUSINESS_ID, partnerId))?.status).toBe('draft');
  });

  it('an unknown owner is refused', async () => {
    await expect(kioskOwnerDesignService.saveProposal(BUSINESS_ID, 'nobody', 'u-owner', {}, false)).rejects.toBeInstanceOf(OwnerDesignError);
  });
});

describe('review', () => {
  it('nothing changes on the owner’s machines until staff accept; then it is live there and nowhere else', async () => {
    const partnerId = await owner('A');
    const otherOwner = await owner('B');
    const mine = await machine(partnerId);
    const theirs = await machine(otherOwner);
    await kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { copy: { bannerHeadline: 'Owner A’s snacks' } }, true);
    expect((await live(mine)).copy.bannerHeadline).not.toBe('Owner A’s snacks');
    expect((await kioskOwnerDesignService.listSubmitted(BUSINESS_ID)).map((proposal) => proposal.partnerId)).toEqual([partnerId]);

    const published = await kioskOwnerDesignService.accept(BUSINESS_ID, partnerId, 'staff-reviewer', 'Owner A banner');
    expect(published.versionNumber).toBe(1);
    resetKioskExperienceCache();
    expect((await live(mine)).copy.bannerHeadline).toBe('Owner A’s snacks');
    expect((await live(theirs)).copy.bannerHeadline).not.toBe('Owner A’s snacks');
    const proposal = await kioskOwnerDesignService.findProposal(BUSINESS_ID, partnerId);
    expect(proposal?.status).toBe('accepted');
    expect(proposal?.publishedVersionNumber).toBe(1);
    expect(await kioskOwnerDesignService.listSubmitted(BUSINESS_ID)).toEqual([]);
  });

  it('accepting keeps the idle and advertising settings staff set on that owner', async () => {
    const partnerId = await owner();
    const machineId = await machine(partnerId);
    await kioskExperienceService.saveDraft(BUSINESS_ID, 'owner', partnerId, { idle: { adsEnabled: false, timeoutSeconds: 75 }, copy: { bannerHeadline: 'Staff wording' } }, 'designer');
    await kioskExperienceService.publish(BUSINESS_ID, 'owner', partnerId, 'staff settings', 'publisher');

    await kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { theme: { colors: { primary: '#0055aa' } } }, true);
    await kioskOwnerDesignService.accept(BUSINESS_ID, partnerId, 'staff-reviewer', 'blue buttons');
    resetKioskExperienceCache();
    const config = await live(machineId);
    expect(config.theme.colors.primary).toBe('#0055aa');
    expect(config.idle.adsEnabled).toBe(false);
    expect(config.idle.timeoutSeconds).toBe(75);
    // The owner's proposal replaces the owner-editable parts, so staff's wording on that layer gives way to it.
    expect(config.copy.bannerHeadline).not.toBe('Staff wording');
  });

  it('a declined proposal stays off machines and carries the reason back to the owner', async () => {
    const partnerId = await owner();
    const machineId = await machine(partnerId);
    await kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { copy: { bannerHeadline: 'Cheapest snacks in town!!!' } }, true);
    await expect(kioskOwnerDesignService.decline(BUSINESS_ID, partnerId, 'staff-reviewer', ' ')).rejects.toBeInstanceOf(OwnerDesignError);
    await kioskOwnerDesignService.decline(BUSINESS_ID, partnerId, 'staff-reviewer', 'We can’t promise prices in the banner.');
    expect((await live(machineId)).copy.bannerHeadline).not.toBe('Cheapest snacks in town!!!');
    const state = await kioskOwnerDesignService.ownerState(BUSINESS_ID, partnerId);
    expect(state.proposal?.status).toBe('declined');
    expect(state.proposal?.reviewNote).toBe('We can’t promise prices in the banner.');
    expect(state.editing).toEqual({ copy: { bannerHeadline: 'Cheapest snacks in town!!!' } });
  });

  it('a proposal can be reviewed once, and not at all after the owner changed it', async () => {
    const partnerId = await owner();
    await kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { copy: { bannerHeadline: 'One' } }, true);
    const seen = (await kioskOwnerDesignService.findProposal(BUSINESS_ID, partnerId))!.updatedAt.toMillis();
    await kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { copy: { bannerHeadline: 'Two' } }, true);
    await expect(kioskOwnerDesignService.accept(BUSINESS_ID, partnerId, 'staff-reviewer', 'ok', seen)).rejects.toThrow(/changed/);
    await kioskOwnerDesignService.accept(BUSINESS_ID, partnerId, 'staff-reviewer', 'ok');
    await expect(kioskOwnerDesignService.accept(BUSINESS_ID, partnerId, 'staff-reviewer', 'again')).rejects.toBeInstanceOf(OwnerDesignError);
    await expect(kioskOwnerDesignService.decline(BUSINESS_ID, partnerId, 'staff-reviewer', 'too late')).rejects.toBeInstanceOf(OwnerDesignError);
  });

  it('a draft that was never sent can’t be accepted', async () => {
    const partnerId = await owner();
    await kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { copy: { bannerHeadline: 'Not sent' } }, false);
    await expect(kioskOwnerDesignService.accept(BUSINESS_ID, partnerId, 'staff-reviewer', 'ok')).rejects.toBeInstanceOf(OwnerDesignError);
  });
});

describe('preview', () => {
  it('draws the owner’s saved proposal on their own machine', async () => {
    const partnerId = await owner();
    const machineId = await machine(partnerId);
    await kioskOwnerDesignService.saveProposal(BUSINESS_ID, partnerId, 'u-owner', { copy: { bannerHeadline: 'Preview me' } }, false);
    const { resolved } = await kioskOwnerDesignService.previewProposal(BUSINESS_ID, partnerId, machineId);
    expect(resolved.config.copy.bannerHeadline).toBe('Preview me');
  });

  it('refuses another owner’s machine, the same as a machine that doesn’t exist', async () => {
    const partnerId = await owner('A');
    const otherOwner = await owner('B');
    const theirs = await machine(otherOwner);
    await expect(kioskOwnerDesignService.previewProposal(BUSINESS_ID, partnerId, theirs)).rejects.toThrow('not found');
    await expect(kioskOwnerDesignService.previewProposal(BUSINESS_ID, partnerId, 'no-such-machine')).rejects.toThrow('not found');
  });

  it('the owner’s machine list holds only their machines', async () => {
    const partnerId = await owner('A');
    const otherOwner = await owner('B');
    const mine = await machine(partnerId);
    await machine(otherOwner);
    expect((await kioskOwnerDesignService.ownerState(BUSINESS_ID, partnerId)).machines.map((entry) => entry.id)).toEqual([mine]);
  });
});
