import 'server-only';

import { checkOwnerDarajaAccount } from '@/lib/integrations/daraja/darajaGateway';
import { textSmsGateway } from '@/lib/integrations/sms/textSmsGateway';
import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { toSmsSafeText } from '@/lib/sms/gsm7';
import { logger } from '@/lib/observability/logger';
import { partnerPaymentAccountRepository } from '@/repositories/partnerPaymentAccountRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { resolveTerms } from '@/services/machineEconomicProfileService';
import type { Machine, PartnerPaymentAccount, PartnerPaymentAccountType, PartnerPaymentAccountView } from '@/types';

/** A connect request the form must fix before anything is checked with Safaricom. */
export class PaymentAccountValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentAccountValidationError';
  }
}

const SHORTCODE = /^\d{5,7}$/;
const MAX_KEY_LENGTH = 300;

export interface ConnectInput {
  accountType: PartnerPaymentAccountType;
  shortcode: string;
  headOfficeShortcode: string | null;
  /** Blank keeps the key already saved, so fixing one field doesn't mean pasting all three again. */
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
}

/** Why sales on a machine do or don't go to the owner's till — what the owner's page shows per machine. */
export type MachinePaymentRoute = 'owner_till' | 'not_connected' | 'not_invoice_billing';

function toView(account: PartnerPaymentAccount): PartnerPaymentAccountView {
  return {
    accountType: account.accountType,
    shortcode: account.shortcode,
    headOfficeShortcode: account.headOfficeShortcode,
    status: account.status,
    lastError: account.lastError,
    lastErrorDetail: account.lastErrorDetail ?? null,
    lastCheckedAtMs: account.lastCheckedAtMs,
    connectedAtMs: account.connectedAtMs,
    consumerKeyEnding: account.consumerKey.slice(-4),
  };
}

/**
 * A machine owner's own M-Pesa till or paybill (§ OWNER TILL): connected
 * from their portal, checked with Safaricom before any sale uses it, and
 * then where their machines' sales are paid — on machines whose
 * agreement is on invoice billing, since Snack Quest no longer holds
 * that money to settle from.
 */
class OwnerPaymentAccountService {
  async view(businessId: string, partnerId: string): Promise<PartnerPaymentAccountView | null> {
    const account = await partnerPaymentAccountRepository.find(businessId, partnerId);
    return account ? toView(account) : null;
  }

  /**
   * Saves the owner's till or paybill and checks it with Safaricom,
   * charging nobody. Connected only when the check passes; otherwise it is
   * saved as failed with the reason, so the owner can fix one field
   * without retyping the rest, and no sale uses it meanwhile.
   */
  async connect(businessId: string, partnerId: string, input: ConnectInput, nowMs = Date.now()): Promise<{ view: PartnerPaymentAccountView; problem: { title: string; detail: string } | null }> {
    if (input.accountType !== 'till' && input.accountType !== 'paybill') throw new PaymentAccountValidationError('Choose till or paybill.');
    const shortcode = input.shortcode.replace(/\s/g, '');
    if (!SHORTCODE.test(shortcode)) throw new PaymentAccountValidationError(`Enter your ${input.accountType === 'till' ? 'till' : 'paybill'} number: 5 to 7 digits.`);
    const headOffice = input.accountType === 'till' ? (input.headOfficeShortcode ?? '').replace(/\s/g, '') : '';
    if (headOffice && !SHORTCODE.test(headOffice)) throw new PaymentAccountValidationError('The store number is 5 to 7 digits. Leave it blank if it’s the same as your till.');

    const existing = await partnerPaymentAccountRepository.find(businessId, partnerId);
    const key = (given: string, saved: string | undefined, label: string) => {
      const value = given.trim() || saved || '';
      if (!value) throw new PaymentAccountValidationError(`Paste your ${label}.`);
      if (value.length > MAX_KEY_LENGTH) throw new PaymentAccountValidationError(`That ${label} is too long. Check you copied only the ${label}.`);
      return value;
    };
    const account = {
      accountType: input.accountType,
      shortcode,
      headOfficeShortcode: headOffice && headOffice !== shortcode ? headOffice : null,
      consumerKey: key(input.consumerKey, existing?.consumerKey, 'consumer key'),
      consumerSecret: key(input.consumerSecret, existing?.consumerSecret, 'consumer secret'),
      passkey: key(input.passkey, existing?.passkey, 'passkey'),
    };

    let problem: { title: string; detail: string } | null;
    try {
      problem = (await checkOwnerDarajaAccount(businessId, partnerId, account)).find((issue) => issue.severity === 'blocker') ?? null;
    } catch (error) {
      logger.error('owner M-Pesa account check could not run', { businessId, partnerId, error });
      problem = { title: 'We couldn’t reach Safaricom to check your details', detail: 'This isn’t a problem with what you entered. Try again in a few minutes.' };
    }
    const connected = problem === null;
    await partnerPaymentAccountRepository.save({
      businessId,
      partnerId,
      ...account,
      status: connected ? 'connected' : 'failed',
      lastError: problem?.title ?? null,
      lastErrorDetail: problem?.detail ?? null,
      lastCheckedAtMs: nowMs,
      connectedAtMs: connected ? (existing?.status === 'connected' ? existing.connectedAtMs : nowMs) : null,
    });
    const saved = await partnerPaymentAccountRepository.find(businessId, partnerId);
    return { view: toView(saved!), problem };
  }

  async disconnect(businessId: string, partnerId: string): Promise<boolean> {
    return partnerPaymentAccountRepository.delete(businessId, partnerId);
  }

  /**
   * The owner's till a sale on this machine is paid into, or null for
   * Snack Quest's: only a connected account, and only on a machine whose
   * active agreement with that owner is on invoice billing.
   */
  async collectingAccountFor(businessId: string, machineId: string, machine: Pick<Machine, 'ownerPartnerId'>): Promise<{ partnerId: string } | null> {
    const partnerId = machine.ownerPartnerId;
    if (!partnerId) return null;
    return (await this.routeFor(businessId, machineId, partnerId)) === 'owner_till' ? { partnerId } : null;
  }

  async routeFor(businessId: string, machineId: string, partnerId: string): Promise<MachinePaymentRoute> {
    const [account, agreement] = await Promise.all([
      partnerPaymentAccountRepository.find(businessId, partnerId),
      partnerMachineAgreementRepository.findActiveForMachine(businessId, machineId),
    ]);
    if (account?.status !== 'connected') return 'not_connected';
    if (!agreement || agreement.data.partnerId !== partnerId || resolveTerms(agreement.data.terms).ownerBilling !== 'invoice') return 'not_invoice_billing';
    return 'owner_till';
  }

  /**
   * Safaricom stopped accepting the owner's keys at a sale (the sale then
   * went to Snack Quest's account). Marks the account failed so sales stop
   * trying it, and texts the owner once.
   */
  async markUnavailable(businessId: string, partnerId: string, nowMs = Date.now()): Promise<void> {
    const account = await partnerPaymentAccountRepository.find(businessId, partnerId);
    if (!account || account.status !== 'connected') return;
    await partnerPaymentAccountRepository.markFailed(partnerId, 'Safaricom stopped accepting your keys', 'Copy them again from your live app on the Daraja portal, then check and connect.', nowMs);
    try {
      const partner = await partnerRepository.findById(businessId, partnerId);
      if (partner?.contactPhone) {
        await textSmsGateway.send({
          businessId,
          to: normalizeKenyanPhone(partner.contactPhone),
          body: toSmsSafeText(`Snack Quest: M-Pesa stopped accepting the keys for your till ${account.shortcode}, so sales are going to Snack Quest for now. Reconnect at snackquests.shop/partner/payments`),
        });
      }
    } catch (error) {
      logger.warn('owner till failure text not sent', { businessId, partnerId, error });
    }
  }
}

export const ownerPaymentAccountService = new OwnerPaymentAccountService();
export { OwnerPaymentAccountService };
