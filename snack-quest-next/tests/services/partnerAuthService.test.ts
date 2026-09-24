import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { partnerRepository } from '@/repositories/partnerRepository';
import { partnerAuthService, PartnerAlreadyClaimedError, PartnerNotProvisionedError } from '@/services/partnerAuthService';
import { getIdTokenForUid } from '../helpers/authEmulator';

/**
 * The Owner Portal's real sign-up/sign-in handshake, end to end
 * against the emulator (§ PART 2 — OWNER PORTAL, § PART 8 —
 * SECURITY) — mirrors tests/services/creatorAuthService.test.ts's
 * structure, proving the one thing that's different for a partner: a
 * partner always exists first (staff-created, by `contactEmail`), so
 * `register()` is a *claim* against an existing record, never a
 * creation, and can never let a second account steal an
 * already-claimed one or invent a partner that was never provisioned.
 */

const BUSINESS_ID = 'snack-quest';
const createdUids: string[] = [];

async function cleanCollections() {
  await adminFirestore.recursiveDelete(adminFirestore.collection('partners'));
}

async function createAuthUser(email: string): Promise<string> {
  const record = await adminAuth.createUser({ email, password: 'test-password-123' });
  createdUids.push(record.uid);
  return record.uid;
}

async function createPartner(name: string, contactEmail: string | null): Promise<string> {
  return partnerRepository.create({
    businessId: BUSINESS_ID,
    name,
    contactEmail,
    contactPhone: null,
    status: 'active',
    note: null,
    authUid: null,
    availableCashKes: 0,
    lifetimeEarnedKes: 0,
    createdBy: 'staff-1',
  });
}

const ORIGINAL_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID;

beforeEach(async () => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  await cleanCollections();
});

afterEach(async () => {
  if (ORIGINAL_BUSINESS_ID === undefined) {
    delete process.env.SNACK_QUEST_BUSINESS_ID;
  } else {
    process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL_BUSINESS_ID;
  }
  await Promise.all(createdUids.splice(0).map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)));
});

describe('PartnerAuthService.register', () => {
  it('claims the one unclaimed partner record whose contactEmail matches the Firebase Auth account', async () => {
    const partnerId = await createPartner('Owner One', 'owner-one@example.com');
    const uid = await createAuthUser('owner-one@example.com');
    const idToken = await getIdTokenForUid(uid);

    const { session } = await partnerAuthService.register(idToken);
    expect(session.partnerId).toBe(partnerId);
    expect(session.uid).toBe(uid);

    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.authUid).toBe(uid);
  });

  it('refuses to claim a partner that no longer exists unclaimed — no email match at all', async () => {
    const uid = await createAuthUser('nobody@example.com');
    const idToken = await getIdTokenForUid(uid);

    await expect(partnerAuthService.register(idToken)).rejects.toBeInstanceOf(PartnerAlreadyClaimedError);
  });

  it('never lets a second account claim a partner someone else already claimed', async () => {
    await createPartner('Owner Two', 'owner-two@example.com');
    const firstUid = await createAuthUser('owner-two@example.com');
    await partnerAuthService.register(await getIdTokenForUid(firstUid));

    // A second, distinct Firebase Auth account happens to share the same email domain scenario —
    // simulate by creating another user, then manually retrying register with a token for a
    // *different* uid but same email is not directly possible via Firebase Auth (emails are unique),
    // so instead prove the already-claimed partner no longer appears as unclaimed at all.
    const stillUnclaimed = await partnerRepository.findUnclaimedByContactEmail(BUSINESS_ID, 'owner-two@example.com');
    expect(stillUnclaimed).toBeNull();
  });

  it('is idempotent — calling register again with the same already-linked account succeeds and returns the same partner', async () => {
    const partnerId = await createPartner('Owner Three', 'owner-three@example.com');
    const uid = await createAuthUser('owner-three@example.com');
    const idToken = await getIdTokenForUid(uid);

    await partnerAuthService.register(idToken);
    const second = await partnerAuthService.register(await getIdTokenForUid(uid));
    expect(second.session.partnerId).toBe(partnerId);
  });

  it('scopes the claim to the current business — a matching email in another business is never claimed', async () => {
    await partnerRepository.create({
      businessId: 'rival-snacks',
      name: 'Rival Owner',
      contactEmail: 'cross-business@example.com',
      contactPhone: null,
      status: 'active',
      note: null,
      authUid: null,
      availableCashKes: 0,
      lifetimeEarnedKes: 0,
      createdBy: 'staff-1',
    });
    const uid = await createAuthUser('cross-business@example.com');
    const idToken = await getIdTokenForUid(uid);

    await expect(partnerAuthService.register(idToken)).rejects.toBeInstanceOf(PartnerAlreadyClaimedError);
  });
});

describe('PartnerAuthService.login', () => {
  it('signs in an already-claimed partner', async () => {
    const partnerId = await createPartner('Owner Four', 'owner-four@example.com');
    const uid = await createAuthUser('owner-four@example.com');
    await partnerAuthService.register(await getIdTokenForUid(uid));

    const { session } = await partnerAuthService.login(await getIdTokenForUid(uid));
    expect(session.partnerId).toBe(partnerId);
  });

  it('refuses to sign in an account that never claimed a partner', async () => {
    const uid = await createAuthUser('unclaimed@example.com');
    await expect(partnerAuthService.login(await getIdTokenForUid(uid))).rejects.toBeInstanceOf(PartnerNotProvisionedError);
  });
});

describe('PartnerAuthService.verifySessionCookie', () => {
  it('returns null once the partner is suspended, even with a still-valid cookie', async () => {
    const partnerId = await createPartner('Owner Five', 'owner-five@example.com');
    const uid = await createAuthUser('owner-five@example.com');
    const { cookie } = await partnerAuthService.register(await getIdTokenForUid(uid));

    expect(await partnerAuthService.verifySessionCookie(cookie)).not.toBeNull();
    await adminFirestore.collection('partners').doc(partnerId).update({ status: 'suspended' });
    expect(await partnerAuthService.verifySessionCookie(cookie)).toBeNull();
  });

  it('returns null for garbage input', async () => {
    expect(await partnerAuthService.verifySessionCookie('not-a-real-cookie')).toBeNull();
  });
});
