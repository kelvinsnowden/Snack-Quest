'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus, X } from 'lucide-react';
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
import { StaffSnackPicker } from '@/components/admin/StaffSnackPicker';
import { MAX_STAFF_PICKS } from '@/lib/packages/guaranteedPicks';
import { isValidKenyanPhone } from '@/lib/checkout/phone';
import { formatKes } from '@/lib/orders/format';
import { cn } from '@/lib/utils';
import type { DeliveryMethod } from '@/types/delivery';
import type { WebCheckoutResponse } from '@/types/webCheckout';
import type { ManualPaymentMethod } from '@/types';

/**
 * The two ways an order gets taken. `request` is the original and the
 * default: price it, then push the customer an M-Pesa prompt.
 * `already_paid` (§ super-admin manual payment orders) is for the
 * customer who has *already* handed over money — cash at a stand, an
 * M-Pesa transfer they sent themselves, a bank transfer — where a
 * second prompt would be asking them to pay twice.
 */
type PaymentMode = 'request' | 'already_paid';

const MANUAL_METHOD_LABELS: Record<ManualPaymentMethod, string> = {
  cash: 'Cash',
  mpesa_manual: 'M-Pesa (sent by customer)',
  bank_transfer: 'Bank transfer',
};

const MANUAL_REFERENCE_LABELS: Record<ManualPaymentMethod, string> = {
  cash: 'Reference (optional)',
  mpesa_manual: 'M-Pesa code',
  bank_transfer: 'Bank reference',
};

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
  /** 0 for a fully-curated box; >0 means this many snacks are chosen, and must be. */
  guaranteedPickCount: number;
}

export function StaffInitiatedOrderDialog({
  boxes,
  canRecordManualPayment = false,
}: {
  boxes: OrderableBox[];
  /** True only for a super admin — the server enforces this independently, so a tampered client gains nothing. */
  canRecordManualPayment?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /*
   * A list, because a customer can ask for one of each (§ more than
   * one box per order). One line is still the overwhelmingly common
   * case and still what this opens on, so taking a single-box order is
   * exactly as many taps as it was.
   */
  const [lines, setLines] = useState<{ packageId: string; quantity: string }[]>([
    { packageId: boxes[0]?.id ?? '', quantity: '1' },
  ]);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [station, setStation] = useState<SelectedStation | null>(null);
  const [addressText, setAddressText] = useState('');
  const [referralCode, setReferralCode] = useState('');
  /*
   * Picks per box, keyed by package id (§ more than one box per
   * order). One shared list would have to belong to one of the boxes,
   * and an operator taking an order for a Premium and a Deluxe needs
   * to choose for both.
   */
  const [picksByBox, setPicksByBox] = useState<Record<string, string[]>>({});
  /*
   * Who settles the delivery fee (§ delivery paid on delivery). One
   * question with three answers rather than two independent
   * checkboxes, because "pays at the door" and "not charged at all"
   * cannot both be true and a pair of checkboxes would let an
   * operator say so.
   *
   * Defaults to prepaid: the other two have to be chosen
   * deliberately, and defaulting to either would quietly stop
   * charging for delivery on every order taken by phone.
   */
  const [feeCollection, setFeeCollection] = useState<'prepaid' | 'on_delivery' | 'waived'>('prepaid');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('request');
  const [manualMethod, setManualMethod] = useState<ManualPaymentMethod>('cash');
  const [manualReference, setManualReference] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<WebCheckoutResponse | null>(null);

  function reset() {
    setLines([{ packageId: boxes[0]?.id ?? '', quantity: '1' }]);
    setCustomerName('');
    setPhone('');
    setDeliveryMethod('pickup');
    setStation(null);
    setAddressText('');
    setReferralCode('');
    setPicksByBox({});
    setFeeCollection('prepaid');
    setPaymentMode('request');
    setManualMethod('cash');
    setManualReference('');
    setManualNote('');
    setError(null);
    setSent(null);
  }

  const chosenBoxes = lines
    .map((line) => boxes.find((candidate) => candidate.id === line.packageId))
    .filter((box): box is OrderableBox => Boolean(box));

  /*
   * Every box on the order gets a picker, not only the ones that offer
   * a customer picks (§ staff are not picking, they are packing). This
   * is the packing list: a Starter Box can perfectly well have named
   * snacks in it because someone asked for them on the phone, and the
   * box's own number is a website promise rather than a rule staff
   * are held to.
   *
   * There is consequently nothing to complete — any number is a valid
   * packing list, including none.
   */
  const pickBoxes = chosenBoxes;

  const parsedLines = lines.map((line) => ({
    packageId: line.packageId,
    quantity: Number.parseInt(line.quantity, 10),
  }));
  const linesValid =
    parsedLines.length > 0 &&
    parsedLines.every(
      (line) => Boolean(line.packageId) && Number.isFinite(line.quantity) && line.quantity >= 1,
    ) &&
    new Set(parsedLines.map((line) => line.packageId)).size === parsedLines.length;

  const orderTotalKes = chosenBoxes.reduce((sum, box, index) => {
    const count = parsedLines[index]?.quantity;
    return sum + box.priceKes * (Number.isFinite(count) && count >= 1 ? count : 0);
  }, 0);

  function setLine(index: number, patch: Partial<{ packageId: string; quantity: string }>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const unused = boxes.find((box) => !lines.some((line) => line.packageId === box.id));
    if (!unused) return;
    setLines((current) => [...current, { packageId: unused.id, quantity: '1' }]);
  }

  function removeLine(index: number) {
    setLines((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  }

  /*
   * Picks are keyed by the box they were chosen for, so switching a
   * line no longer has to clear anything: an entry for a box that is
   * no longer on the order is simply not read, and only the boxes
   * actually chosen are checked for completeness. Switching away and
   * back brings the operator's picks with it.
   */
  const alreadyPaid = paymentMode === 'already_paid';
  // Cash is the only method with nothing to reference. The server
  // enforces this too — this is here so the button explains itself
  // rather than the request coming back 400.
  const manualReferenceReady = manualMethod === 'cash' || manualReference.trim().length > 0;
  const ready =
    linesValid &&
    customerName.trim().length >= 2 &&
    isValidKenyanPhone(phone) &&
    (deliveryMethod === 'pickup' ? Boolean(station) : addressText.trim().length >= 5) &&
    (!alreadyPaid || manualReferenceReady);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/orders/initiate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // The first line stays in the fields the route has always
          // required; `items` carries the whole order. A one-box order
          // therefore sends exactly the request it always sent.
          packageId: parsedLines[0].packageId,
          quantity: parsedLines[0].quantity,
          ...(parsedLines.length > 1
            ? {
                items: parsedLines.map((line) => ({
                  ...line,
                  ...(picksByBox[line.packageId]?.length
                    ? { guaranteedSnackIds: picksByBox[line.packageId] }
                    : {}),
                })),
              }
            : {}),
          customerName: customerName.trim(),
          phone: phone.trim(),
          county: deliveryMethod === 'pickup' ? (station?.county ?? '') : 'Nairobi',
          deliveryMethod,
          ...(deliveryMethod === 'pickup'
            ? { pickupStationId: station?.id }
            : { addressText: addressText.trim() }),
          referralCode: referralCode.trim() || undefined,
          // The first pick box's ids still travel at the top level,
          // which is the shape a one-box order has always sent.
          ...(pickBoxes[0] && picksByBox[pickBoxes[0].id]?.length
            ? { guaranteedSnackIds: picksByBox[pickBoxes[0].id] }
            : {}),
          ...(feeCollection !== 'prepaid' ? { deliveryFeeCollection: feeCollection } : {}),
          ...(alreadyPaid
            ? {
                manualPayment: {
                  method: manualMethod,
                  reference: manualReference.trim() || null,
                  note: manualNote.trim() || null,
                },
              }
            : {}),
        }),
      });
      /*
       * Parsed defensively, because a 500 from Next is an HTML error
       * page rather than JSON. Calling `response.json()` on it throws,
       * and an unguarded throw here lands in the catch below — which
       * reported "could not reach the server" for a request that
       * reached the server perfectly well and failed inside it. That
       * misdiagnosis is worth avoiding on this dialog in particular:
       * it may have already recorded a real, paid order, and telling
       * the operator the request never arrived invites them to submit
       * it a second time.
       */
      const payload = (await response.json().catch(() => null)) as
        | WebCheckoutResponse
        | { error: string }
        | null;

      if (!response.ok) {
        setError(
          payload && 'error' in payload
            ? payload.error
            : `The server rejected this order (HTTP ${response.status}). Check Orders before retrying — it may already have been recorded.`,
        );
        return;
      }
      if (!payload) {
        setError('The order may have gone through, but the response could not be read. Check Orders before retrying.');
        return;
      }
      setSent(payload as WebCheckoutResponse);
      router.refresh();
    } catch {
      // Genuinely never reached the server — fetch itself rejected.
      setError('Could not reach the server. Nothing was sent. Try again.');
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
                  {alreadyPaid
                    ? 'Order recorded as paid'
                    : sent.stkPushSent
                      ? 'Payment request sent'
                      : 'Order created, prompt failed'}
                </DialogTitle>
                <DialogDescription>
                  {alreadyPaid
                    ? `${customerName.trim()}'s order is confirmed and their box is queued for packing. No M-Pesa prompt was sent — you recorded ${formatKes(sent.pricing.totalKes)} as already received.`
                    : sent.stkPushSent
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
                    sent.pricing.serviceLevel
                      ? `${formatKes(sent.pricing.deliveryFeeKes)} · ${sent.pricing.serviceLevel === 'same-day' ? 'same-day' : 'next-day'}`
                      : formatKes(sent.pricing.deliveryFeeKes)
                  }
                />
                <SummaryRow
                  label={alreadyPaid ? 'Total recorded as paid' : 'Total requested'}
                  value={formatKes(sent.pricing.totalKes)}
                  strong
                />
                {alreadyPaid ? (
                  <SummaryRow
                    label="Paid by"
                    value={
                      manualReference.trim()
                        ? `${MANUAL_METHOD_LABELS[manualMethod]} · ${manualReference.trim()}`
                        : MANUAL_METHOD_LABELS[manualMethod]
                    }
                  />
                ) : null}
              </dl>


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
                  {alreadyPaid
                    ? 'Records an order the customer has already paid for. No M-Pesa prompt is sent. Priced exactly as the website would price it — you can\u2019t change the amount here.'
                    : 'Places the order and sends the customer an M-Pesa prompt. Priced exactly as the website would price it — you can\u2019t change the amount here.'}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                {/*
                  One row per box (§ more than one box per order). A
                  customer asking for one of each used to mean two
                  separate orders and two delivery fees.

                  Each row only offers boxes not already on the order,
                  so the duplicate the server refuses cannot be built
                  here in the first place.
                */}
                <div className="flex flex-col gap-2">
                  <Label>Boxes</Label>
                  {lines.map((line, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_5rem_auto]">
                      <select
                        aria-label={`Box ${index + 1}`}
                        value={line.packageId}
                        onChange={(event) => setLine(index, { packageId: event.target.value })}
                        className="border-border bg-surface text-foreground focus-visible:ring-primary h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
                      >
                        {boxes
                          .filter(
                            (box) =>
                              box.id === line.packageId ||
                              !lines.some((other) => other.packageId === box.id),
                          )
                          .map((box) => (
                            <option key={box.id} value={box.id}>
                              {box.name} — {formatKes(box.priceKes)}
                            </option>
                          ))}
                      </select>
                      <Input
                        aria-label={`Quantity for box ${index + 1}`}
                        value={line.quantity}
                        onChange={(event) => setLine(index, { quantity: event.target.value })}
                        inputMode="numeric"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeLine(index)}
                        disabled={lines.length === 1}
                        aria-label={`Remove box ${index + 1}`}
                        className="h-10 px-3"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addLine}
                      disabled={lines.length >= boxes.length}
                      className="h-9 self-start"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Add another box
                    </Button>
                    {lines.length > 1 ? (
                      <p className="text-muted-foreground text-sm tabular-nums">
                        Boxes total {formatKes(orderTotalKes)} + delivery
                      </p>
                    ) : null}
                  </div>

                </div>

                {/*
                  One picker per box that actually offers picks
                  (§ staff pick the snacks too). A Starter Box has
                  nothing to choose, and rendering an empty picker on
                  it would imply otherwise.

                  Each is labelled with its box name once there is more
                  than one, because two identical-looking pickers with
                  no names is how five snacks end up in the wrong box.
                */}
                {pickBoxes.map((pickBox) => (
                  <div key={pickBox.id} className="flex flex-col gap-2">
                    <Label>
                      {pickBoxes.length > 1 ? `Snacks for the ${pickBox.name}` : 'Snacks for this box'}
                    </Label>
                    <p className="text-muted-foreground text-caption">
                      {pickBox.guaranteedPickCount > 0
                        ? `The website lets a customer choose ${pickBox.guaranteedPickCount} in a ${pickBox.name}. You are not held to that — name whatever they asked for, and we curate the rest.`
                        : `Optional. Name anything they asked for by name, and we curate the rest of the ${pickBox.name}.`}
                    </p>
                    <StaffSnackPicker
                      suggested={pickBox.guaranteedPickCount}
                      max={MAX_STAFF_PICKS}
                      selectedIds={picksByBox[pickBox.id] ?? []}
                      onChange={(ids) =>
                        setPicksByBox((current) => ({ ...current, [pickBox.id]: ids }))
                      }
                    />
                  </div>
                ))}

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
                    {alreadyPaid
                      ? 'No prompt is sent. This is the number the confirmation SMS and WhatsApp message go to.'
                      : "The prompt goes here, and so does a WhatsApp message explaining what it's for."}
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
                        {method === 'pickup' ? 'Fargo pickup' : 'Nairobi door'}
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
                      {feeCollection === 'prepaid'
                        ? 'Tushop delivers to the address given, and the fee is in the total above.'
                        : 'Tushop delivers to the address given. See the delivery fee choice below for who pays for it.'}
                    </p>
                  </div>
                )}

                {/*
                  Who settles the delivery fee (§ delivery paid on
                  delivery). Sits with the delivery choice rather than
                  with payment, because it is a fact about the delivery
                  — the box is still paid for now either way.

                  Each option states its consequence in money rather
                  than restating its own label: an operator is reading
                  this back to a customer on the phone, and "KES 250 to
                  the courier" is the sentence they need.
                */}
                <div className="flex flex-col gap-2">
                  <Label>Delivery fee</Label>
                  <div className="flex flex-col gap-1.5">
                    {(
                      [
                        ['prepaid', 'Charge it now', 'Included in the M-Pesa prompt, as it is on the website.'],
                        [
                          'on_delivery',
                          'Collect on delivery',
                          'The prompt covers the boxes only. The courier collects the fee at the door.',
                        ],
                        [
                          'waived',
                          'Do not charge it',
                          'No delivery fee on this order — for a Bolt or self-arranged drop-off the customer is not billed for here.',
                        ],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <label
                        key={value}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                          feeCollection === value
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-surface hover:bg-border/30',
                        )}
                      >
                        <input
                          type="radio"
                          name="staff-order-fee-collection"
                          value={value}
                          checked={feeCollection === value}
                          onChange={() => setFeeCollection(value)}
                          className="accent-primary mt-0.5 size-4 shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="text-foreground block text-sm font-medium">{label}</span>
                          <span className="text-muted-foreground mt-0.5 block text-sm">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {canRecordManualPayment ? (
                  <div className="flex flex-col gap-2">
                    <Label>Payment</Label>
                    <div className="flex gap-2">
                      {(
                        [
                          ['request', 'Send M-Pesa prompt'],
                          ['already_paid', 'Already paid'],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPaymentMode(mode)}
                          aria-pressed={paymentMode === mode}
                          className={cn(
                            'focus-visible:ring-primary flex-1 rounded-md border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2',
                            paymentMode === mode
                              ? 'border-primary bg-primary/5 text-foreground font-medium'
                              : 'border-border bg-surface text-muted-foreground hover:bg-border/30',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {alreadyPaid ? (
                  <div className="border-warning/40 bg-warning/5 flex flex-col gap-4 rounded-lg border p-4">
                    <p className="text-muted-foreground text-sm">
                      You are recording that this money has already arrived. Nothing verifies it — the order counts as
                      revenue immediately, and your name is saved against it.
                    </p>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="staff-order-manual-method">How they paid</Label>
                      <select
                        id="staff-order-manual-method"
                        value={manualMethod}
                        onChange={(event) => setManualMethod(event.target.value as ManualPaymentMethod)}
                        className="border-border bg-surface text-foreground focus-visible:ring-primary h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
                      >
                        {(Object.keys(MANUAL_METHOD_LABELS) as ManualPaymentMethod[]).map((method) => (
                          <option key={method} value={method}>
                            {MANUAL_METHOD_LABELS[method]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="staff-order-manual-ref">{MANUAL_REFERENCE_LABELS[manualMethod]}</Label>
                      <Input
                        id="staff-order-manual-ref"
                        value={manualReference}
                        onChange={(event) => setManualReference(event.target.value)}
                        placeholder={manualMethod === 'mpesa_manual' ? 'NLJ7RT61SV' : ''}
                        aria-invalid={!manualReferenceReady}
                      />
                      <p className="text-muted-foreground text-sm">
                        {manualMethod === 'cash'
                          ? 'Cash has no code to record, so this is optional — a till or receipt number if you have one.'
                          : 'Required. This is the only record tying the order to money that actually moved.'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="staff-order-manual-note">Note (optional)</Label>
                      <Input
                        id="staff-order-manual-note"
                        value={manualNote}
                        onChange={(event) => setManualNote(event.target.value)}
                        placeholder="Paid at the Sarit stand"
                      />
                    </div>
                  </div>
                ) : null}

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
                  {alreadyPaid ? 'Record paid order' : 'Send payment request'}
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
