'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  Loader2,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ProductAvailabilityState, SellableCatalogItem } from '@/types';

/**
 * The customer-facing touchscreen experience for one physical machine
 * (§ PART 1 — CUSTOMER MACHINE EXPERIENCE). Client Component because a
 * kiosk is one long-lived, stateful page — pairing, browsing, a cart,
 * polling — not something that navigates between URLs.
 *
 * § SHOPPING FLOW: browse by category → product detail → cart →
 * confirm & pay → waiting for M-Pesa → result. The cart shows one
 * combined total, matching how a customer actually thinks about their
 * order — but the machine can only ever dispense one slot at a time
 * (one physical motor, one vend, one `MachineTransaction`), so there
 * is no such thing as a single M-Pesa charge covering three different
 * slots. `runCheckoutQueue` is the honest bridge: the phone number is
 * collected once, then each cart line becomes its own STK push and
 * vend, back to back, with a visible "item X of N" — never a fabricated
 * single combined charge the hardware could not actually fulfil.
 *
 * § KIOSK PAIRING: a kiosk is not a customer with an account and not
 * a staff member with a session — it *is* the machine, using the same
 * `Authorization: Bearer <machineId>:<secret>` scheme every other
 * device route already requires (`lib/vending/deviceAuth.ts`), issued
 * once at physical installation and stored only in this browser's own
 * `localStorage` — no new auth mechanism, no session cookie.
 */

const PAIRING_KEY_PREFIX = 'sq_kiosk_secret_';
const CATALOG_POLL_MS = 20_000;
const PAYMENT_POLL_MS = 3_000;
const PAYMENT_POLL_TIMEOUT_MS = 90_000;
const RESULT_DISPLAY_MS = 3_000;

type TransactionStatus =
  | 'pending'
  | 'payment_failed'
  | 'paid'
  | 'vend_authorized'
  | 'dispensed'
  | 'paid_vend_failed'
  | 'refund_requested'
  | 'refunded'
  | 'manual_review';

const TERMINAL_STATUSES: TransactionStatus[] = ['dispensed', 'paid_vend_failed', 'payment_failed', 'manual_review', 'refunded'];
const SUCCESS_STATUSES: TransactionStatus[] = ['dispensed'];

interface CatalogResponse {
  catalogVersion: string;
  items: SellableCatalogItem[];
}

type CartLine = { item: SellableCatalogItem; quantity: number };
type View = 'browse' | 'detail' | 'cart' | 'checkout' | 'paying' | 'result';

function authHeader(machineId: string, secret: string): string {
  return `Bearer ${machineId}:${secret}`;
}

function cachedCatalogKey(machineId: string): string {
  return `sq_kiosk_catalog_cache_${machineId}`;
}

function cartKey(item: SellableCatalogItem): string {
  return `${item.productCatalogue}:${item.productId}`;
}

const STATE_LABEL: Record<ProductAvailabilityState, string> = {
  available: '',
  sold_out: 'Sold out',
  unavailable: 'Unavailable',
  coming_soon: 'Coming soon',
  hidden: '',
};

function ProductImage({ item, className = 'size-full' }: { item: SellableCatalogItem; className?: string }) {
  if (item.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- a machine-specific catalog image from Firestore, not a Next-optimizable static asset.
    return <img src={item.imageUrl} alt={item.name} className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} flex items-center justify-center bg-gradient-to-br from-primary/15 to-secondary/15 text-primary`}>
      <Package className="size-8" aria-hidden="true" />
    </div>
  );
}

function ProductTile({ item, quantityInCart, onOpen, onQuickAdd }: { item: SellableCatalogItem; quantityInCart: number; onOpen: () => void; onQuickAdd: () => void }) {
  const purchasable = item.availabilityState === 'available';
  return (
    <div className="relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left">
        <div className="aspect-square w-full overflow-hidden">
          <ProductImage item={item} />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <p className="text-sm font-semibold text-foreground">{item.name}</p>
          {!purchasable ? <span className="w-fit rounded-full bg-border/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">{STATE_LABEL[item.availabilityState]}</span> : null}
        </div>
      </button>
      <div className="flex items-center justify-between p-3 pt-0">
        <span className="text-base font-bold text-foreground">KES {item.priceKes.toLocaleString('en-KE')}</span>
        {purchasable ? (
          <button
            type="button"
            onClick={onQuickAdd}
            aria-label={`Add ${item.name} to cart`}
            className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:bg-primary/95"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {quantityInCart > 0 ? (
        <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground shadow-sm">{quantityInCart}</span>
      ) : null}
    </div>
  );
}

export function KioskScreen({ machineId, machineCode }: { machineId: string; machineCode: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pairingInput, setPairingInput] = useState('');
  const [pairingError, setPairingError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [view, setView] = useState<View>('browse');
  const [category, setCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [detailItem, setDetailItem] = useState<SellableCatalogItem | null>(null);
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());

  const [phoneNumber, setPhoneNumber] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [queue, setQueue] = useState<CartLine[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const authRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(`${PAIRING_KEY_PREFIX}${machineId}`);
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the paired secret from localStorage is the intentional sync-from-browser-storage-after-mount step, not an update loop; `window` doesn't exist during SSR so this can't be a lazy useState initializer either.
      setSecret(stored);
    }
  }, [machineId]);

  useEffect(() => {
    authRef.current = secret ? authHeader(machineId, secret) : null;
  }, [machineId, secret]);

  const fetchCatalog = useCallback(async () => {
    const auth = authRef.current;
    if (!auth) return;
    try {
      const res = await fetch(`/api/vending/machines/${machineId}/catalog`, { headers: { Authorization: auth }, cache: 'no-store' });
      if (res.status === 401) {
        // Paired secret was revoked — never keep offering a screen a revoked credential can't actually serve.
        window.localStorage.removeItem(`${PAIRING_KEY_PREFIX}${machineId}`);
        setSecret(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`catalog fetch failed (${res.status})`);
      }
      const body = (await res.json()) as CatalogResponse;
      setCatalog(body);
      setOffline(false);
      setCatalogError(null);
      window.localStorage.setItem(cachedCatalogKey(machineId), JSON.stringify(body));
    } catch {
      // § OFFLINE BEHAVIOUR: fall back to the cached catalog rather than blanking the screen — purchase still requires connectivity (never queued client-side, which would risk double-charging).
      const cached = window.localStorage.getItem(cachedCatalogKey(machineId));
      if (cached) {
        try {
          setCatalog(JSON.parse(cached) as CatalogResponse);
        } catch {
          // corrupt cache — fall through to the error state below
        }
      }
      setOffline(true);
      setCatalogError('Could not reach Snack Quest — showing the last known menu.');
    }
  }, [machineId]);

  useEffect(() => {
    if (!secret) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the initial catalog fetch on pairing is the intentional sync-with-the-server step this effect exists for; setInterval below is the ongoing subscription.
    fetchCatalog();
    const interval = setInterval(fetchCatalog, CATALOG_POLL_MS);
    return () => clearInterval(interval);
  }, [secret, fetchCatalog]);

  const categories = useMemo(() => {
    if (!catalog) return [];
    const set = new Set<string>();
    for (const item of catalog.items) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set).sort();
  }, [catalog]);

  const visibleItems = useMemo(() => {
    if (!catalog) return [];
    return catalog.items.filter((item) => {
      if (category && item.category !== category) return false;
      if (searchTerm.trim() && !item.name.toLowerCase().includes(searchTerm.trim().toLowerCase())) return false;
      return true;
    });
  }, [catalog, category, searchTerm]);

  const suggestions = useMemo(() => {
    if (!catalog || !detailItem) return [];
    return catalog.items
      .filter((item) => cartKey(item) !== cartKey(detailItem) && item.availabilityState === 'available')
      .sort((a, b) => (a.category === detailItem.category ? -1 : 0) - (b.category === detailItem.category ? -1 : 0))
      .slice(0, 4);
  }, [catalog, detailItem]);

  const cartLines = useMemo(() => Array.from(cart.values()), [cart]);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotalKes = cartLines.reduce((sum, line) => sum + line.item.priceKes * line.quantity, 0);

  function addToCart(item: SellableCatalogItem, delta = 1) {
    setCart((prev) => {
      const next = new Map(prev);
      const key = cartKey(item);
      const existing = next.get(key);
      const quantity = Math.max(0, (existing?.quantity ?? 0) + delta);
      if (quantity === 0) {
        next.delete(key);
      } else {
        next.set(key, { item, quantity });
      }
      return next;
    });
  }

  function removeFromCart(item: SellableCatalogItem) {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(cartKey(item));
      return next;
    });
  }

  function resetToBrowse() {
    setView('browse');
    setDetailItem(null);
    setCart(new Map());
    setPhoneNumber('');
    setCheckoutError(null);
    setQueue([]);
    setQueueIndex(0);
    setTransactionId(null);
    setTransactionStatus(null);
    setFailureReason(null);
    fetchCatalog();
  }

  async function chargeOneLine(line: CartLine, phone: string): Promise<void> {
    const auth = authRef.current;
    if (!auth) return;
    setTransactionId(null);
    setTransactionStatus(null);
    setFailureReason(null);

    const res = await fetch('/api/vending/payments', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: line.item.slotCode, phoneNumber: phone }),
    });
    const body = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !body.id) {
      // § FAILURE SCENARIO — an item in the queue went out of stock or was removed from assortment between browsing and checkout: the server re-validates the slot itself, so a stale cart line can never actually complete a charge for something no longer sellable.
      setCheckoutError(body.error ?? `Could not start payment for ${line.item.name}. It may no longer be available.`);
      setView('cart');
      return;
    }
    setTransactionId(body.id);
    setTransactionStatus('pending');
  }

  function startCheckout() {
    const lines = cartLines;
    if (lines.length === 0) return;
    setQueue(lines);
    setQueueIndex(0);
    setCheckoutError(null);
    setView('checkout');
  }

  async function submitPhoneAndPay() {
    if (!phoneNumber.trim() || queue.length === 0) return;
    setSubmitting(true);
    setCheckoutError(null);
    setView('paying');
    await chargeOneLine(queue[0], phoneNumber);
    setSubmitting(false);
  }

  // Advances the queue once the current line's transaction reaches a terminal state — the sequential-vend bridge this file's own doc comment explains.
  useEffect(() => {
    if (!transactionStatus || !TERMINAL_STATUSES.includes(transactionStatus)) return;
    if (!SUCCESS_STATUSES.includes(transactionStatus)) {
      // A real failure mid-queue: stop rather than silently skip a charge the customer needs to know about.
      return;
    }
    const nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      return; // whole queue done — the terminal-result view below handles display + reset
    }
    const timeout = setTimeout(async () => {
      setQueueIndex(nextIndex);
      await chargeOneLine(queue[nextIndex], phoneNumber);
    }, 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargeOneLine/phoneNumber/queue are stable for the lifetime of one checkout run; re-triggering on their identity would restart the advance.
  }, [transactionStatus, queueIndex]);

  useEffect(() => {
    if (!transactionId || !authRef.current) return;
    const startedAt = Date.now();
    const interval = setInterval(async () => {
      const auth = authRef.current;
      if (!auth) return;
      try {
        const res = await fetch(`/api/vending/payments/${transactionId}`, { headers: { Authorization: auth }, cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { status: TransactionStatus; failureReason: string | null };
        setTransactionStatus(body.status);
        setFailureReason(body.failureReason);
        if (TERMINAL_STATUSES.includes(body.status)) {
          clearInterval(interval);
        } else if (Date.now() - startedAt > PAYMENT_POLL_TIMEOUT_MS) {
          setTransactionStatus('manual_review');
          setFailureReason('This is taking longer than expected. Please contact support if you were charged.');
          clearInterval(interval);
        }
      } catch {
        // A transient poll failure — the interval itself keeps trying, never silently gives up on a real charge in flight.
      }
    }, PAYMENT_POLL_MS);
    return () => clearInterval(interval);
  }, [transactionId]);

  useEffect(() => {
    const wholeQueueDone = transactionStatus && TERMINAL_STATUSES.includes(transactionStatus) && (queueIndex + 1 >= queue.length || !SUCCESS_STATUSES.includes(transactionStatus));
    if (wholeQueueDone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- switching to the result view is the intentional reaction to the queue's own terminal state landing, not a render-triggered update loop.
      setView('result');
      const timeout = setTimeout(resetToBrowse, RESULT_DISPLAY_MS);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetToBrowse is stable for this kiosk loop; re-running on its identity would restart the reset timer needlessly.
  }, [transactionStatus, queueIndex, queue.length]);

  if (!secret) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Pair {machineCode}</CardTitle>
            <CardDescription>Enter this machine&apos;s device secret once, at installation, to activate its screen.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = pairingInput.trim();
                if (!trimmed) {
                  setPairingError('Enter this machine’s device secret to pair the screen.');
                  return;
                }
                window.localStorage.setItem(`${PAIRING_KEY_PREFIX}${machineId}`, trimmed);
                setPairingError(null);
                setSecret(trimmed);
              }}
              className="flex flex-col gap-3"
            >
              <Input type="password" autoComplete="off" placeholder="Device secret" value={pairingInput} onChange={(event) => setPairingInput(event.target.value)} />
              {pairingError ? <p className="text-sm text-danger">{pairingError}</p> : null}
              <Button type="submit" size="lg">
                Pair this screen
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (view === 'result' && transactionStatus) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <TransactionStatusMessage status={transactionStatus} failureReason={failureReason} itemsDone={queueIndex + (SUCCESS_STATUSES.includes(transactionStatus) ? 1 : 0)} itemsTotal={queue.length} />
            <Button variant="outline" onClick={resetToBrowse}>
              Back to menu
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (view === 'paying') {
    const currentLine = queue[queueIndex];
    return (
      <main className="min-h-screen bg-background p-4 md:p-8">
        <KioskHeader machineCode={machineCode} offline={offline} onBack={null} />
        <div className="mx-auto mt-6 grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="flex flex-col items-center justify-center gap-6 rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
            <Smartphone className="size-16 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-bold text-foreground">Check Your Phone</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ve sent an M-Pesa prompt to <span className="font-semibold text-foreground">{phoneNumber}</span>
              </p>
            </div>
            <ol className="w-full space-y-3 text-left text-sm">
              <li className="flex items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>Check your phone for the prompt</li>
              <li className="flex items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-border/60 text-xs font-bold text-muted-foreground">2</span>Enter your M-Pesa PIN to approve</li>
              <li className="flex items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-border/60 text-xs font-bold text-muted-foreground">3</span>We&apos;ll confirm it here automatically</li>
            </ol>
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h3 className="font-semibold text-foreground">Order Summary</h3>
            {queue.map((line, index) => (
              <div key={cartKey(line.item)} className={`flex items-center justify-between text-sm ${index === queueIndex ? 'font-semibold text-foreground' : index < queueIndex ? 'text-success' : 'text-muted-foreground'}`}>
                <span>
                  {index < queueIndex ? <Check className="mr-1 inline size-3.5" aria-hidden="true" /> : null}
                  {line.item.name} &times; {line.quantity}
                </span>
                <span>KES {(line.item.priceKes * line.quantity).toLocaleString('en-KE')}</span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-3 font-bold text-foreground">
              <span>Total</span>
              <span>KES {cartTotalKes.toLocaleString('en-KE')}</span>
            </div>
            {queue.length > 1 ? <p className="text-xs text-muted-foreground">Item {queueIndex + 1} of {queue.length} &mdash; each item is confirmed with its own M-Pesa prompt.</p> : null}
            <div className="mt-auto flex items-center justify-center gap-2 rounded-md bg-border/30 py-3 text-sm font-medium text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Waiting for payment{currentLine ? ` — ${currentLine.item.name}` : ''}&hellip;
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (view === 'checkout') {
    return (
      <main className="min-h-screen bg-background p-4 md:p-8">
        <KioskHeader machineCode={machineCode} offline={offline} onBack={() => setView('cart')} />
        <div className="mx-auto mt-6 grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-bold text-foreground">Your Order</h2>
            <div className="mt-4 flex flex-col gap-3">
              {cartLines.map((line) => (
                <div key={cartKey(line.item)} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{line.item.name} &times; {line.quantity}</span>
                  <span className="font-semibold text-foreground">KES {(line.item.priceKes * line.quantity).toLocaleString('en-KE')}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="font-bold text-foreground">Total</span>
              <span className="text-xl font-bold text-foreground">KES {cartTotalKes.toLocaleString('en-KE')}</span>
            </div>
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-bold text-foreground">Pay with M-Pesa</h2>
            <p className="text-sm text-muted-foreground">Enter your M-Pesa number to receive a payment prompt.</p>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input type="tel" inputMode="tel" placeholder="07XXXXXXXX" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="pl-9" />
            </div>
            {checkoutError ? <p className="text-sm text-danger">{checkoutError}</p> : null}
            <Button size="lg" onClick={submitPhoneAndPay} loading={submitting} disabled={!phoneNumber.trim()}>
              <Smartphone aria-hidden="true" />
              Send STK Push
            </Button>
            <div className="mt-auto grid grid-cols-3 gap-2 pt-4 text-center text-xs text-muted-foreground">
              <div className="flex flex-col items-center gap-1"><ShieldCheck className="size-5 text-success" aria-hidden="true" />Secure payment</div>
              <div className="flex flex-col items-center gap-1"><Check className="size-5 text-success" aria-hidden="true" />Instant confirmation</div>
              <div className="flex flex-col items-center gap-1"><ShoppingCart className="size-5 text-success" aria-hidden="true" />No extra charges</div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (view === 'cart') {
    return (
      <main className="min-h-screen bg-background p-4 md:p-8">
        <KioskHeader machineCode={machineCode} offline={offline} onBack={() => setView('browse')} />
        <div className="mx-auto mt-6 flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Your Cart</h1>
            <p className="text-sm text-muted-foreground">Review your snacks before paying</p>
          </div>
          {cartLines.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setCart(new Map())}>
              <Trash2 aria-hidden="true" />
              Clear cart
            </Button>
          ) : null}
        </div>
        <div className="mx-auto mt-4 grid max-w-5xl gap-6 md:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-3">
            {cartLines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Your cart is empty.</p>
            ) : (
              cartLines.map((line) => (
                <div key={cartKey(line.item)} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm">
                  <div className="size-14 shrink-0 overflow-hidden rounded-md">
                    <ProductImage item={line.item} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{line.item.name}</p>
                    <p className="text-xs text-muted-foreground">{line.item.category ?? ' '}</p>
                  </div>
                  <span className="font-bold text-foreground">KES {line.item.priceKes.toLocaleString('en-KE')}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => addToCart(line.item, -1)} aria-label={`Remove one ${line.item.name}`} className="flex size-8 items-center justify-center rounded-full border border-border hover:bg-border/30">
                      <Minus className="size-3.5" aria-hidden="true" />
                    </button>
                    <span className="w-5 text-center font-semibold text-foreground">{line.quantity}</span>
                    <button type="button" onClick={() => addToCart(line.item, 1)} aria-label={`Add one more ${line.item.name}`} className="flex size-8 items-center justify-center rounded-full border border-border hover:bg-border/30">
                      <Plus className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <button type="button" onClick={() => removeFromCart(line.item)} aria-label={`Remove ${line.item.name} from cart`} className="text-muted-foreground hover:text-danger">
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
            <h2 className="font-bold text-foreground">Order Summary</h2>
            <p className="text-sm text-muted-foreground">{cartCount} item{cartCount === 1 ? '' : 's'}</p>
            <div className="flex flex-col gap-2 border-y border-border py-3">
              {cartLines.map((line) => (
                <div key={cartKey(line.item)} className="flex justify-between text-sm text-foreground">
                  <span>{line.item.name}</span>
                  <span>KES {(line.item.priceKes * line.quantity).toLocaleString('en-KE')}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-bold text-foreground">
              <span>Total</span>
              <span className="text-lg">KES {cartTotalKes.toLocaleString('en-KE')}</span>
            </div>
            <Button size="lg" onClick={startCheckout} disabled={cartLines.length === 0}>
              Proceed to M-Pesa
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (view === 'detail' && detailItem) {
    const purchasable = detailItem.availabilityState === 'available';
    return (
      <main className="min-h-screen bg-background p-4 md:p-8">
        <KioskHeader machineCode={machineCode} offline={offline} onBack={() => setView('browse')} cartCount={cartCount} onCart={() => setView('cart')} />
        <div className="mx-auto mt-6 grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="aspect-square overflow-hidden rounded-lg border border-border">
            <ProductImage item={detailItem} />
          </div>
          <div className="flex flex-col gap-3">
            {detailItem.category ? <span className="w-fit rounded-full bg-border/40 px-3 py-1 text-xs font-medium text-muted-foreground">{detailItem.category}</span> : null}
            <h1 className="text-2xl font-bold text-foreground">{detailItem.name}</h1>
            {detailItem.description ? <p className="text-sm text-muted-foreground">{detailItem.description}</p> : null}
            <span className="text-2xl font-bold text-foreground">KES {detailItem.priceKes.toLocaleString('en-KE')}</span>
            {!purchasable ? (
              <p className="flex items-center gap-2 rounded-md bg-border/40 px-3 py-2 text-sm font-medium text-muted-foreground">
                <Ban className="size-4" aria-hidden="true" />
                {STATE_LABEL[detailItem.availabilityState]}
              </p>
            ) : (
              <Button size="lg" onClick={() => { addToCart(detailItem, 1); setView('cart'); }}>
                <ShoppingCart aria-hidden="true" />
                Add to Cart
              </Button>
            )}
            {suggestions.length > 0 ? (
              <div className="mt-4">
                <h2 className="mb-2 text-sm font-semibold text-foreground">You might also like</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {suggestions.map((item) => (
                    <button key={cartKey(item)} type="button" onClick={() => setDetailItem(item)} className="flex flex-col gap-1 rounded-md border border-border p-2 text-left hover:bg-border/20">
                      <div className="aspect-square overflow-hidden rounded-sm">
                        <ProductImage item={item} />
                      </div>
                      <span className="line-clamp-1 text-xs font-medium text-foreground">{item.name}</span>
                      <span className="text-xs font-bold text-foreground">KES {item.priceKes.toLocaleString('en-KE')}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <KioskHeader machineCode={machineCode} offline={offline} cartCount={cartCount} onCart={cartCount > 0 ? () => setView('cart') : undefined} />
      {catalogError && !catalog ? <p className="mt-4 text-sm text-muted-foreground">{catalogError}</p> : null}
      {catalog ? (
        <div className="mt-6 grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input placeholder="Search snacks" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="pl-9" />
            </div>
            <nav className="flex flex-col gap-2">
              <CategoryButton label="All Snacks" active={category === null} onClick={() => setCategory(null)} />
              {categories.map((cat) => (
                <CategoryButton key={cat} label={cat} active={category === cat} onClick={() => setCategory(cat)} />
              ))}
            </nav>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{category ?? 'Choose a Category'}</h1>
            <p className="mb-4 text-sm text-muted-foreground">Explore our international snacks</p>
            {visibleItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snacks match your search.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {visibleItems.map((item) => (
                  <ProductTile
                    key={cartKey(item)}
                    item={item}
                    quantityInCart={cart.get(cartKey(item))?.quantity ?? 0}
                    onOpen={() => { setDetailItem(item); setView('detail'); }}
                    onQuickAdd={() => addToCart(item, 1)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Loading menu&hellip;</p>
      )}
    </main>
  );
}

function CategoryButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-3 text-left text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'bg-border/30 text-foreground hover:bg-border/50'}`}
    >
      <Package className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}

function KioskHeader({
  machineCode,
  offline,
  onBack,
  cartCount,
  onCart,
}: {
  machineCode: string;
  offline: boolean;
  onBack?: (() => void) | null;
  cartCount?: number;
  onCart?: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back" className="flex size-10 items-center justify-center rounded-full border border-border hover:bg-border/30">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <h1 className="text-lg font-bold text-foreground">Snack Quest &mdash; {machineCode}</h1>
      </div>
      <div className="flex items-center gap-2">
        {offline ? <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">Offline &mdash; last known menu</span> : null}
        {onCart ? (
          <button type="button" onClick={onCart} className="relative flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-border/30">
            <ShoppingCart className="size-4" aria-hidden="true" />
            Cart
            {cartCount ? <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{cartCount}</span> : null}
          </button>
        ) : null}
      </div>
    </header>
  );
}

function TransactionStatusMessage({
  status,
  failureReason,
  itemsDone,
  itemsTotal,
}: {
  status: TransactionStatus;
  failureReason: string | null;
  itemsDone: number;
  itemsTotal: number;
}) {
  const progress = itemsTotal > 1 ? ` (${itemsDone} of ${itemsTotal} items)` : '';
  switch (status) {
    case 'pending':
    case 'paid':
      return <p className="text-lg font-semibold text-foreground">Check your phone for the M-Pesa prompt&hellip;</p>;
    case 'vend_authorized':
      return <p className="text-lg font-semibold text-foreground">Payment received &mdash; dispensing your snack&hellip;</p>;
    case 'dispensed':
      return <p className="text-lg font-semibold text-success">{itemsTotal > 1 ? `All done—enjoy your snacks!${progress}` : 'Enjoy your snack!'}</p>;
    case 'payment_failed':
      return <p className="text-lg font-semibold text-danger">Payment was not completed{progress}. {failureReason ?? 'Please try again.'}</p>;
    case 'paid_vend_failed':
      return <p className="text-lg font-semibold text-danger">We couldn&apos;t dispense your item{progress}. {failureReason ?? 'Please contact support for a refund.'}</p>;
    case 'manual_review':
      return <p className="text-lg font-semibold text-warning">We&apos;re checking on your order{progress}. {failureReason ?? 'If you were charged, support will follow up.'}</p>;
    case 'refunded':
      return <p className="text-lg font-semibold text-foreground">Your payment was refunded.</p>;
    default:
      return <p className="text-lg font-semibold text-foreground">Processing&hellip;</p>;
  }
}
