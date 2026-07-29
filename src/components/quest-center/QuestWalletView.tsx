import { useState, useEffect } from 'react';
import {
  Wallet,
  Gift,
  Search,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock
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
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((data) => {
        if (data && data.wallet_transactions && Array.isArray(data.wallet_transactions)) {
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
    <div className="space-y-5 pb-8 animate-in fade-in duration-200">
      {/* Fintech Digital Wallet Card (Monzo / Cash App style) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-950/40 border border-amber-500/30 p-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Quest Digital Ledger
                </span>
                <p className="text-[11px] text-zinc-400 font-mono">ID: {customerId.substring(0, 12)}</p>
              </div>
            </div>

            <div>
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Available Discount Credits</span>
              <div className="text-3xl sm:text-5xl font-black text-amber-400 font-mono tracking-tight mt-0.5">
                KSh {(wallet?.balance_kes || 0).toLocaleString()}
              </div>
              <p className="text-xs text-zinc-400 mt-1">1 Credit = KSh 1 instant discount on snack checkouts</p>
            </div>
          </div>

          <div className="bg-zinc-950/90 border border-zinc-800/90 rounded-2xl p-4 md:w-80 space-y-2.5">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Lifetime Earned:</span>
              <span className="font-bold text-emerald-400">+KSh {(wallet?.lifetime_earned_kes || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Lifetime Redeemed:</span>
              <span className="font-bold text-amber-400">-KSh {(wallet?.lifetime_used_kes || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-zinc-800">
              <span className="text-zinc-400">Pending Clearance:</span>
              <span className="font-bold text-sky-400">KSh {(wallet?.pending_credits_kes || 0).toLocaleString()}</span>
            </div>

            <button
              onClick={onRedeemClick}
              className="w-full mt-2 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Gift className="w-4 h-4" />
              <span>Redeem Credits Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Transaction Feed */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-white text-base">Quest Transaction Feed</h3>
            <p className="text-xs text-zinc-400">Real-time ledger entries detailing earned and redeemed credits.</p>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ledger..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              {['All', 'Rewards', 'Referrals', 'Redemptions'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterType === f ? 'bg-amber-500 text-slate-950 font-black' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Ledger Entries */}
        {loading ? (
          <div className="py-12 text-center text-zinc-400 text-xs">Loading transaction ledger...</div>
        ) : filteredTx.length === 0 ? (
          <div className="py-10 text-center text-zinc-400 text-xs bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
            No transactions matching criteria.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredTx.map((tx) => {
              const isPositive = tx.amount > 0;
              const amountKes = Math.round(Math.abs(tx.amount) / 100);
              const balanceAfterKes = Math.round(tx.balance_after / 100);

              return (
                <div
                  key={tx.id}
                  className="bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-3.5 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            isPositive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {tx.transaction_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-xs sm:text-sm">{tx.note || 'Quest Entry'}</h4>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`font-mono font-black text-sm sm:text-base ${isPositive ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isPositive ? '+' : '-'}KSh {amountKes.toLocaleString()}
                      </span>
                      <p className="text-[10px] text-zinc-500 font-mono">
                        Bal: KSh {balanceAfterKes.toLocaleString()}
                      </p>
                    </div>
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
