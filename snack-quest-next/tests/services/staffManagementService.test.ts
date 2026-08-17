import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { userRepository } from '@/repositories/userRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { staffAuthService } from '@/services/staffAuthService';
import {
  staffManagementService,
  StaffValidationError,
  StaffAlreadyExistsError,
  StaffNotFoundError,
  CannotModifySelfError,
  LastSuperAdminError,
} from '@/services/staffManagementService';
import { getIdTokenForUid } from '../helpers/authEmulator';

const BUSINESS_ID = 'biz-staff-mgmt-test';
const createdUids: string[] = [];

async function cleanCollections() {
  for (const name of ['businesses', 'users', 'staffProfiles']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}

async function seedStaff(email: string, role: 'super_admin' | 'admin' | 'agent', displayName = 'Test Staff') {
  const record = await adminAuth.createUser({ email, password: 'test-password-123' });
  createdUids.push(record.uid);
  await userRepository.create(record.uid, { email, roles: [role], displayName, photoURL: null }, 'system');
  await staffRepository.create(record.uid, { businessId: BUSINESS_ID, role, permissions: [], department: 'Ops' }, 'system');
  return record.uid;
}

beforeEach(async () => {
  await cleanCollections();
  await businessRepository.create(
    BUSINESS_ID,
    {
      name: 'Staff Mgmt Test Biz',
      currency: 'KES',
      whatsappPhoneNumberId: 'wa-staff-mgmt-test',
      countyCoverage: [],
      adminWhatsappPhone: null,
      whatsappCustomerNumber: null,
      status: 'active',
    },
    'system',
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(createdUids.splice(0).map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)));
});

describe('StaffManagementService.listStaff', () => {
  it('lists staff with real Auth-sourced disabled/lastSignInAt fields', async () => {
    const uid = await seedStaff('list-test@example.com', 'admin', 'Ada Admin');

    const staff = await staffManagementService.listStaff(BUSINESS_ID);
    expect(staff).toHaveLength(1);
    expect(staff[0]).toMatchObject({ uid, email: 'list-test@example.com', displayName: 'Ada Admin', role: 'admin', disabled: false });
  });

  it('returns an empty list for a business with no staff', async () => {
    expect(await staffManagementService.listStaff('biz-no-staff')).toEqual([]);
  });
});

describe('StaffManagementService.inviteStaff', () => {
  it('creates a real Auth user, Firestore docs, and a working reset link', async () => {
    const result = await staffManagementService.inviteStaff(
      BUSINESS_ID,
      { email: 'new-staff@example.com', displayName: 'New Staff', role: 'agent', department: 'Sales' },
      'inviter-uid',
    );
    createdUids.push(result.uid);

    expect(result.resetLink).toMatch(/^https?:\/\//);

    const authRecord = await adminAuth.getUser(result.uid);
    expect(authRecord.email).toBe('new-staff@example.com');
    expect(authRecord.customClaims?.roles).toEqual(['agent']);

    const profile = await staffRepository.findById(result.uid);
    expect(profile?.role).toBe('agent');
    expect(profile?.department).toBe('Sales');

    const user = await userRepository.findById(result.uid);
    expect(user?.roles).toEqual(['agent']);
  });

  it('attaches a staff role to an existing (e.g. customer) account without overwriting their identity doc', async () => {
    const record = await adminAuth.createUser({ email: 'was-customer@example.com', password: 'test-password-123' });
    createdUids.push(record.uid);
    await userRepository.create(
      record.uid,
      { email: 'was-customer@example.com', roles: ['customer'], displayName: 'Existing Person', photoURL: null },
      'system',
    );

    const result = await staffManagementService.inviteStaff(
      BUSINESS_ID,
      { email: 'was-customer@example.com', displayName: 'ignored', role: 'finance', department: 'Finance' },
      'inviter-uid',
    );

    expect(result.uid).toBe(record.uid);
    const user = await userRepository.findById(record.uid);
    expect(user?.roles.sort()).toEqual(['customer', 'finance']);
    expect(user?.displayName).toBe('Existing Person'); // never overwritten
  });

  it('reactivates a previously removed staffer on re-invite, so they can actually sign back in', async () => {
    const uid = await seedStaff('re-invited@example.com', 'agent');
    await staffManagementService.removeStaff(BUSINESS_ID, uid, 'inviter-uid');

    // Removed: not provisioned, and the Auth account is disabled —
    // confirms the "before" state this test is guarding against.
    expect(await staffRepository.findById(uid)).toBeNull();
    expect((await adminAuth.getUser(uid)).disabled).toBe(true);

    const result = await staffManagementService.inviteStaff(
      BUSINESS_ID,
      { email: 're-invited@example.com', displayName: 'Re-Invited', role: 'agent', department: 'Ops' },
      'inviter-uid',
    );
    expect(result.uid).toBe(uid);

    const authRecord = await adminAuth.getUser(uid);
    expect(authRecord.disabled).toBe(false);

    const user = await userRepository.findById(uid);
    expect(user?.deletedAt).toBeNull();

    const profile = await staffRepository.findById(uid);
    expect(profile).not.toBeNull();

    // The real end-to-end proof: a fresh sign-in for this uid must
    // actually establish a session, not throw StaffNotProvisionedError
    // the way it did before this account was reactivated correctly.
    const idToken = await getIdTokenForUid(uid);
    const { session } = await staffAuthService.establishSession(idToken);
    expect(session.uid).toBe(uid);
  });

  it('rejects inviting someone who is already staff', async () => {
    await seedStaff('already-staff@example.com', 'admin');

    await expect(
      staffManagementService.inviteStaff(
        BUSINESS_ID,
        { email: 'already-staff@example.com', displayName: 'X', role: 'agent', department: 'Ops' },
        'inviter-uid',
      ),
    ).rejects.toBeInstanceOf(StaffAlreadyExistsError);
  });

  it('rejects an invalid email', async () => {
    await expect(
      staffManagementService.inviteStaff(
        BUSINESS_ID,
        { email: 'not-an-email', displayName: 'X', role: 'agent', department: 'Ops' },
        'inviter-uid',
      ),
    ).rejects.toBeInstanceOf(StaffValidationError);
  });

  it('rejects an invalid role', async () => {
    await expect(
      staffManagementService.inviteStaff(
        BUSINESS_ID,
        { email: 'valid@example.com', displayName: 'X', role: 'ceo' as never, department: 'Ops' },
        'inviter-uid',
      ),
    ).rejects.toBeInstanceOf(StaffValidationError);
  });

  it('defaults to unrestricted (empty permissions) when none are given', async () => {
    const result = await staffManagementService.inviteStaff(
      BUSINESS_ID,
      { email: 'unrestricted@example.com', displayName: 'X', role: 'admin', department: 'Ops' },
      'inviter-uid',
    );
    createdUids.push(result.uid);

    expect((await staffRepository.findById(result.uid))?.permissions).toEqual([]);
  });

  it('stores a real, restricted set of sections when given', async () => {
    const result = await staffManagementService.inviteStaff(
      BUSINESS_ID,
      { email: 'restricted@example.com', displayName: 'X', role: 'admin', department: 'Ops', permissions: ['orders', 'finance'] },
      'inviter-uid',
    );
    createdUids.push(result.uid);

    expect((await staffRepository.findById(result.uid))?.permissions).toEqual(['orders', 'finance']);
  });

  it('rejects an unknown section in permissions', async () => {
    await expect(
      staffManagementService.inviteStaff(
        BUSINESS_ID,
        { email: 'bad-permissions@example.com', displayName: 'X', role: 'admin', department: 'Ops', permissions: ['not-a-real-section'] },
        'inviter-uid',
      ),
    ).rejects.toBeInstanceOf(StaffValidationError);
  });
});

describe('StaffManagementService.changePermissions', () => {
  it('restricts an unrestricted admin to specific sections', async () => {
    const uid = await seedStaff('restrict-me@example.com', 'admin');

    await staffManagementService.changePermissions(BUSINESS_ID, uid, ['orders'], 'actor-uid');

    expect((await staffRepository.findById(uid))?.permissions).toEqual(['orders']);
  });

  it('clears restrictions back to unrestricted with an empty array', async () => {
    const uid = await seedStaff('unrestrict-me@example.com', 'admin');
    await staffManagementService.changePermissions(BUSINESS_ID, uid, ['orders'], 'actor-uid');

    await staffManagementService.changePermissions(BUSINESS_ID, uid, [], 'actor-uid');

    expect((await staffRepository.findById(uid))?.permissions).toEqual([]);
  });

  it('rejects an unknown section', async () => {
    const uid = await seedStaff('bad-section@example.com', 'admin');
    await expect(
      staffManagementService.changePermissions(BUSINESS_ID, uid, ['not-a-real-section'], 'actor-uid'),
    ).rejects.toBeInstanceOf(StaffValidationError);
  });

  it('throws StaffNotFoundError for a uid not on this business', async () => {
    await expect(
      staffManagementService.changePermissions(BUSINESS_ID, 'nonexistent-uid', ['orders'], 'actor-uid'),
    ).rejects.toBeInstanceOf(StaffNotFoundError);
  });
});

describe('StaffManagementService.changeRole', () => {
  it('updates staffProfile.role, users.roles, and Auth custom claims together', async () => {
    const uid = await seedStaff('promote-me@example.com', 'agent');

    await staffManagementService.changeRole(BUSINESS_ID, uid, 'admin', 'actor-uid');

    expect((await staffRepository.findById(uid))?.role).toBe('admin');
    expect((await userRepository.findById(uid))?.roles).toEqual(['admin']);
    const authRecord = await adminAuth.getUser(uid);
    expect(authRecord.customClaims?.roles).toEqual(['admin']);
  });

  it('refuses to let a super admin change their own role', async () => {
    const uid = await seedStaff('self-change@example.com', 'super_admin');
    await expect(staffManagementService.changeRole(BUSINESS_ID, uid, 'admin', uid)).rejects.toBeInstanceOf(
      CannotModifySelfError,
    );
  });

  it('refuses to demote the last super admin', async () => {
    const uid = await seedStaff('only-super-admin@example.com', 'super_admin');
    await expect(staffManagementService.changeRole(BUSINESS_ID, uid, 'admin', 'other-actor-uid')).rejects.toBeInstanceOf(
      LastSuperAdminError,
    );
  });

  it('allows demoting a super admin when another one exists', async () => {
    const uid = await seedStaff('demote-me@example.com', 'super_admin');
    await seedStaff('other-super-admin@example.com', 'super_admin');

    await staffManagementService.changeRole(BUSINESS_ID, uid, 'admin', 'other-actor-uid');
    expect((await staffRepository.findById(uid))?.role).toBe('admin');
  });

  it('throws StaffNotFoundError for a uid not on this business', async () => {
    await expect(staffManagementService.changeRole(BUSINESS_ID, 'nonexistent-uid', 'admin', 'actor-uid')).rejects.toBeInstanceOf(
      StaffNotFoundError,
    );
  });
});

describe('StaffManagementService.setDisabled', () => {
  it('disables and reactivates an Auth account', async () => {
    const uid = await seedStaff('disable-me@example.com', 'agent');

    await staffManagementService.setDisabled(BUSINESS_ID, uid, true, 'actor-uid');
    expect((await adminAuth.getUser(uid)).disabled).toBe(true);

    await staffManagementService.setDisabled(BUSINESS_ID, uid, false, 'actor-uid');
    expect((await adminAuth.getUser(uid)).disabled).toBe(false);
  });

  it('refuses to let a staff member disable themselves', async () => {
    const uid = await seedStaff('self-disable@example.com', 'admin');
    await expect(staffManagementService.setDisabled(BUSINESS_ID, uid, true, uid)).rejects.toBeInstanceOf(CannotModifySelfError);
  });

  it('refuses to disable the last super admin', async () => {
    const uid = await seedStaff('last-super-disable@example.com', 'super_admin');
    await expect(staffManagementService.setDisabled(BUSINESS_ID, uid, true, 'other-actor-uid')).rejects.toBeInstanceOf(
      LastSuperAdminError,
    );
  });
});

describe('StaffManagementService.removeStaff', () => {
  it('soft-deletes the profile/user and disables the Auth account', async () => {
    const uid = await seedStaff('remove-me@example.com', 'agent');

    await staffManagementService.removeStaff(BUSINESS_ID, uid, 'actor-uid');

    expect(await staffRepository.findById(uid)).toBeNull();
    const authRecord = await adminAuth.getUser(uid);
    expect(authRecord.disabled).toBe(true);
  });

  it('refuses to remove the last super admin', async () => {
    const uid = await seedStaff('last-super-remove@example.com', 'super_admin');
    await expect(staffManagementService.removeStaff(BUSINESS_ID, uid, 'other-actor-uid')).rejects.toBeInstanceOf(
      LastSuperAdminError,
    );
  });

  it('refuses to let a staff member remove themselves', async () => {
    const uid = await seedStaff('self-remove@example.com', 'admin');
    await expect(staffManagementService.removeStaff(BUSINESS_ID, uid, uid)).rejects.toBeInstanceOf(CannotModifySelfError);
  });
});

describe('StaffManagementService.resetPassword', () => {
  it('generates a working reset link for an existing staff member', async () => {
    const uid = await seedStaff('reset-me@example.com', 'agent');
    const { resetLink } = await staffManagementService.resetPassword(BUSINESS_ID, uid);
    expect(resetLink).toMatch(/^https?:\/\//);
  });

  it('throws StaffNotFoundError for a uid on a different business', async () => {
    const uid = await seedStaff('wrong-business@example.com', 'agent');
    await expect(staffManagementService.resetPassword('some-other-biz', uid)).rejects.toBeInstanceOf(StaffNotFoundError);
  });
});
