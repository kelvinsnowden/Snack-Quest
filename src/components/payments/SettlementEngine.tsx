import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Building, Clock, ArrowUpRight, ShieldCheck, RefreshCw } from 'lucide-react';

export const SettlementEngine: React.FC = () => {
  const [settlement, setSettlement] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettlement = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/payments/settlement');
      const data = await res.json();
      setSettlement(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlement();
  }, []);

  if (loading || !settlement) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
        Calculating Financial Settlement & Liabilities...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary Financial Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-emerald-400" /> Today's M-Pesa Collections
          </div>
          <div className="text-2xl font-black text-white">
            KSh {settlement.collections_today_kes.toLocaleString()}
          </div>
          <div className="text-xs text-emerald-400 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" /> Gross Daraja STK + Till receipts
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-rose-400" /> B2C Payouts & Refunds
          </div>
          <div className="text-2xl font-black text-rose-400">
            KSh {settlement.payouts_today_kes.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-400">Disbursed via B2C channel</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Building className="w-4 h-4 text-amber-400" /> Estimated Daraja Gateway Fees
          </div>
          <div className="text-2xl font-black text-amber-400">
            KSh {settlement.gateway_fees_today_kes.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-400">~1.2% average Safaricom tariff</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-400" /> Net Settled Cash Position
          </div>
          <div className="text-2xl font-black text-blue-400">
            KSh {settlement.net_cash_position_kes.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-400">Net revenue available for settlement</div>
        </div>
      </div>

      {/* Liabilities & Reserves Breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white border-b border-zinc-800 pb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-purple-400" /> Pending Liabilities & Outstanding Ledger Reserves
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg">
            <div className="text-xs font-medium text-zinc-400">Pending Bank Settlements</div>
            <div className="text-lg font-bold text-white mt-1">KSh {settlement.pending_settlements_kes.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-500 mt-1">Safaricom Paybill to Bank transfer in transit</div>
          </div>

          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg">
            <div className="text-xs font-medium text-zinc-400">Creator Affiliate Liabilities</div>
            <div className="text-lg font-bold text-purple-400 mt-1">KSh {settlement.creator_liabilities_kes.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-500 mt-1">Unwithdrawn creator commission balance</div>
          </div>

          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg">
            <div className="text-xs font-medium text-zinc-400">Quest Credit Wallet Liabilities</div>
            <div className="text-lg font-bold text-emerald-400 mt-1">KSh {settlement.quest_wallet_liabilities_kes.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-500 mt-1">Customer reward credits issued</div>
          </div>

          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg">
            <div className="text-xs font-medium text-zinc-400">Outstanding Refunds Reserved</div>
            <div className="text-lg font-bold text-rose-400 mt-1">KSh {settlement.outstanding_refunds_kes.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-500 mt-1">Held for customer claim review</div>
          </div>
        </div>
      </div>
    </div>
  );
};
