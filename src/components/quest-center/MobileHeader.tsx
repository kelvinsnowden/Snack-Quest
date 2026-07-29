import React from 'react';
import {
  Wallet,
  Bell,
  Menu,
  WifiOff
} from 'lucide-react';
import { QuestTab } from './QuestCenterContainer';

interface MobileHeaderProps {
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  customersList: any[];
  overviewData: any;
  activeTab: QuestTab;
  setActiveTab: (tab: QuestTab) => void;
  onOpenNotifications: () => void;
  onOpenMenu: () => void;
  isOffline: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  installPrompt: any;
  onInstallApp: () => void;
}

export default function MobileHeader({
  overviewData,
  setActiveTab,
  onOpenNotifications,
  onOpenMenu,
  isOffline,
}: MobileHeaderProps) {
  const wallet = overviewData?.wallet;

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 transition-all select-none">
      {/* Offline Status Bar */}
      {isOffline && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1 text-[11px] font-medium text-amber-300 flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-amber-400" />
          <span>Offline Mode — Displaying cached session data</span>
        </div>
      )}

      <div className="px-4 py-3 flex items-center justify-between max-w-7xl mx-auto">
        {/* Left: Brand Identity */}
        <button
          onClick={() => setActiveTab('overview')}
          className="flex items-center gap-2.5 text-left focus:outline-none group cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-slate-950 text-xs shadow-md shadow-amber-500/20 shrink-0 tracking-tight">
            SQ
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm text-white tracking-tight leading-none">
                Snack Quest
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-mono font-bold uppercase tracking-wider leading-none">
                PRO
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 font-medium tracking-wide mt-0.5">
              {overviewData?.gamification?.level || 'Creator'} Tier
            </span>
          </div>
        </button>

        {/* Right: Clean Action Bar */}
        <div className="flex items-center gap-2">
          {/* Wallet Balance Pill */}
          {wallet && (
            <button
              onClick={() => setActiveTab('affiliate_wallet')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-full text-xs font-mono font-semibold text-emerald-400 transition-all active:scale-95 cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>KSh {(wallet.balance_kes || 0).toLocaleString()}</span>
            </button>
          )}

          {/* Notifications Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative w-9 h-9 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {overviewData?.notifications?.unread_count > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
            )}
          </button>

          {/* Menu Drawer Button */}
          <button
            onClick={onOpenMenu}
            className="w-9 h-9 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
            title="Open Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
