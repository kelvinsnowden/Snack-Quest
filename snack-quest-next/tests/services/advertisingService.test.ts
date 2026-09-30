import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const { uploadFileMock } = vi.hoisted(() => ({ uploadFileMock: vi.fn() }));
vi.mock('@/services/storageService', () => ({ storageService: { uploadFile: uploadFileMock } }));

import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { advertisingService, AdStateError, AdValidationError, resetAdvertisingCache } from '@/services/advertisingService';
import { kioskContentService } from '@/services/kioskContentService';
import { kioskExperienceService, resetKioskExperienceCache } from '@/services/kioskExperienceService';

/**
 * The advertising engine on the emulator (§ IDLE / ATTRACT ADVERTISING
 * ENGINE): creatives are checked by their bytes and reviewed; only approved
 * creatives in active campaigns reach targeted machines; playback counts
 * once however often it is resent; revenue and owner shares follow the
 * campaign's terms and each owner's agreement.
 */

const BUSINESS_ID = 'biz-advertising';
const OTHER = 'biz-advertising-other';
const COLLECTIONS = ['machines', 'partners', 'partnerMachineAgreements', 'machineOwnershipHistory', 'deviceCredentials', 'advertisers', 'adCreatives', 'adCampaigns', 'adPlaybackBatches', 'adDailyStats', 'adRevenueEntries', 'kioskLayers', 'kioskLayerVersions', 'kioskScreenImages'];

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64, 1)]);

beforeEach(async () => {
  for (const businessId of [BUSINESS_ID, OTHER]) {
    for (const collection of COLLECTIONS) {
      const snapshot = await adminFirestore.collection(collection).where('businessId', '==', businessId).get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }
    await adminFirestore.collection('kioskPublishedIndex').doc(businessId).delete();
  }
  resetAdvertisingCache();
  resetKioskExperienceCache();
  uploadFileMock.mockReset();
  uploadFileMock.mockImplementation(async ({ filename, contentType, data }: { filename: string; contentType: string; data: Buffer }) => ({ url: `https://blob.example/ads/${filename}`, pathname: `ads/${filename}`, contentType, size: data.byteLength }));
});

async function machine(ownerPartnerId: string | null = null, businessId = BUSINESS_ID) {
  const { machineId } = await machineService.provisionDevice({ businessId, machineCode: `SQ-AD-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId, actor: 'staff-1' });
  return machineId;
}

async function approvedCreative(advertiserId: string, businessId = BUSINESS_ID) {
  const { id } = await advertisingService.uploadCreative({ businessId, advertiserId, name: 'Banner', filename: 'a.png', contentType: 'image/png', data: PNG, durationSeconds: 8, actor: 'maker' });
  await advertisingService.reviewCreative(businessId, id, 'approved', null, 'reviewer');
  return id;
}

const everywhere = { allMachines: true };
const always = { startDate: '2026-01-01', endDate: null };

async function liveCampaign(options: { businessId?: string; targeting?: unknown; billingModel?: string; priceKes?: number; kind?: 'external' | 'internal' } = {}) {
  const businessId = options.businessId ?? BUSINESS_ID;
  const advertiserId = await advertisingService.createAdvertiser(businessId, { name: 'Brand', kind: options.kind ?? 'external' }, 'maker');
  const creativeId = await approvedCreative(advertiserId, businessId);
  const campaignId = await advertisingService.createCampaign(businessId, { advertiserId, name: 'Launch', creativeIds: [creativeId], schedule: always, targeting: options.targeting ?? everywhere, weight: 2, frequencyCapPerHour: 6, billingModel: options.billingModel ?? 'none', priceKes: options.priceKes }, 'maker');
  await advertisingService.publishCampaign(businessId, campaignId, 'publisher');
  return { advertiserId, creativeId, campaignId };
}

function events(campaignId: string, creativeId: string, n: number, type = 'completed', prefix = 'evt') {
  return Array.from({ length: n }, (_, i) => ({ clientEventId: `${prefix}-${i}-xxxxxxxx`, campaignId, creativeId, eventType: type, occurredAt: '2026-09-30T09:00:00Z', playedMs: 8000 }));
}

describe('creatives', () => {
  it('stores the checksum of the actual bytes and waits for review', async () => {
    const advertiserId = await advertisingService.createAdvertiser(BUSINESS_ID, { name: 'Brand' }, 'maker');
    const { creative } = await advertisingService.uploadCreative({ businessId: BUSINESS_ID, advertiserId, name: 'Clip', filename: 'c.mp4', contentType: 'video/mp4', data: MP4, durationSeconds: 15, actor: 'maker' });
    expect(creative).toMatchObject({ status: 'pending_review', mediaKind: 'video', sha256: createHash('sha256').update(MP4).digest('hex'), bytes: MP4.byteLength });
  });

  it('refuses files that aren’t what they claim, disallowed types, and bad durations — before storing anything', async () => {
    const advertiserId = await advertisingService.createAdvertiser(BUSINESS_ID, { name: 'Brand' }, 'maker');
    const upload = (contentType: string, data: Buffer, durationSeconds = 8) => advertisingService.uploadCreative({ businessId: BUSINESS_ID, advertiserId, name: 'x', filename: 'x', contentType, data, durationSeconds, actor: 'maker' });
    await expect(upload('image/png', Buffer.from('<script>alert(1)</script>'))).rejects.toBeInstanceOf(AdValidationError);
    await expect(upload('text/html', Buffer.from('<html></html>'))).rejects.toBeInstanceOf(AdValidationError);
    await expect(upload('image/svg+xml', Buffer.from('<svg/>'))).rejects.toBeInstanceOf(AdValidationError);
    await expect(upload('video/mp4', PNG, 10)).rejects.toBeInstanceOf(AdValidationError);
    await expect(upload('image/png', PNG, 300)).rejects.toBeInstanceOf(AdValidationError);
    await expect(upload('image/png', Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)]))).rejects.toBeInstanceOf(AdValidationError);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('rejecting needs a reason; a rejected creative can’t be approved later', async () => {
    const advertiserId = await advertisingService.createAdvertiser(BUSINESS_ID, { name: 'Brand' }, 'maker');
    const { id } = await advertisingService.uploadCreative({ businessId: BUSINESS_ID, advertiserId, name: 'x', filename: 'x.png', contentType: 'image/png', data: PNG, durationSeconds: 8, actor: 'maker' });
    await expect(advertisingService.reviewCreative(BUSINESS_ID, id, 'rejected', '', 'reviewer')).rejects.toBeInstanceOf(AdValidationError);
    await advertisingService.reviewCreative(BUSINESS_ID, id, 'rejected', 'Logo is blurry', 'reviewer');
    await expect(advertisingService.reviewCreative(BUSINESS_ID, id, 'approved', null, 'reviewer')).rejects.toBeInstanceOf(AdStateError);
  });
});

describe('campaigns', () => {
  it('can’t start with an unapproved creative', async () => {
    const advertiserId = await advertisingService.createAdvertiser(BUSINESS_ID, { name: 'Brand' }, 'maker');
    const { id: creativeId } = await advertisingService.uploadCreative({ businessId: BUSINESS_ID, advertiserId, name: 'x', filename: 'x.png', contentType: 'image/png', data: PNG, durationSeconds: 8, actor: 'maker' });
    const campaignId = await advertisingService.createCampaign(BUSINESS_ID, { advertiserId, name: 'C', creativeIds: [creativeId], schedule: always, targeting: everywhere, weight: 1, frequencyCapPerHour: null, billingModel: 'none', priceKes: 0 }, 'maker');
    await expect(advertisingService.publishCampaign(BUSINESS_ID, campaignId, 'publisher')).rejects.toBeInstanceOf(AdStateError);
  });

  it('must say where it plays; Snack Quest’s own campaigns aren’t billed', async () => {
    const internal = await advertisingService.createAdvertiser(BUSINESS_ID, { name: 'Snack Quest', kind: 'internal' }, 'maker');
    const creativeId = await approvedCreative(internal);
    const base = { advertiserId: internal, name: 'C', creativeIds: [creativeId], schedule: always, weight: 1, frequencyCapPerHour: null, priceKes: 0 };
    await expect(advertisingService.createCampaign(BUSINESS_ID, { ...base, targeting: { allMachines: false }, billingModel: 'none' }, 'maker')).rejects.toThrow(/where the campaign plays/);
    await expect(advertisingService.createCampaign(BUSINESS_ID, { ...base, targeting: everywhere, billingModel: 'per_completed_play', priceKes: 5 }, 'maker')).rejects.toThrow(/aren’t billed/);
  });

  it('a running campaign must be paused before it changes', async () => {
    const { campaignId, creativeId } = await liveCampaign();
    const change = { name: 'Renamed', creativeIds: [creativeId], schedule: always, targeting: everywhere, weight: 1, frequencyCapPerHour: null, billingModel: 'none', priceKes: 0 };
    await expect(advertisingService.updateCampaign(BUSINESS_ID, campaignId, change)).rejects.toBeInstanceOf(AdStateError);
    await advertisingService.setCampaignStatus(BUSINESS_ID, campaignId, 'paused');
    await advertisingService.updateCampaign(BUSINESS_ID, campaignId, change);
    await advertisingService.publishCampaign(BUSINESS_ID, campaignId, 'publisher');
    expect((await advertisingService.getCampaign(BUSINESS_ID, campaignId))?.name).toBe('Renamed');
  });
});

describe('machine playlist', () => {
  it('reaches targeted machines only, and none when the screen design turns ads off', async () => {
    const target = await machine();
    const other = await machine();
    const { campaignId, creativeId } = await liveCampaign({ targeting: { allMachines: false, machineIds: [target] } });
    const pkg = await kioskContentService.packageFor(BUSINESS_ID, target);
    expect(pkg.ads.campaigns.map((c) => c.campaignId)).toEqual([campaignId]);
    expect(pkg.ads.campaigns[0].creatives[0]).toMatchObject({ creativeId, sha256: createHash('sha256').update(PNG).digest('hex') });
    expect((await kioskContentService.packageFor(BUSINESS_ID, other)).ads.campaigns).toEqual([]);

    await kioskExperienceService.saveDraft(BUSINESS_ID, 'machine', target, { idle: { adsEnabled: false } }, 'designer');
    await kioskExperienceService.publish(BUSINESS_ID, 'machine', target, 'no ads here', 'publisher');
    expect((await kioskContentService.packageFor(BUSINESS_ID, target)).ads.campaigns).toEqual([]);
  });

  it('pulling a creative takes it off machines', async () => {
    const target = await machine();
    const { creativeId } = await liveCampaign();
    expect((await kioskContentService.packageFor(BUSINESS_ID, target)).ads.campaigns).toHaveLength(1);
    await advertisingService.reviewCreative(BUSINESS_ID, creativeId, 'rejected', 'Advertiser withdrew it', 'reviewer');
    expect((await kioskContentService.packageFor(BUSINESS_ID, target)).ads.campaigns).toHaveLength(0);
  });
});

describe('playback', () => {
  it('a resent batch counts once', async () => {
    const machineId = await machine();
    const { campaignId, creativeId } = await liveCampaign();
    const batch = { batchId: 'batch-0000001', packageVersion: 'p1', events: events(campaignId, creativeId, 3) };
    expect(await advertisingService.recordPlayback(BUSINESS_ID, machineId, batch)).toEqual({ accepted: 3, duplicates: 0, duplicateBatch: false, rejected: [] });
    expect(await advertisingService.recordPlayback(BUSINESS_ID, machineId, batch)).toEqual({ accepted: 0, duplicates: 3, duplicateBatch: true, rejected: [] });
    const [stats] = await advertisingService.campaignStats(BUSINESS_ID, '2000-01-01', '2100-01-01');
    expect(stats).toMatchObject({ campaignId, completed: 3 });
  });

  it('two machines may use the same batch id without colliding; a repeated event inside a batch counts once', async () => {
    const a = await machine();
    const b = await machine();
    const { campaignId, creativeId } = await liveCampaign();
    await advertisingService.recordPlayback(BUSINESS_ID, a, { batchId: 'same-batch-id', events: events(campaignId, creativeId, 1) });
    expect((await advertisingService.recordPlayback(BUSINESS_ID, b, { batchId: 'same-batch-id', events: events(campaignId, creativeId, 1) })).accepted).toBe(1);
    const doubled = [...events(campaignId, creativeId, 2, 'completed', 'dup'), ...events(campaignId, creativeId, 2, 'completed', 'dup')];
    expect(await advertisingService.recordPlayback(BUSINESS_ID, a, { batchId: 'batch-with-dups', events: doubled })).toMatchObject({ accepted: 2, duplicates: 2 });
  });

  it('a batch must carry an id', async () => {
    const machineId = await machine();
    await expect(advertisingService.recordPlayback(BUSINESS_ID, machineId, { events: [] })).rejects.toBeInstanceOf(AdValidationError);
  });

  it('bad events are reported and never stop the good ones; another business’s campaign is unknown', async () => {
    const machineId = await machine();
    const { campaignId, creativeId } = await liveCampaign();
    const foreign = await liveCampaign({ businessId: OTHER });
    const result = await advertisingService.recordPlayback(BUSINESS_ID, machineId, {
      batchId: 'mixed-batch-01',
      events: [
        ...events(campaignId, creativeId, 1),
        { clientEventId: 'short', campaignId, creativeId, eventType: 'completed', occurredAt: '2026-09-30T09:00:00Z' },
        { clientEventId: 'wrong-creative-1', campaignId, creativeId: 'nope', eventType: 'completed', occurredAt: '2026-09-30T09:00:00Z' },
        { clientEventId: 'foreign-campaign-1', campaignId: foreign.campaignId, creativeId: foreign.creativeId, eventType: 'completed', occurredAt: '2026-09-30T09:00:00Z' },
        { clientEventId: 'bad-type-000001', campaignId, creativeId, eventType: 'clicked', occurredAt: '2026-09-30T09:00:00Z' },
      ],
    });
    expect(result.accepted).toBe(1);
    expect(result.rejected.map((r) => r.index)).toEqual([1, 2, 3, 4]);
  });

  it('refuses an oversized batch', async () => {
    const machineId = await machine();
    await expect(advertisingService.recordPlayback(BUSINESS_ID, machineId, { batchId: 'too-big-batch', events: Array.from({ length: 501 }, () => ({})) })).rejects.toBeInstanceOf(AdValidationError);
  });
});

describe('revenue and owner share', () => {
  it('per completed play: plays × price; the owner gets their agreed share of their machines’ part', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const ownerMachine = await machine(partnerId);
    await partnerService.createAgreement({ businessId: BUSINESS_ID, partnerId, machineId: ownerMachine, status: 'active', revenueSharePartnerPct: null, operatingCostNote: null, effectiveFrom: null, documentRef: null, note: null, terms: { adRevenueSharePartnerPct: 20 }, actor: 'staff-1' });
    const ourMachine = await machine();
    const { campaignId, creativeId } = await liveCampaign({ billingModel: 'per_completed_play', priceKes: 10 });
    const month = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7);
    await advertisingService.recordPlayback(BUSINESS_ID, ownerMachine, { batchId: 'rev-batch-0002', events: events(campaignId, creativeId, 30, 'completed', 'own') });
    await advertisingService.recordPlayback(BUSINESS_ID, ourMachine, { batchId: 'rev-batch-0003', events: events(campaignId, creativeId, 10, 'completed', 'sq') });

    const [entry] = await advertisingService.computeRevenueForMonth(BUSINESS_ID, month, 'finance');
    expect(entry).toMatchObject({ campaignId, billableUnits: 40, grossKes: 400, completedPlays: 40 });
    expect(entry.ownerShares).toHaveLength(1);
    expect(entry.ownerShares[0]).toMatchObject({ partnerId, sharePct: 20, deliveryShare: 0.75, amountKes: 60 });
    expect(entry.snackQuestKes).toBe(340);

    const summary = await advertisingService.ownerSummary(BUSINESS_ID, partnerId, month);
    expect(summary).toMatchObject({ completedPlays: 30, shareKes: 60 });
    expect(JSON.stringify(summary)).not.toMatch(/priceKes|grossKes|400/);
  });

  it('with no agreed share, the owner’s share is zero — never assumed', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const ownerMachine = await machine(partnerId);
    const { campaignId, creativeId } = await liveCampaign({ billingModel: 'per_machine_day', priceKes: 50 });
    const month = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7);
    await advertisingService.recordPlayback(BUSINESS_ID, ownerMachine, { batchId: 'rev-batch-0004', events: events(campaignId, creativeId, 5) });
    const [entry] = await advertisingService.computeRevenueForMonth(BUSINESS_ID, month, 'finance');
    expect(entry).toMatchObject({ billableUnits: 1, grossKes: 50, ownerTotalKes: 0, snackQuestKes: 50 });
  });

  it('internal campaigns earn nothing; flat monthly bills once for a month with plays', async () => {
    const machineId = await machine();
    const internal = await liveCampaign({ kind: 'internal' });
    const flat = await liveCampaign({ billingModel: 'flat_monthly', priceKes: 15000 });
    const month = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7);
    await advertisingService.recordPlayback(BUSINESS_ID, machineId, { batchId: 'rev-batch-0005', events: [...events(internal.campaignId, internal.creativeId, 4, 'completed', 'int'), ...events(flat.campaignId, flat.creativeId, 4, 'completed', 'flat')] });
    const entries = await advertisingService.computeRevenueForMonth(BUSINESS_ID, month, 'finance');
    expect(entries.find((e) => e.campaignId === internal.campaignId)?.grossKes).toBe(0);
    expect(entries.find((e) => e.campaignId === flat.campaignId)).toMatchObject({ billableUnits: 1, grossKes: 15000 });
  });
});
