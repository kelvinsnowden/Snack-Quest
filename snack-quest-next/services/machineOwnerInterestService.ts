import 'server-only';

import { createHash } from 'node:crypto';
import {
  machineOwnerInterestRepository,
  type MachineOwnerInterestInput,
} from '@/repositories/machineOwnerInterestRepository';
import {
  BUILDING_PORTFOLIO_OPTIONS,
  CAPITAL_RANGES,
  LOCATION_ACCESS_OPTIONS,
  LOCATION_COUNTS,
  LOCATION_TYPES,
  OWNER_PROFILES,
  type LocationType,
} from '@/types/machineOwnerInterest';
import { normalizeKenyanPhone, InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { isAcceptableEmailInput } from '@/lib/checkout/email';

export class MachineOwnerInterestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MachineOwnerInterestValidationError';
  }
}

export class MachineOwnerInterestRateLimitError extends Error {
  constructor() {
    super('We’ve already received several applications from here. Please try again later.');
    this.name = 'MachineOwnerInterestRateLimitError';
  }
}

const MAX_SHORT_FIELD = 120;

/** Same two-window shape as `investorInterestService` — a generous duplicate window for accidental double-taps, a short strict one against scripts. */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const MAX_LOCATION_TYPES = LOCATION_TYPES.length;

export interface MachineOwnerInterestSubmission {
  fullName: unknown;
  whatsapp: unknown;
  email?: unknown;
  capitalRange: unknown;
  locationAccess: unknown;
  /** Only meaningful when `locationAccess` is `'multiple'` — ignored otherwise, never required. */
  locationCount?: unknown;
  locationTypes?: unknown;
  ownerProfile: unknown;
  /** Only meaningful when `ownerProfile` is `'multiple_machines'` — ignored otherwise, never required. */
  buildingPortfolio?: unknown;
  /** The raw client address, hashed here and never stored as given. */
  submitterIp?: unknown;
}

export interface MachineOwnerInterestResult {
  interestId: string;
  /** True when this matched a recent submission from the same person and nothing new was written. */
  duplicate: boolean;
}

function requiredText(value: unknown, field: string, max = MAX_SHORT_FIELD): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MachineOwnerInterestValidationError(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new MachineOwnerInterestValidationError(`${field} is too long.`);
  }
  return trimmed;
}

/**
 * Owns applications from the public `/own` page (§ machine-owner
 * lead-generation landing page).
 *
 * Mirrors `InvestorInterestService`'s own discipline: every rule here
 * is enforced server-side, never trusted from the form alone, because
 * the route is reachable with `curl`.
 */
class MachineOwnerInterestService {
  async submit(input: MachineOwnerInterestSubmission): Promise<MachineOwnerInterestResult> {
    const fullName = requiredText(input.fullName, 'Your name');

    let whatsapp: string;
    try {
      whatsapp = normalizeKenyanPhone(requiredText(input.whatsapp, 'Your WhatsApp number'));
    } catch (error) {
      if (error instanceof InvalidPhoneNumberError) {
        throw new MachineOwnerInterestValidationError('Enter a WhatsApp number we can reach you on.');
      }
      throw error;
    }

    let email: string | null = null;
    if (input.email !== undefined && input.email !== null && input.email !== '') {
      const emailRaw = requiredText(input.email, 'Your email');
      if (!isAcceptableEmailInput(emailRaw)) {
        throw new MachineOwnerInterestValidationError('Enter an email address we can reply to, or leave it blank.');
      }
      email = emailRaw.toLowerCase();
    }

    const capitalRange = this.oneOf(CAPITAL_RANGES, input.capitalRange, 'How much capital you can deploy');
    const locationAccess = this.oneOf(LOCATION_ACCESS_OPTIONS, input.locationAccess, 'Whether you have access to a location');
    const ownerProfile = this.oneOf(OWNER_PROFILES, input.ownerProfile, 'What describes you best');
    const locationTypes = this.locationTypes(input.locationTypes);

    /*
     * Both of these are only ever asked conditionally in the form, so
     * they're validated as optional-if-present rather than required —
     * a client that never asked the question (because the branch
     * didn't apply) sends nothing, and nothing is exactly what gets
     * stored, never a guessed default.
     */
    const locationCount =
      locationAccess === 'multiple' && input.locationCount !== undefined
        ? this.oneOf(LOCATION_COUNTS, input.locationCount, 'Roughly how many potential locations')
        : null;
    const buildingPortfolio =
      ownerProfile === 'multiple_machines' && input.buildingPortfolio !== undefined
        ? this.oneOf(BUILDING_PORTFOLIO_OPTIONS, input.buildingPortfolio, 'Whether you’re building a portfolio')
        : null;

    const submitterHash = this.hashSubmitter(input.submitterIp);

    const now = Date.now();
    if (submitterHash) {
      const recent = await this.safeCount(submitterHash, new Date(now - RATE_LIMIT_WINDOW_MS));
      if (recent >= RATE_LIMIT_MAX) {
        throw new MachineOwnerInterestRateLimitError();
      }
    }

    /*
     * A repeat submission is answered exactly as a first one is — same
     * rationale as `InvestorInterestService`: nothing is written, the
     * list stays clean, and a prober learns nothing from the response.
     */
    const existing = await this.safeFindRecent(whatsapp, new Date(now - DUPLICATE_WINDOW_MS));
    if (existing) {
      return { interestId: existing.id, duplicate: true };
    }

    const record: MachineOwnerInterestInput = {
      fullName,
      whatsapp,
      email,
      capitalRange,
      locationAccess,
      locationCount,
      locationTypes,
      ownerProfile,
      buildingPortfolio,
      submitterHash,
    };

    const interestId = await machineOwnerInterestRepository.create(record);
    return { interestId, duplicate: false };
  }

  /**
   * Both anti-abuse reads need a composite index Firestore has to be
   * told about ahead of time (`firestore.indexes.json`), and that
   * deployment is a separate, human-triggered step (a GitHub Actions
   * secret someone has to add) from shipping this code. If that step
   * hasn't happened yet — or a query index is still asynchronously
   * building right after it has — these two calls fail with
   * `FAILED_PRECONDITION`, and a real applicant is the one who pays
   * for it if that failure is allowed to abort the whole submission.
   *
   * So each read is optional in effect, not in intent: a working index
   * still rate-limits and de-duplicates exactly as before; a missing
   * or not-yet-ready one degrades to "skip this check" rather than
   * "refuse every application," and the failure is logged so it's
   * still visible to whoever is watching function logs, not silently
   * swallowed forever.
   */
  private async safeCount(submitterHash: string, since: Date): Promise<number> {
    try {
      return await machineOwnerInterestRepository.countSince(submitterHash, since);
    } catch (error) {
      console.error('[machineOwnerInterestService] rate-limit check failed — continuing without it', error);
      return 0;
    }
  }

  private async safeFindRecent(whatsapp: string, since: Date): Promise<{ id: string } | null> {
    try {
      return await machineOwnerInterestRepository.findRecentByWhatsapp(whatsapp, since);
    } catch (error) {
      console.error('[machineOwnerInterestService] duplicate check failed — continuing without it', error);
      return null;
    }
  }

  private oneOf<T extends string>(options: readonly { value: T; label: string }[], value: unknown, field: string): T {
    const match = options.find((option) => option.value === value);
    if (!match) {
      throw new MachineOwnerInterestValidationError(`Choose an option for: ${field}.`);
    }
    return match.value;
  }

  private locationTypes(value: unknown): LocationType[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new MachineOwnerInterestValidationError('Location types must be a list.');
    }
    if (value.length > MAX_LOCATION_TYPES) {
      throw new MachineOwnerInterestValidationError('Too many location types selected.');
    }
    const valid = new Set(LOCATION_TYPES.map((option) => option.value));
    return value.filter((item): item is LocationType => typeof item === 'string' && valid.has(item as LocationType));
  }

  /** Empty string when there is no address to hash — the rate limit then simply does not apply to that request, same as `InvestorInterestService`'s own precedent. */
  private hashSubmitter(ip: unknown): string {
    if (typeof ip !== 'string' || ip.trim().length === 0) {
      return '';
    }
    const salt = process.env.INVESTOR_INTEREST_SALT ?? process.env.SMS_OPTOUT_SECRET ?? 'snack-quest';
    return createHash('sha256').update(`${salt}:${ip.trim()}`).digest('hex').slice(0, 32);
  }
}

export const machineOwnerInterestService = new MachineOwnerInterestService();
export { MachineOwnerInterestService };
