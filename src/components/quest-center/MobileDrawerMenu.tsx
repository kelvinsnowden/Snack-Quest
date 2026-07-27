import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Trophy,
  Clock,
  Wallet,
  Gift,
  Users,
  History,
  User,
  Bell,
  Download,
  QrCode,
  ShieldCheck,
  Moon,
  Sun,
  Smartphone,
  ChevronRight,
  Wifi,
  WifiOff,
  CheckCircle2,
  Share2
} from 'lucide-react';
import { QuestTab } from './QuestCenterContainer';

interface MobileDrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: QuestTab;
  setActiveTab: (tab: QuestTab) => void;
  overviewData: any;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  installPrompt: any;
  onInstallApp: () => void;
  onOpenQRCode: () => void;
  pushEnabled: boolean;
  onTogglePush: () => void;
  isOffline: boolean;
}

export default function MobileDrawerMenu({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  overviewData,
  theme,
  toggleTheme,
  installPrompt,
  onInstallApp,
  onOpenQRCode,
  pushEnabled,
  onTogglePush,
  isOffline
}: MobileDrawerMenuProps) {
  if (!isOpen) return null;

  const menuItems = [
    { id: 'overview' as QuestTab, label: 'Home Dashboard', icon: Sparkles },
    { id: 'quests' as QuestTab, label: 'Available Quests', icon: Trophy, badge: 'Daily' },
    { id: 'rewards' as QuestTab, label: 'Rewards & Wallet', icon: Wallet, highlight: true },
    { id: 'profile' as QuestTab, label: 'My Profile & Taste Preferences', icon: User }
  ];

  const cust = overviewData?.customer;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Quest Menu</h3>
              <p className="text-xs text-amber-400 font-semibold">{cust?.full_name || 'Customer Portal'}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Main Quest Nav Links */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 block mb-1">
              Navigation
            </span>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md shadow-amber-500/20'
                      : item.highlight
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : item.highlight ? 'text-amber-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge ? (
                    <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase rounded bg-red-500 text-white">
                      {item.badge}
                    </span>
                  ) : (
                    <ChevronRight className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-600'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Device & PWA Utility Section */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
              PWA & Native Features
            </span>

            {/* QR Code Scanner / Share */}
            <button
              onClick={() => {
                onOpenQRCode();
                onClose();
              }}
              className="w-full p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl text-xs font-bold flex items-center justify-between transition-all"
            >
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-amber-400" />
                <span>QR Code Referral & Scan</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {/* PWA Install Button */}
            <button
              onClick={onInstallApp}
              disabled={!installPrompt}
              className={`w-full p-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all border ${
                installPrompt
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-amber-500 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                <span>{installPrompt ? 'Install App to Home Screen' : 'App Installed / Supported'}</span>
              </div>
              {installPrompt && <span className="text-[10px] font-extrabold bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded">NEW</span>}
            </button>

            {/* Push Notifications Toggle */}
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="font-bold text-slate-200 block leading-tight">Push Notifications</span>
                  <span className="text-[10px] text-slate-400">Quest approvals & credits</span>
                </div>
              </div>

              <button
                onClick={onTogglePush}
                className={`w-11 h-6 rounded-full transition-all relative ${
                  pushEnabled ? 'bg-amber-500' : 'bg-slate-800 border border-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-slate-950 transition-all absolute top-1 ${
                    pushEnabled ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Offline Status */}
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {isOffline ? <WifiOff className="w-4 h-4 text-red-400" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
                <div>
                  <span className="font-bold text-slate-200 block leading-tight">Network Status</span>
                  <span className="text-[10px] text-slate-400">{isOffline ? 'Offline Mode (Cached)' : 'Online & Synchronized'}</span>
                </div>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full ${isOffline ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`} />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-full p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl text-xs font-bold flex items-center justify-between transition-all"
            >
              <div className="flex items-center gap-2">
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                <span>Appearance Theme</span>
              </div>
              <span className="text-[10px] uppercase text-slate-400 font-bold">{theme}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
