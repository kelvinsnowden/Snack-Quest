import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  Webhook,
  FileSpreadsheet,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Package,
  Boxes,
  Truck,
  Gift,
  Wallet,
  Share2,
  TrendingUp,
  DollarSign,
  CreditCard,
  Layers,
  Sparkles,
  Search,
  Activity,
  Building2,
  Globe
} from 'lucide-react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const { activeTab, setActiveTab, theme, toggleTheme, currentUser, currentRole, checkPermission, setCommandPaletteOpen } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  const mainNavItems = [
    { id: 'quest_center', label: 'Customer Quest Center', icon: Sparkles, module: 'rewards' },
    { id: 'dashboard', label: 'Dashboard Control', icon: LayoutDashboard, module: 'dashboard' },
    { id: 'crm', label: 'Customer CRM', icon: Users, module: 'crm' },
    { id: 'orders', label: 'Order Processing', icon: Package, module: 'orders' },
    { id: 'inventory', label: 'Inventory & Snacks', icon: Boxes, module: 'inventory' },
    { id: 'deliveries', label: 'Delivery Dispatch', icon: Truck, module: 'deliveries' },
    { id: 'accounting', label: 'Accounting & P&L', icon: DollarSign, module: 'accounting' },
    { id: 'payments', label: 'Payment Operations', icon: CreditCard, module: 'accounting' },
    { id: 'rewards', label: 'Quest Rewards', icon: Gift, module: 'rewards' },
    { id: 'wallet', label: 'Quest Wallet Ledger', icon: Wallet, module: 'wallet' },
    { id: 'referrals', label: 'Referral Engine', icon: Share2, module: 'referrals' },
    { id: 'marketing', label: 'Marketing & Attribution', icon: TrendingUp, module: 'marketing' },
    { id: 'integrations', label: 'Integration Management', icon: Webhook, module: 'integrations' },
    { id: 'api_monitoring', label: 'API & System Health', icon: Activity, module: 'api_monitoring' },
    { id: 'reporting', label: 'Scheduled Reporting', icon: FileSpreadsheet, module: 'reporting' },
    { id: 'domain_manager', label: 'Domain & URL Manager', icon: Globe, module: 'business_settings' },
    { id: 'business_settings', label: 'Business & Flags', icon: Building2, module: 'business_settings' },
    { id: 'roles', label: 'Staff & Security Roles', icon: ShieldCheck, module: 'settings' },
    { id: 'staff', label: 'Staff Users Directory', icon: Users, module: 'settings' },
    { id: 'audit', label: 'System Audit Logs', icon: FileSpreadsheet, module: 'audit' },
  ];

  // Scaffolding navigation items for Prompt 4
  const upcomingNavItems: any[] = [];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 lg:hidden animate-in fade-in duration-200"
        />
      )}

      <aside
        className={`bg-[#09090B] border-r border-[#27272A] text-[#FAFAFA] flex flex-col select-none transition-all duration-300 ${
          mobileOpen
            ? 'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-full shadow-2xl flex lg:hidden'
            : 'hidden lg:flex h-screen sticky top-0 z-40'
        } ${collapsed ? 'lg:w-16' : 'lg:w-64'}`}
      >
        {/* Brand Header */}
        <div className="p-4 sm:p-6 border-b border-[#27272A] flex items-center justify-between">
          {(!collapsed || mobileOpen) && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-md shadow-blue-600/20">
                SQ
              </div>
              <div>
                <h1 className="font-semibold tracking-tight text-base sm:text-lg text-white flex items-center gap-2">
                  Snack Quest OS
                </h1>
              </div>
            </div>
          )}
          {collapsed && !mobileOpen && (
            <div className="w-8 h-8 mx-auto rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
              SQ
            </div>
          )}
          <button
            onClick={() => {
              if (mobileOpen && onCloseMobile) {
                onCloseMobile();
              } else {
                setCollapsed(!collapsed);
              }
            }}
            className="p-1.5 rounded-md text-[#71717A] hover:text-white hover:bg-[#18181B] transition-colors cursor-pointer"
            title={mobileOpen ? 'Close sidebar' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {mobileOpen ? <X className="h-5 w-5 text-zinc-400" /> : collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Quick Search Trigger */}
        <div className="p-3 border-b border-[#27272A]">
          <button
            onClick={() => {
              setCommandPaletteOpen(true);
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md bg-[#18181B] hover:bg-[#27272A] text-[#A1A1AA] hover:text-white text-xs border border-[#27272A] cursor-pointer transition-colors ${
              collapsed && !mobileOpen ? 'justify-center px-2' : ''
            }`}
          >
            <Search className="h-3.5 w-3.5 text-[#71717A]" />
            {(!collapsed || mobileOpen) && (
              <>
                <span className="flex-1 text-left">Search platform...</span>
                <kbd className="px-1.5 py-0.5 text-[10px] bg-[#27272A] border border-[#3F3F46] rounded text-[#A1A1AA]">⌘K</kbd>
              </>
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-6">
          {/* Platform Live Modules */}
          <div>
            {(!collapsed || mobileOpen) && (
              <div className="px-3 py-2 text-xs font-semibold text-[#71717A] uppercase tracking-wider">
                Platform Modules
              </div>
            )}
            <nav className="space-y-1">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const canView = checkPermission(item.module, 'view');

                if (!canView) return null;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    title={collapsed && !mobileOpen ? item.label : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#18181B] text-white border border-[#27272A]'
                        : 'text-[#A1A1AA] hover:text-white hover:bg-[#18181B]/50'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-500' : 'text-[#71717A]'}`} />
                    {(!collapsed || mobileOpen) && <span>{item.label}</span>}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Future Modules */}
          <div>
            {(!collapsed || mobileOpen) && (
              <div className="px-3 py-2 text-xs font-semibold text-[#71717A] uppercase tracking-wider flex items-center justify-between">
                <span>Next Phases</span>
                <Sparkles className="h-3 w-3 text-blue-500/70" />
              </div>
            )}
            <nav className="space-y-1">
              {upcomingNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    title={collapsed && !mobileOpen ? `${item.label} (${item.prompt})` : undefined}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-[#71717A] opacity-50 cursor-not-allowed select-none"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      {(!collapsed || mobileOpen) && <span>{item.label}</span>}
                    </div>
                    {(!collapsed || mobileOpen) && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 bg-[#18181B] text-[#71717A] rounded border border-[#27272A]">
                        {item.prompt}
                      </span>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>

        {/* User Footer & Theme Toggle */}
        <div className="p-4 border-t border-[#27272A] flex items-center justify-between gap-3 bg-[#09090B]">
          {(!collapsed || mobileOpen) && currentUser && (
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-400 to-pink-500 shrink-0 flex items-center justify-center text-xs font-bold text-white">
                {currentUser.full_name?.charAt(0) || 'A'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-medium truncate text-white">{currentUser.email}</p>
                <p className="text-[10px] text-[#71717A] truncate font-mono">{currentRole?.name || 'Staff User'}</p>
              </div>
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-[#71717A] hover:text-white hover:bg-[#18181B] transition-colors cursor-pointer"
            title={`Switch Theme`}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-[#A1A1AA]" />}
          </button>
        </div>
      </aside>
    </>
  );
};
