import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  audit: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  listByBusiness: vi.fn(),
  listAgreements: vi.fn(),
  createAgreement: vi.fn(),
  transitionAgreement: vi.fn(),
  reassignOwner: vi.fn(),
  findById: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: mocks.session,
}));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: mocks.audit }));
vi.mock('@/services/partnerService', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/partnerService')
  >('@/services/partnerService');
  return {
    ...actual,
    partnerService: {
      create: mocks.create,
      update: mocks.update,
      listByBusiness: mocks.listByBusiness,
      listAgreements: mocks.listAgreements,
      createAgreement: mocks.createAgreement,
      transitionAgreement: mocks.transitionAgreement,
    },
  };
});
vi.mock('@/services/machineService', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/machineService')
  >('@/services/machineService');
  return {
    ...actual,
    machineService: {
      reassignOwner: mocks.reassignOwner,
      findById: mocks.findById,
    },
  };
});

import {
  GET as listOwners,
  POST as createOwner,
} from '@/app/api/vending/partners/route';
import { PATCH as updateOwner } from '@/app/api/vending/partners/[partnerId]/route';
import {
  GET as listAgreements,
  POST as createAgreement,
} from '@/app/api/vending/partners/[partnerId]/agreements/route';
import { PATCH as changeAgreement } from '@/app/api/vending/partners/[partnerId]/agreements/[agreementId]/route';
import { PATCH as changeOwner } from '@/app/api/vending/machines/[id]/owner/route';
import { PartnerValidationError } from '@/services/partnerService';
import { OwnerReassignmentError } from '@/services/machineService';
import { AgreementConflictError } from '@/repositories/partnerMachineAgreementRepository';

/** Owner management: `owners.view` reads, `owners.manage` writes, every write audited, and business rules surface as clear 4xx errors. */

const staff = (permissions: string[]) => ({
  uid: 'staff-1',
  email: 's@example.com',
  displayName: 'S',
  roles: ['admin'],
  businessId: 'biz-1',
  permissions: [],
  effectivePermissions: permissions,
});
const VIEWER = staff(['owners.view']);
const MANAGER = staff(['owners.view', 'owners.manage']);
const json = (body: unknown, method = 'POST') =>
  new Request('http://localhost/x', { method, body: JSON.stringify(body) });
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listByBusiness.mockResolvedValue([
    {
      id: 'p1',
      data: {
        name: 'Owner',
        status: 'active',
        contactEmail: 'o@example.com',
        contactPhone: null,
        authUid: null,
        availableCashKes: 999,
      },
    },
  ]);
  mocks.listAgreements.mockResolvedValue([]);
  mocks.create.mockResolvedValue('p-new');
  mocks.update.mockResolvedValue({
    before: { name: 'Old', status: 'active' },
    after: { name: 'New', status: 'suspended' },
  });
  mocks.createAgreement.mockResolvedValue('a-new');
  mocks.transitionAgreement.mockResolvedValue({
    status: 'terminated',
    machineId: 'm1',
  });
  mocks.findById.mockResolvedValue({ ownerPartnerId: 'p1' });
});

describe('owner routes', () => {
  it('401 signed out; reads need owners.view, writes need owners.manage', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await listOwners(new Request('http://localhost/x'))).status).toBe(
      401,
    );

    mocks.session.mockResolvedValue(staff([]));
    expect(
      (await (await listOwners(new Request('http://localhost/x'))).json())
        .permission,
    ).toBe('owners.view');
    expect(
      (
        await listAgreements(
          new Request('http://localhost/x'),
          params({ partnerId: 'p1' }),
        )
      ).status,
    ).toBe(403);

    mocks.session.mockResolvedValue(VIEWER);
    expect((await listOwners(new Request('http://localhost/x'))).status).toBe(
      200,
    );
    for (const response of [
      await createOwner(json({ name: 'X' })),
      await updateOwner(
        json({ name: 'X' }, 'PATCH'),
        params({ partnerId: 'p1' }),
      ),
      await createAgreement(
        json({ machineId: 'm1' }),
        params({ partnerId: 'p1' }),
      ),
      await changeAgreement(
        json({ status: 'terminated' }, 'PATCH'),
        params({ partnerId: 'p1', agreementId: 'a1' }),
      ),
      await changeOwner(
        json({ partnerId: 'p2' }, 'PATCH'),
        params({ id: 'm1' }),
      ),
    ]) {
      expect(response.status).toBe(403);
      expect((await response.json()).permission).toBe('owners.manage');
    }
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.createAgreement).not.toHaveBeenCalled();
    expect(mocks.transitionAgreement).not.toHaveBeenCalled();
    expect(mocks.reassignOwner).not.toHaveBeenCalled();
  });

  it('never lists wallet balances, only whether the owner has signed up', async () => {
    mocks.session.mockResolvedValue(VIEWER);
    const body = await (
      await listOwners(new Request('http://localhost/x'))
    ).json();
    expect(body.partners[0]).toEqual({
      id: 'p1',
      name: 'Owner',
      status: 'active',
      contactEmail: 'o@example.com',
      contactPhone: null,
      portalClaimed: false,
    });
  });

  it('creates and edits in the session’s business, audits, and returns validation messages as 400', async () => {
    mocks.session.mockResolvedValue(MANAGER);
    expect(
      (await createOwner(json({ name: 'New', contactEmail: 'n@example.com' })))
        .status,
    ).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        name: 'New',
        contactEmail: 'n@example.com',
        actor: 'staff-1',
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        action: 'create_machine_owner',
        entityId: 'p-new',
      }),
    );

    expect((await createOwner(json({ name: 5 }))).status).toBe(400);
    mocks.create.mockRejectedValueOnce(
      new PartnerValidationError('Another owner (X) already uses that email.'),
    );
    const clash = await createOwner(
      json({ name: 'Dup', contactEmail: 'n@example.com' }),
    );
    expect(clash.status).toBe(400);
    expect((await clash.json()).error).toContain('already uses');

    expect(
      (
        await updateOwner(
          json({ name: 'New', status: 'suspended' }, 'PATCH'),
          params({ partnerId: 'p1' }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      'biz-1',
      'p1',
      { name: 'New', status: 'suspended' },
      'staff-1',
    );
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.any(Request),
      expect.objectContaining({
        action: 'suspend_machine_owner',
        before: { name: 'Old', status: 'active' },
        after: { name: 'New', status: 'suspended' },
      }),
    );
    expect(
      (
        await updateOwner(
          json({ status: null }, 'PATCH'),
          params({ partnerId: 'p1' }),
        )
      ).status,
    ).toBe(400);
    // Money and login fields are simply not accepted.
    await updateOwner(
      json({ availableCashKes: 1e6, authUid: 'x', name: 'Y' }, 'PATCH'),
      params({ partnerId: 'p1' }),
    );
    expect(mocks.update).toHaveBeenLastCalledWith(
      'biz-1',
      'p1',
      { name: 'Y' },
      'staff-1',
    );
  });

  it('records and changes agreements, mapping a second active agreement to 409', async () => {
    mocks.session.mockResolvedValue(MANAGER);
    expect(
      (
        await createAgreement(
          json({
            machineId: 'm1',
            status: 'active',
            revenueSharePartnerPct: 40,
          }),
          params({ partnerId: 'p1' }),
        )
      ).status,
    ).toBe(201);
    expect(mocks.createAgreement).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        partnerId: 'p1',
        machineId: 'm1',
        status: 'active',
        revenueSharePartnerPct: 40,
      }),
    );
    expect(
      (
        await createAgreement(
          json({ machineId: 'm1', status: 'terminated' }),
          params({ partnerId: 'p1' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createAgreement(
          json({ machineId: 'm1', revenueSharePartnerPct: '40' }),
          params({ partnerId: 'p1' }),
        )
      ).status,
    ).toBe(400);
    mocks.createAgreement.mockRejectedValueOnce(
      new AgreementConflictError('already has an active agreement'),
    );
    expect(
      (
        await createAgreement(
          json({ machineId: 'm1', status: 'active' }),
          params({ partnerId: 'p1' }),
        )
      ).status,
    ).toBe(409);

    expect(
      (
        await changeAgreement(
          json({ status: 'terminated' }, 'PATCH'),
          params({ partnerId: 'p1', agreementId: 'a1' }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.any(Request),
      expect.objectContaining({
        action: 'end_owner_agreement',
        entityId: 'a1',
        machineId: 'm1',
      }),
    );
    expect(
      (
        await changeAgreement(
          json({ status: 'draft' }, 'PATCH'),
          params({ partnerId: 'p1', agreementId: 'a1' }),
        )
      ).status,
    ).toBe(400);
  });

  it('hands a machine over, audits old and new owner, and 409s when the service refuses', async () => {
    mocks.session.mockResolvedValue(MANAGER);
    expect(
      (
        await changeOwner(
          json({ partnerId: 'p2', reason: ' Sold ' }, 'PATCH'),
          params({ id: 'm1' }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.reassignOwner).toHaveBeenCalledWith(
      'biz-1',
      'm1',
      'p2',
      'staff-1',
      'Sold',
    );
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.any(Request),
      expect.objectContaining({
        action: 'reassign_machine_owner',
        before: { ownerPartnerId: 'p1' },
        after: { ownerPartnerId: 'p2', reason: 'Sold' },
      }),
    );
    expect(
      (
        await changeOwner(
          json({ partnerId: null }, 'PATCH'),
          params({ id: 'm1' }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await changeOwner(json({ partnerId: 7 }, 'PATCH'), params({ id: 'm1' })))
        .status,
    ).toBe(400);
    mocks.reassignOwner.mockRejectedValueOnce(
      new OwnerReassignmentError('End that agreement first.'),
    );
    expect(
      (
        await changeOwner(
          json({ partnerId: 'p2' }, 'PATCH'),
          params({ id: 'm1' }),
        )
      ).status,
    ).toBe(409);
    mocks.findById.mockResolvedValueOnce(null);
    expect(
      (
        await changeOwner(
          json({ partnerId: 'p2' }, 'PATCH'),
          params({ id: 'missing' }),
        )
      ).status,
    ).toBe(404);
  });
});
