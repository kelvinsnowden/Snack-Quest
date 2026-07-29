import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Target,
  Globe,
  Tag,
  ShieldAlert,
  Users,
  Search,
  Plus,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Play,
  Send,
  FileText,
  Database,
  ShieldCheck,
  Layers,
  Lock,
  Settings,
  Zap,
  BarChart3,
  Smartphone,
  MessageSquare,
  DollarSign,
  Megaphone
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  AdPlatformConfig,
  MarketingEventRecord,
  FunnelStageMetric,
  AudienceSegment,
  ProductionAuditReport
} from '../../types/attribution';
import { LandingPageManager } from './LandingPageManager';
import { HeatmapVisualizer } from './HeatmapVisualizer';
import { SessionJourneyExplorer } from './SessionJourneyExplorer';
import { AdminCampaignCenter } from './AdminCampaignCenter';

export const MarketingDashboard: React.FC = () => {
  const { checkPermission, currentUser, addToast } = useApp();
  const canView = checkPermission('marketing', 'view');
  const canEdit = checkPermission('marketing', 'edit');

  const [activeTab, setActiveTab] = useState<
    'roas' | 'landing_pages' | 'heatmaps' | 'journey_explorer' | 'platforms' | 'funnel' | 'ops' | 'audiences' | 'testing' | 'creator_campaigns' | 'audit'
  >('creator_campaigns');

  const [loading, setLoading] = useState<boolean>(true);

  // Data States
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<AdPlatformConfig[]>([]);
  const [funnelMetrics, setFunnelMetrics] = useState<FunnelStageMetric[]>([]);
  const [eventsStream, setEventsStream] = useState<MarketingEventRecord[]>([]);
  const [audienceSegments, setAudienceSegments] = useState<AudienceSegment[]>([]);
  const [auditReport, setAuditReport] = useState<ProductionAuditReport | null>(null);

  // Testing & Config States
  const [selectedPlatformConfig, setSelectedPlatformConfig] = useState<AdPlatformConfig | null>(null);
  const [testPlatform, setTestPlatform] = useState<'meta_pixel' | 'meta_capi' | 'ga4' | 'tiktok'>('meta_capi');
  const [testEventName, setTestEventName] = useState<string>('Purchase');
  const [testValueKes, setTestValueKes] = useState<number>(2500);
  const [testResponse, setTestResponse] = useState<any>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  // Platform Edit Form Modal State
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editConfigForm, setEditConfigForm] = useState<Partial<AdPlatformConfig>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [campRes, platRes, funRes, evtRes, audRes, rptRes] = await Promise.all([
        fetch('/api/v1/marketing/campaigns').then((r) => r.json()),
        fetch('/api/v1/marketing/platforms').then((r) => r.json()),
        fetch('/api/v1/marketing/funnel').then((r) => r.json()),
        fetch('/api/v1/marketing/events').then((r) => r.json()),
        fetch('/api/v1/marketing/audiences').then((r) => r.json()),
        fetch('/api/v1/marketing/audit-report').then((r) => r.json())
      ]);

      setCampaigns(campRes.data || []);
      setPlatforms(platRes.data || []);
      setFunnelMetrics(funRes.data || []);
      setEventsStream(evtRes.data || []);
      setAudienceSegments(audRes.data || []);
      setAuditReport(rptRes.data || null);
    } catch (e) {
      console.error('Failed to load marketing dashboard data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update Platform Configuration
  const handleSavePlatformConfig = async () => {
    if (!selectedPlatformConfig) return;
    try {
      const res = await fetch(`/api/v1/marketing/platforms/${selectedPlatformConfig.platform}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editConfigForm)
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Config Updated', message: `${selectedPlatformConfig.name} configuration saved.` });
        setEditModalOpen(false);
        loadData();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Save Failed', message: 'Could not update platform configuration.' });
    }
  };

  // Trigger Interactive Integration Test Event
  const handleRunTestEvent = async () => {
    setIsTesting(true);
    setTestResponse(null);
    try {
      const res = await fetch('/api/v1/marketing/test-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: testPlatform,
          event_name: testEventName,
          value_kes: testValueKes
        })
      });
      const data = await res.json();
      setTestResponse(data);
      addToast({ type: 'success', title: 'Test Fired', message: `Test ${testEventName} sent to ${testPlatform}.` });
      loadData();
    } catch (e) {
      addToast({ type: 'error', title: 'Test Error', message: 'Failed to dispatch test event.' });
    } finally {
      setIsTesting(false);
    }
  };

  // Replay Failed Event
  const handleReplayEvent = async (eventId: string) => {
    try {
      const res = await fetch('/api/v1/marketing/events/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Event Replayed', message: `Event ${eventId} replayed successfully.` });
        loadData();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Replay Failed', message: 'Could not replay event.' });
    }
  };

  if (!canView) {
    return (
      <div className="p-8 text-center text-[#A1A1AA]">
        <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white">Access Restricted</h2>
        <p className="text-sm mt-1">You do not have permissions to view Marketing Intelligence.</p>
      </div>
    );
  }

  // Summary Metrics
  const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
  const totalAdCost = campaigns.reduce((s, c) => s + (c.ad_cost || 0), 0);
  const overallRoas = totalAdCost > 0 ? (totalRevenue / totalAdCost).toFixed(2) : '0.00';
  const totalOrders = campaigns.reduce((s, c) => s + (c.orders || 0), 0);
  const overallCac = totalOrders > 0 ? Math.round(totalAdCost / totalOrders) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Stage 7 Production Audit
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Score: {auditReport?.production_readiness_score || 100}%
            </span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-amber-500" /> Attribution & Growth Engine Audit
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            End-to-end Meta CAPI, Meta Pixel, GA4, TikTok Events API, WhatsApp attribution, SHA256 Advanced Matching & Deduplication.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-slate-200 border border-slate-800 hover:bg-slate-800 transition-all self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Engine</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-800 gap-2 pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('creator_campaigns')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'creator_campaigns'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          <span>Creator Campaign Center</span>
        </button>

        <button
          onClick={() => setActiveTab('landing_pages')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'landing_pages'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Landing Page SDK Registry</span>
        </button>

        <button
          onClick={() => setActiveTab('heatmaps')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'heatmaps'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Heatmaps & Click Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab('journey_explorer')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'journey_explorer'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Visitor Journey Explorer</span>
        </button>

        <button
          onClick={() => setActiveTab('roas')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'roas'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>ROAS & Ad Campaigns</span>
        </button>

        <button
          onClick={() => setActiveTab('platforms')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'platforms'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Meta Pixel / CAPI / GA4 / TikTok ({platforms.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('funnel')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'funnel'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>11-Stage Journey & WhatsApp</span>
        </button>

        <button
          onClick={() => setActiveTab('ops')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'ops'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Event Stream & Deduplication ({eventsStream.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audiences')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'audiences'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Audience Segments ({audienceSegments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('testing')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'testing'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Integration Test Console</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeTab === 'audit'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Audit Report</span>
        </button>
      </div>

      {/* Creator Campaign Management Center */}
      {activeTab === 'creator_campaigns' && <AdminCampaignCenter />}

      {/* Phase 8: Landing Page SDK Registry View */}
      {activeTab === 'landing_pages' && <LandingPageManager />}

      {/* Phase 8: Heatmaps & Click Analytics View */}
      {activeTab === 'heatmaps' && <HeatmapVisualizer />}

      {/* Phase 8: Visitor Journey Explorer View */}
      {activeTab === 'journey_explorer' && <SessionJourneyExplorer />}

      {/* 1. ROAS & Ad Performance Dashboard */}
      {activeTab === 'roas' && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Blended ROAS</span>
              <div className="text-2xl font-black text-amber-400 mt-1">{overallRoas}x</div>
              <p className="text-[10px] text-slate-400 mt-0.5">Revenue / Total Advertising Spend</p>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Blended CAC</span>
              <div className="text-2xl font-black text-emerald-400 mt-1">KSh {(overallCac || 0).toLocaleString()}</div>
              <p className="text-[10px] text-slate-400 mt-0.5">Cost per Acquired Customer</p>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attributed Revenue</span>
              <div className="text-2xl font-black text-white mt-1">KSh {(totalRevenue || 0).toLocaleString()}</div>
              <p className="text-[10px] text-slate-400 mt-0.5">Verified M-Pesa Order Purchases</p>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Ad Spend</span>
              <div className="text-2xl font-black text-red-400 mt-1">KSh {(totalAdCost || 0).toLocaleString()}</div>
              <p className="text-[10px] text-slate-400 mt-0.5">Meta + TikTok + Google Ads</p>
            </div>
          </div>

          {/* Campaigns Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-400" />
                Active Advertising Campaign Attribution
              </h3>
              <span className="text-[11px] font-bold text-slate-400">First-Touch vs Last-Touch Session Engine</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-black border-b border-slate-800 text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Ad Platform / Source</th>
                    <th className="p-3.5">UTM Campaign</th>
                    <th className="p-3.5 text-right">Orders Generated</th>
                    <th className="p-3.5 text-right">Ad Spend (KES)</th>
                    <th className="p-3.5 text-right">Attributed Revenue (KES)</th>
                    <th className="p-3.5 text-right">ROAS</th>
                    <th className="p-3.5 text-right">CAC (KES)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {campaigns.map((c, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-bold text-amber-400 flex items-center gap-1.5 uppercase">
                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                        {c.utm_source}
                      </td>
                      <td className="p-3.5 font-mono text-slate-300">{c.utm_campaign}</td>
                      <td className="p-3.5 text-right font-bold text-white">{c.orders}</td>
                      <td className="p-3.5 text-right font-mono text-slate-300">KSh {(c.ad_cost || 0).toLocaleString()}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400">
                        KSh {(c.revenue || 0).toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          c.roas >= 3 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {c.roas}x
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-300">KSh {(c.cac || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                        No active campaigns tracked yet. Fire test events in Integration Console.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Platform Management Center */}
      {activeTab === 'platforms' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {platforms.map((p) => (
              <div key={p.platform} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl relative">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-white text-base">{p.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        p.status === 'healthy'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Environment: <span className="font-bold text-amber-400 uppercase">{p.environment}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedPlatformConfig(p);
                      setEditConfigForm(p);
                      setEditModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all flex items-center gap-1"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Configure</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Pixel / App ID</span>
                    <p className="font-mono text-slate-200 truncate">{p.pixel_id || p.measurement_id || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Events Sent</span>
                    <p className="font-mono text-emerald-400 font-bold">{p.total_events_sent}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Match Score</span>
                    <p className="font-mono text-amber-400 font-bold">{p.match_quality_score}%</p>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Last Event: {p.last_successful_event_at ? new Date(p.last_successful_event_at).toLocaleTimeString() : 'Never'}</span>
                  <span>Test Code: <strong className="font-mono text-slate-200">{p.test_event_code || 'None'}</strong></span>
                </div>
              </div>
            ))}
          </div>

          {/* Edit Modal */}
          {editModalOpen && selectedPlatformConfig && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h3 className="text-base font-extrabold text-white">Configure {selectedPlatformConfig.name}</h3>
                  <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-white font-black text-sm">✕</button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Environment</label>
                    <select
                      value={editConfigForm.environment}
                      onChange={(e) => setEditConfigForm({ ...editConfigForm, environment: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-bold"
                    >
                      <option value="sandbox">Sandbox (Testing)</option>
                      <option value="production">Production (Live Tracking)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Pixel ID / Measurement ID</label>
                    <input
                      type="text"
                      value={editConfigForm.pixel_id || editConfigForm.measurement_id || ''}
                      onChange={(e) => setEditConfigForm({ ...editConfigForm, pixel_id: e.target.value, measurement_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Access Token / API Secret</label>
                    <input
                      type="password"
                      value={editConfigForm.access_token || editConfigForm.api_secret || ''}
                      onChange={(e) => setEditConfigForm({ ...editConfigForm, access_token: e.target.value, api_secret: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-mono"
                      placeholder="••••••••••••••••••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Test Event Code (Optional)</label>
                    <input
                      type="text"
                      value={editConfigForm.test_event_code || ''}
                      onChange={(e) => setEditConfigForm({ ...editConfigForm, test_event_code: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-mono"
                      placeholder="e.g. TEST77812"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="is_enabled"
                      checked={editConfigForm.is_enabled ?? true}
                      onChange={(e) => setEditConfigForm({ ...editConfigForm, is_enabled: e.target.checked })}
                      className="rounded border-slate-800 bg-slate-950"
                    />
                    <label htmlFor="is_enabled" className="text-slate-200 font-bold">Enable Real-Time Server Dispatch</label>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setEditModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePlatformConfig}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black hover:bg-amber-400"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Visual 11-Stage Journey Funnel */}
      {activeTab === 'funnel' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-500" />
                  11-Stage End-to-End Visual Customer Funnel
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ad Click → Landing Page → WhatsApp → Order → Payment → Courier Delivery → Quest Review → Referral → Repeat Purchase.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/10 text-amber-400 border border-amber-500/30">
                WhatsApp Session Preserved
              </span>
            </div>

            <div className="space-y-3">
              {funnelMetrics.map((stage, idx) => (
                <div key={stage.stage_id} className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 font-black flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="font-extrabold text-white">{stage.stage_name}</span>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <span className="font-mono font-bold text-amber-400">{(stage.count || 0).toLocaleString()} users</span>
                      <span className="font-mono text-emerald-400 font-bold">{stage.conversion_rate_pct}% conv</span>
                      {stage.drop_off_pct > 0 && (
                        <span className="font-mono text-red-400 text-[10px]">-{stage.drop_off_pct}% drop</span>
                      )}
                    </div>
                  </div>

                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(stage.conversion_rate_pct, 5)}%` }}
                    />
                  </div>

                  <p className="text-[10px] text-slate-500 italic">{stage.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Event Operations Center & Real-Time Stream */}
      {activeTab === 'ops' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                Real-Time Event Stream & Shared event_id Deduplication
              </h3>
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Shared ID Deduplication Active
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-black border-b border-slate-800 text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Event Name</th>
                    <th className="p-3.5">Event ID (Shared)</th>
                    <th className="p-3.5">Session ID</th>
                    <th className="p-3.5">Browser & OS</th>
                    <th className="p-3.5 text-right">Value (KES)</th>
                    <th className="p-3.5 text-center">CAPI Dispatch</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {eventsStream.slice(0, 15).map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-bold text-amber-400">{evt.event_name}</td>
                      <td className="p-3.5 text-slate-300">{evt.event_id}</td>
                      <td className="p-3.5 text-slate-400">{evt.session_id}</td>
                      <td className="p-3.5 text-slate-300 font-sans">{evt.browser} / {evt.os}</td>
                      <td className="p-3.5 text-right font-bold text-emerald-400">
                        {evt.value_kes ? `KSh ${evt.value_kes.toLocaleString()}` : '-'}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                          {evt.dispatch_status?.meta_capi || 'sent'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-sans">
                        <button
                          onClick={() => handleReplayEvent(evt.event_id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px]"
                        >
                          Replay
                        </button>
                      </td>
                    </tr>
                  ))}
                  {eventsStream.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                        No events logged yet. Use the Test Console to fire simulated conversions.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. Audience Readiness Segments */}
      {activeTab === 'audiences' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {audienceSegments.map((seg) => (
              <div key={seg.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    {seg.sync_status}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-400">{seg.customer_count} Customers</span>
                </div>

                <h3 className="text-sm font-extrabold text-white">{seg.name}</h3>
                <p className="text-xs text-slate-400">{seg.description}</p>

                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold">Avg CLV:</span>
                  <span className="font-mono text-emerald-400 font-bold">KSh {(seg.avg_clv_kes || 0).toLocaleString()}</span>
                </div>

                <button
                  onClick={() => addToast({ type: 'info', title: 'Audience Ready', message: `${seg.name} queued for Meta Lookalike sync.` })}
                  className="w-full py-2 rounded-xl text-xs font-extrabold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center justify-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Prepare Meta / TikTok Custom Audience</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Integration Test Console */}
      {activeTab === 'testing' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 max-w-2xl mx-auto">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Zap className="w-5 h-5 text-amber-400" />
              Interactive Integration Test Event Runner
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Target Advertising Platform</label>
                <select
                  value={testPlatform}
                  onChange={(e) => setTestPlatform(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-bold"
                >
                  <option value="meta_capi">Meta Conversions API (CAPI Server)</option>
                  <option value="meta_pixel">Meta Pixel (Browser Simulated)</option>
                  <option value="ga4">Google Analytics 4 Measurement Protocol</option>
                  <option value="tiktok">TikTok Events API</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Event Name</label>
                <select
                  value={testEventName}
                  onChange={(e) => setTestEventName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-bold"
                >
                  <option value="PageView">PageView</option>
                  <option value="ViewContent">ViewContent</option>
                  <option value="Lead">Lead / WhatsApp Click</option>
                  <option value="InitiateCheckout">InitiateCheckout</option>
                  <option value="Purchase">Purchase</option>
                  <option value="Refund">Refund</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Conversion Value (KES)</label>
                <input
                  type="number"
                  value={testValueKes}
                  onChange={(e) => setTestValueKes(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-mono font-bold"
                />
              </div>

              <button
                onClick={handleRunTestEvent}
                disabled={isTesting}
                className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-black hover:bg-amber-400 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <Play className="w-4 h-4" />
                <span>{isTesting ? 'Dispatching Payload...' : 'Fire Test Event Now'}</span>
              </button>
            </div>

            {testResponse && (
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 mt-4">
                <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-widest">
                  Platform Acknowledgement Payload
                </span>
                <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto p-2 bg-slate-900 rounded-xl border border-slate-800 max-h-60">
                  {JSON.stringify(testResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Production Audit Report */}
      {activeTab === 'audit' && auditReport && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  Audit Score: {auditReport.production_readiness_score} / 100
                </span>
                <h3 className="text-xl font-black text-white mt-2">Stage 7 - Attribution & Growth Engine Audit</h3>
                <p className="text-xs text-slate-400 mt-0.5">Audit Timestamp: {new Date(auditReport.timestamp).toLocaleString()}</p>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-right">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Supported Platforms</span>
                <span className="font-extrabold text-amber-400">{auditReport.supported_platforms.join(' • ')}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Deduplication Architecture</span>
                <p className="text-xs text-slate-300 leading-relaxed">{auditReport.deduplication_architecture}</p>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Attribution Model</span>
                <p className="text-xs text-slate-300 leading-relaxed">{auditReport.attribution_model}</p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-extrabold text-white">System Capability Matrix</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {auditReport.capabilities.map((cap, idx) => (
                  <div key={idx} className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-white">{cap.name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 uppercase">
                          {cap.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{cap.notes}</p>
                    </div>
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

export default MarketingDashboard;
