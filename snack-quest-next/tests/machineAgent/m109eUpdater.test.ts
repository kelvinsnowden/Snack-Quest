import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentUpdater } from '@/machine-agent/update/updater';
import { FileCoolingStore } from '@/machine-agent/agent/coolingStore';

const body = (text: string) => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer });
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

async function updater(serve: Record<string, string>) {
  const installDir = await mkdtemp(join(tmpdir(), 'sq-update-'));
  const fetched: string[] = [];
  const instance = new AgentUpdater({
    installDir,
    siteUrl: 'https://www.snackquests.shop',
    fetch: async (url) => {
      fetched.push(url);
      return url in serve ? body(serve[url]) : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });
  return { installDir, instance, fetched };
}

const URL_030 = 'https://www.snackquests.shop/machine-agent/m109e-agent-0.3.0.mjs';

describe('AgentUpdater', () => {
  it('installs a release whose SHA-256 matches and switches current to it', async () => {
    const { installDir, instance } = await updater({ [URL_030]: 'console.log("0.3.0")' });
    const result = await instance.install({ version: '0.3.0', url: URL_030, sha256: sha('console.log("0.3.0")') });
    expect(result).toEqual({ ok: true, version: '0.3.0' });
    expect(await readlink(join(installDir, 'current'))).toBe(join('releases', '0.3.0'));
    expect(await readFile(join(installDir, 'current', 'agent.mjs'), 'utf8')).toBe('console.log("0.3.0")');
    expect(await instance.currentVersion()).toBe('0.3.0');
  });

  it('refuses a download that does not match, and leaves current alone', async () => {
    const { installDir, instance } = await updater({ [URL_030]: 'tampered' });
    const result = await instance.install({ version: '0.3.0', url: URL_030, sha256: sha('the real thing') });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/SHA-256/) });
    await expect(readlink(join(installDir, 'current'))).rejects.toThrow();
  });

  it('only downloads from the site it talks to (www or not), always via its own address', async () => {
    const { instance, fetched } = await updater({ [URL_030]: 'x' });
    expect(await instance.install({ version: '0.3.0', url: 'https://evil.example/m109e-agent-0.3.0.mjs', sha256: sha('x') })).toMatchObject({ ok: false });
    expect(fetched).toEqual([]);
    expect(await instance.install({ version: '0.3.0', url: 'https://snackquests.shop/machine-agent/m109e-agent-0.3.0.mjs', sha256: sha('x') })).toEqual({ ok: true, version: '0.3.0' });
    expect(fetched).toEqual([URL_030]);
  });

  it('refuses malformed payloads', async () => {
    const { instance } = await updater({});
    expect(await instance.install({ version: '../../etc', url: URL_030, sha256: sha('x') })).toMatchObject({ ok: false });
    expect(await instance.install({ version: '0.3.0', url: URL_030, sha256: 'abc' })).toMatchObject({ ok: false });
    expect(await instance.install(null)).toMatchObject({ ok: false });
  });

  it('keeps the newest few releases', async () => {
    const serve: Record<string, string> = {};
    for (const v of ['0.3.0', '0.4.0', '0.5.0', '0.10.0']) serve[`https://www.snackquests.shop/machine-agent/m109e-agent-${v}.mjs`] = v;
    const { installDir, instance } = await updater(serve);
    for (const v of ['0.3.0', '0.4.0', '0.5.0', '0.10.0']) {
      expect(await instance.install({ version: v, url: `https://www.snackquests.shop/machine-agent/m109e-agent-${v}.mjs`, sha256: sha(v) })).toMatchObject({ ok: true });
    }
    expect((await readdir(join(installDir, 'releases'))).sort()).toEqual(['0.10.0', '0.4.0', '0.5.0']);
  });
});

describe('FileCoolingStore', () => {
  it('keeps the range across restarts, and reads a damaged file as none', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sq-cooling-'));
    const store = new FileCoolingStore(join(dir, 'cooling.json'));
    expect(store.load()).toBeNull();
    await store.save({ enabled: true, minCelsius: 2, maxCelsius: 6 });
    expect(new FileCoolingStore(join(dir, 'cooling.json')).load()).toEqual({ enabled: true, minCelsius: 2, maxCelsius: 6 });
    await (await import('node:fs/promises')).writeFile(join(dir, 'cooling.json'), '{"enab');
    expect(store.load()).toBeNull();
  });
});
