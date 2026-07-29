import React, { useState } from 'react';
import { Terminal, Shield, CheckCircle2, Copy, Zap, Server, Code, Globe, Lock, ArrowRight } from 'lucide-react';
import { setDevPortalOverride } from '../../lib/domainResolver';

export const ApiGatewayPortal: React.FC = () => {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const apiEndpoints = [
    { method: 'POST', path: '/api/v1/auth/login', desc: 'Authenticate staff user & issue session token', auth: 'Public' },
    { method: 'GET', path: '/api/v1/auth/me', desc: 'Fetch current authenticated user profile & permissions', auth: 'Session' },
    { method: 'GET', path: '/api/v1/orders', desc: 'List customer snack box orders with filters', auth: 'Staff' },
    { method: 'POST', path: '/api/v1/orders/public-checkout', desc: 'Public checkout endpoint for box purchase & STK push', auth: 'Public' },
    { method: 'POST', path: '/api/v1/creator-auth/register', desc: 'Register new creator with WhatsApp OTP dispatch', auth: 'Public' },
    { method: 'POST', path: '/api/v1/creator-auth/verify-otp', desc: 'Verify creator WhatsApp OTP code', auth: 'Public' },
    { method: 'POST', path: '/api/v1/creator-auth/withdraw', desc: 'Initiate instant M-Pesa B2C payout for creator', auth: 'Creator' },
    { method: 'GET', path: '/api/v1/domains/config', desc: 'Retrieve multi-subdomain runtime configuration', auth: 'Public' },
    { method: 'GET', path: '/api/v1/health', desc: 'System microservices health check endpoint', auth: 'Public' }
  ];

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(`https://api.snackquest.shop${path}`);
    setCopiedEndpoint(path);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-sans antialiased p-6 md:p-12 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#27272A] pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 text-black flex items-center justify-center font-bold text-base shadow-lg">
            <Terminal className="h-5 w-5 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">api.snackquest.shop</h1>
            <p className="text-xs text-zinc-400">Enterprise REST API Gateway & Microservices Documentation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>API v1 Operational (100% Uptime)</span>
          </span>
        </div>
      </div>

      {/* Production Specs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-5 bg-[#18181B] border border-[#27272A] rounded-2xl space-y-2">
          <span className="text-zinc-400 font-medium block">API Base Endpoint</span>
          <code className="text-emerald-400 font-mono text-sm block">https://api.snackquest.shop</code>
        </div>
        <div className="p-5 bg-[#18181B] border border-[#27272A] rounded-2xl space-y-2">
          <span className="text-zinc-400 font-medium block">Rate Limiting</span>
          <span className="text-white font-bold block">10,000 req/min per IP</span>
        </div>
        <div className="p-5 bg-[#18181B] border border-[#27272A] rounded-2xl space-y-2">
          <span className="text-zinc-400 font-medium block">Cross-Domain CORS</span>
          <span className="text-purple-400 font-bold block">*.snackquest.shop Enabled</span>
        </div>
      </div>

      {/* API Endpoint Inventory Table */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Code className="h-4 w-4 text-amber-400" />
          <span>Core REST API Endpoint Inventory</span>
        </h2>

        <div className="bg-[#18181B] border border-[#27272A] rounded-2xl overflow-hidden shadow-xl">
          <div className="divide-y divide-[#27272A]">
            {apiEndpoints.map((ep, idx) => (
              <div key={idx} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs hover:bg-[#27272A]/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-md font-mono text-[10px] font-bold ${
                      ep.method === 'GET' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <code className="text-white font-mono font-semibold">{ep.path}</code>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-zinc-400 text-[11px] hidden lg:inline">{ep.desc}</span>
                  <span className="px-2 py-0.5 bg-[#09090B] border border-[#27272A] text-zinc-400 rounded text-[10px]">
                    {ep.auth}
                  </span>
                  <button
                    onClick={() => handleCopy(ep.path)}
                    className="p-1.5 bg-[#09090B] hover:bg-[#27272A] text-zinc-300 rounded border border-[#27272A] cursor-pointer"
                    title="Copy Full URL"
                  >
                    {copiedEndpoint === ep.path ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Return to Web UI */}
      <div className="pt-6 border-t border-[#27272A] flex justify-between items-center text-xs text-zinc-400">
        <span>Snack Quest OpenAPI Spec v2.4</span>
        <button
          onClick={() => setDevPortalOverride('admin')}
          className="text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
        >
          <span>Open Admin Operating System →</span>
        </button>
      </div>
    </div>
  );
};
