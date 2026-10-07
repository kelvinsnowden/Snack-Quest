/**
 * A minimal streaming ZIP writer — "stored" entries only, no
 * compression. Enough for bundling photos, which are already
 * compressed (JPEG/PNG/WebP gain nothing from deflate), without adding
 * a dependency.
 *
 * Entries are pulled one at a time from an async iterable, so only one
 * file's bytes are held in memory at once. No ZIP64: a bundle that
 * would pass 65,535 entries or 4 GB errors the stream rather than
 * producing an archive that tools would read as corrupt.
 */

export interface ZipEntry {
  /** Path inside the archive, forward slashes, no leading slash. */
  name: string;
  data: Uint8Array;
  modifiedAt?: Date;
}

const MAX_ENTRIES = 0xffff;
const MAX_OFFSET = 0xffffffff;
// Bit 11: names are UTF-8, so a snack called "Pocky 抹茶" survives.
const UTF8_FLAG = 0x0800;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time as ZIP stores it — local fields, two-second resolution, 1980 floor. */
function dosDateTime(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getFullYear());
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

interface CentralRecord {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

function localHeader(record: CentralRecord): Uint8Array {
  const out = new Uint8Array(30 + record.name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, UTF8_FLAG, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, record.time, true);
  view.setUint16(12, record.date, true);
  view.setUint32(14, record.crc, true);
  view.setUint32(18, record.size, true);
  view.setUint32(22, record.size, true);
  view.setUint16(26, record.name.length, true);
  view.setUint16(28, 0, true);
  out.set(record.name, 30);
  return out;
}

function centralHeader(record: CentralRecord): Uint8Array {
  const out = new Uint8Array(46 + record.name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, UTF8_FLAG, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, record.time, true);
  view.setUint16(14, record.date, true);
  view.setUint32(16, record.crc, true);
  view.setUint32(20, record.size, true);
  view.setUint32(24, record.size, true);
  view.setUint16(28, record.name.length, true);
  // Extra, comment, disk, internal and external attributes all zero.
  view.setUint32(42, record.offset, true);
  out.set(record.name, 46);
  return out;
}

function endOfCentralDirectory(count: number, size: number, offset: number): Uint8Array {
  const out = new Uint8Array(22);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  return out;
}

/** Streams a ZIP archive of `entries`, pulling the next entry only when the reader wants more bytes. */
export function createZipStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const records: CentralRecord[] = [];
  const iterator = entries[Symbol.asyncIterator]();
  let offset = 0;
  let finished = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      const next = await iterator.next();

      if (next.done) {
        finished = true;
        const central = records.map(centralHeader);
        const centralSize = central.reduce((sum, part) => sum + part.length, 0);
        if (offset + centralSize > MAX_OFFSET) {
          controller.error(new Error('Archive is too large (over 4 GB).'));
          return;
        }
        for (const part of central) controller.enqueue(part);
        controller.enqueue(endOfCentralDirectory(records.length, centralSize, offset));
        controller.close();
        return;
      }

      const entry = next.value;
      if (records.length >= MAX_ENTRIES) {
        controller.error(new Error(`Archive has too many files (over ${MAX_ENTRIES}).`));
        return;
      }
      const { time, date } = dosDateTime(entry.modifiedAt ?? new Date());
      const record: CentralRecord = {
        name: encoder.encode(entry.name),
        crc: crc32(entry.data),
        size: entry.data.length,
        offset,
        time,
        date,
      };
      const header = localHeader(record);
      if (offset + header.length + entry.data.length > MAX_OFFSET) {
        controller.error(new Error('Archive is too large (over 4 GB).'));
        return;
      }
      records.push(record);
      offset += header.length + entry.data.length;
      controller.enqueue(header);
      controller.enqueue(entry.data);
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}
