import { describe, expect, it, vi } from 'vitest';
import { StorageService } from '@/services/storageService';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';
import type { StorageGateway, StorageListPage, StorageObjectMetadata } from '@/lib/integrations/types';

/** A minimal 4-byte PNG signature followed by junk — enough to pass the magic-byte sniff without being a real image. */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PDF_BYTES = Buffer.from('%PDF-1.4 fake pdf content');

function fakeGateway(overrides: Partial<StorageGateway> = {}): StorageGateway {
  const defaultResult: StorageObjectMetadata = {
    url: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png',
    pathname: 'snacks/biz-1/x.png',
    contentType: 'image/png',
    size: 8,
  };
  return {
    uploadFile: vi.fn().mockResolvedValue(defaultResult),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockResolvedValue(defaultResult),
    listFiles: vi.fn().mockResolvedValue({ objects: [], cursor: null } satisfies StorageListPage),
    ...overrides,
  };
}

describe('StorageService.uploadFile', () => {
  it('uploads a valid image and returns the Blob URL', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);

    const result = await service.uploadFile({
      businessId: 'biz-1',
      directory: 'snacks',
      filename: 'kitkat.png',
      data: PNG_BYTES,
      contentType: 'image/png',
    });

    expect(result.url).toBe('https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png');
    expect(gateway.uploadFile).toHaveBeenCalledTimes(1);
    const call = (gateway.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // businessId + directory scoping is baked into the generated pathname.
    expect(call.pathname).toMatch(/^snacks\/biz-1\/.+-kitkat\.png$/);
    expect(call.contentType).toBe('image/png');
  });

  it('rejects a MIME type not allowed for the target directory', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);

    await expect(
      service.uploadFile({
        businessId: 'biz-1',
        directory: 'snacks',
        filename: 'video.mp4',
        data: Buffer.from('fake video'),
        contentType: 'video/mp4',
      }),
    ).rejects.toThrow(StorageValidationError);
    expect(gateway.uploadFile).not.toHaveBeenCalled();
  });

  it('allows video for the marketing directory', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);

    await expect(
      service.uploadFile({
        businessId: 'biz-1',
        directory: 'marketing',
        filename: 'ad.mp4',
        data: Buffer.from('fake video bytes'),
        contentType: 'video/mp4',
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a file over the directory size limit', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);
    const oversized = Buffer.concat([JPEG_BYTES, Buffer.alloc(9 * 1024 * 1024)]); // > 8MB snacks limit

    await expect(
      service.uploadFile({
        businessId: 'biz-1',
        directory: 'snacks',
        filename: 'huge.jpg',
        data: oversized,
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(/too large/);
  });

  it('rejects an empty file', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);

    await expect(
      service.uploadFile({
        businessId: 'biz-1',
        directory: 'snacks',
        filename: 'empty.png',
        data: Buffer.alloc(0),
        contentType: 'image/png',
      }),
    ).rejects.toThrow(/empty/);
  });

  it('rejects content whose bytes do not match the declared MIME type', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);

    await expect(
      service.uploadFile({
        businessId: 'biz-1',
        directory: 'documents',
        filename: 'fake.pdf',
        data: PNG_BYTES, // PNG bytes, declared as a PDF
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow(/doesn't match its declared type/);
  });

  it('accepts a real PDF for the documents directory', async () => {
    const gateway = fakeGateway({
      uploadFile: vi.fn().mockResolvedValue({
        url: 'https://store.public.blob.vercel-storage.com/documents/biz-1/x.pdf',
        pathname: 'documents/biz-1/x.pdf',
        contentType: 'application/pdf',
        size: PDF_BYTES.byteLength,
      }),
    });
    const service = new StorageService(gateway);

    await expect(
      service.uploadFile({
        businessId: 'biz-1',
        directory: 'documents',
        filename: 'receipt.pdf',
        data: PDF_BYTES,
        contentType: 'application/pdf',
      }),
    ).resolves.toMatchObject({ contentType: 'application/pdf' });
  });

  it('sanitizes a path-traversal filename instead of embedding it in the pathname', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);

    await service.uploadFile({
      businessId: 'biz-1',
      directory: 'snacks',
      filename: '../../etc/passwd.png',
      data: PNG_BYTES,
      contentType: 'image/png',
    });

    const call = (gateway.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.pathname).not.toContain('..');
    expect(call.pathname).not.toContain('/etc/');
  });

  it('wraps a Gateway failure in a user-friendly StorageUploadError', async () => {
    const gateway = fakeGateway({
      uploadFile: vi.fn().mockRejectedValue(new Error('Vercel Blob: service unavailable')),
    });
    const service = new StorageService(gateway);

    await expect(
      service.uploadFile({
        businessId: 'biz-1',
        directory: 'snacks',
        filename: 'kitkat.png',
        data: PNG_BYTES,
        contentType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(StorageUploadError);
  });
});

describe('StorageService.replaceFile', () => {
  it('uploads to the exact pathname extracted from the existing URL, with allowOverwrite', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);

    await service.replaceFile({
      businessId: 'biz-1',
      directory: 'snacks',
      existingUrl: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/abc-kitkat.png',
      data: PNG_BYTES,
      contentType: 'image/png',
    });

    expect(gateway.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: 'snacks/biz-1/abc-kitkat.png',
        allowOverwrite: true,
      }),
    );
  });

  it('still validates before replacing', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);

    await expect(
      service.replaceFile({
        businessId: 'biz-1',
        directory: 'snacks',
        existingUrl: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/abc-kitkat.png',
        data: Buffer.from('fake video'),
        contentType: 'video/mp4',
      }),
    ).rejects.toThrow(StorageValidationError);
    expect(gateway.uploadFile).not.toHaveBeenCalled();
  });
});

describe('StorageService.deleteFile', () => {
  it('delegates to the gateway', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);
    await service.deleteFile('https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png');
    expect(gateway.deleteFile).toHaveBeenCalledWith(
      'https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png',
    );
  });

  it('wraps a Gateway failure in StorageUploadError', async () => {
    const gateway = fakeGateway({ deleteFile: vi.fn().mockRejectedValue(new Error('boom')) });
    const service = new StorageService(gateway);
    await expect(
      service.deleteFile('https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png'),
    ).rejects.toBeInstanceOf(StorageUploadError);
  });
});

describe('StorageService.listFiles', () => {
  it('lists scoped to the businessId + directory prefix the upload path uses', async () => {
    const gateway = fakeGateway({
      listFiles: vi.fn().mockResolvedValue({
        objects: [
          { url: 'https://x/snacks/biz-1/a.png', pathname: 'snacks/biz-1/a.png', size: 10, uploadedAt: '2026-01-15T00:00:00.000Z' },
        ],
        cursor: null,
      } satisfies StorageListPage),
    });
    const service = new StorageService(gateway);

    const result = await service.listFiles('biz-1', 'snacks');

    expect(gateway.listFiles).toHaveBeenCalledWith({ prefix: 'snacks/biz-1/', cursor: undefined, limit: undefined });
    expect(result.objects).toHaveLength(1);
  });

  it('passes cursor/limit through', async () => {
    const gateway = fakeGateway();
    const service = new StorageService(gateway);

    await service.listFiles('biz-1', 'documents', { cursor: 'page-2', limit: 10 });

    expect(gateway.listFiles).toHaveBeenCalledWith({ prefix: 'documents/biz-1/', cursor: 'page-2', limit: 10 });
  });
});

describe('StorageService.generatePublicUrl', () => {
  it('returns the URL from a real Gateway metadata lookup', async () => {
    const gateway = fakeGateway({
      getMetadata: vi.fn().mockResolvedValue({
        url: 'https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png',
        pathname: 'snacks/biz-1/x.png',
        contentType: 'image/png',
        size: 8,
      }),
    });
    const service = new StorageService(gateway);

    const url = await service.generatePublicUrl('snacks/biz-1/x.png');
    expect(url).toBe('https://store.public.blob.vercel-storage.com/snacks/biz-1/x.png');
    expect(gateway.getMetadata).toHaveBeenCalledWith('snacks/biz-1/x.png');
  });
});
