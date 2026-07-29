import React, { useState } from 'react';
import {
  X,
  DollarSign,
  AlertCircle,
  Building2,
  Phone,
  ShieldCheck,
  ArrowRight
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      {/* Bottom Sheet Container */}
      <div className="bg-zinc-950 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 text-zinc-100 shadow-2xl relative max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        {/* Handle bar for bottom sheet feel */}
        <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
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
            <p className="text-xs text-zinc-400">Instant M-Pesa or Bank Transfer</p>
          </div>
        </div>

        {/* Balance Callout */}
        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 mb-5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 block">
              Available Cash
            </span>
            <span className="text-2xl font-black text-white block mt-0.5 font-mono">
              KSh {availableCashKes.toLocaleString()}
            </span>
          </div>
          <span className="text-xs font-black bg-emerald-500 text-slate-950 px-3 py-1 rounded-full">
            Ready
          </span>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              Amount to Withdraw (KSh)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">KSh</span>
              <input
                type="number"
                min={minKes}
                max={availableCashKes}
                value={amountKes}
                onChange={(e) => setAmountKes(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-14 pr-4 py-3.5 text-base font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                placeholder="1000"
                required
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[1000, 2500, 5000].map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => setAmountKes(Math.min(quick, availableCashKes).toString())}
                  className="px-3 py-1 rounded-xl text-xs font-bold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                >
                  KSh {quick.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method Tabs */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              Payout Destination
            </label>
            <div className="grid grid-cols-2 gap-2 bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setMethod('mpesa');
                  setAccountNumber(customerPhone || '254712345678');
                }}
                className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  method === 'mpesa' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Phone className="w-4 h-4" />
                <span>M-Pesa Express</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('bank')}
                className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  method === 'bank' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Bank Wire</span>
              </button>
            </div>
          </div>

          {/* Account Number */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1">
              {method === 'mpesa' ? 'M-Pesa Mobile Number' : 'Bank Account Number'}
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              placeholder={method === 'mpesa' ? '2547XXXXXXXX' : '1100XXXXXX'}
              required
            />
          </div>

          {method === 'bank' && (
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Bank Name
              </label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="Equity Bank">Equity Bank Kenya</option>
                <option value="KCB Bank">KCB Bank Kenya</option>
                <option value="NCBA Bank">NCBA Bank Kenya</option>
                <option value="Co-operative Bank">Co-operative Bank</option>
                <option value="Absa Bank">Absa Bank Kenya</option>
                <option value="Standard Chartered">Standard Chartered</option>
              </select>
            </div>
          )}

          {/* Submit CTA Button */}
          <button
            type="submit"
            disabled={submitting || availableCashKes < minKes}
            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl cursor-pointer active:scale-95 transition-all mt-4 ${
              submitting || availableCashKes < minKes
                ? 'bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
            }`}
          >
            {submitting ? (
              <span>Processing Transfer...</span>
            ) : (
              <>
                <span>Confirm KSh {numAmount ? numAmount.toLocaleString() : '0'} Payout</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
