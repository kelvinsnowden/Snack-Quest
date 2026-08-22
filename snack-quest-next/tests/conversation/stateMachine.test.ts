import { describe, expect, it } from 'vitest';
import {
  DOOR_DELIVERY_PRICED_MESSAGE,
  PAYMENT_CONFIRMATION_KEYWORDS,
  PAYMENT_CONFIRMATION_REMINDER,
  formatFinalOrderSummaryMessage,
  startConversationMessages,
  transition,
  type ConversationTransitionContext,
} from '@/lib/conversation/stateMachine';

const PACKAGES = [
  { id: 'box-2500', name: 'Starter Box', priceKes: 2500 },
  { id: 'box-3500', name: 'Deluxe Box', priceKes: 3500 },
  { id: 'box-5000', name: 'Premium Box', priceKes: 5000 },
];

const nairobiContext: ConversationTransitionContext = {
  availablePackages: PACKAGES,
  isNairobi: true,
  // Fargo's configured door rate, resolved by the Service before the
  // state machine runs — the machine never reads Firestore.
  doorDeliveryFeeKes: 250,
};

const upcountryContext: ConversationTransitionContext = {
  availablePackages: PACKAGES,
  isNairobi: false,
};

describe('startConversationMessages', () => {
  it('lists every active package and moves to awaiting_package_selection', () => {
    const result = startConversationMessages(PACKAGES);
    expect(result.nextStep).toBe('awaiting_package_selection');
    expect(result.botReply).toContain('Starter Box');
    expect(result.botReply).toContain('2500');
    expect(result.botReply).toContain('Deluxe Box');
    expect(result.botReply).toContain('Premium Box');
  });
});

describe('transition: awaiting_package_selection', () => {
  it('selects a package by numeric index', () => {
    const result = transition({
      currentStep: 'awaiting_package_selection',
      stateBlob: {},
      inboundText: '2',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_customer_details');
    expect(result.stateBlobPatch).toEqual({
      packageId: 'box-3500',
      packageLabel: 'Deluxe Box',
      priceKes: 3500,
    });
  });

  it('selects a package by price text', () => {
    const result = transition({
      currentStep: 'awaiting_package_selection',
      stateBlob: {},
      inboundText: 'I want the 5000 one',
      context: nairobiContext,
    });
    expect(result.stateBlobPatch.packageId).toBe('box-5000');
  });

  it('re-prompts on an unrecognized reply without advancing', () => {
    const result = transition({
      currentStep: 'awaiting_package_selection',
      stateBlob: {},
      inboundText: 'huh?',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_package_selection');
    expect(result.stateBlobPatch).toEqual({});
  });
});

describe('transition: awaiting_customer_details', () => {
  it('parses name and county, and presents Nairobi delivery options', () => {
    const result = transition({
      currentStep: 'awaiting_customer_details',
      stateBlob: { packageId: 'box-2500' },
      inboundText: 'Jane Doe, Nairobi',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_delivery_selection');
    expect(result.stateBlobPatch).toEqual({
      customerName: 'Jane Doe',
      county: 'Nairobi',
    });
    expect(result.botReply).toContain('Door Delivery');
    expect(result.botReply).toContain('Fargo Pickup');
  });

  it('re-prompts when the reply has no comma-separated county', () => {
    const result = transition({
      currentStep: 'awaiting_customer_details',
      stateBlob: {},
      inboundText: 'just a name',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_customer_details');
  });
});

describe('transition: awaiting_delivery_selection', () => {
  it('offers only Fargo pickup outside Nairobi', () => {
    const result = transition({
      currentStep: 'awaiting_delivery_selection',
      stateBlob: { county: 'Kisumu' },
      inboundText: '1',
      context: upcountryContext,
    });
    expect(result.stateBlobPatch).toEqual({ deliveryMethod: 'pickup' });
    expect(result.nextStep).toBe('awaiting_pickup_station_selection');
  });

  it('routes a door-delivery reply in Nairobi to address collection, not straight to referral', () => {
    const result = transition({
      currentStep: 'awaiting_delivery_selection',
      stateBlob: { county: 'Nairobi' },
      inboundText: 'door please',
      context: nairobiContext,
    });
    expect(result.stateBlobPatch).toEqual({ deliveryMethod: 'door' });
    expect(result.nextStep).toBe('awaiting_door_delivery_details');
    expect(result.botReply).toMatch(/address/i);
  });

  it('routes a pickup reply to a pickup-station search prompt', () => {
    const result = transition({
      currentStep: 'awaiting_delivery_selection',
      stateBlob: { county: 'Nairobi' },
      inboundText: 'pickup',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_pickup_station_selection');
    expect(result.stateBlobPatch).toEqual({ deliveryMethod: 'pickup' });
    expect(result.botReply).toMatch(/town|area/i);
  });

  it('rejects an out-of-range index outside Nairobi (no door delivery option)', () => {
    const result = transition({
      currentStep: 'awaiting_delivery_selection',
      stateBlob: { county: 'Kisumu' },
      inboundText: '2',
      context: upcountryContext,
    });
    expect(result.nextStep).toBe('awaiting_delivery_selection');
    expect(result.stateBlobPatch).toEqual({});
  });
});

describe('transition: awaiting_door_delivery_details', () => {
  it('collects address/landmark/estate/phone and prices the delivery itself', () => {
    const result = transition({
      currentStep: 'awaiting_door_delivery_details',
      stateBlob: { deliveryMethod: 'door', customerName: 'Jane Doe', county: 'Nairobi' },
      inboundText: '123 Ngong Road, near ABC Bank, Kilimani, 0712345678',
      context: nairobiContext,
    });
    // No human in the loop any more. Bolt's fare moved with distance and
    // traffic so nothing could be quoted up front; Fargo charges a flat
    // rate, so the customer gets a number immediately instead of waiting
    // for a call back.
    expect(result.nextStep).toBe('awaiting_referral_code');
    expect(result.sideEffect).toBeUndefined();
    expect(result.stateBlobPatch).toEqual({
      addressText: '123 Ngong Road',
      landmark: 'near ABC Bank',
      estate: 'Kilimani',
      contactPhone: '0712345678',
      deliveryFeeKes: 250,
    });
    expect(result.botReply).toContain(DOOR_DELIVERY_PRICED_MESSAGE);
    expect(result.botReply).toContain('KES 250');
  });

  /** No configured rate means an unknown cost, and quoting one would be inventing a price. */
  it('still escalates to a human when no door rate is configured', () => {
    const result = transition({
      currentStep: 'awaiting_door_delivery_details',
      stateBlob: { deliveryMethod: 'door', customerName: 'Jane Doe', county: 'Nairobi' },
      inboundText: '123 Ngong Road, near ABC Bank, Kilimani, 0712345678',
      context: { ...nairobiContext, doorDeliveryFeeKes: null },
    });
    expect(result.nextStep).toBe('awaiting_agent_pricing');
    expect(result.sideEffect).toBe('ESCALATE_TO_AGENT');
  });

  it('re-prompts when fewer than 4 comma-separated fields are given', () => {
    const result = transition({
      currentStep: 'awaiting_door_delivery_details',
      stateBlob: { deliveryMethod: 'door' },
      inboundText: '123 Ngong Road, Kilimani',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_door_delivery_details');
    expect(result.sideEffect).toBeUndefined();
    expect(result.stateBlobPatch).toEqual({});
  });
});

describe('transition: awaiting_pickup_station_selection', () => {
  const candidates = [
    { id: 'st-1', name: 'G4S Kasarani Station', county: 'Nairobi', town: 'Kasarani', deliveryFeeKes: 250 },
    { id: 'st-2', name: 'Naivas Kasarani Mwiki', county: 'Nairobi', town: 'Kasarani', deliveryFeeKes: 0 },
  ];

  it('selects a station by number and auto-populates its delivery fee', () => {
    const result = transition({
      currentStep: 'awaiting_pickup_station_selection',
      stateBlob: { county: 'Nairobi', deliveryMethod: 'pickup', pickupStationCandidates: candidates },
      inboundText: '1',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_referral_code');
    expect(result.stateBlobPatch).toEqual({
      pickupStationId: 'st-1',
      pickupStationName: 'G4S Kasarani Station',
      deliveryFeeKes: 250,
      county: 'Nairobi',
    });
    expect(result.botReply).toContain('G4S Kasarani Station');
    expect(result.botReply).toContain('250');
  });

  it('shows a "fee to be confirmed" reply when the selected station has no configured fee yet', () => {
    const result = transition({
      currentStep: 'awaiting_pickup_station_selection',
      stateBlob: { deliveryMethod: 'pickup', pickupStationCandidates: candidates },
      inboundText: '2',
      context: nairobiContext,
    });
    expect(result.stateBlobPatch.deliveryFeeKes).toBe(0);
    expect(result.botReply).toContain('to be confirmed');
  });

  it('treats free text as a fresh search using the Service-provided matches, not a dead end', () => {
    const freshMatches = [
      { id: 'st-3', name: 'G4S Eldoret Station', county: 'Uasin Gishu', town: 'Eldoret', deliveryFeeKes: 300 },
    ];
    const result = transition({
      currentStep: 'awaiting_pickup_station_selection',
      stateBlob: { deliveryMethod: 'pickup' },
      inboundText: 'Eldoret',
      context: { ...nairobiContext, pickupStationMatches: freshMatches },
    });
    expect(result.nextStep).toBe('awaiting_pickup_station_selection');
    expect(result.stateBlobPatch).toEqual({ pickupStationCandidates: freshMatches });
    expect(result.botReply).toContain('G4S Eldoret Station');
  });

  it('reports no matches without crashing when a search comes back empty', () => {
    const result = transition({
      currentStep: 'awaiting_pickup_station_selection',
      stateBlob: { deliveryMethod: 'pickup' },
      inboundText: 'Nowhereville',
      context: { ...nairobiContext, pickupStationMatches: [] },
    });
    expect(result.nextStep).toBe('awaiting_pickup_station_selection');
    expect(result.botReply).toContain('No pickup stations found');
  });
});

describe('transition: awaiting_agent_pricing', () => {
  it('stays parked and never re-escalates or advances on its own', () => {
    const result = transition({
      currentStep: 'awaiting_agent_pricing',
      stateBlob: { deliveryMethod: 'door' },
      inboundText: 'hello? anyone there?',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_agent_pricing');
    expect(result.sideEffect).toBeUndefined();
    expect(result.botReply).toMatch(/team/i);
  });
});

describe('transition: awaiting_referral_code', () => {
  it('captures a referral code and moves to the customer-controlled payment confirmation step', () => {
    const result = transition({
      currentStep: 'awaiting_referral_code',
      stateBlob: {
        packageLabel: 'Starter Box',
        priceKes: 2500,
        customerName: 'Jane Doe',
        county: 'Nairobi',
        deliveryMethod: 'pickup',
      },
      inboundText: 'SNACK123',
      context: nairobiContext,
    });
    expect(result.stateBlobPatch).toEqual({ referralCode: 'SNACK123' });
    expect(result.nextStep).toBe('awaiting_customer_payment_confirmation');
    expect(result.botReply).toContain('Order summary');
    // Pricing alone must never trigger a side effect — only an explicit PAY reply does.
    expect(result.sideEffect).toBeUndefined();
  });

  it('presents the pickup station name and delivery fee', () => {
    const result = transition({
      currentStep: 'awaiting_referral_code',
      stateBlob: {
        packageLabel: 'Starter Box',
        priceKes: 2500,
        customerName: 'Jane Doe',
        county: 'Nairobi',
        deliveryMethod: 'pickup',
        pickupStationName: 'G4S Kasarani Station',
        deliveryFeeKes: 250,
      },
      inboundText: 'no',
      context: nairobiContext,
    });
    expect(result.botReply).toContain('G4S Kasarani Station');
    expect(result.botReply).toContain('KES 250');
  });

  it('treats "no" as skipping the referral code', () => {
    const result = transition({
      currentStep: 'awaiting_referral_code',
      stateBlob: { packageLabel: 'Starter Box', priceKes: 2500 },
      inboundText: 'no',
      context: nairobiContext,
    });
    expect(result.stateBlobPatch).toEqual({});
  });
});

describe('formatFinalOrderSummaryMessage', () => {
  it('itemizes the box, delivery fee, and an explicit total for a pickup order', () => {
    const message = formatFinalOrderSummaryMessage({
      packageLabel: 'Deluxe Box',
      priceKes: 3500,
      customerName: 'Jane Doe',
      county: 'Nairobi',
      deliveryMethod: 'pickup',
      pickupStationName: 'G4S Kasarani Station',
      deliveryFeeKes: 350,
    });
    expect(message).toContain('Deluxe Box: KES 3500');
    expect(message).toContain('Delivery: KES 350');
    expect(message).toContain('Total: KES 3850');
    expect(message).toContain('To continue, reply PAY whenever you are ready to receive the M-Pesa payment prompt.');
  });

  it('labels the fee "Delivery" and closes with the door-delivery PAY copy', () => {
    const message = formatFinalOrderSummaryMessage({
      packageLabel: 'Deluxe Box',
      priceKes: 3500,
      customerName: 'Jane Doe',
      county: 'Nairobi',
      deliveryMethod: 'door',
      addressText: '123 Ngong Road',
      estate: 'Kilimani',
      deliveryFeeKes: 420,
    });
    expect(message).toContain('Delivery: KES 420');
    expect(message).toContain('Total: KES 3920');
    expect(message).toContain('Reply PAY whenever you are ready to receive the M-Pesa payment request.');
  });

  it('subtracts a discount from the total', () => {
    const message = formatFinalOrderSummaryMessage({
      packageLabel: 'Starter Box',
      priceKes: 2500,
      deliveryMethod: 'pickup',
      deliveryFeeKes: 250,
      discountKes: 200,
    });
    expect(message).toContain('Discount: -KES 200');
    expect(message).toContain('Total: KES 2550'); // 2500 - 200 + 250
  });
});

describe('transition: awaiting_customer_payment_confirmation', () => {
  const summaryStateBlob = {
    packageLabel: 'Starter Box',
    priceKes: 2500,
    customerName: 'Jane Doe',
    county: 'Nairobi',
    deliveryMethod: 'pickup' as const,
    deliveryFeeKes: 250,
  };

  it.each(['PAY', 'pay', '  Pay  ', 'PROCEED', 'confirm'])(
    'freezes the snapshot and moves to payment on %j',
    (reply) => {
      const result = transition({
        currentStep: 'awaiting_customer_payment_confirmation',
        stateBlob: summaryStateBlob,
        inboundText: reply,
        context: nairobiContext,
      });
      expect(result.nextStep).toBe('awaiting_payment_confirmation');
      expect(result.sideEffect).toBe('FREEZE_SNAPSHOT');
    },
  );

  it('does not treat "yes" or "ok" as a payment confirmation — only the configured keywords count', () => {
    for (const reply of ['yes', 'ok', 'okay', 'sure']) {
      const result = transition({
        currentStep: 'awaiting_customer_payment_confirmation',
        stateBlob: summaryStateBlob,
        inboundText: reply,
        context: nairobiContext,
      });
      expect(result.sideEffect).toBeUndefined();
      expect(result.nextStep).toBe('awaiting_customer_payment_confirmation');
    }
  });

  it('exposes the configured keyword list as PAY/PROCEED/CONFIRM', () => {
    expect(PAYMENT_CONFIRMATION_KEYWORDS).toEqual(['PAY', 'PROCEED', 'CONFIRM']);
  });

  it('abandons the conversation on NO', () => {
    const result = transition({
      currentStep: 'awaiting_customer_payment_confirmation',
      stateBlob: summaryStateBlob,
      inboundText: 'no thanks',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('abandoned');
    expect(result.sideEffect).toBeUndefined();
  });

  it('sends a short reminder — not the full itemized bill again — on an unrecognized reply', () => {
    const result = transition({
      currentStep: 'awaiting_customer_payment_confirmation',
      stateBlob: summaryStateBlob,
      inboundText: 'maybe later',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_customer_payment_confirmation');
    expect(result.sideEffect).toBeUndefined();
    expect(result.botReply).toBe(PAYMENT_CONFIRMATION_REMINDER);
  });
});

describe('transition: terminal and waiting states', () => {
  it('does not advance while awaiting_payment_confirmation', () => {
    const result = transition({
      currentStep: 'awaiting_payment_confirmation',
      stateBlob: {},
      inboundText: 'hello?',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_payment_confirmation');
  });

  it('stays completed and invites a new order', () => {
    const result = transition({
      currentStep: 'completed',
      stateBlob: {},
      inboundText: 'hi again',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('completed');
    expect(result.botReply).toContain('new order');
  });
});
