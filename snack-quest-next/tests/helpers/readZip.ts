import { crc32 } from '@/lib/storage/zip';

export async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads a stored-only zip through its central directory, checking every CRC — enough to prove the writer's output is a valid archive. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  if (view.getUint32(eocd, true) !== 0x06054b50) throw new Error('missing end of central directory');
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error(`bad central header ${i}`);
    const crc = view.getUint32(pos + 16, true);
    const size = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const offset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));

    if (view.getUint32(offset, true) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const localNameLength = view.getUint16(offset + 26, true);
    const start = offset + 30 + localNameLength;
    const data = bytes.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error(`crc mismatch for ${name}`);
    files.set(name, data);
    pos += 46 + nameLength;
  }
  return files;
}
