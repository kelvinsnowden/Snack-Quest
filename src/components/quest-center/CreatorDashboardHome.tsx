import { useState, useEffect } from 'react';
import {
  Wallet,
  DollarSign,
  TrendingUp,
  Share2,
  Copy,
  Check,
  Zap,
  Award,
  Send,
  Users,
  QrCode,
  ShieldCheck,
  ChevronRight,
  Flame,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowUpRight,
  Package,
  Truck,
  MapPin,
  Trophy,
  Gift,
  ExternalLink
} from 'lucide-react';
import { QuestTab } from './QuestCenterContainer';
import { calculateCreatorTier } from '../../services/affiliateService';

interface CreatorDashboardHomeProps {
  overviewData: any;
  onNavigate: (tab: QuestTab) => void;
  onRefresh: () => void;
  onOpenWithdrawModal: () => void;
  onOpenQRModal: () => void;
}

export default function CreatorDashboardHome({
  overviewData,
  onNavigate,
  onOpenWithdrawModal,
  onOpenQRModal
}: CreatorDashboardHomeProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [walletData, setWalletData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const cust = overviewData?.customer;
  const refCode = overviewData?.referral?.referral_code || cust?.referral_code || 'CREATOR254';
  const refLink = overviewData?.referral?.referral_link || `https://snackquests.shop/join?ref=${refCode}`;

  useEffect(() => {
    if (!cust?.id) return;

    // Fetch cash wallet stats
    fetch(`/api/v1/affiliate/wallet?customer_id=${cust.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.wallet) setWalletData(data.wallet);
      })
      .catch((err) => console.warn('Affiliate wallet fallback active:', err));

    // Fetch creator analytics
    fetch(`/api/v1/affiliate/analytics?customer_id=${cust.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) setAnalytics(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [cust?.id]);

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

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Hey! Use my creator code *${refCode}* at Snack Quest to get KSh 250 off your first authentic Kenyan snack box! Order here: ${refLink}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Snack Quest Creator Portal',
          text: `Get KSh 250 discount using code ${refCode}`,
          url: refLink
        });
      } catch (e) {
        copyToClipboard(refLink, true);
      }
    } else {
      copyToClipboard(refLink, true);
    }
  };

  const lifetimeKes = walletData?.lifetime_earnings_kes ?? (cust?.total_referrals ? cust.total_referrals * 500 : 0);
  const availableCashKes = walletData?.available_cash_kes ?? 0;
  const pendingCashKes = walletData?.pending_cash_kes ?? 0;

  const tierInfo = calculateCreatorTier(lifetimeKes, cust?.total_referrals || 0);

  return (
    <div className="space-y-5 pb-8 animate-in fade-in duration-200">
      {/* 1. HERO GREETING BAR */}
      <div className="flex items-center justify-between gap-3 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-4 sm:p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-0.5 shrink-0 shadow-lg shadow-orange-500/20">
            <div className="w-full h-full rounded-[14px] bg-zinc-950 flex items-center justify-center text-xl font-extrabold">
              {tierInfo.badge}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                {tierInfo.tier} Creator
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Award className="w-3 h-3 text-amber-400" /> Active Level
              </span>
            </div>
            <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight mt-0.5">
              Habari, {cust?.full_name?.split(' ')[0] || 'Wanjiku'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenQRModal}
            className="w-11 h-11 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700 text-amber-400 border border-zinc-700/80 flex items-center justify-center transition-all cursor-pointer active:scale-95"
            title="Scan or Show QR Code"
          >
            <QrCode className="w-5 h-5" />
          </button>
          <button
            onClick={handleShareWhatsApp}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5 min-h-[44px] cursor-pointer active:scale-95"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </button>
        </div>
      </div>

      {/* 2. FINTECH HERO CASH CARD (Inspired by Cash App & FluxChain) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-zinc-950 p-6 text-white border border-indigo-500/30 shadow-2xl shadow-indigo-950/50">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-between gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Available Balance</span>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" /> Instant M-Pesa
            </span>
          </div>

          <div>
            <div className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-white">
              KSh {availableCashKes.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" /> +KSh {lifetimeKes.toLocaleString()} Total Earned
              </span>
              <span>•</span>
              <span className="text-amber-400">KSh {pendingCashKes} Clearance</span>
            </div>
          </div>

          {/* Card Action Row */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onOpenWithdrawModal}
              disabled={availableCashKes < 1000}
              className={`py-3 px-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-xl transition-all cursor-pointer min-h-[48px] active:scale-95 ${
                availableCashKes >= 1000
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:from-emerald-400 hover:to-teal-400 shadow-emerald-500/25'
                  : 'bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed border border-zinc-700'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Withdraw to M-Pesa</span>
            </button>

            <button
              onClick={() => onNavigate('affiliate_wallet')}
              className="py-3 px-4 rounded-2xl font-bold text-xs bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[48px] active:scale-95"
            >
              <ArrowUpRight className="w-4 h-4 text-amber-400" />
              <span>Wallet Ledger</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. QUICK ACTIONS GRID BAR */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <button
          onClick={() => onNavigate('quests')}
          className="bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 p-3 sm:p-4 rounded-2xl flex flex-col items-center text-center gap-2 transition-all cursor-pointer active:scale-95 group"
        >
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
            <Trophy className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold text-zinc-200">Quests</span>
        </button>

        <button
          onClick={() => onNavigate('affiliate_wallet')}
          className="bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 p-3 sm:p-4 rounded-2xl flex flex-col items-center text-center gap-2 transition-all cursor-pointer active:scale-95 group"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
            <DollarSign className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold text-zinc-200">Cash Wallet</span>
        </button>

        <button
          onClick={() => onNavigate('referrals')}
          className="bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 p-3 sm:p-4 rounded-2xl flex flex-col items-center text-center gap-2 transition-all cursor-pointer active:scale-95 group"
        >
          <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
            <Users className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold text-zinc-200">Invite Friends</span>
        </button>

        <button
          onClick={() => onNavigate('rewards')}
          className="bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 p-3 sm:p-4 rounded-2xl flex flex-col items-center text-center gap-2 transition-all cursor-pointer active:scale-95 group"
        >
          <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
            <Gift className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold text-zinc-200">Redeem</span>
        </button>
      </div>

      {/* 4. LIVE ORDER TRACKER CARD (Official Jumia Integration) */}
      <div className="bg-zinc-900/90 border border-zinc-800/90 rounded-3xl p-5 shadow-xl space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-white">Active Order #SQ-8891</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Jumia Express
                </span>
              </div>
              <span className="text-xs text-zinc-400 block mt-0.5">Kenyan Snack Discovery Box (Nairobi Hub)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs py-2 px-3 bg-zinc-950 rounded-2xl border border-zinc-800/80">
          <div className="flex items-center gap-1.5 text-zinc-300">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-medium">Pickup: Kimathi St CBD Station</span>
          </div>
          <span className="text-[11px] font-bold text-emerald-400">ETA Tomorrow 2 PM</span>
        </div>

        {/* Official Jumia Package Tracker Link */}
        <a
          href="https://packagetracker-services.jumia.com/#/"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-2xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <Truck className="w-4 h-4" />
          <span>Track Shipment on Jumia Services</span>
          <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
        </a>
      </div>

      {/* 5. TODAY'S SPOTLIGHT QUEST CARD (Duolingo inspired) */}
      <div className="bg-gradient-to-r from-zinc-900 via-slate-900 to-zinc-900 border border-amber-500/30 rounded-3xl p-5 shadow-xl space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950 uppercase tracking-wider flex items-center gap-1">
            <Flame className="w-3 h-3 fill-slate-950" /> Today's Featured Quest
          </span>
          <span className="text-[11px] font-mono text-emerald-400 font-bold">+50 XP • +KSh 150</span>
        </div>

        <div>
          <h3 className="text-base font-extrabold text-white">Post WhatsApp Snack Story</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Share our unboxing video on your WhatsApp status for 24 hours & upload screenshot.
          </p>
        </div>

        <button
          onClick={() => onNavigate('quests')}
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <Zap className="w-4 h-4 fill-slate-950" />
          <span>Start Quest & Earn KSh 150 →</span>
        </button>
      </div>

      {/* 6. VIRAL REFERRAL SHARE BOX */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Your Creator Referral Code</span>
            <h3 className="font-extrabold text-white text-sm">Earn KSh 500 per friend who orders</h3>
          </div>
          <button
            onClick={handleNativeShare}
            className="p-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <div className="sm:col-span-8 bg-zinc-950 border border-zinc-800 rounded-2xl px-3.5 py-2.5 flex items-center justify-between text-xs">
            <span className="text-zinc-400 truncate max-w-[200px]">{refLink}</span>
            <button
              onClick={() => copyToClipboard(refLink, true)}
              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold text-[11px] rounded-lg border border-amber-500/30 transition-all shrink-0 cursor-pointer"
            >
              {copiedLink ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="sm:col-span-4 bg-zinc-950 border border-zinc-800 rounded-2xl px-3.5 py-2.5 flex items-center justify-between text-xs">
            <span className="font-mono font-bold text-amber-300">{refCode}</span>
            <button
              onClick={() => copyToClipboard(refCode, false)}
              className="text-[11px] text-zinc-400 hover:text-white font-bold cursor-pointer"
            >
              {copiedCode ? 'Done' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
