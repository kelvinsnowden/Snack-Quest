'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PickupStationPicker, type SelectedStation } from '@/components/checkout/PickupStationPicker';
import { isValidKenyanPhone } from '@/lib/checkout/phone';
import { formatKes } from '@/lib/orders/format';
import { cn } from '@/lib/utils';
import type { DeliveryMethod } from '@/types/delivery';
import type { WebCheckoutResponse } from '@/types/webCheckout';

/**
 * Take an order for a customer and send them the M-Pesa prompt
 * (§ staff-initiated orders) — for the order that arrives by phone
 * call, at a stand, or in an Instagram DM, where nobody is going to
 * fill in the website's checkout form.
 *
 * The same station picker the public checkout uses, deliberately: a
 * second, staff-only version of the same choice is a second thing to
 * keep correct. There is no price field of any kind here — staff get a
 * faster way to start an order, not a way to change what it costs.
 */

export interface OrderableBox {
  id: string;
  name: string;
  priceKes: number;
}

export function StaffInitiatedOrderDialog({ boxes }: { boxes: OrderableBox[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [boxId, setBoxId] = useState(boxes[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [station, setStation] = useState<SelectedStation | null>(null);
  const [addressText, setAddressText] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<WebCheckoutResponse | null>(null);

  function reset() {
    setQuantity('1');
    setCustomerName('');
    setPhone('');
    setDeliveryMethod('pickup');
    setStation(null);
    setAddressText('');
    setReferralCode('');
    setError(null);
    setSent(null);
  }

  const parsedQuantity = Number.parseInt(quantity, 10);
  const ready =
    Boolean(boxId) &&
    customerName.trim().length >= 2 &&
    isValidKenyanPhone(phone) &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity >= 1 &&
    (deliveryMethod === 'pickup' ? Boolean(station) : addressText.trim().length >= 5);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/orders/initiate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packageId: boxId,
          quantity: parsedQuantity,
          customerName: customerName.trim(),
          phone: phone.trim(),
          county: deliveryMethod === 'pickup' ? (station?.county ?? '') : 'Nairobi',
          deliveryMethod,
          ...(deliveryMethod === 'pickup'
            ? { pickupStationId: station?.id }
            : { addressText: addressText.trim() }),
          referralCode: referralCode.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as WebCheckoutResponse | { error: string };
      if (!response.ok) {
        setError('error' in payload ? payload.error : 'Could not start this order.');
        return;
      }
      setSent(payload as WebCheckoutResponse);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        disabled={boxes.length === 0}
      >
        <Plus aria-hidden="true" />
        Take an order
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          {sent ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="text-success size-5" aria-hidden="true" />
                  {sent.stkPushSent ? 'Payment request sent' : 'Order created, prompt failed'}
                </DialogTitle>
                <DialogDescription>
                  {sent.stkPushSent
                    ? `${customerName.trim()} has an M-Pesa prompt for ${formatKes(sent.pricing.totalKes)} on ${sent.payingPhone}. The order confirms itself once they pay.`
                    : `The order is priced and saved, but the M-Pesa prompt did not reach Safaricom. Nothing has been charged — take the order again to retry.`}
                </DialogDescription>
              </DialogHeader>

              <dl className="border-border bg-background flex flex-col gap-2 rounded-lg border p-4 text-sm">
                <SummaryRow label="Box" value={`${sent.pricing.quantity} × ${sent.pricing.packageLabel}`} />
                {sent.pricing.discountKes > 0 ? (
                  <SummaryRow label="Referral discount" value={`−${formatKes(sent.pricing.discountKes)}`} />
                ) : null}
                {sent.pricing.walletCreditAppliedKes > 0 ? (
                  <SummaryRow label="Wallet credit" value={`−${formatKes(sent.pricing.walletCreditAppliedKes)}`} />
                ) : null}
                <SummaryRow
                  label="Delivery"
                  value={
                    sent.pricing.boltArrangedSeparately
                      ? 'Bolt, arranged separately'
                      : formatKes(sent.pricing.deliveryFeeKes)
                  }
                />
                <SummaryRow label="Total requested" value={formatKes(sent.pricing.totalKes)} strong />
              </dl>

              {sent.pricing.boltArrangedSeparately ? (
                <p className="text-muted-foreground text-sm">
                  Bolt was not charged. Arrange the rider with the customer on WhatsApp once payment lands.
                </p>
              ) : null}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Done
                </Button>
                <Button onClick={reset}>Take another</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Take an order</DialogTitle>
                <DialogDescription>
                  Places the order and sends the customer an M-Pesa prompt. Priced exactly as the website would
                  price it — you can&apos;t change the amount here.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="staff-order-box">Box</Label>
                    <select
                      id="staff-order-box"
                      value={boxId}
                      onChange={(event) => setBoxId(event.target.value)}
                      className="border-border bg-surface text-foreground focus-visible:ring-primary h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
                    >
                      {boxes.map((box) => (
                        <option key={box.id} value={box.id}>
                          {box.name} — {formatKes(box.priceKes)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex w-24 flex-col gap-2">
                    <Label htmlFor="staff-order-qty">Quantity</Label>
                    <Input
                      id="staff-order-qty"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="staff-order-name">Customer name</Label>
                  <Input
                    id="staff-order-name"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Wanjiru Kamau"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="staff-order-phone">M-Pesa number</Label>
                  <Input
                    id="staff-order-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    inputMode="tel"
                    placeholder="0712 345 678"
                    aria-invalid={phone.length > 0 && !isValidKenyanPhone(phone)}
                  />
                  <p className="text-muted-foreground text-sm">
                    The prompt goes here, and so does a WhatsApp message explaining what it&apos;s for.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Delivery</Label>
                  <div className="flex gap-2">
                    {(['pickup', 'door'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setDeliveryMethod(method)}
                        aria-pressed={deliveryMethod === method}
                        className={cn(
                          'focus-visible:ring-primary flex-1 rounded-md border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2',
                          deliveryMethod === method
                            ? 'border-primary bg-primary/5 text-foreground font-medium'
                            : 'border-border bg-surface text-muted-foreground hover:bg-border/30',
                        )}
                      >
                        {method === 'pickup' ? 'Jumia pickup' : 'Nairobi door'}
                      </button>
                    ))}
                  </div>
                </div>

                {deliveryMethod === 'pickup' ? (
                  <PickupStationPicker selected={station} onSelect={setStation} />
                ) : (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="staff-order-address">Delivery address</Label>
                    <Input
                      id="staff-order-address"
                      value={addressText}
                      onChange={(event) => setAddressText(event.target.value)}
                      placeholder="Kilimani, Argwings Kodhek Rd"
                    />
                    <p className="text-muted-foreground text-sm">
                      Bolt is not charged here — arrange it with the customer after payment.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="staff-order-ref">Referral code (optional)</Label>
                  <Input
                    id="staff-order-ref"
                    value={referralCode}
                    onChange={(event) => setReferralCode(event.target.value)}
                    placeholder="SNACK10"
                  />
                </div>

                {error ? (
                  <p className="text-danger text-sm" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={onSubmit} loading={submitting} disabled={!ready}>
                  Send payment request
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'text-foreground font-semibold' : 'text-foreground')}>{value}</dd>
    </div>
  );
}
