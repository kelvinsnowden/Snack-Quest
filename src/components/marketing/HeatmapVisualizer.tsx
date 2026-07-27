import React, { useState, useEffect } from 'react';
import {
  Flame,
  MousePointer,
  BarChart2,
  Clock,
  Eye,
  ArrowDown,
  Layers,
  Sparkles,
  RefreshCw,
  Filter
} from 'lucide-react';

interface HeatmapData {
  landing_page_id: string;
  click_points: Array<{ x: number; y: number; target: string; tag: string }>;
  scroll_distribution: { pct_25: number; pct_50: number; pct_75: number; pct_90: number };
  top_ctas: Array<{ label: string; clicks: number; ctr_pct: number }>;
  avg_read_time_seconds: number;
}

export const HeatmapVisualizer: React.FC = () => {
  const [selectedLp, setSelectedLp] = useState<string>('lp_home_v1');
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'clicks' | 'scroll'>('clicks');

  const fetchHeatmap = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/marketing/heatmaps?landing_page_id=${selectedLp}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Failed to load heatmap data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeatmap();
  }, [selectedLp]);

  return (
    <div className="space-y-6">
      {/* Header & LP Switcher */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            Heatmap & Visual Engagement Analytics
          </h3>
          <p className="text-xs text-slate-500">
            Privacy-compliant click coordinate maps, scroll depth drop-offs, and section visibility read time
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={selectedLp}
            onChange={(e) => setSelectedLp(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="lp_home_v1">Main Gourmet Landing Page (lp_home_v1)</option>
            <option value="lp_creator_promo">Creator Exclusive Offer (lp_creator_promo)</option>
            <option value="lp_corporate_gifts">B2B Corporate Gifting (lp_corporate_gifts)</option>
          </select>

          <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-600">
            <button
              onClick={() => setViewMode('clicks')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'clicks' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
              }`}
            >
              Click Map
            </button>
            <button
              onClick={() => setViewMode('scroll')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'scroll' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
              }`}
            >
              Scroll Depth
            </button>
          </div>

          <button
            onClick={fetchHeatmap}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh Heatmap"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">
          Generating visual heatmap canvas...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Visual Heatmap / Scroll Overlay Canvas */}
          <div className="lg:col-span-2 bg-slate-900 rounded-2xl p-4 shadow-md border border-slate-800 text-white relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                SIMULATED PREVIEW CANVAS (390px Mobile Viewport)
              </div>
              <span className="text-xs text-amber-400 font-semibold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/50">
                {data?.click_points.length} Captured Interactions
              </span>
            </div>

            {/* Simulated Landing Page Mockup Frame */}
            <div className="relative mx-auto max-w-[390px] min-h-[580px] bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-6 text-slate-200 shadow-2xl">
              {/* Header Hero Mock */}
              <div id="hero-sec" className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 text-center space-y-2 relative">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded">
                  Gourmet Kenya
                </span>
                <h4 className="text-sm font-bold text-white">Experience Authentic East African Gourmet Treats</h4>
                <p className="text-[11px] text-slate-400">Handcrafted, sustainably sourced artisan snack boxes delivered nationwide.</p>
                <div className="pt-2">
                  <div className="inline-block px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-lg shadow-lg">
                    📲 Order on WhatsApp (KSh 3,500)
                  </div>
                </div>
              </div>

              {/* Creator Code Highlight */}
              <div className="p-3 bg-amber-900/20 border border-amber-800/40 rounded-xl text-center">
                <span className="text-xs text-amber-300 font-medium">✨ Apply Creator Code: </span>
                <span className="text-xs font-mono font-bold text-amber-400">GIFT20</span>
              </div>

              {/* Product Gallery Section */}
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-white">Featured Gourmet Snacks</div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                  <div className="p-2 bg-slate-800 rounded border border-slate-700">Chili Macadamias</div>
                  <div className="p-2 bg-slate-800 rounded border border-slate-700">Plantain Crisps</div>
                </div>
              </div>

              {/* Founder Story Section */}
              <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
                <div className="font-bold text-white">Our Founder Story</div>
                <p className="text-[10px]">Empowering smallholder Kenyan farmers through direct fair-trade gourmet exports.</p>
              </div>

              {/* CLICK MAP OVERLAY */}
              {viewMode === 'clicks' &&
                data?.click_points.map((pt, idx) => (
                  <div
                    key={idx}
                    style={{
                      left: `${Math.min(90, Math.max(10, (pt.x / 390) * 100))}%`,
                      top: `${Math.min(90, Math.max(5, (pt.y / 1400) * 100))}%`
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none group"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-500/80 via-rose-500/80 to-red-600/90 blur-xs animate-ping opacity-75" />
                    <div className="w-4 h-4 rounded-full bg-amber-400 border-2 border-white shadow-lg absolute inset-0 m-auto flex items-center justify-center text-[8px] font-bold text-slate-900">
                      •
                    </div>
                  </div>
                ))}

              {/* SCROLL OVERLAY */}
              {viewMode === 'scroll' && (
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between text-xs font-mono">
                  <div className="bg-emerald-500/20 border-b border-emerald-500/50 p-2 text-emerald-300 font-bold">
                    25% Scroll Reach: {data?.scroll_distribution.pct_25}% Visitors
                  </div>
                  <div className="bg-blue-500/20 border-b border-blue-500/50 p-2 text-blue-300 font-bold">
                    50% Scroll Reach: {data?.scroll_distribution.pct_50}% Visitors
                  </div>
                  <div className="bg-purple-500/20 border-b border-purple-500/50 p-2 text-purple-300 font-bold">
                    75% Scroll Reach: {data?.scroll_distribution.pct_75}% Visitors
                  </div>
                  <div className="bg-amber-500/20 p-2 text-amber-300 font-bold">
                    90% Scroll Reach: {data?.scroll_distribution.pct_90}% Visitors
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Side Analytics & Top CTAs */}
          <div className="space-y-6">
            {/* Scroll Depth Histogram Card */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ArrowDown className="w-4 h-4 text-emerald-600" />
                Scroll Depth Funnel
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>25% (Hero Section)</span>
                    <span className="text-emerald-600">{data?.scroll_distribution.pct_25}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${data?.scroll_distribution.pct_25}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>50% (Product Showcase)</span>
                    <span className="text-blue-600">{data?.scroll_distribution.pct_50}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${data?.scroll_distribution.pct_50}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>75% (Founder Story)</span>
                    <span className="text-purple-600">{data?.scroll_distribution.pct_75}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${data?.scroll_distribution.pct_75}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>90% (FAQ & Footer)</span>
                    <span className="text-amber-600">{data?.scroll_distribution.pct_90}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${data?.scroll_distribution.pct_90}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Read Time & Engagement Card */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">Average Read Time</div>
                <div className="text-2xl font-bold text-slate-900">{data?.avg_read_time_seconds || 142}s</div>
                <div className="text-xs text-emerald-600 font-medium mt-0.5">High Intent Benchmark (&gt;90s)</div>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600 border border-amber-100">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            {/* Top Clicked CTAs Table */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-amber-500" />
                Most Clicked Elements
              </h4>

              <div className="divide-y divide-slate-100">
                {data?.top_ctas.map((cta, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-800">{cta.label}</div>
                      <div className="text-[11px] text-slate-400">{cta.clicks} verified clicks</div>
                    </div>
                    <span className="font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                      {cta.ctr_pct}% CTR
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
