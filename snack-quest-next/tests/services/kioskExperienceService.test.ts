import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { kioskExperienceService, KioskPublishBlockedError, KioskScopeError, resetKioskExperienceCache } from '@/services/kioskExperienceService';
import { KioskConfigValidationError, DEFAULT_KIOSK_EXPERIENCE } from '@/lib/kiosk/experienceConfig';

/**
 * Screen design layers end to end on the emulator (§ KIOSK EXPERIENCE
 * BUILDER): draft → publish → rollback, four-level inheritance, previews,
 * and a customer screen that never resolves to something unreadable.
 */

const BUSINESS_ID = 'biz-kiosk-experience';
const OTHER_BUSINESS = 'biz-kiosk-experience-other';
const COLLECTIONS = ['machines', 'partners', 'locations', 'kioskLayers', 'kioskLayerVersions', 'machineOwnershipHistory', 'deviceCredentials'];

beforeEach(async () => {
  for (const businessId of [BUSINESS_ID, OTHER_BUSINESS]) {
    for (const collection of COLLECTIONS) {
      const snapshot = await adminFirestore.collection(collection).where('businessId', '==', businessId).get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }
    await adminFirestore.collection('kioskPublishedIndex').doc(businessId).delete();
  }
  resetKioskExperienceCache();
});

async function machine(businessId = BUSINESS_ID, ownerPartnerId: string | null = null) {
  const { machineId } = await machineService.provisionDevice({ businessId, machineCode: `SQ-K-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId, actor: 'staff-1' });
  return machineId;
}

async function publish(scope: 'global' | 'owner' | 'location' | 'machine', scopeId: string, draft: unknown, businessId = BUSINESS_ID) {
  await kioskExperienceService.saveDraft(businessId, scope, scopeId, draft, 'designer');
  return kioskExperienceService.publish(businessId, scope, scopeId, 'test', 'publisher');
}

describe('with nothing published', () => {
  it('a machine shows exactly today’s screen', async () => {
    const machineId = await machine();
    const resolved = await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId);
    expect(resolved.config).toEqual(DEFAULT_KIOSK_EXPERIENCE);
    expect(resolved.sources).toEqual([]);
  });
});

describe('draft, publish, rollback', () => {
  it('a saved draft changes nothing on machines until it is published', async () => {
    const machineId = await machine();
    await kioskExperienceService.saveDraft(BUSINESS_ID, 'global', 'all', { theme: { colors: { primary: '#0055aa' } } }, 'designer');
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).config.theme.colors.primary).toBe('#ff7a00');
    await kioskExperienceService.publish(BUSINESS_ID, 'global', 'all', 'blue buttons', 'publisher');
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).config.theme.colors.primary).toBe('#0055aa');
  });

  it('publishing needs a note, and versions count up', async () => {
    await kioskExperienceService.saveDraft(BUSINESS_ID, 'global', 'all', { idle: { timeoutSeconds: 45 } }, 'designer');
    await expect(kioskExperienceService.publish(BUSINESS_ID, 'global', 'all', '  ', 'publisher')).rejects.toBeInstanceOf(KioskScopeError);
    expect((await kioskExperienceService.publish(BUSINESS_ID, 'global', 'all', 'shorter idle', 'publisher')).versionNumber).toBe(1);
    expect((await kioskExperienceService.publish(BUSINESS_ID, 'global', 'all', 'again', 'publisher')).versionNumber).toBe(2);
  });

  it('rollback publishes the old config as a new version; history keeps every version', async () => {
    const machineId = await machine();
    await publish('global', 'all', { copy: { bannerHeadline: 'First' } });
    await publish('global', 'all', { copy: { bannerHeadline: 'Second' } });
    const rolled = await kioskExperienceService.rollback(BUSINESS_ID, 'global', 'all', 1, 'publisher');
    expect(rolled.versionNumber).toBe(3);
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).config.copy.bannerHeadline).toBe('First');
    const state = await kioskExperienceService.editorState(BUSINESS_ID, 'global', 'all');
    expect(state.versions.map(({ data }) => [data.versionNumber, data.rolledBackFrom])).toEqual([
      [3, 1],
      [2, null],
      [1, null],
    ]);
    expect(state.draft).toEqual({ copy: { bannerHeadline: 'First' } });
  });

  it('a published version can never be overwritten', async () => {
    await publish('global', 'all', { idle: { timeoutSeconds: 30 } });
    const ref = adminFirestore.collection('kioskLayerVersions').doc(`${BUSINESS_ID}_global_all_v1`);
    const before = (await ref.get()).data();
    await publish('global', 'all', { idle: { timeoutSeconds: 40 } });
    expect((await ref.get()).data()).toEqual(before);
  });

  it('a draft that would leave customers unable to buy is saved but can’t be published', async () => {
    await kioskExperienceService.saveDraft(BUSINESS_ID, 'global', 'all', { browseSections: [{ id: 'b', type: 'menu_banner', visible: true, props: {} }] }, 'designer');
    await expect(kioskExperienceService.publish(BUSINESS_ID, 'global', 'all', 'no grid', 'publisher')).rejects.toBeInstanceOf(KioskPublishBlockedError);
  });

  it('malformed settings are refused at save', async () => {
    await expect(kioskExperienceService.saveDraft(BUSINESS_ID, 'global', 'all', { theme: { colors: { primary: 'url(x)' } } }, 'designer')).rejects.toBeInstanceOf(KioskConfigValidationError);
  });

  it('withdrawing a layer returns its machines to the layer above', async () => {
    const machineId = await machine();
    await publish('global', 'all', { copy: { bannerHeadline: 'Fleet' } });
    await publish('machine', machineId, { copy: { bannerHeadline: 'Just me' } });
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).config.copy.bannerHeadline).toBe('Just me');
    await kioskExperienceService.withdraw(BUSINESS_ID, 'machine', machineId);
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).config.copy.bannerHeadline).toBe('Fleet');
  });
});

describe('inheritance', () => {
  it('global ← owner ← location ← machine, most specific wins', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const machineId = await machine(BUSINESS_ID, partnerId);
    const location = await adminFirestore.collection('locations').add({ businessId: BUSINESS_ID, name: 'Mall' });
    await adminFirestore.collection('machines').doc(machineId).update({ locationId: location.id });
    await publish('global', 'all', { copy: { bannerHeadline: 'Global', bannerEyebrow: 'Global eyebrow', attractHeadline: 'Global attract' }, idle: { timeoutSeconds: 120 } });
    await publish('owner', partnerId, { copy: { bannerHeadline: 'Owner', bannerEyebrow: 'Owner eyebrow' } });
    await publish('location', location.id, { copy: { bannerHeadline: 'Location' } });
    const resolved = await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId);
    expect(resolved.config.copy).toMatchObject({ bannerHeadline: 'Location', bannerEyebrow: 'Owner eyebrow', attractHeadline: 'Global attract' });
    expect(resolved.config.idle.timeoutSeconds).toBe(120);
    expect(resolved.sources.map((source) => source.scope)).toEqual(['global', 'owner', 'location']);
    await publish('machine', machineId, { copy: { bannerHeadline: 'Machine' } });
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).config.copy.bannerHeadline).toBe('Machine');
  });

  it('another machine of the same owner gets the owner layer, not the first machine’s', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const first = await machine(BUSINESS_ID, partnerId);
    const second = await machine(BUSINESS_ID, partnerId);
    const unowned = await machine();
    await publish('owner', partnerId, { copy: { bannerHeadline: 'Owner' } });
    await publish('machine', first, { copy: { bannerHeadline: 'First only' } });
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, second)).config.copy.bannerHeadline).toBe('Owner');
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, unowned)).config.copy.bannerHeadline).toBe(DEFAULT_KIOSK_EXPERIENCE.copy.bannerHeadline);
  });

  it('the version changes when any contributing layer is republished, and not otherwise', async () => {
    const machineId = await machine();
    const before = (await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).version;
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).version).toBe(before);
    await publish('global', 'all', { idle: { timeoutSeconds: 30 } });
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).version).not.toBe(before);
  });

  it('a lower layer that became unreadable after a higher layer changed is skipped, not shown', async () => {
    const machineId = await machine();
    // The machine's text colour was fine on the default background…
    await publish('machine', machineId, { theme: { colors: { foreground: '#333333' } } });
    // …until the fleet went dark. Applying the machine layer now would put dark grey text on near-black.
    await publish('global', 'all', { theme: { colors: { background: '#111111', surface: '#1a1a1a', foreground: '#f5f5f5', stage: '#000000', stageForeground: '#ffffff' } } });
    const resolved = await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId);
    expect(resolved.config.theme.colors.foreground).toBe('#f5f5f5');
    expect(resolved.skipped).toHaveLength(1);
    expect(resolved.skipped[0]).toMatchObject({ scope: 'machine', scopeId: machineId });
  });

  it('a preview shows the draft in place of the live layer without publishing it', async () => {
    const machineId = await machine();
    await publish('global', 'all', { copy: { bannerHeadline: 'Live' } });
    await kioskExperienceService.saveDraft(BUSINESS_ID, 'global', 'all', { copy: { bannerHeadline: 'Draft' } }, 'designer');
    expect((await kioskExperienceService.previewForMachine(BUSINESS_ID, machineId, { scope: 'global', scopeId: 'all' })).config.copy.bannerHeadline).toBe('Draft');
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).config.copy.bannerHeadline).toBe('Live');
  });
});

describe('tenancy and scope', () => {
  it('another business’s layers never reach this business’s machines', async () => {
    const machineId = await machine();
    await publish('global', 'all', { copy: { bannerHeadline: 'Other tenant' } }, OTHER_BUSINESS);
    expect((await kioskExperienceService.resolveForMachine(BUSINESS_ID, machineId)).config.copy.bannerHeadline).toBe(DEFAULT_KIOSK_EXPERIENCE.copy.bannerHeadline);
  });

  it('a layer for another business’s machine or a missing owner is refused', async () => {
    const theirs = await machine(OTHER_BUSINESS);
    await expect(kioskExperienceService.saveDraft(BUSINESS_ID, 'machine', theirs, {}, 'designer')).rejects.toBeInstanceOf(KioskScopeError);
    await expect(kioskExperienceService.saveDraft(BUSINESS_ID, 'owner', 'nobody', {}, 'designer')).rejects.toBeInstanceOf(KioskScopeError);
    await expect(kioskExperienceService.saveDraft(BUSINESS_ID, 'global', 'x', {}, 'designer')).rejects.toBeInstanceOf(KioskScopeError);
  });

  it('a preview refuses a layer the machine doesn’t use', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const unowned = await machine();
    await expect(kioskExperienceService.previewForMachine(BUSINESS_ID, unowned, { scope: 'owner', scopeId: partnerId })).rejects.toBeInstanceOf(KioskScopeError);
  });
});

describe('device profile', () => {
  it('records size and derives orientation; refuses nonsense', async () => {
    const machineId = await machine();
    const { after } = await kioskExperienceService.setDisplayProfile(BUSINESS_ID, machineId, { widthPx: 1080, heightPx: 1920, diagonalInches: 32 }, 'staff-1');
    expect(after).toEqual({ widthPx: 1080, heightPx: 1920, diagonalInches: 32, orientation: 'portrait' });
    await expect(kioskExperienceService.setDisplayProfile(BUSINESS_ID, machineId, { widthPx: 10, heightPx: 1920 }, 'staff-1')).rejects.toBeInstanceOf(KioskScopeError);
  });
});
