import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  partnerService,
  PartnerValidationError,
} from '@/services/partnerService';
import {
  machineService,
  OwnerReassignmentError,
} from '@/services/machineService';
import {
  machineSettlementService,
  OwnershipChangedDuringPeriodError,
} from '@/services/machineSettlementService';
import { machineOwnershipHistoryRepository } from '@/repositories/machineOwnershipHistoryRepository';
import {
  partnerMachineAgreementRepository,
  AgreementConflictError,
} from '@/repositories/partnerMachineAgreementRepository';
import type { Machine } from '@/types';

/**
 * Owners, their agreements, and handing a machine from one owner to
 * another. What matters: a sign-up email can only ever match one owner,
 * a machine never has two live agreements, a handover waits for the
 * agreement to end, and no settlement can credit one owner with another
 * owner's time.
 */

const BUSINESS_ID = 'biz-machine-ownership-test';

async function clean() {
  for (const collection of [
    'machines',
    'partners',
    'partnerMachineAgreements',
    'machineOwnershipHistory',
    'machineSettlements',
    'deviceCredentials',
  ]) {
    const snapshot = await adminFirestore
      .collection(collection)
      .where('businessId', '==', BUSINESS_ID)
      .get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}
beforeEach(clean);
afterEach(clean);

async function machineFor(ownerPartnerId: string | null) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-OWN-${Math.random().toString(36).slice(2, 10)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test',
    ownerPartnerId,
    actor: 'staff-1',
  });
  return machineId;
}

describe('owner records', () => {
  it('keeps contact emails unique across owners, ignoring case, so a sign-up can only claim one owner', async () => {
    await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'First',
      contactEmail: 'Owner@Example.com',
      actor: 'staff-1',
    });
    await expect(
      partnerService.create({
        businessId: BUSINESS_ID,
        name: 'Second',
        contactEmail: 'owner@example.COM ',
        actor: 'staff-1',
      }),
    ).rejects.toBeInstanceOf(PartnerValidationError);
    await expect(
      partnerService.create({
        businessId: BUSINESS_ID,
        name: 'Third',
        contactEmail: 'not-an-email',
        actor: 'staff-1',
      }),
    ).rejects.toThrow('doesn’t look right');
    const other = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'Other',
      contactEmail: 'other@example.com',
      actor: 'staff-1',
    });
    await expect(
      partnerService.update(
        BUSINESS_ID,
        other,
        { contactEmail: 'OWNER@example.com' },
        'staff-1',
      ),
    ).rejects.toThrow('already uses that email');
    // Saving an owner's own email back to themselves is not a clash.
    await expect(
      partnerService.update(
        BUSINESS_ID,
        other,
        { contactEmail: 'Other@Example.com' },
        'staff-1',
      ),
    ).resolves.toBeDefined();
  });

  it('edits and suspends without touching the login link or the wallet', async () => {
    const partnerId = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'Editable',
      actor: 'staff-1',
    });
    await adminFirestore
      .collection('partners')
      .doc(partnerId)
      .update({ authUid: 'uid-1', availableCashKes: 500 });
    const { before, after } = await partnerService.update(
      BUSINESS_ID,
      partnerId,
      { name: '  Renamed  ', status: 'suspended', note: '' },
      'staff-2',
    );
    expect(before.name).toBe('Editable');
    expect(after).toMatchObject({
      name: 'Renamed',
      status: 'suspended',
      note: null,
    });
    const stored = await partnerService.findById(BUSINESS_ID, partnerId);
    expect(stored).toMatchObject({
      name: 'Renamed',
      status: 'suspended',
      authUid: 'uid-1',
      availableCashKes: 500,
      updatedBy: 'staff-2',
    });
    await expect(
      partnerService.update(BUSINESS_ID, partnerId, { name: '   ' }, 'staff-2'),
    ).rejects.toThrow('Name is required');
    await expect(
      partnerService.update(
        BUSINESS_ID,
        partnerId,
        { status: 'deleted' as never },
        'staff-2',
      ),
    ).rejects.toBeInstanceOf(PartnerValidationError);
    await expect(
      partnerService.update(
        'another-business',
        partnerId,
        { name: 'x' },
        'staff-2',
      ),
    ).rejects.toThrow('Owner not found');
  });
});

describe('agreements', () => {
  it('only covers the owner’s own machines, keeps the share within 0–100, and leaves a blank share blank', async () => {
    const owner = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'Owner',
      actor: 'staff-1',
    });
    const stranger = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'Stranger',
      actor: 'staff-1',
    });
    const machineId = await machineFor(owner);
    const base = {
      businessId: BUSINESS_ID,
      machineId,
      status: 'draft' as const,
      operatingCostNote: null,
      effectiveFrom: null,
      documentRef: null,
      note: null,
      actor: 'staff-1',
    };

    await expect(
      partnerService.createAgreement({
        ...base,
        partnerId: stranger,
        revenueSharePartnerPct: 50,
      }),
    ).rejects.toThrow('doesn’t belong to Stranger');
    await expect(
      partnerService.createAgreement({
        ...base,
        partnerId: owner,
        revenueSharePartnerPct: 120,
      }),
    ).rejects.toThrow('between 0 and 100');
    const id = await partnerService.createAgreement({
      ...base,
      partnerId: owner,
      revenueSharePartnerPct: null,
    });
    const stored = await partnerMachineAgreementRepository.findById(
      BUSINESS_ID,
      id,
    );
    expect(stored).toMatchObject({
      status: 'draft',
      revenueSharePartnerPct: null,
      effectiveFrom: null,
      effectiveTo: null,
    });
  });

  it('never lets a machine have two active agreements, and an ended one stays ended', async () => {
    const owner = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'Owner',
      actor: 'staff-1',
    });
    const machineId = await machineFor(owner);
    const base = {
      businessId: BUSINESS_ID,
      partnerId: owner,
      machineId,
      revenueSharePartnerPct: 40,
      operatingCostNote: null,
      effectiveFrom: null,
      documentRef: null,
      note: null,
      actor: 'staff-1',
    };

    const first = await partnerService.createAgreement({
      ...base,
      status: 'active',
    });
    expect(
      (await partnerMachineAgreementRepository.findById(BUSINESS_ID, first))
        ?.effectiveFrom,
    ).not.toBeNull();
    await expect(
      partnerService.createAgreement({ ...base, status: 'active' }),
    ).rejects.toBeInstanceOf(AgreementConflictError);
    const draft = await partnerService.createAgreement({
      ...base,
      status: 'draft',
    });
    await expect(
      partnerService.transitionAgreement(
        BUSINESS_ID,
        owner,
        draft,
        'active',
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(AgreementConflictError);

    // Two people starting two drafts at once: exactly one wins.
    const other = await partnerService.createAgreement({
      ...base,
      status: 'draft',
    });
    const ended = await partnerService.transitionAgreement(
      BUSINESS_ID,
      owner,
      first,
      'terminated',
      'staff-1',
    );
    expect(ended.status).toBe('terminated');
    expect(ended.effectiveTo).not.toBeNull();
    const results = await Promise.allSettled([
      partnerService.transitionAgreement(
        BUSINESS_ID,
        owner,
        draft,
        'active',
        'staff-1',
      ),
      partnerService.transitionAgreement(
        BUSINESS_ID,
        owner,
        other,
        'active',
        'staff-1',
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const active = await adminFirestore
      .collection('partnerMachineAgreements')
      .where('businessId', '==', BUSINESS_ID)
      .where('machineId', '==', machineId)
      .where('status', '==', 'active')
      .get();
    expect(active.size).toBe(1);

    await expect(
      partnerService.transitionAgreement(
        BUSINESS_ID,
        owner,
        first,
        'active',
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(AgreementConflictError);
    await expect(
      partnerService.transitionAgreement(
        BUSINESS_ID,
        'someone-else',
        draft,
        'terminated',
        'staff-1',
      ),
    ).rejects.toThrow('Agreement not found');
  });
});

describe('machineService.reassignOwner', () => {
  it('waits for the active agreement to end, then records who owned it before and after', async () => {
    const oldOwner = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'Old',
      actor: 'staff-1',
    });
    const newOwner = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'New',
      actor: 'staff-1',
    });
    const machineId = await machineFor(oldOwner);
    const agreementId = await partnerService.createAgreement({
      businessId: BUSINESS_ID,
      partnerId: oldOwner,
      machineId,
      status: 'active',
      revenueSharePartnerPct: 50,
      operatingCostNote: null,
      effectiveFrom: null,
      documentRef: null,
      note: null,
      actor: 'staff-1',
    });

    await expect(
      machineService.reassignOwner(BUSINESS_ID, machineId, newOwner, 'staff-1'),
    ).rejects.toThrow('End that agreement first');
    await partnerService.transitionAgreement(
      BUSINESS_ID,
      oldOwner,
      agreementId,
      'terminated',
      'staff-1',
    );
    await expect(
      machineService.reassignOwner(BUSINESS_ID, machineId, oldOwner, 'staff-1'),
    ).rejects.toThrow('already belongs');

    await machineService.reassignOwner(
      BUSINESS_ID,
      machineId,
      newOwner,
      'staff-1',
      'Sold',
    );
    const machine = (await machineService.findById(
      BUSINESS_ID,
      machineId,
    )) as Machine;
    expect(machine.ownerPartnerId).toBe(newOwner);
    expect(machine.ownerSince).toBeTruthy();

    const history = await machineOwnershipHistoryRepository.listByMachine(
      BUSINESS_ID,
      machineId,
    );
    expect(
      history.map((entry) => [
        entry.partnerId,
        entry.effectiveTo === null,
        entry.reason,
      ]),
    ).toEqual([
      [oldOwner, false, 'Owner at registration'],
      [newOwner, true, 'Sold'],
    ]);

    // Back to Snack Quest: closes the new owner's entry, opens one with no owner.
    await machineService.reassignOwner(BUSINESS_ID, machineId, null, 'staff-1');
    const after = await machineOwnershipHistoryRepository.listByMachine(
      BUSINESS_ID,
      machineId,
    );
    expect(
      after.map((entry) => [entry.partnerId, entry.effectiveTo === null]),
    ).toEqual([
      [oldOwner, false],
      [newOwner, false],
      [null, true],
    ]);
  });

  it('refuses a suspended or unknown owner and a retired machine', async () => {
    const suspended = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'Suspended',
      actor: 'staff-1',
    });
    await partnerService.update(
      BUSINESS_ID,
      suspended,
      { status: 'suspended' },
      'staff-1',
    );
    const machineId = await machineFor(null);
    await expect(
      machineService.reassignOwner(
        BUSINESS_ID,
        machineId,
        suspended,
        'staff-1',
      ),
    ).rejects.toThrow('suspended');
    await expect(
      machineService.reassignOwner(
        BUSINESS_ID,
        machineId,
        'no-such-owner',
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(OwnerReassignmentError);
    await adminFirestore
      .collection('machines')
      .doc(machineId)
      .update({ status: 'decommissioned' });
    const active = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'Active',
      actor: 'staff-1',
    });
    await expect(
      machineService.reassignOwner(BUSINESS_ID, machineId, active, 'staff-1'),
    ).rejects.toThrow('retired');
  });
});

describe('settlements across a handover', () => {
  it('refuses a period that includes another owner’s time, and allows each owner’s own side of it', async () => {
    const oldOwner = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'Old',
      actor: 'staff-1',
    });
    const newOwner = await partnerService.create({
      businessId: BUSINESS_ID,
      name: 'New',
      actor: 'staff-1',
    });
    const machineId = await machineFor(oldOwner);
    await machineService.reassignOwner(
      BUSINESS_ID,
      machineId,
      newOwner,
      'staff-1',
    );
    const handover = (
      (await machineService.findById(BUSINESS_ID, machineId)) as Machine
    ).ownerSince!.toDate();
    const hour = 60 * 60 * 1000;
    const draft = (partnerId: string, start: Date, end: Date) =>
      machineSettlementService.createDraft({
        businessId: BUSINESS_ID,
        machineId,
        partnerId,
        periodStart: start,
        periodEnd: end,
        actor: 'staff-1',
      });

    await expect(
      draft(
        newOwner,
        new Date(handover.getTime() - 24 * hour),
        new Date(handover.getTime() + 24 * hour),
      ),
    ).rejects.toBeInstanceOf(OwnershipChangedDuringPeriodError);
    await expect(
      draft(
        oldOwner,
        new Date(handover.getTime() - 24 * hour),
        new Date(handover.getTime() + 24 * hour),
      ),
    ).rejects.toBeInstanceOf(OwnershipChangedDuringPeriodError);
    // Before registration counts as the first owner's, so a period starting earlier still settles to them.
    await expect(
      draft(
        oldOwner,
        new Date(handover.getTime() - 30 * 24 * hour),
        new Date(handover.getTime() - 1),
      ),
    ).resolves.toEqual(expect.any(String));
    await expect(
      draft(
        newOwner,
        new Date(handover.getTime() + 1000),
        new Date(handover.getTime() + 24 * hour),
      ),
    ).resolves.toEqual(expect.any(String));
    await expect(
      draft(
        newOwner,
        new Date(handover.getTime() - 30 * 24 * hour),
        new Date(handover.getTime() - 24 * hour),
      ),
    ).rejects.toBeInstanceOf(OwnershipChangedDuringPeriodError);
  });
});
