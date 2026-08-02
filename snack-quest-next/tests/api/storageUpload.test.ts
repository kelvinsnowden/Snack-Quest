import { describe, expect, it, vi } from 'vitest';

const { uploadFileMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  uploadFileMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/storageService', () => ({
  storageService: { uploadFile: uploadFileMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST } from '@/app/api/storage/upload/route';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';

/**
 * Route-handler-level test — calls the actual exported POST function
 * with a real multipart Request, same pattern as the internal
 * agent-pricing route test. storageService itself is already covered
 * (validation, pathing) by tests/services/storageService.test.ts; this
 * proves the wire (auth gate, form parsing, status codes, error
 * mapping). Staff-session verification is mocked here (not run
 * against the emulator) since this route only cares that a session
 * exists and which businessId it carries — the session verification
 * logic itself is already covered by tests/services/staffAuthService.test.ts.
 */
function multipartRequest(fields: Record<string, string | Blob>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return new Request('http://localhost/api/storage/upload', {
    method: 'POST',
    body: form,
  });
}

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

describe('POST /api/storage/upload', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const response = await POST(multipartRequest({ file, directory: 'snacks' }));
    expect(response.status).toBe(401);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('uploads a valid file, scoped to the session businessId, and returns the Blob URL', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    uploadFileMock.mockResolvedValue({
      url: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png',
      pathname: 'snacks/biz-1/x.png',
      contentType: 'image/png',
      size: 4,
    });

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'kitkat.png', {
      type: 'image/png',
    });
    const response = await POST(multipartRequest({ file, directory: 'snacks' }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.url).toBe('https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png');
    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', directory: 'snacks', filename: 'kitkat.png' }),
    );
  });

  it('rejects a request missing the file', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await POST(multipartRequest({ directory: 'snacks' }));
    expect(response.status).toBe(400);
  });

  it('rejects an unknown directory', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const response = await POST(multipartRequest({ file, directory: 'not-a-real-directory' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('directory');
  });

  it('maps a StorageValidationError to 400 with the service message', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    uploadFileMock.mockRejectedValue(new StorageValidationError('File is too large.'));
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const response = await POST(multipartRequest({ file, directory: 'snacks' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('File is too large.');
  });

  it('maps a StorageUploadError to 502', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    uploadFileMock.mockRejectedValue(new StorageUploadError('Upload failed: boom'));
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const response = await POST(multipartRequest({ file, directory: 'snacks' }));
    expect(response.status).toBe(502);
  });
});
