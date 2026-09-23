import type { HardwareCapability } from './capabilities';

/**
 * The single declarative source of truth for what this architecture
 * knows about each protocol/manufacturer slot (§ D of
 * docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md) — what the admin
 * diagnostics panel reads from, and what
 * `docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md` itself is checked
 * against by `tests/lib/protocolRegistry.test.ts`, so the document and
 * the code can never silently disagree about what's real.
 *
 * `status` is never asserted independently of the code it describes:
 * `'implemented'` means the corresponding codec file exists and has
 * its own passing tests; `'planned'` means the slot is architecturally
 * reserved but nothing is built; `'requires_documentation'` means it
 * cannot be built honestly without a manufacturer's spec or SDK.
 */
export interface ProtocolRegistryEntry {
  key: string;
  label: string;
  tier: 1 | 2 | 3;
  status: 'implemented' | 'planned' | 'requires_documentation';
  supportedCapabilities: HardwareCapability[];
  transportRequirement: string;
  notes: string;
}

export const PROTOCOL_REGISTRY: readonly ProtocolRegistryEntry[] = [
  {
    key: 'mdb',
    label: 'MDB 4.2',
    tier: 1,
    status: 'implemented',
    // Only framing (checksum, addressing, ACK/RET/NAK) is implemented —
    // no peripheral command table exists yet, so no *business*
    // capability is actually reachable through it today. See
    // lib/vending/protocol/mdb/frame.ts.
    supportedCapabilities: [],
    transportRequirement: 'RS-232-style 9-bit serial line to a VMC, held by gateway hardware — not this application.',
    notes:
      'Frame checksum, address-byte structure, and the three universal response codes (ACK/RET/NAK) are implemented and tested. Peripheral-specific command tables are not — they require the actual MDB specification document, not memory.',
  },
  {
    key: 'dex',
    label: 'DEX / EVA-DTS',
    tier: 1,
    status: 'implemented',
    supportedCapabilities: ['audit_export', 'inventory_read'],
    transportRequirement: 'Serial/USB DEX port on the machine, or a file export a gateway forwards as raw text.',
    notes:
      'Parses the DXS/DXE wrapper, ID1 (machine identity), PA1 (slot price), and PA2 (slot vend audit) records. Every other EVA-DTS record type is preserved verbatim, never guessed at. See lib/vending/protocol/dex/parser.ts.',
  },
  {
    key: 'generic_http',
    label: 'Generic Ethernet/HTTP',
    tier: 2,
    status: 'planned',
    supportedCapabilities: [],
    transportRequirement: 'A manufacturer-documented HTTP(S) API.',
    notes: 'Architecturally reserved. No manufacturer has provided an HTTP API to build against yet.',
  },
  {
    key: 'generic_serial',
    label: 'Generic serial (RS-232/RS-485)',
    tier: 2,
    status: 'planned',
    supportedCapabilities: [],
    transportRequirement: 'A manufacturer-documented serial protocol other than MDB.',
    notes: 'Architecturally reserved. No manufacturer has provided a serial protocol spec to build against yet.',
  },
  {
    key: 'shengma',
    label: 'Shengma',
    tier: 3,
    status: 'requires_documentation',
    supportedCapabilities: [],
    transportRequirement:
      'Publicly documented as supporting MDB 4.2 and DEX/EVA-DTS on their control boards; their proprietary API/SDK is not documented for us.',
    notes:
      'lib/vending/adapters/shengmaAdapter.ts is an interface-conformant stub with every capability false. Real integration is unblocked once a specific deployment tells us which of MDB/DEX/an internal API it actually exposes.',
  },
  {
    key: 'miracle',
    label: 'MIRACLE',
    tier: 3,
    status: 'requires_documentation',
    supportedCapabilities: [],
    transportRequirement: 'Unknown — no contact, no documentation.',
    notes: 'Named in the architecture for completeness. No adapter exists; building one with no reason to would be speculative scaffolding, not architecture.',
  },
  {
    key: 'weimi',
    label: 'WEIMI',
    tier: 3,
    status: 'requires_documentation',
    supportedCapabilities: [],
    transportRequirement: 'Unknown — no contact, no documentation.',
    notes: 'Named in the architecture for completeness. No adapter exists, for the same reason as MIRACLE.',
  },
  {
    key: 'tcn',
    label: 'TCN',
    tier: 3,
    status: 'requires_documentation',
    supportedCapabilities: [],
    transportRequirement: 'Unknown — no contact, no documentation.',
    notes: 'Named in the architecture for completeness. No adapter exists, for the same reason as MIRACLE.',
  },
  {
    key: 'mock',
    label: 'Mock (development/simulator)',
    tier: 1,
    status: 'implemented',
    supportedCapabilities: [
      'vend',
      'slot_read',
      'inventory_read',
      'inventory_write',
      'dispense_confirmation',
      'heartbeat',
      'telemetry',
      'faults',
      'temperature',
      'door_status',
      'remote_price_update',
      'remote_enable_disable',
    ],
    transportRequirement: 'None — in-memory, used by every test and the vending machine simulator.',
    notes: 'The only fully-capable adapter today. See lib/vending/adapters/mockVendingAdapter.ts.',
  },
];

export function findProtocolRegistryEntry(key: string): ProtocolRegistryEntry | undefined {
  return PROTOCOL_REGISTRY.find((entry) => entry.key === key);
}
