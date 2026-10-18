import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseCoolingTarget, type CoolingTarget } from './thermostat';

/**
 * The last cooling range Snack Quest sent, kept in a small file so a
 * restart carries on with it. Written to a temporary file, fsync'd and
 * renamed over the old one: a power cut leaves the old range or the
 * new one, never half of either. A damaged file reads as "none", and
 * the thermostat falls back to its default range.
 */
export class FileCoolingStore {
  constructor(private readonly path: string) {}

  load(): CoolingTarget | null {
    try {
      return parseCoolingTarget(JSON.parse(readFileSync(this.path, 'utf8')));
    } catch {
      return null;
    }
  }

  async save(target: CoolingTarget): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify(target));
    const handle = await open(temporary, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, this.path);
  }
}
