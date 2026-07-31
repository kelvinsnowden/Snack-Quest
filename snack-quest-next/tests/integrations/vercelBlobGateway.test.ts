import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unlike DarajaGateway/JumiaGateway (hand-rolled fetch calls, mocked
 * at the fetch layer), `@vercel/blob`'s `put`/`del`/`head` are a
 * black-box SDK with their own internal retry — mocking the SDK's
 * exported functions directly is the right boundary here, not
 * reverse-engineering its wire protocol.
 */
const { putMock, delMock, headMock, FakeBlobNotFoundError } = vi.hoisted(() => ({
  putMock: vi.fn(),
  delMock: vi.fn(),
  headMock: vi.fn(),
  FakeBlobNotFoundError: class FakeBlobNotFoundError extends Error {},
}));

vi.mock('@vercel/blob', () => ({
  put: putMock,
  del: delMock,
  head: headMock,
  BlobNotFoundError: FakeBlobNotFoundError,
}));

import { VercelBlobGateway } from '@/lib/integrations/vercelBlob/vercelBlobGateway';

describe('VercelBlobGateway', () => {
  let gateway: VercelBlobGateway;
  const ORIGINAL_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
    gateway = new VercelBlobGateway();
    putMock.mockReset();
    delMock.mockReset();
    headMock.mockReset();
  });

  afterEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL_TOKEN;
  });

  describe('uploadFile', () => {
    it('uploads with the exact pathname, public access, and no random suffix', async () => {
      putMock.mockResolvedValue({
        url: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg',
        pathname: 'snacks/biz-1/photo.jpg',
        contentType: 'image/jpeg',
      });

      const data = Buffer.from('fake-image-bytes');
      const result = await gateway.uploadFile({
        pathname: 'snacks/biz-1/photo.jpg',
        data,
        contentType: 'image/jpeg',
      });

      expect(putMock).toHaveBeenCalledWith(
        'snacks/biz-1/photo.jpg',
        data,
        expect.objectContaining({
          access: 'public',
          contentType: 'image/jpeg',
          addRandomSuffix: false,
          allowOverwrite: false,
          token: 'test-blob-token',
        }),
      );
      expect(result).toEqual({
        url: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg',
        pathname: 'snacks/biz-1/photo.jpg',
        contentType: 'image/jpeg',
        size: data.byteLength,
      });
    });

    it('passes allowOverwrite through for replaceFile-style uploads', async () => {
      putMock.mockResolvedValue({
        url: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg',
        pathname: 'snacks/biz-1/photo.jpg',
        contentType: 'image/jpeg',
      });

      await gateway.uploadFile({
        pathname: 'snacks/biz-1/photo.jpg',
        data: Buffer.from('new-bytes'),
        contentType: 'image/jpeg',
        allowOverwrite: true,
      });

      expect(putMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        expect.objectContaining({ allowOverwrite: true }),
      );
    });

    it('throws a clear error when BLOB_READ_WRITE_TOKEN is missing, without calling the SDK', async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;

      await expect(
        gateway.uploadFile({
          pathname: 'snacks/biz-1/photo.jpg',
          data: Buffer.from('x'),
          contentType: 'image/jpeg',
        }),
      ).rejects.toThrow(/BLOB_READ_WRITE_TOKEN/);
      expect(putMock).not.toHaveBeenCalled();
    });

    it('propagates a real upload failure from the SDK', async () => {
      putMock.mockRejectedValue(new Error('Vercel Blob: service unavailable'));

      await expect(
        gateway.uploadFile({
          pathname: 'snacks/biz-1/photo.jpg',
          data: Buffer.from('x'),
          contentType: 'image/jpeg',
        }),
      ).rejects.toThrow(/service unavailable/);
    });
  });

  describe('deleteFile', () => {
    it('deletes by URL', async () => {
      delMock.mockResolvedValue(undefined);
      await gateway.deleteFile('https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg');
      expect(delMock).toHaveBeenCalledWith(
        'https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg',
        expect.objectContaining({ token: 'test-blob-token' }),
      );
    });

    it('treats deleting an already-gone object as a no-op, not a failure', async () => {
      delMock.mockRejectedValue(new FakeBlobNotFoundError('not found'));
      await expect(
        gateway.deleteFile('https://store.public.blob.vercel-storage.com/snacks/biz-1/gone.jpg'),
      ).resolves.toBeUndefined();
    });

    it('still throws for a real delete failure', async () => {
      delMock.mockRejectedValue(new Error('network error'));
      await expect(
        gateway.deleteFile('https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg'),
      ).rejects.toThrow(/network error/);
    });
  });

  describe('getMetadata', () => {
    it('returns metadata including size from a real head() lookup', async () => {
      headMock.mockResolvedValue({
        url: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg',
        pathname: 'snacks/biz-1/photo.jpg',
        contentType: 'image/jpeg',
        size: 12345,
        uploadedAt: new Date(),
        contentDisposition: 'inline',
        downloadUrl: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg?download=1',
        cacheControl: 'public, max-age=31536000',
        etag: 'abc123',
      });

      const result = await gateway.getMetadata(
        'https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg',
      );

      expect(result).toEqual({
        url: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/photo.jpg',
        pathname: 'snacks/biz-1/photo.jpg',
        contentType: 'image/jpeg',
        size: 12345,
      });
    });
  });
});
