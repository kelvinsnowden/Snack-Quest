import 'server-only';

import {
  businessRepository,
  type BusinessInput,
} from '@/repositories/businessRepository';
import type {
  Business,
  BusinessStatus,
  HomepageContent,
  LoyaltyConfig,
} from '@/types';

export class BusinessNotFoundError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} not found`);
    this.name = 'BusinessNotFoundError';
  }
}

export class BusinessSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessSettingsValidationError';
  }
}

const PHONE_PATTERN = /^254\d{9}$/;
/** A shop, not a broadcast list — a cap keeps one bad paste from texting fifty people per order. */
const MAX_ORDER_ALERT_RECIPIENTS = 10;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const STATUSES: BusinessStatus[] = ['active', 'suspended'];

export type BusinessSettingsPatch = Partial<
  Pick<
    BusinessInput,
    | 'name'
    | 'currency'
    | 'whatsappPhoneNumberId'
    | 'countyCoverage'
    | 'adminWhatsappPhone'
    | 'adminOrderSmsPhone'
    | 'orderAlertRecipients'
    | 'whatsappCustomerNumber'
    | 'status'
    | 'loyaltyConfig'
    | 'homepageContent'
  >
>;

/**
 * Owns Business config edits (§ Admin: Settings). `whatsappPhoneNumberId`
 * is deliberately still editable here, not locked down — it's real
 * tenant config (which WhatsApp number this business receives inbound
 * traffic on) that legitimately changes (e.g. a number migration), even
 * though getting it wrong breaks inbound routing until corrected; the
 * honest mitigation is the before/after audit trail this Service writes
 * through, not hiding the field.
 */
class BusinessSettingsService {
  async getSettings(businessId: string): Promise<Business> {
    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new BusinessNotFoundError(businessId);
    }
    return business;
  }

  /** Returns the before/after pair so the caller (a Route Handler) can write an audit log entry without a second read. */
  async updateSettings(
    businessId: string,
    patch: BusinessSettingsPatch,
    actor: string,
  ): Promise<{ before: Business; after: Business }> {
    const before = await this.getSettings(businessId);
    this.validate(patch);

    await businessRepository.update(businessId, patch, actor);
    const after = await this.getSettings(businessId);
    return { before, after };
  }

  private validate(patch: BusinessSettingsPatch): void {
    if (patch.name !== undefined && patch.name.trim().length === 0) {
      throw new BusinessSettingsValidationError('"name" cannot be empty.');
    }
    if (
      patch.currency !== undefined &&
      !CURRENCY_PATTERN.test(patch.currency)
    ) {
      throw new BusinessSettingsValidationError(
        '"currency" must be a 3-letter ISO code, e.g. "KES".',
      );
    }
    if (
      patch.whatsappPhoneNumberId !== undefined &&
      patch.whatsappPhoneNumberId.trim().length === 0
    ) {
      throw new BusinessSettingsValidationError(
        '"whatsappPhoneNumberId" cannot be empty.',
      );
    }
    if (patch.countyCoverage !== undefined) {
      if (
        !Array.isArray(patch.countyCoverage) ||
        patch.countyCoverage.some(
          (c) => typeof c !== 'string' || c.trim().length === 0,
        )
      ) {
        throw new BusinessSettingsValidationError(
          '"countyCoverage" must be a list of non-empty county names.',
        );
      }
    }
    if (
      patch.adminWhatsappPhone !== undefined &&
      patch.adminWhatsappPhone !== null &&
      !PHONE_PATTERN.test(patch.adminWhatsappPhone)
    ) {
      throw new BusinessSettingsValidationError(
        '"adminWhatsappPhone" must be E.164 without the leading "+", e.g. "254712345678".',
      );
    }
    if (
      patch.adminOrderSmsPhone !== undefined &&
      patch.adminOrderSmsPhone !== null &&
      !PHONE_PATTERN.test(patch.adminOrderSmsPhone)
    ) {
      throw new BusinessSettingsValidationError(
        '"adminOrderSmsPhone" must be E.164 without the leading "+", e.g. "254759209705".',
      );
    }
    /*
     * Validated as a whole list, not per row as it is typed. A save
     * that accepted the good rows and dropped the bad ones would leave
     * an admin looking at a list that is not the list they submitted —
     * on a control whose whole job is deciding who gets told about
     * money arriving.
     */
    if (patch.orderAlertRecipients !== undefined) {
      const recipients = patch.orderAlertRecipients ?? [];
      if (!Array.isArray(recipients)) {
        throw new BusinessSettingsValidationError('"orderAlertRecipients" must be a list.');
      }
      if (recipients.length > MAX_ORDER_ALERT_RECIPIENTS) {
        throw new BusinessSettingsValidationError(
          `"orderAlertRecipients" cannot hold more than ${MAX_ORDER_ALERT_RECIPIENTS} numbers.`,
        );
      }
      const seen = new Set<string>();
      for (const recipient of recipients) {
        if (!recipient || typeof recipient !== 'object') {
          throw new BusinessSettingsValidationError(
            'Each order alert recipient needs a phone number and a label.',
          );
        }
        if (!PHONE_PATTERN.test(recipient.phone ?? '')) {
          throw new BusinessSettingsValidationError(
            `"${recipient.phone ?? ''}" is not a valid number — use E.164 without the leading "+", e.g. "254712345678".`,
          );
        }
        if (!recipient.label || recipient.label.trim().length === 0) {
          throw new BusinessSettingsValidationError(
            `Give ${recipient.phone} a label, so the list is readable later.`,
          );
        }
        if (seen.has(recipient.phone)) {
          throw new BusinessSettingsValidationError(
            `${recipient.phone} is listed twice — one number, one alert.`,
          );
        }
        seen.add(recipient.phone);
      }
    }
    if (
      patch.whatsappCustomerNumber !== undefined &&
      patch.whatsappCustomerNumber !== null &&
      !PHONE_PATTERN.test(patch.whatsappCustomerNumber)
    ) {
      throw new BusinessSettingsValidationError(
        '"whatsappCustomerNumber" must be E.164 without the leading "+", e.g. "254712345678".',
      );
    }
    if (patch.status !== undefined && !STATUSES.includes(patch.status)) {
      throw new BusinessSettingsValidationError(
        `"status" must be one of: ${STATUSES.join(', ')}.`,
      );
    }
    if (patch.loyaltyConfig !== undefined) {
      this.validateLoyaltyConfig(patch.loyaltyConfig);
    }
    if (patch.homepageContent !== undefined) {
      this.validateHomepageContent(patch.homepageContent);
    }
  }

  private validateHomepageContent(content: HomepageContent): void {
    for (const field of ['founderImageUrl', 'whatsInsidePhotoUrl'] as const) {
      const value = content[field];
      if (
        value !== null &&
        (typeof value !== 'string' || value.trim().length === 0)
      ) {
        throw new BusinessSettingsValidationError(
          `"homepageContent.${field}" must be a non-empty URL string or null.`,
        );
      }
    }
  }

  private validateLoyaltyConfig(config: LoyaltyConfig): void {
    if (typeof config.enabled !== 'boolean') {
      throw new BusinessSettingsValidationError(
        '"loyaltyConfig.enabled" must be a boolean.',
      );
    }
    if (
      !Number.isFinite(config.firstOrderBonusKes) ||
      config.firstOrderBonusKes < 0
    ) {
      throw new BusinessSettingsValidationError(
        '"loyaltyConfig.firstOrderBonusKes" must be a non-negative number.',
      );
    }
    if (
      !Number.isInteger(config.repeatOrderIntervalCount) ||
      config.repeatOrderIntervalCount < 0
    ) {
      throw new BusinessSettingsValidationError(
        '"loyaltyConfig.repeatOrderIntervalCount" must be a non-negative whole number.',
      );
    }
    if (
      !Number.isFinite(config.repeatOrderBonusKes) ||
      config.repeatOrderBonusKes < 0
    ) {
      throw new BusinessSettingsValidationError(
        '"loyaltyConfig.repeatOrderBonusKes" must be a non-negative number.',
      );
    }
  }
}

export const businessSettingsService = new BusinessSettingsService();
export { BusinessSettingsService };
