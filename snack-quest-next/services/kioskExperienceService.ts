import 'server-only';

import { kioskLayerRepository, kioskLayerKey, KioskLayerNotFoundError } from '@/repositories/kioskLayerRepository';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { locationRepository } from '@/repositories/locationRepository';
import {
  DEFAULT_KIOSK_EXPERIENCE,
  KioskConfigValidationError,
  checkKioskExperience,
  mergeKioskExperience,
  parseKioskPatch,
  stableHash,
  type KioskConfigCheck,
} from '@/lib/kiosk/experienceConfig';
import {
  KIOSK_LAYER_SCOPES,
  type KioskExperienceConfig,
  type KioskExperiencePatch,
  type KioskLayer,
  type KioskLayerScope,
  type KioskLayerVersion,
  type KioskPublishedIndex,
  type Machine,
  type MachineDisplayProfile,
  type ResolvedKioskExperience,
} from '@/types';

export class KioskScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KioskScopeError';
  }
}

export class KioskPublishBlockedError extends Error {
  constructor(public readonly check: KioskConfigCheck) {
    super(`This design can’t be published yet: ${check.errors.join(' ')}`);
    this.name = 'KioskPublishBlockedError';
  }
}

export { KioskConfigValidationError, KioskLayerNotFoundError };

/** How long a server instance trusts its copy of the published index. A publish on the same instance clears it at once. */
const INDEX_TTL_MS = 30_000;
/** Versions never change, so they can be kept until evicted. */
const VERSION_CACHE_MAX = 2_000;

const indexCache = new Map<string, { at: number; index: KioskPublishedIndex | null }>();
const versionCache = new Map<string, KioskLayerVersion>();

/** Test hook: forget cached layers so the next resolve reads Firestore. */
export function resetKioskExperienceCache(): void {
  indexCache.clear();
  versionCache.clear();
}

function rememberVersion(id: string, version: KioskLayerVersion): void {
  if (versionCache.size >= VERSION_CACHE_MAX) {
    const oldest = versionCache.keys().next().value;
    if (oldest !== undefined) versionCache.delete(oldest);
  }
  versionCache.set(id, version);
}

/** The layers that apply to one machine, least specific first. */
function chainFor(machine: Pick<Machine, 'ownerPartnerId' | 'locationId'>, machineId: string): { scope: KioskLayerScope; scopeId: string }[] {
  const chain: { scope: KioskLayerScope; scopeId: string }[] = [{ scope: 'global', scopeId: 'all' }];
  if (machine.ownerPartnerId) chain.push({ scope: 'owner', scopeId: machine.ownerPartnerId });
  if (machine.locationId) chain.push({ scope: 'location', scopeId: machine.locationId });
  chain.push({ scope: 'machine', scopeId: machineId });
  return chain;
}

function parseDisplay(input: unknown): MachineDisplayProfile | null {
  if (input === null) return null;
  const value = (input ?? {}) as Record<string, unknown>;
  const width = value.widthPx;
  const height = value.heightPx;
  const diagonal = value.diagonalInches ?? null;
  const whole = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
  if (!whole(width, 320, 7680) || !whole(height, 320, 7680)) {
    throw new KioskScopeError('Screen width and height must be whole pixels between 320 and 7680.');
  }
  if (diagonal !== null && (typeof diagonal !== 'number' || diagonal < 5 || diagonal > 100)) {
    throw new KioskScopeError('The screen size must be between 5 and 100 inches, or left blank.');
  }
  return { widthPx: width as number, heightPx: height as number, diagonalInches: diagonal as number | null, orientation: (height as number) >= (width as number) ? 'portrait' : 'landscape' };
}

/**
 * The customer screen's design (§ KIOSK EXPERIENCE BUILDER): drafts,
 * immutable published versions, rollback, and the four-level inheritance
 * a machine's screen resolves through.
 *
 * Resolution never shows a customer an unreadable or unusable screen:
 * layers are applied from the least specific, and a layer whose result
 * fails `checkKioskExperience` (for example a machine layer's text colour
 * that no longer contrasts with a background an owner layer changed
 * later) is skipped and reported in `sources`, rather than applied.
 */
class KioskExperienceService {
  async assertScope(businessId: string, scope: KioskLayerScope, scopeId: string): Promise<void> {
    if (!(KIOSK_LAYER_SCOPES as readonly string[]).includes(scope)) throw new KioskScopeError(`Unknown layer “${scope}”.`);
    if (scope === 'global') {
      if (scopeId !== 'all') throw new KioskScopeError('The fleet-wide layer is addressed as “all”.');
      return;
    }
    const exists =
      scope === 'owner'
        ? Boolean(await partnerRepository.findById(businessId, scopeId))
        : scope === 'location'
          ? Boolean(await locationRepository.findById(businessId, scopeId))
          : Boolean(await machineRepository.findById(businessId, scopeId));
    if (!exists) throw new KioskScopeError(`No ${scope} with id ${scopeId}.`);
  }

  /** Published configs of the layers above `scope` in a chain — what a layer inherits. */
  private async ancestorsFor(businessId: string, scope: KioskLayerScope, scopeId: string): Promise<{ scope: KioskLayerScope; scopeId: string }[]> {
    if (scope === 'global') return [];
    if (scope === 'owner' || scope === 'location') return [{ scope: 'global', scopeId: 'all' }];
    const machine = await machineRepository.findById(businessId, scopeId);
    if (!machine) throw new MachineNotFoundError(scopeId);
    return chainFor(machine, scopeId).filter((layer) => layer.scope !== 'machine');
  }

  private async index(businessId: string): Promise<KioskPublishedIndex | null> {
    const cached = indexCache.get(businessId);
    if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached.index;
    const index = await kioskLayerRepository.getIndex(businessId);
    indexCache.set(businessId, { at: Date.now(), index });
    return index;
  }

  private async publishedPatches(businessId: string, chain: { scope: KioskLayerScope; scopeId: string }[]): Promise<Map<string, KioskLayerVersion>> {
    const index = await this.index(businessId);
    const wanted = chain.map((layer) => index?.layers?.[kioskLayerKey(layer.scope, layer.scopeId)]?.versionId).filter((id): id is string => Boolean(id));
    const missing = wanted.filter((id) => !versionCache.has(id));
    if (missing.length > 0) {
      const fetched = await kioskLayerRepository.getVersions(businessId, missing);
      for (const [id, version] of fetched) rememberVersion(id, version);
    }
    const byKey = new Map<string, KioskLayerVersion>();
    for (const id of wanted) {
      const version = versionCache.get(id);
      if (version) byKey.set(kioskLayerKey(version.scope, version.scopeId), version);
    }
    return byKey;
  }

  /**
   * Merges a chain of layers over the defaults. `override` substitutes
   * one layer's config (the draft being previewed).
   */
  private compose(
    chain: { scope: KioskLayerScope; scopeId: string }[],
    published: Map<string, KioskLayerVersion>,
    override?: { scope: KioskLayerScope; scopeId: string; patch: KioskExperiencePatch },
  ): ResolvedKioskExperience & { skipped: { scope: KioskLayerScope; scopeId: string; reason: string }[] } {
    let config: KioskExperienceConfig = DEFAULT_KIOSK_EXPERIENCE;
    const sources: ResolvedKioskExperience['sources'] = [];
    const skipped: { scope: KioskLayerScope; scopeId: string; reason: string }[] = [];
    const versionParts: string[] = [];
    for (const layer of chain) {
      const isOverride = override && override.scope === layer.scope && override.scopeId === layer.scopeId;
      const version = published.get(kioskLayerKey(layer.scope, layer.scopeId));
      const patch = isOverride ? override.patch : version?.config;
      if (!patch) continue;
      const next = mergeKioskExperience(config, patch);
      const check = checkKioskExperience(next);
      if (check.errors.length > 0) {
        skipped.push({ scope: layer.scope, scopeId: layer.scopeId, reason: check.errors.join(' ') });
        continue;
      }
      config = next;
      sources.push({ scope: layer.scope, scopeId: layer.scopeId, versionNumber: isOverride ? 0 : (version?.versionNumber ?? 0), draft: Boolean(isOverride) });
      versionParts.push(isOverride ? `${layer.scope}:${layer.scopeId}:draft:${stableHash(JSON.stringify(patch))}` : `${layer.scope}:${layer.scopeId}:v${version?.versionNumber}`);
    }
    return { config, version: `x${stableHash(versionParts.join('|') || 'defaults')}`, sources, skipped };
  }

  /** What one machine's screen shows now — what the device's content package carries. */
  async resolveForMachine(businessId: string, machineId: string, machine?: Machine | null): Promise<ResolvedKioskExperience & { skipped: { scope: KioskLayerScope; scopeId: string; reason: string }[] }> {
    const record = machine ?? (await machineRepository.findById(businessId, machineId));
    if (!record) throw new MachineNotFoundError(machineId);
    const chain = chainFor(record, machineId);
    return this.compose(chain, await this.publishedPatches(businessId, chain));
  }

  /**
   * A machine's screen with one layer's draft in place of its published
   * version — the builder's preview. The draft must belong to a layer in
   * this machine's chain.
   */
  async previewForMachine(businessId: string, machineId: string, draftOf: { scope: KioskLayerScope; scopeId: string } | null) {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);
    const chain = chainFor(machine, machineId);
    const published = await this.publishedPatches(businessId, chain);
    if (!draftOf) return this.compose(chain, published);
    if (!chain.some((layer) => layer.scope === draftOf.scope && layer.scopeId === draftOf.scopeId)) {
      throw new KioskScopeError('That machine doesn’t use this layer, so it can’t preview it.');
    }
    const layer = await kioskLayerRepository.get(businessId, draftOf.scope, draftOf.scopeId);
    return this.compose(chain, published, { ...draftOf, patch: layer?.draft ?? {} });
  }

  /** Everything the builder needs for one layer. */
  async editorState(businessId: string, scope: KioskLayerScope, scopeId: string) {
    await this.assertScope(businessId, scope, scopeId);
    const ancestors = await this.ancestorsFor(businessId, scope, scopeId);
    indexCache.delete(businessId);
    const [layer, versions, byKey] = await Promise.all([
      kioskLayerRepository.get(businessId, scope, scopeId),
      kioskLayerRepository.listVersions(businessId, scope, scopeId),
      this.publishedPatches(businessId, [...ancestors, { scope, scopeId }]),
    ]);
    const inherited = this.compose(ancestors, byKey).config;
    const draft = layer?.draft ?? {};
    const withDraft = mergeKioskExperience(inherited, draft);
    return {
      layer,
      inherited,
      draft,
      result: withDraft,
      check: checkKioskExperience(withDraft),
      live: layer?.publishedVersionId ? byKey.get(kioskLayerKey(scope, scopeId)) ?? null : null,
      versions,
      draftDiffersFromLive: JSON.stringify(draft) !== JSON.stringify(layer?.publishedVersionId ? (byKey.get(kioskLayerKey(scope, scopeId))?.config ?? {}) : {}),
    };
  }

  async saveDraft(businessId: string, scope: KioskLayerScope, scopeId: string, input: unknown, actor: string): Promise<{ draft: KioskExperiencePatch; check: KioskConfigCheck }> {
    await this.assertScope(businessId, scope, scopeId);
    const draft = parseKioskPatch(input);
    await kioskLayerRepository.saveDraft(businessId, scope, scopeId, draft, actor);
    const ancestors = await this.ancestorsFor(businessId, scope, scopeId);
    const inherited = this.compose(ancestors, await this.publishedPatches(businessId, ancestors)).config;
    return { draft, check: checkKioskExperience(mergeKioskExperience(inherited, draft)) };
  }

  private async publishConfig(businessId: string, scope: KioskLayerScope, scopeId: string, config: KioskExperiencePatch, note: string, rolledBackFrom: number | null, actor: string) {
    const ancestors = await this.ancestorsFor(businessId, scope, scopeId);
    indexCache.delete(businessId);
    const inherited = this.compose(ancestors, await this.publishedPatches(businessId, ancestors)).config;
    const check = checkKioskExperience(mergeKioskExperience(inherited, config));
    if (check.errors.length > 0) throw new KioskPublishBlockedError(check);
    const result = await kioskLayerRepository.publish({ businessId, scope, scopeId, config, note, rolledBackFrom, actor });
    indexCache.delete(businessId);
    return { ...result, warnings: check.warnings };
  }

  /** Makes the layer's saved draft live as a new version. The draft is re-validated first: a stored draft is never trusted to still be valid. */
  async publish(businessId: string, scope: KioskLayerScope, scopeId: string, note: string, actor: string) {
    await this.assertScope(businessId, scope, scopeId);
    const layer = await kioskLayerRepository.get(businessId, scope, scopeId);
    if (!layer) throw new KioskLayerNotFoundError('Save a draft before publishing.');
    const cleanNote = note.trim().slice(0, 200);
    if (!cleanNote) throw new KioskScopeError('Say what changed — it goes in the version history.');
    return this.publishConfig(businessId, scope, scopeId, parseKioskPatch(layer.draft), cleanNote, null, actor);
  }

  /** Publishes an earlier version's config again as a new version; history is never rewritten. The draft is reset to it too. */
  async rollback(businessId: string, scope: KioskLayerScope, scopeId: string, versionNumber: number, actor: string) {
    await this.assertScope(businessId, scope, scopeId);
    const version = await kioskLayerRepository.findVersion(businessId, scope, scopeId, versionNumber);
    const result = await this.publishConfig(businessId, scope, scopeId, version.config, `Rolled back to version ${versionNumber}`, versionNumber, actor);
    await kioskLayerRepository.saveDraft(businessId, scope, scopeId, version.config, actor);
    return result;
  }

  async withdraw(businessId: string, scope: KioskLayerScope, scopeId: string): Promise<void> {
    await this.assertScope(businessId, scope, scopeId);
    await kioskLayerRepository.withdraw(businessId, scope, scopeId);
    indexCache.delete(businessId);
  }

  async listLayers(businessId: string): Promise<{ id: string; data: KioskLayer }[]> {
    const layers = await kioskLayerRepository.listByBusiness(businessId);
    const order: Record<KioskLayerScope, number> = { global: 0, owner: 1, location: 2, machine: 3 };
    return layers.sort((a, b) => order[a.data.scope] - order[b.data.scope] || a.data.scopeId.localeCompare(b.data.scopeId));
  }

  async setDisplayProfile(businessId: string, machineId: string, input: unknown, actor: string): Promise<{ before: MachineDisplayProfile | null; after: MachineDisplayProfile | null }> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);
    const display = parseDisplay(input);
    await machineRepository.updateDisplay(businessId, machineId, display, actor);
    return { before: machine.display ?? null, after: display };
  }
}

export const kioskExperienceService = new KioskExperienceService();
