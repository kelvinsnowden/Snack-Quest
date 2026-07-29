import React, { useState, useEffect } from 'react';
import {
  Gift,
  CheckCircle2,
  AlertCircle,
  Package,
  Truck,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ShoppingBag
} from 'lucide-react';

interface RedeemCreditsViewProps {
  customerId: string;
  wallet: any;
  onRedeemed: () => void;
}

export default function RedeemCreditsView({ customerId, wallet, onRedeemed }: RedeemCreditsViewProps) {
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('pkg-alpha');
  const [creditsToRedeemKes, setCreditsToRedeemKes] = useState<number>(0);
  const [deliveryAddress, setDeliveryAddress] = useState<string>('Peponi Road, Villa 4B');
  const [county, setCounty] = useState<string>('Nairobi');
  const [town, setTown] = useState<string>('Westlands');

  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);

  // Load packages
  useEffect(() => {
    fetch('/api/v1/packages')
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((data) => {
        if (data && data.data && Array.isArray(data.data)) {
          setPackages(data.data);
          if (data.data.length > 0) setSelectedPackageId(data.data[0].id);
        }
      })
      .catch((err) => console.error('Failed to load packages', err));
  }, []);

  // Initialize credits redemption slider to max available balance or package price
  useEffect(() => {
    if (wallet?.balance_kes) {
      setCreditsToRedeemKes(Math.min(wallet.balance_kes, 2500));
    }
  }, [wallet]);

  // Recalculate preview
  useEffect(() => {
    if (!selectedPackageId) return;
    setLoadingPreview(true);

    fetch('/api/v1/customer/portal/redeem-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        package_id: selectedPackageId,
        credits_to_redeem_kes: creditsToRedeemKes
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setPreview(data);
        setLoadingPreview(false);
      })
      .catch((err) => {
        console.error('Failed preview', err);
        setLoadingPreview(false);
      });
  }, [customerId, selectedPackageId, creditsToRedeemKes]);

  const handleExecuteRedemption = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    fetch('/api/v1/customer/portal/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        package_id: selectedPackageId,
        credits_to_redeem_kes: creditsToRedeemKes,
        delivery_address: deliveryAddress,
        county,
        town
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setSubmitting(false);
        if (data.success) {
          setSuccessOrder(data);
          onRedeemed();
        } else {
          setError(data.error || 'Redemption failed');
        }
      })
      .catch((err) => {
        setSubmitting(false);
        setError('Network error processing redemption');
      });
  };

  const walletBalanceKes = wallet?.balance_kes || 0;

  if (successOrder) {
    return (
      <div className="bg-slate-900/90 border border-emerald-500/40 rounded-3xl p-8 text-center max-w-xl mx-auto shadow-2xl space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white">Redemption Confirmed! 🎉</h2>
        <p className="text-sm text-slate-300">
          Your Quest Credits have been deducted and your mystery snack box order has been dispatched to fulfillment.
        </p>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-left space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">Order Reference:</span>
            <span className="font-mono font-bold text-amber-400">{successOrder.order_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Quest Credits Used:</span>
            <span className="font-bold text-emerald-400">-{successOrder.credits_redeemed_kes.toLocaleString()} KES</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Remaining Balance:</span>
            <span className="font-bold text-amber-300">{successOrder.new_wallet_balance_kes.toLocaleString()} KES</span>
          </div>
        </div>

        <button
          onClick={() => setSuccessOrder(null)}
          className="w-full py-3 bg-amber-500 text-slate-950 font-bold rounded-xl hover:bg-amber-400 transition-all text-xs"
        >
          Return to Quest Center
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Gift className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Redeem Quest Credits for Mystery Boxes</h2>
            <p className="text-xs text-slate-400">
              Use your earned Quest Credits as real cash discount on any Snack Quest box checkout.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Package Picker & Redemption Slider */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Select Box Package */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400" />
              <span>Step 1: Select Snack Box Package</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {packages.map((pkg) => {
                const isSelected = selectedPackageId === pkg.id;
                const priceKes = Math.round(pkg.selling_price / 100);

                return (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPackageId(pkg.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm text-white">{pkg.name}</h4>
                      <span className="font-bold text-amber-400 text-sm">{priceKes.toLocaleString()} KES</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{pkg.description}</p>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isSelected ? 'SELECTED' : 'SELECT'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 2: Slider for Quest Credits */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Step 2: Choose Quest Credits to Apply</span>
              </h3>
              <span className="text-xs text-amber-400 font-bold">
                Wallet Balance: {walletBalanceKes.toLocaleString()} KES
              </span>
            </div>

            {/* Credit Slider */}
            <div className="space-y-3">
              <input
                type="range"
                min={0}
                max={walletBalanceKes}
                step={50}
                value={creditsToRedeemKes}
                onChange={(e) => setCreditsToRedeemKes(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-slate-400">Apply Manual Amount:</span>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                  <input
                    type="number"
                    min={0}
                    max={walletBalanceKes}
                    value={creditsToRedeemKes}
                    onChange={(e) => setCreditsToRedeemKes(Number(e.target.value))}
                    className="w-24 bg-transparent text-right font-bold text-amber-400 text-sm focus:outline-none"
                  />
                  <span className="text-xs text-slate-400 font-bold">KES</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Delivery Address */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-400" />
              <span>Step 3: Delivery Address (Kenya Wide Courier)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-slate-400 font-semibold block mb-1">County</label>
                <input
                  type="text"
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-slate-400 font-semibold block mb-1">Town / Estate</label>
                <input
                  type="text"
                  value={town}
                  onChange={(e) => setTown(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-slate-400 font-semibold block mb-1">Street / Building / House No.</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Order Savings Breakdown */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col justify-between space-y-6">
          <div>
            <h3 className="font-bold text-white text-base border-b border-slate-800 pb-3 mb-4">
              Checkout Summary & Savings
            </h3>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {preview ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Package ({preview.package_name}):</span>
                  <span className="font-bold text-white">{preview.package_price_kes.toLocaleString()} KES</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Wells Fargo Courier Delivery:</span>
                  <span className="font-bold text-white">+{preview.delivery_fee_kes.toLocaleString()} KES</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold pt-2 border-t border-slate-800">
                  <span>Quest Credits Applied:</span>
                  <span>-{preview.credits_redeemed_kes.toLocaleString()} KES</span>
                </div>

                <div className="p-4 bg-slate-950 rounded-2xl border border-amber-500/30 mt-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Final Amount Payable</span>
                  <div className="text-3xl font-black text-amber-400">
                    {preview.amount_payable_kes.toLocaleString()} <span className="text-sm">KES</span>
                  </div>
                  {preview.amount_payable_kes === 0 && (
                    <span className="text-[10px] font-bold text-emerald-400 uppercase bg-emerald-500/10 px-2 py-0.5 rounded inline-block">
                      100% Covered by Quest Credits!
                    </span>
                  )}
                </div>

                <div className="pt-2 text-[11px] text-slate-400 flex justify-between">
                  <span>Remaining Wallet Balance:</span>
                  <span className="font-bold text-amber-300">
                    {preview.remaining_wallet_balance_kes.toLocaleString()} KES
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-6 text-center">Calculating live preview...</div>
            )}
          </div>

          <button
            onClick={handleExecuteRedemption}
            disabled={submitting || !preview?.is_valid}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 text-xs"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>{submitting ? 'Processing Order...' : 'Confirm Redemption & Place Order'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
