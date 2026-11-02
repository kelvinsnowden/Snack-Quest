import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `machineInventoryMovementRepository.streamMovementsInRange` filters on
 * business and reason, optionally on one machine, and orders by `createdAt`
 * newest first. The emulator needs no index, so only this file catches a
 * missing one: without the fleet-wide index the nightly ledger
 * reconciliation and the inventory-discrepancy and expiry-risk alerts failed
 * in production with FAILED_PRECONDITION every day.
 */

type Index = { collectionGroup: string; queryScope: string; fields: { fieldPath: string; order?: string }[] };
const indexes = (JSON.parse(readFileSync(path.resolve(__dirname, '../../firestore.indexes.json'), 'utf8')) as { indexes: Index[] }).indexes;
const has = (fields: [string, string][]) =>
  indexes.some((index) => index.collectionGroup === 'machineInventoryMovements' && index.queryScope === 'COLLECTION' && JSON.stringify(index.fields.map((field) => [field.fieldPath, field.order])) === JSON.stringify(fields));

describe('machineInventoryMovements indexes', () => {
  it('has the index for movements of one reason across every machine', () => {
    expect(has([['businessId', 'ASCENDING'], ['reason', 'ASCENDING'], ['createdAt', 'DESCENDING']])).toBe(true);
  });

  it('has the index for movements of one reason on one machine', () => {
    expect(has([['businessId', 'ASCENDING'], ['reason', 'ASCENDING'], ['machineId', 'ASCENDING'], ['createdAt', 'DESCENDING']])).toBe(true);
  });
});
