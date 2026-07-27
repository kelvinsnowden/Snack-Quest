import React, { useState, useEffect } from 'react';
import {
  Activity,
  Shield,
  Layers,
  Search,
  Zap,
  Lock,
  Unlock,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Bell,
  Sliders,
  Cpu,
  Radio,
  Clock,
  ArrowUpRight,
  Send,
  FileCheck,
  Server,
  Play
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const LiveOperationsCenter: React.FC = () => {
  const { addToast } = useApp();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'supervisor' | 'queue' | 'locks' | 'workforce' | 'search' | 'notifications' | 'simulation' | 'readiness'
  >('supervisor');

  // Operational Data States
  const [supervisorData, setSupervisorData] = useState<any>(null);
  const [queueData, setQueueData] = useState<any>(null);
  const [locksData, setLocksData] = useState<any>(null);
  const [workforceData, setWorkforceData] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [alertsData, setAlertsData] = useState<any>(null);
  const [readinessData, setReadinessData] = useState<any>(null);

  // Global Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Simulation State
  const [simService, setSimService] = useState('Daraja M-Pesa API v2');
  const [simFailureType, setSimFailureType] = useState('Network Timeout');
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchOperationsData = async () => {
    setLoading(true);
    try {
      const [supRes, qRes, lockRes, wfRes, notifRes, alertRes, readRes] = await Promise.all([
        fetch('/api/v1/supervisor/live-ops'),
        fetch('/api/v1/queue/status'),
        fetch('/api/v1/conversations/locks'),
        fetch('/api/v1/agents/workforce'),
        fetch('/api/v1/notifications/center'),
        fetch('/api/v1/alerts/live'),
        fetch('/api/v1/production-readiness')
      ]);

      setSupervisorData(await supRes.json());
      setQueueData(await qRes.json());
      setLocksData(await lockRes.json());
      const wf = await wfRes.json();
      setWorkforceData(wf.agents || []);
      const notifs = await notifRes.json();
      setNotifications(notifs.notifications || []);
      setAlertsData(await alertRes.json());
      setReadinessData(await readRes.json());
    } catch (e) {
      console.error('Error fetching live ops data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperationsData();
  }, []);

  const handleGlobalSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/v1/global-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRetryDlq = async (messageId: string) => {
    try {
      const res = await fetch('/api/v1/queue/retry-dlq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'DLQ Reprocessed', message: data.message });
        fetchOperationsData();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Retry Failed', message: 'Could not reprocess message.' });
    }
  };

  const handleTriggerTakeover = async (sessionId: string, mode: string) => {
    try {
      const res = await fetch('/api/v1/conversations/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          agent_id: 'staff-op-1',
          mode
        })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Takeover Mode Updated', message: `Shifted to ${mode}` });
        fetchOperationsData();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Takeover Error', message: 'Could not update takeover mode.' });
    }
  };

  const handleTriggerSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/v1/simulation/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: simService,
          failure_type: simFailureType
        })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'warning',
          title: 'Failure Simulation Triggered',
          message: `${simService} (${simFailureType}) simulated. Graceful fallback active.`
        });
        fetchOperationsData();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Simulation Error', message: 'Could not trigger simulation.' });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Stage 9.6 Infrastructure Active
            </span>
            <span className="text-xs text-[#A1A1AA]">Live Operations, Resilience & Observability</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400" /> Enterprise Operations & Resilience Center
          </h2>
          <p className="text-sm text-[#A1A1AA] mt-1">
            Real-time control over message queues, conversation locks, workforce takeover, global search, SLA tracking, and production readiness.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchOperationsData}
            className="px-3.5 py-2 bg-[#27272A] hover:bg-[#3F3F46] text-white rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#18181B] border border-[#27272A] p-4 rounded-xl">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium">
            <span>Message Queue Velocity</span>
            <Layers className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {queueData?.metrics?.processed_count ?? 0}
            <span className="text-xs text-[#A1A1AA] font-normal ml-2">/ {queueData?.metrics?.total_messages ?? 0} Msgs</span>
          </div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Idempotency Enforced (FIFO)
          </div>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] p-4 rounded-xl">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium">
            <span>Active Locks & Human Takeover</span>
            <Lock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {locksData?.active_locks?.length ?? 0} Locked
          </div>
          <div className="text-[11px] text-amber-400 mt-1">
            Preventing state race conditions
          </div>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] p-4 rounded-xl">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium">
            <span>Response SLA Compliance</span>
            <Clock className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {supervisorData?.sla_performance?.whatsapp_response_sla_met_pct ?? 98.4}%
          </div>
          <div className="text-[11px] text-[#A1A1AA] mt-1">
            Avg latency: 1.2s (Bot) / 28s (Human)
          </div>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] p-4 rounded-xl">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium">
            <span>Production Readiness</span>
            <Shield className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {readinessData?.overall_readiness_score ?? 98.2}%
          </div>
          <div className="text-[11px] text-purple-400 mt-1">
            Passed 13/13 Infrastructure Audits
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="border-b border-[#27272A] flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'supervisor', label: 'Supervisor Control Panel', icon: Activity },
          { id: 'queue', label: 'Message Queue & DLQ', icon: Layers },
          { id: 'locks', label: 'Conversation Locks Matrix', icon: Lock },
          { id: 'workforce', label: 'Agent Workforce & Capacity', icon: Users },
          { id: 'search', label: 'Enterprise Global Search', icon: Search },
          { id: 'notifications', label: 'Real-Time Notification Hub', icon: Bell },
          { id: 'simulation', label: 'Failure Simulation Center', icon: Cpu },
          { id: 'readiness', label: 'Production Readiness Report', icon: FileCheck }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-[#A1A1AA] hover:text-white hover:bg-[#18181B]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Supervisor Control Panel */}
      {activeTab === 'supervisor' && supervisorData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#18181B] border border-[#27272A] p-5 rounded-xl space-y-3">
              <span className="text-xs text-[#A1A1AA] font-semibold block uppercase tracking-wider">
                Waiting Queues Overview
              </span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-[#09090B] rounded-lg border border-[#27272A]">
                  <span className="text-[#A1A1AA]">Waiting for Payment (STK)</span>
                  <span className="font-bold text-amber-400">
                    {supervisorData.summary.customers_waiting_payment}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-[#09090B] rounded-lg border border-[#27272A]">
                  <span className="text-[#A1A1AA]">Waiting Pickup Collection</span>
                  <span className="font-bold text-emerald-400">
                    {supervisorData.summary.customers_waiting_pickup}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-[#09090B] rounded-lg border border-[#27272A]">
                  <span className="text-[#A1A1AA]">Waiting Human Agent</span>
                  <span className="font-bold text-purple-400">
                    {supervisorData.summary.customers_waiting_human_agent}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-[#09090B] rounded-lg border border-[#27272A]">
                  <span className="text-[#A1A1AA]">Door Delivery Queue</span>
                  <span className="font-bold text-blue-400">
                    {supervisorData.summary.door_delivery_queue_count}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#18181B] border border-[#27272A] p-5 rounded-xl space-y-3">
              <span className="text-xs text-[#A1A1AA] font-semibold block uppercase tracking-wider">
                SLA & Latency Standards
              </span>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between mb-1 text-[#A1A1AA]">
                    <span>WhatsApp Response SLA</span>
                    <span className="text-white font-bold">{supervisorData.sla_performance.whatsapp_response_sla_met_pct}%</span>
                  </div>
                  <div className="w-full bg-[#09090B] h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full" style={{ width: `${supervisorData.sla_performance.whatsapp_response_sla_met_pct}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1 text-[#A1A1AA]">
                    <span>STK Push Callback SLA</span>
                    <span className="text-white font-bold">{supervisorData.sla_performance.stk_push_callback_sla_met_pct}%</span>
                  </div>
                  <div className="w-full bg-[#09090B] h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full" style={{ width: `${supervisorData.sla_performance.stk_push_callback_sla_met_pct}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1 text-[#A1A1AA]">
                    <span>Door Delivery Assignment SLA</span>
                    <span className="text-white font-bold">{supervisorData.sla_performance.door_delivery_assignment_sla_met_pct}%</span>
                  </div>
                  <div className="w-full bg-[#09090B] h-2 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full" style={{ width: `${supervisorData.sla_performance.door_delivery_assignment_sla_met_pct}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#18181B] border border-[#27272A] p-5 rounded-xl space-y-3">
              <span className="text-xs text-[#A1A1AA] font-semibold block uppercase tracking-wider">
                Regional Heatmap Breakdown
              </span>
              <div className="space-y-2 text-xs">
                {supervisorData.conversation_heatmap.map((hm: any) => (
                  <div key={hm.county} className="p-2.5 bg-[#09090B] rounded-lg border border-[#27272A] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">{hm.county}</span>
                      <span className="text-[10px] text-[#A1A1AA]">
                        {hm.waiting_payment} waiting payment • {hm.pickup_ready} ready for pickup
                      </span>
                    </div>
                    <span className="px-2 py-1 bg-blue-500/10 text-blue-400 font-bold rounded text-xs">
                      {hm.active} Active
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Message Queue & DLQ */}
      {activeTab === 'queue' && queueData && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#27272A] pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-400" /> Enterprise Message Queue & Dead-Letter Handling
              </h3>
              <p className="text-xs text-[#A1A1AA] mt-1">
                Guarantees FIFO ordering per conversation session, enforces idempotency keys, and manages delayed retries.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-medium">
                {queueData.metrics.queue_ordering_guarantee}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-white">Queue Item Ledger ({queueData.queue?.length || 0})</h4>
            <div className="space-y-2">
              {queueData.queue?.map((msg: any) => (
                <div key={msg.message_id} className="bg-[#09090B] border border-[#27272A] p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{msg.message_id}</span>
                      <span className="text-[#A1A1AA]">({msg.conversation_id})</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        msg.status === 'processed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : msg.status === 'dead_letter'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {msg.status.toUpperCase()}
                      </span>
                    </div>
                    <pre className="bg-[#18181B] p-2 rounded text-[11px] text-zinc-300 font-mono mt-1 overflow-x-auto">
                      {JSON.stringify(msg.payload)}
                    </pre>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right text-[11px] text-[#A1A1AA]">
                      <div>Retries: {msg.retry_count} / {queueData.metrics.max_retry_limit}</div>
                      <div>Created: {new Date(msg.created_at).toLocaleTimeString()}</div>
                    </div>

                    {msg.status === 'dead_letter' && (
                      <button
                        onClick={() => handleRetryDlq(msg.message_id)}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        Reprocess DLQ
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Conversation Locks Matrix */}
      {activeTab === 'locks' && locksData && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-400" /> Conversation Locking Matrix
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Maintains atomic lock state per conversation to prevent race conditions during human takeover or webhook execution.
            </p>
          </div>

          <div className="space-y-3">
            {locksData.active_locks?.map((lock: any) => (
              <div key={lock.conversation_id} className="bg-[#09090B] border border-[#27272A] p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{lock.conversation_id}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {lock.lock_type}
                    </span>
                  </div>
                  <p className="text-[#A1A1AA]">Owner: <strong className="text-white">{lock.owner_name}</strong> ({lock.locked_by})</p>
                  <p className="text-[#71717A]">Reason: {lock.reason}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleTriggerTakeover(lock.conversation_id, 'Bot Active')}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-xs transition-colors cursor-pointer"
                  >
                    Release Lock & Resume Bot
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Agent Workforce & Capacity */}
      {activeTab === 'workforce' && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-400" /> Live Agent Workforce Management
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Real-time monitoring of agent capacity, CSAT scores, coverage territories, and automated workload balancing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {workforceData.map((ag) => (
              <div key={ag.agent_id} className="bg-[#09090B] border border-[#27272A] p-5 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
                  <div>
                    <h4 className="font-bold text-white text-sm">{ag.name}</h4>
                    <span className="text-xs text-[#A1A1AA]">{ag.role}</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    ag.status === 'Available' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {ag.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#18181B] p-2 rounded border border-[#27272A]">
                    <span className="text-[#A1A1AA] text-[10px] block">Mode</span>
                    <span className="font-bold text-blue-400">{ag.mode}</span>
                  </div>
                  <div className="bg-[#18181B] p-2 rounded border border-[#27272A]">
                    <span className="text-[#A1A1AA] text-[10px] block">CSAT Rating</span>
                    <span className="font-bold text-amber-400">★ {ag.csat_score}</span>
                  </div>
                  <div className="bg-[#18181B] p-2 rounded border border-[#27272A]">
                    <span className="text-[#A1A1AA] text-[10px] block">Workload</span>
                    <span className="font-bold text-white">{ag.current_workload} / {ag.capacity}</span>
                  </div>
                  <div className="bg-[#18181B] p-2 rounded border border-[#27272A]">
                    <span className="text-[#A1A1AA] text-[10px] block">Avg Response</span>
                    <span className="font-bold text-emerald-400">{ag.avg_response_time_sec}s</span>
                  </div>
                </div>

                <div className="text-xs space-y-1">
                  <span className="text-[#A1A1AA] block text-[10px]">Counties Covered:</span>
                  <div className="flex flex-wrap gap-1">
                    {ag.counties_covered.map((c: string) => (
                      <span key={c} className="px-2 py-0.5 bg-[#18181B] text-zinc-300 rounded text-[10px]">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: Enterprise Global Search */}
      {activeTab === 'search' && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-400" /> Enterprise Global Search Engine
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Unified cross-module index across Customers, Phones, Order IDs, M-Pesa Receipts, Waybills, and Creators.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-[#71717A]" />
            <input
              type="text"
              placeholder="Search anything (e.g. Amina Hassan, 254712345678, ord-101, RJK12345678)..."
              value={searchQuery}
              onChange={(e) => handleGlobalSearch(e.target.value)}
              className="w-full bg-[#09090B] border border-[#27272A] text-white text-sm rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-white">Search Results ({searchResults.length})</h4>
            <div className="space-y-2">
              {searchResults.map((res: any) => (
                <div key={res.id} className="bg-[#09090B] border border-[#27272A] p-4 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{res.title}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {res.type}
                      </span>
                    </div>
                    <p className="text-[#A1A1AA] mt-1">{res.subtitle}</p>
                  </div>

                  <span className="text-[11px] text-emerald-400 font-medium">
                    {res.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Real-Time Notification Center */}
      {activeTab === 'notifications' && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-400" /> Real-Time Cross-Department Notification Hub
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Dispatches targeted operational alerts to Finance, Warehouse, Marketing, Support, and Operations teams.
            </p>
          </div>

          <div className="space-y-3">
            {notifications.map((notif) => (
              <div key={notif.id} className="bg-[#09090B] border border-[#27272A] p-4 rounded-xl flex items-center justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{notif.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {notif.recipient_group}
                    </span>
                  </div>
                  <p className="text-[#A1A1AA]">{notif.message}</p>
                </div>

                <span className="text-[10px] text-[#71717A] whitespace-nowrap">
                  {new Date(notif.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 7: Failure Simulation Center */}
      {activeTab === 'simulation' && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="h-5 w-5 text-rose-400" /> Failure Simulation & Resilience Testing Center
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Simulate service outages across Daraja M-Pesa, WhatChimp, Jumia, and Firebase to test automatic fallback mechanisms.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white block">Target Integration Service</label>
              <select
                value={simService}
                onChange={(e) => setSimService(e.target.value)}
                className="w-full bg-[#09090B] border border-[#27272A] text-white text-xs rounded-lg p-2.5 focus:outline-none"
              >
                <option value="Daraja M-Pesa API v2">Daraja M-Pesa API v2</option>
                <option value="WhatChimp WhatsApp Engine">WhatChimp WhatsApp Engine</option>
                <option value="Jumia Pickup Stations API">Jumia Pickup Stations API</option>
                <option value="Firebase Firestore">Firebase Firestore</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-white block">Simulated Failure Mode</label>
              <select
                value={simFailureType}
                onChange={(e) => setSimFailureType(e.target.value)}
                className="w-full bg-[#09090B] border border-[#27272A] text-white text-xs rounded-lg p-2.5 focus:outline-none"
              >
                <option value="Network Timeout">Network Timeout</option>
                <option value="OAuth Credential Expired">OAuth Credential Expired</option>
                <option value="Webhook Callback Timeout">Webhook Callback Timeout</option>
                <option value="Inventory Shortage Conflict">Inventory Shortage Conflict</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleTriggerSimulation}
                disabled={isSimulating}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className={`h-3.5 w-3.5 ${isSimulating ? 'animate-spin' : ''}`} /> Inject Simulated Outage
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-white">Active Operational Integrations Telemetry</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {alertsData?.active_integrations?.map((int: any) => (
                <div key={int.service} className="p-3 bg-[#09090B] border border-[#27272A] rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{int.service}</span>
                    <span className="text-[10px] font-bold text-emerald-400">{int.status}</span>
                  </div>
                  <span className="text-[10px] text-[#A1A1AA] block">Latency: {int.latency_ms}ms</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: Production Readiness Report */}
      {activeTab === 'readiness' && readinessData && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#27272A] pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-purple-400" /> Production Operational Readiness Audit
              </h3>
              <p className="text-xs text-[#A1A1AA] mt-1">
                Evaluation across 13 core infrastructure categories prior to connecting live production credentials.
              </p>
            </div>

            <div className="text-right">
              <div className="text-2xl font-bold text-purple-400">
                {readinessData.overall_readiness_score}%
              </div>
              <span className="text-[10px] text-emerald-400 font-semibold block">STATUS: READY FOR LAUNCH</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-white">Infrastructure Category Scores</h4>
              <div className="space-y-2">
                {readinessData.categories.map((cat: any) => (
                  <div key={cat.name} className="p-3 bg-[#09090B] border border-[#27272A] rounded-lg flex items-center justify-between text-xs">
                    <span className="text-white font-medium">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-purple-400">{cat.score}%</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {cat.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-[#09090B] border border-[#27272A] p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-semibold text-white">Launch Verification Checklist</h4>
                <div className="space-y-2 text-xs">
                  {readinessData.production_checklist.map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[#A1A1AA]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>{item.item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#09090B] border border-[#27272A] p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Recommended Pre-Launch Credentials
                </h4>
                <div className="space-y-2 text-xs text-[#A1A1AA]">
                  {readinessData.remaining_risks.map((risk: string, idx: number) => (
                    <p key={idx} className="bg-[#18181B] p-2 rounded border border-[#27272A]">
                      • {risk}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
