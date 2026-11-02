import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { partnerService } from '@/services/partnerService';
import { partnerAuthService } from '@/services/partnerAuthService';
import { PartnerPortalAccessService, PortalAccessError } from '@/services/partnerPortalAccessService';
import { partnerRepository } from '@/repositories/partnerRepository';

/**
 * The owner's way in: Snack Quest emails a link, they create a password with
 * it, then they sign in. Run against the Auth and Firestore emulators, and
 * proven by actually signing in with the new password.
 */

const BUSINESS_ID = getCurrentBusinessId();
const sent: { to: string; subject: string; body: string; html?: string }[] = [];
const service = new PartnerPortalAccessService({ send: async (input) => (sent.push(input), { providerMessageId: 'test' }) });
const run = Math.random().toString(36).slice(2, 8);
let n = 0;
const freshEmail = () => `owner-${run}-${(n += 1)}@example.com`;

const tokenFrom = (text: string) => text.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? '';

async function signIn(email: string, password: string): Promise<string | null> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return ((await response.json()) as { idToken?: string }).idToken ?? null;
}

async function owner(email: string | null, name = 'Amina Wanjiru') {
  return partnerService.create({ businessId: BUSINESS_ID, name, contactEmail: email, actor: 'staff-1' });
}

beforeEach(async () => {
  sent.length = 0;
  for (const collection of ['partners', 'partnerPortalTokens']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

describe('owner portal login: invite → create password → sign in', () => {
  it('sets up their login, emails a link, and the password made with it signs them in to their own account', async () => {
    const email = freshEmail();
    const partnerId = await owner(email);
    const invite = await service.sendInvite(BUSINESS_ID, partnerId, 'staff-1');

    expect(invite.emailed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].subject).toBe('Your Snack Quest Owner Portal login');
    expect(sent[0].body).toContain(`Your login email is ${email}.`);
    expect(sent[0].html).toContain('Create your password');
    const token = tokenFrom(sent[0].body);
    expect(invite.link).toContain(token);

    const described = await service.describeLink(token);
    expect(described).toMatchObject({ ok: true, email, name: 'Amina Wanjiru', purpose: 'invite' });

    await expect(service.setPassword(token, 'kahawa-2026')).resolves.toEqual({ email });
    const idToken = await signIn(email, 'kahawa-2026');
    expect(idToken).toBeTruthy();
    const { session } = await partnerAuthService.login(idToken!);
    expect(session.partnerId).toBe(partnerId);

    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.portalInviteSentAt).toBeTruthy();
    expect((await adminAuth.getUser(partner!.authUid!)).emailVerified).toBe(true);
  });

  it('a link creates a password once; a short password is refused and leaves the link usable', async () => {
    const email = freshEmail();
    await service.sendInvite(BUSINESS_ID, await owner(email), 'staff-1');
    const token = tokenFrom(sent[0].body);

    await expect(service.setPassword(token, 'short')).rejects.toThrow('at least 8 characters');
    await service.setPassword(token, 'first-password');
    await expect(service.setPassword(token, 'second-password')).rejects.toThrow('already been used');
    expect(await signIn(email, 'first-password')).toBeTruthy();
    expect(await signIn(email, 'second-password')).toBeNull();
  });

  it('an expired or made-up link is refused, with a reason the page can show', async () => {
    const email = freshEmail();
    await service.sendInvite(BUSINESS_ID, await owner(email), 'staff-1');
    const token = tokenFrom(sent[0].body);
    const stored = await adminFirestore.collection('partnerPortalTokens').where('businessId', '==', BUSINESS_ID).get();
    await stored.docs[0].ref.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });

    expect(await service.describeLink(token)).toMatchObject({ ok: false, problem: 'expired', email });
    await expect(service.setPassword(token, 'long-enough-1')).rejects.toThrow('expired');
    expect(await service.describeLink('not-a-real-token')).toMatchObject({ ok: false, problem: 'not_found' });
  });

  it('an email that already has a Snack Quest login (staff, say) is attached, not duplicated', async () => {
    const email = freshEmail();
    const existing = await adminAuth.createUser({ email, password: 'staff-password-1' });
    const partnerId = await owner(email);
    await service.sendInvite(BUSINESS_ID, partnerId, 'staff-1');
    expect((await partnerRepository.findById(BUSINESS_ID, partnerId))?.authUid).toBe(existing.uid);
  });

  it('when staff change the owner’s email, their login email follows', async () => {
    const before = freshEmail();
    const after = freshEmail();
    const partnerId = await owner(before);
    await service.sendInvite(BUSINESS_ID, partnerId, 'staff-1');
    await partnerRepository.update(partnerId, { contactEmail: after }, 'staff-1');
    await service.sendInvite(BUSINESS_ID, partnerId, 'staff-1');
    const uid = (await partnerRepository.findById(BUSINESS_ID, partnerId))!.authUid!;
    expect((await adminAuth.getUser(uid)).email).toBe(after);
    expect(sent[1].to).toBe(after);
  });

  it('refuses an owner with no email, or a suspended one', async () => {
    await expect(service.sendInvite(BUSINESS_ID, await owner(null), 'staff-1')).rejects.toBeInstanceOf(PortalAccessError);
    const suspended = await owner(freshEmail(), 'Suspended Owner');
    await partnerRepository.update(suspended, { status: 'suspended' }, 'staff-1');
    await expect(service.sendInvite(BUSINESS_ID, suspended, 'staff-1')).rejects.toThrow('suspended');
  });
});

describe('“First time, or forgot your password?”', () => {
  it('emails a link to an owner’s email on file, in any capitals, and the link works', async () => {
    const email = freshEmail();
    await owner(email);
    await service.requestLink(BUSINESS_ID, email.toUpperCase());
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    await service.setPassword(tokenFrom(sent[0].body), 'from-the-sign-in-page');
    expect(await signIn(email, 'from-the-sign-in-page')).toBeTruthy();
  });

  it('a signed-up owner who forgot their password gets a reset link, not an invitation', async () => {
    const email = freshEmail();
    await service.sendInvite(BUSINESS_ID, await owner(email), 'staff-1');
    await service.setPassword(tokenFrom(sent[0].body), 'original-password');
    await service.requestLink(BUSINESS_ID, email);
    expect(sent[1].subject).toBe('Set a new Owner Portal password');
    await service.setPassword(tokenFrom(sent[1].body), 'brand-new-password');
    expect(await signIn(email, 'brand-new-password')).toBeTruthy();
    expect(await signIn(email, 'original-password')).toBeNull();
  });

  it('sends nothing, and says nothing, for an email that isn’t an active owner’s', async () => {
    await service.requestLink(BUSINESS_ID, 'nobody-here@example.com');
    const suspended = freshEmail();
    const partnerId = await owner(suspended);
    await partnerRepository.update(partnerId, { status: 'suspended' }, 'staff-1');
    await service.requestLink(BUSINESS_ID, suspended);
    expect(sent).toHaveLength(0);
  });
});
