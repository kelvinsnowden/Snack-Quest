import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { STK_ATTEMPT_ABANDON_AFTER_MS } from '@/lib/checkout/stkTiming';

const { initiateStkPushMock, queryStkStatusMock } = vi.hoisted(() => ({
  initiateStkPushMock: vi.fn(),
  queryStkStatusMock: vi.fn(),
}));

vi.mock('@/lib/integrations/daraja/darajaGateway', () => ({
  darajaGateway: { initiateStkPush: initiateStkPushMock, queryStkStatus: queryStkStatusMock },
}));

import {
  ConversationService,
  WebCheckoutConflictError,
  WebCheckoutValidationError,
} from '@/services/conversationService';
import { InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationCheckoutSnapshotRepository } from '@/repositories/conversationCheckoutSnapshotRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { paymentService } from '@/services/paymentService';
import { orderRepository } from '@/repositories/orderRepository';
import { deliveryZoneRuleRepository } from '@/repositories/deliveryZoneRuleRepository';
import { referralLinkRepository } from '@/repositories/referralLinkRepository';
import { FakeWhatsAppGateway } from '../helpers/fakeWhatsAppGateway';

/**
 * `ConversationService.startWebCheckout` (§ Website Becomes the
 * Primary Commerce Channel) — the website's purchase path, against the
 * real emulator with only Daraja's HTTP call faked.
 *
 * What these prove is the property the whole design rests on: the
 * website is not allowed to price anything. The client sends
 * selections; the frozen snapshot's figures come from `packages` and
 * `pickupStations`, and the amount the customer is prompted for is
 * that snapshot's total, not anything the caller supplied.
 */

const BUSINESS_ID = 'biz-web-checkout-test';
const PHONE_TYPED = '0712345678';
const PHONE_NORMALIZED = '254712345678';

let packageId: string;
let stationId: string;

async function seed(overrides: { priceKes?: number; stockCount?: number; stationFeeKes?: number } = {}) {
  packageId = await packageRepository.create(
    {
      businessId: BUSINESS_ID,
      name: 'Premium Box',
      description: 'A premium snack box',
      priceKes: overrides.priceKes ?? 2500,
      isActive: true,
      imageUrl: null,
      ...(overrides.stockCount !== undefined ? { stockCount: overrides.stockCount } : {}),
    },
    'test',
  );
  stationId = await pickupStationRepository.create(
    {
      businessId: BUSINESS_ID,
      courier: 'fargo',
      name: 'Kasarani Pickup Station',
      latitude: 0,
      longitude: 0,
      description: 'Next to the mall',
      county: 'Nairobi',
      town: 'Kasarani',
      zone: 'Upcountry',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      deliveryFeeKes: overrides.stationFeeKes ?? 300,
      isActive: true,
      searchTokens: ['kasarani', 'nairobi'],
    },
    'test',
  );
}

/** A creator's one permanent link, on today's flat economics (§ flat affiliate commission). */
async function seedReferralLink() {
  await referralLinkRepository.create(
    {
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      code: 'SAVE500',
      discountKes: 500,
      commissionKes: 300,
      isActive: true,
      clickCount: 0,
      conversionCount: 0,
    },
    'test',
  );
}

function service() {
  return new ConversationService(new FakeWhatsAppGateway());
}

function pickupInput(overrides: Record<string, unknown> = {}) {
  return {
    packageId,
    quantity: 1,
    customerName: 'Wanjiru Kamau',
    phone: PHONE_TYPED,
    county: 'Nairobi',
    deliveryMethod: 'pickup' as const,
    pickupStationId: stationId,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  initiateStkPushMock.mockResolvedValue({
    checkoutRequestId: 'ws_CO_test',
    merchantRequestId: 'merchant_test',
  });
  for (const collection of [
    'conversations',
    'conversationCheckoutSnapshots',
    'packages',
    'pickupStations',
    'paymentIntents',
    'referralLinks',
    'deliveryZoneRules',
    'domainEvents',
    'customerWallets',
    // Every test in this file pushes under the same stubbed
    // `ws_CO_test` id, so a leftover idempotency record would make the
    // next test's payment look like one already settled.
    'webhookEvents',
    'snackItems',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
  await seed();
});

describe('startWebCheckout — pricing authority', () => {
  it('prices from the catalog and the station, and charges exactly that', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    expect(result.pricing).toMatchObject({
      packageLabel: 'Premium Box',
      quantity: 1,
      unitPriceKes: 2500,
      subtotalKes: 2500,
      discountKes: 0,
      deliveryFeeKes: 300,
      totalKes: 2800,
      serviceLevel: null,
    });
    expect(result.stkPushSent).toBe(true);
    expect(result.payingPhone).toBe(PHONE_NORMALIZED);

    // The STK prompt is for the snapshot's total, sent to the
    // normalized number — not to whatever the customer typed.
    expect(initiateStkPushMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID, phone: PHONE_NORMALIZED, amountKes: 2800 }),
    );
  });

  it('multiplies the unit price by quantity into the frozen snapshot', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ quantity: 3 }));

    expect(result.pricing.subtotalKes).toBe(7500);
    // The pickup fee is per shipment, not per box.
    expect(result.pricing.totalKes).toBe(7800);

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot).toMatchObject({ quantity: 3, subtotalKes: 7500, totalKes: 7800 });
  });

  it('ignores a stale catalog price the client might have been showing', async () => {
    // An admin raises the price after the page was rendered.
    await packageRepository.update(packageId, { priceKes: 3000 }, 'admin');

    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    expect(result.pricing.unitPriceKes).toBe(3000);
    expect(result.pricing.totalKes).toBe(3300);
  });

  it('applies a valid referral code, and freezes who earns the commission', async () => {
    await seedReferralLink();

    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ referralCode: 'SAVE500' }));

    expect(result.pricing.discountKes).toBe(500);
    expect(result.pricing.totalKes).toBe(2300);

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot).toMatchObject({ referralOwnerId: 'creator-1', referralCommissionKes: 300 });
  });

  it('never discounts the exit-intent rescue offer, even with a valid referral code — but still credits the creator and still delivers by pickup station', async () => {
    await seedReferralLink();
    const rescueOfferId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Test Box',
        description: '7 assorted snacks',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
      },
      'test',
    );

    const quote = await service().quoteWebCheckout(BUSINESS_ID, {
      packageId: rescueOfferId,
      quantity: 1,
      deliveryMethod: 'pickup',
      pickupStationId: stationId,
      referralCode: 'SAVE500',
      phone: PHONE_TYPED,
    });
    expect(quote?.referralCodeApplied).toBe(true);
    expect(quote?.pricing.discountKes).toBe(0);
    expect(quote?.pricing.totalKes).toBe(1800);

    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ packageId: rescueOfferId, referralCode: 'SAVE500' }),
    );

    expect(result.pricing).toMatchObject({
      packageLabel: 'Test Box',
      discountKes: 0,
      deliveryFeeKes: 300,
      totalKes: 1800,
    });

    // The referral is still recorded — the creator earns their
    // commission for driving the sale, they just don't stack a
    // discount on top of an already-discounted offer.
    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot).toMatchObject({
      referralOwnerId: 'creator-1',
      referralCommissionKes: 300,
      discountKes: 0,
      delivery: expect.objectContaining({ method: 'pickup', pickupStationId: stationId }),
    });
  });

  it('applies the creator discount when the checkout carries a verified creator session, and the quote matches the charge (§ Creator-Only Offers)', async () => {
    const quote = await service().quoteWebCheckout(BUSINESS_ID, {
      packageId,
      quantity: 1,
      deliveryMethod: 'pickup',
      pickupStationId: stationId,
      phone: PHONE_TYPED,
      isCreatorCheckout: true,
    });
    expect(quote?.pricing.discountKes).toBe(500);
    expect(quote?.pricing.totalKes).toBe(2300);

    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ isCreatorCheckout: true }),
    );
    expect(result.pricing.discountKes).toBe(500);
    expect(result.pricing.totalKes).toBe(2300);
  });

  it('never applies the creator discount without isCreatorCheckout set — a route that never verified a session cannot grant one', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    expect(result.pricing.discountKes).toBe(0);
  });

  it('stacks the creator discount with a valid referral code — a creator buying through their own link still gets both', async () => {
    await seedReferralLink();

    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ referralCode: 'SAVE500', isCreatorCheckout: true }),
    );

    expect(result.pricing.discountKes).toBe(1000);
    expect(result.pricing.totalKes).toBe(1800);
  });

  it('never applies the creator discount to the exit-intent rescue offer — it is already a one-time discounted price', async () => {
    const rescueOfferId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Test Box',
        description: '7 assorted snacks',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
      },
      'test',
    );

    const quote = await service().quoteWebCheckout(BUSINESS_ID, {
      packageId: rescueOfferId,
      quantity: 1,
      deliveryMethod: 'pickup',
      pickupStationId: stationId,
      phone: PHONE_TYPED,
      isCreatorCheckout: true,
    });
    expect(quote?.pricing.discountKes).toBe(0);

    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ packageId: rescueOfferId, isCreatorCheckout: true }),
    );
    expect(result.pricing.discountKes).toBe(0);
    expect(result.pricing.totalKes).toBe(1800);
  });

  it('stores the captured ad-click attribution on the new conversation (§ close the loop: ad-conversion attribution)', async () => {
    const attribution = { channel: 'web' as const, landingUrl: 'https://snackquests.shop/checkout', ttclid: 'tt-abc' };

    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ attribution }));

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    expect(conversation?.attributionSnapshot).toEqual(attribution);
  });

  it('leaves attributionSnapshot null when the route captured no attribution at all', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    expect(conversation?.attributionSnapshot).toBeNull();
  });

  it('charges nothing extra for an unknown referral code — it just does not apply', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ referralCode: 'NOPE' }));

    expect(result.pricing.discountKes).toBe(0);
    expect(result.pricing.totalKes).toBe(2800);
  });

  it('applies a referral code however the customer capitalised it', async () => {
    await seedReferralLink();

    // The regression this guards: codes are stored uppercase and
    // looked up by exact match, so a customer typing what they read on
    // a creator's post used to pay full price with no error anywhere,
    // and the creator earned nothing.
    //
    // A distinct phone per variant, not the shared PHONE_TYPED — each
    // call would otherwise be a second checkout for the same phone
    // while the first is still `awaiting_payment` (§ security audit:
    // wallet double-discount fix), which now correctly rejects with
    // WebCheckoutConflictError rather than silently freezing a second
    // snapshot. That guard is real product behavior; this test's job
    // is capitalization handling, not repeat-checkout blocking.
    const variants = ['save500', 'Save500', ' save500 ', 'SAVE500'];
    for (const [index, typed] of variants.entries()) {
      const result = await service().startWebCheckout(
        BUSINESS_ID,
        pickupInput({ referralCode: typed, phone: `07123456${70 + index}` }),
      );
      expect(result.pricing.discountKes).toBe(500);
      expect(result.pricing.totalKes).toBe(2300);
    }
  });

  it('quotes exactly what it will charge', async () => {
    await seedReferralLink();

    const quote = await service().quoteWebCheckout(BUSINESS_ID, {
      packageId,
      quantity: 2,
      deliveryMethod: 'pickup',
      pickupStationId: stationId,
      referralCode: 'save500',
      phone: PHONE_TYPED,
    });
    const charged = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ quantity: 2, referralCode: 'save500' }),
    );

    expect(quote?.referralCodeApplied).toBe(true);
    expect(quote?.pricing).toEqual(charged.pricing);
    expect(initiateStkPushMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountKes: quote!.pricing.totalKes }),
    );
  });

  it('tells the customer a code was rejected rather than silently ignoring it', async () => {
    const quote = await service().quoteWebCheckout(BUSINESS_ID, {
      packageId,
      quantity: 1,
      deliveryMethod: 'pickup',
      pickupStationId: stationId,
      referralCode: 'MADEUP',
    });

    expect(quote?.referralCodeApplied).toBe(false);
    expect(quote?.referralCodeRejected).toBe(true);
    expect(quote?.pricing.discountKes).toBe(0);
  });
});

describe('startWebCheckout — delivery', () => {
  it('records the chosen pickup point on the snapshot, with no tracking link to promise', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot?.delivery).toMatchObject({
      method: 'pickup',
      provider: 'tushop',
      status: 'pending',
      pickupStationId: stationId,
      pickupStationName: 'Kasarani Pickup Station',
      feeKes: 300,
      trackingUrl: null,
    });
  });

  /**
   * The inverse of what this used to assert. Door delivery priced at
   * zero while Bolt's fare was settled between customer and rider after
   * checkout; Fargo quotes a fixed price, so leaving it free would ship
   * every Nairobi order at the business's expense.
   */
  it('charges the Tushop door rate on a Nairobi delivery', async () => {
    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: BUSINESS_ID,
      zone: 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: 250,
    });

    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({
        deliveryMethod: 'door',
        pickupStationId: undefined,
        addressText: 'Kilimani, Argwings Kodhek Rd',
        estate: 'Wood Avenue Court',
      }),
    );

    expect(result.pricing.deliveryFeeKes).toBe(250);
    expect(result.pricing.serviceLevel).toBe('next-day');
    expect(result.pricing.totalKes).toBe(2750);
    expect(initiateStkPushMock).toHaveBeenCalledWith(expect.objectContaining({ amountKes: 2750 }));

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot?.delivery).toMatchObject({
      method: 'door',
      provider: 'tushop',
      status: 'pending_manual_booking',
      feeKes: 250,
      addressText: 'Kilimani, Argwings Kodhek Rd',
      estate: 'Wood Avenue Court',
      trackingUrl: null,
    });
  });

  /**
   * The production bug: `deliveryZoneRules` was seeded by
   * `scripts/seedFargoPickupPoints.mjs`, a plain script, not through
   * this repository. It collapses the em dash in "Nairobi Metro —
   * Next Day" into a hyphen when building the document id; the
   * repository's own id builder used to leave the em dash in place.
   * Every door lookup went to a different document than the one the
   * script wrote, so it always missed — while "Upcountry" has no dash
   * and worked, which is why pickup pricing looked fine and only door
   * delivery quoted nothing. Seeding through `upsertIfMissing` instead
   * of a raw write would hide this, since it uses the same builder as
   * the read — so this writes the document exactly as the script does.
   */
  it('finds the door rate even when it was seeded with the em dash already collapsed to a hyphen', async () => {
    await adminFirestore
      .collection('deliveryZoneRules')
      .doc('nairobi-metro---next-day:nairobi:small:tushop')
      .set({
        businessId: BUSINESS_ID,
        zone: 'Nairobi Metro — Next Day',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        courier: 'tushop',
        feeKes: 250,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({
        deliveryMethod: 'door',
        pickupStationId: undefined,
        addressText: 'Kilimani, Argwings Kodhek Rd',
        estate: 'Wood Avenue Court',
      }),
    );

    expect(result.pricing.deliveryFeeKes).toBe(250);
  });

  it('refuses door delivery outside Nairobi rather than promising it', async () => {
    await expect(
      service().startWebCheckout(
        BUSINESS_ID,
        pickupInput({
          deliveryMethod: 'door',
          pickupStationId: undefined,
          county: 'Kisumu',
          addressText: 'Milimani, Kisumu',
        }),
      ),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
  });

  it('rejects a pickup checkout with no station chosen', async () => {
    await expect(
      service().startWebCheckout(BUSINESS_ID, pickupInput({ pickupStationId: undefined })),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
  });

  it('refuses a station Jumia has not zoned, rather than shipping to it for free', async () => {
    // The real shape of the problem: about half this network sits in
    // towns Jumia's published zone list never names, so their delivery
    // cost is unknown. Such a station carries its county in `zone`,
    // which matches no rate — offering it would ship free.
    const unzoned = await pickupStationRepository.create(
      {
        businessId: BUSINESS_ID,
        courier: 'fargo',
        name: 'Nyali Pickup Station',
        latitude: 0,
        longitude: 0,
        description: '',
        county: 'Mombasa',
        town: 'Nyali',
        zone: 'Mombasa',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        deliveryFeeKes: 0,
        isActive: true,
        searchTokens: [],
      },
      'test',
    );

    await expect(
      service().startWebCheckout(BUSINESS_ID, pickupInput({ pickupStationId: unzoned })),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
    expect(initiateStkPushMock).not.toHaveBeenCalled();
  });

  it('rejects a station belonging to another business', async () => {
    const foreignStation = await pickupStationRepository.create(
      {
        businessId: 'some-other-business',
        courier: 'fargo',
        name: 'Foreign Station',
        latitude: 0,
        longitude: 0,
        description: '',
        county: 'Nairobi',
        town: 'Nairobi',
        zone: 'Upcountry',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        deliveryFeeKes: 0,
        isActive: true,
        searchTokens: [],
      },
      'test',
    );

    await expect(
      service().startWebCheckout(BUSINESS_ID, pickupInput({ pickupStationId: foreignStation })),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
  });
});

describe('startWebCheckout — validation', () => {
  it('rejects a phone number that is not a Kenyan mobile, before charging anything', async () => {
    await expect(
      service().startWebCheckout(BUSINESS_ID, pickupInput({ phone: '+1 555 010 4567' })),
    ).rejects.toBeInstanceOf(InvalidPhoneNumberError);

    expect(initiateStkPushMock).not.toHaveBeenCalled();
  });

  it('rejects a quantity beyond what stock allows', async () => {
    await adminFirestore.recursiveDelete(adminFirestore.collection('packages'));
    await seed({ stockCount: 2 });

    await expect(
      service().startWebCheckout(BUSINESS_ID, pickupInput({ quantity: 5 })),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
  });

  it('rejects an inactive box', async () => {
    await packageRepository.update(packageId, { isActive: false }, 'admin');

    await expect(service().startWebCheckout(BUSINESS_ID, pickupInput())).rejects.toBeInstanceOf(
      WebCheckoutValidationError,
    );
  });

  it('rejects a box belonging to another business', async () => {
    const foreignPackage = await packageRepository.create(
      {
        businessId: 'some-other-business',
        name: 'Not Ours',
        description: '',
        priceKes: 1,
        isActive: true,
        imageUrl: null,
      },
      'test',
    );

    await expect(
      service().startWebCheckout(BUSINESS_ID, pickupInput({ packageId: foreignPackage })),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
  });

  it('refuses to fire an STK push at a customer a human agent is already helping', async () => {
    const conversationId = await conversationRepository.create({
      businessId: BUSINESS_ID,
      phoneNumber: PHONE_NORMALIZED,
    });
    await conversationRepository.update(conversationId, { status: 'agent_assigned' });

    await expect(service().startWebCheckout(BUSINESS_ID, pickupInput())).rejects.toBeInstanceOf(
      WebCheckoutConflictError,
    );
    expect(initiateStkPushMock).not.toHaveBeenCalled();
  });
});

/**
 * A customer whose M-Pesa prompt never arrived must be able to try
 * again (§ Daraja M-Pesa Express production readiness).
 *
 * The guard that blocks a second checkout while the first is
 * `awaiting_payment` is real and protects a real thing — a second
 * snapshot frozen against a not-yet-debited wallet balance would apply
 * one balance as a discount twice. But it was unbounded, and its own
 * comment said it never stranded anyone because a failure callback
 * resets the status. That holds only while Safaricom actually reports.
 * A push accepted and never delivered — exactly what a passkey that
 * does not match its shortcode produces — sends no callback ever, so
 * the status never reset and the customer could not buy anything
 * again, from that phone number, indefinitely.
 */
describe('startWebCheckout — retrying after a prompt that never arrived', () => {
  /** The conversation's own clock: `appendMessage` stamps `lastMessageAt`, and the checkout appends right before it starts paying. */
  async function ageAwaitingPayment(conversationId: string, ageMs: number) {
    await adminFirestore
      .collection('conversations')
      .doc(conversationId)
      .update({ lastMessageAt: Timestamp.fromMillis(Date.now() - ageMs) });
  }

  it('still blocks a second push while the first prompt could be on the customer’s phone', async () => {
    const first = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    await ageAwaitingPayment(first.checkoutSessionId, 30_000);
    initiateStkPushMock.mockClear();

    await expect(service().startWebCheckout(BUSINESS_ID, pickupInput())).rejects.toBeInstanceOf(
      WebCheckoutConflictError,
    );
    expect(initiateStkPushMock).not.toHaveBeenCalled();
  });

  /** A dead end is not an error message. It has to say when, or the customer just presses the button again. */
  it('tells the customer how long until they can retry', async () => {
    const first = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    await ageAwaitingPayment(first.checkoutSessionId, 30_000);

    await expect(service().startWebCheckout(BUSINESS_ID, pickupInput())).rejects.toThrow(
      /you can try again in \d+ seconds/,
    );
  });

  /** The fix. Past the window the first prompt cannot still be answerable, so the race is over and a fresh attempt is allowed. */
  it('allows a fresh attempt once the prompt can no longer be answered', async () => {
    const first = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    await ageAwaitingPayment(first.checkoutSessionId, STK_ATTEMPT_ABANDON_AFTER_MS + 1_000);
    initiateStkPushMock.mockClear();

    const second = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    expect(second.stkPushSent).toBe(true);
    expect(initiateStkPushMock).toHaveBeenCalledTimes(1);
  });

  /**
   * The exact production sequence, end to end: a push Safaricom accepts
   * and never delivers, no callback, and the customer coming back to
   * the checkout page. Before this fix the second call threw and there
   * was no wait long enough to change that.
   */
  it('recovers from a push that was accepted and never delivered', async () => {
    const first = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    expect(first.stkPushSent).toBe(true);

    // No callback is processed here — that is the whole scenario.
    await ageAwaitingPayment(first.checkoutSessionId, STK_ATTEMPT_ABANDON_AFTER_MS + 1_000);

    const retry = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    expect(retry.pricing.totalKes).toBe(first.pricing.totalKes);
  });

  /** Failing open on an unreadable timestamp is the deliberate direction: a reconcilable race beats a customer who can never buy again. */
  it('does not lock the customer out when the timestamp is missing', async () => {
    const first = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    await adminFirestore
      .collection('conversations')
      .doc(first.checkoutSessionId)
      .update({ lastMessageAt: FieldValue.delete() });

    await expect(service().startWebCheckout(BUSINESS_ID, pickupInput())).resolves.toBeDefined();
  });

  /** Staff were always exempt — someone on the phone with a customer is not the race this guards against. */
  it('never blocked staff, and still does not', async () => {
    const first = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    await ageAwaitingPayment(first.checkoutSessionId, 5_000);

    await expect(
      service().startWebCheckout(BUSINESS_ID, {
        ...pickupInput(),
        initiatedBy: { staffUid: 'staff-1', staffName: 'Amina' },
      }),
    ).resolves.toBeDefined();
  });
});

/**
 * Optional email capture (§ optional email capture).
 *
 * The property under test is the same one throughout: this field never
 * costs a sale. Every order is reachable by phone already, so an
 * address is an extra, and a bad one is dropped rather than allowed to
 * reject a paying customer.
 */
describe('startWebCheckout — optional email', () => {
  async function snapshotFor(sessionId: string) {
    const conversation = await conversationRepository.findById(sessionId);
    return conversationCheckoutSnapshotRepository.findById(conversation!.conversationCheckoutSnapshotId!);
  }

  it('stores a usable address on the frozen snapshot, normalized', async () => {
    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ email: '  Wanjiru.Kamau@Example.COM ' }),
    );

    expect((await snapshotFor(result.checkoutSessionId))?.customerEmail).toBe('wanjiru.kamau@example.com');
  });

  /**
   * Absent, never `undefined`. Firestore rejects a document containing
   * an undefined value outright — the same fault that took the whole
   * checkout down once already, over an unrelated field.
   */
  it('omits the key entirely when no address was given', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    const snapshot = await snapshotFor(result.checkoutSessionId);

    expect(snapshot).not.toBeNull();
    expect('customerEmail' in (snapshot as object)).toBe(false);
  });

  it.each(['not-an-email', 'wanjiru@', '@example.com', '   '])(
    'takes the order anyway when the address is unusable (%s)',
    async (email) => {
      const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ email, phone: '0712345699' }));

      expect(result.stkPushSent).toBe(true);
      expect('customerEmail' in ((await snapshotFor(result.checkoutSessionId)) as object)).toBe(false);
    },
  );

  it('carries the address onto the order once payment completes', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ email: 'wanjiru@example.com' }));
    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const intents = await paymentIntentRepository.listByStatus(BUSINESS_ID, ['processing']);

    await service().handlePaymentResult({
      status: 'succeeded',
      intentId: intents[0].id,
      conversationId: result.checkoutSessionId,
      snapshotId: conversation!.conversationCheckoutSnapshotId!,
      amountKes: result.pricing.totalKes,
      mpesaReceiptNumber: 'NLJ7RT61SV',
    });

    const order = await orderRepository.findByConversationId(BUSINESS_ID, result.checkoutSessionId);
    expect(order?.data.customer.email).toBe('wanjiru@example.com');
  });
});

/**
 * The exact production failure this recovery exists for: Safaricom
 * accepted the push, charged the customer, confirmed success on their
 * own query API — and never delivered a callback. Before this, that
 * customer paid and no order was ever created.
 */
describe('a paid customer whose callback never arrives', () => {
  it('still gets an order, from Safaricom\'s own confirmation', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant_test',
      checkoutRequestId: 'ws_CO_test',
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
    });

    // No callback is ever delivered. This is the payment screen's poll.
    const recovered = await paymentService.recoverProcessingPayment(
      BUSINESS_ID,
      result.checkoutSessionId,
      { stuckAfterMs: 0 },
    );
    expect(recovered?.status).toBe('succeeded');
    await service().handlePaymentResult(recovered!);

    const order = await orderRepository.findByConversationId(BUSINESS_ID, result.checkoutSessionId);
    expect(order).not.toBeNull();
    expect(order?.data.pricing.totalKes).toBe(result.pricing.totalKes);
    // Null rather than invented — the query API carries no receipt, and
    // an absent one is already how a cash order records the same thing.
    expect(order?.data.payment.mpesaReceiptNumber).toBeNull();

    const status = await service().getWebCheckoutStatus(BUSINESS_ID, result.checkoutSessionId);
    expect(status.paymentStatus).toBe('succeeded');
    expect(status.orderNumber).not.toBeNull();
  });

  /**
   * The other half of recovering late: a failure settled by the
   * nightly sweep must release the conversation without writing to the
   * customer. "Reply PAY to try again" is right seconds after a
   * cancelled PIN prompt; delivered at 2am about yesterday's abandoned
   * attempt it is a message from nowhere.
   */
  it('releases a long-abandoned failed payment without messaging the customer', async () => {
    const gateway = new FakeWhatsAppGateway();
    const svc = new ConversationService(gateway);
    const result = await svc.startWebCheckout(BUSINESS_ID, pickupInput());
    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const intents = await paymentIntentRepository.listByStatus(BUSINESS_ID, ['processing']);
    gateway.sent.length = 0;

    await svc.handlePaymentResult({
      status: 'failed',
      intentId: intents[0].id,
      conversationId: result.checkoutSessionId,
      snapshotId: conversation!.conversationCheckoutSnapshotId!,
      reason: 'Request cancelled by user',
      stale: true,
    });

    expect(gateway.sent).toHaveLength(0);
    // Still released, or their next order would be blocked.
    const after = await conversationRepository.findById(result.checkoutSessionId);
    expect(after?.status).toBe('active');
  });

  it('does tell a customer still waiting that their payment failed', async () => {
    const gateway = new FakeWhatsAppGateway();
    const svc = new ConversationService(gateway);
    const result = await svc.startWebCheckout(BUSINESS_ID, pickupInput());
    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const intents = await paymentIntentRepository.listByStatus(BUSINESS_ID, ['processing']);
    gateway.sent.length = 0;

    await svc.handlePaymentResult({
      status: 'failed',
      intentId: intents[0].id,
      conversationId: result.checkoutSessionId,
      snapshotId: conversation!.conversationCheckoutSnapshotId!,
      reason: 'Request cancelled by user',
    });

    expect(gateway.sent.map((m) => m.text).join(' ')).toMatch(/Reply PAY to try again/);
  });

  it('does not create a second order when the real callback turns up late', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant_test',
      checkoutRequestId: 'ws_CO_test',
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 0,
      resultDesc: 'ok',
    });

    const recovered = await paymentService.recoverProcessingPayment(
      BUSINESS_ID,
      result.checkoutSessionId,
      { stuckAfterMs: 0 },
    );
    expect(recovered?.status).toBe('succeeded');
    const intentId = recovered && 'intentId' in recovered ? recovered.intentId : '';
    await service().handlePaymentResult(recovered!);

    // Safaricom finally delivers the callback, hours later.
    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    await service().handlePaymentResult({
      status: 'succeeded',
      intentId,
      conversationId: result.checkoutSessionId,
      snapshotId: conversation!.conversationCheckoutSnapshotId!,
      amountKes: result.pricing.totalKes,
      mpesaReceiptNumber: 'NLJ7RT61SV',
    });

    const orders = await adminFirestore
      .collection('orders')
      .where('businessId', '==', BUSINESS_ID)
      .where('conversationId', '==', result.checkoutSessionId)
      .get();
    expect(orders.size).toBe(1);
  });
});

/**
 * A payment can be confirmed succeeded twice for one real transaction:
 * a super admin completes it manually (§ payment reconciliation:
 * complete manually) after Daraja confirms success but the callback
 * never arrives, and then the real callback turns up late anyway. Both
 * call `handlePaymentResult` believing they are the one confirming
 * payment — only the first is allowed to create an order.
 */
describe('handlePaymentResult — a snapshot already turned into an order', () => {
  it('does not create a second order for a second "succeeded" signal', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());
    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const intents = await paymentIntentRepository.listByStatus(BUSINESS_ID, ['processing']);
    const succeeded = {
      status: 'succeeded' as const,
      intentId: intents[0].id,
      conversationId: result.checkoutSessionId,
      snapshotId: conversation!.conversationCheckoutSnapshotId!,
      amountKes: result.pricing.totalKes,
      mpesaReceiptNumber: 'NLJ7RT61SV',
    };

    await service().handlePaymentResult(succeeded);
    // A late real callback, or a second reconciliation pass, believing
    // the same thing all over again.
    await service().handlePaymentResult({ ...succeeded, mpesaReceiptNumber: 'DIFFERENTCODE' });

    const orders = await adminFirestore
      .collection('orders')
      .where('businessId', '==', BUSINESS_ID)
      .where('conversationId', '==', result.checkoutSessionId)
      .get();
    expect(orders.size).toBe(1);
  });
});

/**
 * The quote and the charge must agree (§ Tushop door delivery).
 *
 * This is the invariant the file already rests on for pickup, and it
 * broke for door delivery the moment Tushop started charging for it:
 * `startWebCheckout` learned the new fee, `quoteWebCheckout` did not,
 * and the page showed "Free" before taking KES 250. A customer being
 * charged more than they were quoted is the worst class of bug this
 * checkout can have.
 */
describe('quoting door delivery', () => {
  async function seedDoorRate(feeKes: number, serviceLevel: 'next-day' | 'same-day' = 'next-day') {
    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: BUSINESS_ID,
      zone: serviceLevel === 'same-day' ? 'Nairobi Metro — Same Day' : 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes,
    });
  }

  it('quotes exactly what the door order will be charged', async () => {
    await seedDoorRate(250);

    const quote = await service().quoteWebCheckout(BUSINESS_ID, {
      packageId,
      quantity: 1,
      deliveryMethod: 'door',
      phone: PHONE_TYPED,
    });
    const charged = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ deliveryMethod: 'door', pickupStationId: undefined, addressText: 'Kilimani, Argwings Kodhek Rd' }),
    );

    expect(quote?.pricing.deliveryFeeKes).toBe(250);
    expect(quote?.pricing).toEqual(charged.pricing);
  });

  /** Never "Free". A zero here would quote a delivery the charge path is about to refuse as unpriced. */
  it('declines to quote at all when no door rate is configured', async () => {
    const quote = await service().quoteWebCheckout(BUSINESS_ID, {
      packageId,
      quantity: 1,
      deliveryMethod: 'door',
      phone: PHONE_TYPED,
    });

    expect(quote).toBeNull();
  });

  it('quotes the same-day rate when same-day is asked for', async () => {
    await seedDoorRate(439, 'same-day');

    const quote = await service().quoteWebCheckout(BUSINESS_ID, {
      packageId,
      quantity: 1,
      deliveryMethod: 'door',
      serviceLevel: 'same-day',
      phone: PHONE_TYPED,
    });

    expect(quote?.pricing.deliveryFeeKes).toBe(439);
  });
});

describe('startWebCheckout — payment hand-off', () => {
  it('creates a payment intent against the frozen snapshot', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    expect(conversation?.status).toBe('awaiting_payment');

    const intents = await paymentIntentRepository.listByStatus(BUSINESS_ID, ['processing']);
    expect(intents).toHaveLength(1);
    expect(intents[0].data).toMatchObject({
      conversationId: result.checkoutSessionId,
      conversationCheckoutSnapshotId: conversation!.conversationCheckoutSnapshotId,
      amountKes: 2800,
      phoneNumber: PHONE_NORMALIZED,
    });
  });

  it('reports a failed STK initiation instead of pretending the prompt was sent', async () => {
    initiateStkPushMock.mockRejectedValue(new Error('Daraja unreachable'));

    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    expect(result.stkPushSent).toBe(false);
    // The snapshot survives, so a retry re-prices nothing.
    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    expect(conversation?.conversationCheckoutSnapshotId).toBeTruthy();
    expect(conversation?.status).toBe('active');
  });
});

describe('startWebCheckout — staff-initiated', () => {
  const STAFF = { staffUid: 'staff-1', staffName: 'Achieng' };

  it('prices a staff order exactly like a customer order', async () => {
    // Different phones: the staff order deliberately stays exempt from
    // the awaiting-payment checkout guard (§ security audit — wallet
    // double-discount fix) so a staff member can place it regardless of
    // any in-flight self-checkout, but that guard would otherwise
    // correctly block a second, customer-initiated checkout for the
    // very same phone right behind it — a real product behavior this
    // test isn't exercising, so it shouldn't collide with it here.
    const staffOrder = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ initiatedBy: STAFF }),
    );
    const customerOrder = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ phone: '0798765432' }),
    );

    // A faster way to start an order, never a privileged way to price one.
    expect(staffOrder.pricing).toEqual(customerOrder.pricing);
  });

  it('warns the customer on WhatsApp before the prompt arrives', async () => {
    const gateway = new FakeWhatsAppGateway();
    const svc = new ConversationService(gateway);

    await svc.startWebCheckout(BUSINESS_ID, pickupInput({ initiatedBy: STAFF }));

    const toCustomer = gateway.sent.find((message) => message.phone === PHONE_NORMALIZED);
    expect(toCustomer).toBeDefined();
    expect(toCustomer!.text).toContain('Achieng');
    expect(toCustomer!.text).toContain('2800');
    // An unexplained M-Pesa prompt reads as a scam; the way out has to
    // be stated, not implied.
    expect(toCustomer!.text).toMatch(/ignore it and nothing will be charged/i);
  });

  it('says nothing to a customer who checked out themselves', async () => {
    const gateway = new FakeWhatsAppGateway();
    const svc = new ConversationService(gateway);

    await svc.startWebCheckout(BUSINESS_ID, pickupInput());

    expect(gateway.sent.filter((message) => message.phone === PHONE_NORMALIZED)).toHaveLength(0);
  });

  it('records who took the order', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ initiatedBy: STAFF }));

    const events = await adminFirestore.collection('domainEvents').get();
    const event = events.docs.map((doc) => doc.data()).find((data) => data.type === 'StaffInitiatedCheckout');
    expect(event).toMatchObject({
      businessId: BUSINESS_ID,
      aggregateId: result.checkoutSessionId,
      payload: { staffUid: 'staff-1', staffName: 'Achieng', totalKes: 2800 },
    });
  });

  it('lets staff take an order for a customer whose thread they have already taken over', async () => {
    const conversationId = await conversationRepository.create({
      businessId: BUSINESS_ID,
      phoneNumber: PHONE_NORMALIZED,
    });
    await conversationRepository.update(conversationId, { status: 'agent_assigned' });

    // The customer-facing guard exists to stop a second channel firing
    // an STK push at someone a human is helping. Staff *are* that
    // human, and this is the case the feature exists for.
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ initiatedBy: STAFF }));
    expect(result.stkPushSent).toBe(true);
  });
});

describe('getWebCheckoutStatus', () => {
  it('reports a pending payment with the details the payment screen renders', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    const status = await service().getWebCheckoutStatus(BUSINESS_ID, result.checkoutSessionId);

    expect(status).toMatchObject({
      checkoutSessionId: result.checkoutSessionId,
      paymentStatus: 'processing',
      orderId: null,
      orderNumber: null,
      // No Order exists yet — this must come from the frozen snapshot,
      // or the payment screen has nothing to show while it waits.
      totalKes: 2800,
      deliveryMethod: 'pickup',
      customerName: 'Wanjiru Kamau',
      packageLabel: 'Premium Box',
    });
  });
});


/**
 * "Choose 5, discover the rest" (§ Premium), end to end: the picks the
 * customer made have to reach the packing list, and a request that
 * bypassed the picker must not.
 */
describe('guaranteed picks on a Premium box', () => {
  const PREMIUM_ID = 'premium-box';

  async function seedPremium() {
    await adminFirestore.collection('packages').doc(PREMIUM_ID).set({
      businessId: BUSINESS_ID,
      name: 'Premium Box',
      description: 'Pick 5, we surprise you with the rest.',
      priceKes: 5000,
      isActive: true,
      imageUrl: null,
      guaranteedPickCount: 5,
      highlightLabel: 'BEST VALUE',
    });
    const ids: string[] = [];
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const ref = adminFirestore.collection('snackItems').doc(`snack-${name}`);
      await ref.set({
        businessId: BUSINESS_ID,
        name: `Snack ${name}`,
        imageUrl: null,
        expectedUnitCostKes: 100,
        unitLabel: 'bag',
        origin: 'Japan',
        sourcingNote: null,
        isActive: true,
        availableForPremiumSelection: true,
      });
      ids.push(ref.id);
    }
    return ids;
  }

  it('carries the five picks from checkout onto the order', async () => {
    const ids = await seedPremium();

    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ packageId: PREMIUM_ID, guaranteedSnackIds: ids.slice(0, 5) }),
    );

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot?.guaranteedPicks).toHaveLength(5);
    expect(snapshot?.guaranteedPicks?.[0]).toMatchObject({ snackItemId: ids[0], name: 'Snack A' });

    await service().handlePaymentResult({
      status: 'succeeded',
      intentId: (await paymentIntentRepository.listByStatus(BUSINESS_ID, ['processing']))[0].id,
      conversationId: result.checkoutSessionId,
      snapshotId: conversation!.conversationCheckoutSnapshotId!,
      amountKes: result.pricing.totalKes,
      mpesaReceiptNumber: 'NLJ7RT61SV',
    });

    const order = await orderRepository.findByConversationId(BUSINESS_ID, result.checkoutSessionId);
    expect(order?.data.product.guaranteedPicks).toHaveLength(5);
    expect(order?.data.product.guaranteedPicks?.map((pick) => pick.name)).toContain('Snack A');
  });

  it('refuses a checkout that sent the wrong number of picks', async () => {
    const ids = await seedPremium();

    await expect(
      service().startWebCheckout(
        BUSINESS_ID,
        pickupInput({ packageId: PREMIUM_ID, guaranteedSnackIds: ids.slice(0, 3) }),
      ),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
    expect(initiateStkPushMock).not.toHaveBeenCalled();
  });

  /** The picker never offers it, so only a tampered request could ask for it. */
  it('refuses a snack that is not open for picking', async () => {
    const ids = await seedPremium();
    await adminFirestore
      .collection('snackItems')
      .doc(ids[4])
      .update({ availableForPremiumSelection: false });

    await expect(
      service().startWebCheckout(
        BUSINESS_ID,
        pickupInput({ packageId: PREMIUM_ID, guaranteedSnackIds: ids.slice(0, 5) }),
      ),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
  });

  it('leaves a fully-curated box with no picks at all', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    // Absent, not empty: this box has nothing to pick.
    expect(snapshot?.guaranteedPicks).toBeUndefined();
  });

  /** Local to this block; the identically-named one above belongs to the staff-orders describe. */
  const PICKING_STAFF = { staffUid: 'staff-7', staffName: 'Achieng' };

  /**
   * Staff taking an order by phone can choose the snacks too
   * (§ staff pick the snacks too) — the admin dialog sends the same
   * `guaranteedSnackIds` a customer's own checkout does.
   */
  it('carries picks chosen by a staff member onto a staff-initiated order', async () => {
    const ids = await seedPremium();

    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({
        packageId: PREMIUM_ID,
        guaranteedSnackIds: ids.slice(0, 5),
        initiatedBy: PICKING_STAFF,
      }),
    );

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot?.guaranteedPicks).toHaveLength(5);
    expect(snapshot?.guaranteedPicks?.map((pick) => pick.snackItemId)).toEqual(ids.slice(0, 5));
  });

  /**
   * The property worth stating outright: staff go *through* the pick
   * validation, not around it. Being trusted to take an order is not
   * the same as being able to put a snack in a box that has run out,
   * and a picker left open on a stale list is exactly how that would
   * otherwise happen.
   */
  it('refuses a staff order with the wrong number of picks, exactly as a customer one', async () => {
    const ids = await seedPremium();

    await expect(
      service().startWebCheckout(
        BUSINESS_ID,
        pickupInput({
          packageId: PREMIUM_ID,
          guaranteedSnackIds: ids.slice(0, 4),
          initiatedBy: PICKING_STAFF,
        }),
      ),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
  });

  it('refuses a staff order naming a snack that has run out', async () => {
    const ids = await seedPremium();
    await adminFirestore.collection('snackItems').doc(ids[2]).update({ stockCount: 0 });

    await expect(
      service().startWebCheckout(
        BUSINESS_ID,
        pickupInput({
          packageId: PREMIUM_ID,
          guaranteedSnackIds: ids.slice(0, 5),
          initiatedBy: PICKING_STAFF,
        }),
      ),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
  });
});

/**
 * More than one box on a single order (§ more than one box per order).
 *
 * A customer asked for one of each and the shop could only sell them
 * one. What these guard is the half of that change which is dangerous:
 * the money and the stock. A two-box order that charges for one, or
 * reserves one, is worse than not selling it at all.
 */
describe('more than one box on an order', () => {
  let secondBoxId: string;

  beforeEach(async () => {
    secondBoxId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Deluxe Box',
        description: 'A bigger box',
        priceKes: 3500,
        isActive: true,
        imageUrl: null,
        stockCount: 5,
      },
      'test',
    );
  });

  it('charges the sum of both boxes, not just the first', async () => {
    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({
        items: [
          { packageId, quantity: 1 },
          { packageId: secondBoxId, quantity: 2 },
        ],
      }),
    );

    // 2500 + (3500 x 2) = 9500, plus the 300 station fee.
    expect(result.pricing.subtotalKes).toBe(9500);
    expect(result.pricing.totalKes).toBe(9800);
    // The prompt is for the whole order, never the first line.
    expect(initiateStkPushMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountKes: 9800 }),
    );
  });

  it('charges one delivery fee, not one per box', async () => {
    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({
        items: [
          { packageId, quantity: 1 },
          { packageId: secondBoxId, quantity: 1 },
        ],
      }),
    );

    expect(result.pricing.deliveryFeeKes).toBe(300);
  });

  it('freezes every line onto the snapshot', async () => {
    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({
        items: [
          { packageId, quantity: 1 },
          { packageId: secondBoxId, quantity: 2 },
        ],
      }),
    );

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot?.items).toHaveLength(2);
    expect(snapshot?.items?.[1]).toMatchObject({
      packageId: secondBoxId,
      packageLabel: 'Deluxe Box',
      quantity: 2,
      unitPriceKes: 3500,
    });
    // The first line stays where it always was, so everything that
    // predates line items keeps reading the order correctly.
    expect(snapshot?.packageId).toBe(packageId);
    expect(snapshot?.quantity).toBe(1);
  });

  /** The single-box order must be untouched by all of this. */
  it('writes no items array at all for a one-box order', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot?.items).toBeUndefined();
    expect(snapshot?.subtotalKes).toBe(2500);
  });

  it('refuses the same box twice rather than guessing which count was meant', async () => {
    await expect(
      service().startWebCheckout(
        BUSINESS_ID,
        pickupInput({
          items: [
            { packageId, quantity: 1 },
            { packageId, quantity: 2 },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(WebCheckoutValidationError);
  });

  it('names the box that is short, not just "out of stock"', async () => {
    await packageRepository.update(secondBoxId, { stockCount: 1 }, 'admin');

    await expect(
      service().startWebCheckout(
        BUSINESS_ID,
        pickupInput({
          items: [
            { packageId, quantity: 1 },
            { packageId: secondBoxId, quantity: 3 },
          ],
        }),
      ),
    ).rejects.toThrow(/Deluxe Box/);
  });

  it('refuses an order where two boxes both want snacks chosen', async () => {
    await packageRepository.update(packageId, { guaranteedPickCount: 5 }, 'admin');
    await packageRepository.update(secondBoxId, { guaranteedPickCount: 5 }, 'admin');

    await expect(
      service().startWebCheckout(
        BUSINESS_ID,
        pickupInput({
          items: [
            { packageId, quantity: 1 },
            { packageId: secondBoxId, quantity: 1 },
          ],
        }),
      ),
    ).rejects.toThrow(/one box per order/i);
  });
});

/**
 * The half of a two-box order that costs real money if it is wrong:
 * what actually gets reserved and what actually gets packed
 * (§ more than one box per order).
 */
describe('a paid two-box order', () => {
  it('reserves stock for both boxes and records both as line items', async () => {
    await packageRepository.update(packageId, { stockCount: 10 }, 'admin');
    const secondBoxId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Deluxe Box',
        description: 'A bigger box',
        priceKes: 3500,
        isActive: true,
        imageUrl: null,
        stockCount: 10,
      },
      'test',
    );

    const svc = service();
    const result = await svc.startWebCheckout(
      BUSINESS_ID,
      pickupInput({
        items: [
          { packageId, quantity: 2 },
          { packageId: secondBoxId, quantity: 3 },
        ],
      }),
    );
    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const intents = await paymentIntentRepository.listByStatus(BUSINESS_ID, ['processing']);

    await svc.handlePaymentResult({
      status: 'succeeded',
      intentId: intents[0].id,
      conversationId: result.checkoutSessionId,
      snapshotId: conversation!.conversationCheckoutSnapshotId!,
      amountKes: result.pricing.totalKes,
      mpesaReceiptNumber: 'NLJ7RT61SV',
    });

    // Both boxes left the shelf — the failure this guards against is
    // an order that takes money for two and reserves one.
    expect((await packageRepository.findById(BUSINESS_ID, packageId))?.stockCount).toBe(8);
    expect((await packageRepository.findById(BUSINESS_ID, secondBoxId))?.stockCount).toBe(7);

    const order = await orderRepository.findByConversationId(BUSINESS_ID, result.checkoutSessionId);
    expect(order).not.toBeNull();
    expect(order?.data.product.items).toHaveLength(2);

    // The packing list is built from the subcollection, so it has to
    // hold both lines too — each at its own price, never the order's
    // subtotal divided by the first line's count.
    const items = await orderRepository.listItems(order!.id);
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.packageId === packageId)).toMatchObject({
      quantity: 2,
      unitCostKes: 2500,
    });
    expect(items.find((item) => item.packageId === secondBoxId)).toMatchObject({
      quantity: 3,
      unitCostKes: 3500,
    });
  });
});

/**
 * The customer pays for the boxes now and hands the delivery fee to
 * the courier at the door (§ delivery paid on delivery).
 *
 * The distinction that matters throughout: `feeKes` still records the
 * real figure — the courier has to know what to collect, and the
 * business has to know what it is owed — and only `totalKes`, which is
 * what M-Pesa asks for, leaves it out. A test that only checked the
 * total would pass just as happily if the fee had been erased.
 */
describe('a delivery fee collected at the door', () => {
  const STAFF = { staffUid: 'staff-1', staffName: 'Achieng' };

  it('charges for the boxes only, while still recording what the courier collects', async () => {
    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ initiatedBy: STAFF, deliveryFeeOnDelivery: true }),
    );

    // 2500 for the box; the 300 fee is real but not in the prompt.
    expect(result.pricing.deliveryFeeKes).toBe(300);
    expect(result.pricing.totalKes).toBe(2500);
    expect(initiateStkPushMock).toHaveBeenCalledWith(expect.objectContaining({ amountKes: 2500 }));

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    // Frozen on the order itself, because this is read at the door by
    // someone who was not on the phone call that agreed it.
    expect(snapshot?.delivery).toMatchObject({ feeKes: 300, feeCollection: 'on_delivery' });
    expect(snapshot?.totalKes).toBe(2500);
  });

  it('tells the customer what the courier will ask for', async () => {
    const gateway = new FakeWhatsAppGateway();
    const svc = new ConversationService(gateway);

    await svc.startWebCheckout(
      BUSINESS_ID,
      pickupInput({ initiatedBy: STAFF, deliveryFeeOnDelivery: true }),
    );

    const toCustomer = gateway.sent.find((message) => message.phone === PHONE_NORMALIZED);
    // Being charged 2500 and then asked for 300 more at the door is
    // the surprise this line exists to prevent.
    expect(toCustomer!.text).toMatch(/300 to the courier/i);
  });

  it('says nothing about a courier when the fee is prepaid', async () => {
    const gateway = new FakeWhatsAppGateway();
    const svc = new ConversationService(gateway);

    await svc.startWebCheckout(BUSINESS_ID, pickupInput({ initiatedBy: STAFF }));

    const toCustomer = gateway.sent.find((message) => message.phone === PHONE_NORMALIZED);
    // Not the word "courier" — the pickup label itself reads "Fargo
    // Courier pickup". What must be absent is the money sentence.
    expect(toCustomer!.text).not.toMatch(/to the courier on delivery/i);
    expect(toCustomer!.text).toContain('2800');
  });

  /*
   * The one that actually guards the money. This is an arrangement a
   * staff member makes, and the field arrives over an HTTP body — so a
   * customer posting it at the public checkout must simply be charged
   * the fee as normal.
   */
  it('ignores a customer who asks to pay the fee on delivery', async () => {
    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({ deliveryFeeOnDelivery: true }),
    );

    expect(result.pricing.totalKes).toBe(2800);
    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot?.delivery).not.toHaveProperty('feeCollection');
  });
});
