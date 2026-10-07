import { describe, expect, it } from 'vitest';
import { createZipStream, crc32, type ZipEntry } from '@/lib/storage/zip';
import { collectStream, readZip } from '@/tests/helpers/readZip';

async function* fromArray(entries: ZipEntry[]): AsyncGenerator<ZipEntry> {
  for (const entry of entries) yield entry;
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('createZipStream', () => {
  it('writes an archive whose entries read back byte-for-byte', async () => {
    const encoder = new TextEncoder();
    const bytes = await collectStream(
      createZipStream(
        fromArray([
          { name: 'images/pocky-抹茶.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]) },
          { name: 'catalog.csv', data: encoder.encode('Name\r\nPocky\r\n') },
        ]),
      ),
    );

    const files = readZip(bytes);
    expect([...files.keys()]).toEqual(['images/pocky-抹茶.jpg', 'catalog.csv']);
    expect([...files.get('images/pocky-抹茶.jpg')!]).toEqual([0xff, 0xd8, 0xff, 0x00, 0x01]);
    expect(new TextDecoder().decode(files.get('catalog.csv'))).toBe('Name\r\nPocky\r\n');
  });

  it('writes a valid empty archive', async () => {
    const files = readZip(await collectStream(createZipStream(fromArray([]))));
    expect(files.size).toBe(0);
  });
});
