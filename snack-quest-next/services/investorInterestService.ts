import 'server-only';

import { createHash } from 'node:crypto';
import {
  investorInterestRepository,
  type InvestorInterestInput,
} from '@/repositories/investorInterestRepository';
import { INVESTOR_TYPES, type InvestorType } from '@/types/investorInterest';
import { normalizeKenyanPhone, InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { isAcceptableEmailInput } from '@/lib/checkout/email';

export class InvestorInterestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvestorInterestValidationError';
  }
}

export class InvestorInterestRateLimitError extends Error {
  constructor() {
    super('We’ve already received several submissions from here. Please try again later.');
    this.name = 'InvestorInterestRateLimitError';
  }
}

/** Long enough to be a real answer, short enough that nobody pastes a book into it. */
const MAX_SHORT_FIELD = 120;
const MAX_LONG_FIELD = 2_000;

/**
 * Two windows, doing different jobs.
 *
 * The duplicate window is generous because a double submission is an
 * accident — a slow network, a second tap — and the cost of treating
 * one as new is a duplicate row in a list somebody reads by hand. The
 * rate-limit window is short and its ceiling low, because what it
 * stops is a script, and a script does not wait an hour.
 */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

export interface InvestorInterestSubmission {
  fullName: unknown;
  email: unknown;
  phone: unknown;
  location: unknown;
  indicativeAmount?: unknown;
  investorType: unknown;
  motivation?: unknown;
  heardFrom?: unknown;
  wantsUpdates?: unknown;
  referrer?: unknown;
  /** The raw client address, hashed here and never stored as given. */
  submitterIp?: unknown;
}

export interface InvestorInterestResult {
  interestId: string;
  /** True when this matched a recent submission from the same person and nothing new was written. */
  duplicate: boolean;
}

function requiredText(value: unknown, field: string, max = MAX_SHORT_FIELD): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvestorInterestValidationError(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new InvestorInterestValidationError(`${field} is too long.`);
  }
  return trimmed;
}

function optionalText(value: unknown, field: string, max = MAX_LONG_FIELD): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new InvestorInterestValidationError(`${field} is not valid.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > max) {
    throw new InvestorInterestValidationError(`${field} is too long.`);
  }
  return trimmed;
}

/**
 * Owns expressions of interest from the public `/invest` page.
 *
 * Every rule here is enforced server-side rather than in the form.
 * The form validates too, but only so a person is told early — the
 * route is reachable with `curl`, and a lead list is exactly the kind
 * of thing that gets filled with junk the week after it goes live.
 */
class InvestorInterestService {
  async submit(input: InvestorInterestSubmission): Promise<InvestorInterestResult> {
    const fullName = requiredText(input.fullName, 'Your name');
    const emailRaw = requiredText(input.email, 'Your email');
    if (!isAcceptableEmailInput(emailRaw)) {
      throw new InvestorInterestValidationError('Enter an email address we can reply to.');
    }
    const email = emailRaw.toLowerCase();

    let phone: string;
    try {
      phone = normalizeKenyanPhone(requiredText(input.phone, 'Your phone number'));
    } catch (error) {
      if (error instanceof InvalidPhoneNumberError) {
        throw new InvestorInterestValidationError('Enter a phone number we can reach you on.');
      }
      throw error;
    }

    const location = requiredText(input.location, 'Your location');
    const investorType = this.investorType(input.investorType);

    /*
     * Hashed with a per-deployment salt. Without one, a hash of an IPv4
     * address is trivially reversible — the whole space is four billion
     * values, which is minutes of work — so the hash would be an IP
     * address wearing a hat.
     */
    const submitterHash = this.hashSubmitter(input.submitterIp);

    const now = Date.now();
    if (submitterHash) {
      const recent = await investorInterestRepository.countSince(
        submitterHash,
        new Date(now - RATE_LIMIT_WINDOW_MS),
      );
      if (recent >= RATE_LIMIT_MAX) {
        throw new InvestorInterestRateLimitError();
      }
    }

    /*
     * A repeat submission is answered exactly as a first one is. The
     * person sees the same success state — they cannot tell, and
     * should not have to care — while nothing is written and the list
     * stays clean. Telling them "you already submitted" would be worse
     * on both counts: it is confusing to somebody who genuinely tapped
     * twice, and it confirms an email address to anybody probing.
     */
    const existing = await investorInterestRepository.findRecentByEmail(
      email,
      new Date(now - DUPLICATE_WINDOW_MS),
    );
    if (existing) {
      return { interestId: existing.id, duplicate: true };
    }

    const record: InvestorInterestInput = {
      fullName,
      email,
      phone,
      location,
      indicativeAmount: optionalText(input.indicativeAmount, 'Amount', MAX_SHORT_FIELD),
      investorType,
      motivation: optionalText(input.motivation, 'Your answer'),
      heardFrom: optionalText(input.heardFrom, 'Your answer', MAX_SHORT_FIELD),
      // Consent is recorded as given or not given, never inferred from
      // a missing field.
      wantsUpdates: input.wantsUpdates === true,
      referrer: optionalText(input.referrer, 'Referrer', MAX_SHORT_FIELD),
      submitterHash,
    };

    const interestId = await investorInterestRepository.create(record);
    return { interestId, duplicate: false };
  }

  private investorType(value: unknown): InvestorType {
    const match = INVESTOR_TYPES.find((option) => option.value === value);
    if (!match) {
      throw new InvestorInterestValidationError('Choose the option that best describes you.');
    }
    return match.value;
  }

  /**
   * Empty string when there is no address to hash, which is a real
   * case behind some proxies. The rate limit then does not apply to
   * that request rather than the submission being refused: a genuine
   * investor whose network hides their IP must still be able to reach
   * us.
   */
  private hashSubmitter(ip: unknown): string {
    if (typeof ip !== 'string' || ip.trim().length === 0) {
      return '';
    }
    const salt = process.env.INVESTOR_INTEREST_SALT ?? process.env.SMS_OPTOUT_SECRET ?? 'snack-quest';
    return createHash('sha256').update(`${salt}:${ip.trim()}`).digest('hex').slice(0, 32);
  }
}

export const investorInterestService = new InvestorInterestService();
export { InvestorInterestService };
