import React from 'react';
import { Sparkles, TrendingUp, Wallet, Users, ArrowUpRight } from 'lucide-react';
import { setDevPortalOverride } from '../../lib/domainResolver';

const BENEFITS = [
  { icon: TrendingUp, title: 'Run brand campaigns', description: 'Get matched with Snack Quest campaigns and track every submission.' },
  { icon: Wallet, title: 'Get paid directly', description: 'Withdraw earnings straight to M-Pesa whenever you have a balance.' },
  { icon: Users, title: 'Grow with referrals', description: 'A dedicated link and analytics for everyone you bring to Snack Quest.' }
];

export default function BecomeCreatorPromo() {
  const handleOpenCreatorPortal = () => {
    setDevPortalOverride('creators');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-5 h-5 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Become a Snack Quest Creator</h2>
        <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
          Creators get their own dashboard for campaigns, analytics, and payouts — separate from your Quest
          Center wallet.
        </p>

        <button
          onClick={handleOpenCreatorPortal}
          className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors min-h-[48px] cursor-pointer"
        >
          <span>Open the Creator Portal</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
        <p className="text-[11px] text-slate-500 mt-2">creators.snackquests.shop &middot; sign in with a magic link, no password needed</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {BENEFITS.map(({ icon: Icon, title, description }) => (
          <div key={title} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <Icon className="w-4 h-4 text-amber-400 mb-2" />
            <h3 className="text-sm font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400 mt-1">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
