import React, { useState, useEffect } from 'react';
import { History, Search, Filter, TrendingUp, Gift, Clock, CheckCircle2 } from 'lucide-react';

interface RewardHistoryViewProps {
  customerId: string;
}

export default function RewardHistoryView({ customerId }: RewardHistoryViewProps) {
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/customers/${customerId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.wallet_transactions && Array.isArray(data.wallet_transactions)) {
          setHistoryItems(data.wallet_transactions);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load history', err);
        setLoading(false);
      });
  }, [customerId]);

  const filtered = historyItems.filter((item) =>
    item.note?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Reward Activity History</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete audit trail of all approved quest rewards, referral bonuses, and box redemptions.
          </p>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search activity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading activity timeline...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800 p-6">
          No activity records found matching your search.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isCredit = item.amount > 0;
            const amountKes = Math.round(Math.abs(item.amount) / 100);

            return (
              <div
                key={item.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isCredit
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}
                  >
                    {isCredit ? <TrendingUp className="w-4 h-4" /> : <Gift className="w-4 h-4" />}
                  </div>

                  <div>
                    <h4 className="font-bold text-white text-sm">{item.note || 'Quest Activity'}</h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`font-extrabold text-sm ${isCredit ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isCredit ? '+' : '-'}{amountKes.toLocaleString()} KES
                  </span>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Balance: {Math.round(item.balance_after / 100).toLocaleString()} KES
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
