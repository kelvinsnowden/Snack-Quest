import type {
  ConversationStateBlob,
  ConversationStep,
  DeliveryMethod,
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
 */

export interface PackageOption {
  id: string;
  name: string;
  priceKes: number;
}

export interface ConversationTransitionContext {
  availablePackages: PackageOption[];
  /** Nairobi customers get a door-delivery choice; everyone else is Jumia-pickup only. */
  isNairobi: boolean;
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
  sideEffect?: 'FREEZE_SNAPSHOT';
}

const WELCOME_MESSAGE =
  "Welcome to Snack Quest! We curate snack boxes and deliver them anywhere in Kenya. Let's get you a box.";

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
        { index: 1, method: 'door_delivery', label: 'Door Delivery' },
        { index: 2, method: 'jumia_pickup', label: 'Jumia Pickup Station' },
      ]
    : [{ index: 1, method: 'jumia_pickup', label: 'Jumia Pickup Station' }];
}

function formatDeliveryOptionsMessage(isNairobi: boolean): string {
  const options = deliveryOptionsFor(isNairobi);
  const lines = options.map((opt) => `${opt.index}. ${opt.label}`);
  const intro = isNairobi
    ? 'How would you like to receive your box?'
    : "We deliver outside Nairobi via Jumia's pickup network.";
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
    return options.find((opt) => opt.method === 'door_delivery')?.method ?? null;
  }
  if (trimmed.includes('pickup') || trimmed.includes('jumia')) {
    return options.find((opt) => opt.method === 'jumia_pickup')?.method ?? null;
  }
  return null;
}

function formatSummaryMessage(stateBlob: ConversationStateBlob): string {
  const discountLine = stateBlob.discountKes
    ? `\nDiscount: -KES ${stateBlob.discountKes}`
    : '';
  const deliveryLabel =
    stateBlob.deliveryMethod === 'door_delivery' ? 'Door Delivery' : 'Jumia Pickup';
  return (
    `Order summary:\n` +
    `${stateBlob.packageLabel} — KES ${stateBlob.priceKes}${discountLine}\n` +
    `Deliver to: ${stateBlob.customerName}, ${stateBlob.county} (${deliveryLabel})\n\n` +
    `Reply YES to proceed to payment, or NO to cancel.`
  );
}

const AFFIRMATIVE = /\b(yes|proceed|confirm|ok|okay)\b/i;
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
        botReply:
          "Great choice! Please reply with your name and county, separated by a comma (e.g. \"Jane Doe, Nairobi\").",
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
      return {
        nextStep: 'awaiting_referral_code',
        stateBlobPatch: { deliveryMethod: method },
        botReply: "Do you have a referral code? Reply with the code, or reply 'no'.",
      };
    }

    case 'awaiting_referral_code': {
      const trimmed = inboundText.trim();
      const patch: Partial<ConversationStateBlob> = SKIP_REFERRAL.test(trimmed)
        ? {}
        : { referralCode: trimmed };
      return {
        nextStep: 'awaiting_order_confirmation',
        stateBlobPatch: patch,
        botReply: formatSummaryMessage({ ...stateBlob, ...patch }),
      };
    }

    case 'awaiting_order_confirmation': {
      if (AFFIRMATIVE.test(inboundText)) {
        return {
          nextStep: 'awaiting_payment_confirmation',
          stateBlobPatch: {},
          botReply: "Sending your M-Pesa payment prompt now — check your phone.",
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
        nextStep: 'awaiting_order_confirmation',
        stateBlobPatch: {},
        botReply: formatSummaryMessage(stateBlob),
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
