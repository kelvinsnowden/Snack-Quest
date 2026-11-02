import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth } from '@/lib/firebase/admin';
import { partnerRepository } from '@/repositories/partnerRepository';
import { partnerPortalTokenRepository, type PartnerPortalTokenPurpose } from '@/repositories/partnerPortalTokenRepository';
import { smtpEmailGateway } from '@/lib/integrations/email/smtpEmailGateway';
import { brandedEmailHtml, escapeHtml } from '@/lib/notifications/brandedEmailHtml';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { logger } from '@/lib/observability/logger';
import type { EmailGateway } from '@/lib/integrations/types';
import type { Partner } from '@/types';

/** An invitation can sit in an inbox for a week; a link asked for from the sign-in page is used straight away. */
const LIFETIME_MS: Record<PartnerPortalTokenPurpose, number> = { invite: 7 * 24 * 60 * 60 * 1000, reset: 24 * 60 * 60 * 1000 };
export const MIN_PASSWORD_LENGTH = 8;

/** Something the person can act on, in words they can read. */
export class PortalAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalAccessError';
  }
}

/** Why a link can't be used, so the page can say so and offer a new one. */
export type LinkProblem = 'not_found' | 'used' | 'expired' | 'suspended';

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');
const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * How an owner gets into the Owner Portal: Snack Quest emails them a link,
 * they create a password with it, then sign in with their email and that
 * password.
 *
 * Staff send the link from the owner's page (and it goes out when an owner
 * is created with an email); an owner who lost it, or forgot their
 * password, asks for a new one from the sign-in page. The link is the only
 * way to set a password, so only someone who can open the owner's email can
 * — unlike the old sign-up, where anyone who knew an owner's email could
 * claim the account first.
 *
 * The login is a plain Firebase Auth account. If the email already has one
 * (a staff or customer login, say), the owner record is attached to it and
 * the link sets its password.
 */
class PartnerPortalAccessService {
  constructor(private readonly email: EmailGateway = smtpEmailGateway) {}

  /** Staff: make sure the owner has a login, and email them a link to create its password. The link comes back too, to send another way if the email doesn't arrive. */
  async sendInvite(businessId: string, partnerId: string, actor: string): Promise<{ email: string; emailed: boolean; link: string }> {
    const partner = await partnerRepository.findById(businessId, partnerId);
    if (!partner || partner.deletedAt) throw new PortalAccessError('That owner doesn’t exist.');
    if (partner.status !== 'active') throw new PortalAccessError('This owner is suspended. Reactivate them before sending a login.');
    if (!partner.contactEmail) throw new PortalAccessError('Add the owner’s email first — it’s what they sign in with.');
    const { uid, email } = await this.ensureLogin(businessId, partnerId, partner);
    const link = await this.issueLink(businessId, partnerId, uid, email, 'invite', actor);
    const emailed = await this.sendLinkEmail(businessId, email, partner.name, link, 'invite');
    await partnerRepository.recordPortalInvite(partnerId);
    return { email, emailed, link };
  }

  /**
   * From the sign-in page: email a link to set a password, if this is an
   * active owner's email. Says nothing either way, so the page can't be
   * used to find out who is an owner.
   */
  async requestLink(businessId: string, rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const partner = await partnerRepository.findOtherByContactEmail(businessId, email, null);
    if (!partner || partner.data.deletedAt || partner.data.status !== 'active') return;
    const { uid } = await this.ensureLogin(businessId, partner.id, partner.data);
    const link = await this.issueLink(businessId, partner.id, uid, email, partner.data.authUid ? 'reset' : 'invite', 'owner');
    await this.sendLinkEmail(businessId, email, partner.data.name, link, partner.data.authUid ? 'reset' : 'invite');
  }

  /** What the set-password page shows for a link, without using it up. */
  async describeLink(token: string): Promise<{ ok: true; email: string; name: string; purpose: PartnerPortalTokenPurpose } | { ok: false; problem: LinkProblem; email: string | null }> {
    const stored = token ? await partnerPortalTokenRepository.find(hashOf(token)) : null;
    if (!stored) return { ok: false, problem: 'not_found', email: null };
    if (stored.usedAt) return { ok: false, problem: 'used', email: stored.email };
    if (stored.expiresAt.toMillis() <= Date.now()) return { ok: false, problem: 'expired', email: stored.email };
    const partner = await partnerRepository.findById(stored.businessId, stored.partnerId);
    if (!partner || partner.deletedAt || partner.status !== 'active') return { ok: false, problem: 'suspended', email: stored.email };
    return { ok: true, email: stored.email, name: partner.name, purpose: stored.purpose };
  }

  /** Sets the password from a link, once. Returns the email to sign in with. */
  async setPassword(token: string, password: string): Promise<{ email: string }> {
    if (password.length < MIN_PASSWORD_LENGTH) throw new PortalAccessError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password.length > 128) throw new PortalAccessError('Use at most 128 characters.');
    const described = await this.describeLink(token);
    if (!described.ok) throw new PortalAccessError(linkProblemMessage(described.problem));
    const stored = (await partnerPortalTokenRepository.find(hashOf(token)))!;
    // Proving they can open the email is what the link is; the address counts as verified from here.
    await adminAuth.updateUser(stored.uid, { password, emailVerified: true });
    await partnerPortalTokenRepository.markUsed(hashOf(token));
    return { email: stored.email };
  }

  /**
   * The owner's Firebase Auth login, made if they have none, and linked to
   * the owner record. Follows the owner's current email: if staff changed it,
   * the login's email changes with it.
   */
  private async ensureLogin(businessId: string, partnerId: string, partner: Partner): Promise<{ uid: string; email: string }> {
    const email = normalizeEmail(partner.contactEmail ?? '');
    let uid: string | null = null;
    if (partner.authUid) {
      const linked = await adminAuth.getUser(partner.authUid).catch(() => null);
      if (linked) {
        uid = linked.uid;
        if (linked.email?.toLowerCase() !== email) {
          await adminAuth.updateUser(uid, { email }).catch((error: { code?: string }) => {
            throw new PortalAccessError(error.code === 'auth/email-already-exists' ? `${email} is already used by another Snack Quest login. Use a different email for this owner.` : 'Couldn’t update the owner’s login email.');
          });
        }
      }
    }
    if (!uid) {
      const existing = await adminAuth.getUserByEmail(email).catch(() => null);
      uid = existing?.uid ?? (await adminAuth.createUser({ email, displayName: partner.name, password: randomBytes(24).toString('hex') })).uid;
    }
    const holder = await partnerRepository.findByAuthUid(businessId, uid);
    if (holder && holder.id !== partnerId) throw new PortalAccessError(`${email} is already the login of another owner (${holder.data.name}).`);
    if (partner.authUid !== uid) await partnerRepository.linkAuthUid(partnerId, uid);
    return { uid, email };
  }

  private async issueLink(businessId: string, partnerId: string, uid: string, email: string, purpose: PartnerPortalTokenPurpose, createdBy: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await partnerPortalTokenRepository.create(hashOf(token), {
      businessId,
      partnerId,
      uid,
      email,
      purpose,
      expiresAt: Timestamp.fromMillis(Date.now() + LIFETIME_MS[purpose]),
      createdBy,
    });
    return `${getSiteUrl()}/partner/set-password?token=${token}`;
  }

  /** The email with the link. False when it couldn't be sent — the link still works, and staff can pass it on. */
  private async sendLinkEmail(businessId: string, email: string, name: string, link: string, purpose: PartnerPortalTokenPurpose): Promise<boolean> {
    const loginUrl = `${getSiteUrl()}/partner/login`;
    const invite = purpose === 'invite';
    const subject = invite ? 'Your Snack Quest Owner Portal login' : 'Set a new Owner Portal password';
    const lines = invite
      ? [
          `Hi ${name},`,
          'Your Snack Quest Owner Portal is ready. It shows your machines, sales, profit and payouts.',
          `Your login email is ${email}.`,
          `1. Tap "Create your password" below and choose a password.\n2. Sign in at ${loginUrl} with ${email} and that password.`,
          'The button works once and expires in 7 days. If it has expired, go to the sign-in page and tap "First time, or forgot your password?" to get a new one.',
        ]
      : [
          `Hi ${name},`,
          `Someone asked to set a new password for the Snack Quest Owner Portal login ${email}. If that was you, tap the button below.`,
          `Then sign in at ${loginUrl} with ${email} and your new password.`,
          'The button works once and expires in 24 hours. If you didn’t ask for this, ignore this email: your password stays the same.',
        ];
    const text = [...lines, `If the button doesn’t work, copy this link into your browser:\n${link}`].join('\n\n');
    const html = brandedEmailHtml({
      heading: invite ? 'Your Owner Portal is ready' : 'Set a new password',
      bodyHtml: lines.map((line) => `<p style="margin:0 0 14px;">${escapeHtml(line).replace(/\n/g, '<br>')}</p>`).join(''),
      ctaLabel: invite ? 'Create your password' : 'Set a new password',
      ctaUrl: link,
      footerText: 'Snack Quest · Owner Portal',
    });
    try {
      await this.email.send({ businessId, to: email, subject, body: text, html });
      return true;
    } catch (error) {
      logger.warn('owner portal link email not sent', { businessId, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}

export function linkProblemMessage(problem: LinkProblem): string {
  switch (problem) {
    case 'used':
      return 'This link has already been used to create a password. Sign in with it, or get a new link if you forgot it.';
    case 'expired':
      return 'This link has expired. Get a new one below — it takes a minute.';
    case 'suspended':
      return 'This owner account is suspended. Contact Snack Quest.';
    default:
      return 'This link isn’t valid. Check you used the whole link from the email, or get a new one below.';
  }
}

export const partnerPortalAccessService = new PartnerPortalAccessService();
export { PartnerPortalAccessService };
