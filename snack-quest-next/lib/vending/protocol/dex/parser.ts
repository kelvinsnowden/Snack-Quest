/**
 * DEX/EVA-DTS parsing — the published, manufacturer-independent ASCII
 * audit format vending controllers export for machine identification,
 * pricing, and sales audit (§ D of
 * docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md).
 *
 * A DEX/EVA-DTS transmission is a sequence of `*`-delimited lines,
 * each starting with a record ID: `DXS`/`DXE` wrap the transmission
 * (source, revision, sequence/block count); `ID1` carries machine/
 * software identification; `PA1` carries a slot's price; `PA2` carries
 * a slot's vend-count/vend-value audit.
 *
 * This parser covers exactly that subset — deliberately, not as an
 * oversight. EVA-DTS defines dozens more record types (cash audit,
 * error audit, session/coupon records, and more), and getting their
 * field layouts right from memory, untested against a real machine's
 * actual DEX dump, would be the same speculative-implementation
 * mistake this architecture explicitly avoids for MDB. Any record
 * outside this subset is preserved verbatim in `unrecognisedRecords` —
 * never dropped, and never guessed at.
 *
 * Never throws on a malformed or unknown line: a DEX dump comes from a
 * real machine's export, and one unexpected record must not make the
 * rest of a genuine audit unreadable. `parseDexAudit` reads what it
 * can and reports the rest as unrecognised, the same "never silently
 * fabricate, never silently drop" discipline
 * `VendingHardwareAdapter.receiveTelemetry` already holds to for
 * arbitrary manufacturer payloads.
 */

export interface DexMachineIdentity {
  /** The first `ID1` field — a machine or software identifier, exact meaning manufacturer-defined. */
  id: string | null;
  /** The second `ID1` field, when present. */
  softwareId: string | null;
}

export interface DexSlotPrice {
  slot: string;
  priceCents: number;
}

export interface DexSlotAudit {
  slot: string;
  vendCount: number;
  vendValueCents: number;
}

export interface DexAudit {
  machineIdentity: DexMachineIdentity | null;
  slotPrices: DexSlotPrice[];
  slotAudits: DexSlotAudit[];
  /** Every line whose record ID isn't ID1/PA1/PA2/DXS/DXE, verbatim, in file order. */
  unrecognisedRecords: string[];
}

function parseIntSafe(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parses a DEX/EVA-DTS transmission. Blank lines are ignored; every non-blank line is either recognised or preserved verbatim. */
export function parseDexAudit(raw: string): DexAudit {
  const audit: DexAudit = {
    machineIdentity: null,
    slotPrices: [],
    slotAudits: [],
    unrecognisedRecords: [],
  };

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const fields = line.split('*');
    const recordId = fields[0];

    switch (recordId) {
      case 'DXS':
      case 'DXE':
        // Transmission wrapper — sequence/block bookkeeping only, no
        // domain data to extract for reconciliation.
        continue;

      case 'ID1': {
        audit.machineIdentity = {
          id: fields[1] ?? null,
          softwareId: fields[2] ?? null,
        };
        continue;
      }

      case 'PA1': {
        const slot = fields[1];
        const priceCents = parseIntSafe(fields[2]);
        if (slot && priceCents !== null) {
          audit.slotPrices.push({ slot, priceCents });
        } else {
          audit.unrecognisedRecords.push(line);
        }
        continue;
      }

      case 'PA2': {
        const slot = fields[1];
        const vendCount = parseIntSafe(fields[2]);
        const vendValueCents = parseIntSafe(fields[3]);
        if (slot && vendCount !== null && vendValueCents !== null) {
          audit.slotAudits.push({ slot, vendCount, vendValueCents });
        } else {
          audit.unrecognisedRecords.push(line);
        }
        continue;
      }

      default:
        audit.unrecognisedRecords.push(line);
    }
  }

  return audit;
}
