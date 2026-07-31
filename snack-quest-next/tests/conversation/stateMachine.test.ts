import { describe, expect, it } from 'vitest';
import {
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
    expect(result.botReply).toContain('Jumia Pickup');
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
  it('offers only Jumia pickup outside Nairobi', () => {
    const result = transition({
      currentStep: 'awaiting_delivery_selection',
      stateBlob: { county: 'Kisumu' },
      inboundText: '1',
      context: upcountryContext,
    });
    expect(result.stateBlobPatch).toEqual({ deliveryMethod: 'jumia_pickup' });
  });

  it('accepts a door-delivery keyword reply in Nairobi', () => {
    const result = transition({
      currentStep: 'awaiting_delivery_selection',
      stateBlob: { county: 'Nairobi' },
      inboundText: 'door please',
      context: nairobiContext,
    });
    expect(result.stateBlobPatch).toEqual({ deliveryMethod: 'door_delivery' });
    expect(result.nextStep).toBe('awaiting_referral_code');
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

describe('transition: awaiting_delivery_selection (jumia_pickup)', () => {
  it('routes jumia_pickup to a pickup-station search prompt, not straight to referral', () => {
    const result = transition({
      currentStep: 'awaiting_delivery_selection',
      stateBlob: { county: 'Nairobi' },
      inboundText: 'pickup',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_pickup_station_selection');
    expect(result.stateBlobPatch).toEqual({ deliveryMethod: 'jumia_pickup' });
    expect(result.botReply).toMatch(/town|area/i);
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
      stateBlob: { county: 'Nairobi', deliveryMethod: 'jumia_pickup', pickupStationCandidates: candidates },
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
      stateBlob: { deliveryMethod: 'jumia_pickup', pickupStationCandidates: candidates },
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
      stateBlob: { deliveryMethod: 'jumia_pickup' },
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
      stateBlob: { deliveryMethod: 'jumia_pickup' },
      inboundText: 'Nowhereville',
      context: { ...nairobiContext, pickupStationMatches: [] },
    });
    expect(result.nextStep).toBe('awaiting_pickup_station_selection');
    expect(result.botReply).toContain('No pickup stations found');
  });
});

describe('transition: awaiting_referral_code', () => {
  it('captures a referral code and presents the summary', () => {
    const result = transition({
      currentStep: 'awaiting_referral_code',
      stateBlob: {
        packageLabel: 'Starter Box',
        priceKes: 2500,
        customerName: 'Jane Doe',
        county: 'Nairobi',
        deliveryMethod: 'door_delivery',
      },
      inboundText: 'SNACK123',
      context: nairobiContext,
    });
    expect(result.stateBlobPatch).toEqual({ referralCode: 'SNACK123' });
    expect(result.nextStep).toBe('awaiting_order_confirmation');
    expect(result.botReply).toContain('Order summary');
  });

  it('presents the pickup station name and delivery fee for a jumia_pickup order', () => {
    const result = transition({
      currentStep: 'awaiting_referral_code',
      stateBlob: {
        packageLabel: 'Starter Box',
        priceKes: 2500,
        customerName: 'Jane Doe',
        county: 'Nairobi',
        deliveryMethod: 'jumia_pickup',
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

describe('transition: awaiting_order_confirmation', () => {
  const summaryStateBlob = {
    packageLabel: 'Starter Box',
    priceKes: 2500,
    customerName: 'Jane Doe',
    county: 'Nairobi',
    deliveryMethod: 'door_delivery' as const,
  };

  it('freezes the snapshot and moves to payment on YES', () => {
    const result = transition({
      currentStep: 'awaiting_order_confirmation',
      stateBlob: summaryStateBlob,
      inboundText: 'yes',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_payment_confirmation');
    expect(result.sideEffect).toBe('FREEZE_SNAPSHOT');
  });

  it('abandons the conversation on NO', () => {
    const result = transition({
      currentStep: 'awaiting_order_confirmation',
      stateBlob: summaryStateBlob,
      inboundText: 'no thanks',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('abandoned');
    expect(result.sideEffect).toBeUndefined();
  });

  it('re-presents the summary on an unrecognized reply', () => {
    const result = transition({
      currentStep: 'awaiting_order_confirmation',
      stateBlob: summaryStateBlob,
      inboundText: 'maybe later',
      context: nairobiContext,
    });
    expect(result.nextStep).toBe('awaiting_order_confirmation');
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
