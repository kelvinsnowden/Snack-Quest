import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';

const { initiateStkPushMock } = vi.hoisted(() => ({ initiateStkPushMock: vi.fn() }));

vi.mock('@/lib/integrations/daraja/darajaGateway', () => ({
  darajaGateway: { initiateStkPush: initiateStkPushMock },
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
import { referralLinkRepository } from '@/repositories/referralLinkRepository';
import { JUMIA_PACKAGE_TRACKER_URL } from '@/lib/integrations/jumia/constants';
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
      courier: 'jumia',
      name: 'Kasarani Pickup Station',
      latitude: 0,
      longitude: 0,
      description: 'Next to the mall',
      county: 'Nairobi',
      town: 'Kasarani',
      zone: 'Nairobi',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      deliveryFeeKes: overrides.stationFeeKes ?? 300,
      isActive: true,
      searchTokens: ['kasarani', 'nairobi'],
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
    'domainEvents',
    'customerWallets',
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
      boltArrangedSeparately: false,
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
    await referralLinkRepository.create(
      {
        businessId: BUSINESS_ID,
        ownerId: 'creator-1',
        code: 'SAVE500',
        discountKes: 500,
        commissionKes: 250,
        isActive: true,
        clickCount: 0,
        conversionCount: 0,
      },
      'test',
    );

    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ referralCode: 'SAVE500' }));

    expect(result.pricing.discountKes).toBe(500);
    expect(result.pricing.totalKes).toBe(2300);

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot).toMatchObject({ referralOwnerId: 'creator-1', referralCommissionKes: 250 });
  });

  it('charges nothing extra for an unknown referral code — it just does not apply', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput({ referralCode: 'NOPE' }));

    expect(result.pricing.discountKes).toBe(0);
    expect(result.pricing.totalKes).toBe(2800);
  });
});

describe('startWebCheckout — delivery', () => {
  it('records the chosen station and the Jumia tracker on the snapshot', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot?.delivery).toMatchObject({
      method: 'pickup',
      provider: 'jumia',
      status: 'pending',
      pickupStationId: stationId,
      pickupStationName: 'Kasarani Pickup Station',
      feeKes: 300,
      trackingUrl: JUMIA_PACKAGE_TRACKER_URL,
    });
  });

  it('never charges for Bolt on a door delivery', async () => {
    const result = await service().startWebCheckout(
      BUSINESS_ID,
      pickupInput({
        deliveryMethod: 'door',
        pickupStationId: undefined,
        addressText: 'Kilimani, Argwings Kodhek Rd',
        estate: 'Wood Avenue Court',
      }),
    );

    expect(result.pricing.deliveryFeeKes).toBe(0);
    expect(result.pricing.boltArrangedSeparately).toBe(true);
    // The customer pays for the box only; the rider is settled directly.
    expect(result.pricing.totalKes).toBe(2500);
    expect(initiateStkPushMock).toHaveBeenCalledWith(expect.objectContaining({ amountKes: 2500 }));

    const conversation = await conversationRepository.findById(result.checkoutSessionId);
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      conversation!.conversationCheckoutSnapshotId!,
    );
    expect(snapshot?.delivery).toMatchObject({
      method: 'door',
      provider: 'bolt',
      status: 'pending_manual_booking',
      feeKes: 0,
      addressText: 'Kilimani, Argwings Kodhek Rd',
      estate: 'Wood Avenue Court',
      trackingUrl: null,
    });
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

  it('rejects a station belonging to another business', async () => {
    const foreignStation = await pickupStationRepository.create(
      {
        businessId: 'some-other-business',
        courier: 'jumia',
        name: 'Foreign Station',
        latitude: 0,
        longitude: 0,
        description: '',
        county: 'Nairobi',
        town: 'Nairobi',
        zone: 'Nairobi',
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

describe('getWebCheckoutStatus', () => {
  it('reports a pending payment with the details the payment screen renders', async () => {
    const result = await service().startWebCheckout(BUSINESS_ID, pickupInput());

    const status = await service().getWebCheckoutStatus(BUSINESS_ID, result.checkoutSessionId);

    expect(status).toMatchObject({
      checkoutSessionId: result.checkoutSessionId,
      paymentStatus: 'processing',
      orderId: null,
      deliveryMethod: 'pickup',
      customerName: 'Wanjiru Kamau',
      packageLabel: 'Premium Box',
    });
  });
});
