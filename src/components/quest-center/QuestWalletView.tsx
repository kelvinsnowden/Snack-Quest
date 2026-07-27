import React, { useState, useEffect } from 'react';
import {
  Wallet,
  TrendingUp,
  Gift,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  ShieldCheck,
  Search,
  Filter,
  CreditCard,
  Sparkles
} from 'lucide-react';

interface QuestWalletViewProps {
  customerId: string;
  wallet: any;
  onRedeemClick: () => void;
}

export default function QuestWalletView({ customerId, wallet, onRedeemClick }: QuestWalletViewProps) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchTransactions = () => {
    setLoading(true);
    fetch(`/api/v1/customers/${customerId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.wallet_transactions && Array.isArray(data.wallet_transactions)) {
          setTransactions(data.wallet_transactions);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch wallet transactions', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTransactions();
  }, [customerId]);

  const filteredTx = transactions.filter((tx) => {
    const matchesSearch = tx.note?.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterType === 'All') return matchesSearch;
    if (filterType === 'Rewards') return matchesSearch && tx.transaction_type === 'reward_approved';
    if (filterType === 'Referrals') return matchesSearch && tx.transaction_type === 'referral_bonus';
    if (filterType === 'Redemptions') return matchesSearch && tx.transaction_type === 'redeemed_on_order';
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Banking-Style Digital Quest Wallet Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-slate-900 via-slate-900 to-amber-950/40 border border-amber-500/30 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Quest Digital Credit Ledger
                </span>
                <p className="text-xs text-slate-400">Account ID: {customerId.toUpperCase()}</p>
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Available Balance</span>
              <div className="text-4xl sm:text-5xl font-black text-amber-400 tracking-tight mt-1">
                {(wallet?.balance_kes || 0).toLocaleString()} <span className="text-lg font-bold text-amber-500">KES</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">1 Quest Credit = 1 KES discount on box checkouts</p>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 md:w-80 space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Lifetime Earned:</span>
              <span className="font-bold text-emerald-400">+{(wallet?.lifetime_earned_kes || 0).toLocaleString()} KES</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Lifetime Redeemed:</span>
              <span className="font-bold text-amber-400">-{(wallet?.lifetime_used_kes || 0).toLocaleString()} KES</span>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-slate-800">
              <span className="text-slate-400">Pending Verification:</span>
              <span className="font-bold text-sky-400">{(wallet?.pending_credits_kes || 0).toLocaleString()} KES</span>
            </div>

            <button
              onClick={onRedeemClick}
              className="w-full mt-3 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Gift className="w-4 h-4" />
              <span>Redeem Credits Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Transaction History Section */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-white text-lg">Immutable Quest Credit Ledger</h3>
            <p className="text-xs text-slate-400">Real-time ledger entries detailing earned and redeemed Quest Credits.</p>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ledger..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-800 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              {['All', 'Rewards', 'Referrals', 'Redemptions'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    filterType === f ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Expandable Cards Ledger */}
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">Loading ledger transactions...</div>
        ) : filteredTx.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs bg-slate-950 p-6 rounded-2xl border border-slate-800">
            No transactions found for this search.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTx.map((tx) => {
              const isPositive = tx.amount > 0;
              const amountKes = Math.round(Math.abs(tx.amount) / 100);
              const balanceAfterKes = Math.round(tx.balance_after / 100);

              return (
                <div
                  key={tx.id}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 transition-all hover:border-slate-700 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                            isPositive
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {tx.transaction_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-sm leading-snug">{tx.note || 'Quest Credit Entry'}</h4>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`font-black text-base ${isPositive ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isPositive ? '+' : '-'}{amountKes.toLocaleString()} <span className="text-xs">KES</span>
                      </span>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                        Balance: {balanceAfterKes.toLocaleString()} KES
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-900/80 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                    <span>ID: {tx.id.substring(0, 12)}...</span>
                    <span>Time: {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
