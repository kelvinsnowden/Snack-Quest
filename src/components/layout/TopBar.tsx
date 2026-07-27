import React, { useState } from 'react';
import {
  Search,
  Activity,
  User,
  LogOut,
  ShieldAlert,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NotificationBell } from './NotificationBell';

export const TopBar: React.FC = () => {
  const { setCommandPaletteOpen, currentUser, currentRole, logout } = useApp();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <header className="h-14 border-b border-[#27272A] bg-[#09090B] sticky top-0 z-30 px-6 sm:px-8 flex items-center justify-between transition-colors">
      {/* Global Search trigger */}
      <div className="flex items-center gap-4 w-1/2 max-w-md">
        <div className="relative w-full">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="w-full bg-[#18181B] border border-[#27272A] py-1.5 pl-3 pr-3 rounded-md text-sm text-[#A1A1AA] hover:text-white flex justify-between items-center cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Search className="h-4 w-4 text-[#71717A]" />
              <span className="text-xs font-normal text-[#A1A1AA]">Search customers, orders, logs, or features...</span>
            </div>
            <kbd className="text-[10px] bg-[#27272A] px-1.5 py-0.5 rounded border border-[#3F3F46] text-[#A1A1AA] font-mono">
              ⌘ K
            </kbd>
          </button>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Live Health Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 bg-green-500/10 rounded-full border border-green-500/20">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">API Healthy</span>
        </div>

        {/* Notifications Bell */}
        <NotificationBell />

        {/* User Profile Menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 p-1 rounded-md hover:bg-[#18181B] transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-orange-400 to-pink-500 text-white font-bold flex items-center justify-center text-xs">
              {currentUser?.full_name?.charAt(0) || 'A'}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-medium text-white">{currentUser?.full_name}</p>
              <p className="text-[10px] text-[#71717A]">{currentRole?.name}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[#71717A]" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-[#18181B] border border-[#27272A] rounded-md shadow-xl z-50 p-1.5 animate-scale-up">
              <div className="p-2.5 border-b border-[#27272A]">
                <p className="text-xs font-bold text-white">{currentUser?.full_name}</p>
                <p className="text-[11px] text-[#71717A] truncate">{currentUser?.email}</p>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    alert(`Current Staff Role: ${currentRole?.name}\nRole Description: ${currentRole?.description}`);
                    setUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:text-white hover:bg-[#27272A] rounded-md cursor-pointer transition-colors"
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-blue-500" />
                  <span>My Permissions & Role</span>
                </button>
              </div>

              <div className="pt-1 border-t border-[#27272A]">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/40 rounded-md cursor-pointer transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
