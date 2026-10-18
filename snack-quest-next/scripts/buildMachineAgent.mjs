/**
 * Bundles the Machine Agent (`machine-agent/main.ts` and everything it
 * imports — nothing outside node:*) into one JavaScript file and
 * publishes it with the site:
 *
 *   public/machine-agent/m109e-agent-<release>.mjs
 *   public/machine-agent/manifest.json   { release, file, sha256, bytes }
 *
 * Runs before `next build`, so every deploy serves the agent release in
 * its source. Machines install it from here (deploy/install.sh) and
 * update to it when staff press "Update agent" — the manifest's SHA-256
 * travels in the signed update command and the machine refuses any
 * download that doesn't match it.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'machine-agent/agent/m109eAgent.ts'), 'utf8');
const release = /export const AGENT_RELEASE = '([^']+)'/.exec(source)?.[1];
if (!release) throw new Error('AGENT_RELEASE not found in machine-agent/agent/m109eAgent.ts');

const outDir = join(root, 'public/machine-agent');
const file = `m109e-agent-${release}.mjs`;
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await build({
  input: join(root, 'machine-agent/main.ts'),
  platform: 'node',
  logLevel: 'warn',
  output: { file: join(outDir, file), format: 'esm', banner: `#!/usr/bin/env node\n// Snack Quest Machine Agent ${release}. Built from machine-agent/; do not edit.` },
});
const bytes = await readFile(join(outDir, file));
const manifest = { release, file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
// The installer is served beside it, so a new machine needs only one command.
await writeFile(join(outDir, 'install.sh'), await readFile(join(root, 'machine-agent/deploy/install.sh')), { mode: 0o755 });
console.log(`machine agent ${release}: public/machine-agent/${file} (${bytes.length} bytes, sha256 ${manifest.sha256.slice(0, 12)}…)`);
