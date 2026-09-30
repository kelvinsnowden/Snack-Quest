import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { effectivePermissions } from '@/lib/auth/permissions';
import { machineService } from '@/services/machineService';
import { advertisingService, resetAdvertisingCache } from '@/services/advertisingService';

/**
 * Advertising routes with each template's real permissions (§ GRANULAR
 * PERMISSIONS): marketing runs campaigns but can't approve its own
 * creatives or see revenue; finance sees revenue but can't run campaigns;
 * technicians see nothing; owners see only their own machines; a machine
 * reports playback only for itself.
 */

const { verifyStaffSessionFromRequestMock, verifyPartnerSessionFromRequestMock, authenticateDeviceMock, uploadFileMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  verifyPartnerSessionFromRequestMock: vi.fn(),
  authenticateDeviceMock: vi.fn(),
  uploadFileMock: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));
vi.mock('@/lib/auth/partnerSession', () => ({ verifyPartnerSessionFromRequest: verifyPartnerSessionFromRequestMock }));
vi.mock('@/lib/vending/deviceAuth', () => ({ authenticateDevice: authenticateDeviceMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));
vi.mock('@/lib/business/currentBusinessId', () => ({ getCurrentBusinessId: () => 'biz-ad-routes' }));
vi.mock('@/services/storageService', () => ({ storageService: { uploadFile: uploadFileMock } }));

import { GET as listCampaigns, POST as createCampaign } from '@/app/api/vending/advertising/campaigns/route';
import { POST as setStatus } from '@/app/api/vending/advertising/campaigns/[id]/status/route';
import { POST as createAdvertiser } from '@/app/api/vending/advertising/advertisers/route';
import { POST as uploadCreative } from '@/app/api/vending/advertising/creatives/route';
import { POST as reviewCreative } from '@/app/api/vending/advertising/creatives/[id]/review/route';
import { GET as getRevenue, POST as computeRevenue } from '@/app/api/vending/advertising/revenue/route';
import { GET as ownerAds } from '@/app/api/vending/partners/me/advertising/route';
import { POST as adEvents } from '@/app/api/vending/machines/[id]/ad-events/route';
import { POST as genericUpload } from '@/app/api/storage/upload/route';

const BUSINESS_ID = 'biz-ad-routes';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

function sessionAs(role: 'admin' | 'finance', template: string | null = null) {
  return { uid: `staff-${template ?? role}`, email: 'x@example.com', displayName: 'X', roles: [role], businessId: BUSINESS_ID, permissions: [], effectivePermissions: effectivePermissions({ roles: [role], template }) };
}
const ADMIN = sessionAs('admin');
const MARKETING = sessionAs('admin', 'marketing');
const FINANCE = sessionAs('finance');
const TECHNICIAN = sessionAs('admin', 'machine_operations');

const json = (url: string, method: string, body?: unknown) => new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(async () => {
  vi.clearAllMocks();
  resetAdvertisingCache();
  for (const collection of ['machines', 'advertisers', 'adCreatives', 'adCampaigns', 'adPlaybackEvents', 'adDailyStats', 'adRevenueEntries', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  uploadFileMock.mockImplementation(async ({ filename, contentType, data }: { filename: string; contentType: string; data: Buffer }) => ({ url: `https://blob.example/${filename}`, pathname: filename, contentType, size: data.byteLength }));
});

async function upload(session: object, advertiserId: string) {
  verifyStaffSessionFromRequestMock.mockResolvedValue(session);
  const form = new FormData();
  form.set('file', new File([PNG], 'a.png', { type: 'image/png' }));
  form.set('advertiserId', advertiserId);
  form.set('name', 'Banner');
  form.set('durationSeconds', '8');
  return uploadCreative(new Request('http://x', { method: 'POST', body: form }));
}

describe('who does what', () => {
  it('marketing creates, uploads and starts campaigns but can’t approve creatives or see revenue', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(MARKETING);
    const advertiser = await (await createAdvertiser(json('http://x', 'POST', { name: 'Brand' }))).json();
    const uploaded = await upload(MARKETING, advertiser.id);
    expect(uploaded.status).toBe(201);
    const { id: creativeId } = await uploaded.json();
    verifyStaffSessionFromRequestMock.mockResolvedValue(MARKETING);
    expect((await reviewCreative(json('http://x', 'POST', { decision: 'approved' }), { params: Promise.resolve({ id: creativeId }) })).status).toBe(403);
    expect((await getRevenue(json('http://x?month=2026-09', 'GET'))).status).toBe(403);

    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    expect((await reviewCreative(json('http://x', 'POST', { decision: 'approved' }), { params: Promise.resolve({ id: creativeId }) })).status).toBe(200);

    verifyStaffSessionFromRequestMock.mockResolvedValue(MARKETING);
    const created = await createCampaign(json('http://x', 'POST', { advertiserId: advertiser.id, name: 'Launch', creativeIds: [creativeId], schedule: { startDate: '2026-01-01' }, targeting: { allMachines: true } }));
    expect(created.status).toBe(201);
    const { id: campaignId } = await created.json();
    const started = await setStatus(json('http://x', 'POST', { action: 'start' }), { params: Promise.resolve({ id: campaignId }) });
    expect(started.status).toBe(200);
    expect((await started.json()).status).toBe('active');
  });

  it('finance sees and works out revenue but can’t run campaigns', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE);
    expect((await getRevenue(json('http://x?month=2026-09', 'GET'))).status).toBe(200);
    expect((await computeRevenue(json('http://x?month=2026-09', 'POST'))).status).toBe(200);
    expect((await createAdvertiser(json('http://x', 'POST', { name: 'Brand' }))).status).toBe(403);
    expect((await setStatus(json('http://x', 'POST', { action: 'start' }), { params: Promise.resolve({ id: 'x' }) })).status).toBe(403);
  });

  it('a technician sees no advertising at all', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(TECHNICIAN);
    expect((await listCampaigns(json('http://x', 'GET'))).status).toBe(403);
    expect((await getRevenue(json('http://x?month=2026-09', 'GET'))).status).toBe(403);
  });

  it('a bad month or unknown action is a 400', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    expect((await getRevenue(json('http://x?month=Sept', 'GET'))).status).toBe(400);
    expect((await setStatus(json('http://x', 'POST', { action: 'explode' }), { params: Promise.resolve({ id: 'x' }) })).status).toBe(400);
  });

  it('the general upload route refuses the ad directory — creatives go through review', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    const form = new FormData();
    form.set('file', new File([PNG], 'a.png', { type: 'image/png' }));
    form.set('directory', 'ads');
    expect((await genericUpload(new Request('http://x', { method: 'POST', body: form }))).status).toBe(400);
  });
});

describe('machines and owners', () => {
  it('a machine reports playback for itself only; a resend is a duplicate', async () => {
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-ADR-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: null, actor: 'staff-1' });
    const advertiserId = await advertisingService.createAdvertiser(BUSINESS_ID, { name: 'Brand' }, 'x');
    const { id: creativeId } = await advertisingService.uploadCreative({ businessId: BUSINESS_ID, advertiserId, name: 'B', filename: 'b.png', contentType: 'image/png', data: PNG, durationSeconds: 8, actor: 'x' });
    await advertisingService.reviewCreative(BUSINESS_ID, creativeId, 'approved', null, 'y');
    const campaignId = await advertisingService.createCampaign(BUSINESS_ID, { advertiserId, name: 'C', creativeIds: [creativeId], schedule: { startDate: '2026-01-01' }, targeting: { allMachines: true }, weight: 1, frequencyCapPerHour: null, billingModel: 'none', priceKes: 0 }, 'x');
    await advertisingService.publishCampaign(BUSINESS_ID, campaignId, 'x');

    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: BUSINESS_ID, machineId });
    const body = { events: [{ clientEventId: 'play-00000001', campaignId, creativeId, eventType: 'completed', occurredAt: '2026-09-30T09:00:00Z', playedMs: 8000 }] };
    const first = await adEvents(json('http://x', 'POST', body), { params: Promise.resolve({ id: machineId }) });
    expect(await first.json()).toMatchObject({ accepted: 1, duplicates: 0 });
    expect(await (await adEvents(json('http://x', 'POST', body), { params: Promise.resolve({ id: machineId }) })).json()).toMatchObject({ accepted: 0, duplicates: 1 });
    expect((await adEvents(json('http://x', 'POST', body), { params: Promise.resolve({ id: 'someone-else' }) })).status).toBe(404);
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'missing_credentials' });
    expect((await adEvents(json('http://x', 'POST', body), { params: Promise.resolve({ id: machineId }) })).status).toBe(401);
  });

  it('an owner needs their own session, and sees no advertiser prices', async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(null);
    expect((await ownerAds(json('http://x', 'GET'))).status).toBe(401);
    verifyPartnerSessionFromRequestMock.mockResolvedValue({ businessId: BUSINESS_ID, partnerId: 'partner-without-machines', uid: 'u' });
    const body = await (await ownerAds(json('http://x?month=2026-09', 'GET'))).json();
    expect(body).toMatchObject({ month: '2026-09', completedPlays: 0, shareKes: 0 });
    expect(Object.keys(body)).not.toContain('priceKes');
  });
});
