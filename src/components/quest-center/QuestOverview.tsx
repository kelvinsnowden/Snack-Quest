import React, { useState } from 'react';
import {
  Trophy,
  Wallet,
  Sparkles,
  Gift,
  Users,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  ChevronRight,
  TrendingUp,
  Award,
  Zap,
  Star,
  Share2,
  Check,
  Flame,
  Play,
  ArrowUpRight
} from 'lucide-react';
import { QuestTab } from './QuestCenterContainer';

interface QuestOverviewProps {
  overviewData: any;
  onNavigate: (tab: QuestTab) => void;
  onRefresh: () => void;
}

export default function QuestOverview({ overviewData, onNavigate }: QuestOverviewProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const cust = overviewData?.customer;
  const wallet = overviewData?.wallet;
  const gami = overviewData?.gamification;
  const ref = overviewData?.referral;

  const refCode = ref?.referral_code || 'WANJ123';
  const refLink = ref?.referral_link || `https://snackquest.co.ke/join?ref=${refCode}`;

  const copyToClipboard = (text: string, isLink = false) => {
    navigator.clipboard.writeText(text);
    if (isLink) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Snack Quest Kenya',
          text: `Get KSh 250 off your first mystery snack box with my invite code ${refCode}!`,
          url: refLink
        });
      } catch (err) {
        console.log('Native share error', err);
      }
    } else {
      copyToClipboard(refLink, true);
    }
  };

  const daysOfWeek = [
    { day: 'M', active: true },
    { day: 'T', active: true },
    { day: 'W', active: true },
    { day: 'T', active: true },
    { day: 'F', active: true, today: true },
    { day: 'S', active: false },
    { day: 'S', active: false }
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header & Daily Streak Bar (Duolingo Style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950 uppercase tracking-wider">
              {gami?.level || 'Explorer'} Tier
            </span>
            <span className="text-xs text-slate-400 font-medium">
              📍 {cust?.county || 'Nairobi'}, Kenya
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Welcome, {cust?.full_name?.split(' ')[0] || 'Explorer'}! 👋
          </h2>
        </div>

        {/* Daily Streak Card */}
        <div className="bg-gradient-to-r from-orange-500/20 to-amber-500/10 border border-orange-500/30 rounded-2xl p-3 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center text-xl shrink-0 animate-bounce">
            🔥
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-sm">5 Day Streak!</span>
              <span className="text-[10px] font-extrabold bg-orange-500 text-slate-950 px-1.5 py-0.2 rounded">
                +50 KES Bonus
              </span>
            </div>
            {/* Week dots */}
            <div className="flex items-center gap-1 mt-1">
              {daysOfWeek.map((d, i) => (
                <span
                  key={i}
                  className={`w-4 h-4 rounded-full text-[9px] font-extrabold flex items-center justify-center ${
                    d.today
                      ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-400/50'
                      : d.active
                      ? 'bg-orange-500 text-slate-950'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {d.day}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Apple Wallet / Fintech Style Pass & Single Best Next Action Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Fintech Wallet Pass Card (7 Cols) */}
        <div className="lg:col-span-7 bg-gradient-to-br from-amber-600 via-amber-500 to-orange-600 rounded-3xl p-6 text-slate-950 shadow-2xl shadow-amber-500/20 relative overflow-hidden border border-amber-300/40 flex flex-col justify-between min-h-[220px]">
          {/* Subtle Background Metallic Shimmer */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/10 rounded-full blur-xl pointer-events-none" />

          {/* Card Top: Chip & Label */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-7 bg-amber-200/80 rounded-md border border-amber-300/60 shadow-inner flex items-center justify-center">
                <div className="w-5 h-3 border-t border-b border-amber-700/40" />
              </div>
              <span className="font-extrabold text-xs uppercase tracking-widest text-slate-950/80">
                Quest Wallet Pass
              </span>
            </div>
            <span className="text-xs font-black tracking-widest text-slate-950/60 font-mono">
              •••• 4819
            </span>
          </div>

          {/* Card Middle: KES Balance */}
          <div className="relative z-10 my-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-950/70 block">
              Spendable Credits Balance
            </span>
            <div className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight flex items-baseline gap-2 mt-1">
              <span>KSh {(wallet?.balance_kes || 0).toLocaleString()}</span>
              {wallet?.pending_credits_kes > 0 && (
                <span className="text-xs font-bold bg-slate-950/10 backdrop-blur-sm text-slate-900 border border-slate-950/20 px-2 py-0.5 rounded-full">
                  +{wallet.pending_credits_kes} KES under review
                </span>
              )}
            </div>
          </div>

          {/* Card Bottom: Quick Actions */}
          <div className="relative z-10 pt-3 border-t border-slate-950/15 flex items-center justify-between gap-3">
            <div className="text-[11px] font-bold text-slate-950/80">
              Lifetime Earned: <span className="font-extrabold text-slate-950">KSh {(wallet?.lifetime_earned_kes || 0).toLocaleString()}</span>
            </div>

            <button
              onClick={() => onNavigate('rewards')}
              className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-amber-300 font-extrabold text-xs rounded-xl shadow-xl transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Gift className="w-4 h-4 text-amber-400" />
              <span>Redeem Credits</span>
            </button>
          </div>
        </div>

        {/* 3. Single Best Next Action Hero Card (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-amber-500/40 rounded-3xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span>Today's Top Quest</span>
              </span>
              <span className="font-extrabold text-emerald-400 text-sm">+300 KES</span>
            </div>

            <h3 className="font-black text-white text-base leading-snug">
              Share 15-Sec TikTok Unboxing Video
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Unbox your Snack Quest box, tag @SnackQuestKenya, and upload screenshot proof to earn instant credits!
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-400 font-medium">
              ⏱ Est. 2 mins • 🎬 Video
            </div>
            <button
              onClick={() => onNavigate('quests')}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg transition-all flex items-center gap-1.5 min-h-[40px] active:scale-95"
            >
              <span>Start Quest Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Level Progress & Countdown to Next Level */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white text-base">
                  Level {gami?.level === 'Explorer' ? '1' : gami?.level === 'Snack Master' ? '2' : '3'}: {gami?.level || 'Explorer'}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-300 uppercase">
                  {gami?.progress_pct || 0}% Complete
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Earn KSh {((gami?.next_level_threshold_kes || 2500) - (gami?.credits_earned_kes || 0)).toLocaleString()} more to unlock VIP Master Box Discounts!
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigate('profile')}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-all flex items-center gap-1 self-start sm:self-center"
          >
            <span>View All Trophies</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-slate-950 rounded-full h-3.5 p-0.5 border border-slate-800 overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400 h-full rounded-full transition-all duration-1000 shadow-lg shadow-amber-500/20"
              style={{ width: `${Math.max(gami?.progress_pct || 15, 12)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400 font-medium">
            <span>Earned: KSh {(gami?.credits_earned_kes || 0).toLocaleString()}</span>
            <span>Target: KSh {(gami?.next_level_threshold_kes || 2500).toLocaleString()}</span>
          </div>
        </div>

        {/* Badge Trophies */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2">
          {gami?.badges?.map((badge: any) => (
            <div
              key={badge.id}
              className={`p-3 rounded-2xl border flex flex-col items-center text-center transition-all ${
                badge.unlocked
                  ? 'bg-slate-950 border-amber-500/40 text-white shadow-md'
                  : 'bg-slate-950/40 border-slate-800 text-slate-600 opacity-60'
              }`}
            >
              <span className="text-2xl mb-1">{badge.icon}</span>
              <span className="text-[11px] font-extrabold leading-tight">{badge.name}</span>
              <span className="text-[9px] mt-1 font-bold text-amber-400">
                {badge.unlocked ? 'UNLOCKED' : 'LOCKED'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Referral One-Tap Share Pass */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Zap className="w-4 h-4 fill-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Invite Friends & Earn</span>
            </div>
            <h3 className="font-extrabold text-white text-lg">
              Give KSh 250, Get <span className="text-amber-400">KSh 500 Credits</span>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Share your invite link with friends. When they buy their 1st box, KSh 500 drops into your Quest Wallet!
            </p>
          </div>

          <button
            onClick={handleNativeShare}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 shrink-0 min-h-[44px] active:scale-95"
          >
            <Share2 className="w-4 h-4" />
            <span>Share via WhatsApp</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-800/80">
          <div className="w-full sm:w-auto flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">Your Code:</span>
            <span className="font-mono font-extrabold text-amber-300 text-sm ml-2">{refCode}</span>
          </div>

          <button
            onClick={() => copyToClipboard(refCode, false)}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5 min-h-[38px]"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
