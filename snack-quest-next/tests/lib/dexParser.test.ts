import { describe, expect, it } from 'vitest';
import { parseDexAudit } from '@/lib/vending/protocol/dex/parser';

const SAMPLE_DEX = [
  'DXS*1234567890*REVX/DDS0104*1*1',
  'ID1*SQ-M001*FW2.1',
  'PA1*A1*150',
  'PA1*A2*200',
  'PA2*A1*42*6300',
  'PA2*A2*10*2000',
  'CA17*1*500000', // cash audit — outside the implemented subset, must be preserved verbatim
  'DXE*1234567890*1',
].join('\r\n');

describe('parseDexAudit', () => {
  it('extracts machine identity from ID1', () => {
    const audit = parseDexAudit(SAMPLE_DEX);
    expect(audit.machineIdentity).toEqual({ id: 'SQ-M001', softwareId: 'FW2.1' });
  });

  it('extracts per-slot prices from PA1', () => {
    const audit = parseDexAudit(SAMPLE_DEX);
    expect(audit.slotPrices).toEqual([
      { slot: 'A1', priceCents: 150 },
      { slot: 'A2', priceCents: 200 },
    ]);
  });

  it('extracts per-slot vend audits from PA2', () => {
    const audit = parseDexAudit(SAMPLE_DEX);
    expect(audit.slotAudits).toEqual([
      { slot: 'A1', vendCount: 42, vendValueCents: 6300 },
      { slot: 'A2', vendCount: 10, vendValueCents: 2000 },
    ]);
  });

  it('never drops an unrecognised record, and never guesses at its meaning', () => {
    const audit = parseDexAudit(SAMPLE_DEX);
    expect(audit.unrecognisedRecords).toEqual(['CA17*1*500000']);
  });

  it('ignores the DXS/DXE transmission wrapper — no domain data to extract', () => {
    const audit = parseDexAudit(SAMPLE_DEX);
    expect(audit.unrecognisedRecords.some((line) => line.startsWith('DXS'))).toBe(false);
    expect(audit.unrecognisedRecords.some((line) => line.startsWith('DXE'))).toBe(false);
  });

  it('ignores blank lines', () => {
    const audit = parseDexAudit('\n\nID1*SQ-M002\n\n');
    expect(audit.machineIdentity?.id).toBe('SQ-M002');
  });

  it('preserves a malformed PA1/PA2 line verbatim rather than fabricating a value', () => {
    const audit = parseDexAudit('PA1*A1\nPA2*A1*notanumber*100');
    expect(audit.slotPrices).toEqual([]);
    expect(audit.slotAudits).toEqual([]);
    expect(audit.unrecognisedRecords).toEqual(['PA1*A1', 'PA2*A1*notanumber*100']);
  });

  it('returns an empty, well-shaped result for an empty transmission', () => {
    const audit = parseDexAudit('');
    expect(audit).toEqual({
      machineIdentity: null,
      slotPrices: [],
      slotAudits: [],
      unrecognisedRecords: [],
    });
  });
});
