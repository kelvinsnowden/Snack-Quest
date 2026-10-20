import { readFileSync } from 'node:fs';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * One program on the board's serial line at a time. The agent and the
 * bench tool both take `board.lock` in the data directory before they
 * open the line: two programs reading one serial port take each other's
 * replies, and a motor-run reply the agent never sees is a vend it can't
 * settle.
 *
 * The lock names its holder (pid, role, boot). A lock whose holder is no
 * longer running — a crash, a power cut, a reboot — is taken over, so a
 * stale lock can never keep the agent from starting.
 */
export type BoardLockRole = 'agent' | 'bench';

interface Holder {
  pid: number;
  role: BoardLockRole;
  bootId: string | null;
}

export class BoardBusyError extends Error {
  constructor(readonly holder: Holder) {
    super(`the board is in use by the ${holder.role === 'bench' ? 'bench tool' : 'agent'} (pid ${holder.pid})`);
    this.name = 'BoardBusyError';
  }
}

/** Takes the board for this process. Returns the release; throws `BoardBusyError` while another live program holds it. */
export async function lockBoard(dataDir: string, role: BoardLockRole): Promise<() => Promise<void>> {
  const path = join(dataDir, 'board.lock');
  await mkdir(dataDir, { recursive: true });
  const mine: Holder = { pid: process.pid, role, bootId: bootId() };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Written whole to a private file, then linked into place: the link fails if a lock exists, and a lock is never half-written.
    const draft = `${path}.${process.pid}`;
    await writeFile(draft, JSON.stringify(mine));
    try {
      await link(draft, path);
      return async () => {
        if ((await readHolder(path))?.pid === process.pid) await rm(path, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
      await rm(draft, { force: true });
    }
    const holder = await readHolder(path);
    if (holder && isLive(holder)) throw new BoardBusyError(holder);
    await rm(path, { force: true });
  }
  throw new Error(`can't take ${path}`);
}

async function readHolder(path: string): Promise<Holder | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<Holder>;
    return Number.isInteger(parsed.pid) && (parsed.role === 'agent' || parsed.role === 'bench') ? { pid: parsed.pid as number, role: parsed.role, bootId: parsed.bootId ?? null } : null;
  } catch {
    return null;
  }
}

function isLive(holder: Holder): boolean {
  if (holder.pid === process.pid) return false;
  const current = bootId();
  if (holder.bootId && current && holder.bootId !== current) return false;
  try {
    process.kill(holder.pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') return false;
  }
  // The pid is in use; on Linux, make sure it is still one of ours and not a reused number.
  try {
    return /agent[^/\0]*\.mjs|main\.ts/.test(readFileSync(`/proc/${holder.pid}/cmdline`, 'utf8'));
  } catch {
    return true;
  }
}

function bootId(): string | null {
  try {
    return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  } catch {
    return null;
  }
}
