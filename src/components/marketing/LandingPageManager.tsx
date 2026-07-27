import React, { useState, useEffect } from 'react';
import {
  Globe,
  Plus,
  Code,
  Copy,
  Check,
  TrendingUp,
  MessageSquare,
  ShoppingBag,
  DollarSign,
  ExternalLink,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  BarChart2
} from 'lucide-react';

export interface LandingPageRecord {
  id: string;
  name: string;
  campaign: string;
  status: 'active' | 'paused' | 'archived';
  version: string;
  created_by: string;
  launch_date: string;
  visitors: number;
  whatsapp_clicks: number;
  orders: number;
  revenue_kes: number;
  conversion_pct: number;
  roas: number;
  created_at: string;
  updated_at: string;
}

export const LandingPageManager: React.FC = () => {
  const [landingPages, setLandingPages] = useState<LandingPageRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [newForm, setNewForm] = useState({
    name: '',
    landing_page_id: '',
    campaign: 'Meta Gourmet Launch Q3',
    version: 'v1.0',
    status: 'active'
  });

  // SDK Embed Modal State
  const [selectedLpForSdk, setSelectedLpForSdk] = useState<LandingPageRecord | null>(null);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [copiedImport, setCopiedImport] = useState<boolean>(false);

  const fetchLandingPages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/marketing/landing-pages');
      const data = await res.json();
      setLandingPages(data.data || []);
    } catch (e) {
      console.error('Failed to fetch landing pages', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLandingPages();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name || !newForm.landing_page_id) return;

    try {
      const res = await fetch('/api/v1/marketing/landing-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm)
      });
      const data = await res.json();
      if (data.success) {
        setIsCreateOpen(false);
        setNewForm({ name: '', landing_page_id: '', campaign: 'Meta Gourmet Launch Q3', version: 'v1.0', status: 'active' });
        fetchLandingPages();
      } else {
        alert(data.error || 'Failed to create landing page');
      }
    } catch (err) {
      console.error('Failed to create LP', err);
    }
  };

  const copyToClipboard = (text: string, type: 'script' | 'import') => {
    navigator.clipboard.writeText(text);
    if (type === 'script') {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } else {
      setCopiedImport(true);
      setTimeout(() => setCopiedImport(false), 2000);
    }
  };

  const filteredLps = landingPages.filter((lp) => {
    const matchesSearch =
      lp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lp.campaign.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || lp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate totals
  const totalVisitors = landingPages.reduce((s, l) => s + l.visitors, 0);
  const totalWhatsApp = landingPages.reduce((s, l) => s + l.whatsapp_clicks, 0);
  const totalOrders = landingPages.reduce((s, l) => s + l.orders, 0);
  const totalRevenue = landingPages.reduce((s, l) => s + l.revenue_kes, 0);
  const avgConversion = totalVisitors ? (totalOrders / totalVisitors) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active LPs</span>
            <Globe className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{landingPages.filter((l) => l.status === 'active').length}</div>
          <div className="text-xs text-slate-500 mt-1">out of {landingPages.length} total registered</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Visitors</span>
            <BarChart2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{(totalVisitors || 0).toLocaleString()}</div>
          <div className="text-xs text-emerald-600 mt-1 font-medium">SDK Session Tracked</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">WhatsApp Clicks</span>
            <MessageSquare className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{(totalWhatsApp || 0).toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">
            {totalVisitors ? ((totalWhatsApp / totalVisitors) * 100).toFixed(1) : 0}% Click Rate
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Attributed Orders</span>
            <ShoppingBag className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{(totalOrders || 0).toLocaleString()}</div>
          <div className="text-xs text-purple-600 font-medium mt-1">{(avgConversion || 0).toFixed(2)}% Avg Conv</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Attributed Revenue</span>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">KSh {(totalRevenue || 0).toLocaleString()}</div>
          <div className="text-xs text-amber-600 font-medium mt-1">End-to-End Tracked</div>
        </div>
      </div>

      {/* Control Bar & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search landing pages or campaigns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-600">
            {['all', 'active', 'paused', 'archived'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-md capitalize transition-all ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="w-full md:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-2 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Register Landing Page
        </button>
      </div>

      {/* Landing Page Registry Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Landing Page Registry</h3>
            <p className="text-xs text-slate-500">Every Snack Quest landing page connected via the JavaScript SDK</p>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Showing {filteredLps.length} of {landingPages.length}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading landing page registry...</div>
        ) : filteredLps.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">No landing pages match your current search query.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Landing Page</th>
                  <th className="px-6 py-3">Campaign / Ver</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Visitors</th>
                  <th className="px-6 py-3 text-right">WA Clicks</th>
                  <th className="px-6 py-3 text-right">Orders</th>
                  <th className="px-6 py-3 text-right">Revenue</th>
                  <th className="px-6 py-3 text-right">Conv %</th>
                  <th className="px-6 py-3 text-right">ROAS</th>
                  <th className="px-6 py-3 text-center">SDK Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLps.map((lp) => (
                  <tr key={lp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{lp.name}</div>
                      <div className="text-xs font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded inline-block mt-0.5">
                        {lp.id}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-slate-700 font-medium">{lp.campaign}</div>
                      <div className="text-xs text-slate-500">Ver {lp.version}</div>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                          lp.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : lp.status === 'paused'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            lp.status === 'active' ? 'bg-emerald-500 animate-pulse' : lp.status === 'paused' ? 'bg-amber-500' : 'bg-slate-400'
                          }`}
                        />
                        {lp.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right font-medium text-slate-900">{(lp.visitors || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-medium">{(lp.whatsapp_clicks || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900">{(lp.orders || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">KSh {(lp.revenue_kes || 0).toLocaleString()}</td>

                    <td className="px-6 py-4 text-right">
                      <span className="font-semibold text-purple-600">{lp.conversion_pct}%</span>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-amber-600">{lp.roas}x</span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedLpForSdk(lp)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all inline-flex items-center gap-1"
                      >
                        <Code className="w-3.5 h-3.5" />
                        Get Code
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Register New Landing Page</h3>
            <p className="text-xs text-slate-500 mb-4">
              Create a unique landing page identifier for attribution tracking across Meta, TikTok, and Google.
            </p>

            <form onSubmit={handleCreate} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Landing Page Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gourmet Snack Box Promo V2"
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Landing Page ID (Unique)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. lp_gourmet_v2"
                  value={newForm.landing_page_id}
                  onChange={(e) => setNewForm({ ...newForm, landing_page_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  className="w-full px-3 py-2 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Campaign</label>
                <input
                  type="text"
                  placeholder="e.g. TikTok Creator Wave Q3"
                  value={newForm.campaign}
                  onChange={(e) => setNewForm({ ...newForm, campaign: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Version</label>
                  <input
                    type="text"
                    value={newForm.version}
                    onChange={(e) => setNewForm({ ...newForm, version: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={newForm.status}
                    onChange={(e) => setNewForm({ ...newForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold rounded-lg text-xs shadow-xs"
                >
                  Register LP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SDK Installation Modal */}
      {selectedLpForSdk && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Snack Quest SDK Installation</h3>
                <p className="text-xs text-slate-500">
                  Embed on <span className="font-semibold text-slate-800">{selectedLpForSdk.name}</span> ({selectedLpForSdk.id})
                </p>
              </div>
              <button onClick={() => setSelectedLpForSdk(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Script Tag Option */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-amber-500" />
                    Option A: HTML Script Tag (For Lovable, Webflow, HTML)
                  </label>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `<script src="https://api.snackquest.co.ke/sdk.js"></script>\n<script>\n  SnackQuestTracker.init({\n    apiUrl: "https://api.snackquest.co.ke",\n    landingPageId: "${selectedLpForSdk.id}",\n    environment: "production"\n  });\n</script>`,
                        'script'
                      )
                    }
                    className="text-xs text-amber-600 font-medium hover:underline flex items-center gap-1"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedScript ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 text-amber-400 text-xs font-mono rounded-xl overflow-x-auto">
                  {`<script src="https://api.snackquest.co.ke/sdk.js"></script>
<script>
  SnackQuestTracker.init({
    apiUrl: "https://api.snackquest.co.ke",
    landingPageId: "${selectedLpForSdk.id}",
    environment: "production"
  });
</script>`}
                </pre>
              </div>

              {/* NPM / Module Import Option */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-purple-500" />
                    Option B: ES Module Import (For React / Vite)
                  </label>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `import SnackQuestTracker from "@snackquest/sdk";\n\nSnackQuestTracker.init({\n  apiUrl: "https://api.snackquest.co.ke",\n  landingPageId: "${selectedLpForSdk.id}",\n  environment: "production"\n});`,
                        'import'
                      )
                    }
                    className="text-xs text-amber-600 font-medium hover:underline flex items-center gap-1"
                  >
                    {copiedImport ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedImport ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 text-purple-300 text-xs font-mono rounded-xl overflow-x-auto">
                  {`import SnackQuestTracker from "@snackquest/sdk";

SnackQuestTracker.init({
  apiUrl: "https://api.snackquest.co.ke",
  landingPageId: "${selectedLpForSdk.id}",
  environment: "production"
});`}
                </pre>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                <span className="font-bold">✨ Zero Business Logic Constraint:</span> The Landing Page SDK automatically handles
                visitor profiling, cookie consent persistence, WhatsApp referral parameter appending, scroll heatmaps, and Meta CAPI
                deduplication.
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLpForSdk(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
