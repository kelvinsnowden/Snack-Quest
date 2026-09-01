'use client';

import { useEffect, useMemo, useRef, useState, useCallback} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, Minus, Plus, Star, Store, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PickupStationPicker, type SelectedStation } from './PickupStationPicker';
import { GuaranteedPicker } from './GuaranteedPicker';
import { useCheckoutQuote } from './useCheckoutQuote';
import { formatKenyanPhoneInput, isValidKenyanPhone } from '@/lib/checkout/phone';
import { rememberPendingCheckout } from '@/lib/checkout/resumeSession';
import { advanceLabelFor, stageForField, stagesFor } from '@/lib/checkout/stages';
import { CheckoutProgress } from './CheckoutProgress';
import { GIFT_MESSAGE_MAX_LENGTH } from '@/types/gift';
import { isAcceptableEmailInput } from '@/lib/checkout/email';
import {
  EXPRESS_CUTOFF_HOUR,
  EXPRESS_DELIVERY_MINUTES,
  EXPRESS_OPEN_HOUR,
  expressWindowStateAt,
  sameDayWindowStateAt,
  metroAreaLabel,
  NEXT_DAY_ARRIVAL_HOUR,
  SAME_DAY_ARRIVAL_HOUR,
  SAME_DAY_CUTOFF_HOUR,
  type FargoServiceLevel,
} from '@/lib/delivery/deliveryPricing';
import { MAX_CHECKOUT_QUANTITY } from '@/lib/checkout/pricing';
import { formatKes } from '@/lib/orders/format';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { WhatsAppCheckoutButton } from '@/components/marketing/WhatsAppCheckoutButton';
import { trackPixelInitiateCheckout } from '@/lib/analytics/pixels';
import { buildBoxOrderMessage, GENERIC_ORDER_MESSAGE } from '@/lib/whatsapp/orderLink';
import { RESCUE_OFFER_EVENTS } from '@/lib/analytics/rescueOfferEvents';
import { FUNNEL_EVENTS } from '@/lib/analytics/funnelEvents';
import type { DeliveryMethod } from '@/types/delivery';
import type { WebCheckoutQuote, WebCheckoutResponse } from '@/types/webCheckout';

/**
 * The website checkout form (§ Website Becomes the Primary Commerce
 * Channel). Deliberately thin: it collects choices and posts them.
 *
 * The only arithmetic here is the catalog-price preview next to the
 * quantity stepper, which is a *preview* and labelled as one — the
 * amount charged is whatever `POST /api/checkout/web` computes from
 * `packages` and `pickupStations`, and the payment screen shows that
 * figure. There is no discount, referral, wallet or delivery maths in
 * this file, because all four live in `ConversationService.freezeSnapshot`
 * and must have exactly one implementation.
 *
 * County is not a separate field. For pickup it *is* the first step of
 * choosing a station, and for door delivery it is Nairobi by
 * definition — asking again would be asking the customer to restate
 * something they've already told us, and would let the two answers
 * disagree.
 */

export interface CheckoutBox {
  id: string;
  name: string;
  description: string;
  priceKes: number;
  imageUrl: string | null;
  stockCount: number | null;
  snackCountLabel: string | null;
  isRescueOffer: boolean;
  /** 0 for a fully-curated box; >0 means the customer picks that many. */
  guaranteedPickCount: number;
  /** "BEST VALUE" and the like — set per box by an admin. */
  highlightLabel: string | null;
}

const MAX_QUANTITY = MAX_CHECKOUT_QUANTITY;

export function CheckoutForm({
  boxes,
  initialBoxId,
  initialReferralCode,
  deliveryFromKes = null,
}: {
  boxes: CheckoutBox[];
  initialBoxId: string | null;
  initialReferralCode: string | null;
  /** Cheapest real delivery fee on offer, for the box step's "+ delivery from" line. Null hides it rather than guessing. */
  deliveryFromKes?: number | null;
}) {
  const router = useRouter();

  const [boxId, setBoxId] = useState<string | null>(
    boxes.some((box) => box.id === initialBoxId) ? initialBoxId : (boxes[0]?.id ?? null),
  );
  const [quantity, setQuantity] = useState(1);
  /*
   * Additional boxes, on top of the one selected above (§ more than
   * one box per order).
   *
   * Deliberately *additional* rather than turning the box list into a
   * multi-select. Tapping a card to switch box is the path almost
   * every customer takes, and making a tap mean "add" instead would
   * hand anyone changing their mind two boxes and a bill to match. So
   * the common path keeps its exact behaviour and a second box is an
   * explicit, separate act.
   */
  const [extraBoxes, setExtraBoxes] = useState<{ packageId: string; quantity: number }[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  /*
   * Door delivery, not pickup (§ default to the shorter path).
   *
   * Pickup was the default and it is the longer road: choose a county,
   * then choose a station, before any total can be computed. Door
   * needs an address and nothing else. The logs showed 214 checkout
   * visits producing almost no completed delivery selections, and the
   * step everybody landed on first was the one demanding two more
   * decisions.
   *
   * It is also the majority case — Nairobi and its metro towns are
   * where most of this traffic is — so the default now matches both
   * the commonest customer and the shorter path. Anyone outside the
   * radius still switches to pickup in one tap.
   */
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('door');
  const [serviceLevel, setServiceLevel] = useState<FargoServiceLevel>('next-day');
  // Whether Tushop will still accept a same-day parcel. Computed on the
  // client, from the customer's own clock read in Nairobi time, so the
  // option disappears the moment the cut-off passes rather than at the
  // next page load. The server refuses it independently — this only
  // decides whether to offer it.
  const sameDayWindow = sameDayWindowStateAt();
  const sameDayOpen = sameDayWindow === 'open';
  // Express is a window rather than a cut-off, so this carries which
  // side of it we are on: before 10am the option is not closed, it has
  // not opened, and telling a customer it "closed for today" at
  // breakfast would be plainly wrong.
  const expressWindow = expressWindowStateAt();
  const expressOpen = expressWindow === 'open';
  const [guaranteedSnackIds, setGuaranteedSnackIds] = useState<string[]>([]);
  /*
   * The names behind those ids, so the summary can list what was
   * chosen. Held here rather than re-fetched: the picker has the
   * catalogue loaded already, and asking for it twice to print five
   * names would be a second network round trip for nothing.
   */
  const [guaranteedSnackThumbs, setGuaranteedSnackThumbs] = useState<
    { id: string; imageUrl: string | null; origin: string | null }[]
  >([]);
  const [station, setStation] = useState<SelectedStation | null>(null);
  /*
   * A gift is off unless asked for. The recipient fields only exist
   * once it is on, so an ordinary buyer never sees a second name and
   * number to wonder about.
   */
  const [discountCode, setDiscountCode] = useState('');
  const [isGift, setIsGift] = useState(false);
  const [giftRecipientName, setGiftRecipientName] = useState('');
  const [giftRecipientPhone, setGiftRecipientPhone] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [addressText, setAddressText] = useState('');
  const [estate, setEstate] = useState('');
  const [landmark, setLandmark] = useState('');
  const [referralCode, setReferralCode] = useState(initialReferralCode ?? '');
  // Open only for someone who arrived holding a code — see the section's own comment.
  const [referralOpen, setReferralOpen] = useState(Boolean(initialReferralCode));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Focused and scrolled to on failure; see `surfaceError`.
  const errorRef = useRef<HTMLParagraphElement>(null);

  const box = useMemo(() => boxes.find((candidate) => candidate.id === boxId) ?? null, [boxes, boxId]);
  const requiredPicks = box?.guaranteedPickCount ?? 0;
  // The picker takes step 2 when it is shown, so everything below it
  // shifts by one rather than leaving a hole in the numbering.

  // Fires once, only when checkout actually loaded with the rescue
  // offer as the box in play — i.e. the visitor arrived via its own
  // direct link, not by picking it out of a general grid it never
  // appears in (§ exit-intent rescue offer). Intentionally keyed off
  // the *initial* box, not every later re-selection: switching away
  // and back mid-session shouldn't recount as a fresh funnel entry.
  const startedTrackingRef = useRef(false);
  useEffect(() => {
    if (startedTrackingRef.current) return;
    if (boxId && boxes.find((candidate) => candidate.id === boxId)?.isRescueOffer) {
      startedTrackingRef.current = true;
      trackEvent(RESCUE_OFFER_EVENTS.checkoutStarted, { packageId: boxId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once for the box checkout loaded with, not on every boxId change.
  }, []);

  /*
   * `InitiateCheckout` to the ad pixels, once per visit to this page
   * (§ report chat orders as InitiateCheckout).
   *
   * Here as well as on the WhatsApp button, and that pairing is the
   * point: reporting only the chat hand-off would teach Meta and
   * TikTok that chat clickers are the only people who ever start a
   * checkout, and they would optimise the ad spend towards them
   * accordingly. Both routes are the same step to a platform, so both
   * report it.
   *
   * Once, keyed off the box the page loaded with — the same reasoning
   * as the rescue-offer effect above. Swapping boxes mid-session is
   * not a second checkout.
   */
  const pixelCheckoutRef = useRef(false);
  useEffect(() => {
    if (pixelCheckoutRef.current) return;
    pixelCheckoutRef.current = true;
    const initial = boxes.find((candidate) => candidate.id === boxId);
    trackPixelInitiateCheckout({
      ...(boxId ? { packageId: boxId } : {}),
      ...(initial ? { valueKes: initial.priceKes } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above; one report per page visit.
  }, []);

  /**
   * `checkout_form_started` — fired the first time the customer types
   * into one of their own details, never on render (§ Mission 2 —
   * funnel analytics). Landing on this page is already a page view;
   * what was missing was the difference between arriving and actually
   * starting, which is the drop-off the admin dashboard could not see.
   * A ref, not state, so marking it started never re-renders the form.
   */
  const formStartedRef = useRef(false);
  function markFormStarted() {
    if (formStartedRef.current) {
      return;
    }
    formStartedRef.current = true;
    trackEvent(FUNNEL_EVENTS.checkoutFormStarted, {
      ...(boxId ? { packageId: boxId } : {}),
      deliveryMethod,
    });
  }
  /*
   * `markFormStarted` closes over `boxId` and `deliveryMethod`, so it
   * is a new function every render. Held in a ref so a stable callback
   * can still call the current one.
   */
  const markFormStartedRef = useRef(markFormStarted);
  // Updated in an effect rather than during render: writing a ref
  // mid-render is what the compiler forbids, and effects have flushed
  // long before anyone can tap a snack.
  useEffect(() => {
    markFormStartedRef.current = markFormStarted;
  });

  /*
   * Defined with an empty dependency list on purpose: `markFormStarted`
   * only reads refs, and `setGuaranteedSnackIds` is a setter React
   * guarantees is stable. A dependency here would change the callback's
   * identity and re-render the grid for unrelated reasons, which is the
   * problem this exists to solve.
   */
  const handlePicksChange = useCallback(
    (ids: string[], snacks: { id: string; imageUrl: string | null; origin: string | null }[]) => {
      markFormStartedRef.current();
      setGuaranteedSnackIds(ids);
      setGuaranteedSnackThumbs(
        snacks.map(({ id, imageUrl, origin }) => ({ id, imageUrl, origin })),
      );
    },
    [],
  );

  const quote = useCheckoutQuote({
    packageId: boxId,
    quantity,
    // Without this the live total would price the first box only, and
    // the M-Pesa prompt would be for more than the screen said.
    extras: extraBoxes,
    deliveryMethod,
    pickupStationId: station?.id,
    referralCode: referralCode.trim(),
    discountCode: discountCode.trim(),
    phone,
    serviceLevel: deliveryMethod === 'door' ? serviceLevel : undefined,
  });

  /*
   * Boxes that could still be added: not the primary, not already an
   * extra, and not sold out. A control that offers something the
   * server will refuse is worse than no control.
   */
  const availableExtras = boxes.filter(
    (candidate) =>
      candidate.id !== boxId &&
      candidate.stockCount !== 0 &&
      !extraBoxes.some((extra) => extra.packageId === candidate.id),
  );

  function addExtraBox(packageId: string) {
    setExtraBoxes((current) => [...current, { packageId, quantity: 1 }]);
  }

  /** Stepping the last one off removes the line, so an extra can never sit at zero. */
  function changeExtraQuantity(packageId: string, delta: number) {
    setExtraBoxes((current) =>
      current
        .map((extra) =>
          extra.packageId === packageId
            ? { ...extra, quantity: extra.quantity + delta }
            : extra,
        )
        .filter((extra) => extra.quantity >= 1),
    );
  }

  const maxQuantity = Math.min(MAX_QUANTITY, box?.stockCount ?? MAX_QUANTITY);
  const outOfStock = box?.stockCount === 0;

  /*
   * Validation, addressed to a field rather than to a list.
   *
   * This was a flat `string[]` joined into one sentence under the pay
   * button. It read as a scolding before the customer had typed
   * anything, it was hidden entirely on mobile (the list lived in a
   * `hidden sm:flex` block), and it never told anyone *which* field to
   * fix — a customer four sections down had to map "Enter a valid
   * Kenyan mobile number" back to a field they had scrolled past.
   *
   * Keying each problem to its input id fixes all three: the message
   * can sit under its own field, the first one can be focused when
   * somebody presses Pay, and the fields still add up to one `ready`.
   */
  /*
   * The journey, as which section is on screen. One form, one submit —
   * the quote, the gift block and the codes all read from one piece of
   * state, and splitting the stages across routes would mean carrying
   * that through a URL or rebuilding it per step.
   */
  const stages = useMemo(() => stagesFor(requiredPicks > 0), [requiredPicks]);
  const [stageIndex, setStageIndex] = useState(0);
  // Clamped rather than reset: switching to a box without picks
  // shortens the journey, and a customer already past that point
  // should stay where they are rather than being sent back.
  const currentStage = stages[Math.min(stageIndex, stages.length - 1)];
  const isLastStage = stageIndex >= stages.length - 1;

  type FieldProblem = { field: string; message: string };
  const problemList: FieldProblem[] = [];
  const flag = (field: string, message: string) => problemList.push({ field, message });

  if (!box) flag('checkout-box', 'Choose a box to continue.');
  if (customerName.trim().length < 2) flag('checkout-name', 'Enter your name.');
  if (!isValidKenyanPhone(phone)) {
    // Names the shape rather than saying "invalid": the customer
    // cannot act on a verdict, only on an example.
    flag('checkout-phone', 'Use a Kenyan mobile number, like 0712 345 678.');
  }
  // Blank passes: the field is optional. Only something typed that
  // cannot be an address is worth stopping for, and only because the
  // customer can still fix it while they are looking at it.
  if (!isAcceptableEmailInput(email)) flag('checkout-email', 'That email address looks incomplete.');
  if (requiredPicks > 0 && guaranteedSnackIds.length !== requiredPicks) {
    const remaining = requiredPicks - guaranteedSnackIds.length;
    flag(
      'checkout-picks',
      remaining > 0
        ? `Choose ${remaining} more snack${remaining === 1 ? '' : 's'}.`
        : `Choose exactly ${requiredPicks} snacks.`,
    );
  }
  if (deliveryMethod === 'pickup' && !station) {
    flag('checkout-pickup', 'Choose where to collect your box.');
  }
  if (deliveryMethod === 'door' && addressText.trim().length < 5) {
    flag('checkout-address', 'Enter the address we should deliver to.');
  }
  /*
   * Checked here as well as on the server, for the ordinary reason: a
   * buyer can fix a typo while it is still on screen, and the server's
   * copy is what actually guarantees a gift is deliverable.
   */
  if (isGift && giftRecipientName.trim().length === 0) {
    flag('checkout-gift-name', 'Tell us who the gift is for.');
  }
  if (isGift && !isValidKenyanPhone(giftRecipientPhone)) {
    flag('checkout-gift-phone', "Use the recipient's Kenyan number, like 0712 345 678.");
  }
  if (isGift && giftMessage.trim().length > GIFT_MESSAGE_MAX_LENGTH) {
    flag('checkout-gift-message', `Keep the note to ${GIFT_MESSAGE_MAX_LENGTH} characters.`);
  }

  const ready = problemList.length === 0 && !outOfStock;

  /*
   * What stands between the customer and the *next* stage, which is
   * not the same as what stands between them and paying. Asking for a
   * delivery address while they are still choosing a box would be the
   * old long-form problem in a new shape.
   */
  const stageProblems = problemList.filter(
    (problem) => stageForField(problem.field) === currentStage.id,
  );
  const stageReady = stageProblems.length === 0 && !(currentStage.id === 'box' && outOfStock);

  /*
   * One label for both buttons. Naming the amount only on the stage
   * that charges it: "Pay KES 3,750" on the box step would be a total
   * the customer has not finished assembling.
   */
  const ctaLabel = advanceLabelFor(
    stages[stageIndex + 1],
    quote ? formatKes(quote.pricing.totalKes) : null,
  );

  /*
   * A field's message appears once the customer has left it, or once
   * they have tried to pay — never while they are still typing their
   * first character into it. Before this the whole list rendered from
   * the very first paint, so an untouched checkout greeted a
   * first-time customer with four things they had done wrong.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const markTouched = useCallback((field: string) => {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  }, []);
  function errorFor(field: string): string | null {
    if (!submitAttempted && !touched[field]) {
      return null;
    }
    return problemList.find((problem) => problem.field === field)?.message ?? null;
  }

  /**
   * Moves the customer to the first thing that needs them.
   *
   * The pay button used to be `disabled` until the form was valid,
   * which meant tapping the one control they came to press did
   * nothing at all and taught them nothing. Pressing it now always
   * does something: either it pays, or it shows every outstanding
   * message and takes them to the first one.
   */
  /**
   * Shows a submit failure where the customer is actually looking.
   *
   * On a phone the pay button is the fixed bar at the bottom of the
   * viewport, while this message renders in the page flow beside the
   * desktop button — after a long form, well above the fold. Setting
   * it alone meant tapping Pay could look like it had done nothing,
   * and the natural next move is to tap again, on a payment form.
   */
  function surfaceError(message: string) {
    setError(message);
    window.setTimeout(() => {
      errorRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      errorRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  function focusFirstProblem(within: FieldProblem[] = problemList) {
    const first = within[0];
    if (!first) {
      return;
    }

    /*
     * The field may belong to a stage that is not on screen. Sections
     * stay mounted but hidden, so focusing one directly would put the
     * cursor into `display: none` — the press would appear to do
     * nothing, which is the exact failure the focus behaviour exists
     * to prevent. Move to its stage first.
     */
    const owningStage = stageForField(first.field);
    const owningIndex = stages.findIndex((stage) => stage.id === owningStage);
    if (owningIndex >= 0 && owningIndex !== stageIndex) {
      setStageIndex(owningIndex);
    }

    const element = document.getElementById(first.field);
    if (!element) {
      return;
    }
    /*
     * Optional-called on purpose. Scrolling is a courtesy; focusing is
     * the part that matters. Where `scrollIntoView` is unavailable an
     * unguarded call throws straight out of the submit handler, and
     * the customer presses Pay and gets nothing — the exact failure
     * this function exists to prevent.
     */
    /*
     * Deferred, for two reasons at once: a stage change has to paint
     * before its field can take focus, and focusing before the scroll
     * is under way makes the browser jump instantly and undo it.
     */
    window.setTimeout(() => {
      const target = document.getElementById(first.field);
      target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      window.setTimeout(() => (target as HTMLElement | null)?.focus({ preventScroll: true }), 250);
    }, 0);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    /*
     * On every stage but the last this button moves forward rather
     * than paying. One `<form>` and one submit handler keeps Enter
     * working the way a keyboard user expects at each stage, and keeps
     * the pay path a single place rather than one per stage.
     */
    if (!isLastStage) {
      if (!stageReady) {
        setSubmitAttempted(true);
        focusFirstProblem(stageProblems);
        return;
      }
      setStageIndex((current) => Math.min(current + 1, stages.length - 1));
      // The next stage starts at its own top, not at the scroll
      // position of the one just left.
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!ready || !box) {
      // Reveals every message at once, not just the touched ones.
      setSubmitAttempted(true);
      focusFirstProblem();
      return;
    }
    setSubmitting(true);
    setError(null);

    // The real "they tried to pay" moment: past client validation,
    // immediately before the request that triggers the STK push — not
    // the button rendering, and not a click that validation rejected.
    // Deliberately outside the try/catch that follows, but itself
    // incapable of throwing (`trackEvent` swallows everything), so a
    // broken beacon can never stop a purchase.
    trackEvent(FUNNEL_EVENTS.paySubmitted, {
      packageId: box.id,
      quantity,
      deliveryMethod,
      hasReferralCode: referralCode.trim().length > 0,
      isGift,
    });

    try {
      const response = await fetch('/api/checkout/web', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packageId: box.id,
          quantity,
          // Only when there is genuinely more than one box, so a
          // single-box checkout sends the request it always sent.
          ...(extraBoxes.length > 0
            ? { items: [{ packageId: box.id, quantity }, ...extraBoxes] }
            : {}),
          customerName: customerName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          // Pickup takes the county from the station the customer
          // picked; door delivery is Nairobi-only by policy.
          county: deliveryMethod === 'pickup' ? (station?.county ?? '') : 'Nairobi',
          deliveryMethod,
          ...(deliveryMethod === 'pickup'
            ? { pickupStationId: station?.id }
            : {
                addressText: addressText.trim(),
                estate: estate.trim() || undefined,
                landmark: landmark.trim() || undefined,
              }),
          ...(deliveryMethod === 'door' ? { serviceLevel } : {}),
          referralCode: referralCode.trim() || undefined,
          discountCode: discountCode.trim() || undefined,
          ...(requiredPicks > 0 ? { guaranteedSnackIds } : {}),
          // Sent only when the toggle is on, so an ordinary checkout
          // posts exactly the body it always posted.
          ...(isGift
            ? {
                gift: {
                  recipientName: giftRecipientName.trim(),
                  recipientPhone: giftRecipientPhone.trim(),
                  message: giftMessage.trim() || undefined,
                },
              }
            : {}),
        }),
      });

      /*
       * Parsed defensively: a 500 from Next is an HTML error page, so
       * `response.json()` throws and an unguarded throw lands in the
       * catch below — which told customers to check their connection
       * for a request that reached us perfectly well and failed inside.
       * On a payment form that is the worst possible misdirection.
       */
      const payload = (await response.json().catch(() => null)) as
        | WebCheckoutResponse
        | { error: string }
        | null;

      if (!response.ok) {
        surfaceError(
          payload && 'error' in payload
            ? payload.error
            : 'Something went wrong on our end — no payment was taken. Please try again in a moment.',
        );
        return;
      }
      if (!payload) {
        surfaceError('Something went wrong on our end — no payment was taken. Please try again in a moment.');
        return;
      }

      /*
       * Remembered before navigating, so a customer who closes the tab
       * on the payment screen can be offered their way back
       * (§ checkout second pass). Written here rather than on that
       * screen because this is the last moment we know what they were
       * buying and what it cost.
       */
      const session = (payload as WebCheckoutResponse).checkoutSessionId;
      rememberPendingCheckout({
        sessionId: session,
        label: box.name,
        totalKes: quote?.pricing.totalKes ?? box.priceKes * quantity,
      });

      // The STK prompt is already on its way — the payment screen owns
      // everything from here, including telling the customer if the
      // prompt never arrived.
      router.push(`/checkout/${session}`);
    } catch {
      // Genuinely never reached us — fetch itself rejected.
      surfaceError("We couldn't reach Snack Quest. No payment was taken. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (boxes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No boxes are available right now. Please check back shortly.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {/*
        Two columns on a large screen, one everywhere else.

        The summary and the pay button sat at the very bottom of a long
        form, so a desktop customer filled in every field with no sight
        of what they were buying or what it cost — the two facts the
        page exists to settle. As a sticky rail they stay in view while
        the form is worked through.

        `items-start` so the rail sticks rather than being stretched to
        the row height, and its own max height and scroll so a long
        order can never grow past the viewport and strand the button
        off-screen. Below `lg` none of it applies: the summary sits
        where it always did and the fixed bar carries the action.
      */}
      <CheckoutProgress
        stages={stages}
        currentIndex={stageIndex}
        /*
          Backwards only. A stage ahead may be blocked by a field the
          customer has not filled, and a control that sometimes
          silently refuses is worse than one that is plainly absent.
        */
        onJumpTo={(index) => {
          setStageIndex(index);
          window.scrollTo?.({ top: 0, behavior: 'smooth' });
        }}
      />

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-9 sm:gap-12">
      <section className="flex flex-col gap-4" hidden={currentStage.id !== 'box'}>
        <SectionHeading title="Your box" />
        <div id="checkout-box" tabIndex={-1} className="outline-none">
          <FieldError id="checkout-box" message={errorFor('checkout-box')} />
        </div>
        {/*
          The delivery floor, stated before the box is even chosen
          (§ show delivery before the last step).

          Prices on this site exclude delivery, so the total moved from
          2,500 to 2,750 at the last step — after the customer had
          picked a box, typed their name and their number. That is the
          worst possible moment to raise a price, and it is exactly
          where the logs show people stopping. Said here, the increase
          is something they were told before they invested anything.

          Hidden entirely when no rule could be read, rather than
          falling back to a constant: a delivery price that is wrong is
          worse than one that is absent.
        */}
        {deliveryFromKes !== null ? (
          <p className="text-muted-foreground -mt-1 text-sm">
            Prices below exclude delivery, which starts at{' '}
            <span className="text-foreground font-semibold">{formatKes(deliveryFromKes)}</span>
            {' and depends on where it’s going. You’ll see the exact total before you pay.'}
          </p>
        ) : null}
        {/*
          Every box visible at once, no interaction required to see the
          options. This was a swipeable rail, which saved vertical space
          but hid boxes behind a gesture people didn't realise was
          there — and a box a customer never sees is a box they can't
          buy. Compact rows on a phone cost barely more height than the
          rail did while showing all three; the roomier grid returns as
          soon as there's width for it.
        */}
        <ul className="flex flex-col gap-2.5 sm:grid sm:grid-cols-3 sm:gap-3">
          {boxes.map((candidate) => {
            const isSelected = candidate.id === boxId;
            const soldOut = candidate.stockCount === 0;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  disabled={soldOut}
                  onClick={() => {
                    setBoxId(candidate.id);
                    setQuantity(1);
                    // The new primary could be one of the extras, and
                    // the same box twice is refused server-side.
                    setExtraBoxes((current) =>
                      current.filter((extra) => extra.packageId !== candidate.id),
                    );
                    // Picks belong to the box that offered them.
                    // Carrying them across would submit snacks against
                    // a box that never asked for any — which the
                    // server rejects, leaving the customer with an
                    // error they cannot act on.
                    setGuaranteedSnackIds([]);
                    setGuaranteedSnackThumbs([]);
                    // Changing the box here is the same intent as
                    // clicking "buy this box" elsewhere, so it reports
                    // as the same event with its own source.
                    if (candidate.id !== boxId) {
                      trackEvent(FUNNEL_EVENTS.boxSelected, {
                        source: 'checkout_picker',
                        packageId: candidate.id,
                        priceKes: candidate.priceKes,
                      });
                    }
                  }}
                  aria-pressed={isSelected}
                  className={cn(
                    'focus-visible:ring-primary relative flex h-full w-full items-center gap-3 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 sm:flex-col sm:items-start sm:gap-3 sm:p-4',
                    isSelected ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-border/30',
                    soldOut && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <div className="bg-border/40 relative size-12 shrink-0 overflow-hidden rounded-lg">
                    {candidate.imageUrl ? (
                      <Image src={candidate.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xl" aria-hidden="true">
                        🍿
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 sm:w-full sm:flex-none">
                    {/*
                      The badge and the pick line are what make this box
                      read as a better product rather than a bigger one,
                      so they sit above the name where the eye lands
                      first (§ Premium: choose 5, discover the rest).
                    */}
                    {candidate.highlightLabel ? (
                      <p className="bg-primary/10 text-primary mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-bold tracking-wide uppercase">
                        <Star className="size-3 fill-current" aria-hidden="true" />
                        {candidate.highlightLabel}
                      </p>
                    ) : null}
                    <p className="text-foreground text-sm font-semibold">{candidate.name}</p>
                    {candidate.guaranteedPickCount > 0 ? (
                      <p className="text-primary mt-0.5 text-sm font-medium">
                        Pick {candidate.guaranteedPickCount}. We&apos;ll surprise you with the rest.
                      </p>
                    ) : null}
                    {candidate.snackCountLabel ? (
                      <p className="text-muted-foreground mt-0.5 text-sm">{candidate.snackCountLabel}</p>
                    ) : null}
                    {soldOut ? <p className="text-danger mt-0.5 text-sm font-medium">Sold out</p> : null}
                    {/* On the grid the price sits under the name; in a
                        row it belongs on the right, where a reader
                        scanning prices expects to find it. */}
                    <p className="text-foreground mt-1 hidden text-base font-semibold sm:block">
                      {formatKes(candidate.priceKes)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:hidden">
                    <span className="text-foreground text-base font-semibold">
                      {formatKes(candidate.priceKes)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full border transition-colors',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-surface',
                      )}
                    >
                      {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                  </div>

                  {isSelected ? (
                    <span className="bg-primary text-primary-foreground absolute top-3 right-3 hidden size-5 items-center justify-center rounded-full sm:flex">
                      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-border bg-surface flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <p className="text-foreground text-sm font-medium">Quantity</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {box ? `${formatKes(box.priceKes)} each` : 'Choose a box first'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
            >
              <Minus aria-hidden="true" />
            </Button>
            <span className="text-foreground w-8 text-center text-base font-semibold" aria-live="polite">
              {quantity}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
              disabled={quantity >= maxQuantity}
              aria-label="Increase quantity"
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/*
          A second, different box (§ more than one box per order). A
          customer asked for one of each and could only be sold one,
          which meant two orders and two delivery fees.

          Below the primary box rather than woven into the cards above,
          so nothing about choosing a single box changes. Hidden
          entirely when there is only one box in the catalogue, where
          the control could do nothing.
        */}
        {availableExtras.length > 0 || extraBoxes.length > 0 ? (
          <div className="flex flex-col gap-2">
            {extraBoxes.map((extra) => {
              const extraBox = boxes.find((candidate) => candidate.id === extra.packageId);
              if (!extraBox) return null;
              const extraMax = Math.min(MAX_QUANTITY, extraBox.stockCount ?? MAX_QUANTITY);
              return (
                <div
                  key={extra.packageId}
                  className="border-border bg-surface flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">{extraBox.name}</p>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {formatKes(extraBox.priceKes)} each
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => changeExtraQuantity(extra.packageId, -1)}
                      aria-label={`Decrease ${extraBox.name}`}
                    >
                      <Minus aria-hidden="true" />
                    </Button>
                    <span className="text-foreground w-6 text-center text-base font-semibold tabular-nums">
                      {extra.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => changeExtraQuantity(extra.packageId, 1)}
                      disabled={extra.quantity >= extraMax}
                      aria-label={`Increase ${extraBox.name}`}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {availableExtras.length > 0 ? (
              <details className="border-border rounded-lg border p-3">
                <summary className="text-foreground cursor-pointer text-sm font-medium">
                  Add another box
                </summary>
                <ul className="mt-3 flex flex-col gap-2">
                  {availableExtras.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => addExtraBox(candidate.id)}
                        className="hover:bg-border/40 flex w-full items-center justify-between gap-3 rounded-md p-2 text-left"
                      >
                        <span className="text-foreground text-sm">{candidate.name}</span>
                        <span className="text-muted-foreground text-sm tabular-nums">
                          {formatKes(candidate.priceKes)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>

      {/*
        Only for a box that offers picks. Placed immediately after the
        box because it is part of choosing the product, not part of
        checking out — and the steps below renumber around it so a
        Standard checkout never shows a gap where step 2 used to be.
      */}
      {requiredPicks > 0 ? (
        <section className="flex flex-col gap-4" hidden={currentStage.id !== 'snacks'}>
          <SectionHeading title={`Choose your ${requiredPicks} snacks`} />
          {/*
            Names the total, not just the five. "Choose 5" without it
            left customers assuming the picks were on top of the box's
            advertised count rather than part of it.
          */}
          <p className="text-muted-foreground -mt-2 text-sm">
            {box?.snackCountLabel
              ? `Your box has ${box.snackCountLabel}. Pick ${requiredPicks} of them yourself — we choose the rest as your surprise.`
              : `Pick any ${requiredPicks} snacks from the current selection. These are guaranteed to be in your box — we'll fill the rest with surprises.`}
          </p>
          {/*
            An anchor `focusFirstProblem` can land on. The picker's own
            controls are a disclosure and 62 cards; sending the
            customer to the section is more useful than to any one of
            them.
          */}
          <div id="checkout-picks" tabIndex={-1} className="outline-none">
            <FieldError id="checkout-picks" message={errorFor('checkout-picks')} />
          </div>
          <GuaranteedPicker
            required={requiredPicks}
            selectedIds={guaranteedSnackIds}
            // Stable, so the memo on the picker holds. An inline arrow
            // would be a new prop on every keystroke elsewhere in this
            // form and the grid would re-render regardless.
            onChange={handlePicksChange}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-4" hidden={currentStage.id !== 'details'}>
        <SectionHeading title="Your details" />
        <p className="text-muted-foreground -mt-2 text-sm">
          We&rsquo;ll use this to send your order updates and receipt.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="checkout-name">Full name</Label>
            <Input
              id="checkout-name"
              value={customerName}
              onChange={(event) => {
                markFormStarted();
                setCustomerName(event.target.value);
              }}
              autoComplete="name"
              placeholder="Wanjiru Kamau"
              onBlur={() => markTouched('checkout-name')}
              aria-invalid={Boolean(errorFor('checkout-name'))}
              aria-describedby={errorFor('checkout-name') ? 'checkout-name-error' : undefined}
              required
            />
            <FieldError id="checkout-name" message={errorFor('checkout-name')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="checkout-phone">M-Pesa number</Label>
            <Input
              id="checkout-phone"
              value={phone}
              onChange={(event) => {
                markFormStarted();
                // Grouped as they type, so the shape is visible at the
                // digit where a mistake was made rather than after
                // leaving the field. Only the display changes — the
                // number sent for payment is normalized server-side.
                setPhone(formatKenyanPhoneInput(event.target.value));
              }}
              inputMode="numeric"
              autoComplete="tel"
              placeholder="0712 345 678"
              onBlur={() => markTouched('checkout-phone')}
              aria-invalid={Boolean(errorFor('checkout-phone'))}
              aria-describedby={errorFor('checkout-phone') ? 'checkout-phone-error' : undefined}
              required
            />
            <FieldError id="checkout-phone" message={errorFor('checkout-phone')} />
            <p className="text-muted-foreground text-sm">
              e.g. 0712 345 678. The M-Pesa prompt comes to this number.
            </p>
          </div>
          {/*
            Optional, and labelled as optional rather than merely
            lacking `required` — an unmarked field on a checkout reads
            as one more thing standing between the customer and their
            snacks. Full width beneath the pair above so it is
            visibly the extra rather than a third of three equals.
          */}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="checkout-email">
              Email <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="checkout-email"
              type="email"
              value={email}
              onChange={(event) => {
                markFormStarted();
                setEmail(event.target.value);
              }}
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              onBlur={() => markTouched('checkout-email')}
              aria-invalid={Boolean(errorFor('checkout-email'))}
              aria-describedby={errorFor('checkout-email') ? 'checkout-email-error' : undefined}
            />
            <FieldError id="checkout-email" message={errorFor('checkout-email')} />
            <p className="text-muted-foreground text-sm">
              For your receipt. We&apos;ll text your order updates to the number above either way.
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4" hidden={currentStage.id !== 'delivery'}>
        <SectionHeading title="Where it's going" />
        <div className="grid gap-3 sm:grid-cols-2">
          {/*
            Both titles name their area, and that is the fix for a real
            lost sale: "Nairobi door delivery" told a customer in Thika
            they were not covered, so they went hunting for a Fargo
            station — of which Thika has none, precisely because it is
            inside the radius and gets door delivery. The pickup option
            said "countrywide", which made that hunt sound reasonable.
          */}
          <DeliveryOption
            selected={deliveryMethod === 'door'}
            onSelect={() => setDeliveryMethod('door')}
            icon={<Truck className="size-5" aria-hidden="true" />}
            title="Door delivery"
            detail={`${metroAreaLabel()}. Tushop brings it to your address: next day, same day, or express in ${EXPRESS_DELIVERY_MINUTES} minutes.`}
          />
          <DeliveryOption
            selected={deliveryMethod === 'pickup'}
            onSelect={() => setDeliveryMethod('pickup')}
            icon={<Store className="size-5" aria-hidden="true" />}
            title="Fargo pickup point"
            detail="Everywhere else in Kenya. Collect from a station near you; the fee is shown before you pay."
          />
        </div>

        {deliveryMethod === 'pickup' ? (
          <>
          <div id="checkout-pickup" tabIndex={-1} className="outline-none">
            <FieldError id="checkout-pickup" message={errorFor('checkout-pickup')} />
          </div>
          <PickupStationPicker
            selected={station}
            onSelect={setStation}
            onSwitchToDoor={() => {
              setStation(null);
              setDeliveryMethod('door');
            }}
          />
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-foreground text-sm font-medium">How fast?</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                <SpeedOption
                  selected={serviceLevel === 'next-day'}
                  onSelect={() => setServiceLevel('next-day')}
                  title="Next day"
                  detail={`Delivered by ${NEXT_DAY_ARRIVAL_HOUR % 12}:00 PM the following day.`}
                />
                {/*
                  Only offered while Tushop will still accept it. Shown
                  disabled rather than hidden after the cut-off, because
                  a customer who came back for same-day deserves to be
                  told it closed at 1pm rather than left wondering where
                  the option went.
                */}
                <SpeedOption
                  selected={serviceLevel === 'same-day'}
                  onSelect={() => sameDayOpen && setServiceLevel('same-day')}
                  disabled={!sameDayOpen}
                  title="Same day"
                  detail={
                    sameDayOpen
                      ? `Order by ${SAME_DAY_CUTOFF_HOUR % 12}:00 PM for delivery by ${SAME_DAY_ARRIVAL_HOUR % 12}:00 PM today.`
                      : sameDayWindow === 'closed_today'
                        ? 'Not available on Sundays. Next day arrives Monday.'
                        : `Closed for today. Orders must be in by ${SAME_DAY_CUTOFF_HOUR % 12}pm.`
                  }
                />
                {/*
                  Same disabled-not-hidden treatment, same reason, with
                  one extra state: express runs 10am to 1pm, so it is
                  shut both early and late and the two need different
                  words.
                */}
                <SpeedOption
                  selected={serviceLevel === 'express'}
                  onSelect={() => expressOpen && setServiceLevel('express')}
                  disabled={!expressOpen}
                  title="Express"
                  detail={
                    expressOpen
                      ? `Collection and delivery within ${EXPRESS_DELIVERY_MINUTES} minutes.`
                      : expressWindow === 'closed_today'
                        ? 'Not available on Sundays. Next day arrives Monday.'
                        : expressWindow === 'before'
                          ? `Opens at ${EXPRESS_OPEN_HOUR}am. Collection and delivery within ${EXPRESS_DELIVERY_MINUTES} minutes.`
                          : `Closed for today. Orders must be in between ${EXPRESS_OPEN_HOUR}am and ${EXPRESS_CUTOFF_HOUR % 12}pm.`
                  }
                />
              </div>
            </fieldset>

            <div className="border-border bg-primary/5 rounded-lg border p-4">
              <p className="text-foreground text-sm font-medium">Delivered by Tushop</p>
              <p className="text-muted-foreground mt-2 text-sm">
                We hand your box to Tushop and they bring it to the address you give below.
                The delivery fee is in your total, so there is nothing to arrange or pay afterwards.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="checkout-address">Delivery address</Label>
              <Input
                id="checkout-address"
                value={addressText}
                onChange={(event) => setAddressText(event.target.value)}
                autoComplete="street-address"
                placeholder="Kilimani, Argwings Kodhek Rd"
                onBlur={() => markTouched('checkout-address')}
                aria-invalid={Boolean(errorFor('checkout-address'))}
                aria-describedby={errorFor('checkout-address') ? 'checkout-address-error' : undefined}
                required
              />
              <FieldError id="checkout-address" message={errorFor('checkout-address')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="checkout-estate">Estate or building (optional)</Label>
                <Input
                  id="checkout-estate"
                  value={estate}
                  onChange={(event) => setEstate(event.target.value)}
                  placeholder="Wood Avenue Court"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="checkout-landmark">Nearest landmark (optional)</Label>
                <Input
                  id="checkout-landmark"
                  value={landmark}
                  onChange={(event) => setLandmark(event.target.value)}
                  placeholder="Opposite Yaya Centre"
                />
              </div>
            </div>
          </div>
        )}

        {/*
          Sits with the address rather than with the buyer's own
          details, because that is the question it changes: not who is
          paying, but where this is going and who opens it. Offered for
          pickup as well as door, with the one honest caveat that a
          pickup gift cannot stay a secret.
        */}
        <fieldset className="border-border flex flex-col gap-3 rounded-lg border p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={isGift}
              onChange={(event) => setIsGift(event.target.checked)}
              className="mt-1 size-4 shrink-0 accent-[color:var(--primary)]"
            />
            <span>
              <span className="text-foreground block text-sm font-medium">
                This box is a gift for someone else 🎁
              </span>
              <span className="text-muted-foreground block text-sm">
                We&rsquo;ll deliver to them and keep every order update coming to you, so the
                surprise holds.
              </span>
            </span>
          </label>

          {isGift ? (
            <div className="flex flex-col gap-4 pt-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="checkout-gift-name">Who is it for?</Label>
                  <Input
                    id="checkout-gift-name"
                    value={giftRecipientName}
                    onChange={(event) => setGiftRecipientName(event.target.value)}
                    placeholder="Amina Wanjiru"
                    autoComplete="off"
                    onBlur={() => markTouched('checkout-gift-name')}
                    aria-invalid={Boolean(errorFor('checkout-gift-name'))}
                  />
                  <FieldError id="checkout-gift-name" message={errorFor('checkout-gift-name')} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="checkout-gift-phone">Their phone number</Label>
                  <Input
                    id="checkout-gift-phone"
                    value={giftRecipientPhone}
                    onChange={(event) => setGiftRecipientPhone(event.target.value)}
                    placeholder="07XX XXX XXX"
                    inputMode="tel"
                    autoComplete="off"
                    onBlur={() => markTouched('checkout-gift-phone')}
                    aria-invalid={Boolean(errorFor('checkout-gift-phone'))}
                  />
                  <FieldError id="checkout-gift-phone" message={errorFor('checkout-gift-phone')} />
                  {/*
                    Says what the number is for, because handing over
                    someone else's number deserves a reason. It goes to
                    the rider and nowhere else.
                  */}
                  <p className="text-muted-foreground text-xs">
                    Only for the rider to reach them at the door. We never text them about the
                    order.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="checkout-gift-message">Note to pack in the box (optional)</Label>
                <textarea
                  id="checkout-gift-message"
                  value={giftMessage}
                  onChange={(event) => setGiftMessage(event.target.value)}
                  maxLength={GIFT_MESSAGE_MAX_LENGTH}
                  rows={3}
                  placeholder="Happy birthday! Thought you'd love these."
                  className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                />
                <p className="text-muted-foreground text-xs">
                  Hand-written on a card and packed with the snacks.{' '}
                  {GIFT_MESSAGE_MAX_LENGTH - giftMessage.trim().length} characters left.
                </p>
              </div>

              {deliveryMethod === 'pickup' ? (
                /*
                  Said plainly rather than discovered afterwards: a
                  pickup gift needs the recipient to go and collect it,
                  so the courier has to contact them and the surprise is
                  spent. Door delivery is the one that stays secret.
                */
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  Heads up: for a pickup point, the courier texts the recipient to come and
                  collect, so they&rsquo;ll know a parcel is waiting. Choose door delivery to keep
                  it a surprise.
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>
      </section>

      {/*
        Collapsed behind a link (§ stop prompting for a code nobody
        has).

        As a numbered step with an open field, this asked every single
        customer "do you have a discount code?" immediately above the
        total. Most do not — and the reliable response to being asked
        is to leave and go looking for one, which is a departure the
        checkout never gets back. The people who genuinely hold a
        creator's code know they hold it and will open this; nobody
        else is reminded that a cheaper price might exist.

        Not a numbered step any more, for the same reason: numbering it
        made an optional field look like something owed before paying.
        It opens by itself when a code arrived in the URL, since that
        customer already has one and hiding it would look like it was
        ignored.
      */}
      <section className="flex flex-col gap-3" hidden={currentStage.id !== 'delivery'}>
        {!referralOpen ? (
          <button
            type="button"
            onClick={() => setReferralOpen(true)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-primary self-start rounded-md text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
          >
            Have a creator&apos;s code?
          </button>
        ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="checkout-referral">Creator&apos;s code</Label>
          <Input
            id="checkout-referral"
            value={referralCode}
            onChange={(event) => setReferralCode(event.target.value)}
            placeholder="SNACK10"
            autoCapitalize="characters"
          />
          {referralCode.trim() && quote?.referralCodeApplied && quote.pricing.discountKes > 0 ? (
            <p className="text-success text-sm">
              Code applied — {formatKes(quote.pricing.discountKes)} off your order.
            </p>
          ) : referralCode.trim() && quote?.referralCodeApplied ? (
            <p className="text-muted-foreground text-sm">
              Your code is valid, but referral discounts don&apos;t apply to this one-time offer.
            </p>
          ) : referralCode.trim() && quote?.referralCodeRejected ? (
            <p className="text-warning text-sm">
              We don&apos;t recognise that code. You can still order without it.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              We&apos;ll check it and apply any discount to your total before charging you.
            </p>
          )}

        </div>
        )}

        {/*
          A second, separate field rather than one box accepting
          either. They are different things: a creator's code names a
          person and pays them commission, a discount code is issued
          by Snack Quest and pays nobody. Sharing one input would mean
          guessing which a customer meant, and guessing wrong on a
          promo code would quietly credit commission to whichever
          creator happened to own a code of the same name.
        */}
        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="checkout-discount">Discount code</Label>
          <Input
            id="checkout-discount"
            value={discountCode}
            onChange={(event) => setDiscountCode(event.target.value)}
            placeholder="PRBOX"
            autoCapitalize="characters"
          />
          {/*
            Confirmed before paying, without spending a use.
            The quote checks the code against the same rules the
            charge applies; the charge is what claims it. So a
            one-use PR code is not burned by somebody who typed it
            and then abandoned the form, and the customer still sees
            what it is worth before pressing pay.
          */}
          {discountCode.trim() && quote?.discountCodeApplied ? (
            <p className="text-success text-sm">
              Code applied: {formatKes(quote.discountCodeKes)} off
              {quote.discountCodeWaivesDelivery ? ', delivery free' : ''}.
            </p>
          ) : discountCode.trim() && quote?.discountCodeRejected ? (
            <p className="text-warning text-sm">
              That code isn&apos;t valid. You can still order without it.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Applied to your total before you&apos;re charged.
            </p>
          )}
        </div>
      </section>

        </div>

        <div className="mt-9 lg:sticky lg:top-24 lg:mt-0 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-2">
      <div className="border-border flex flex-col gap-4 border-t pt-8 lg:border-t-0 lg:pt-0">
        <OrderSummary
          snackThumbs={guaranteedSnackThumbs}
          quote={quote}
          stationChosen={deliveryMethod === 'pickup' ? Boolean(station) : true}
          fallbackLabel={box ? `${quantity} × ${box.name}` : 'Your order'}
          /*
            One row per box (§ more than one box per order). Without
            this the summary printed the *whole order's* subtotal
            against the first box's name — "1 × Starter Box KES 6,000"
            for a Starter plus a Deluxe. A total a customer cannot
            reconcile is a total they do not trust.
          */
          lines={
            box
              ? [
                  { label: box.name, quantity, amountKes: box.priceKes * quantity },
                  ...extraBoxes.flatMap((extra) => {
                    const extraBox = boxes.find((candidate) => candidate.id === extra.packageId);
                    return extraBox
                      ? [
                          {
                            label: extraBox.name,
                            quantity: extra.quantity,
                            amountKes: extraBox.priceKes * extra.quantity,
                          },
                        ]
                      : [];
                  }),
                ]
              : []
          }
          fallbackTotalKes={box ? box.priceKes * quantity : null}
        />
        <p className="text-muted-foreground text-sm">
          {deliveryMethod === 'door'
            ? 'Tushop delivers to your address. The fee is included in the total above.'
            : 'You’ll be prompted for exactly this amount on M-Pesa.'}
        </p>
        {error ? (
          <p
            ref={errorRef}
            // `tabIndex={-1}` so it can be focused programmatically
            // without becoming a tab stop for everyone else.
            tabIndex={-1}
            className="border-danger/30 bg-danger/5 text-danger rounded-lg border p-3 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {/*
          The in-flow submit is the one a desktop visitor uses, and the
          one that exists without JavaScript. On a phone the sticky bar
          below carries the real call to action, so this is hidden
          there rather than duplicated into two live buttons.
        */}
        {/*
          The decision, in one place, immediately before the control
          that acts on it. These three facts were each on screen
          somewhere — the amount in the summary, the method in a
          sentence, the number four sections up — and the customer had
          to assemble them from memory at the moment of committing
          money.
        */}
        {isLastStage && ready && quote ? (
          <div className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-muted-foreground text-sm">You&rsquo;re paying</span>
              <span className="text-foreground text-xl font-semibold tabular-nums">
                {formatKes(quote.pricing.totalKes)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-muted-foreground text-sm">With</span>
              <span className="text-foreground text-sm font-medium">M-Pesa</span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-muted-foreground text-sm">Prompt goes to</span>
              <span className="text-foreground text-sm font-medium tabular-nums">{phone.trim()}</span>
            </div>
          </div>
        ) : null}

        <div className="hidden sm:flex sm:flex-col sm:gap-3">
          {/*
            Not disabled. A disabled button is silent under a tap, and
            silence is the one thing a payment CTA must never be: the
            press now either pays or shows the customer exactly what is
            missing and takes them to it.
          */}
          <Button type="submit" size="lg" loading={submitting}>
            {submitting ? 'Sending M-Pesa request…' : ctaLabel}
          </Button>
          {submitAttempted && stageProblems.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              {stageProblems.length === 1
                ? 'One thing left: '
                : `${stageProblems.length} things left: `}
              {stageProblems.map((problem) => problem.message).join(' · ')}
            </p>
          ) : null}
          {/*
            What happens after the money leaves, said before it does.
            The PIN line is the one piece of reassurance here that is
            both true and specific — the prompt is Safaricom's, and no
            page on this site ever asks for a PIN.
          */}
          {/*
            What happens after the money leaves, said before it does.
            Every line is a step this system actually performs — the
            STK push, `order_confirmed_sms`, and `order_dispatched_sms`
            — rather than a reassuring sequence invented for the page.
          */}
          <ol className="text-muted-foreground flex flex-col gap-1.5 text-sm" hidden={!isLastStage}>
            <li>1. An M-Pesa prompt arrives on your phone. Enter your PIN there, never on this page.</li>
            <li>2. This page confirms your payment by itself and shows your order number.</li>
            <li>3. We text that order number to you.</li>
            <li>4. We text you again the moment your box is on its way.</li>
          </ol>
        </div>

        {/*
          The way out for someone who was never going to finish this
          form (§ order on WhatsApp).
          
          It sits *below* the pay button, not beside it: above, it
          would be a fork in the road offered to every customer,
          including the ones already typing. Down here it is only found
          by someone whose eyes have left the form — which is exactly
          the person about to leave without buying.

          Deliberately available before the form is valid, unlike the
          pay button. Somebody who cannot get past the address field is
          the single likeliest person to want a human, and disabling
          their only alternative at the same moment would be perverse.
        */}
        <div className="border-border flex flex-col items-center gap-2 border-t pt-5 text-center">
          <p className="text-muted-foreground text-sm">Rather not fill in a form?</p>
          <WhatsAppCheckoutButton
            source="checkout_form"
            packageId={box?.id}
            valueKes={box ? box.priceKes * quantity : undefined}
            message={
              box ? buildBoxOrderMessage({ name: box.name, priceKes: box.priceKes, quantity }) : GENERIC_ORDER_MESSAGE
            }
          >
            Order on WhatsApp
          </WhatsAppCheckoutButton>
          <p className="text-muted-foreground text-caption">
            We&apos;ll confirm your order and delivery in the chat.
          </p>
        </div>
      </div>

        </div>
      </div>

      {/*
        The phone's checkout bar. The total and the way to pay it were
        at the very bottom of a page roughly five screens tall — a
        customer had to scroll past everything to find out what they'd
        be charged, and again to pay. Now both follow them down the
        page, and the bar states what's still missing rather than just
        greying out and leaving them to guess.
      */}
      <div
        className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur sm:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 pt-3">
          {/*
            The submit failure, repeated where the tap happened.
            Mobile presses this bar, and the message in the page flow
            can be a screen and a half above it — so it looked like
            nothing had happened, and the next move is to press again.
          */}
          {error ? (
            <p className="text-danger text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-baseline justify-between gap-3">
            {/*
              Always the price. This label used to become the first
              validation problem, which put "Enter your name" directly
              above a large number where it read as a caption for it —
              and made the one place showing the total unreliable.
            */}
            <span className="text-muted-foreground text-sm">
              {isLastStage ? (quote ? 'Total to pay' : 'Your order') : 'Your order so far'}
            </span>
            <span className="text-foreground text-lg font-semibold tabular-nums">
              {quote ? formatKes(quote.pricing.totalKes) : box ? formatKes(box.priceKes * quantity) : '—'}
            </span>
          </div>
          <Button type="submit" size="lg" loading={submitting} className="w-full">
            {submitting ? 'Sending M-Pesa request…' : ctaLabel}
          </Button>
          {submitAttempted && stageProblems.length > 0 ? (
            <p className="text-muted-foreground text-caption">
              {stageProblems.length === 1
                ? 'One thing left: '
                : `${stageProblems.length} things left: `}
              {stageProblems[0].message}
            </p>
          ) : null}
          {stageIndex > 0 ? (
            <button
              type="button"
              onClick={() => {
                setStageIndex((current) => Math.max(current - 1, 0));
                window.scrollTo?.({ top: 0, behavior: 'smooth' });
              }}
              className="text-muted-foreground hover:text-foreground text-caption self-center underline underline-offset-4"
            >
              Back to {stages[stageIndex - 1].label.toLowerCase()}
            </button>
          ) : null}
        </div>
      </div>

      {/* Reserves the space the fixed bar covers, so the last field is never trapped underneath it. */}
      <div aria-hidden="true" className="h-28 sm:hidden" />
    </form>
  );
}

/**
 * The itemized total. Every line comes from the server's quote — the
 * `fallback*` props are only what's shown in the moment before the
 * first quote lands, and are the plain catalog price, never a guess at
 * a discount or a fee.
 */
function OrderSummary({
  quote,
  stationChosen,
  fallbackLabel,
  lines,
  fallbackTotalKes,
  snackThumbs,
}: {
  snackThumbs: { id: string; imageUrl: string | null; origin: string | null }[];
  quote: WebCheckoutQuote | null;
  /** Whether a real pickup station has been selected — distinguishes "no fee yet" from "a fee of zero". Always true for door delivery, which has no station. */
  stationChosen: boolean;
  fallbackLabel: string;
  /** Every box, each at its own extended price. One entry renders exactly the single row this always showed. */
  lines: { label: string; quantity: number; amountKes: number }[];
  fallbackTotalKes: number | null;
}) {
  if (!quote) {
    /*
     * The moment before the first quote lands, which is also the whole
     * of the server-rendered page. This used to be one unlabelled
     * figure, so a checkout's first paint carried no line saying what
     * that number was or that delivery was still to come — the two
     * questions a customer has before anything else.
     *
     * Named as the box price and openly incomplete, rather than
     * dressed up as a total it is not yet.
     */
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-muted-foreground text-sm">{fallbackLabel}</span>
          <span className="text-foreground text-lg font-semibold tabular-nums">
            {fallbackTotalKes === null ? '—' : formatKes(fallbackTotalKes)}
          </span>
        </div>
        <ChosenSnacks picks={snackThumbs} />
        <p className="text-muted-foreground text-sm">
          Delivery is added once you choose where it&rsquo;s going. You&rsquo;ll see the exact
          total here before you pay.
        </p>
      </div>
    );
  }

  const { pricing } = quote;
  return (
    <dl className="flex flex-col gap-3">
      {lines.length > 1 ? (
        lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground text-sm">
              {line.quantity} × {line.label}
            </dt>
            <dd className="text-foreground text-sm tabular-nums">{formatKes(line.amountKes)}</dd>
          </div>
        ))
      ) : (
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground text-sm">
            {pricing.quantity} × {pricing.packageLabel}
          </dt>
          <dd className="text-foreground text-sm tabular-nums">{formatKes(pricing.subtotalKes)}</dd>
        </div>
      )}

      <ChosenSnacks picks={snackThumbs} />

      {pricing.discountKes > 0 ? (
        <div className="flex items-baseline justify-between gap-4">
          {/*
            Generic on purpose (§ Creator-Only Offers) — `discountKes`
            can now come from a referral code, a signed-in creator's
            own checkout discount, or both stacked, and this summary
            line has no way to tell which without threading extra
            source flags through just for a label. "Referral discount"
            was accurate before there was a second source; it would
            mislabel a creator's own discount now.
          */}
          <dt className="text-success text-sm">Discount</dt>
          <dd className="text-success text-sm tabular-nums">−{formatKes(pricing.discountKes)}</dd>
        </div>
      ) : null}

      {pricing.walletCreditAppliedKes > 0 ? (
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-success text-sm">Wallet credit</dt>
          <dd className="text-success text-sm tabular-nums">
            −{formatKes(pricing.walletCreditAppliedKes)}
          </dd>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground text-sm">Delivery</dt>
        <dd className="text-foreground text-sm tabular-nums">
          {/*
            A chosen station whose fee is 0 is not the same as no
            station chosen, and saying "Choose a station" to someone who
            just chose one reads as the page having lost their pick.
            The caller passes `stationChosen` so the two states are
            distinguishable — a zero fee shown as "Free" is the honest
            reading of a rate the business has set to zero (or not yet
            set; see the delivery-zone rates in Admin).
          */}
          {!stationChosen
              ? 'Choose a station'
              : pricing.deliveryFeeKes > 0
                ? formatKes(pricing.deliveryFeeKes)
                : 'Free'}
        </dd>
      </div>

      <div className="border-border flex items-baseline justify-between gap-4 border-t pt-3">
        <dt className="text-foreground text-sm font-medium">Total to pay now</dt>
        <dd className="text-foreground text-xl font-semibold tabular-nums">
          {formatKes(pricing.totalKes)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * The message under a field, or nothing.
 *
 * `role="alert"` so it is announced when it appears, and the id lines
 * up with the input's `aria-describedby` so a screen reader reads the
 * reason along with the field rather than as a loose announcement.
 */
function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p id={`${id}-error`} role="alert" className="text-danger text-sm">
      {message}
    </p>
  );
}

/**
 * A section's name, not its number.
 *
 * These were numbered, and the numbers moved: a box offering picks
 * made "Your details" step 3, a box without them made it step 2. So
 * the count was unstable across the very comparison a customer makes
 * when switching boxes, and it promised a progress meter the form does
 * not have — nothing is gated, everything is on one page, and there is
 * no step 4 to reach. Names say where you are without implying an
 * order you must follow.
 */
/**
 * The snacks the customer chose, where they can check them.
 *
 * They were visible only inside the picker, so verifying five choices
 * before paying meant scrolling back past every other section — and on
 * the desktop sticky rail the picker is not on screen at all.
 *
 * Shown as pictures, never names. Snack Quest does not name individual
 * snacks anywhere a customer can read it, and the picture is the truer
 * check anyway: it is exactly what was on screen at the moment of
 * choosing, so recognising it costs no reading.
 *
 * Rendered in both states of the summary on purpose. The picks are a
 * fact this browser already knows; making them wait for a server quote
 * would hide them for the first seconds of every checkout, and for the
 * whole of one where the quote never lands.
 */
function ChosenSnacks({
  picks,
}: {
  picks: { id: string; imageUrl: string | null; origin: string | null }[];
}) {
  if (picks.length === 0) {
    return null;
  }
  return (
    <div className="border-border flex flex-col gap-2 border-b pb-3">
      <p className="text-muted-foreground text-sm">
        Your snacks ({picks.length})
      </p>
      <ul className="flex flex-wrap gap-2">
        {picks.map((pick) => (
          <li key={pick.id} className="flex flex-col items-center gap-1">
            <span className="bg-border/40 relative block size-12 overflow-hidden rounded-md">
              {pick.imageUrl ? (
                /*
                  Empty alt: the origin underneath carries the meaning,
                  and a name in the alt would put back exactly what
                  this avoids.
                */
                <Image src={pick.imageUrl} alt="" fill sizes="48px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center" aria-hidden="true">
                  🍬
                </span>
              )}
            </span>
            {pick.origin ? (
              <span className="text-muted-foreground text-caption">{pick.origin}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionHeading({ title, optional }: { title: string; optional?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-foreground text-base font-semibold sm:text-[length:var(--text-card-title)]">
        {title}
      </h2>
      {optional ? <span className="text-muted-foreground text-sm">(optional)</span> : null}
    </div>
  );
}


function SpeedOption({
  selected,
  onSelect,
  title,
  detail,
  disabled = false,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors ${
        disabled
          ? 'border-border bg-muted/40 cursor-not-allowed opacity-60'
          : selected
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
      }`}
    >
      <span className="text-foreground text-sm font-medium">{title}</span>
      <span className="text-muted-foreground text-sm">{detail}</span>
    </button>
  );
}

function DeliveryOption({
  selected,
  onSelect,
  icon,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'focus-visible:ring-primary flex flex-col gap-2 rounded-lg border p-4 text-left outline-none transition-colors focus-visible:ring-2',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-border/30',
      )}
    >
      <span className={cn('flex items-center gap-2', selected ? 'text-primary' : 'text-muted-foreground')}>
        {icon}
        <span className="text-foreground text-sm font-semibold">{title}</span>
      </span>
      <span className="text-muted-foreground text-sm leading-snug">{detail}</span>
    </button>
  );
}
