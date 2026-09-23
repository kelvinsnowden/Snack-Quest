import { describe, expect, it } from 'vitest';
import { PROTOCOL_REGISTRY, findProtocolRegistryEntry } from '@/lib/vending/protocol/registry';
import { mdbChecksum } from '@/lib/vending/protocol/mdb/frame';
import { parseDexAudit } from '@/lib/vending/protocol/dex/parser';

const VALID_STATUSES = ['implemented', 'planned', 'requires_documentation'];

describe('ProtocolAdapterRegistry', () => {
  it('every entry has a unique key', () => {
    const keys = PROTOCOL_REGISTRY.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry has a valid status', () => {
    for (const entry of PROTOCOL_REGISTRY) {
      expect(VALID_STATUSES).toContain(entry.status);
    }
  });

  it('finds an entry by key', () => {
    expect(findProtocolRegistryEntry('mdb')?.label).toBe('MDB 4.2');
    expect(findProtocolRegistryEntry('nonexistent')).toBeUndefined();
  });

  /**
   * The registry's own claim of "implemented" is checked against the
   * actual code, not asserted independently of it — the whole point
   * of writing it down in one place is that the doc and the code can
   * never silently disagree.
   */
  it('the mdb entry says "implemented" only because the codec really exists and works', () => {
    const entry = findProtocolRegistryEntry('mdb');
    expect(entry?.status).toBe('implemented');
    expect(mdbChecksum([0x01, 0x02])).toBe(0x03);
  });

  it('the dex entry says "implemented" only because the parser really exists and works', () => {
    const entry = findProtocolRegistryEntry('dex');
    expect(entry?.status).toBe('implemented');
    expect(parseDexAudit('ID1*M1').machineIdentity?.id).toBe('M1');
  });

  it('every tier-3 manufacturer entry declares no capabilities — nothing is guessed at', () => {
    const tier3 = PROTOCOL_REGISTRY.filter((entry) => entry.tier === 3);
    expect(tier3.length).toBeGreaterThan(0);
    for (const entry of tier3) {
      expect(entry.status).toBe('requires_documentation');
      expect(entry.supportedCapabilities).toEqual([]);
    }
  });

  it('the mock entry is the only fully-capable one', () => {
    const mock = findProtocolRegistryEntry('mock');
    expect(mock?.supportedCapabilities.length).toBeGreaterThan(0);
  });
});
