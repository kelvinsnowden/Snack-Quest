import 'server-only';

import { creatorRepository } from '@/repositories/creatorRepository';
import { userRepository } from '@/repositories/userRepository';
import { CreatorNotFoundError } from '@/services/creatorDashboardService';
import { publishEvent } from '@/lib/events/eventBus';
import type { PaymentPreference } from '@/types';

export { CreatorNotFoundError };

export class OnboardingAlreadyCompletedError extends Error {
  constructor(uid: string) {
    super(`${uid} already completed onboarding`);
    this.name = 'OnboardingAlreadyCompletedError';
  }
}

export class InvalidOnboardingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOnboardingInputError';
  }
}

export class InvalidProfileUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProfileUpdateError';
  }
}

const VALID_PAYMENT_PREFERENCES: PaymentPreference[] = ['mpesa', 'bank'];
const PAYOUT_PHONE_PATTERN = /^254\d{9}$/;

export interface CompleteOnboardingInput {
  bio: string;
  niche: string;
  followersRange: string;
  paymentPreference: PaymentPreference;
  socialHandles: Record<string, string>;
}

function assertValid(input: CompleteOnboardingInput): void {
  if (!input.bio.trim()) {
    throw new InvalidOnboardingInputError('Bio is required');
  }
  if (!input.niche.trim()) {
    throw new InvalidOnboardingInputError('Niche is required');
  }
  if (!input.followersRange.trim()) {
    throw new InvalidOnboardingInputError('Follower range is required');
  }
  if (!VALID_PAYMENT_PREFERENCES.includes(input.paymentPreference)) {
    throw new InvalidOnboardingInputError('Payment preference must be "mpesa" or "bank"');
  }
  if (!Object.values(input.socialHandles).some((handle) => handle.trim())) {
    throw new InvalidOnboardingInputError('At least one social media handle is required');
  }
}

export interface UpdateProfileInput {
  bio: string;
  niche: string;
  followersRange: string;
  paymentPreference: PaymentPreference;
  payoutPhoneNumber: string | null;
  socialHandles: Record<string, string>;
}

function assertValidUpdate(input: UpdateProfileInput): void {
  if (!input.bio.trim()) {
    throw new InvalidProfileUpdateError('Bio is required');
  }
  if (!input.niche.trim()) {
    throw new InvalidProfileUpdateError('Niche is required');
  }
  if (!input.followersRange.trim()) {
    throw new InvalidProfileUpdateError('Follower range is required');
  }
  if (!VALID_PAYMENT_PREFERENCES.includes(input.paymentPreference)) {
    throw new InvalidProfileUpdateError('Payment preference must be "mpesa" or "bank"');
  }
  if (input.payoutPhoneNumber !== null && !PAYOUT_PHONE_PATTERN.test(input.payoutPhoneNumber)) {
    throw new InvalidProfileUpdateError('Payout phone must be E.164 without the leading "+", e.g. "254712345678".');
  }
}

/**
 * Owns a creator's self-service profile writes (§ Creator Portal
 * auth) — currently just onboarding completion, the one profile write
 * every creator makes exactly once between registering and reaching
 * the dashboard. `firestore.rules` already lets a creator edit their
 * own non-financial profile fields directly from the client (see the
 * `creatorProfiles` match block), but onboarding completion goes
 * through here instead so it stays a deliberate, validated, one-time
 * transition rather than an arbitrary field patch — and so it can
 * publish `CreatorOnboardingCompleted` the same way every other
 * state-changing creator action does (§8).
 */
class CreatorProfileService {
  async completeOnboarding(uid: string, input: CompleteOnboardingInput): Promise<void> {
    const profile = await creatorRepository.findById(uid);
    if (!profile) {
      throw new CreatorNotFoundError(uid);
    }
    if (profile.onboardingCompleted) {
      throw new OnboardingAlreadyCompletedError(uid);
    }
    assertValid(input);

    await creatorRepository.update(uid, {
      bio: input.bio.trim(),
      niche: input.niche.trim(),
      followersRange: input.followersRange.trim(),
      paymentPreference: input.paymentPreference,
      socialHandles: input.socialHandles,
      onboardingCompleted: true,
      updatedBy: uid,
    });

    await publishEvent(profile.businessId, 'CreatorOnboardingCompleted', 'creatorProfile', uid, {});
  }

  /** § Creator Portal profile management — editing after onboarding, unlike `completeOnboarding` this can be called any number of times. */
  async updateProfile(uid: string, input: UpdateProfileInput): Promise<void> {
    const profile = await creatorRepository.findById(uid);
    if (!profile) {
      throw new CreatorNotFoundError(uid);
    }
    assertValidUpdate(input);

    await creatorRepository.update(uid, {
      bio: input.bio.trim(),
      niche: input.niche.trim(),
      followersRange: input.followersRange.trim(),
      paymentPreference: input.paymentPreference,
      payoutPhoneNumber: input.payoutPhoneNumber,
      socialHandles: input.socialHandles,
      updatedBy: uid,
    });
  }

  /**
   * § Creator Portal profile photos — lives on `users/{uid}`, not
   * `creatorProfiles/{uid}`, since a photo is identity (shared across
   * every role a uid might hold) rather than a creator-specific
   * business field. `photoURL` itself is never trusted from the
   * client as arbitrary text: it's always the URL `storageService`
   * just returned from an actual upload to this creator's own
   * `creators/{businessId}/` prefix.
   */
  async updatePhoto(uid: string, photoURL: string | null): Promise<void> {
    const profile = await creatorRepository.findById(uid);
    if (!profile) {
      throw new CreatorNotFoundError(uid);
    }
    if (photoURL !== null && !photoURL.trim()) {
      throw new InvalidProfileUpdateError('photoURL must be a non-empty string or null');
    }

    await userRepository.updatePhoto(uid, photoURL, uid);
  }
}

export const creatorProfileService = new CreatorProfileService();
