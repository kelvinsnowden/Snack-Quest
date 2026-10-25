import 'server-only';

import { checkOwnerDarajaAccount } from '@/lib/integrations/daraja/darajaGateway';
import { textSmsGateway } from '@/lib/integrations/sms/textSmsGateway';
import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { toSmsSafeText } from '@/lib/sms/gsm7';
import { logger } from '@/lib/observability/logger';
import { partnerPaymentAccountRepository } from '@/repositories/partnerPaymentAccountRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { resolveTerms } from '@/services/machineEconomicProfileService';
import type { Machine, PartnerPaymentAccount, PartnerPaymentAccountType, PartnerPaymentAccountView } from '@/types';

/** A request the owner must fix before anything is checked with Safaricom. */
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
  /** Another of the owner's tills whose keys to use — several tills under one store share one Daraja app. */
  sameKeysAs?: string | null;
}

/**
 * Where a machine's sales are paid right now, and why:
 * - `owner_till`: into the owner's till chosen for it;
 * - `no_till`: the owner hasn't chosen a till for it;
 * - `till_not_working`: its till's last check with Safaricom failed;
 * - `not_invoice_billing`: Snack Quest hasn't switched the machine to invoice billing yet.
 * Every route but the first is Snack Quest's account.
 */
export type MachinePaymentRoute = 'owner_till' | 'no_till' | 'till_not_working' | 'not_invoice_billing';

function toView(id: string, account: PartnerPaymentAccount): PartnerPaymentAccountView {
  return {
    id,
    accountType: account.accountType,
    shortcode: account.shortcode,
    headOfficeShortcode: account.headOfficeShortcode,
    machineIds: account.machineIds,
    status: account.status,
    lastError: account.lastError,
    lastErrorDetail: account.lastErrorDetail ?? null,
    lastCheckedAtMs: account.lastCheckedAtMs,
    connectedAtMs: account.connectedAtMs,
    consumerKeyEnding: account.consumerKey.slice(-4),
  };
}

/**
 * A machine owner's own M-Pesa tills or paybills (§ OWNER TILL): connected
 * from their portal, each checked with Safaricom before any sale uses it,
 * and chosen machine by machine. Sales go to a machine's till only when its
 * agreement is on invoice billing, since Snack Quest no longer holds that
 * money to settle from.
 */
class OwnerPaymentAccountService {
  async list(businessId: string, partnerId: string): Promise<PartnerPaymentAccountView[]> {
    return (await partnerPaymentAccountRepository.listByPartner(businessId, partnerId)).map(({ id, data }) => toView(id, data));
  }

  /**
   * Adds a till (`accountId` null) or saves new details for one, and
   * checks it with Safaricom, charging nobody. It is connected only when
   * the check passes; otherwise it is saved as not working with the
   * reason, so the owner can fix one field without retyping the rest, and
   * no sale uses it meanwhile. An owner's first till is chosen for all
   * their machines straight away; later ones for none until they pick.
   */
  async connect(
    businessId: string,
    partnerId: string,
    accountId: string | null,
    input: ConnectInput,
    nowMs = Date.now(),
  ): Promise<{ view: PartnerPaymentAccountView; problem: { title: string; detail: string } | null }> {
    if (input.accountType !== 'till' && input.accountType !== 'paybill') throw new PaymentAccountValidationError('Choose till or paybill.');
    const shortcode = input.shortcode.replace(/\s/g, '');
    if (!SHORTCODE.test(shortcode)) throw new PaymentAccountValidationError(`Enter your ${input.accountType === 'till' ? 'till' : 'paybill'} number: 5 to 7 digits.`);
    const headOffice = input.accountType === 'till' ? (input.headOfficeShortcode ?? '').replace(/\s/g, '') : '';
    if (headOffice && !SHORTCODE.test(headOffice)) throw new PaymentAccountValidationError('The store number is 5 to 7 digits. Leave it blank if it’s the same as your till.');

    const owned = await partnerPaymentAccountRepository.listByPartner(businessId, partnerId);
    const existing = accountId ? owned.find(({ id }) => id === accountId)?.data : undefined;
    if (accountId && !existing) throw new PaymentAccountValidationError('That till isn’t one of yours.');
    if (owned.some(({ id, data }) => id !== accountId && data.shortcode === shortcode)) {
      throw new PaymentAccountValidationError(`${input.accountType === 'till' ? 'Till' : 'Paybill'} ${shortcode} is already connected. Change it there instead.`);
    }
    const keysFrom = input.sameKeysAs ? owned.find(({ id }) => id === input.sameKeysAs)?.data : undefined;
    if (input.sameKeysAs && !keysFrom) throw new PaymentAccountValidationError('Choose one of your tills to share keys with.');
    const key = (given: string, field: 'consumerKey' | 'consumerSecret' | 'passkey', label: string) => {
      const value = keysFrom ? keysFrom[field] : given.trim() || existing?.[field] || '';
      if (!value) throw new PaymentAccountValidationError(`Paste your ${label}.`);
      if (value.length > MAX_KEY_LENGTH) throw new PaymentAccountValidationError(`That ${label} is too long. Check you copied only the ${label}.`);
      return value;
    };
    const details = {
      accountType: input.accountType,
      shortcode,
      // Keys shared with another till come with that till's store number, which the passkey belongs to.
      headOfficeShortcode: keysFrom ? (keysFrom.headOfficeShortcode ?? keysFrom.shortcode) : headOffice && headOffice !== shortcode ? headOffice : null,
      consumerKey: key(input.consumerKey, 'consumerKey', 'consumer key'),
      consumerSecret: key(input.consumerSecret, 'consumerSecret', 'consumer secret'),
      passkey: key(input.passkey, 'passkey', 'passkey'),
    };
    if (details.headOfficeShortcode === shortcode) details.headOfficeShortcode = null;

    let problem: { title: string; detail: string } | null;
    try {
      problem = (await checkOwnerDarajaAccount(businessId, partnerId, details)).find((issue) => issue.severity === 'blocker') ?? null;
    } catch (error) {
      logger.error('owner M-Pesa till check could not run', { businessId, partnerId, error });
      problem = { title: 'We couldn’t reach Safaricom to check your details', detail: 'This isn’t a problem with what you entered. Try again in a few minutes.' };
    }
    const connected = problem === null;
    const outcome = {
      ...details,
      status: connected ? ('connected' as const) : ('failed' as const),
      lastError: problem?.title ?? null,
      lastErrorDetail: problem?.detail ?? null,
      lastCheckedAtMs: nowMs,
      connectedAtMs: connected ? (existing?.status === 'connected' ? existing.connectedAtMs : nowMs) : null,
    };
    let id = accountId;
    if (id) {
      await partnerPaymentAccountRepository.update(id, outcome);
    } else {
      const machineIds = owned.length === 0 ? (await machineRepository.listByPartner(businessId, partnerId)).map(({ id: machineId }) => machineId) : [];
      id = await partnerPaymentAccountRepository.create({ businessId, partnerId, ...outcome, machineIds });
    }
    const saved = await partnerPaymentAccountRepository.find(businessId, id);
    return { view: toView(id, saved!), problem };
  }

  async disconnect(businessId: string, partnerId: string, accountId: string): Promise<boolean> {
    return partnerPaymentAccountRepository.delete(businessId, partnerId, accountId);
  }

  /** Chooses which of the owner's tills one of their machines is paid into; null for Snack Quest's account. */
  async assignMachine(businessId: string, partnerId: string, machineId: string, accountId: string | null): Promise<void> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine || machine.ownerPartnerId !== partnerId) throw new PaymentAccountValidationError('That machine isn’t one of yours.');
    if (!(await partnerPaymentAccountRepository.assignMachine(businessId, partnerId, machineId, accountId))) {
      throw new PaymentAccountValidationError('That till isn’t one of yours.');
    }
  }

  /**
   * The owner's till a sale on this machine is paid into, or null for
   * Snack Quest's: only the till chosen for the machine, only when it is
   * connected, and only on invoice billing with that owner.
   */
  async collectingAccountFor(businessId: string, machineId: string, machine: Pick<Machine, 'ownerPartnerId'>): Promise<{ partnerId: string; accountId: string } | null> {
    const partnerId = machine.ownerPartnerId;
    if (!partnerId) return null;
    const { route, accountId } = await this.routeFor(businessId, machineId, partnerId);
    return route === 'owner_till' && accountId ? { partnerId, accountId } : null;
  }

  async routeFor(businessId: string, machineId: string, partnerId: string): Promise<{ route: MachinePaymentRoute; accountId: string | null }> {
    const [till, agreement] = await Promise.all([
      partnerPaymentAccountRepository.findForMachine(businessId, partnerId, machineId),
      partnerMachineAgreementRepository.findActiveForMachine(businessId, machineId),
    ]);
    return { route: route(till?.data ?? null, agreement?.data ?? null, partnerId), accountId: till?.id ?? null };
  }

  /** Every one of the owner's machines' routes, reading their tills once. */
  async routesFor(businessId: string, partnerId: string, machineIds: string[]): Promise<Map<string, { route: MachinePaymentRoute; accountId: string | null }>> {
    const [tills, agreements] = await Promise.all([
      partnerPaymentAccountRepository.listByPartner(businessId, partnerId),
      Promise.all(machineIds.map((machineId) => partnerMachineAgreementRepository.findActiveForMachine(businessId, machineId))),
    ]);
    return new Map(
      machineIds.map((machineId, index) => {
        const till = tills.find(({ data }) => data.machineIds.includes(machineId)) ?? null;
        return [machineId, { route: route(till?.data ?? null, agreements[index]?.data ?? null, partnerId), accountId: till?.id ?? null }];
      }),
    );
  }

  /**
   * Safaricom stopped accepting a till's keys at a sale (the sale then went
   * to Snack Quest's account). Marks it not working so its machines stop
   * trying it, and texts the owner once.
   */
  async markUnavailable(businessId: string, accountId: string, nowMs = Date.now()): Promise<void> {
    const account = await partnerPaymentAccountRepository.find(businessId, accountId);
    if (!account || account.status !== 'connected') return;
    await partnerPaymentAccountRepository.markFailed(accountId, 'Safaricom stopped accepting your keys', 'Copy them again from your live app on the Daraja portal, then check and connect.', nowMs);
    try {
      const partner = await partnerRepository.findById(businessId, account.partnerId);
      if (partner?.contactPhone) {
        await textSmsGateway.send({
          businessId,
          to: normalizeKenyanPhone(partner.contactPhone),
          body: toSmsSafeText(`Snack Quest: M-Pesa stopped accepting the keys for your till ${account.shortcode}, so its sales go to Snack Quest for now. Reconnect at snackquests.shop/partner/payments`),
        });
      }
    } catch (error) {
      logger.warn('owner till failure text not sent', { businessId, accountId, error });
    }
  }
}

/** Billing first: until Snack Quest has switched a machine to invoice billing, no till would change where its sales go, so that is what the owner needs to hear. */
function route(till: PartnerPaymentAccount | null, agreement: { partnerId: string; terms?: Parameters<typeof resolveTerms>[0] } | null, partnerId: string): MachinePaymentRoute {
  if (!agreement || agreement.partnerId !== partnerId || resolveTerms(agreement.terms).ownerBilling !== 'invoice') return 'not_invoice_billing';
  if (!till) return 'no_till';
  if (till.status !== 'connected') return 'till_not_working';
  return 'owner_till';
}

export const ownerPaymentAccountService = new OwnerPaymentAccountService();
export { OwnerPaymentAccountService };
