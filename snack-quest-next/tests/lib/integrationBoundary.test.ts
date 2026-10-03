import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

/** Core Snack Quest layers — the ones the brief forbids from knowing about any manufacturer. */
const CORE_DIRECTORIES = ['services', 'repositories', 'app', 'components'];

function sourceFiles(directory: string): string[] {
  const absolute = path.join(ROOT, directory);
  return readdirSync(absolute).flatMap((entry) => {
    const full = path.join(absolute, entry);
    if (statSync(full).isDirectory()) {
      return sourceFiles(path.join(directory, entry));
    }
    return /\.(ts|tsx)$/.test(entry) ? [path.join(directory, entry)] : [];
  });
}

const coreFiles = CORE_DIRECTORIES.flatMap(sourceFiles);

/**
 * The architectural rule behind "the core Snack Quest business logic
 * must never import manufacturer-specific implementations directly":
 * concrete adapters live under `lib/vending/adapters/`, and only the
 * adapter registry may import them. Checked mechanically, so the rule
 * can't erode one convenient import at a time.
 */
describe('manufacturer integration boundary', () => {
  it('no core file imports a concrete adapter', () => {
    const offenders = coreFiles.filter((file) => /from ['"][^'"]*lib\/vending\/adapters\//.test(readFileSync(path.join(ROOT, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('no core file branches on a specific manufacturer or adapter name', () => {
    const pattern = /(===|!==|case)\s*['"](shengma|mock|snack_quest_gateway|reference_http)['"]/;
    const offenders = coreFiles.filter((file) => pattern.test(readFileSync(path.join(ROOT, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('only the registry imports concrete adapters from within lib/vending', () => {
    const adaptersDirectory = path.join(ROOT, 'lib', 'vending', 'adapters');
    const libFiles = sourceFiles('lib/vending').filter((file) => !file.startsWith(path.join('lib', 'vending', 'adapters')));
    const importers = libFiles.filter((file) => {
      const specifiers = Array.from(readFileSync(path.join(ROOT, file), 'utf8').matchAll(/from ['"]([^'"]+)['"]/g), (match) => match[1]);
      return specifiers.some((specifier) => {
        const resolved = specifier.startsWith('@/')
          ? path.join(ROOT, specifier.slice(2))
          : specifier.startsWith('.')
            ? path.resolve(path.join(ROOT, path.dirname(file)), specifier)
            : null;
        return resolved !== null && resolved.startsWith(adaptersDirectory + path.sep);
      });
    });
    expect(importers).toEqual([path.join('lib', 'vending', 'adapterRegistry.ts')]);
  });
});
