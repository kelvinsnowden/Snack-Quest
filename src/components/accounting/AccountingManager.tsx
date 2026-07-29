import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Trash2, AlertTriangle, CheckCircle, RefreshCw, TrendingUp, PieChart, Layers } from 'lucide-react';
import { safeFetchJson } from '../../lib/safeFetch';

export const AccountingManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pnl' | 'expenses' | 'fee_recon'>('pnl');

  const [overview, setOverview] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [feeRecon, setFeeRecon] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Expense Modal
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: 'advertising', description: '', amount: '100000', expense_date: new Date().toISOString().substring(0, 10) });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resOverview, resExp, resFee] = await Promise.all([
        safeFetchJson('/api/v1/accounting/overview'),
        safeFetchJson('/api/v1/accounting/expenses'),
        safeFetchJson('/api/v1/accounting/fee-reconciliation')
      ]);

      setOverview(resOverview);
      setExpenses(resExp?.data || []);
      setFeeRecon(resFee?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleCreateExpense = async () => {
    if (!newExpense.description || !newExpense.amount) return;
    try {
      await fetch('/api/v1/accounting/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExpense)
      });
      setShowAddExpense(false);
      setNewExpense({ category: 'advertising', description: '', amount: '100000', expense_date: new Date().toISOString().substring(0, 10) });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await fetch(`/api/v1/accounting/expenses/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const formatKes = (cents: number) => `KSh ${((cents || 0) / 100).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Accounting, Profitability & Fee Reconciliation
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time gross and net profit views, operating expense ledger, and Daraja M-Pesa payment fee reconciliation.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="self-start sm:self-auto px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Financials
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab('pnl')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'pnl' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          P&L Profitability Summary
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'expenses' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          Operating Expenses Ledger ({expenses.length})
        </button>

        <button
          onClick={() => setActiveTab('fee_recon')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'fee_recon' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          Daraja Fee Reconciliation ({feeRecon.filter((f) => f.is_flagged).length} Flagged)
        </button>
      </div>

      {/* Tab 1: P&L Summary */}
      {activeTab === 'pnl' && overview && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Gross Revenue</span>
              <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">{formatKes(overview.summary.totalRevenue)}</span>
            </div>

            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Gross Profit</span>
              <span className="text-xl font-bold font-mono text-blue-400 mt-1 block">{formatKes(overview.summary.totalGrossProfit)}</span>
            </div>

            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Operating Expenses</span>
              <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">{formatKes(overview.summary.totalOperatingExpenses)}</span>
            </div>

            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Net Operating Profit</span>
              <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">{formatKes(overview.summary.totalNetProfit)}</span>
            </div>
          </div>

          {/* Monthly P&L View */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden p-4 space-y-3">
            <span className="text-xs font-semibold text-white block">Monthly Profitability View (v_monthly_profit)</span>
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 font-mono text-[10px] text-zinc-400 uppercase border-b border-zinc-800">
                <tr>
                  <th className="p-3">Month</th>
                  <th className="p-3">Orders Completed</th>
                  <th className="p-3">Monthly Revenue</th>
                  <th className="p-3 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {overview.v_monthly_profit.map((m: any) => (
                  <tr key={m.month} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-mono font-bold text-white">{m.month}</td>
                    <td className="p-3 font-mono">{m.order_count}</td>
                    <td className="p-3 font-mono text-emerald-400">{formatKes(m.revenue)}</td>
                    <td className="p-3 font-mono text-right text-blue-400 font-bold">{formatKes(m.net_profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Expenses Ledger */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400">Record rent, payroll, Facebook/TikTok marketing ad spend, and software subscriptions.</span>
            <button
              onClick={() => setShowAddExpense(true)}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Log Operating Expense
            </button>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 font-mono text-[10px] text-zinc-400 uppercase border-b border-zinc-800">
                <tr>
                  <th className="p-3">Expense Date</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Description</th>
                  <th className="p-3 font-mono">Amount</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-mono text-zinc-400">{new Date(e.expense_date).toLocaleDateString()}</td>
                    <td className="p-3 font-mono uppercase text-blue-400 font-semibold">{e.category}</td>
                    <td className="p-3 text-white font-medium">{e.description}</td>
                    <td className="p-3 font-mono text-emerald-400 font-bold">{formatKes(e.amount)}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => handleDeleteExpense(e.id)} className="p-1 rounded text-zinc-500 hover:text-red-400 cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Daraja Fee Reconciliation */}
      {activeTab === 'fee_recon' && (
        <div className="space-y-4">
          <span className="text-xs text-zinc-400 block">Comparing recorded M-Pesa payment fees against standard Daraja tier benchmarks (~1.5% max 100 KES).</span>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 font-mono text-[10px] text-zinc-400 uppercase border-b border-zinc-800">
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Amount Paid</th>
                  <th className="p-3">Recorded Fee</th>
                  <th className="p-3">Expected Fee</th>
                  <th className="p-3">Variance</th>
                  <th className="p-3 text-right">Reconciliation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {feeRecon.map((f) => (
                  <tr key={f.order_id} className={f.is_flagged ? 'bg-amber-950/20' : 'hover:bg-zinc-800/40'}>
                    <td className="p-3 font-mono font-bold text-white">{f.order_id}</td>
                    <td className="p-3 font-mono text-emerald-400">{formatKes(f.final_amount_paid)}</td>
                    <td className="p-3 font-mono text-zinc-300">{formatKes(f.recorded_payment_fees)}</td>
                    <td className="p-3 font-mono text-zinc-400">{formatKes(f.expected_daraja_fee)}</td>
                    <td className="p-3 font-mono text-zinc-400">{formatKes(Math.abs(f.variance))}</td>
                    <td className="p-3 text-right">
                      {f.is_flagged ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold text-[10px]">
                          <AlertTriangle className="w-3 h-3" /> Flagged Discrepancy
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-[10px]">
                          <CheckCircle className="w-3 h-3" /> Matched Tier
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl max-w-md w-full space-y-4">
            <h4 className="text-base font-bold text-white">Log Operating Expense</h4>
            <div className="space-y-2 text-xs">
              <select
                value={newExpense.category}
                onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
              >
                <option value="advertising">Advertising / Marketing</option>
                <option value="rent">Rent / Warehouse Facility</option>
                <option value="software">Software / SaaS Subscriptions</option>
                <option value="salaries">Salaries & Payroll</option>
                <option value="utilities">Utilities & Transport</option>
              </select>

              <input
                type="text"
                placeholder="Expense Description (e.g. Meta Ads Instagram Campaign)"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
              />

              <input
                type="number"
                placeholder="Amount in Cents (e.g. 1500000 for KSh 15,000)"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white font-mono"
              />

              <input
                type="date"
                value={newExpense.expense_date}
                onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white font-mono"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddExpense(false)} className="px-3 py-1.5 bg-zinc-800 text-xs text-zinc-300 rounded">
                Dismiss
              </button>
              <button onClick={handleCreateExpense} className="px-3 py-1.5 bg-blue-600 text-xs text-white rounded">
                Log Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
