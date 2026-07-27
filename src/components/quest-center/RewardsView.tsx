import React, { useState } from 'react';
import {
  Wallet,
  Gift,
  History,
  Sparkles,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Tag,
  CheckCircle2
} from 'lucide-react';

import QuestWalletView from './QuestWalletView';
import RedeemCreditsView from './RedeemCreditsView';
import RewardHistoryView from './RewardHistoryView';

interface RewardsViewProps {
  customerId: string;
  wallet: any;
  initialSubTab?: 'redeem' | 'wallet' | 'history';
  onRedeemed?: () => void;
}

export default function RewardsView({
  customerId,
  wallet,
  initialSubTab = 'redeem',
  onRedeemed
}: RewardsViewProps) {
  const [subTab, setSubTab] = useState<'redeem' | 'wallet' | 'history'>(initialSubTab);

  return (
    <div className="space-y-6">
      {/* Top Fintech Card Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-600 via-amber-500 to-orange-600 p-6 sm:p-8 text-slate-950 shadow-2xl shadow-amber-500/20 border border-amber-300/40">
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-56 h-56 bg-white/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-slate-950/10 rounded-xl">
                <Wallet className="w-5 h-5 text-slate-950" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-slate-950/80">
                Snack Quest Rewards & Wallet
              </span>
            </div>

            <div className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
              KSh {(wallet?.balance_kes || 0).toLocaleString()}{' '}
              <span className="text-xs font-extrabold uppercase bg-slate-950/15 px-2 py-0.5 rounded-full">
                Spendable Credits
              </span>
            </div>
            <p className="text-xs font-bold text-slate-950/80 mt-1">
              Lifetime Earned: KSh {(wallet?.lifetime_earned_kes || 0).toLocaleString()} • Pending Review: KSh {(wallet?.pending_credits_kes || 0).toLocaleString()}
            </p>
          </div>

          {/* Sub-Tab Navigation Pills */}
          <div className="bg-slate-950/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-950/20 flex items-center gap-1 shrink-0">
            <button
              onClick={() => setSubTab('redeem')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                subTab === 'redeem'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Gift className="w-4 h-4" />
              <span>Redeem Vouchers</span>
            </button>

            <button
              onClick={() => setSubTab('wallet')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                subTab === 'wallet'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Ledger</span>
            </button>

            <button
              onClick={() => setSubTab('history')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                subTab === 'history'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <History className="w-4 h-4" />
              <span>History</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub Tab View Content */}
      <div className="animate-in fade-in duration-200">
        {subTab === 'redeem' && (
          <RedeemCreditsView
            customerId={customerId}
            wallet={wallet}
            onRedeemed={() => {
              if (onRedeemed) onRedeemed();
              setSubTab('wallet');
            }}
          />
        )}

        {subTab === 'wallet' && (
          <QuestWalletView
            customerId={customerId}
            wallet={wallet}
            onRedeemClick={() => setSubTab('redeem')}
          />
        )}

        {subTab === 'history' && (
          <RewardHistoryView customerId={customerId} />
        )}
      </div>
    </div>
  );
}
