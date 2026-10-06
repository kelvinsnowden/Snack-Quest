import { beforeEach, describe, expect, it, vi } from 'vitest';

const { staffSessionMock, partnerSessionMock } = vi.hoisted(() => ({ staffSessionMock: vi.fn(), partnerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: staffSessionMock }));
vi.mock('@/lib/auth/partnerSession', () => ({ verifyPartnerSessionFromRequest: partnerSessionMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { resetKioskExperienceCache } from '@/services/kioskExperienceService';
import { GET as ownerGet, PUT as ownerPut } from '@/app/api/vending/partners/me/screen-design/route';
import { GET as listProposals } from '@/app/api/vending/kiosk/owner-proposals/route';
import { POST as accept } from '@/app/api/vending/kiosk/owner-proposals/[partnerId]/accept/route';
import { POST as decline } from '@/app/api/vending/kiosk/owner-proposals/[partnerId]/decline/route';

/**
 * The owner screen design routes (§ OWNER SCREEN DESIGN): an owner only
 * ever reaches their own proposal; staff need `kiosk.view` to see the
 * queue and `kiosk.publish` to accept or send back.
 */

const BUSINESS_ID = 'biz-owner-proposal-routes';
const staff = (effectivePermissions: string[]) => ({ uid: 'staff-1', email: 'x@example.com', displayName: 'X', businessId: BUSINESS_ID, roles: ['admin'], permissions: [], effectivePermissions });
const ownerSession = (partnerId: string) => ({ uid: `u-${partnerId}`, partnerId, businessId: BUSINESS_ID, name: 'Owner', contactEmail: null, status: 'active' });
const json = (url: string, method: string, body?: unknown) => new Request(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (partnerId: string) => ({ params: Promise.resolve({ partnerId }) });

let ownerA: string;
let ownerB: string;

beforeEach(async () => {
  staffSessionMock.mockReset();
  partnerSessionMock.mockReset();
  for (const collection of ['machines', 'partners', 'kioskLayers', 'kioskLayerVersions', 'kioskOwnerProposals', 'machineOwnershipHistory', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  await adminFirestore.collection('kioskPublishedIndex').doc(BUSINESS_ID).delete();
  resetKioskExperienceCache();
  ownerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner A', actor: 'staff-1' });
  ownerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner B', actor: 'staff-1' });
  for (const ownerPartnerId of [ownerA, ownerB]) {
    await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-OP-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId, actor: 'staff-1' });
  }
});

describe('owner routes', () => {
  it('no session → 401', async () => {
    partnerSessionMock.mockResolvedValue(null);
    expect((await ownerGet(json('/api/vending/partners/me/screen-design', 'GET'))).status).toBe(401);
    expect((await ownerPut(json('/api/vending/partners/me/screen-design', 'PUT', { patch: {} }))).status).toBe(401);
  });

  it('an owner saves and sends their own proposal; staff-only settings are refused', async () => {
    partnerSessionMock.mockResolvedValue(ownerSession(ownerA));
    expect((await ownerPut(json('/api/vending/partners/me/screen-design', 'PUT', { patch: { idle: { adsEnabled: false } }, submit: true }))).status).toBe(409);
    const sent = await ownerPut(json('/api/vending/partners/me/screen-design', 'PUT', { patch: { copy: { bannerHeadline: 'A’s snacks' } }, submit: true }));
    expect(sent.status).toBe(200);
    const state = (await (await ownerGet(json('/api/vending/partners/me/screen-design', 'GET'))).json()) as { proposal: { status: string }; editing: unknown; machines: { id: string }[] };
    expect(state.proposal.status).toBe('submitted');
    expect(state.editing).toEqual({ copy: { bannerHeadline: 'A’s snacks' } });
    expect(state.machines).toHaveLength(1);
  });

  it('owner B sees nothing of owner A’s proposal', async () => {
    partnerSessionMock.mockResolvedValue(ownerSession(ownerA));
    await ownerPut(json('/api/vending/partners/me/screen-design', 'PUT', { patch: { copy: { bannerHeadline: 'Private to A' } }, submit: true }));
    partnerSessionMock.mockResolvedValue(ownerSession(ownerB));
    const text = await (await ownerGet(json('/api/vending/partners/me/screen-design', 'GET'))).text();
    expect(text).not.toContain('Private to A');
    expect(text).not.toContain(ownerA);
  });

  it('an unreadable design is refused on send with the problems listed', async () => {
    partnerSessionMock.mockResolvedValue(ownerSession(ownerA));
    const response = await ownerPut(json('/api/vending/partners/me/screen-design', 'PUT', { patch: { browseSections: [{ id: 'b', type: 'menu_banner', visible: true, props: {} }] }, submit: true }));
    expect(response.status).toBe(409);
    expect(((await response.json()) as { problems: string[] }).problems.length).toBeGreaterThan(0);
  });
});

describe('staff routes', () => {
  beforeEach(async () => {
    partnerSessionMock.mockResolvedValue(ownerSession(ownerA));
    await ownerPut(json('/api/vending/partners/me/screen-design', 'PUT', { patch: { copy: { bannerHeadline: 'A’s snacks' } }, submit: true }));
  });

  it('an owner session is not a staff session', async () => {
    staffSessionMock.mockResolvedValue(null);
    expect((await listProposals(json('/api/vending/kiosk/owner-proposals', 'GET'))).status).toBe(401);
    expect((await accept(json('/x', 'POST', { note: 'ok' }), params(ownerA))).status).toBe(401);
  });

  it('seeing the queue needs kiosk.view; accepting or sending back needs kiosk.publish', async () => {
    staffSessionMock.mockResolvedValue(staff(['kiosk.view', 'kiosk.design']));
    const listed = (await (await listProposals(json('/api/vending/kiosk/owner-proposals', 'GET'))).json()) as { proposals: { partnerId: string }[] };
    expect(listed.proposals.map((proposal) => proposal.partnerId)).toEqual([ownerA]);
    expect((await accept(json('/x', 'POST', { note: 'ok' }), params(ownerA))).status).toBe(403);
    expect((await decline(json('/x', 'POST', { note: 'no thanks' }), params(ownerA))).status).toBe(403);

    staffSessionMock.mockResolvedValue(staff(['kiosk.publish']));
    expect((await listProposals(json('/api/vending/kiosk/owner-proposals', 'GET'))).status).toBe(403);
  });

  it('accept publishes once; a second review is refused', async () => {
    staffSessionMock.mockResolvedValue(staff(['kiosk.view', 'kiosk.publish']));
    const accepted = await accept(json('/x', 'POST', { note: 'Owner A banner' }), params(ownerA));
    expect(accepted.status).toBe(200);
    expect(((await accepted.json()) as { versionNumber: number }).versionNumber).toBe(1);
    expect((await accept(json('/x', 'POST', { note: 'again' }), params(ownerA))).status).toBe(409);
    expect((await decline(json('/x', 'POST', { note: 'too late now' }), params(ownerA))).status).toBe(409);
  });

  it('send back needs a reason; an owner with nothing sent gives a conflict, not someone else’s data', async () => {
    staffSessionMock.mockResolvedValue(staff(['kiosk.view', 'kiosk.publish']));
    expect((await decline(json('/x', 'POST', { note: '' }), params(ownerA))).status).toBe(409);
    expect((await decline(json('/x', 'POST', { note: 'Banner can’t promise prices.' }), params(ownerA))).status).toBe(200);
    const nothing = await accept(json('/x', 'POST', { note: 'ok' }), params(ownerB));
    expect(nothing.status).toBe(409);
  });
});
