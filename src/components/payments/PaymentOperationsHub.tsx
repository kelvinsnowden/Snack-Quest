import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  DollarSign,
  Smartphone,
  ShieldCheck,
  Send,
  Zap,
  ArrowUpRight,
  FileText,
  Clock,
  XCircle,
  CornerUpLeft,
  Sliders,
  Check,
  Building,
  HelpCircle,
  Eye,
  Activity,
  History,
  TrendingUp,
  Bell,
  Box,
  RotateCcw,
  BarChart3,
  CheckCheck,
  ShieldAlert
} from 'lucide-react';

import { DarajaConfigCenter } from './DarajaConfigCenter';
import { B2CPayoutEngine } from './B2CPayoutEngine';
import { ReversalsCenter } from './ReversalsCenter';
import { ReconciliationEngine } from './ReconciliationEngine';
import { SettlementEngine } from './SettlementEngine';
import { FraudDetectionConsole } from './FraudDetectionConsole';

export const PaymentOperationsHub: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [gatewayHealth, setGatewayHealth] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<
    | 'ledger'
    | 'daraja_config'
    | 'b2c_payouts'
    | 'reversals'
    | 'reconciliation'
    | 'settlement'
    | 'fraud'
    | 'timeline'
    | 'gateway_health'
    | 'recovery'
    | 'analytics'
    | 'notifications'
    | 'simulator'
    | 'manual_till'
    | 'unmatched'
  >('ledger');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Timeline State
  const [timelineSearch, setTimelineSearch] = useState('ord-101');
  const [timelineData, setTimelineData] = useState<{ events: any[]; reservations: any[]; order_id?: string } | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Recovery State
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('ord-101');
  const [recoveryAction, setRecoveryAction] = useState<'replay_callback' | 'retry_stk' | 'recalculate_wallet' | 'resend_confirmation' | 'retry_downstream'>('replay_callback');
  const [recoveryNotes, setRecoveryNotes] = useState('Customer callback dropped due to network timeout');
  const [recoveryResult, setRecoveryResult] = useState<any>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Simulator State
  const [simOrderId, setSimOrderId] = useState('ord-101');
  const [simPhone, setSimPhone] = useState('0712345678');
  const [simAmount, setSimAmount] = useState('2200');
  const [simOutcome, setSimOutcome] = useState<'success' | 'cancelled' | 'insufficient_balance' | 'timeout' | 'partial_payment' | 'duplicate_callback'>('success');
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Manual Till State
  const [tillOrderId, setTillOrderId] = useState('');
  const [tillReceipt, setTillReceipt] = useState('');
  const [tillPhone, setTillPhone] = useState('0722000111');
  const [tillAmount, setTillAmount] = useState('2200');
  const [tillMessage, setTillMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tillLoading, setTillLoading] = useState(false);

  // Modal / Callback Raw Payload View State
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showPayloadModal, setShowPayloadModal] = useState(false);

  // Refund Modal State
  const [refundPayment, setRefundPayment] = useState<any>(null);
  const [refundAmountKes, setRefundAmountKes] = useState('');
  const [refundReason, setRefundReason] = useState('Customer cancellation request');
  const [refundToWallet, setRefundToWallet] = useState(true);
  const [refundLoading, setRefundLoading] = useState(false);

  // Match Unmatched State
  const [matchUnmatchedId, setMatchUnmatchedId] = useState<string | null>(null);
  const [matchTargetOrderId, setMatchTargetOrderId] = useState('');

  const fetchPaymentData = async () => {
    setLoading(true);
    try {
      const [resMetrics, resList, resUnmatched, resHealth, resAnalytics, resNotifs] = await Promise.all([
        fetch('/api/v1/payments/metrics').then((r) => r.json()),
        fetch(`/api/v1/payments/list?search=${encodeURIComponent(searchTerm)}&status=${statusFilter}`).then((r) => r.json()),
        fetch('/api/v1/payments/unmatched').then((r) => r.json()),
        fetch('/api/v1/payments/gateway-health').then((r) => r.json()),
        fetch('/api/v1/payments/analytics').then((r) => r.json()),
        fetch('/api/v1/payments/notifications').then((r) => r.json())
      ]);

      setMetrics(resMetrics);
      setPayments(resList.data || []);
      setUnmatched(resUnmatched.data || []);
      setGatewayHealth(resHealth);
      setAnalytics(resAnalytics);
      setNotifications(resNotifs.data || []);
    } catch (e) {
      console.error('Failed to load payment operations data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentData();
  }, [searchTerm, statusFilter]);

  const fetchTimeline = async (id: string) => {
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/v1/payments/timeline/${encodeURIComponent(id)}`);
      const data = await res.json();
      setTimelineData(data);
    } catch (e) {
      console.error(e);
    } fontally: {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'timeline' && timelineSearch) {
      fetchTimeline(timelineSearch);
    }
  }, [activeTab]);

  const handleRunRecovery = async () => {
    setRecoveryLoading(true);
    setRecoveryResult(null);
    try {
      const res = await fetch('/api/v1/payments/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: recoveryIdentifier,
          action: recoveryAction,
          notes: recoveryNotes
        })
      });
      const data = await res.json();
      setRecoveryResult(data);
      fetchPaymentData();
      if (data.order?.id) {
        setTimelineSearch(data.order.id);
        fetchTimeline(data.order.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await fetch('/api/v1/payments/sandbox-simulator/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: simOrderId,
          phone_number: simPhone,
          amount_kes: Number(simAmount),
          outcome: simOutcome
        })
      });
      const data = await res.json();
      setSimResult(data);
      fetchPaymentData();
    } catch (e) {
      console.error(e);
    } finally {
      setSimLoading(false);
    }
  };

  const handleManualTillVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tillOrderId || !tillReceipt) {
      setTillMessage({ type: 'error', text: 'Order ID and M-Pesa Receipt Number are required.' });
      return;
    }
    setTillLoading(true);
    setTillMessage(null);
    try {
      const res = await fetch('/api/v1/payments/manual-till-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: tillOrderId,
          mpesa_receipt_number: tillReceipt,
          phone_number: tillPhone,
          amount_kes: Number(tillAmount)
        })
      });
      const data = await res.json();
      if (res.ok) {
        setTillMessage({ type: 'success', text: data.message });
        setTillReceipt('');
        fetchPaymentData();
      } else {
        setTillMessage({ type: 'error', text: data.error || 'Manual verification failed.' });
      }
    } catch (e: any) {
      setTillMessage({ type: 'error', text: e.message || 'Verification error' });
    } finally {
      setTillLoading(false);
    }
  };

  const handleReconcileUnmatched = async (unmatchedId: string, action: 'match' | 'refund') => {
    try {
      const res = await fetch('/api/v1/payments/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unmatched_id: unmatchedId,
          order_id: matchTargetOrderId,
          action
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMatchUnmatchedId(null);
        setMatchTargetOrderId('');
        fetchPaymentData();
      } else {
        alert(data.error || 'Reconciliation failed');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleProcessRefund = async () => {
    if (!refundPayment) return;
    setRefundLoading(true);
    try {
      const res = await fetch(`/api/v1/payments/${refundPayment.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refund_amount_kes: refundAmountKes ? Number(refundAmountKes) : undefined,
          reason: refundReason,
          refund_to_wallet: refundToWallet
        })
      });
      const data = await res.json();
      if (res.ok) {
        setRefundPayment(null);
        fetchPaymentData();
      } else {
        alert(data.error || 'Refund failed');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefundLoading(false);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await fetch('/api/v1/payments/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'delivered' } : n)));
    } catch (e) {
      console.error(e);
    }
  };

  const formatKes = (cents: number) => `KSh ${(cents / 100).toLocaleString()}`;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'processing':
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <Clock className="w-3 h-3" /> STK Processing
          </span>
        );
      case 'failed':
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      case 'refunded':
      case 'partially_refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <CornerUpLeft className="w-3 h-3" /> Refunded
          </span>
        );
      default:
        return <span className="text-xs text-zinc-400">{status}</span>;
    }
  };

  const getTimelineEventBadge = (type: string) => {
    switch (type) {
      case 'checkout_started':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Checkout Started</span>;
      case 'stk_initiated':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">STK Initiated</span>;
      case 'callback_received':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Callback Received</span>;
      case 'payment_confirmed':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Payment Confirmed</span>;
      case 'inventory_reserved':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Inventory Reserved</span>;
      case 'inventory_deducted':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Inventory Deducted</span>;
      case 'wallet_updated':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Wallet Bonus Updated</span>;
      case 'handed_to_fulfillment':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">Fulfillment Handed Off</span>;
      case 'payment_recovered':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">Support Recovered</span>;
      case 'payment_failed':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">Payment Failed</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">{type}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-500" /> Enterprise Payment Operations Platform
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Immutable payment timelines, automated inventory reservation engine, gateway health center, support recovery tools & real-time analytics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchPaymentData}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Gateway Engine
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-zinc-900/90 border border-zinc-800 p-3.5 rounded-xl">
            <div className="text-xs font-medium text-zinc-400">Today's Revenue</div>
            <div className="text-lg font-bold text-emerald-400 mt-1">KSh {metrics.today_revenue_kes.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Settled payments</div>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 p-3.5 rounded-xl">
            <div className="text-xs font-medium text-zinc-400">Success Rate</div>
            <div className="text-lg font-bold text-blue-400 mt-1">{metrics.success_rate_pct}%</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">STK Push conversions</div>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 p-3.5 rounded-xl">
            <div className="text-xs font-medium text-zinc-400">Active Pending</div>
            <div className="text-lg font-bold text-amber-400 mt-1">{metrics.pending_count}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">KSh {metrics.pending_sum_kes.toLocaleString()} pending</div>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 p-3.5 rounded-xl">
            <div className="text-xs font-medium text-zinc-400">Failed / Cancelled</div>
            <div className="text-lg font-bold text-rose-400 mt-1">{metrics.failed_count}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">User timeouts / balance</div>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 p-3.5 rounded-xl">
            <div className="text-xs font-medium text-zinc-400">Unmatched / Variance</div>
            <div className="text-lg font-bold text-purple-400 mt-1">{metrics.unmatched_count}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Requires manual review</div>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 p-3.5 rounded-xl">
            <div className="text-xs font-medium text-zinc-400">Gateway Status</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-bold text-zinc-200 capitalize">{metrics.gateway_environment} ({metrics.gateway_status})</span>
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Daraja Express API</div>
          </div>
        </div>
      )}

      {/* Primary Module Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'ledger' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> Transaction Ledger ({payments.length})
        </button>

        <button
          onClick={() => setActiveTab('daraja_config')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'daraja_config' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-blue-400" /> Daraja Config
        </button>

        <button
          onClick={() => setActiveTab('b2c_payouts')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'b2c_payouts' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Send className="w-3.5 h-3.5 text-emerald-400" /> B2C Payouts
        </button>

        <button
          onClick={() => setActiveTab('reversals')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'reversals' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Reversals
        </button>

        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'reconciliation' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <CheckCheck className="w-3.5 h-3.5 text-cyan-400" /> Reconciliation Engine
        </button>

        <button
          onClick={() => setActiveTab('settlement')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'settlement' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Settlement & Net Cash
        </button>

        <button
          onClick={() => setActiveTab('fraud')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'fraud' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Fraud Risk
        </button>

        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'timeline' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <History className="w-3.5 h-3.5 text-cyan-400" /> Payment Timeline
        </button>

        <button
          onClick={() => setActiveTab('gateway_health')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'gateway_health' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" /> Gateway Health
        </button>

        <button
          onClick={() => setActiveTab('recovery')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'recovery' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-400" /> Recovery Tools
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'simulator' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" /> Test Lab
        </button>

        <button
          onClick={() => setActiveTab('manual_till')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'manual_till' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Building className="w-3.5 h-3.5 text-teal-400" /> Manual Till
        </button>

        <button
          onClick={() => setActiveTab('unmatched')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'unmatched' ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-purple-400" /> Unmatched ({unmatched.length})
        </button>
      </div>

      {/* NEW STAGE 8 TAB PANELS */}
      {activeTab === 'daraja_config' && <DarajaConfigCenter />}
      {activeTab === 'b2c_payouts' && <B2CPayoutEngine />}
      {activeTab === 'reversals' && <ReversalsCenter />}
      {activeTab === 'reconciliation' && <ReconciliationEngine />}
      {activeTab === 'settlement' && <SettlementEngine />}
      {activeTab === 'fraud' && <FraudDetectionConsole />}

      {/* TAB 1: Payment Ledger */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by M-Pesa Receipt, Phone, Order ID, Payment ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Payment Statuses</option>
                <option value="completed">Completed / Paid</option>
                <option value="processing">Processing / Pending</option>
                <option value="failed">Failed / Cancelled</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950/80 text-zinc-400 font-medium uppercase tracking-wider text-[10px] border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Transaction ID</th>
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">Customer / Phone</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">M-Pesa Receipt</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-zinc-500 font-sans">
                        No payment records matching your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 text-zinc-300 font-semibold">{p.id}</td>
                        <td className="px-4 py-3 text-blue-400 flex items-center gap-1">
                          {p.order_id}
                          <button
                            onClick={() => {
                              setTimelineSearch(p.order_id);
                              setActiveTab('timeline');
                              fetchTimeline(p.order_id);
                            }}
                            className="text-[10px] text-cyan-400 underline hover:text-cyan-300 ml-1"
                          >
                            Timeline
                          </button>
                        </td>
                        <td className="px-4 py-3 font-sans">
                          <div className="text-zinc-200 font-medium">{p.customer_name}</div>
                          <div className="text-[10px] text-zinc-500">{p.phone_number || p.customer_phone}</div>
                        </td>
                        <td className="px-4 py-3 font-sans">
                          <span className="capitalize text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded text-[10px]">
                            {p.method?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-emerald-400 font-bold">{p.mpesa_receipt_number || '—'}</td>
                        <td className="px-4 py-3 text-zinc-100 font-bold">{formatKes(p.amount)}</td>
                        <td className="px-4 py-3 font-sans">{getStatusBadge(p.status)}</td>
                        <td className="px-4 py-3 text-right font-sans">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setSelectedPayment(p);
                                setShowPayloadModal(true);
                              }}
                              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                              title="View raw webhook callback payload"
                            >
                              <Eye className="w-3 h-3" /> Raw JSON
                            </button>

                            {(p.status === 'completed' || p.status === 'paid') && (
                              <button
                                onClick={() => {
                                  setRefundPayment(p);
                                  setRefundAmountKes((p.amount / 100).toString());
                                }}
                                className="px-2 py-1 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                              >
                                <CornerUpLeft className="w-3 h-3" /> Refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Payment Timeline & Inventory Reservation Engine */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={timelineSearch}
                onChange={(e) => setTimelineSearch(e.target.value)}
                placeholder="Enter Order ID or Payment ID..."
                className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500 w-full sm:w-64"
              />
              <button
                onClick={() => fetchTimeline(timelineSearch)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold"
              >
                Inspect Timeline
              </button>
            </div>

            <div className="text-xs text-zinc-400">
              Showing immutable chronological sequence for Order <span className="font-mono text-cyan-400 font-bold">{timelineData?.order_id || timelineSearch}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Timeline Stream */}
            <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
                <History className="w-4 h-4 text-cyan-400" /> Chronological Event Stream
              </h3>

              {timelineLoading ? (
                <div className="p-8 text-center text-zinc-500 text-xs">Loading payment timeline...</div>
              ) : !timelineData || timelineData.events.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-lg">
                  No timeline events found for identifier '{timelineSearch}'.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-800">
                  {timelineData.events.map((e) => (
                    <div key={e.id} className="relative flex items-start gap-3">
                      <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-cyan-500 border-2 border-zinc-900 shadow-sm" />
                      <div className="bg-zinc-950 border border-zinc-800/80 p-3.5 rounded-xl w-full space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          {getTimelineEventBadge(e.event_type)}
                          <span className="text-[10px] text-zinc-500 font-mono">{new Date(e.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-zinc-200 font-medium">{e.message}</p>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-900">
                          <span>Source: <strong className="text-zinc-400 font-mono">{e.source}</strong></span>
                          <span>Actor: <strong className="text-zinc-400 font-mono">{e.actor}</strong></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inventory Reservation State */}
            <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl space-y-4 h-fit">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Box className="w-4 h-4 text-amber-400" /> Inventory Reservation Engine
              </h3>

              {!timelineData || timelineData.reservations.length === 0 ? (
                <div className="p-4 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-lg">
                  No active or historical inventory reservations for this order.
                </div>
              ) : (
                <div className="space-y-3">
                  {timelineData.reservations.map((r) => (
                    <div key={r.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-zinc-400">{r.id}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.status === 'active' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          r.status === 'converted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          'bg-zinc-800 text-zinc-500'
                        }`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="text-zinc-300 font-medium">
                        Reserved Qty: {r.quantity_reserved} item(s)
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        Expires At: {new Date(r.expires_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Gateway Health Center */}
      {activeTab === 'gateway_health' && gatewayHealth && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl">
              <span className="text-xs text-zinc-400">Environment</span>
              <div className="text-lg font-bold text-white mt-1">{gatewayHealth.environment}</div>
              <div className="text-[10px] text-emerald-400 font-medium mt-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Status: {gatewayHealth.gateway_status}
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl">
              <span className="text-xs text-zinc-400">OAuth Token Expiry</span>
              <div className="text-lg font-bold text-amber-400 mt-1 font-mono">{gatewayHealth.token_expires_in_seconds}s</div>
              <div className="text-[10px] text-zinc-500 mt-1">Auto-renewing before timeout</div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl">
              <span className="text-xs text-zinc-400">Average Callback Latency</span>
              <div className="text-lg font-bold text-cyan-400 mt-1 font-mono">{gatewayHealth.avg_latency_ms} ms</div>
              <div className="text-[10px] text-zinc-500 mt-1">Safaricom handset roundtrip</div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl">
              <span className="text-xs text-zinc-400">24h Failure Threshold</span>
              <div className="text-lg font-bold text-rose-400 mt-1">{gatewayHealth.failure_rate_pct}%</div>
              <div className="text-[10px] text-zinc-500 mt-1">Uptime: {gatewayHealth.uptime_pct}%</div>
            </div>
          </div>

          {/* Active Gateway Alerts */}
          {gatewayHealth.alerts && gatewayHealth.alerts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Active Threshold Alerts</h3>
              {gatewayHealth.alerts.map((alt: any) => (
                <div key={alt.id} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <div>
                      <span className="font-bold">{alt.title}: </span>
                      <span>{alt.message}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Last Successful Callback */}
          {gatewayHealth.last_successful_callback && (
            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl space-y-2">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Most Recent Successful Daraja Settlement</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
                <div><span className="text-zinc-500">Receipt #:</span> <strong className="text-emerald-400">{gatewayHealth.last_successful_callback.receipt}</strong></div>
                <div><span className="text-zinc-500">Amount:</span> <strong className="text-white">KES {gatewayHealth.last_successful_callback.amount_kes}</strong></div>
                <div><span className="text-zinc-500">Checkout ID:</span> <span className="text-zinc-300">{gatewayHealth.last_successful_callback.checkout_request_id}</span></div>
                <div><span className="text-zinc-500">Timestamp:</span> <span className="text-zinc-400">{new Date(gatewayHealth.last_successful_callback.timestamp).toLocaleTimeString()}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Support Recovery Tools */}
      {activeTab === 'recovery' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl space-y-4">
            <div className="border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" /> Support Payment Recovery Workflow
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Replay dropped callbacks, re-trigger STK push, or recalculate wallet bonus credits with full event idempotency.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Target Order ID or Payment ID *</label>
                <input
                  type="text"
                  value={recoveryIdentifier}
                  onChange={(e) => setRecoveryIdentifier(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="e.g. ord-101"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Recovery Action</label>
                <select
                  value={recoveryAction}
                  onChange={(e: any) => setRecoveryAction(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="replay_callback">Replay Callback (Triggers Idempotent Event Consumers)</option>
                  <option value="retry_stk">Retry STK Push Prompt to Customer Handset</option>
                  <option value="recalculate_wallet">Recalculate & Align Quest Wallet 5% Bonus</option>
                  <option value="resend_confirmation">Resend Order Confirmation SMS & Notification</option>
                  <option value="retry_downstream">Retry Downstream Event Dispatcher</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Support Incident Notes</label>
                <textarea
                  value={recoveryNotes}
                  onChange={(e) => setRecoveryNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={handleRunRecovery}
                disabled={recoveryLoading}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg shadow-amber-600/20"
              >
                {recoveryLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Execute Support Recovery Action
              </button>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-zinc-800 pb-2">
              <FileText className="w-4 h-4 text-blue-400" /> Recovery Output Log
            </h3>

            {recoveryResult ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2 text-xs text-emerald-300">
                <div className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {recoveryResult.message}
                </div>
                {recoveryResult.order && (
                  <div className="text-[11px] font-mono text-zinc-300 pt-2 border-t border-emerald-500/20">
                    Order Payment Status: <strong className="text-white">{recoveryResult.order.payment_status}</strong> | Order Status: <strong className="text-white">{recoveryResult.order.order_status}</strong>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-lg">
                Select an order and click 'Execute Support Recovery Action' to resolve payment discrepancies.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Payment Analytics */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl">
              <span className="text-xs text-zinc-400">Overall Success Rate</span>
              <div className="text-xl font-bold text-emerald-400 mt-1">{analytics.success_rate_pct}%</div>
              <div className="text-[10px] text-zinc-500 mt-1">Out of {analytics.total_attempts} payment attempts</div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl">
              <span className="text-xs text-zinc-400">User Cancellation Rate</span>
              <div className="text-xl font-bold text-amber-400 mt-1">{analytics.cancellation_rate_pct}%</div>
              <div className="text-[10px] text-zinc-500 mt-1">Cancelled on handset</div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl">
              <span className="text-xs text-zinc-400">STK PIN Timeout Rate</span>
              <div className="text-xl font-bold text-rose-400 mt-1">{analytics.timeout_rate_pct}%</div>
              <div className="text-[10px] text-zinc-500 mt-1">Exceeded 30s PIN window</div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl">
              <span className="text-xs text-zinc-400">Retry Rate</span>
              <div className="text-xl font-bold text-cyan-400 mt-1">{analytics.retry_rate_pct}%</div>
              <div className="text-[10px] text-zinc-500 mt-1">Required &gt;1 prompt</div>
            </div>
          </div>

          {/* Hourly Volume Visualizer */}
          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-400" /> 24-Hour Payment Volume Distribution</span>
              <span className="text-xs text-zinc-400 font-normal">Aggregated by hourly settlement window</span>
            </h3>

            <div className="grid grid-cols-12 md:grid-cols-24 gap-1 items-end h-32 pt-4">
              {analytics.hourly_distribution.map((item: any, idx: number) => {
                const maxVol = Math.max(...analytics.hourly_distribution.map((h: any) => h.volume_kes), 1);
                const barHeight = Math.max((item.volume_kes / maxVol) * 100, 8);
                return (
                  <div key={idx} className="flex flex-col items-center gap-1 group relative">
                    <div
                      style={{ height: `${barHeight}%` }}
                      className="w-full bg-blue-600 hover:bg-blue-400 rounded-t transition-all cursor-pointer"
                    />
                    <span className="text-[8px] text-zinc-500 font-mono rotate-90 sm:rotate-0 mt-1">{item.hour.split(':')[0]}h</span>

                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-zinc-950 border border-zinc-800 p-1.5 rounded text-[10px] text-white font-mono z-10 whitespace-nowrap shadow-xl">
                      <div>{item.hour}</div>
                      <div>KES {item.volume_kes.toLocaleString()} ({item.count} orders)</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Operational Notifications */}
      {activeTab === 'notifications' && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden space-y-4 p-5">
          <h3 className="text-sm font-bold text-white flex items-center justify-between border-b border-zinc-800 pb-3">
            <span className="flex items-center gap-2"><Bell className="w-4 h-4 text-yellow-400" /> Operational Notifications Feed</span>
            <span className="text-xs text-zinc-400 font-normal">Real-time alerts for finance, support, and warehouse operations</span>
          </h3>

          <div className="space-y-2">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">No active operational notifications.</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        n.severity === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                        n.severity === 'warning' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {n.severity}
                      </span>
                      <strong className="text-white font-semibold">{n.title}</strong>
                      <span className="text-[10px] text-zinc-500 font-mono">{new Date(n.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-zinc-300">{n.message}</p>
                    <div className="text-[10px] text-zinc-500">Target Role: <strong className="text-zinc-400 font-mono">{n.target_role}</strong></div>
                  </div>

                  {n.status !== 'delivered' && (
                    <button
                      onClick={() => handleMarkNotificationRead(n.id)}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <CheckCheck className="w-3 h-3 text-emerald-400" /> Mark Read
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 7: STK Push Sandbox Simulator */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" /> Interactive STK Push Simulator
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Test handset callback outcomes without production Daraja credentials.
                </p>
              </div>
              <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold rounded-full uppercase">
                Sandbox Mode
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Target Order ID</label>
                <input
                  type="text"
                  value={simOrderId}
                  onChange={(e) => setSimOrderId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                  placeholder="ord-101"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">M-Pesa Phone Number</label>
                  <input
                    type="text"
                    value={simPhone}
                    onChange={(e) => setSimPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    placeholder="0712345678"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Amount (KES)</label>
                  <input
                    type="number"
                    value={simAmount}
                    onChange={(e) => setSimAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Handset Simulation Outcome</label>
                <select
                  value={simOutcome}
                  onChange={(e: any) => setSimOutcome(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="success">ResultCode 0: Success (M-Pesa PIN Entered)</option>
                  <option value="cancelled">ResultCode 1032: Request Cancelled by User</option>
                  <option value="insufficient_balance">ResultCode 1: Insufficient M-Pesa Balance</option>
                  <option value="timeout">ResultCode 1037: STK Prompt Timed Out</option>
                  <option value="partial_payment">Partial Payment: Paid KES 1100 instead of 2200</option>
                  <option value="duplicate_callback">Duplicate Callback Test: Reject repeated callback</option>
                </select>
              </div>

              <button
                onClick={handleSimulatePayment}
                disabled={simLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg shadow-blue-600/20"
              >
                {simLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Dispatch Handset Simulation
              </button>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-zinc-800 pb-2">
              <FileText className="w-4 h-4 text-blue-400" /> Webhook Output Log
            </h3>

            {simResult ? (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{simResult.message}</div>
                    {simResult.simulated_receipt && (
                      <div className="mt-1 font-mono text-[11px] text-zinc-200">
                        Generated Receipt #: <span className="font-bold text-emerald-400">{simResult.simulated_receipt}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400 font-medium">Dispatched Daraja Callback Payload</span>
                  <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-64">
                    {JSON.stringify(simResult.payload_sent, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-lg">
                No simulation run yet. Click 'Dispatch Handset Simulation' to test webhook processing.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: Manual Till Verification */}
      {activeTab === 'manual_till' && (
        <div className="max-w-2xl mx-auto bg-zinc-900/80 border border-zinc-800 p-6 rounded-xl space-y-4">
          <div className="border-b border-zinc-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building className="w-5 h-5 text-emerald-400" /> Cashier / Staff Manual Till Verification
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Verify manual Buy Goods Till or Paybill payments when customer pays over counter without STK Push. Performs instant receipt uniqueness check and FEFO stock deduction.
            </p>
          </div>

          {tillMessage && (
            <div
              className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                tillMessage.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
              }`}
            >
              {tillMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{tillMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleManualTillVerify} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Select Order ID *</label>
              <input
                type="text"
                value={tillOrderId}
                onChange={(e) => setTillOrderId(e.target.value)}
                placeholder="e.g. ord-101"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">M-Pesa Receipt Number *</label>
                <input
                  type="text"
                  value={tillReceipt}
                  onChange={(e) => setTillReceipt(e.target.value)}
                  placeholder="e.g. RJK9918231"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 uppercase font-mono focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Amount Paid (KES)</label>
                <input
                  type="number"
                  value={tillAmount}
                  onChange={(e) => setTillAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Customer Phone Number</label>
              <input
                type="text"
                value={tillPhone}
                onChange={(e) => setTillPhone(e.target.value)}
                placeholder="0722000111"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={tillLoading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg shadow-emerald-600/20"
            >
              {tillLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Verify Payment & Allocate Order Stock
            </button>
          </form>
        </div>
      )}

      {/* TAB 9: Unmatched Payments Queue */}
      {activeTab === 'unmatched' && (
        <div className="space-y-4">
          <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-purple-400" />
            <div>
              <div className="font-bold text-sm">Unmatched Payments & Discrepancies Queue</div>
              <p className="mt-0.5 text-purple-300/80">
                These payments were received via M-Pesa but could not be automatically matched to an order or had a partial payment variance. Finance staff can manually match them to an order or process a refund.
              </p>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950/80 text-zinc-400 font-medium uppercase tracking-wider text-[10px] border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Receipt #</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Notes / Discrepancy</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {unmatched.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 font-sans">
                      No unmatched payments or payment discrepancies in queue. All payments reconciled!
                    </td>
                  </tr>
                ) : (
                  unmatched.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-800/40">
                      <td className="px-4 py-3 font-bold text-emerald-400">{u.mpesa_receipt_number}</td>
                      <td className="px-4 py-3 text-zinc-300">{u.phone_number}</td>
                      <td className="px-4 py-3 text-zinc-100 font-bold">{formatKes(u.amount_cents)}</td>
                      <td className="px-4 py-3 font-sans text-zinc-300 max-w-xs">{u.notes}</td>
                      <td className="px-4 py-3 font-sans">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-sans">
                        {u.status === 'unmatched' && (
                          <div className="flex items-center justify-end gap-1">
                            {matchUnmatchedId === u.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  placeholder="Order ID (e.g. ord-101)"
                                  value={matchTargetOrderId}
                                  onChange={(e) => setMatchTargetOrderId(e.target.value)}
                                  className="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-white"
                                />
                                <button
                                  onClick={() => handleReconcileUnmatched(u.id, 'match')}
                                  className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setMatchUnmatchedId(null)}
                                  className="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-[11px]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => setMatchUnmatchedId(u.id)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium"
                                >
                                  Match Order
                                </button>
                                <button
                                  onClick={() => handleReconcileUnmatched(u.id, 'refund')}
                                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] font-medium"
                                >
                                  Mark Refunded
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RAW JSON CALLBACK MODAL */}
      {showPayloadModal && selectedPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" /> Payment Transaction Raw Payload ({selectedPayment.id})
              </h3>
              <button
                onClick={() => setShowPayloadModal(false)}
                className="text-zinc-400 hover:text-white text-xs font-bold px-2 py-1 bg-zinc-800 rounded"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-zinc-500">Checkout Request ID:</span> <span className="font-mono text-zinc-200">{selectedPayment.checkout_request_id || 'N/A'}</span></div>
                <div><span className="text-zinc-500">Merchant Request ID:</span> <span className="font-mono text-zinc-200">{selectedPayment.merchant_request_id || 'N/A'}</span></div>
              </div>
              <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-96">
                {JSON.stringify(selectedPayment.raw_callback_payload || selectedPayment, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* REFUND MODAL */}
      {refundPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl space-y-4 p-5">
            <div className="border-b border-zinc-800 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CornerUpLeft className="w-4 h-4 text-rose-400" /> Process Payment Refund
              </h3>
              <button onClick={() => setRefundPayment(null)} className="text-zinc-400 hover:text-white text-xs font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-zinc-300">
                Refunding transaction <span className="font-mono font-bold text-white">{refundPayment.id}</span> for Order <span className="text-blue-400">{refundPayment.order_id}</span>.
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Refund Amount (KES)</label>
                <input
                  type="number"
                  value={refundAmountKes}
                  onChange={(e) => setRefundAmountKes(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Reason for Refund</label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="refundWallet"
                  checked={refundToWallet}
                  onChange={(e) => setRefundToWallet(e.target.checked)}
                  className="rounded bg-zinc-950 border-zinc-800 text-blue-600 focus:ring-0"
                />
                <label htmlFor="refundWallet" className="text-xs text-zinc-300 cursor-pointer">
                  Issue refund instantly to Customer Quest Credit Wallet
                </label>
              </div>

              <button
                onClick={handleProcessRefund}
                disabled={refundLoading}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {refundLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CornerUpLeft className="w-4 h-4" />} Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
