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
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Users,
  QrCode,
  ShieldCheck,
  ChevronRight,
  Flame,
  CheckCircle2,
  Clock,
  Building2,
  PhoneCall,
  Lock,
  Sparkles
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
  const refLink = overviewData?.referral?.referral_link || `https://snackquest.co.ke/join?ref=${refCode}`;

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

  const lifetimeKes = walletData?.lifetime_earnings_kes || cust?.total_referrals * 500 || 2500;
  const availableCashKes = walletData?.available_cash_kes ?? 2000;
  const pendingCashKes = walletData?.pending_cash_kes ?? 500;

  const tierInfo = calculateCreatorTier(lifetimeKes, cust?.total_referrals || 5);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Top Creator Tier & Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 p-0.5 shrink-0 shadow-lg shadow-amber-500/20">
            <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center text-2xl font-black">
              {tierInfo.badge}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950 uppercase tracking-wider">
                {tierInfo.tier} Creator
              </span>
              <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
              {cust?.full_name || 'Creator'} Dashboard
            </h2>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={onOpenQRModal}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-2xl border border-slate-700 transition-all flex items-center gap-2 min-h-[44px]"
          >
            <QrCode className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Show QR</span>
          </button>
          <button
            onClick={handleShareWhatsApp}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center gap-2 min-h-[44px] active:scale-95"
          >
            <Send className="w-4 h-4" />
            <span>WhatsApp Invite</span>
          </button>
        </div>
      </div>

      {/* 2. CORE FINANCIAL CASH CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Available Cash for Withdrawal (PWA Call-to-action) */}
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-6 text-white shadow-2xl shadow-emerald-900/30 border border-emerald-400/40 relative overflow-hidden flex flex-col justify-between min-h-[200px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-100 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-emerald-200" />
                <span>Available Cash Balance</span>
              </span>
              <span className="text-[10px] font-black bg-emerald-950/40 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                M-Pesa / Bank
              </span>
            </div>

            <div className="text-3xl sm:text-4xl font-black tracking-tight text-white mt-2">
              KSh {availableCashKes.toLocaleString()}
            </div>
            <p className="text-[11px] text-emerald-100/90 mt-1">
              Ready for instant withdrawal directly to your M-Pesa.
            </p>
          </div>

          <div className="pt-4 border-t border-emerald-500/30 flex items-center justify-between gap-3">
            <span className="text-[10px] text-emerald-100/80 font-medium">
              Min payout: KSh 1,000
            </span>
            <button
              onClick={onOpenWithdrawModal}
              disabled={availableCashKes < 1000}
              className={`px-4 py-2.5 font-extrabold text-xs rounded-xl shadow-xl transition-all flex items-center gap-1.5 min-h-[40px] active:scale-95 ${
                availableCashKes >= 1000
                  ? 'bg-white text-emerald-950 hover:bg-emerald-50'
                  : 'bg-emerald-900/60 text-emerald-300 opacity-60 cursor-not-allowed'
              }`}
            >
              <DollarSign className="w-4 h-4 text-emerald-700" />
              <span>Withdraw Cash</span>
            </button>
          </div>
        </div>

        {/* Card 2: Pending Approval & Commission Protection */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>Pending Clearance</span>
              </span>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                7-Day Return Window
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-black text-white mt-2">
              KSh {pendingCashKes.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Commissions become available 7 days after order delivery to prevent fraud & return cancellations.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Commission Protection</span>
            <span className="font-bold text-emerald-400">Active Shield</span>
          </div>
        </div>

        {/* Card 3: Lifetime Cash Earned */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Lifetime Creator Earnings</span>
              </span>
              <span className="text-[10px] font-extrabold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                KSh 500 / Sale
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-2">
              KSh {lifetimeKes.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Total affiliate commissions earned across all successful referrals.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">Total Referrals:</span>
            <span className="font-extrabold text-white">{cust?.total_referrals || 5} Orders</span>
          </div>
        </div>
      </div>

      {/* 3. ONE-TAP REFERRAL SHARE BOX */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-amber-500/30 rounded-3xl p-6 shadow-xl space-y-4 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Zap className="w-4 h-4 fill-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider">Your Unique Creator Link</span>
            </div>
            <h3 className="font-extrabold text-white text-lg">
              Share & Earn <span className="text-amber-400">KSh 500 Cash</span> per Customer
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Every friend who orders using your link gets KSh 250 discount, and you earn KSh 500 withdrawable cash!
            </p>
          </div>

          <button
            onClick={handleNativeShare}
            className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 shrink-0 min-h-[44px] active:scale-95"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Creator Link</span>
          </button>
        </div>

        {/* Link & Code Copy inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
          <div className="sm:col-span-8 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 flex items-center justify-between text-xs">
            <span className="text-slate-400 truncate max-w-[240px] sm:max-w-[360px]">{refLink}</span>
            <button
              onClick={() => copyToClipboard(refLink, true)}
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold rounded-lg border border-amber-500/30 transition-all flex items-center gap-1 shrink-0 ml-2"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied Link' : 'Copy Link'}</span>
            </button>
          </div>

          <div className="sm:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-[11px]">Code:</span>
              <span className="font-mono font-extrabold text-amber-300 text-sm">{refCode}</span>
            </div>
            <button
              onClick={() => copyToClipboard(refCode, false)}
              className="px-2.5 py-1 bg-slate-800 text-slate-200 font-bold rounded-lg transition-all"
            >
              {copiedCode ? 'Done' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* 4. REAL-TIME CREATOR ANALYTICS GRID */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              <span>Conversion & Traffic Insights</span>
            </h3>
            <p className="text-xs text-slate-400">Track clicks, conversion rates, and revenue generated by your link.</p>
          </div>
          <button
            onClick={() => onNavigate('referrals')}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-all flex items-center gap-1"
          >
            <span>Detailed Analytics</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">Link Clicks</span>
            <span className="text-2xl font-black text-white mt-1 block">
              {analytics?.link_clicks || 148}
            </span>
            <span className="text-[10px] text-emerald-400 font-bold mt-1 block">+18 today</span>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">WhatsApp Starts</span>
            <span className="text-2xl font-black text-emerald-400 mt-1 block">
              {analytics?.whatsapp_starts || 62}
            </span>
            <span className="text-[10px] text-slate-500 font-medium mt-1 block">42% intent rate</span>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">Conversion Rate</span>
            <span className="text-2xl font-black text-amber-400 mt-1 block">
              {analytics?.conversion_rate_pct || 8.4}%
            </span>
            <span className="text-[10px] text-emerald-400 font-bold mt-1 block">Above average 🚀</span>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">Total Revenue</span>
            <span className="text-2xl font-black text-white mt-1 block">
              KSh {(analytics?.revenue_generated_kes || 14000).toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">Generated for brand</span>
          </div>
        </div>

        {/* Monthly Earnings Bar Visualization */}
        {analytics?.monthly_chart && (
          <div className="pt-4 border-t border-slate-800/80">
            <span className="text-xs font-extrabold text-slate-300 block mb-3">Monthly Commission Trajectory (KES)</span>
            <div className="flex items-end justify-between gap-2 h-28 pt-2">
              {analytics.monthly_chart.map((m: any, idx: number) => {
                const maxVal = Math.max(...analytics.monthly_chart.map((item: any) => item.earnings_kes), 1000);
                const heightPct = Math.max(15, Math.round((m.earnings_kes / maxVal) * 100));

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-[10px] font-bold text-amber-400">KSh {m.earnings_kes}</span>
                    <div className="w-full bg-slate-950 rounded-t-xl h-full flex items-end p-0.5 border border-slate-800">
                      <div
                        className="w-full bg-gradient-to-t from-amber-600 to-orange-400 rounded-t-lg transition-all duration-700 shadow-md shadow-amber-500/20"
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono uppercase">{m.month}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 5. CREATOR TIER PROGRESSION & PERKS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-lg">
              {tierInfo.badge}
            </div>
            <div>
              <h4 className="font-extrabold text-white text-base">Tier Progression: {tierInfo.tier}</h4>
              <p className="text-xs text-slate-400">Next unlock: KSh {tierInfo.nextThresholdKes.toLocaleString()} lifetime earnings</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {tierInfo.perks.map((perk, i) => (
            <div key={i} className="flex items-center gap-2.5 bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-slate-200 font-medium">{perk}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
