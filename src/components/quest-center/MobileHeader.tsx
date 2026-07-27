import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Wallet,
  Bell,
  Menu,
  Download,
  Wifi,
  WifiOff,
  User,
  Sun,
  Moon,
  Sparkles,
  ChevronDown
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
  selectedCustomerId,
  setSelectedCustomerId,
  customersList,
  overviewData,
  setActiveTab,
  onOpenNotifications,
  onOpenMenu,
  isOffline,
  theme,
  toggleTheme,
  installPrompt,
  onInstallApp
}: MobileHeaderProps) {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const wallet = overviewData?.wallet;
  const currentCustomer = overviewData?.customer;

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/80 shadow-md">
      {/* Offline Status Bar */}
      {isOffline && (
        <div className="bg-amber-500/20 border-b border-amber-500/30 px-3 py-1 text-[11px] font-bold text-amber-300 flex items-center justify-center gap-1.5">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode — Displaying cached Quest Wallet & Profile</span>
        </div>
      )}

      <div className="px-3 py-2.5 flex items-center justify-between gap-2 max-w-7xl mx-auto">
        {/* Left: Brand Icon + Title */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className="flex items-center gap-2 text-left focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 p-0.5 shadow-md shadow-amber-500/20 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Trophy className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <div>
              <h1 className="font-extrabold text-sm text-white tracking-tight leading-tight flex items-center gap-1.5">
                <span>My Snack Quest</span>
                <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md text-[9px] font-black uppercase">
                  REWARDS
                </span>
              </h1>
              <p className="text-[10px] font-bold text-amber-400 leading-none flex items-center gap-1 mt-0.5">
                <span>{overviewData?.gamification?.level || 'Explorer'} Tier</span>
                <span className="text-slate-500">•</span>
                <span className="text-orange-400 flex items-center gap-0.5">🔥 5d Streak</span>
              </p>
            </div>
          </button>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5">
          {/* Quick Wallet Balance Pill */}
          {wallet && (
            <button
              onClick={() => setActiveTab('wallet')}
              className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 hover:border-amber-400 transition-all text-xs font-bold"
            >
              <Wallet className="w-3.5 h-3.5 text-amber-400" />
              <span>{(wallet.balance_kes || 0).toLocaleString()} <span className="text-[9px]">KES</span></span>
            </button>
          )}

          {/* PWA Install Button (if available) */}
          {installPrompt && (
            <button
              onClick={onInstallApp}
              className="p-2 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-all shadow-md shadow-amber-500/20 flex items-center gap-1 text-xs"
              title="Install Quest Center App"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install</span>
            </button>
          )}

          {/* Customer Persona Switcher Dropdown Button */}
          <div className="relative">
            <button
              onClick={() => setShowCustomerPicker(!showCustomerPicker)}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 text-xs"
              title="Switch Persona"
            >
              <User className="w-3.5 h-3.5 text-amber-400" />
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showCustomerPicker && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in duration-150">
                <span className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1 block border-b border-slate-800 mb-1">
                  Switch Customer Persona
                </span>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {customersList.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        setShowCustomerPicker(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                        c.id === selectedCustomerId
                          ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{c.full_name}</span>
                      <span className="text-[10px] text-slate-500">{c.county}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notifications Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700/80"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {overviewData?.notifications?.unread_count > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white font-bold text-[10px] rounded-full flex items-center justify-center animate-pulse">
                {overviewData.notifications.unread_count}
              </span>
            )}
          </button>

          {/* Slide-out Menu Trigger */}
          <button
            onClick={onOpenMenu}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700/80"
            title="Open Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
