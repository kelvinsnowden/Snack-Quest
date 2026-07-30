import React from 'react';
import { Globe, Shield, Sparkles, ShoppingBag, Terminal, CheckCircle2, RefreshCw } from 'lucide-react';
import { resolvePortal, setDevPortalOverride, clearDevPortalOverride, PortalType, PORTAL_METADATA } from '../../lib/domainResolver';

export const PortalSwitcherBar: React.FC = () => {
  const portalInfo = resolvePortal();

  const isDevOrPreview =
    portalInfo.detectedHostname.includes('localhost') ||
    portalInfo.detectedHostname.includes('127.0.0.1') ||
    portalInfo.detectedHostname.includes('run.app') ||
    portalInfo.isOverride;

  if (!isDevOrPreview) {
    return null; // Don't show toolbar in true production DNS routing
  }

  return (
    <div className="bg-[#121214] border-b border-[#27272A] px-4 py-2 text-xs text-zinc-300 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50 font-sans shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-semibold text-white tracking-tight">MULTI-PORTAL SIMULATOR</span>
        <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
          Detected Host: [{portalInfo.detectedHostname}]
        </span>
      </div>

      {/* Subdomain Switcher Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
        <button
          onClick={() => setDevPortalOverride('public')}
          className={`px-2.5 py-1 rounded-md font-medium text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
            portalInfo.type === 'public'
              ? 'bg-blue-600 text-white font-bold shadow-sm'
              : 'bg-[#18181B] hover:bg-[#27272A] text-zinc-400 hover:text-white border border-[#27272A]'
          }`}
          title="www.snackquests.shop"
        >
          <ShoppingBag className="h-3 w-3" />
          <span>www.snackquests.shop</span>
        </button>

        <button
          onClick={() => setDevPortalOverride('quest')}
          className={`px-2.5 py-1 rounded-md font-medium text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
            portalInfo.type === 'quest'
              ? 'bg-purple-600 text-white font-bold shadow-sm'
              : 'bg-[#18181B] hover:bg-[#27272A] text-zinc-400 hover:text-white border border-[#27272A]'
          }`}
          title="quest.snackquests.shop"
        >
          <Sparkles className="h-3 w-3" />
          <span>quest.snackquests.shop</span>
        </button>

        <button
          onClick={() => setDevPortalOverride('creators')}
          className={`px-2.5 py-1 rounded-md font-medium text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
            portalInfo.type === 'creators'
              ? 'bg-amber-500 text-black font-bold shadow-sm'
              : 'bg-[#18181B] hover:bg-[#27272A] text-zinc-400 hover:text-white border border-[#27272A]'
          }`}
          title="creators.snackquests.shop"
        >
          <Globe className="h-3 w-3" />
          <span>creators.snackquests.shop</span>
        </button>

        <button
          onClick={() => setDevPortalOverride('admin')}
          className={`px-2.5 py-1 rounded-md font-medium text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
            portalInfo.type === 'admin'
              ? 'bg-emerald-600 text-white font-bold shadow-sm'
              : 'bg-[#18181B] hover:bg-[#27272A] text-zinc-400 hover:text-white border border-[#27272A]'
          }`}
          title="admin.snackquests.shop"
        >
          <Shield className="h-3 w-3" />
          <span>admin.snackquests.shop</span>
        </button>

        <button
          onClick={() => setDevPortalOverride('api')}
          className={`px-2.5 py-1 rounded-md font-medium text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
            portalInfo.type === 'api'
              ? 'bg-zinc-100 text-black font-bold shadow-sm'
              : 'bg-[#18181B] hover:bg-[#27272A] text-zinc-400 hover:text-white border border-[#27272A]'
          }`}
          title="api.snackquests.shop"
        >
          <Terminal className="h-3 w-3" />
          <span>api.snackquests.shop</span>
        </button>

        {portalInfo.isOverride && (
          <button
            onClick={clearDevPortalOverride}
            className="px-2 py-1 text-[10px] text-rose-400 hover:text-rose-300 font-mono underline ml-1 cursor-pointer"
            title="Reset to natural hostname detection"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
};
