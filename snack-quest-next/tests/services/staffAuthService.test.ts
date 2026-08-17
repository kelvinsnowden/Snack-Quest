import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { userRepository } from '@/repositories/userRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { staffAuthService, StaffNotProvisionedError } from '@/services/staffAuthService';
import { getIdTokenForUid } from '../helpers/authEmulator';

/**
 * The real staff login handshake, end to end against the emulator: a
 * Firebase ID token (obtained the same way the real client SDK would
 * produce one) becomes a session cookie only when the uid is actually
 * provisioned staff — never on Firebase Auth success alone.
 */

const BUSINESS_ID = 'biz-staff-auth-test';
const createdUids: string[] = [];

async function cleanCollections() {
  for (const name of ['businesses', 'users', 'staffProfiles']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}

async function createAuthUser(email: string): Promise<string> {
  const record = await adminAuth.createUser({ email, password: 'test-password-123' });
  createdUids.push(record.uid);
  return record.uid;
}

beforeEach(async () => {
  await cleanCollections();
  await businessRepository.create(
    BUSINESS_ID,
    {
      name: 'Staff Auth Test Biz',
      currency: 'KES',
      whatsappPhoneNumberId: 'wa-staff-auth-test',
      countyCoverage: [],
      adminWhatsappPhone: null,
      whatsappCustomerNumber: null,
      status: 'active',
    },
    'system',
  );
});

afterEach(async () => {
  await Promise.all(
    createdUids.splice(0).map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)),
  );
});

describe('StaffAuthService.establishSession', () => {
  it('rejects an authenticated user with no users/{uid} or staffProfiles/{uid} at all', async () => {
    const uid = await createAuthUser('nobody@example.com');
    const idToken = await getIdTokenForUid(uid);

    await expect(staffAuthService.establishSession(idToken)).rejects.toBeInstanceOf(
      StaffNotProvisionedError,
    );
  });

  it('rejects a real user document with no matching staffProfiles doc', async () => {
    const uid = await createAuthUser('customer-only@example.com');
    await userRepository.create(
      uid,
      { email: 'customer-only@example.com', roles: ['customer'], displayName: 'Just A Customer', photoURL: null },
      uid,
    );
    const idToken = await getIdTokenForUid(uid);

    await expect(staffAuthService.establishSession(idToken)).rejects.toBeInstanceOf(
      StaffNotProvisionedError,
    );
  });

  it('establishes a real session for a provisioned staff account and syncs custom claims', async () => {
    const uid = await createAuthUser('agent@example.com');
    await userRepository.create(
      uid,
      { email: 'agent@example.com', roles: ['agent'], displayName: 'Amina Agent', photoURL: null },
      'system',
    );
    await staffRepository.create(
      uid,
      { businessId: BUSINESS_ID, role: 'agent', permissions: [], department: 'Sales' },
      'system',
    );
    const idToken = await getIdTokenForUid(uid);

    const { cookie, session } = await staffAuthService.establishSession(idToken);

    expect(cookie).toBeTruthy();
    expect(session).toEqual({
      uid,
      email: 'agent@example.com',
      displayName: 'Amina Agent',
      roles: ['agent'],
      businessId: BUSINESS_ID,
      permissions: [],
    });

    const authUser = await adminAuth.getUser(uid);
    expect(authUser.customClaims).toEqual({ roles: ['agent'], businessId: BUSINESS_ID });
  });

  it('carries a restricted admin\'s permissions through to the session (§ Staff access control)', async () => {
    const uid = await createAuthUser('restricted-admin@example.com');
    await userRepository.create(
      uid,
      { email: 'restricted-admin@example.com', roles: ['admin'], displayName: 'Restricted Admin', photoURL: null },
      'system',
    );
    await staffRepository.create(
      uid,
      { businessId: BUSINESS_ID, role: 'admin', permissions: ['orders', 'finance'], department: 'Ops' },
      'system',
    );
    const idToken = await getIdTokenForUid(uid);

    const { session } = await staffAuthService.establishSession(idToken);

    expect(session.permissions).toEqual(['orders', 'finance']);
  });

  it('rejects a deactivated staff account (deletedAt set) even with a valid ID token', async () => {
    const uid = await createAuthUser('deactivated@example.com');
    await userRepository.create(
      uid,
      { email: 'deactivated@example.com', roles: ['admin'], displayName: 'Former Admin', photoURL: null },
      'system',
    );
    await staffRepository.create(
      uid,
      { businessId: BUSINESS_ID, role: 'admin', permissions: [], department: 'Ops' },
      'system',
    );
    await adminFirestore.collection('staffProfiles').doc(uid).update({ deletedAt: new Date() });

    const idToken = await getIdTokenForUid(uid);
    await expect(staffAuthService.establishSession(idToken)).rejects.toBeInstanceOf(
      StaffNotProvisionedError,
    );
  });
});

describe('StaffAuthService.verifySessionCookie', () => {
  it('round-trips a cookie issued by establishSession back into the same session', async () => {
    const uid = await createAuthUser('super@example.com');
    await userRepository.create(
      uid,
      { email: 'super@example.com', roles: ['super_admin'], displayName: 'Superadmin', photoURL: null },
      'system',
    );
    await staffRepository.create(
      uid,
      { businessId: BUSINESS_ID, role: 'super_admin', permissions: [], department: 'Leadership' },
      'system',
    );
    const idToken = await getIdTokenForUid(uid);
    const { cookie } = await staffAuthService.establishSession(idToken);

    const verified = await staffAuthService.verifySessionCookie(cookie);
    expect(verified).toEqual({
      uid,
      email: 'super@example.com',
      displayName: 'Superadmin',
      roles: ['super_admin'],
      businessId: BUSINESS_ID,
      permissions: [],
    });
  });

  it('returns null for a garbage cookie value', async () => {
    await expect(staffAuthService.verifySessionCookie('not-a-real-cookie')).resolves.toBeNull();
  });

  it('returns null once the staff account is deactivated, even before the cookie expires', async () => {
    const uid = await createAuthUser('will-be-deactivated@example.com');
    await userRepository.create(
      uid,
      { email: 'will-be-deactivated@example.com', roles: ['warehouse'], displayName: 'Warehouse Worker', photoURL: null },
      'system',
    );
    await staffRepository.create(
      uid,
      { businessId: BUSINESS_ID, role: 'warehouse', permissions: [], department: 'Warehouse' },
      'system',
    );
    const idToken = await getIdTokenForUid(uid);
    const { cookie } = await staffAuthService.establishSession(idToken);

    expect(await staffAuthService.verifySessionCookie(cookie)).not.toBeNull();

    await adminFirestore.collection('staffProfiles').doc(uid).update({ deletedAt: new Date() });

    expect(await staffAuthService.verifySessionCookie(cookie)).toBeNull();
  });
});
