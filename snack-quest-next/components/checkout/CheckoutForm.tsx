'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, Minus, Plus, Store, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PickupStationPicker, type SelectedStation } from './PickupStationPicker';
import { useCheckoutQuote } from './useCheckoutQuote';
import { isValidKenyanPhone } from '@/lib/checkout/phone';
import { formatKes } from '@/lib/orders/format';
import { cn } from '@/lib/utils';
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
}

const MAX_QUANTITY = 20;

export function CheckoutForm({
  boxes,
  initialBoxId,
  initialReferralCode,
}: {
  boxes: CheckoutBox[];
  initialBoxId: string | null;
  initialReferralCode: string | null;
}) {
  const router = useRouter();

  const [boxId, setBoxId] = useState<string | null>(
    boxes.some((box) => box.id === initialBoxId) ? initialBoxId : (boxes[0]?.id ?? null),
  );
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [station, setStation] = useState<SelectedStation | null>(null);
  const [addressText, setAddressText] = useState('');
  const [estate, setEstate] = useState('');
  const [landmark, setLandmark] = useState('');
  const [referralCode, setReferralCode] = useState(initialReferralCode ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const box = useMemo(() => boxes.find((candidate) => candidate.id === boxId) ?? null, [boxes, boxId]);

  const quote = useCheckoutQuote({
    packageId: boxId,
    quantity,
    deliveryMethod,
    pickupStationId: station?.id,
    referralCode: referralCode.trim(),
    phone,
  });

  const maxQuantity = Math.min(MAX_QUANTITY, box?.stockCount ?? MAX_QUANTITY);
  const outOfStock = box?.stockCount === 0;

  const problems: string[] = [];
  if (!box) problems.push('Choose a box');
  if (customerName.trim().length < 2) problems.push('Enter your name');
  if (!isValidKenyanPhone(phone)) problems.push('Enter a valid Kenyan mobile number');
  if (deliveryMethod === 'pickup' && !station) problems.push('Choose a pickup station');
  if (deliveryMethod === 'door' && addressText.trim().length < 5) problems.push('Enter your delivery address');
  const ready = problems.length === 0 && !outOfStock;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || !box) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout/web', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packageId: box.id,
          quantity,
          customerName: customerName.trim(),
          phone: phone.trim(),
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
          referralCode: referralCode.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as WebCheckoutResponse | { error: string };
      if (!response.ok) {
        setError('error' in payload ? payload.error : 'Something went wrong. Please try again.');
        return;
      }

      // The STK prompt is already on its way — the payment screen owns
      // everything from here, including telling the customer if the
      // prompt never arrived.
      router.push(`/checkout/${(payload as WebCheckoutResponse).checkoutSessionId}`);
    } catch {
      setError("We couldn't reach Snack Quest. Check your connection and try again.");
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
    <form onSubmit={onSubmit} className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <SectionHeading step={1} title="Your box" />
        <div className="grid gap-3 sm:grid-cols-2">
          {boxes.map((candidate) => {
            const isSelected = candidate.id === boxId;
            const soldOut = candidate.stockCount === 0;
            return (
              <button
                key={candidate.id}
                type="button"
                disabled={soldOut}
                onClick={() => {
                  setBoxId(candidate.id);
                  setQuantity(1);
                }}
                aria-pressed={isSelected}
                className={cn(
                  'focus-visible:ring-primary relative flex items-start gap-4 rounded-lg border p-4 text-left outline-none transition-colors focus-visible:ring-2',
                  isSelected ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-border/30',
                  soldOut && 'cursor-not-allowed opacity-50',
                )}
              >
                <div className="bg-border/40 relative size-14 shrink-0 overflow-hidden rounded-md">
                  {candidate.imageUrl ? (
                    <Image src={candidate.imageUrl} alt="" fill sizes="56px" className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl" aria-hidden="true">
                      🍿
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">{candidate.name}</p>
                  <p className="text-foreground mt-1 text-sm">{formatKes(candidate.priceKes)}</p>
                  {candidate.snackCountLabel ? (
                    <p className="text-muted-foreground mt-1 text-sm">{candidate.snackCountLabel}</p>
                  ) : null}
                  {soldOut ? <p className="text-danger mt-1 text-sm">Sold out</p> : null}
                </div>
                {isSelected ? (
                  <Check className="text-primary size-5 shrink-0" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>

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
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading step={2} title="Your details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="checkout-name">Full name</Label>
            <Input
              id="checkout-name"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              autoComplete="name"
              placeholder="Wanjiru Kamau"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="checkout-phone">M-Pesa number</Label>
            <Input
              id="checkout-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              aria-invalid={phone.length > 0 && !isValidKenyanPhone(phone)}
              required
            />
            <p className="text-muted-foreground text-sm">The payment prompt comes to this number.</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading step={3} title="Delivery" />
        <div className="grid gap-3 sm:grid-cols-2">
          <DeliveryOption
            selected={deliveryMethod === 'pickup'}
            onSelect={() => setDeliveryMethod('pickup')}
            icon={<Store className="size-5" aria-hidden="true" />}
            title="Jumia pickup station"
            detail="Collect from any station countrywide. Delivery fee shown before you pay."
          />
          <DeliveryOption
            selected={deliveryMethod === 'door'}
            onSelect={() => setDeliveryMethod('door')}
            icon={<Truck className="size-5" aria-hidden="true" />}
            title="Nairobi door delivery"
            detail="We arrange a Bolt rider on WhatsApp after payment. You pay the rider directly."
          />
        </div>

        {deliveryMethod === 'pickup' ? (
          <PickupStationPicker selected={station} onSelect={setStation} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="border-border bg-primary/5 rounded-lg border p-4">
              <p className="text-foreground text-sm font-medium">Bolt is arranged separately</p>
              <p className="text-muted-foreground mt-2 text-sm">
                Today&apos;s checkout covers your Snack Quest order only. Once you&apos;ve paid, we&apos;ll message you
                on WhatsApp to arrange the Bolt rider — the fare is quoted per trip and paid directly to the rider.
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
                required
              />
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
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading step={4} title="Referral code" optional />
        <div className="flex flex-col gap-2">
          <Label htmlFor="checkout-referral">Have a creator&apos;s code?</Label>
          <Input
            id="checkout-referral"
            value={referralCode}
            onChange={(event) => setReferralCode(event.target.value)}
            placeholder="SNACK10"
            autoCapitalize="characters"
          />
          {referralCode.trim() && quote?.referralCodeApplied ? (
            <p className="text-success text-sm">
              Code applied — {formatKes(quote.pricing.discountKes)} off your order.
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
      </section>

      <div className="border-border flex flex-col gap-4 border-t pt-8">
        <OrderSummary
          quote={quote}
          fallbackLabel={box ? `${quantity} × ${box.name}` : 'Your order'}
          fallbackTotalKes={box ? box.priceKes * quantity : null}
        />
        <p className="text-muted-foreground text-sm">
          {deliveryMethod === 'door'
            ? 'Bolt delivery is not included — it is arranged and paid separately after checkout.'
            : 'You’ll be prompted for exactly this amount on M-Pesa.'}
        </p>

        {error ? (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={submitting} disabled={!ready}>
          {submitting ? 'Starting payment…' : 'Pay with M-Pesa'}
        </Button>

        {!ready && problems.length > 0 ? (
          <p className="text-muted-foreground text-sm">Still needed: {problems.join(' · ')}</p>
        ) : null}
      </div>
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
  fallbackLabel,
  fallbackTotalKes,
}: {
  quote: WebCheckoutQuote | null;
  fallbackLabel: string;
  fallbackTotalKes: number | null;
}) {
  if (!quote) {
    return (
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-muted-foreground text-sm">{fallbackLabel}</span>
        <span className="text-foreground text-lg font-semibold">
          {fallbackTotalKes === null ? '—' : formatKes(fallbackTotalKes)}
        </span>
      </div>
    );
  }

  const { pricing } = quote;
  return (
    <dl className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground text-sm">
          {pricing.quantity} × {pricing.packageLabel}
        </dt>
        <dd className="text-foreground text-sm tabular-nums">{formatKes(pricing.subtotalKes)}</dd>
      </div>

      {pricing.discountKes > 0 ? (
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-success text-sm">Referral discount</dt>
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
          {pricing.boltArrangedSeparately
            ? 'Arranged after checkout'
            : pricing.deliveryFeeKes > 0
              ? formatKes(pricing.deliveryFeeKes)
              : 'Choose a station'}
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

function SectionHeading({ step, title, optional }: { step: number; title: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {step}
      </span>
      <h2 className="text-card-title text-foreground font-semibold">{title}</h2>
      {optional ? <span className="text-muted-foreground text-sm">Optional</span> : null}
    </div>
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
      <span className="text-muted-foreground text-sm">{detail}</span>
    </button>
  );
}
