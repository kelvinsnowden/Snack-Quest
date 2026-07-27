import React, { useState } from 'react';
import {
  X,
  Wallet,
  DollarSign,
  Phone,
  Building2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Info
} from 'lucide-react';

interface CashWithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  customerPhone: string;
  availableCashKes: number;
  onSuccess: () => void;
}

export default function CashWithdrawalModal({
  isOpen,
  onClose,
  customerId,
  customerName,
  customerPhone,
  availableCashKes,
  onSuccess
}: CashWithdrawalModalProps) {
  const [amountKes, setAmountKes] = useState<string>('1000');
  const [method, setMethod] = useState<'mpesa' | 'bank'>('mpesa');
  const [accountNumber, setAccountNumber] = useState<string>(customerPhone || '254712345678');
  const [bankName, setBankName] = useState<string>('Equity Bank');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const minKes = 1000;
  const numAmount = Number(amountKes);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isNaN(numAmount) || numAmount < minKes) {
      setErrorMsg(`Minimum cash withdrawal is KSh ${minKes.toLocaleString()}.`);
      return;
    }

    if (numAmount > availableCashKes) {
      setErrorMsg(`Entered amount exceeds your available cash balance (KSh ${availableCashKes.toLocaleString()}).`);
      return;
    }

    if (!accountNumber || accountNumber.trim().length < 8) {
      setErrorMsg('Please enter a valid phone or bank account number.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/affiliate/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          amount_kes: numAmount,
          method,
          account_number: accountNumber,
          bank_name: method === 'bank' ? bankName : 'Safaricom M-Pesa',
          notes
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to process withdrawal request');
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-black">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">Withdraw Cash</h3>
            <p className="text-xs text-slate-400">Transfer affiliate earnings to your mobile money or bank</p>
          </div>
        </div>

        {/* Balance Callout */}
        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 mb-5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 block">
              Available Cash Balance
            </span>
            <span className="text-2xl font-black text-white block mt-0.5">
              KSh {availableCashKes.toLocaleString()}
            </span>
          </div>
          <span className="text-xs font-bold bg-emerald-500 text-slate-950 px-2.5 py-1 rounded-full">
            Ready
          </span>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Withdrawal Amount (KSh)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-sm font-black text-amber-400">KSh</span>
              <input
                type="number"
                min={minKes}
                max={availableCashKes}
                value={amountKes}
                onChange={(e) => setAmountKes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-13 pr-4 py-3 text-white font-black text-lg focus:outline-none focus:border-amber-500 transition-all"
                placeholder="1000"
              />
            </div>
            {/* Quick Presets */}
            <div className="flex items-center gap-2 mt-2">
              {[1000, 2500, 5000, availableCashKes].map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAmountKes(preset.toString())}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-bold border border-slate-700"
                >
                  {preset === availableCashKes ? 'Max' : `KSh ${preset}`}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Payout Channel
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod('mpesa')}
                className={`p-3 rounded-2xl border flex items-center gap-2 text-xs font-extrabold transition-all ${
                  method === 'mpesa'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <Phone className="w-4 h-4" />
                <span>M-Pesa B2C</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('bank')}
                className={`p-3 rounded-2xl border flex items-center gap-2 text-xs font-extrabold transition-all ${
                  method === 'bank'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Bank Transfer</span>
              </button>
            </div>
          </div>

          {/* Account Number */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              {method === 'mpesa' ? 'M-Pesa Phone Number' : 'Bank Account Number'}
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-amber-500"
              placeholder={method === 'mpesa' ? '254712345678' : 'Account number'}
            />
          </div>

          {method === 'bank' && (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Bank Name</label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="Equity Bank">Equity Bank Kenya</option>
                <option value="KCB Bank">KCB Bank Kenya</option>
                <option value="Co-operative Bank">Co-operative Bank</option>
                <option value="NCBA Bank">NCBA Bank Kenya</option>
                <option value="Absa Kenya">Absa Bank Kenya</option>
                <option value="Standard Chartered">Standard Chartered</option>
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Notes / Reference (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500"
              placeholder="e.g. July commission payout"
            />
          </div>

          {/* SLA Callout */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl text-[11px] text-slate-400 flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>M-Pesa withdrawals under KSh 2,000 auto-clear instantly. Larger payouts process within 1-3 business hours.</span>
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={submitting || availableCashKes < minKes}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 min-h-[48px] active:scale-95 disabled:opacity-50"
          >
            {submitting ? (
              <span>Processing Request...</span>
            ) : (
              <>
                <span>Confirm & Request KSh {numAmount.toLocaleString()}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
