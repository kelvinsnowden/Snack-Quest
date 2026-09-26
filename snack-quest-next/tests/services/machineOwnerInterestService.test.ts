import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineOwnerInterestRepository } from '@/repositories/machineOwnerInterestRepository';
import {
  machineOwnerInterestService,
  MachineOwnerInterestValidationError,
  MachineOwnerInterestRateLimitError,
} from '@/services/machineOwnerInterestService';

/**
 * Applications from the public `/own` page's interactive qualification
 * form (§ machine-owner lead-generation landing page), against the real
 * emulator — same discipline as `investorInterestService.test.ts`:
 * junk is refused, a repeat tap does not produce two rows, a burst from
 * one origin is stopped, and nothing about a submission leaks back.
 *
 * The last `describe` block below is the regression test for the
 * production bug this file was written to catch: the rate-limit and
 * duplicate checks each need a composite index that a real deploy can
 * fail to provision (see `MachineOwnerInterestService.safeCount` /
 * `safeFindRecent`'s doc comments). A submission must still succeed —
 * and still land in Firestore — even when those two auxiliary reads
 * are the ones failing.
 */

const VALID = {
  fullName: 'Wanjiru Kamau',
  whatsapp: '0712345678',
  capitalRange: '500k_1m',
  locationAccess: 'yes',
  ownerProfile: 'one_machine',
};

const COLLECTION = 'machineOwnerInterests';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection(COLLECTION));
  vi.restoreAllMocks();
});

async function stored(id: string) {
  const doc = await adminFirestore.collection(COLLECTION).doc(id).get();
  return doc.data()!;
}

async function count() {
  const snapshot = await adminFirestore.collection(COLLECTION).get();
  return snapshot.size;
}

describe('a valid application', () => {
  it('is stored, normalised, and starts as new', async () => {
    const { interestId, duplicate } = await machineOwnerInterestService.submit(VALID);
    const record = await stored(interestId);

    expect(duplicate).toBe(false);
    expect(record.fullName).toBe('Wanjiru Kamau');
    // E.164, through the same helper the checkout uses.
    expect(record.whatsapp).toBe('254712345678');
    expect(record.status).toBe('new');
    expect(record.locationCount).toBeNull();
    expect(record.buildingPortfolio).toBeNull();
    expect(record.locationTypes).toEqual([]);
  });

  it('lower-cases an email when one is given, and stores null when it is not', async () => {
    const withEmail = await machineOwnerInterestService.submit({ ...VALID, email: 'Wanjiru@Example.com' });
    expect((await stored(withEmail.interestId)).email).toBe('wanjiru@example.com');

    const withoutEmail = await machineOwnerInterestService.submit({ ...VALID, whatsapp: '0722334455' });
    expect((await stored(withoutEmail.interestId)).email).toBeNull();
  });

  it('keeps the conditional answers only when the branch that asks them applies', async () => {
    const { interestId } = await machineOwnerInterestService.submit({
      ...VALID,
      locationAccess: 'multiple',
      locationCount: '3_5',
      locationTypes: ['mall', 'university'],
      ownerProfile: 'multiple_machines',
      buildingPortfolio: 'yes',
    });
    const record = await stored(interestId);

    expect(record.locationCount).toBe('3_5');
    expect(record.locationTypes).toEqual(['mall', 'university']);
    expect(record.buildingPortfolio).toBe('yes');
  });

  it('ignores a bonus answer sent for a branch that was never asked', async () => {
    const { interestId } = await machineOwnerInterestService.submit({
      ...VALID,
      locationAccess: 'yes', // not 'multiple' — locationCount should not be trusted from the client
      locationCount: '10_plus',
      ownerProfile: 'one_machine', // not 'multiple_machines' — buildingPortfolio should not be trusted either
      buildingPortfolio: 'yes',
    });
    const record = await stored(interestId);

    expect(record.locationCount).toBeNull();
    expect(record.buildingPortfolio).toBeNull();
  });
});

describe('what it refuses', () => {
  it.each([
    ['a missing name', { fullName: '' }],
    ['a whatsapp number that is not Kenyan', { whatsapp: '12345' }],
    ['an email that is not one', { email: 'not-an-email' }],
    ['a capital range that is not on the list', { capitalRange: 'a-billion' }],
    ['a location access value that is not on the list', { locationAccess: 'definitely' }],
    ['an owner profile that is not on the list', { ownerProfile: 'landlord' }],
  ])('refuses %s', async (_label, override) => {
    await expect(machineOwnerInterestService.submit({ ...VALID, ...override })).rejects.toBeInstanceOf(
      MachineOwnerInterestValidationError,
    );
    expect(await count()).toBe(0);
  });

  it('refuses more location types than exist', async () => {
    await expect(
      machineOwnerInterestService.submit({ ...VALID, locationTypes: Array.from({ length: 20 }, () => 'mall') }),
    ).rejects.toBeInstanceOf(MachineOwnerInterestValidationError);
  });

  it('refuses an answer nobody could have typed', async () => {
    await expect(
      machineOwnerInterestService.submit({ ...VALID, fullName: 'a'.repeat(5_000) }),
    ).rejects.toBeInstanceOf(MachineOwnerInterestValidationError);
  });
});

describe('the same person applying twice', () => {
  it('writes one row and reports the first one back', async () => {
    const first = await machineOwnerInterestService.submit(VALID);
    const second = await machineOwnerInterestService.submit({ ...VALID, fullName: 'Wanjiru K.' });

    expect(second.duplicate).toBe(true);
    expect(second.interestId).toBe(first.interestId);
    expect(await count()).toBe(1);
  });

  it('treats a different WhatsApp number as a different application', async () => {
    await machineOwnerInterestService.submit(VALID);
    await machineOwnerInterestService.submit({ ...VALID, whatsapp: '0798765432' });

    expect(await count()).toBe(2);
  });
});

describe('rate limiting', () => {
  it('stops a burst from one origin', async () => {
    for (let index = 0; index < 5; index += 1) {
      await machineOwnerInterestService.submit({
        ...VALID,
        whatsapp: `07${String(10000000 + index).slice(0, 8)}`,
        submitterIp: '196.201.1.1',
      });
    }

    await expect(
      machineOwnerInterestService.submit({ ...VALID, whatsapp: '0700000099', submitterIp: '196.201.1.1' }),
    ).rejects.toBeInstanceOf(MachineOwnerInterestRateLimitError);
  });

  it('accepts a submission with no address to count', async () => {
    const result = await machineOwnerInterestService.submit({ ...VALID, submitterIp: undefined });
    expect(result.duplicate).toBe(false);
  });

  it('stores no IP address', async () => {
    const { interestId } = await machineOwnerInterestService.submit({ ...VALID, submitterIp: '196.201.1.1' });
    const record = await stored(interestId);

    expect(JSON.stringify(record)).not.toContain('196.201.1.1');
    expect(record.submitterHash).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('when the composite indexes are missing in production (FAILED_PRECONDITION)', () => {
  /*
   * This is the exact production failure this fix targets: every
   * historical deploy of firestore.indexes.json has failed (missing
   * FIREBASE_SERVICE_ACCOUNT secret), so `countSince` and
   * `findRecentByWhatsapp` throw for real applicants. The submission
   * must still succeed and still write to Firestore.
   */
  it('still saves the application when the rate-limit read fails', async () => {
    vi.spyOn(machineOwnerInterestRepository, 'countSince').mockRejectedValueOnce(
      new Error('9 FAILED_PRECONDITION: The query requires an index.'),
    );

    const { interestId, duplicate } = await machineOwnerInterestService.submit({
      ...VALID,
      submitterIp: '196.201.1.1',
    });

    expect(duplicate).toBe(false);
    expect((await stored(interestId)).fullName).toBe('Wanjiru Kamau');
  });

  it('still saves the application when the duplicate-check read fails', async () => {
    vi.spyOn(machineOwnerInterestRepository, 'findRecentByWhatsapp').mockRejectedValueOnce(
      new Error('9 FAILED_PRECONDITION: The query requires an index.'),
    );

    const { interestId, duplicate } = await machineOwnerInterestService.submit(VALID);

    expect(duplicate).toBe(false);
    expect((await stored(interestId)).fullName).toBe('Wanjiru Kamau');
  });

  it('still saves the application when both auxiliary reads fail', async () => {
    vi.spyOn(machineOwnerInterestRepository, 'countSince').mockRejectedValueOnce(new Error('FAILED_PRECONDITION'));
    vi.spyOn(machineOwnerInterestRepository, 'findRecentByWhatsapp').mockRejectedValueOnce(
      new Error('FAILED_PRECONDITION'),
    );

    const { interestId } = await machineOwnerInterestService.submit({ ...VALID, submitterIp: '41.90.2.2' });
    expect(await stored(interestId)).toBeDefined();
    expect(await count()).toBe(1);
  });
});
