import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const { staffSessionMock, describeFileMock, openFileMock, deleteFileMock } = vi.hoisted(() => ({ staffSessionMock: vi.fn(), describeFileMock: vi.fn(), openFileMock: vi.fn(), deleteFileMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: staffSessionMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));
vi.mock('@/services/storageService', () => ({ storageService: { uploadFile: vi.fn(), describeFile: describeFileMock, openFile: openFileMock, deleteFile: deleteFileMock } }));

import { adminFirestore } from '@/lib/firebase/admin';
import { advertisingService, AdStateError, AdValidationError } from '@/services/advertisingService';
import { POST as directUpload } from '@/app/api/vending/advertising/creatives/direct-upload/route';
import { POST as finalize } from '@/app/api/vending/advertising/creatives/finalize/route';

/**
 * Ad videos too big for our own upload route go straight to storage
 * (§ AD SECURITY — direct upload). Only staff get an upload token, only
 * for this business's ad folder; and the stored file is never trusted —
 * it is re-read, checked and hashed before it becomes a creative.
 */

const BUSINESS_ID = 'biz-ad-direct-upload';
const MB = 1024 * 1024;
const staff = (effectivePermissions: string[]) => ({ uid: 'staff-1', email: 'x@example.com', displayName: 'X', businessId: BUSINESS_ID, roles: ['admin'], permissions: [], effectivePermissions });
const json = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** A real-looking MP4: `ftyp` at byte 4, then filler. */
function mp4(bytes: number): Buffer {
  const data = Buffer.alloc(bytes, 7);
  data.writeUInt32BE(24, 0);
  data.write('ftypisom', 4, 'ascii');
  return data;
}

function streamOf(data: Buffer, chunk = 1 * MB): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= data.length) return controller.close();
      controller.enqueue(new Uint8Array(data.subarray(offset, offset + chunk)));
      offset += chunk;
    },
  });
}

function stored(data: Buffer, overrides: Partial<{ pathname: string; contentType: string; size: number }> = {}) {
  const pathname = overrides.pathname ?? `ads/${BUSINESS_ID}/promo-AbC123.mp4`;
  describeFileMock.mockResolvedValue({ url: `https://store.public.blob.vercel-storage.com/${pathname}`, pathname, contentType: overrides.contentType ?? 'video/mp4', size: overrides.size ?? data.length });
  openFileMock.mockImplementation(async () => streamOf(data));
  return `https://store.public.blob.vercel-storage.com/${pathname}`;
}

let advertiserId: string;
const ORIGINAL_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
beforeAll(() => {
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_notarealsecret0000000000';
});
afterAll(() => {
  process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL_TOKEN;
});

beforeEach(async () => {
  for (const mock of [staffSessionMock, describeFileMock, openFileMock, deleteFileMock]) mock.mockReset();
  deleteFileMock.mockResolvedValue(undefined);
  for (const collection of ['advertisers', 'adCreatives']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  advertiserId = await advertisingService.createAdvertiser(BUSINESS_ID, { name: 'Brand', contactName: null, contactPhone: null, contactEmail: null, notes: null }, 'staff-1');
});

describe('finalizing a direct upload', () => {
  it('records a 20 MB video with the checksum of the bytes actually stored, waiting for review', async () => {
    const data = mp4(20 * MB);
    const url = stored(data);
    const { creative } = await advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Long promo', url, durationSeconds: 30, actor: 'staff-1' });
    expect(creative).toMatchObject({ mimeType: 'video/mp4', mediaKind: 'video', bytes: 20 * MB, status: 'pending_review', mediaUrl: url });
    expect(creative.sha256).toBe(createHash('sha256').update(data).digest('hex'));
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('records each upload once', async () => {
    const url = stored(mp4(5 * MB));
    await advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Promo', url, durationSeconds: 20, actor: 'staff-1' });
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Promo again', url, durationSeconds: 20, actor: 'staff-1' })).rejects.toBeInstanceOf(AdStateError);
  });

  it('refuses — and deletes — a file whose bytes aren’t the video it claims to be', async () => {
    const url = stored(Buffer.alloc(6 * MB, 0x41));
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Fake', url, durationSeconds: 20, actor: 'staff-1' })).rejects.toThrow(/don’t match/);
    expect(deleteFileMock).toHaveBeenCalledWith(url);
  });

  it('refuses — and deletes — something that isn’t a video, or is over the limit', async () => {
    let url = stored(mp4(6 * MB), { contentType: 'image/png' });
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Image', url, durationSeconds: 20, actor: 'staff-1' })).rejects.toBeInstanceOf(AdValidationError);
    expect(deleteFileMock).toHaveBeenLastCalledWith(url);
    url = stored(mp4(16), { size: 51 * MB });
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Huge', url, durationSeconds: 20, actor: 'staff-1' })).rejects.toThrow(/50 MB/);
    expect(deleteFileMock).toHaveBeenLastCalledWith(url);
  });

  it('refuses a stored file that doesn’t match what storage reported (incomplete upload)', async () => {
    const data = mp4(6 * MB);
    const url = stored(data, { size: 7 * MB });
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Short', url, durationSeconds: 20, actor: 'staff-1' })).rejects.toThrow(/incomplete/);
  });

  it('refuses a file outside this business’s ad folder and never deletes it', async () => {
    const url = stored(mp4(6 * MB), { pathname: 'products/other-biz/photo.mp4' });
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Not ours', url, durationSeconds: 20, actor: 'staff-1' })).rejects.toThrow(/wasn’t found/);
    const otherBusiness = stored(mp4(6 * MB), { pathname: 'ads/another-business/promo.mp4' });
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Not ours', url: otherBusiness, durationSeconds: 20, actor: 'staff-1' })).rejects.toThrow(/wasn’t found/);
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('a URL that isn’t in our store is “not found”', async () => {
    describeFileMock.mockRejectedValue(new Error('BlobNotFoundError'));
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Elsewhere', url: 'https://example.com/x.mp4', durationSeconds: 20, actor: 'staff-1' })).rejects.toThrow(/wasn’t found/);
  });

  it('checks the duration, name and advertiser before touching storage', async () => {
    const url = stored(mp4(6 * MB));
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: 'Too long', url, durationSeconds: 61, actor: 'staff-1' })).rejects.toThrow(/seconds/);
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId, name: ' ', url, durationSeconds: 20, actor: 'staff-1' })).rejects.toBeInstanceOf(AdValidationError);
    await expect(advertisingService.finalizeDirectVideo({ businessId: BUSINESS_ID, advertiserId: 'nobody', name: 'x', url, durationSeconds: 20, actor: 'staff-1' })).rejects.toThrow();
    expect(describeFileMock).not.toHaveBeenCalled();
  });
});

describe('routes', () => {
  const tokenRequest = (pathname: string) => json('/api/vending/advertising/creatives/direct-upload', { type: 'blob.generate-client-token', payload: { pathname, multipart: false, clientPayload: null } });

  it('only staff with advertising.manage get an upload token', async () => {
    staffSessionMock.mockResolvedValue(null);
    expect((await directUpload(tokenRequest(`ads/${BUSINESS_ID}/promo.mp4`))).status).toBe(401);
    staffSessionMock.mockResolvedValue(staff(['advertising.view']));
    expect((await directUpload(tokenRequest(`ads/${BUSINESS_ID}/promo.mp4`))).status).toBe(403);
  });

  it('a token is only for this business’s ad folder', async () => {
    staffSessionMock.mockResolvedValue(staff(['advertising.manage']));
    const granted = await directUpload(tokenRequest(`ads/${BUSINESS_ID}/promo.mp4`));
    expect(granted.status).toBe(200);
    const body = (await granted.json()) as { type: string; clientToken: string };
    expect(body.type).toBe('blob.generate-client-token');
    expect(body.clientToken).toMatch(/^vercel_blob_client_/);
    expect(JSON.stringify(body)).not.toContain('notarealsecret');

    for (const pathname of ['ads/another-business/promo.mp4', 'products/x.mp4', `ads/${BUSINESS_ID}/../products/x.mp4`, `ads/${BUSINESS_ID}/nested/x.mp4`]) {
      expect({ pathname, status: (await directUpload(tokenRequest(pathname))).status }).toEqual({ pathname, status: 400 });
    }
  });

  it('finalize needs advertising.manage and records the creative', async () => {
    const url = stored(mp4(6 * MB));
    staffSessionMock.mockResolvedValue(staff(['advertising.view']));
    expect((await finalize(json('/x', { advertiserId, name: 'Promo', url, durationSeconds: 20 }))).status).toBe(403);
    staffSessionMock.mockResolvedValue(staff(['advertising.manage']));
    const response = await finalize(json('/x', { advertiserId, name: 'Promo', url, durationSeconds: 20 }));
    expect(response.status).toBe(201);
    expect(((await response.json()) as { creative: { status: string } }).creative.status).toBe('pending_review');
  });
});
