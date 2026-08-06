'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Product = { id: string; name: string; description: string; imageUrl: string | null; priceKes: number };
type Station = { id: string; name: string; county: string | null; town: string | null; deliveryFeeKes: number };

async function checkout(body?: Record<string, unknown>) {
  const response = await fetch('/api/public-checkout', body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Checkout request failed');
  return data;
}

export default function CheckoutPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState(''); const [quantity, setQuantity] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState(''); const [customerName, setCustomerName] = useState(''); const [county, setCounty] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'door'>('pickup'); const [stationSearch, setStationSearch] = useState(''); const [stations, setStations] = useState<Station[]>([]);
  const [addressText, setAddressText] = useState(''); const [landmark, setLandmark] = useState(''); const [estate, setEstate] = useState(''); const [referralCode, setReferralCode] = useState('');
  const [session, setSession] = useState(''); const [quote, setQuote] = useState<{ subtotalKes: number; discountKes: number; deliveryFeeKes: number; totalKes: number } | null>(null);
  const [status, setStatus] = useState(''); const [orderId, setOrderId] = useState<string | null>(null); const [error, setError] = useState('');
  const selected = useMemo(() => products.find((product) => product.id === productId), [products, productId]);

  useEffect(() => { checkout().then((data) => { setProducts(data.products); setProductId(data.products[0]?.id ?? ''); }).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => {
    if (status !== 'waiting' || !session) return;
    const timer = window.setInterval(async () => { try { const data = await checkout({ action: 'status', checkoutSessionId: session }); if (data.paymentStatus === 'succeeded') { setOrderId(data.orderId); setStatus('success'); } else if (['failed', 'abandoned'].includes(data.paymentStatus)) setStatus('failed'); } catch {} }, 3000);
    return () => window.clearInterval(timer);
  }, [session, status]);

  async function price(checkoutSessionId: string) { const data = await checkout({ action: 'referral', checkoutSessionId, referralCode: referralCode || null }); setQuote(data); setStatus('review'); }
  async function begin(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const started = await checkout({ action: 'start', phoneNumber, productId, quantity, referralCode: referralCode || undefined }); setSession(started.checkoutSessionId);
      const delivery = await checkout({ action: 'delivery', checkoutSessionId: started.checkoutSessionId, customerName, county, deliveryMethod, pickupStationSearch: deliveryMethod === 'pickup' ? (stationSearch || county) : undefined, addressText: deliveryMethod === 'door' ? addressText : undefined, landmark: deliveryMethod === 'door' ? landmark : undefined, estate: deliveryMethod === 'door' ? estate : undefined, contactPhone: phoneNumber });
      if (deliveryMethod === 'pickup') { setStations(delivery.pickupStations); setStatus('choose-station'); } else await price(started.checkoutSessionId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to start checkout'); }
  }
  async function chooseStation(id: string) { try { await checkout({ action: 'delivery', checkoutSessionId: session, customerName, county, deliveryMethod: 'pickup', pickupStationId: id }); await price(session); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to select station'); } }
  async function pay() { try { const data = await checkout({ action: 'pay', checkoutSessionId: session }); if (data.status !== 'stk_sent') throw new Error(data.message ?? 'M-Pesa prompt could not be sent'); setStatus('waiting'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment could not be started'); } }

  if (status === 'success') return <main className="mx-auto max-w-xl p-8"><h1>✅ Payment Successful</h1><p>Order Number: {orderId}</p><p>Amount Paid: KES {quote?.totalKes}</p><p>Delivery: {deliveryMethod === 'pickup' ? 'Jumia Pickup' : 'Bolt Door Delivery'}</p>{deliveryMethod === 'pickup' ? <p>Your order has been received. We will prepare your shipment and notify you when it has been dispatched.</p> : <><p>Your payment has been received. Continue on WhatsApp to arrange your Bolt door delivery. Delivery is paid to the Bolt rider on arrival.</p><a href={'https://wa.me/?text=' + encodeURIComponent('Hi Snack Quest, I have paid for order ' + orderId + ' and need Bolt delivery arranged.')}>Continue on WhatsApp</a></>}</main>;
  return <main className="mx-auto max-w-xl p-8"><h1>Snack Quest Checkout</h1>{error && <p role="alert">{error}</p>}
    {status === 'waiting' ? <p>Waiting for M-Pesa confirmation…</p> : status === 'failed' ? <><p>Payment was not completed. No order was created.</p><button onClick={() => setStatus('review')}>Try payment again</button></> : status === 'choose-station' ? <section><h2>Choose a Jumia pickup station</h2>{stations.map((station) => <button className="block w-full border p-3 text-left" key={station.id} onClick={() => chooseStation(station.id)}>{station.name} — KES {station.deliveryFeeKes}</button>)}</section> : status === 'review' && quote ? <section><h2>Review your order</h2><p>{selected?.name} × {quantity}</p><p>Subtotal: KES {quote.subtotalKes}</p><p>Delivery: KES {quote.deliveryFeeKes}</p><p>Discount: KES {quote.discountKes}</p><p>Total: KES {quote.totalKes}</p>{deliveryMethod === 'door' && <p>Bolt delivery is arranged after payment and paid directly to the rider on arrival.</p>}<button onClick={pay}>Pay with M-Pesa</button></section> : <form onSubmit={begin} className="grid gap-3"><label>Snack box<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — KES {product.priceKes}</option>)}</select></label><label>Quantity<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}/></label><label>Name<input required value={customerName} onChange={(event) => setCustomerName(event.target.value)}/></label><label>Phone number<input required value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)}/></label><label>County/city<input required value={county} onChange={(event) => setCounty(event.target.value)}/></label><label>Referral code (optional)<input value={referralCode} onChange={(event) => setReferralCode(event.target.value)}/></label><label>Delivery<select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as 'pickup' | 'door')}><option value="pickup">Jumia Pickup</option><option value="door">Bolt Door Delivery</option></select></label>{deliveryMethod === 'pickup' ? <label>Pickup town/area<input value={stationSearch} onChange={(event) => setStationSearch(event.target.value)}/></label> : <><p>Bolt delivery is arranged after payment. You will pay the rider on arrival.</p><label>Address<input required value={addressText} onChange={(event) => setAddressText(event.target.value)}/></label><label>Landmark<input required value={landmark} onChange={(event) => setLandmark(event.target.value)}/></label><label>Estate<input required value={estate} onChange={(event) => setEstate(event.target.value)}/></label></>}<button type="submit">Continue</button></form>}</main>;
}
