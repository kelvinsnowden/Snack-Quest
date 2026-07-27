import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Bot,
  UserCheck,
  RefreshCw,
  Zap,
  Activity,
  Search,
  Sliders,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  Play,
  FileText,
  Smartphone,
  Check,
  TrendingUp,
  AlertTriangle,
  Send,
  Database
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ConversationIntelligenceConsole: React.FC = () => {
  const { addToast } = useApp();

  const [loading, setLoading] = useState(true);
  const [dashboardMetrics, setDashboardMetrics] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionDetail, setSessionDetail] = useState<any>(null);
  const [selectedJourney, setSelectedJourney] = useState<any>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Intent Classifier Sandbox State
  const [intentTestText, setIntentTestText] = useState('Where is my package? I paid yesterday via M-Pesa.');
  const [intentTestResult, setIntentTestResult] = useState<any>(null);
  const [isClassifying, setIsClassifying] = useState(false);

  // AI Context Inspection State
  const [aiContextResult, setAiContextResult] = useState<any>(null);
  const [isBuildingContext, setIsBuildingContext] = useState(false);

  // Active Tab in Console
  const [activeConsoleTab, setActiveConsoleTab] = useState<
    'sessions' | 'journey' | 'intent_sandbox' | 'ai_context' | 'recovery' | 'analytics'
  >('sessions');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [dashRes, sessRes, analyticsRes] = await Promise.all([
        fetch('/api/v1/conversations/dashboard'),
        fetch(`/api/v1/conversations?state=${stateFilter}&intent=${intentFilter}&search=${searchQuery}`),
        fetch('/api/v1/conversations/analytics')
      ]);

      const dashData = await dashRes.json();
      const sessData = await sessRes.json();
      const analyticsData = await analyticsRes.json();

      setDashboardMetrics(dashData);
      setSessions(sessData.data || []);
      setAnalytics(analyticsData.metrics || null);

      if (sessData.data && sessData.data.length > 0 && !selectedSession) {
        handleSelectSession(sessData.data[0]);
      }
    } catch (e) {
      console.error('Error fetching conversation intelligence data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [stateFilter, intentFilter]);

  const handleSelectSession = async (session: any) => {
    setSelectedSession(session);
    try {
      const [detailRes, journeyRes] = await Promise.all([
        fetch(`/api/v1/conversations/${session.session_id}`),
        fetch(`/api/v1/conversations/journey/${session.customer_id}`)
      ]);
      const detailData = await detailRes.json();
      const journeyData = await journeyRes.json();

      setSessionDetail(detailData);
      setSelectedJourney(journeyData);
    } catch (e) {
      console.error('Error loading session detail:', e);
    }
  };

  const handleClassifyIntent = async () => {
    if (!intentTestText) return;
    setIsClassifying(true);
    try {
      const res = await fetch('/api/v1/conversations/intent/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: intentTestText,
          session_id: selectedSession?.session_id
        })
      });
      const data = await res.json();
      setIntentTestResult(data);
      addToast({
        type: 'success',
        title: 'Intent Classified',
        message: `Detected intent: ${data.detected_intent.toUpperCase()} (Confidence: ${(data.confidence_score * 100).toFixed(0)}%)`
      });
    } catch (e) {
      addToast({ type: 'error', title: 'Classification Failed', message: 'Could not classify intent.' });
    } finally {
      setIsClassifying(false);
    }
  };

  const handleBuildAiContext = async () => {
    if (!selectedSession) return;
    setIsBuildingContext(true);
    try {
      const res = await fetch('/api/v1/conversations/ai-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: selectedSession.session_id,
          whatsapp_number: selectedSession.whatsapp_number
        })
      });
      const data = await res.json();
      setAiContextResult(data);
      addToast({
        type: 'success',
        title: 'AI Context Assembled',
        message: `Synthesized full context prompt for ${data.assembled_context?.customer_name || 'Customer'}`
      });
    } catch (e) {
      addToast({ type: 'error', title: 'Context Error', message: 'Failed to assemble AI context.' });
    } finally {
      setIsBuildingContext(false);
    }
  };

  const handleTriggerRecovery = async (recoveryType: string) => {
    if (!selectedSession) return;
    try {
      const res = await fetch('/api/v1/conversations/recovery/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: selectedSession.session_id,
          recovery_type: recoveryType
        })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Recovery Action Triggered',
          message: data.message
        });
        fetchDashboardData();
        if (selectedSession) handleSelectSession(selectedSession);
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Recovery Error', message: 'Could not execute recovery workflow.' });
    }
  };

  const handleStateTransition = async (targetState: string) => {
    if (!selectedSession) return;
    try {
      const res = await fetch('/api/v1/conversations/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: selectedSession.session_id,
          to_state: targetState,
          actor: 'staff_operator',
          message_summary: `Manual state override by operator to ${targetState}`
        })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'State Transitioned',
          message: `Moved session to ${targetState}`
        });
        fetchDashboardData();
        if (selectedSession) handleSelectSession(selectedSession);
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Transition Failed', message: 'Could not execute state transition.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Stage 9.5 Engine Active
            </span>
            <span className="text-xs text-[#A1A1AA]">WhatChimp Conversational Architecture</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-400" /> Conversation State Engine & Intelligence
          </h2>
          <p className="text-sm text-[#A1A1AA] mt-1">
            Centralized single source of truth for WhatsApp sessions, state machine transitions, intent classification, and AI context assembly.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="px-3 py-2 bg-[#27272A] hover:bg-[#3F3F46] text-white rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh State
          </button>
        </div>
      </div>

      {/* Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#18181B] border border-[#27272A] p-4 rounded-xl">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium">
            <span>Active WhatsApp Sessions</span>
            <MessageSquare className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {dashboardMetrics?.summary?.active_conversations ?? 0}
            <span className="text-xs text-[#A1A1AA] font-normal ml-2">/ {dashboardMetrics?.summary?.total_conversations ?? 0} Total</span>
          </div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> State machine synchronized
          </div>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] p-4 rounded-xl">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium">
            <span>Bot Automation Rate</span>
            <Bot className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {dashboardMetrics?.summary?.bot_automation_rate_pct ?? 91.5}%
          </div>
          <div className="text-[11px] text-[#A1A1AA] mt-1">
            {dashboardMetrics?.summary?.assigned_to_human ?? 0} human escalations
          </div>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] p-4 rounded-xl">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium">
            <span>Avg Checkout Duration</span>
            <Clock className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {dashboardMetrics?.summary?.avg_checkout_time_minutes ?? 3.4} min
          </div>
          <div className="text-[11px] text-purple-400 mt-1">
            Landing page to M-Pesa receipt
          </div>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] p-4 rounded-xl">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium">
            <span>Automated Recoveries</span>
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {dashboardMetrics?.summary?.recovered_conversations ?? 0}
          </div>
          <div className="text-[11px] text-amber-400 mt-1">
            Payment & Station timeout fixes
          </div>
        </div>
      </div>

      {/* Section Navigation Tabs */}
      <div className="border-b border-[#27272A] flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'sessions', label: 'Session State Matrix', icon: MessageSquare },
          { id: 'journey', label: 'Customer Journey Timeline', icon: Clock },
          { id: 'intent_sandbox', label: 'Intent Classification Engine', icon: Sparkles },
          { id: 'ai_context', label: 'AI Context Builder', icon: Bot },
          { id: 'recovery', label: 'Recovery Engine', icon: Zap },
          { id: 'analytics', label: 'Conversational Analytics', icon: TrendingUp }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeConsoleTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveConsoleTab(tab.id as any)}
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

      {/* TAB 1: Session State Matrix */}
      {activeConsoleTab === 'sessions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sessions List */}
          <div className="lg:col-span-1 bg-[#18181B] border border-[#27272A] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">WhatsApp Sessions ({sessions.length})</h3>
            </div>

            {/* Filter Bar */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#71717A]" />
                <input
                  type="text"
                  placeholder="Search name, phone, order..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchDashboardData()}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white text-xs rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="bg-[#09090B] border border-[#27272A] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                >
                  <option value="all">All States</option>
                  <option value="WHATSAPP_STARTED">WHATSAPP_STARTED</option>
                  <option value="PACKAGE_SELECTED">PACKAGE_SELECTED</option>
                  <option value="PICKUP_SELECTED">PICKUP_SELECTED</option>
                  <option value="DELIVERY_QUOTED">DELIVERY_QUOTED</option>
                  <option value="WAITING_PAYMENT">WAITING_PAYMENT</option>
                  <option value="READY_FOR_PICKUP">READY_FOR_PICKUP</option>
                </select>

                <select
                  value={intentFilter}
                  onChange={(e) => setIntentFilter(e.target.value)}
                  className="bg-[#09090B] border border-[#27272A] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                >
                  <option value="all">All Intents</option>
                  <option value="buying">Buying</option>
                  <option value="order_tracking">Tracking</option>
                  <option value="changing_delivery">Changing Delivery</option>
                  <option value="support">Support</option>
                </select>
              </div>
            </div>

            {/* List Items */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {sessions.map((sess) => {
                const isSelected = selectedSession?.session_id === sess.session_id;
                return (
                  <div
                    key={sess.session_id}
                    onClick={() => handleSelectSession(sess)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-600/10 border-blue-500'
                        : 'bg-[#09090B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{sess.customer_name}</span>
                      <span className="text-[10px] text-[#A1A1AA]">+{sess.whatsapp_number}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {sess.current_state}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {sess.current_intent}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#71717A] mt-2 flex items-center justify-between">
                      <span>Order: {sess.active_order_id || 'None'}</span>
                      <span>Agent: {sess.assigned_agent}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Session Detail & State Machine Control */}
          <div className="lg:col-span-2 space-y-6">
            {selectedSession ? (
              <>
                <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        {selectedSession.customer_name}
                        <span className="text-xs font-normal text-[#A1A1AA]">
                          ({selectedSession.session_id})
                        </span>
                      </h3>
                      <p className="text-xs text-[#A1A1AA] mt-0.5">
                        WhatsApp: +{selectedSession.whatsapp_number} • Language: {selectedSession.language}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStateTransition('WAITING_PAYMENT')}
                        className="px-2.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Force Payment State
                      </button>
                      <button
                        onClick={() => handleTriggerRecovery('stk_retry')}
                        className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Retry STK Push
                      </button>
                    </div>
                  </div>

                  {/* Operational Attributes Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-[#09090B] p-2.5 rounded-lg border border-[#27272A]">
                      <span className="text-[#A1A1AA] block text-[10px]">Current State</span>
                      <span className="font-semibold text-blue-400">{selectedSession.current_state}</span>
                    </div>
                    <div className="bg-[#09090B] p-2.5 rounded-lg border border-[#27272A]">
                      <span className="text-[#A1A1AA] block text-[10px]">Intent Classification</span>
                      <span className="font-semibold text-purple-400">{selectedSession.current_intent}</span>
                    </div>
                    <div className="bg-[#09090B] p-2.5 rounded-lg border border-[#27272A]">
                      <span className="text-[#A1A1AA] block text-[10px]">Active Order</span>
                      <span className="font-semibold text-white">{selectedSession.active_order_id || 'None'}</span>
                    </div>
                    <div className="bg-[#09090B] p-2.5 rounded-lg border border-[#27272A]">
                      <span className="text-[#A1A1AA] block text-[10px]">Pickup Station</span>
                      <span className="font-semibold text-emerald-400 truncate block">
                        {selectedSession.selected_pickup_station || 'None'}
                      </span>
                    </div>
                  </div>

                  {/* Manual State Shift Trigger */}
                  <div className="bg-[#09090B] p-4 rounded-xl border border-[#27272A] space-y-2">
                    <span className="text-xs font-semibold text-white block">
                      Granular State Transition Override
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        'WHATSAPP_STARTED',
                        'PACKAGE_SELECTED',
                        'PICKUP_SELECTED',
                        'DELIVERY_QUOTED',
                        'STK_SENT',
                        'WAITING_PAYMENT',
                        'READY_FOR_PICKUP',
                        'COLLECTED'
                      ].map((st) => (
                        <button
                          key={st}
                          onClick={() => handleStateTransition(st)}
                          disabled={selectedSession.current_state === st}
                          className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                            selectedSession.current_state === st
                              ? 'bg-blue-600 text-white font-semibold'
                              : 'bg-[#18181B] hover:bg-[#27272A] text-[#A1A1AA]'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* State Machine Transition Event Log */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-blue-400" /> State Transition History ({sessionDetail?.events?.length || 0})
                    </h4>

                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                      {sessionDetail?.events?.map((ev: any) => (
                        <div
                          key={ev.id}
                          className="bg-[#09090B] border border-[#27272A] p-3 rounded-lg text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-blue-400">
                              {ev.from_state} → {ev.to_state}
                            </span>
                            <span className="text-[10px] text-[#A1A1AA]">
                              {new Date(ev.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-[#A1A1AA]">{ev.message_summary}</p>
                          <div className="text-[10px] text-[#71717A] flex items-center gap-3">
                            <span>Actor: {ev.actor}</span>
                            <span>Channel: {ev.channel}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-12 text-center text-[#A1A1AA]">
                Select a conversation session to inspect details
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Customer Journey Timeline */}
      {activeConsoleTab === 'journey' && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#27272A] pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-400" /> Unified Customer Journey Mapping
              </h3>
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                Chronological aggregation across TikTok Ad Click, Landing Page SDK, WhatsApp State Machine, M-Pesa STK Push, Delivery, and Quest Center.
              </p>
            </div>

            {selectedSession && (
              <span className="text-xs text-white font-medium bg-[#09090B] px-3 py-1.5 rounded-lg border border-[#27272A]">
                Customer: {selectedSession.customer_name} (+{selectedSession.whatsapp_number})
              </span>
            )}
          </div>

          <div className="relative border-l-2 border-[#27272A] ml-4 space-y-6 pl-6">
            {selectedJourney?.timeline?.map((evt: any, idx: number) => (
              <div key={idx} className="relative group">
                {/* Event Bullet Node */}
                <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#18181B]" />

                <div className="bg-[#09090B] border border-[#27272A] p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {evt.event_type}
                    </span>
                    <span className="text-xs text-[#A1A1AA]">
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-white">{evt.summary}</p>

                  <div className="flex items-center gap-4 text-xs text-[#A1A1AA]">
                    <span>Channel: <strong className="text-white">{evt.channel}</strong></span>
                    <span>Actor: <strong className="text-white">{evt.actor}</strong></span>
                  </div>

                  {evt.details && (
                    <pre className="bg-[#18181B] p-2 rounded text-[11px] text-emerald-400 overflow-x-auto border border-[#27272A]">
                      {JSON.stringify(evt.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Intent Classification Sandbox */}
      {activeConsoleTab === 'intent_sandbox' && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" /> WhatsApp Intent Classification Engine
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Test message intent detection against 15+ conversational commerce intents (buying, order tracking, refund, pickup station changes, etc.).
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Form */}
            <div className="space-y-4">
              <label className="text-xs font-semibold text-white block">
                Sample Incoming WhatsApp Message Text
              </label>
              <textarea
                rows={4}
                value={intentTestText}
                onChange={(e) => setIntentTestText(e.target.value)}
                className="w-full bg-[#09090B] border border-[#27272A] text-white text-xs rounded-xl p-3 focus:outline-none focus:border-purple-500"
                placeholder="Type customer message here..."
              />

              <button
                onClick={handleClassifyIntent}
                disabled={isClassifying}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Play className={`h-3.5 w-3.5 ${isClassifying ? 'animate-spin' : ''}`} /> Run Intent Classifier
              </button>

              <div className="space-y-2 pt-2">
                <span className="text-xs text-[#A1A1AA] font-medium block">Quick Sample Prompts:</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    'I want to order 2 Mega Feast Boxes to Westlands',
                    'Where is my delivery? Tracking code SQ-KSM-991',
                    'Can I change my pickup station to Sarit Centre?',
                    'How do I submit my TikTok unboxing for Quest Credits?'
                  ].map((p) => (
                    <button
                      key={p}
                      onClick={() => setIntentTestText(p)}
                      className="px-2.5 py-1 bg-[#09090B] hover:bg-[#27272A] border border-[#27272A] text-[11px] text-[#A1A1AA] hover:text-white rounded-lg transition-colors cursor-pointer text-left"
                    >
                      "{p}"
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Classification Output */}
            <div className="bg-[#09090B] border border-[#27272A] rounded-xl p-5 space-y-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider text-[#A1A1AA]">
                Classification Result
              </h4>

              {intentTestResult ? (
                <div className="space-y-4">
                  <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                    <span className="text-xs text-purple-300 block font-medium">Detected Intent</span>
                    <span className="text-lg font-bold text-white uppercase">
                      {intentTestResult.detected_intent}
                    </span>
                    <span className="text-xs text-[#A1A1AA] block mt-1">
                      Confidence Score: {(intentTestResult.confidence_score * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="text-xs text-[#A1A1AA] space-y-1">
                    <p><strong>Processed Text:</strong> "{intentTestResult.text}"</p>
                    <p><strong>Routing Strategy:</strong> Auto-route to WhatChimp intent handler <code>handleIntent_{intentTestResult.detected_intent}</code></p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#71717A] italic">Run classifier to view intent analysis output</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AI Context Builder */}
      {activeConsoleTab === 'ai_context' && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#27272A] pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Bot className="h-5 w-5 text-emerald-400" /> AI Context Builder
              </h3>
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                Synthesizes complete customer profile, orders, wallet balances, state machine, and conversation history into a clean system prompt payload for Gemini AI.
              </p>
            </div>

            <button
              onClick={handleBuildAiContext}
              disabled={isBuildingContext || !selectedSession}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Bot className={`h-3.5 w-3.5 ${isBuildingContext ? 'animate-spin' : ''}`} /> Assemble Prompt Context
            </button>
          </div>

          {aiContextResult ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-[#09090B] p-3 rounded-lg border border-[#27272A]">
                  <span className="text-[#A1A1AA] block text-[10px]">Customer</span>
                  <span className="font-semibold text-white">{aiContextResult.assembled_context?.customer_name}</span>
                </div>
                <div className="bg-[#09090B] p-3 rounded-lg border border-[#27272A]">
                  <span className="text-[#A1A1AA] block text-[10px]">Quest Wallet</span>
                  <span className="font-semibold text-emerald-400">
                    KES {aiContextResult.assembled_context?.wallet_balance_kes}
                  </span>
                </div>
                <div className="bg-[#09090B] p-3 rounded-lg border border-[#27272A]">
                  <span className="text-[#A1A1AA] block text-[10px]">Session State</span>
                  <span className="font-semibold text-blue-400">{aiContextResult.assembled_context?.current_state}</span>
                </div>
                <div className="bg-[#09090B] p-3 rounded-lg border border-[#27272A]">
                  <span className="text-[#A1A1AA] block text-[10px]">Intent</span>
                  <span className="font-semibold text-purple-400">{aiContextResult.assembled_context?.current_intent}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-white block mb-2">
                  Generated Gemini AI System Prompt Context
                </label>
                <pre className="bg-[#09090B] p-4 rounded-xl text-xs text-emerald-300 border border-[#27272A] font-mono whitespace-pre-wrap overflow-x-auto">
                  {aiContextResult.system_prompt_context}
                </pre>
              </div>
            </div>
          ) : (
            <div className="bg-[#09090B] border border-[#27272A] p-12 text-center text-[#A1A1AA] rounded-xl">
              Click "Assemble Prompt Context" to preview Gemini system context for {selectedSession?.customer_name || 'selected session'}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Recovery Engine Console */}
      {activeConsoleTab === 'recovery' && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" /> Automated Conversation Recovery Engine
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Handles payment timeouts, pickup station unavailability, inventory shortages, and webhook delivery delays.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#09090B] border border-[#27272A] p-5 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4" /> M-Pesa Callback Recovery
              </div>
              <p className="text-xs text-[#A1A1AA]">
                Re-triggers STK push or provides alternative Till Paybill instructions if M-Pesa prompt times out.
              </p>
              <button
                onClick={() => handleTriggerRecovery('stk_retry')}
                className="w-full py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs rounded-lg font-medium transition-colors cursor-pointer"
              >
                Trigger STK Retry
              </button>
            </div>

            <div className="bg-[#09090B] border border-[#27272A] p-5 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                <RefreshCw className="h-4 w-4" /> Station Reselection Prompt
              </div>
              <p className="text-xs text-[#A1A1AA]">
                Prompts customer with next-nearest Jumia station if preferred pickup location becomes full or unavailable.
              </p>
              <button
                onClick={() => handleTriggerRecovery('pickup_reselect')}
                className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs rounded-lg font-medium transition-colors cursor-pointer"
              >
                Prompt Station Reselect
              </button>
            </div>

            <div className="bg-[#09090B] border border-[#27272A] p-5 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
                <UserCheck className="h-4 w-4" /> Human Agent Escalation
              </div>
              <p className="text-xs text-[#A1A1AA]">
                Escalates stuck or sensitive conversation to human customer operations staff with full audit log.
              </p>
              <button
                onClick={() => handleTriggerRecovery('reassign_agent')}
                className="w-full py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs rounded-lg font-medium transition-colors cursor-pointer"
              >
                Escalate to Senior Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Conversational Analytics */}
      {activeConsoleTab === 'analytics' && analytics && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-400" /> Conversational Commerce Analytics
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Performance metrics, abandonment breakdown, and response times across all WhatsApp flows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#09090B] border border-[#27272A] p-5 rounded-xl space-y-4">
              <h4 className="text-xs font-semibold text-white">Top Abandonment States</h4>
              <div className="space-y-3">
                {analytics.abandonment_points.map((pt: any) => (
                  <div key={pt.state} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                      <span>{pt.state}</span>
                      <span className="font-semibold text-white">{pt.percentage}% ({pt.count} sessions)</span>
                    </div>
                    <div className="w-full h-2 bg-[#18181B] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${pt.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#09090B] border border-[#27272A] p-5 rounded-xl space-y-4">
              <h4 className="text-xs font-semibold text-white">Intent Breakdown</h4>
              <div className="space-y-3">
                {analytics.top_intents.map((it: any) => (
                  <div key={it.intent} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                      <span className="capitalize">{it.intent}</span>
                      <span className="font-semibold text-white">{it.percentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-[#18181B] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${it.percentage}%` }}
                      />
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
