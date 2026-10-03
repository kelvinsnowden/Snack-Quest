import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, authenticateDeviceMock, service, repo } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  authenticateDeviceMock: vi.fn(),
  service: { list: vi.fn(), addImage: vi.fn(), updateImage: vi.fn(), moveImage: vi.fn(), deleteImage: vi.fn(), resolveForMachine: vi.fn() },
  repo: { findById: vi.fn() },
}));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));
vi.mock('@/lib/vending/deviceAuth', () => ({ authenticateDevice: authenticateDeviceMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));
vi.mock('@/services/kioskScreenService', async () => {
  const actual = await vi.importActual<typeof import('@/services/kioskScreenService')>('@/services/kioskScreenService');
  return { ...actual, kioskScreenService: service };
});
vi.mock('@/repositories/kioskScreenImageRepository', async () => {
  const actual = await vi.importActual<typeof import('@/repositories/kioskScreenImageRepository')>('@/repositories/kioskScreenImageRepository');
  return { ...actual, kioskScreenImageRepository: repo };
});

import { GET as listImages, POST as addImage } from '@/app/api/vending/kiosk-screen/images/route';
import { PATCH as patchImage, DELETE as deleteImage } from '@/app/api/vending/kiosk-screen/images/[imageId]/route';
import { GET as machineScreen } from '@/app/api/vending/machines/[id]/screen/route';
import { KioskScreenValidationError } from '@/services/kioskScreenService';

/**
 * Who may choose kiosk artwork, and who may read it. Staff routes need a
 * staff session with an operations role (never a customer, never an
 * agent); the machine reads only its own resolved screen with its
 * device credential, and any other machine id reads as not found.
 */

const ADMIN = { uid: 'staff-1', email: 'a@example.com', displayName: 'A', roles: ['admin'], businessId: 'biz-1' };
const AGENT = { ...ADMIN, roles: ['agent'] };

const IMAGE = {
  businessId: 'biz-1',
  placement: 'menu_banner',
  machineId: null,
  imageUrl: 'https://blob.example/banner.webp',
  altText: 'New this week',
  displayOrder: 0,
  active: true,
  updatedAt: { toDate: () => new Date('2026-09-01T00:00:00.000Z') },
};

const json = (url: string, method: string, body?: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (imageId: string) => ({ params: Promise.resolve({ imageId }) });

beforeEach(() => {
  vi.clearAllMocks();
  repo.findById.mockResolvedValue(IMAGE);
});

describe('staff kiosk screen routes', () => {
  it('401s without a staff session and 403s a role that does not run machines', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await listImages(json('http://localhost/api/vending/kiosk-screen/images', 'GET'))).status).toBe(401);
    expect((await addImage(json('http://localhost/api/vending/kiosk-screen/images', 'POST', {}))).status).toBe(401);
    expect((await patchImage(json('http://localhost/x', 'PATCH', { active: false }), params('img-1'))).status).toBe(401);
    expect((await deleteImage(json('http://localhost/x', 'DELETE'), params('img-1'))).status).toBe(401);

    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT);
    expect((await addImage(json('http://localhost/api/vending/kiosk-screen/images', 'POST', { placement: 'menu_banner', imageUrl: 'https://x/y.webp', altText: 'x' }))).status).toBe(403);
    expect((await deleteImage(json('http://localhost/x', 'DELETE'), params('img-1'))).status).toBe(403);
    expect(service.addImage).not.toHaveBeenCalled();
    expect(service.deleteImage).not.toHaveBeenCalled();
  });

  it('adds an image for the whole fleet by default, scoped to the session’s business', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    service.addImage.mockResolvedValue('img-1');
    const response = await addImage(json('http://localhost/api/vending/kiosk-screen/images', 'POST', { placement: 'menu_banner', imageUrl: 'https://blob.example/banner.webp', altText: 'New this week', businessId: 'someone-else' }));
    expect(response.status).toBe(201);
    expect(service.addImage).toHaveBeenCalledWith({ businessId: 'biz-1', placement: 'menu_banner', machineId: null, imageUrl: 'https://blob.example/banner.webp', altText: 'New this week', actor: 'staff-1' });
    expect((await response.json()).image).toMatchObject({ id: 'img-1', placement: 'menu_banner', machineId: null });
  });

  it('400s an unknown placement, and passes the service’s validation message through', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    expect((await addImage(json('http://localhost/api/vending/kiosk-screen/images', 'POST', { placement: 'sidebar', imageUrl: 'https://x/y.webp', altText: 'x' }))).status).toBe(400);
    service.addImage.mockRejectedValue(new KioskScreenValidationError('Upload the image first — the address must be an https link.'));
    const response = await addImage(json('http://localhost/api/vending/kiosk-screen/images', 'POST', { placement: 'attract', imageUrl: 'javascript:alert(1)', altText: 'x' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/https link/);
  });

  it('switches off, moves and removes one image; an image of another business reads as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    expect((await patchImage(json('http://localhost/x', 'PATCH', { active: false }), params('img-1'))).status).toBe(200);
    expect(service.updateImage).toHaveBeenCalledWith('biz-1', 'img-1', { altText: undefined, active: false }, 'staff-1');
    expect((await patchImage(json('http://localhost/x', 'PATCH', { move: 'later' }), params('img-1'))).status).toBe(200);
    expect(service.moveImage).toHaveBeenCalledWith('biz-1', 'img-1', 'later', 'staff-1');
    expect((await patchImage(json('http://localhost/x', 'PATCH', { move: 'sideways' }), params('img-1'))).status).toBe(400);
    expect((await patchImage(json('http://localhost/x', 'PATCH', {}), params('img-1'))).status).toBe(400);
    expect((await deleteImage(json('http://localhost/x', 'DELETE'), params('img-1'))).status).toBe(204);
    expect(service.deleteImage).toHaveBeenCalledWith('biz-1', 'img-1');

    repo.findById.mockResolvedValue(null);
    expect((await patchImage(json('http://localhost/x', 'PATCH', { active: false }), params('theirs'))).status).toBe(404);
    expect((await deleteImage(json('http://localhost/x', 'DELETE'), params('theirs'))).status).toBe(404);
  });
});

describe('GET /api/vending/machines/[id]/screen', () => {
  const call = (id: string) => machineScreen(new Request(`http://localhost/api/vending/machines/${id}/screen`), { params: Promise.resolve({ id }) });

  it('401s without a device credential', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'missing_header' });
    expect((await call('m-1')).status).toBe(401);
    expect(service.resolveForMachine).not.toHaveBeenCalled();
  });

  it('404s another machine’s screen, never revealing it', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'c-1' });
    expect((await call('m-2')).status).toBe(404);
    expect(service.resolveForMachine).not.toHaveBeenCalled();
  });

  it('returns the authenticated machine’s own resolved screen', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'c-1' });
    service.resolveForMachine.mockResolvedValue({ menu_banner: [{ imageUrl: 'https://blob.example/b.webp', altText: 'B' }], attract: [] });
    const response = await call('m-1');
    expect(response.status).toBe(200);
    expect(service.resolveForMachine).toHaveBeenCalledWith('biz-1', 'm-1');
    expect(await response.json()).toEqual({ screen: { menu_banner: [{ imageUrl: 'https://blob.example/b.webp', altText: 'B' }], attract: [] } });
  });
});
