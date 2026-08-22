import type {
  ConversationStateBlob,
  ConversationStep,
  DeliveryMethod,
  PickupStationCandidate,
} from '@/types';

/**
 * The deterministic step-transition logic for the purchase conversation
 * (PLATFORM_ARCHITECTURE_V2.md §6, "ConversationStateMachine"). Pure
 * functions only — no Firestore, no Gateway calls — so the actual
 * decision rules are unit-testable without an emulator, exactly as §6
 * argues for over an "AI does whatever" chatbot: auditable, testable,
 * never hallucinates a price.
 *
 * `ConversationService` (I/O, persistence, side effects) is the only
 * caller — it fetches the context this module needs (available
 * packages, delivery eligibility), calls `transition()`, then persists
 * the result and sends `botReply` through `WhatchimpGateway`.
 *
 * Two delivery methods diverge at `awaiting_delivery_selection`
 * (redesign: multi-delivery-method checkout). `pickup` (Fargo,
 * automated, nationwide) continues through station search/selection
 * straight to a priced order summary. `door` (Bolt, Nairobi-only,
 * dynamic pricing) collects address details and then hands off to a
 * human agent — this module never prices a door-delivery order
 * itself; `sideEffect: 'ESCALATE_TO_AGENT'` is as far as it goes.
 *
 * Neither path ever triggers the M-Pesa STK push as a side effect of
 * pricing (redesign: customer-controlled STK push). Both converge on
 * `awaiting_customer_payment_confirmation` once a real total exists —
 * `sideEffect: 'FREEZE_SNAPSHOT'` only fires from *that* step, and
 * only once the customer has explicitly replied with one of
 * `PAYMENT_CONFIRMATION_KEYWORDS`. A customer is never surprised by an
 * unrequested payment prompt.
 */

export interface PackageOption {
  id: string;
  name: string;
  priceKes: number;
}

export interface ConversationTransitionContext {
  availablePackages: PackageOption[];
  /** Nairobi customers get a door-delivery choice; everyone else is Fargo-pickup only. */
  isNairobi: boolean;
  /**
   * Search results for the customer's most recent pickup-station
   * search text, fetched by the Service *before* calling `transition()`
   * — this module never touches Firestore. Only populated/relevant
   * while `currentStep === 'awaiting_pickup_station_selection'`.
   */
  pickupStationMatches?: PickupStationCandidate[];
}

export interface ConversationTransitionInput {
  currentStep: ConversationStep;
  stateBlob: ConversationStateBlob;
  inboundText: string;
  context: ConversationTransitionContext;
}

export interface ConversationTransitionResult {
  nextStep: ConversationStep;
  stateBlobPatch: Partial<ConversationStateBlob>;
  botReply: string;
  /** Signals a Service-layer side effect beyond persisting this transition. */
  sideEffect?: 'FREEZE_SNAPSHOT' | 'ESCALATE_TO_AGENT';
}

/** The exact required copy (redesign spec) when Door Delivery is selected and escalated — Bolt's pricing is dynamic, so no fee is ever guessed here. */
export const DOOR_DELIVERY_ESCALATION_MESSAGE =
  "Great choice! Door delivery within Nairobi is handled by Bolt, whose pricing changes based " +
  'on distance and traffic. One of our team members will contact you shortly to confirm your ' +
  'delivery cost and complete your order.';

const WELCOME_MESSAGE =
  "Welcome to Snack Quest! We curate snack boxes and deliver them anywhere in Kenya. Let's get you a box.";

const CUSTOMER_DETAILS_PROMPT =
  'Great choice! Please reply with your name and county, separated by a comma (e.g. "Jane Doe, Nairobi").';

function formatPackagesMessage(packages: PackageOption[]): string {
  const lines = packages.map(
    (pkg, index) => `${index + 1}. ${pkg.name} — KES ${pkg.priceKes}`,
  );
  return `Choose your box by replying with a number:\n${lines.join('\n')}`;
}

export function startConversationMessages(
  availablePackages: PackageOption[],
): { nextStep: ConversationStep; botReply: string } {
  return {
    nextStep: 'awaiting_package_selection',
    botReply: `${WELCOME_MESSAGE}\n\n${formatPackagesMessage(availablePackages)}`,
  };
}

/**
 * The equivalent of a successful `awaiting_package_selection` match,
 * for a conversation bootstrapped from a Whatchimp Product Catalog
 * selection instead of free text (`POST /checkout/start`) — the
 * product was already validated by the caller (existence, active,
 * in stock; this module never touches Firestore), so there's no
 * matching step to run, just the same next prompt a text-based match
 * would produce.
 */
export function bootstrapFromCatalogSelection(
  product: { id: string; name: string; priceKes: number },
  attribution: { referralCode?: string | null } = {},
): { nextStep: ConversationStep; stateBlobPatch: Partial<ConversationStateBlob>; botReply: string } {
  return {
    nextStep: 'awaiting_customer_details',
    stateBlobPatch: {
      packageId: product.id,
      packageLabel: product.name,
      priceKes: product.priceKes,
      // Pre-fills what `awaiting_referral_code` would otherwise ask
      // for later — the customer never has to type a code they
      // already gave Whatchimp. Still re-validated at freeze time by
      // the exact same `confirmAndFreeze` path as a text-entered code
      // (codes can expire between now and payment).
      ...(attribution.referralCode ? { referralCode: attribution.referralCode } : {}),
    },
    botReply: CUSTOMER_DETAILS_PROMPT,
  };
}

function matchPackage(
  inboundText: string,
  packages: PackageOption[],
): PackageOption | null {
  const trimmed = inboundText.trim();
  const asIndex = Number(trimmed);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= packages.length) {
    return packages[asIndex - 1];
  }
  const byPrice = packages.find((pkg) => trimmed.includes(String(pkg.priceKes)));
  if (byPrice) {
    return byPrice;
  }
  const byName = packages.find((pkg) =>
    trimmed.toLowerCase().includes(pkg.name.toLowerCase()),
  );
  return byName ?? null;
}

function parseCustomerDetails(
  inboundText: string,
): { customerName: string; county: string } | null {
  const parts = inboundText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return { customerName: parts[0], county: parts[1] };
}

function deliveryOptionsFor(
  isNairobi: boolean,
): { index: number; method: DeliveryMethod; label: string }[] {
  return isNairobi
    ? [
        { index: 1, method: 'door', label: 'Door Delivery (Nairobi Only)' },
        { index: 2, method: 'pickup', label: 'Fargo Pickup Point' },
      ]
    : [{ index: 1, method: 'pickup', label: 'Fargo Pickup Point' }];
}

function formatDeliveryOptionsMessage(isNairobi: boolean): string {
  const options = deliveryOptionsFor(isNairobi);
  const lines = options.map((opt) => `${opt.index}. ${opt.label}`);
  const intro = isNairobi
    ? 'How would you like to receive your box?'
    : "Outside Nairobi we deliver to a Fargo Courier pickup point near you.";
  return `${intro}\n${lines.join('\n')}`;
}

function matchDeliveryOption(
  inboundText: string,
  isNairobi: boolean,
): DeliveryMethod | null {
  const options = deliveryOptionsFor(isNairobi);
  const trimmed = inboundText.trim().toLowerCase();
  const asIndex = Number(trimmed);
  const byIndex = options.find((opt) => opt.index === asIndex);
  if (byIndex) {
    return byIndex.method;
  }
  if (trimmed.includes('door')) {
    return options.find((opt) => opt.method === 'door')?.method ?? null;
  }
  if (trimmed.includes('pickup') || trimmed.includes('fargo')) {
    return options.find((opt) => opt.method === 'pickup')?.method ?? null;
  }
  return null;
}

function formatPickupStationOptionsMessage(
  searchText: string,
  matches: PickupStationCandidate[],
): string {
  if (matches.length === 0) {
    return (
      `No pickup stations found for "${searchText}". Try a different town, area, or county ` +
      `(e.g. "Kasarani", "Eldoret", "Mombasa").`
    );
  }
  const lines = matches.map((station, index) => {
    const location = [station.town, station.county].filter(Boolean).join(', ');
    const feeLabel =
      station.deliveryFeeKes > 0 ? `KES ${station.deliveryFeeKes}` : 'fee to be confirmed';
    return `${index + 1}. ${station.name}${location ? ` (${location})` : ''} — ${feeLabel}`;
  });
  return (
    `Pickup stations matching "${searchText}":\n${lines.join('\n')}\n\n` +
    `Reply with a number to select, or type a different town/area to search again.`
  );
}

function matchPickupStationSelection(
  inboundText: string,
  candidates: PickupStationCandidate[] | undefined,
): PickupStationCandidate | null {
  if (!candidates || candidates.length === 0) {
    return null;
  }
  const asIndex = Number(inboundText.trim());
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= candidates.length) {
    return candidates[asIndex - 1];
  }
  return null;
}

const DOOR_DELIVERY_DETAILS_PROMPT =
  'Please share your delivery address, landmark, estate, and phone number, separated by ' +
  'commas (e.g. "123 Ngong Road, near ABC Bank, Kilimani, 0712345678").';

/** Deliberately simple (comma-split, 4 fields) — matches the existing "name, county" convention rather than inventing free-text NLP; an address containing a comma is a known, documented limitation. */
function parseDoorDeliveryDetails(
  inboundText: string,
): { addressText: string; landmark: string; estate: string; contactPhone: string } | null {
  const parts = inboundText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 4) {
    return null;
  }
  const [addressText, landmark, estate, contactPhone] = parts;
  return { addressText, landmark, estate, contactPhone };
}

/**
 * The exact keywords that count as "the customer explicitly asked to
 * pay now" (redesign: customer-controlled STK push) — configurable by
 * design (an array, not a hardcoded regex branch), so adding a fourth
 * keyword later is a one-line change. Matched by exact value after
 * normalization, not substring — "PAY" confirms, "let's pay later"
 * does not, which is the deliberate, literal reading of "the customer
 * must always explicitly indicate they are ready to pay."
 */
export const PAYMENT_CONFIRMATION_KEYWORDS = ['PAY', 'PROCEED', 'CONFIRM'] as const;

function normalizeConfirmationReply(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toUpperCase();
}

function isPaymentConfirmation(inboundText: string): boolean {
  return (PAYMENT_CONFIRMATION_KEYWORDS as readonly string[]).includes(
    normalizeConfirmationReply(inboundText),
  );
}

/** Shown when the customer's reply while parked in `awaiting_customer_payment_confirmation` isn't a recognized keyword — a short nudge, not the full itemized bill again. */
export const PAYMENT_CONFIRMATION_REMINDER =
  "Your order is ready. Whenever you're ready, simply reply PAY and we'll send the M-Pesa " +
  'payment request to your phone.';

/**
 * The final, itemized total — the last thing shown before the
 * customer is asked to explicitly opt into payment. Used both when
 * first entering `awaiting_customer_payment_confirmation` (from the
 * automated Fargo-pickup referral step, or from a human agent's Bolt
 * quotation) and, unchanged, is exactly what a real order is priced
 * at — never re-derived or re-guessed later.
 */
export function formatFinalOrderSummaryMessage(stateBlob: ConversationStateBlob): string {
  const isPickup = stateBlob.deliveryMethod === 'pickup';
  const subtotalKes = stateBlob.priceKes ?? 0;
  const discountKes = stateBlob.discountKes ?? 0;
  const deliveryFeeKes = stateBlob.deliveryFeeKes ?? 0;
  const totalKes = subtotalKes - discountKes + deliveryFeeKes;

  const lines = [`${stateBlob.packageLabel}: KES ${subtotalKes}`];
  if (discountKes) {
    lines.push(`Discount: -KES ${discountKes}`);
  }
  const deliveryLabel = isPickup ? 'Delivery' : 'Bolt Delivery';
  const feeText = deliveryFeeKes > 0 ? `KES ${deliveryFeeKes}` : 'to be confirmed';
  lines.push(`${deliveryLabel}: ${feeText}`);
  lines.push(`Total: KES ${totalKes}`);

  const destination = isPickup
    ? [stateBlob.pickupStationName, stateBlob.county].filter(Boolean).join(', ')
    : [stateBlob.addressText, stateBlob.estate, stateBlob.county].filter(Boolean).join(', ');
  lines.push(`Deliver to: ${stateBlob.customerName ?? ''}, ${destination}`);

  const closing = isPickup
    ? 'To continue, reply PAY whenever you are ready to receive the M-Pesa payment prompt.'
    : 'Reply PAY whenever you are ready to receive the M-Pesa payment request.';

  return `Order summary:\n${lines.join('\n')}\n\n${closing}`;
}

const NEGATIVE = /\b(no|cancel|stop)\b/i;
const SKIP_REFERRAL = /^(no|none|skip|n\/a)$/i;

export function transition(
  input: ConversationTransitionInput,
): ConversationTransitionResult {
  const { currentStep, stateBlob, inboundText, context } = input;

  switch (currentStep) {
    case 'started':
    case 'welcomed': {
      const started = startConversationMessages(context.availablePackages);
      return { nextStep: started.nextStep, stateBlobPatch: {}, botReply: started.botReply };
    }

    case 'awaiting_package_selection': {
      const match = matchPackage(inboundText, context.availablePackages);
      if (!match) {
        return {
          nextStep: 'awaiting_package_selection',
          stateBlobPatch: {},
          botReply: `Sorry, I didn't catch that.\n\n${formatPackagesMessage(context.availablePackages)}`,
        };
      }
      return {
        nextStep: 'awaiting_customer_details',
        stateBlobPatch: {
          packageId: match.id,
          packageLabel: match.name,
          priceKes: match.priceKes,
        },
        botReply: CUSTOMER_DETAILS_PROMPT,
      };
    }

    case 'awaiting_customer_details': {
      const details = parseCustomerDetails(inboundText);
      if (!details) {
        return {
          nextStep: 'awaiting_customer_details',
          stateBlobPatch: {},
          botReply:
            'Please reply with your name and county, separated by a comma (e.g. "Jane Doe, Nairobi").',
        };
      }
      const isNairobi = details.county.toLowerCase().includes('nairobi');
      return {
        nextStep: 'awaiting_delivery_selection',
        stateBlobPatch: details,
        botReply: formatDeliveryOptionsMessage(isNairobi),
      };
    }

    case 'awaiting_delivery_selection': {
      const isNairobi = (stateBlob.county ?? '').toLowerCase().includes('nairobi');
      const method = matchDeliveryOption(inboundText, isNairobi);
      if (!method) {
        return {
          nextStep: 'awaiting_delivery_selection',
          stateBlobPatch: {},
          botReply: `Sorry, I didn't catch that.\n\n${formatDeliveryOptionsMessage(isNairobi)}`,
        };
      }
      if (method === 'door') {
        return {
          nextStep: 'awaiting_door_delivery_details',
          stateBlobPatch: { deliveryMethod: method },
          botReply: DOOR_DELIVERY_DETAILS_PROMPT,
        };
      }
      return {
        nextStep: 'awaiting_pickup_station_selection',
        stateBlobPatch: { deliveryMethod: method },
        botReply:
          'Which town or area should we deliver near? Reply with your town, area, or county ' +
          '(e.g. "Kasarani", "Eldoret", "Mombasa").',
      };
    }

    case 'awaiting_door_delivery_details': {
      const details = parseDoorDeliveryDetails(inboundText);
      if (!details) {
        return {
          nextStep: 'awaiting_door_delivery_details',
          stateBlobPatch: {},
          botReply: `Sorry, I didn't catch all of that.\n\n${DOOR_DELIVERY_DETAILS_PROMPT}`,
        };
      }
      // Delivery fee is deliberately NOT calculated here — Bolt's
      // pricing is dynamic; a human agent prices it next (see
      // ConversationService.escalateToAgent / priceDoorDelivery).
      return {
        nextStep: 'awaiting_agent_pricing',
        stateBlobPatch: details,
        botReply: DOOR_DELIVERY_ESCALATION_MESSAGE,
        sideEffect: 'ESCALATE_TO_AGENT',
      };
    }

    case 'awaiting_pickup_station_selection': {
      const selected = matchPickupStationSelection(inboundText, stateBlob.pickupStationCandidates);
      if (selected) {
        return {
          nextStep: 'awaiting_referral_code',
          stateBlobPatch: {
            pickupStationId: selected.id,
            pickupStationName: selected.name,
            deliveryFeeKes: selected.deliveryFeeKes,
            // The station's own (computed) county is now the authoritative
            // delivery destination — more precise than whatever the
            // customer free-typed earlier in awaiting_customer_details.
            county: selected.county ?? stateBlob.county,
          },
          botReply:
            `Selected: ${selected.name}${selected.county ? ` (${selected.county})` : ''}. ` +
            `Delivery fee: ${selected.deliveryFeeKes > 0 ? `KES ${selected.deliveryFeeKes}` : 'to be confirmed'}.\n\n` +
            "Do you have a referral code? Reply with the code, or reply 'no'.",
        };
      }
      // Not a valid selection index — treat it as a fresh search instead
      // of a dead end, using whatever the Service already searched for.
      const matches = context.pickupStationMatches ?? [];
      return {
        nextStep: 'awaiting_pickup_station_selection',
        stateBlobPatch: { pickupStationCandidates: matches },
        botReply: formatPickupStationOptionsMessage(inboundText.trim(), matches),
      };
    }

    case 'awaiting_agent_pricing': {
      // Reached only if a conversation somehow re-enters transition()
      // while parked here — the normal path never calls transition()
      // at all once Conversation.status is 'agent_assigned' (see
      // ConversationService.start()). Safety net, not the primary flow.
      return {
        nextStep: 'awaiting_agent_pricing',
        stateBlobPatch: {},
        botReply:
          "One of our team members is confirming your delivery cost — we'll be in touch shortly.",
      };
    }

    case 'awaiting_referral_code': {
      const trimmed = inboundText.trim();
      const patch: Partial<ConversationStateBlob> = SKIP_REFERRAL.test(trimmed)
        ? {}
        : { referralCode: trimmed };
      return {
        nextStep: 'awaiting_customer_payment_confirmation',
        stateBlobPatch: patch,
        botReply: formatFinalOrderSummaryMessage({ ...stateBlob, ...patch }),
      };
    }

    case 'awaiting_customer_payment_confirmation': {
      if (isPaymentConfirmation(inboundText)) {
        return {
          nextStep: 'awaiting_payment_confirmation',
          stateBlobPatch: {},
          botReply: 'Sending your M-Pesa payment prompt now — check your phone.',
          sideEffect: 'FREEZE_SNAPSHOT',
        };
      }
      if (NEGATIVE.test(inboundText)) {
        return {
          nextStep: 'abandoned',
          stateBlobPatch: {},
          botReply: 'No problem! Reply anytime to start a new order.',
        };
      }
      return {
        nextStep: 'awaiting_customer_payment_confirmation',
        stateBlobPatch: {},
        botReply: PAYMENT_CONFIRMATION_REMINDER,
      };
    }

    case 'awaiting_payment_confirmation': {
      return {
        nextStep: 'awaiting_payment_confirmation',
        stateBlobPatch: {},
        botReply:
          "We're waiting for your M-Pesa confirmation — please complete the prompt on your phone.",
      };
    }

    case 'completed':
    case 'abandoned':
    default: {
      return {
        nextStep: currentStep,
        stateBlobPatch: {},
        botReply: 'This order is complete. Reply anytime to start a new order!',
      };
    }
  }
}
