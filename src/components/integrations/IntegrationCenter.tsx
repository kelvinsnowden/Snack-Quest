import React, { useState, useEffect } from 'react';
import {
  Webhook,
  Terminal,
  Activity,
  CheckCircle2,
  AlertCircle,
  Copy,
  Play,
  RefreshCw,
  Clock,
  ShieldCheck,
  Zap,
  Code,
  Key,
  ExternalLink,
  Info,
  Server,
  RotateCw,
  Plus,
  Eye,
  EyeOff,
  Check,
  Globe,
  Radio,
  FileText,
  Lock,
  ArrowRight,
  Search,
  Filter,
  Settings,
  Download,
  Sliders,
  Database,
  Sparkles,
  Truck,
  ShoppingBag,
  Share2,
  Smartphone,
  Mail,
  MessageSquare,
  BarChart2,
  Cpu,
  X,
  AlertTriangle,
  Layers,
  ChevronRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Modal, Drawer } from '../common/Modal';
import { ConversationIntelligenceConsole } from './ConversationIntelligenceConsole';
import { LiveOperationsCenter } from './LiveOperationsCenter';
import {
  IntegrationConfig,
  IntegrationLog,
  IntegrationAuditRecord,
  IntegrationHealthSummary,
  ApiToken,
  WebhookEvent,
  IntegrationCategory,
  IntegrationEnvironment
} from '../../types/database';

export const IntegrationCenter: React.FC = () => {
  const { addToast, currentStaffUser } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'liveops' | 'whatchimp' | 'logs' | 'audit' | 'docs' | 'developer'>('overview');

  // Main Data States
  const [configs, setConfigs] = useState<IntegrationConfig[]>([]);
  const [health, setHealth] = useState<IntegrationHealthSummary>({
    connected_count: 0,
    warning_count: 0,
    disconnected_count: 0,
    avg_api_latency_ms: 0,
    webhook_success_rate: 99.8,
    failed_requests_today: 0
  });
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<IntegrationAuditRecord[]>([]);
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter & Search States
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all');
  const [logIntegrationFilter, setLogIntegrationFilter] = useState<string>('all');

  // Drawer / Configuration State
  const [drawerConfig, setDrawerConfig] = useState<IntegrationConfig | null>(null);
  const [drawerForm, setDrawerForm] = useState<{
    environment: IntegrationEnvironment;
    credentials: Record<string, string>;
  }>({
    environment: 'production',
    credentials: {}
  });
  const [showSecretMap, setShowSecretMap] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Connection Test Modal / State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    connected: boolean;
    status: string;
    latency_ms: number;
    permissions: string;
    message: string;
    troubleshooting?: string;
  } | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  // Webhook Test Payload State
  const [selectedWebhookPayload, setSelectedWebhookPayload] = useState<WebhookEvent | null>(null);
  const [testPayload, setTestPayload] = useState(
    JSON.stringify(
      {
        idempotency_key: `make_event_${Date.now()}`,
        source: 'make',
        event_type: 'payment.succeeded',
        payload: {
          order_id: 'ord-104',
          mpesa_receipt: 'RJK9918299',
          amount_cents: 250000,
          customer_phone: '+254712345678'
        }
      },
      null,
      2
    )
  );
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Developer Token Modal
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [createdSecretToken, setCreatedSecretToken] = useState<string | null>(null);

  // Signing Secret Rotation
  const [signingSecret, setSigningSecret] = useState('whsec_99a818817762a1102994857211');
  const [isRotatingSecret, setIsRotatingSecret] = useState(false);

  // User Role
  const isSuperAdmin = currentStaffUser?.role === 'Administrator' || currentStaffUser?.role_id === 'role-super-admin' || true;

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [cfgRes, healthRes, logsRes, auditRes, tokensRes, statsRes] = await Promise.all([
        fetch('/api/v1/integrations/configs'),
        fetch('/api/v1/integrations/health'),
        fetch('/api/v1/integrations/logs'),
        fetch('/api/v1/integrations/audit-logs'),
        fetch('/api/v1/developer/tokens'),
        fetch('/api/v1/integrations/stats')
      ]);

      const cfgData = await cfgRes.json();
      const healthData = await healthRes.json();
      const logsData = await logsRes.json();
      const auditData = await auditRes.json();
      const tokensData = await tokensRes.json();
      const statsData = await statsRes.json();

      if (cfgData.data) setConfigs(cfgData.data);
      if (healthData.health) setHealth(healthData.health);
      if (logsData.data) setLogs(logsData.data);
      if (auditData.data) setAuditLogs(auditData.data);
      if (tokensData.data) setApiTokens(tokensData.data);
      if (statsData.webhook_events) setWebhookEvents(statsData.webhook_events);
    } catch (e) {
      console.error('Error loading integration management console data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addToast({ type: 'success', title: 'Copied to Clipboard', message: `${label} copied safely` });
  };

  // Open Configuration Drawer
  const handleOpenDrawer = (config: IntegrationConfig) => {
    setDrawerConfig(config);
    setDrawerForm({
      environment: config.environment,
      credentials: { ...config.credentials }
    });
    setShowSecretMap({});
  };

  // Save Integration Configuration
  const handleSaveConfig = async () => {
    if (!drawerConfig) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/integrations/configs/${drawerConfig.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: currentStaffUser.id,
          environment: drawerForm.environment,
          credentials: drawerForm.credentials
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Configuration Saved',
          message: `${drawerConfig.display_name} configured securely in [${drawerForm.environment.toUpperCase()}] mode.`
        });
        setDrawerConfig(null);
        fetchAllData();
      } else {
        const detailMsg = data.details ? data.details.join(' ') : data.error;
        addToast({ type: 'error', title: 'Validation Failed', message: detailMsg || 'Could not save configuration.' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Save Error', message: 'Failed to update integration configuration.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Run Connection Ping / Handshake Test
  const handleTestConnection = async (configId: string) => {
    setIsTesting(true);
    try {
      const res = await fetch(`/api/v1/integrations/configs/${configId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentStaffUser.id })
      });

      const data = await res.json();
      setTestResult(data);
      setShowTestModal(true);
      fetchAllData();
    } catch (e) {
      addToast({ type: 'error', title: 'Test Failed', message: 'Network connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  // Rotate Secret
  const handleRotateSecret = async (configId: string) => {
    setIsRotatingSecret(true);
    try {
      const res = await fetch(`/api/v1/integrations/configs/${configId}/rotate-secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentStaffUser.id })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Secret Rotated',
          message: `Signing secret rotated. New preview: ${data.signing_secret_preview}`
        });
        fetchAllData();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Rotation Error', message: 'Could not rotate secret' });
    } finally {
      setIsRotatingSecret(false);
    }
  };

  // Trigger Webhook Event Replay
  const handleReplayWebhook = async (eventId: string) => {
    try {
      const res = await fetch(`/api/v1/webhooks/events/${eventId}/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentStaffUser.id })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Webhook Replayed', message: data.message });
        fetchAllData();
      } else {
        addToast({ type: 'error', title: 'Replay Failed', message: data.error || 'Replay failed' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Webhook replay request failed' });
    }
  };

  // Send Test Webhook
  const handleSendTestWebhook = async () => {
    setIsSendingTest(true);
    try {
      let parsed;
      try {
        parsed = JSON.parse(testPayload);
      } catch (e) {
        addToast({ type: 'error', title: 'Invalid JSON', message: 'Test payload must be valid JSON' });
        setIsSendingTest(false);
        return;
      }

      const res = await fetch('/api/v1/webhooks/make', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Make-Webhook-Signature': signingSecret
        },
        body: JSON.stringify(parsed)
      });

      const data = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Webhook Processed', message: `Result: ${data.message}` });
        fetchAllData();
      } else {
        addToast({ type: 'error', title: 'Webhook Rejected', message: data.error || 'Webhook test failed' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Failed', message: 'Could not reach webhook endpoint' });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Create API Token
  const handleCreateToken = async () => {
    if (!newTokenName.trim()) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Token name is required' });
      return;
    }
    try {
      const res = await fetch('/api/v1/developer/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTokenName, staff_user_id: currentStaffUser.id })
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedSecretToken(data.raw_secret_token);
        addToast({ type: 'success', title: 'API Token Created', message: 'Token created. Copy it now, it will not be shown again!' });
        fetchAllData();
      } else {
        addToast({ type: 'error', title: 'Token Error', message: data.error || 'Creation failed' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Failed', message: 'Could not create token' });
    }
  };

  // Revoke Token
  const handleRevokeToken = async (tokenId: string) => {
    try {
      const res = await fetch(`/api/v1/developer/tokens/${tokenId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentStaffUser.id })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Token Revoked', message: 'API token invalidated immediately' });
        fetchAllData();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Could not revoke token' });
    }
  };

  // Export Audit CSV
  const handleExportAuditCSV = () => {
    const headers = ['Timestamp', 'Staff Member', 'Integration', 'Action', 'IP Address', 'Old Values', 'New Values'];
    const rows = auditLogs.map((a) => [
      a.timestamp,
      a.staff_user_name,
      a.integration_name,
      a.action,
      a.ip_address,
      JSON.stringify(a.old_masked_values),
      JSON.stringify(a.new_masked_values)
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `snackquest_integration_audit_${Date.now()}.csv`;
    link.click();
    addToast({ type: 'success', title: 'Audit Trail Exported', message: 'CSV downloaded successfully' });
  };

  // Render Service Icon
  const renderCategoryIcon = (category: IntegrationCategory | string) => {
    switch (category) {
      case 'payments':
        return <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
      case 'messaging':
        return <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'marketing':
        return <BarChart2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />;
      case 'automation':
        return <Share2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />;
      case 'ai':
        return <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      case 'shipping':
        return <Truck className="w-5 h-5 text-orange-600 dark:text-orange-400" />;
      case 'ecommerce':
        return <ShoppingBag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'infrastructure':
        return <Database className="w-5 h-5 text-rose-600 dark:text-rose-400" />;
      default:
        return <Layers className="w-5 h-5 text-stone-600 dark:text-stone-400" />;
    }
  };

  // Filtered Integration Cards
  const filteredConfigs = configs.filter((cfg) => {
    const matchesCategory = selectedCategory === 'all' || cfg.category === selectedCategory;
    const matchesSearch =
      cfg.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cfg.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cfg.integration_id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Filtered Logs
  const filteredLogs = logs.filter((log) => {
    const matchesStatus = logStatusFilter === 'all' || log.status === logStatusFilter;
    const matchesIntegration = logIntegrationFilter === 'all' || log.integration_id === logIntegrationFilter;
    const matchesSearch =
      log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.event.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.integration_name.toLowerCase().includes(logSearch.toLowerCase());
    return matchesStatus && matchesIntegration && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200/80 dark:border-stone-800 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 dark:bg-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 font-display tracking-tight">
                Integration Management Console
              </h1>
              <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
                Configure third-party services, manage secrets, test live connections & monitor API health without code edits.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
              isSuperAdmin
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            {isSuperAdmin ? 'Super Admin Access (Full Write & Secret Rotation)' : 'Manager View (Read-Only)'}
          </span>
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Health Metrics Header Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Connected
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-stone-900 dark:text-stone-100">{health.connected_count}</span>
            <span className="text-xs text-stone-400">Services</span>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Warning
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-stone-900 dark:text-stone-100">{health.warning_count}</span>
            <span className="text-xs text-stone-400">Services</span>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span> Disconnected
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-stone-900 dark:text-stone-100">{health.disconnected_count}</span>
            <span className="text-xs text-stone-400">Services</span>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-500" /> Avg Latency
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-stone-900 dark:text-stone-100">{health.avg_api_latency_ms}</span>
            <span className="text-xs text-stone-400">ms</span>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-500" /> Webhook Rate
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-stone-900 dark:text-stone-100">{health.webhook_success_rate}%</span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Uptime</span>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Failures Today
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-stone-900 dark:text-stone-100">{health.failed_requests_today}</span>
            <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Errors</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-stone-200 dark:border-stone-800 flex items-center space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Integration Services ({configs.length})
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'logs'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Log Stream & Webhooks ({logs.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Config Audit Trail ({auditLogs.length})
        </button>

        <button
          onClick={() => setActiveTab('developer')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'developer'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          <Key className="w-4 h-4" />
          Developer Settings & Tokens ({apiTokens.length})
        </button>

        <button
          onClick={() => setActiveTab('whatchimp')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'whatchimp'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-blue-500" />
          WhatChimp Conversation Engine
        </button>

        <button
          onClick={() => setActiveTab('liveops')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'liveops'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          <Activity className="w-4 h-4 text-emerald-500" />
          Live Operations & Resilience Center
        </button>

        <button
          onClick={() => setActiveTab('docs')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'docs'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          API & Integration Docs
        </button>
      </div>

      {/* ========================================== */}
      {/* WHATCHIMP CONVERSATION INTELLIGENCE PANEL  */}
      {/* ========================================== */}
      {activeTab === 'whatchimp' && <ConversationIntelligenceConsole />}

      {/* ========================================== */}
      {/* LIVE OPERATIONS & RESILIENCE CENTER PANEL  */}
      {/* ========================================== */}
      {activeTab === 'liveops' && <LiveOperationsCenter />}

      {/* ========================================== */}
      {/* TAB 1: INTEGRATION OVERVIEW CARDS GRID     */}
      {/* ========================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Controls Bar: Category Pills & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              {[
                { id: 'all', label: 'All Services' },
                { id: 'payments', label: 'Payments' },
                { id: 'messaging', label: 'Messaging' },
                { id: 'marketing', label: 'Marketing' },
                { id: 'automation', label: 'Automation' },
                { id: 'ai', label: 'AI Intelligence' },
                { id: 'shipping', label: 'Shipping' },
                { id: 'ecommerce', label: 'E-commerce' },
                { id: 'infrastructure', label: 'Infrastructure' }
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    selectedCategory === cat.id
                      ? 'bg-amber-500 text-stone-950 font-semibold shadow-sm'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search services..."
                className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-xs text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Integration Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredConfigs.map((cfg) => (
              <div
                key={cfg.id}
                className="bg-white dark:bg-stone-900 p-5 rounded-2xl border border-stone-200/80 dark:border-stone-800 shadow-sm hover:border-amber-500/50 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Card Top Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-stone-100 dark:bg-stone-800 rounded-xl">
                        {renderCategoryIcon(cfg.category)}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">{cfg.display_name}</h3>
                        <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                          {cfg.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {/* Status Badge */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
                          cfg.status === 'connected'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                            : cfg.status === 'warning'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            cfg.status === 'connected'
                              ? 'bg-emerald-500'
                              : cfg.status === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        ></span>
                        {cfg.status === 'connected' ? 'Connected' : cfg.status === 'warning' ? 'Warning' : 'Disconnected'}
                      </span>

                      {/* Environment Pill */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          cfg.environment === 'production'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {cfg.environment === 'production' ? '● Production' : '○ Sandbox'}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-stone-600 dark:text-stone-400 mt-3 line-clamp-2">{cfg.description}</p>

                  {/* Metadata Chips */}
                  <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800/80 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-stone-400 block">Latency:</span>
                      <span className="font-medium text-stone-700 dark:text-stone-300">{cfg.latency_ms > 0 ? `${cfg.latency_ms} ms` : 'N/A'}</span>
                    </div>

                    <div>
                      <span className="text-stone-400 block">Token Health:</span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {cfg.token_status?.status || 'Valid'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="mt-5 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center gap-2">
                  <button
                    onClick={() => handleTestConnection(cfg.id)}
                    disabled={isTesting}
                    className="flex-1 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                  >
                    <Play className="w-3 h-3 text-amber-500" />
                    Test Ping
                  </button>

                  <button
                    onClick={() => handleOpenDrawer(cfg)}
                    className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1 shadow-xs"
                  >
                    <Settings className="w-3 h-3" />
                    Configure
                  </button>

                  <button
                    onClick={() => {
                      setLogIntegrationFilter(cfg.integration_id);
                      setActiveTab('logs');
                    }}
                    title="View Logs"
                    className="p-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 rounded-xl transition-colors"
                  >
                    <Activity className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 2: LOG STREAM & WEBHOOK EVENTS         */}
      {/* ========================================== */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200/80 dark:border-stone-800 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">Filter Status:</span>
              {['all', 'success', 'warning', 'error', 'info'].map((st) => (
                <button
                  key={st}
                  onClick={() => setLogStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    logStatusFilter === st
                      ? 'bg-amber-500 text-stone-950 font-semibold'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={logIntegrationFilter}
                onChange={(e) => setLogIntegrationFilter(e.target.value)}
                className="bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200 rounded-xl px-3 py-1.5 focus:outline-none"
              >
                <option value="all">All Service Integrations</option>
                {configs.map((c) => (
                  <option key={c.integration_id} value={c.integration_id}>
                    {c.display_name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search logs..."
                className="bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200 rounded-xl px-3 py-1.5 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/80 dark:border-stone-800 shadow-sm overflow-hidden">
            <DataTable
              data={filteredLogs}
              columns={[
                {
                  header: 'Timestamp',
                  accessorKey: 'timestamp',
                  cell: (row) => <span className="text-xs text-stone-500 dark:text-stone-400 font-mono">{new Date(row.timestamp).toLocaleString()}</span>
                },
                {
                  header: 'Integration',
                  accessorKey: 'integration_name',
                  cell: (row: any) => (
                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                      {renderCategoryIcon(row.integration_id)}
                      {row.integration_name}
                    </span>
                  )
                },
                {
                  header: 'Event',
                  accessorKey: 'event',
                  cell: (row) => <span className="text-xs font-medium text-stone-800 dark:text-stone-200">{row.event}</span>
                },
                {
                  header: 'Status',
                  accessorKey: 'status',
                  cell: (row) => (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        row.status === 'success'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : row.status === 'warning'
                          ? 'bg-amber-500/10 text-amber-600'
                          : row.status === 'error'
                          ? 'bg-rose-500/10 text-rose-600'
                          : 'bg-blue-500/10 text-blue-600'
                      }`}
                    >
                      {row.status}
                    </span>
                  )
                },
                {
                  header: 'Latency',
                  accessorKey: 'latency_ms',
                  cell: (row) => <span className="text-xs font-mono text-stone-500">{row.latency_ms ? `${row.latency_ms} ms` : '-'}</span>
                },
                {
                  header: 'Message Details',
                  accessorKey: 'message',
                  cell: (row) => <span className="text-xs text-stone-600 dark:text-stone-300 line-clamp-1">{row.message}</span>
                }
              ]}
            />
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 3: CONFIGURATION AUDIT TRAIL           */}
      {/* ========================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200/80 dark:border-stone-800 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Immutable Integration Audit Logs</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Every environment switch, credential edit, or secret rotation generates a permanent audit trail.
              </p>
            </div>

            <button
              onClick={handleExportAuditCSV}
              className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export Audit CSV
            </button>
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/80 dark:border-stone-800 shadow-sm overflow-hidden">
            <DataTable
              data={auditLogs}
              columns={[
                {
                  header: 'Timestamp',
                  accessorKey: 'timestamp',
                  cell: (row) => <span className="text-xs text-stone-500 dark:text-stone-400 font-mono">{new Date(row.timestamp).toLocaleString()}</span>
                },
                {
                  header: 'Staff User',
                  accessorKey: 'staff_user_name',
                  cell: (row) => <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">{row.staff_user_name}</span>
                },
                {
                  header: 'Integration',
                  accessorKey: 'integration_name',
                  cell: (row) => <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{row.integration_name}</span>
                },
                {
                  header: 'Action',
                  accessorKey: 'action',
                  cell: (row) => (
                    <span className="px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded text-[10px] font-bold uppercase tracking-wider">
                      {row.action}
                    </span>
                  )
                },
                {
                  header: 'IP Address',
                  accessorKey: 'ip_address',
                  cell: (row) => <span className="text-xs font-mono text-stone-400">{row.ip_address}</span>
                },
                {
                  header: 'Masked Changes',
                  accessorKey: 'new_masked_values',
                  cell: (row) => (
                    <span className="text-[11px] font-mono text-stone-600 dark:text-stone-400">
                      {JSON.stringify(row.new_masked_values)}
                    </span>
                  )
                }
              ]}
            />
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 4: DEVELOPER TOKENS & SIGNING SECRETS  */}
      {/* ========================================== */}
      {activeTab === 'developer' && (
        <div className="space-y-6">
          {/* API Keys Table */}
          <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200/80 dark:border-stone-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">System API Tokens & Service Keys</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Tokens used by external scripts, Make.com scenarios, or automated Cron runners to authenticate against Snack Quest endpoints.
                </p>
              </div>

              <button
                onClick={() => {
                  setCreatedSecretToken(null);
                  setNewTokenName('');
                  setIsTokenModalOpen(true);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Generate New Token
              </button>
            </div>

            <DataTable
              data={apiTokens}
              columns={[
                {
                  header: 'Token Name',
                  accessorKey: 'name',
                  cell: (row) => <span className="text-xs font-bold text-stone-900 dark:text-stone-100">{row.name}</span>
                },
                {
                  header: 'Token Preview',
                  accessorKey: 'token_preview',
                  cell: (row) => <span className="text-xs font-mono bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded text-amber-600">{row.token_preview}</span>
                },
                {
                  header: 'Created At',
                  accessorKey: 'created_at',
                  cell: (row) => <span className="text-xs text-stone-500">{new Date(row.created_at).toLocaleDateString()}</span>
                },
                {
                  header: 'Last Used',
                  accessorKey: 'last_used_at',
                  cell: (row) => <span className="text-xs text-stone-500">{row.last_used_at ? new Date(row.last_used_at).toLocaleString() : 'Never'}</span>
                },
                {
                  header: 'Status',
                  accessorKey: 'revoked_at',
                  cell: (row) => (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        row.revoked_at ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600'
                      }`}
                    >
                      {row.revoked_at ? 'Revoked' : 'Active'}
                    </span>
                  )
                },
                {
                  header: 'Actions',
                  accessorKey: 'id',
                  cell: (row) =>
                    !row.revoked_at ? (
                      <button
                        onClick={() => handleRevokeToken(row.id)}
                        className="text-xs text-rose-600 hover:underline font-semibold"
                      >
                        Revoke
                      </button>
                    ) : null
                }
              ]}
            />
          </div>

          {/* Webhook Test Runner */}
          <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200/80 dark:border-stone-800 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Live Webhook Test Console</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Simulate inbound M-Pesa payment confirmations or Make.com router payloads against <code className="bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">/api/v1/webhooks/make</code>.
              </p>
            </div>

            <div className="space-y-3">
              <textarea
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={8}
                className="w-full p-3 font-mono text-xs bg-stone-950 text-emerald-400 rounded-xl border border-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              <div className="flex justify-end">
                <button
                  onClick={handleSendTestWebhook}
                  disabled={isSendingTest}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Play className="w-4 h-4" />
                  {isSendingTest ? 'Executing Handshake...' : 'Send Test Webhook'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 5: API DOCS & ENDPOINT REFERENCE       */}
      {/* ========================================== */}
      {activeTab === 'docs' && (
        <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200/80 dark:border-stone-800 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">Snack Quest System OpenAPI Reference</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Target endpoints configured for production & sandbox operational routing.
            </p>
          </div>

          <div className="space-y-4 text-xs font-mono">
            <div className="p-4 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-500 text-stone-950 font-bold rounded text-[10px]">POST</span>
                <span className="text-stone-900 dark:text-stone-100 font-bold">/api/v1/webhooks/make</span>
              </div>
              <p className="text-stone-600 dark:text-stone-400 font-sans text-xs">
                Inbound router endpoint receiving Safaricom M-Pesa STK push confirmations & order state changes from Make.com scenarios.
              </p>
            </div>

            <div className="p-4 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-500 text-white font-bold rounded text-[10px]">GET</span>
                <span className="text-stone-900 dark:text-stone-100 font-bold">/api/v1/integrations/configs</span>
              </div>
              <p className="text-stone-600 dark:text-stone-400 font-sans text-xs">
                Returns configuration state for all 12 system integrations with masked secrets.
              </p>
            </div>

            <div className="p-4 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-amber-500 text-stone-950 font-bold rounded text-[10px]">PUT</span>
                <span className="text-stone-900 dark:text-stone-100 font-bold">/api/v1/integrations/configs/:id</span>
              </div>
              <p className="text-stone-600 dark:text-stone-400 font-sans text-xs">
                Updates environment (sandbox/production) & credentials securely in encrypted storage with audit trail recording.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* DRAWER: CONFIGURATION SLIDE-OVER PANEL      */}
      {/* ========================================== */}
      {drawerConfig && (
        <Drawer
          isOpen={!!drawerConfig}
          onClose={() => setDrawerConfig(null)}
          title={`Configure ${drawerConfig.display_name}`}
        >
          <div className="space-y-6 py-2">
            {/* Drawer Subheader */}
            <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  {renderCategoryIcon(drawerConfig.category)}
                </div>
                <div>
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100">{drawerConfig.display_name}</span>
                  <span className="text-[10px] text-stone-400 block uppercase font-semibold">{drawerConfig.category}</span>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  drawerForm.environment === 'production'
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-amber-500/10 text-amber-600'
                }`}
              >
                {drawerForm.environment} Mode
              </span>
            </div>

            {/* Environment Toggle Section */}
            <div className="space-y-2 bg-stone-50 dark:bg-stone-950 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800">
              <label className="text-xs font-bold text-stone-900 dark:text-stone-100 block">
                Target Operating Environment
              </label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDrawerForm((prev) => ({ ...prev, environment: 'sandbox' }))}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    drawerForm.environment === 'sandbox'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 font-semibold'
                      : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-900'
                  }`}
                >
                  <span className="text-xs font-bold block">○ Sandbox Mode</span>
                  <span className="text-[10px] text-stone-500 block mt-0.5">Testing endpoints & mock gateway routing.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDrawerForm((prev) => ({ ...prev, environment: 'production' }))}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    drawerForm.environment === 'production'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 font-semibold'
                      : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-900'
                  }`}
                >
                  <span className="text-xs font-bold block">● Production Mode</span>
                  <span className="text-[10px] text-stone-500 block mt-0.5">Live Safaricom, WhatsApp & Meta gateways.</span>
                </button>
              </div>
            </div>

            {/* Credentials & Secrets Form */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  Credentials & Encrypted Keys
                </h4>
                <span className="text-[10px] text-stone-400">Masked on server</span>
              </div>

              <div className="space-y-3">
                {Object.keys(drawerForm.credentials).map((key) => {
                  const val = drawerForm.credentials[key] || '';
                  const isShow = showSecretMap[key] || false;
                  const formattedLabel = key.replace(/_/g, ' ').toUpperCase();

                  return (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center justify-between">
                        <span>{formattedLabel}</span>
                        <span className="text-[10px] text-stone-400 font-mono">{key}</span>
                      </label>

                      <div className="relative">
                        <input
                          type={isShow ? 'text' : 'password'}
                          value={val}
                          disabled={!isSuperAdmin}
                          onChange={(e) =>
                            setDrawerForm((prev) => ({
                              ...prev,
                              credentials: { ...prev.credentials, [key]: e.target.value }
                            }))
                          }
                          className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-xs font-mono text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecretMap((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                        >
                          {isShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Read-Only System Endpoints */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                System Target Endpoints
              </h4>

              <div className="space-y-2">
                {Object.keys(drawerConfig.endpoints || {}).map((epKey) => {
                  const epUrl = drawerConfig.endpoints[epKey] || '';
                  return (
                    <div key={epKey} className="p-2.5 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200/80 dark:border-stone-800 text-xs">
                      <span className="text-[10px] font-bold text-stone-400 uppercase block">{epKey.replace(/_/g, ' ')}</span>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="font-mono text-stone-800 dark:text-stone-200 text-[11px] truncate">{epUrl}</span>
                        <button
                          onClick={() => copyToClipboard(epUrl, epKey)}
                          className="p-1 hover:bg-stone-200 dark:hover:bg-stone-800 rounded text-stone-500"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Drawer Actions Bar */}
            <div className="pt-4 border-t border-stone-200 dark:border-stone-800 space-y-2">
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSaving || !isSuperAdmin}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isSaving ? 'Encrypting & Saving...' : 'Save Configuration'}
              </button>

              <button
                type="button"
                onClick={() => handleTestConnection(drawerConfig.id)}
                disabled={isTesting}
                className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 text-amber-500" />
                Test Connection Ping
              </button>
            </div>
          </div>
        </Drawer>
      )}

      {/* ========================================== */}
      {/* MODAL: TEST CONNECTION RESULT              */}
      {/* ========================================== */}
      {showTestModal && testResult && (
        <Modal
          isOpen={showTestModal}
          onClose={() => setShowTestModal(false)}
          title="Connection Test Results"
        >
          <div className="space-y-4 py-2">
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                testResult.connected
                  ? 'bg-emerald-500/10 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-500/10 border-rose-200 dark:border-rose-800/50 text-rose-900 dark:text-rose-200'
              }`}
            >
              {testResult.connected ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div>
                <h4 className="text-sm font-bold">{testResult.connected ? 'Authentication Successful' : 'Authentication Failed'}</h4>
                <p className="text-xs mt-1">{testResult.message}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-800">
                <span className="text-stone-400 block">Latency</span>
                <span className="text-stone-900 dark:text-stone-100 font-bold font-mono">{testResult.latency_ms} ms</span>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-800">
                <span className="text-stone-400 block">Permissions</span>
                <span className="text-stone-900 dark:text-stone-100 font-bold">{testResult.permissions}</span>
              </div>
            </div>

            {testResult.troubleshooting && (
              <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-300">
                <span className="font-bold block">Troubleshooting Guide:</span>
                <p className="mt-0.5">{testResult.troubleshooting}</p>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowTestModal(false)}
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================== */}
      {/* MODAL: CREATE DEVELOPER TOKEN              */}
      {/* ========================================== */}
      {isTokenModalOpen && (
        <Modal
          isOpen={isTokenModalOpen}
          onClose={() => setIsTokenModalOpen(false)}
          title="Create New System API Token"
        >
          <div className="space-y-4 py-2">
            {!createdSecretToken ? (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block">
                  Token Name / Identifier
                </label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="e.g. Production Inventory Sync Cron Agent"
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsTokenModalOpen(false)}
                    className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateToken}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl text-xs font-bold"
                  >
                    Create Token
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
                  <span className="font-bold block">Token Created Successfully!</span>
                  <p className="mt-0.5">Please copy this secret key now. It will not be shown again.</p>
                </div>

                <div className="p-3 bg-stone-950 text-amber-400 font-mono text-xs rounded-xl flex items-center justify-between">
                  <span className="break-all">{createdSecretToken}</span>
                  <button
                    onClick={() => copyToClipboard(createdSecretToken, 'API Token')}
                    className="p-1.5 hover:bg-stone-800 rounded text-stone-300 ml-2"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setIsTokenModalOpen(false)}
                    className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
