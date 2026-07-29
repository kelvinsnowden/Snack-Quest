import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Trophy,
  Wallet,
  User,
  Bell,
  Download,
  QrCode,
  Moon,
  Sun,
  ChevronRight,
  Wifi,
  WifiOff,
  UserCheck
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
  selectedCustomerId?: string;
  setSelectedCustomerId?: (id: string) => void;
  customersList?: any[];
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
  isOffline,
  selectedCustomerId,
  setSelectedCustomerId,
  customersList = []
}: MobileDrawerMenuProps) {
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);

  if (!isOpen) return null;

  const menuItems = [
    { id: 'overview' as QuestTab, label: 'Creator Dashboard', icon: Sparkles },
    { id: 'quests' as QuestTab, label: 'Available Quests', icon: Trophy, badge: 'Active' },
    { id: 'affiliate_wallet' as QuestTab, label: 'Cash Wallet & Ledger', icon: Wallet, highlight: true },
    { id: 'profile' as QuestTab, label: 'Profile & Settings', icon: User }
  ];

  const cust = overviewData?.customer;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xs bg-zinc-950 border-l border-zinc-800/80 h-full flex flex-col shadow-2xl relative overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm tracking-tight">Navigation Menu</h3>
              <p className="text-[11px] text-zinc-400 font-medium">{cust?.full_name || 'Creator Portal'}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Main Quest Nav Links */}
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 px-3 block mb-1.5">
              Portal Views
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
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md shadow-amber-500/10'
                      : item.highlight
                      ? 'bg-zinc-900 text-emerald-400 border border-zinc-800 hover:bg-zinc-800'
                      : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : item.highlight ? 'text-emerald-400' : 'text-zinc-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge ? (
                    <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.badge}
                    </span>
                  ) : (
                    <ChevronRight className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-zinc-600'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Customer Persona Switcher Section (Developer & Tester Utility) */}
          {customersList && customersList.length > 0 && setSelectedCustomerId && (
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" /> Switch Persona
                </span>
                <button
                  onClick={() => setShowPersonaPicker(!showPersonaPicker)}
                  className="text-[10px] text-amber-400 font-semibold cursor-pointer"
                >
                  {showPersonaPicker ? 'Hide' : 'Change'}
                </button>
              </div>

              {showPersonaPicker && (
                <div className="space-y-1 pt-1 max-h-40 overflow-y-auto">
                  {customersList.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        setShowPersonaPicker(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center justify-between cursor-pointer ${
                        c.id === selectedCustomerId
                          ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{c.full_name}</span>
                      <span className="text-[10px] font-mono text-zinc-500">{c.county}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Device & PWA Utility Section */}
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3 space-y-2.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block mb-1">
              App Controls
            </span>

            {/* QR Code Scanner / Share */}
            <button
              onClick={() => {
                onOpenQRCode();
                onClose();
              }}
              className="w-full p-2.5 bg-zinc-950 hover:bg-zinc-900 text-zinc-200 border border-zinc-800/80 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <QrCode className="w-4 h-4 text-amber-400" />
                <span>QR Referral Code</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
            </button>

            {/* PWA Install Button */}
            {installPrompt && (
              <button
                onClick={onInstallApp}
                className="w-full p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all border bg-amber-500 text-slate-950 border-amber-400 shadow-md cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  <span>Install App</span>
                </div>
                <span className="text-[9px] font-mono font-black bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded">PWA</span>
              </button>
            )}

            {/* Push Notifications Toggle */}
            <div className="p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4 text-zinc-400" />
                <div>
                  <span className="font-semibold text-zinc-200 block leading-tight">Notifications</span>
                  <span className="text-[10px] text-zinc-500 font-medium">Credits & approvals</span>
                </div>
              </div>

              <button
                onClick={onTogglePush}
                className={`w-9 h-5 rounded-full transition-all relative cursor-pointer ${
                  pushEnabled ? 'bg-amber-500' : 'bg-zinc-800'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-slate-950 transition-all absolute top-0.75 ${
                    pushEnabled ? 'right-0.75' : 'left-0.75'
                  }`}
                />
              </button>
            </div>

            {/* Network Status */}
            <div className="p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                {isOffline ? <WifiOff className="w-4 h-4 text-rose-400" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
                <div>
                  <span className="font-semibold text-zinc-200 block leading-tight">Status</span>
                  <span className="text-[10px] text-zinc-500 font-medium">{isOffline ? 'Offline Mode' : 'Online'}</span>
                </div>
              </div>
              <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            </div>

            {/* Appearance Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-full p-2.5 bg-zinc-950 hover:bg-zinc-900 text-zinc-200 border border-zinc-800/80 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                <span>Theme</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase">{theme}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
