import React, { useState, useEffect } from 'react';
import {
  Wallet,
  DollarSign,
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  Phone,
  Filter,
  Plus,
  RefreshCw,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

interface CreatorAffiliateWalletProps {
  customerId: string;
  onOpenWithdrawModal: () => void;
}

export default function CreatorAffiliateWallet({
  customerId,
  onOpenWithdrawModal
}: CreatorAffiliateWalletProps) {
  const [walletData, setWalletData] = useState<any>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchWallet = () => {
    setLoading(true);
    fetch(`/api/v1/affiliate/wallet?customer_id=${customerId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.wallet) setWalletData(data.wallet);
        if (data?.withdrawals) setWithdrawals(data.withdrawals);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (customerId) fetchWallet();
  }, [customerId]);

  const filteredWithdrawals = statusFilter === 'all'
    ? withdrawals
    : withdrawals.filter((w) => w.status === statusFilter);

  const availableKes = walletData?.available_cash_kes ?? 2000;
  const pendingKes = walletData?.pending_cash_kes ?? 500;
  const lifetimeWithdrawnKes = walletData?.lifetime_withdrawn_kes ?? 0;
  const lifetimeEarningsKes = walletData?.lifetime_earnings_kes ?? 2500;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
            Affiliate Ledger
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
            Cash Wallet & Withdrawals
          </h2>
          <p className="text-xs text-slate-400">Separate real cash ledger for affiliate referral payouts.</p>
        </div>

        <button
          onClick={onOpenWithdrawModal}
          className="px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 min-h-[44px] active:scale-95"
        >
          <DollarSign className="w-4 h-4" />
          <span>Request Cash Payout</span>
        </button>
      </div>

      {/* Cash Stats Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 shadow-xl">
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">Available Cash</span>
          <span className="text-2xl font-black text-white block mt-1">KSh {availableKes.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Ready to withdraw</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">Pending Clearance</span>
          <span className="text-2xl font-black text-white block mt-1">KSh {pendingKes.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Held for 7-day window</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Paid Out</span>
          <span className="text-2xl font-black text-emerald-400 block mt-1">KSh {lifetimeWithdrawnKes.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Dispatched to M-Pesa/Bank</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Lifetime Earned</span>
          <span className="text-2xl font-black text-amber-400 block mt-1">KSh {lifetimeEarningsKes.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Total commissions</span>
        </div>
      </div>

      {/* Withdrawal History Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <h3 className="font-extrabold text-white text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <span>Withdrawal Request History</span>
          </h3>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {['all', 'pending', 'approved', 'paid', 'rejected'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* List of Withdrawals as Mobile Cards with Fintech Status Timeline */}
        {filteredWithdrawals.length === 0 ? (
          <div className="text-center py-10 bg-slate-950/40 rounded-2xl border border-slate-800/60 p-6">
            <Wallet className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <h4 className="font-extrabold text-slate-300 text-sm">No Cash Withdrawals Found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Submit your first cash payout request when your available balance reaches KSh 1,000.
            </p>
            <button
              onClick={onOpenWithdrawModal}
              className="mt-4 px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-500 transition-all min-h-[44px]"
            >
              Request Withdrawal Now
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredWithdrawals.map((w) => {
              const isPaid = w.status === 'paid';
              const isApproved = w.status === 'approved';
              const isPending = w.status === 'pending';
              const isRejected = w.status === 'rejected';

              // Status timeline step indices (0 = Requested, 1 = Under Review, 2 = Approved, 3 = Paid)
              const currentStep = isPaid ? 3 : isApproved ? 2 : isPending ? 1 : 0;

              const timelineSteps = [
                { label: 'Requested', desc: 'Submitted' },
                { label: 'Under Review', desc: 'SLA < 3h' },
                { label: 'Approved', desc: 'Queued' },
                { label: 'Paid', desc: 'M-Pesa / Bank' }
              ];

              return (
                <div
                  key={w.id}
                  className="bg-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col gap-4 hover:border-slate-700 transition-all shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          isPaid
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isApproved
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : isPending
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}
                      >
                        <DollarSign className="w-5 h-5" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-white text-lg">
                            KSh {w.amount_kes?.toLocaleString() || Math.round(w.amount_cents / 100).toLocaleString()}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isPaid
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : isApproved
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : isPending
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                            }`}
                          >
                            {w.status}
                          </span>
                        </div>

                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                          <span>{w.method === 'mpesa' ? '📱 M-Pesa' : '🏦 Bank'} ({w.account_number})</span>
                          <span>• {new Date(w.requested_at).toLocaleDateString('en-GB')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono text-slate-500 block">#{w.id.slice(-6)}</span>
                    </div>
                  </div>

                  {/* Status Timeline Progress Bar */}
                  {!isRejected ? (
                    <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3">
                      <div className="text-[11px] font-extrabold text-slate-400 mb-2 flex items-center justify-between">
                        <span>Payout Timeline</span>
                        {isPaid && w.payment_reference && (
                          <span className="text-emerald-400 font-mono text-[10px]">Ref: {w.payment_reference}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-1 relative">
                        {timelineSteps.map((step, idx) => {
                          const isCompleted = idx <= currentStep;
                          const isCurrent = idx === currentStep;

                          return (
                            <div key={idx} className="flex flex-col items-center text-center">
                              <div
                                className={`w-full h-1.5 rounded-full mb-1.5 transition-all ${
                                  isCompleted
                                    ? isPaid
                                      ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
                                      : 'bg-amber-500 shadow-sm shadow-amber-500/40'
                                    : 'bg-slate-800'
                                }`}
                              />
                              <span
                                className={`text-[10px] font-bold leading-tight ${
                                  isCurrent
                                    ? 'text-amber-300 font-extrabold'
                                    : isCompleted
                                    ? 'text-slate-200'
                                    : 'text-slate-600'
                                }`}
                              >
                                {step.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-300">
                      <span className="font-bold block">Payout Request Declined</span>
                      <span className="text-[11px] opacity-90">{w.rejection_reason || 'Please verify account number and try again.'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
