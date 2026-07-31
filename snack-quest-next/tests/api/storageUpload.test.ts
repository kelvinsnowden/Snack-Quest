import { describe, expect, it, vi } from 'vitest';

const { uploadFileMock } = vi.hoisted(() => ({ uploadFileMock: vi.fn() }));

vi.mock('@/services/storageService', () => ({
  storageService: { uploadFile: uploadFileMock },
}));

import { POST } from '@/app/api/storage/upload/route';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';

/**
 * Route-handler-level test — calls the actual exported POST function
 * with a real multipart Request, same pattern as the internal
 * agent-pricing route test. storageService itself is already covered
 * (validation, pathing) by tests/services/storageService.test.ts; this
 * just proves the wire (form parsing, status codes, error mapping).
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

describe('POST /api/storage/upload', () => {
  it('uploads a valid file and returns the Blob URL', async () => {
    uploadFileMock.mockResolvedValue({
      url: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png',
      pathname: 'snacks/biz-1/x.png',
      contentType: 'image/png',
      size: 4,
    });

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'kitkat.png', {
      type: 'image/png',
    });
    const response = await POST(
      multipartRequest({ file, directory: 'snacks', businessId: 'biz-1' }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.url).toBe('https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png');
    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', directory: 'snacks', filename: 'kitkat.png' }),
    );
  });

  it('rejects a request missing the file', async () => {
    const response = await POST(
      multipartRequest({ directory: 'snacks', businessId: 'biz-1' }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects an unknown directory', async () => {
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const response = await POST(
      multipartRequest({ file, directory: 'not-a-real-directory', businessId: 'biz-1' }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('directory');
  });

  it('rejects a request missing businessId', async () => {
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const response = await POST(multipartRequest({ file, directory: 'snacks' }));
    expect(response.status).toBe(400);
  });

  it('maps a StorageValidationError to 400 with the service message', async () => {
    uploadFileMock.mockRejectedValue(new StorageValidationError('File is too large.'));
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const response = await POST(
      multipartRequest({ file, directory: 'snacks', businessId: 'biz-1' }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('File is too large.');
  });

  it('maps a StorageUploadError to 502', async () => {
    uploadFileMock.mockRejectedValue(new StorageUploadError('Upload failed: boom'));
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const response = await POST(
      multipartRequest({ file, directory: 'snacks', businessId: 'biz-1' }),
    );
    expect(response.status).toBe(502);
  });
});
