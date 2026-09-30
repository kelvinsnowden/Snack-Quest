import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { effectivePermissions } from '@/lib/auth/permissions';
import { machineService } from '@/services/machineService';
import { resetKioskExperienceCache } from '@/services/kioskExperienceService';

/**
 * The screen design routes with each template's real permissions
 * (§ KIOSK EXPERIENCE BUILDER, § GRANULAR PERMISSIONS), and the device's
 * content package (§ CONTENT SYNC): marketing designs but can't publish;
 * technicians look but don't touch; finance doesn't see designs at all; a
 * machine reads only its own package.
 */

const { verifyStaffSessionFromRequestMock, authenticateDeviceMock } = vi.hoisted(() => ({ verifyStaffSessionFromRequestMock: vi.fn(), authenticateDeviceMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));
vi.mock('@/lib/vending/deviceAuth', () => ({ authenticateDevice: authenticateDeviceMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));
vi.mock('@/lib/business/currentBusinessId', () => ({ getCurrentBusinessId: () => 'biz-kiosk-routes' }));

import { GET as getLayer, PUT as saveDraft, DELETE as withdraw } from '@/app/api/vending/kiosk/layers/[scope]/[scopeId]/route';
import { POST as publish } from '@/app/api/vending/kiosk/layers/[scope]/[scopeId]/publish/route';
import { POST as rollback } from '@/app/api/vending/kiosk/layers/[scope]/[scopeId]/rollback/route';
import { GET as listLayers } from '@/app/api/vending/kiosk/layers/route';
import { PATCH as setDisplay } from '@/app/api/vending/machines/[id]/display/route';
import { GET as content } from '@/app/api/vending/machines/[id]/content/route';

const BUSINESS_ID = 'biz-kiosk-routes';

function sessionAs(role: 'admin' | 'finance', template: string | null = null) {
  return { uid: `staff-${template ?? role}`, email: 'x@example.com', displayName: 'X', roles: [role], businessId: BUSINESS_ID, permissions: [], effectivePermissions: effectivePermissions({ roles: [role], template }) };
}
const ADMIN = sessionAs('admin');
const MARKETING = sessionAs('admin', 'marketing');
const TECHNICIAN = sessionAs('admin', 'machine_operations');
const FINANCE = sessionAs('finance');

const json = (url: string, method: string, body?: unknown) => new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const layer = { params: Promise.resolve({ scope: 'global', scopeId: 'all' }) };

beforeEach(async () => {
  vi.clearAllMocks();
  for (const collection of ['machines', 'kioskLayers', 'kioskLayerVersions', 'kioskScreenImages', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  await adminFirestore.collection('kioskPublishedIndex').doc(BUSINESS_ID).delete();
  resetKioskExperienceCache();
});

describe('who may design and publish', () => {
  it('marketing saves drafts but can’t publish, roll back or withdraw', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(MARKETING);
    expect((await saveDraft(json('http://x', 'PUT', { draft: { copy: { bannerHeadline: 'Hello' } } }), layer)).status).toBe(200);
    expect((await publish(json('http://x', 'POST', { note: 'go' }), layer)).status).toBe(403);
    expect((await rollback(json('http://x', 'POST', { versionNumber: 1 }), layer)).status).toBe(403);
    expect((await withdraw(json('http://x', 'DELETE'), layer)).status).toBe(403);
  });

  it('a technician can look but not change', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(TECHNICIAN);
    expect((await getLayer(json('http://x', 'GET'), layer)).status).toBe(200);
    expect((await listLayers(json('http://x', 'GET'))).status).toBe(200);
    expect((await saveDraft(json('http://x', 'PUT', { draft: {} }), layer)).status).toBe(403);
    expect((await setDisplay(json('http://x', 'PATCH', { display: null }), { params: Promise.resolve({ id: 'any' }) })).status).toBe(403);
  });

  it('finance doesn’t see screen designs', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE);
    expect((await getLayer(json('http://x', 'GET'), layer)).status).toBe(403);
    expect((await listLayers(json('http://x', 'GET'))).status).toBe(403);
  });

  it('an admin publishes and rolls back; a broken design is refused with the reasons', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    await saveDraft(json('http://x', 'PUT', { draft: { copy: { bannerHeadline: 'One' } } }), layer);
    expect((await publish(json('http://x', 'POST', { note: 'first' }), layer)).status).toBe(201);
    await saveDraft(json('http://x', 'PUT', { draft: { theme: { colors: { foreground: '#f0f0f0' } } } }), layer);
    const refused = await publish(json('http://x', 'POST', { note: 'unreadable' }), layer);
    expect(refused.status).toBe(409);
    expect((await refused.json()).check.errors.join(' ')).toMatch(/Main text/);
    expect((await rollback(json('http://x', 'POST', { versionNumber: 1 }), layer)).status).toBe(201);
    expect((await rollback(json('http://x', 'POST', { versionNumber: 99 }), layer)).status).toBe(404);
  });

  it('malformed settings are a 400 listing each problem', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    const response = await saveDraft(json('http://x', 'PUT', { draft: { theme: { colors: { primary: 'red' } }, idle: { timeoutSeconds: 1 } } }), layer);
    expect(response.status).toBe(400);
    expect((await response.json()).problems).toHaveLength(2);
  });

  it('an unknown layer is a 400, not a crash', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    expect((await getLayer(json('http://x', 'GET'), { params: Promise.resolve({ scope: 'planet', scopeId: 'x' }) })).status).toBe(400);
  });
});

describe('the device content package', () => {
  async function machine() {
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-KR-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: null, actor: 'staff-1' });
    return machineId;
  }

  it('a machine reads its own package; another machine’s id reads as not found; no credential is a 401', async () => {
    const mine = await machine();
    const other = await machine();
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: BUSINESS_ID, machineId: mine });
    const response = await content(json(`http://x/api/vending/machines/${mine}/content`, 'GET'), { params: Promise.resolve({ id: mine }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.experience.config.copy.bannerHeadline).toBe('Taste the world');
    expect(typeof body.packageVersion).toBe('string');
    expect((await content(json(`http://x/api/vending/machines/${other}/content`, 'GET'), { params: Promise.resolve({ id: other }) })).status).toBe(404);
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'missing_credentials' });
    expect((await content(json(`http://x/api/vending/machines/${mine}/content`, 'GET'), { params: Promise.resolve({ id: mine }) })).status).toBe(401);
  });

  it('`have` returns unchanged until a new design is published', async () => {
    const mine = await machine();
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: BUSINESS_ID, machineId: mine });
    const first = await (await content(json(`http://x/api/vending/machines/${mine}/content`, 'GET'), { params: Promise.resolve({ id: mine }) })).json();
    const again = await (await content(json(`http://x/api/vending/machines/${mine}/content?have=${first.packageVersion}`, 'GET'), { params: Promise.resolve({ id: mine }) })).json();
    expect(again).toEqual({ unchanged: true, packageVersion: first.packageVersion });
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    await saveDraft(json('http://x', 'PUT', { draft: { copy: { bannerHeadline: 'New look' } } }), layer);
    await publish(json('http://x', 'POST', { note: 'new look' }), layer);
    const updated = await (await content(json(`http://x/api/vending/machines/${mine}/content?have=${first.packageVersion}`, 'GET'), { params: Promise.resolve({ id: mine }) })).json();
    expect(updated.unchanged).toBeUndefined();
    expect(updated.experience.config.copy.bannerHeadline).toBe('New look');
    expect(updated.packageVersion).not.toBe(first.packageVersion);
  });
});
