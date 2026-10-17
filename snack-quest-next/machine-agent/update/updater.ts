import { createHash } from 'node:crypto';
import { mkdir, readdir, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Installs a new agent release sent as `update_agent`
 * `{ version, url, sha256 }`.
 *
 * Layout under `installDir`:
 *   releases/<version>/agent.mjs   one file per release
 *   current -> releases/<version>  what the service runs
 *
 * The file is downloaded only from the Snack Quest site itself (the
 * address the agent already uses for the API), refused unless its SHA-256 matches the one in the
 * command — which came over the signed machine API — and only then is
 * `current` switched, by renaming a new link over the old one. A failed
 * or interrupted update leaves the running release untouched. The two
 * newest earlier releases are kept, so a technician can point `current`
 * back by hand.
 */
export interface UpdatePayload {
  version: string;
  url: string;
  sha256: string;
}

const VERSION = /^[0-9A-Za-z.+-]{1,40}$/;
const MAX_BYTES = 20 * 1024 * 1024;

export class AgentUpdater {
  constructor(
    private readonly options: {
      installDir: string;
      /** The Snack Quest site the agent talks to; downloads must come from the same host. */
      siteUrl: string;
      fetch?: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
      keep?: number;
    },
  ) {}

  async install(payload: unknown): Promise<{ ok: true; version: string } | { ok: false; reason: string }> {
    const update = (payload ?? {}) as Partial<UpdatePayload>;
    if (typeof update.version !== 'string' || !VERSION.test(update.version)) return { ok: false, reason: 'payload.version is missing or not a plain version' };
    if (typeof update.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(update.sha256)) return { ok: false, reason: 'payload.sha256 must be 64 lowercase hex characters' };
    let url: URL;
    try {
      url = new URL(String(update.url));
    } catch {
      return { ok: false, reason: 'payload.url is not a URL' };
    }
    const site = new URL(this.options.siteUrl);
    // snackquests.shop and www.snackquests.shop are the same site; the download always goes to the address the agent already talks to.
    const bare = (host: string) => host.replace(/^www\./, '');
    if (bare(url.host) !== bare(site.host) || url.protocol !== site.protocol) return { ok: false, reason: `updates are only downloaded from ${site.origin}` };

    const fetchImpl = this.options.fetch ?? ((target: string) => fetch(target, { redirect: 'error' }));
    const response = await fetchImpl(new URL(url.pathname, site.origin).toString());
    if (!response.ok) return { ok: false, reason: `download failed (HTTP ${response.status})` };
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return { ok: false, reason: `download is ${bytes.length} bytes; refusing` };
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== update.sha256) return { ok: false, reason: 'download does not match its SHA-256; not installed' };

    const releases = join(this.options.installDir, 'releases');
    const target = join(releases, update.version);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'agent.mjs'), bytes, { mode: 0o644 });

    // Atomic switch: a new link renamed over `current`.
    const current = join(this.options.installDir, 'current');
    const next = `${current}.next`;
    await rm(next, { force: true });
    await symlink(join('releases', update.version), next);
    await rename(next, current);
    await this.prune(releases, update.version);
    return { ok: true, version: update.version };
  }

  /** The release `current` points at, or null. */
  async currentVersion(): Promise<string | null> {
    const link = await readlink(join(this.options.installDir, 'current')).catch(() => null);
    return link ? link.split('/').pop() ?? null : null;
  }

  private async prune(releases: string, keepVersion: string): Promise<void> {
    const keep = this.options.keep ?? 3;
    const entries = await readdir(releases, { withFileTypes: true });
    const others = entries.filter((entry) => entry.isDirectory() && entry.name !== keepVersion).map((entry) => entry.name).sort(compareVersions).reverse();
    for (const old of others.slice(keep - 1)) await rm(join(releases, old), { recursive: true, force: true });
  }
}

function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.split(/[.+-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (x[i] === y[i]) continue;
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    return typeof x[i] === 'number' && typeof y[i] === 'number' ? (x[i] as number) - (y[i] as number) : String(x[i]).localeCompare(String(y[i]));
  }
  return 0;
}
