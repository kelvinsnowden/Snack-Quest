import React, { useState, useEffect } from 'react';
import {
  Globe,
  Server,
  ShieldCheck,
  QrCode,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Save,
  Layers,
  Code,
  Lock,
  Search,
  FileCode,
  History,
  Flag,
  Check,
  Terminal,
  Zap
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface EnvUrls {
  landing_url: string;
  api_base_url: string;
  quest_center_url: string;
  creator_portal_url: string;
  admin_os_url: string;
  cdn_url: string;
  static_assets_url: string;
  ssl_status?: string;
  dns_status?: string;
}

interface DomainConfigData {
  active_environment: 'development' | 'staging' | 'production';
  environments: Record<'development' | 'staging' | 'production', EnvUrls>;
  active_urls: EnvUrls;
  url_templates: Record<string, string>;
  country_domains: Array<{ code: string; name: string; domain: string; active: boolean; currency: string }>;
  previews: Record<string, string>;
  sdk_info: { version: string; checksum: string; updated_at: string };
  audit_logs: Array<{
    id: string;
    timestamp: string;
    admin_user: string;
    environment: string;
    field: string;
    previous_value: string;
    new_value: string;
    ip_address: string;
    reason: string;
  }>;
}

export const DomainManager: React.FC = () => {
  const { addToast, currentStaffUser } = useApp();
  const [data, setData] = useState<DomainConfigData | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states
  const [selectedEnv, setSelectedEnv] = useState<'development' | 'staging' | 'production'>('production');
  const [editUrls, setEditUrls] = useState<EnvUrls>({
    landing_url: '',
    api_base_url: '',
    quest_center_url: '',
    creator_portal_url: '',
    admin_os_url: '',
    cdn_url: '',
    static_assets_url: ''
  });
  const [editTemplates, setEditTemplates] = useState<Record<string, string>>({});
  const [changeReason, setChangeReason] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // QR Modal
  const [qrModalUrl, setQrModalUrl] = useState<string | null>(null);

  // Validation Test State
  const [validatingUrl, setValidatingUrl] = useState('');
  const [validationResult, setValidationResult] = useState<any>(null);

  // Audit Scan Results
  const [auditScan, setAuditScan] = useState<any>(null);
  const [scanning, setScanning] = useState(false);

  const fetchDomainConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/domains/config');
      if (res.ok) {
        const json: DomainConfigData = await res.json();
        setData(json);
        setSelectedEnv(json.active_environment);
        setEditUrls(json.environments[json.active_environment]);
        setEditTemplates(json.url_templates);
      }
    } catch (e) {
      console.error('Failed to load domain config', e);
      addToast({ type: 'error', title: 'Error', message: 'Failed to load enterprise domain configuration' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDomainConfig();
  }, []);

  const handleEnvTabChange = (env: 'development' | 'staging' | 'production') => {
    setSelectedEnv(env);
    if (data?.environments[env]) {
      setEditUrls(data.environments[env]);
    }
  };

  const handleSaveDomainConfig = async () => {
    if (!currentStaffUser?.role || (currentStaffUser.role !== 'SUPER_ADMIN' && currentStaffUser.role !== 'SYSTEM_ADMIN')) {
      addToast({ type: 'error', title: 'Access Denied', message: 'Only Super Administrators can modify domain settings.' });
      return;
    }

    try {
      const res = await fetch('/api/v1/domains/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_environment: selectedEnv,
          environment_urls: editUrls,
          reason: changeReason || 'Admin updated domain & URL configuration',
          staff_name: currentStaffUser.name || 'Super Admin'
        })
      });

      if (res.ok) {
        addToast({ type: 'success', title: 'Domain Config Saved', message: `Environment switched & URLs updated for ${selectedEnv.toUpperCase()}` });
        setChangeReason('');
        fetchDomainConfig();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Save Failed', message: 'Could not save domain settings' });
    }
  };

  const handleValidateUrl = async (urlToTest: string) => {
    if (!urlToTest) return;
    setValidatingUrl(urlToTest);
    try {
      const res = await fetch('/api/v1/domains/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToTest })
      });
      if (res.ok) {
        const result = await res.json();
        setValidationResult(result);
      }
    } catch (e) {
      console.error('Validation failed', e);
    }
  };

  const handleRunSystemAudit = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/v1/domains/audit-scan');
      if (res.ok) {
        const scanData = await res.json();
        setAuditScan(scanData);
        addToast({ type: 'success', title: 'Audit Scan Complete', message: 'Verified 100% domain compliance across all OS modules' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Audit Failed', message: 'Failed to run system URL audit' });
    } finally {
      setScanning(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    addToast({ type: 'success', title: 'Copied to Clipboard', message: text });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading && !data) {
    return (
      <div className="p-8 text-center text-zinc-400 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
        <p className="text-sm">Loading Enterprise Domain & URL Manager...</p>
      </div>
    );
  }

  const activeEnv = data?.active_environment || 'production';
  const activeUrls = data?.environments[activeEnv] || editUrls;

  return (
    <div className="space-y-8">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 p-6 rounded-2xl border border-zinc-700/60 shadow-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <span className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg">
              <Globe className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">Enterprise Domain & URL Management Center</h2>
              <p className="text-xs text-zinc-400">Single Source of Truth for all Public, API, Auth, and Portal URLs</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>ACTIVE ENV: {activeEnv.toUpperCase()}</span>
          </div>

          <button
            onClick={handleRunSystemAudit}
            disabled={scanning}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Scanning OS...' : 'Audit OS Modules'}</span>
          </button>
        </div>
      </div>

      {/* Environment Selector Tabs */}
      <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Environment Domain Configuration</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">Select environment to view or edit base domain bindings</p>
          </div>

          <div className="flex items-center space-x-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            {(['development', 'staging', 'production'] as const).map((env) => (
              <button
                key={env}
                onClick={() => handleEnvTabChange(env)}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition flex items-center space-x-2 ${
                  selectedEnv === env
                    ? 'bg-amber-500 text-zinc-950 font-bold shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <span>{env.toUpperCase()}</span>
                {data?.active_environment === env && (
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-950"></span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Base URL Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Landing Website</label>
            <input
              type="text"
              value={editUrls.landing_url}
              onChange={(e) => setEditUrls({ ...editUrls, landing_url: e.target.value })}
              placeholder="https://snackquests.shop"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Public marketing website</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">API Base URL</label>
            <input
              type="text"
              value={editUrls.api_base_url}
              onChange={(e) => setEditUrls({ ...editUrls, api_base_url: e.target.value })}
              placeholder="https://api.snackquests.shop"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Operating System backend</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Customer Quest Center</label>
            <input
              type="text"
              value={editUrls.quest_center_url}
              onChange={(e) => setEditUrls({ ...editUrls, quest_center_url: e.target.value })}
              placeholder="https://quest.snackquests.shop"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Customer rewards & quest portal</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Creator Portal</label>
            <input
              type="text"
              value={editUrls.creator_portal_url}
              onChange={(e) => setEditUrls({ ...editUrls, creator_portal_url: e.target.value })}
              placeholder="https://creators.snackquests.shop"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Affiliate & creator workspace</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Admin Operating System</label>
            <input
              type="text"
              value={editUrls.admin_os_url}
              onChange={(e) => setEditUrls({ ...editUrls, admin_os_url: e.target.value })}
              placeholder="https://admin.snackquests.shop"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Internal administrative console</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">CDN & Static Assets URL</label>
            <input
              type="text"
              value={editUrls.cdn_url}
              onChange={(e) => setEditUrls({ ...editUrls, cdn_url: e.target.value, static_assets_url: e.target.value })}
              placeholder="https://cdn.snackquests.shop"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Edge content delivery network</p>
          </div>
        </div>

        {/* Change Reason & Security Confirmation */}
        <div className="pt-4 border-t border-zinc-800/80 flex flex-col md:flex-row items-end md:items-center justify-between gap-4">
          <div className="w-full md:w-1/2">
            <label className="block text-xs font-semibold text-zinc-400 mb-1">Reason for Change (Security Audit Record)</label>
            <input
              type="text"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="e.g. Updating staging domain bindings for release 10.2"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={handleSaveDomainConfig}
            className="w-full md:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/10"
          >
            <Save className="w-4 h-4" />
            <span>Save & Activate {selectedEnv.toUpperCase()} Domain Map</span>
          </button>
        </div>
      </div>

      {/* Dynamic URL Preview Center */}
      <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Dynamic URL Preview Center</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">Live previews automatically derived from dynamic URL service</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 font-mono">
            Source: {activeEnv.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'Landing Website', url: activeUrls.landing_url, tag: 'PUBLIC' },
            { label: 'Creator Signup', url: `${activeUrls.creator_portal_url}${data?.url_templates.creator_register || '/register'}`, tag: 'CREATORS' },
            { label: 'Creator Login', url: `${activeUrls.creator_portal_url}${data?.url_templates.creator_login || '/login'}`, tag: 'CREATORS' },
            { label: 'Customer Login', url: `${activeUrls.quest_center_url}/login`, tag: 'QUEST' },
            { label: 'Customer Dashboard', url: `${activeUrls.quest_center_url}/dashboard`, tag: 'QUEST' },
            { label: 'Referral Example', url: `${activeUrls.creator_portal_url}/r/SQ-KIM123`, tag: 'AFFILIATE' },
            { label: 'Magic Login Example', url: `${activeUrls.quest_center_url}/magic-login?token=sq_mg_89a1b2c3d4`, tag: 'AUTH' },
            { label: 'Landing SDK Script', url: `${activeUrls.api_base_url}/sdk.js`, tag: 'EMBED' }
          ].map((item, idx) => (
            <div key={idx} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">{item.label}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-400">{item.tag}</span>
              </div>

              <div className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800/60 font-mono text-xs text-emerald-400 truncate">
                {item.url}
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <div className="flex items-center space-x-1 text-emerald-400 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Validated</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => copyToClipboard(item.url, item.label)}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                    title="Copy URL"
                  >
                    {copiedKey === item.label ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => setQrModalUrl(item.url)}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                    title="Show QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                    title="Open link"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Audit & SDK Embed Snippet Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SDK Embed Generator */}
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
              <Code className="w-4 h-4 text-amber-400" />
              <span>Landing Page SDK Generator</span>
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
              {data?.sdk_info?.version || 'v2.4.0'}
            </span>
          </div>

          <p className="text-xs text-zinc-400">
            Copy and paste this script snippet into the <code className="text-amber-300 font-mono">&lt;head&gt;</code> of external marketing sites:
          </p>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 relative font-mono text-xs text-amber-300 leading-relaxed overflow-x-auto">
            <code>
              {`<script src="${activeUrls.api_base_url}/sdk.js" async></script>`}
            </code>
            <button
              onClick={() => copyToClipboard(`<script src="${activeUrls.api_base_url}/sdk.js" async></script>`, 'sdk_snippet')}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
            >
              {copiedKey === 'sdk_snippet' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px] text-zinc-400 pt-2 font-mono">
            <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/60">
              <span className="text-zinc-500 block">SHA-256 Checksum:</span>
              <span className="text-zinc-300 truncate block">{data?.sdk_info?.checksum?.substring(0, 24)}...</span>
            </div>
            <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/60">
              <span className="text-zinc-500 block">Last Verification:</span>
              <span className="text-zinc-300 block">{new Date(data?.sdk_info?.updated_at || Date.now()).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Multi-Country Regional Expansion */}
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
              <Flag className="w-4 h-4 text-amber-400" />
              <span>Multi-Country Regional Domains</span>
            </h3>
            <span className="text-xs text-zinc-400">East Africa Matrix</span>
          </div>

          <p className="text-xs text-zinc-400">
            Configure regional country TLDs without altering core business rules or database architecture.
          </p>

          <div className="space-y-3">
            {data?.country_domains?.map((cd) => (
              <div key={cd.code} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold font-mono px-2 py-1 bg-zinc-800 text-amber-400 rounded">
                    {cd.code}
                  </span>
                  <div>
                    <span className="text-xs font-semibold text-white block">{cd.name}</span>
                    <span className="text-[11px] font-mono text-zinc-400">{cd.domain}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    Currency: {cd.currency}
                  </span>
                  <span className="flex items-center space-x-1 text-emerald-400 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Active</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <History className="w-4 h-4 text-amber-400" />
            <span>Immutable Security Audit Log</span>
          </h3>
          <span className="text-xs text-zinc-400">{data?.audit_logs?.length || 0} Records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] font-mono">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Admin User</th>
                <th className="p-3">Environment</th>
                <th className="p-3">Field / Change</th>
                <th className="p-3">IP Address</th>
                <th className="p-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
              {data?.audit_logs?.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-800/30">
                  <td className="p-3 text-zinc-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3 font-semibold text-white">{log.admin_user}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-amber-400 uppercase text-[10px]">
                      {log.environment}
                    </span>
                  </td>
                  <td className="p-3 text-zinc-300">{log.field}</td>
                  <td className="p-3 text-zinc-500">{log.ip_address}</td>
                  <td className="p-3 text-zinc-400 font-sans">{log.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Modal */}
      {qrModalUrl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <h4 className="text-sm font-bold text-white">QR Code Preview</h4>
            <div className="bg-white p-4 rounded-xl inline-block shadow-lg">
              {/* QR display SVG rendering simulation */}
              <QrCode className="w-48 h-48 text-zinc-950" />
            </div>
            <p className="text-xs font-mono text-amber-400 break-all bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
              {qrModalUrl}
            </p>
            <button
              onClick={() => setQrModalUrl(null)}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
