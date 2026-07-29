import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  PlusCircle,
  ShieldAlert,
  User,
  History,
  Coins
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { safeFetchJson } from '../../lib/safeFetch';

export const WalletManager: React.FC = () => {
  const { checkPermission, currentUser } = useApp();
  const canView = checkPermission('wallet', 'view');
  const canEdit = checkPermission('wallet', 'edit');

  const [transactions, setTransactions] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [targetCustId, setTargetCustId] = useState('');
  const [adjustAmountKes, setAdjustAmountKes] = useState(300);
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustNote, setAdjustNote] = useState('');

  const fetchTransactions = async () => {
    try {
      const url = selectedCustomerId !== 'all'
        ? `/api/v1/wallet/transactions?customer_id=${selectedCustomerId}`
        : '/api/v1/wallet/transactions';
      const data = await safeFetchJson<any>(url);
      setTransactions(data?.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCustomers = async () => {
    try {
      const data = await safeFetchJson<any>('/api/v1/crm/customers');
      setCustomers(data?.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchTransactions(), fetchCustomers()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [selectedCustomerId]);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCustId) return alert('Please select a customer.');

    const finalAmount = adjustType === 'credit' ? adjustAmountKes * 100 : -Math.abs(adjustAmountKes * 100);

    try {
      const res = await fetch('/api/v1/wallet/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: targetCustId,
          amount: finalAmount,
          note: adjustNote,
          staff_user_id: currentUser?.id
        })
      });

      if (res.ok) {
        setShowAdjustModal(false);
        setAdjustNote('');
        await Promise.all([fetchTransactions(), fetchCustomers()]);
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to adjust wallet balance' }));
        alert(err.error || 'Failed to adjust wallet balance');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!canView) {
    return (
      <div className="p-8 text-center text-[#A1A1AA]">
        <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white">Access Restricted</h2>
        <p className="text-sm mt-1">You do not have permissions to view Quest Wallet Ledger.</p>
      </div>
    );
  }

  const selectedCustomerObj = customers.find((c) => c?.id === selectedCustomerId);

  // Totals calculation
  const totalBalanceKes = customers.reduce((sum, c) => sum + (c?.quest_wallet_balance || 0), 0) / 100;
  const totalLifetimeEarnedKes = customers.reduce((sum, c) => sum + (c?.lifetime_credits_earned || 0), 0) / 100;

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.id.includes(searchQuery);
    return matchesSearch;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Wallet className="h-6 w-6 text-emerald-500" /> Quest Wallet Append-Only Ledger
          </h1>
          <p className="text-xs text-[#A1A1AA]">
            Immutable transaction history for customer credit balances, quest rewards, and checkout redemptions.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              if (selectedCustomerId !== 'all') setTargetCustId(selectedCustomerId);
              setShowAdjustModal(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-md"
          >
            <PlusCircle className="h-4 w-4" /> Manual Credit Adjustment
          </button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-[#A1A1AA] uppercase tracking-wider">
              {selectedCustomerObj ? `${selectedCustomerObj.full_name}'s Balance` : 'Total Active Wallet Liability'}
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono mt-1">
              {selectedCustomerObj
                ? `${((selectedCustomerObj.quest_wallet_balance || 0) / 100).toLocaleString()} KES`
                : `${(totalBalanceKes || 0).toLocaleString()} KES`}
            </div>
          </div>
          <div className="p-3 bg-emerald-950/60 text-emerald-400 rounded-lg border border-emerald-800/40">
            <Coins className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-[#A1A1AA] uppercase tracking-wider">
              {selectedCustomerObj ? 'Lifetime Credits Earned' : 'Systemwide Earned Credits'}
            </div>
            <div className="text-2xl font-extrabold text-blue-400 font-mono mt-1">
              {selectedCustomerObj
                ? `${((selectedCustomerObj.lifetime_credits_earned || 0) / 100).toLocaleString()} KES`
                : `${(totalLifetimeEarnedKes || 0).toLocaleString()} KES`}
            </div>
          </div>
          <div className="p-3 bg-blue-950/60 text-blue-400 rounded-lg border border-blue-800/40">
            <ArrowUpRight className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-[#A1A1AA] uppercase tracking-wider">
              Total Ledger Entries
            </div>
            <div className="text-2xl font-extrabold text-white font-mono mt-1">
              {transactions.length}
            </div>
          </div>
          <div className="p-3 bg-[#27272A] text-[#A1A1AA] rounded-lg">
            <History className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#18181B] p-4 rounded-lg border border-[#27272A]">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <User className="h-4 w-4 text-[#71717A]" />
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="bg-[#09090B] border border-[#27272A] rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer min-w-[220px]"
          >
            <option value="all">All Customers Ledger</option>
            {customers.map((c) => (
              <option key={c?.id} value={c?.id}>
                {c?.full_name} ({c?.phone}) - Bal: {((c?.quest_wallet_balance || 0) / 100).toLocaleString()} KES
              </option>
            ))}
          </select>
        </div>

        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#71717A]" />
          <input
            type="text"
            placeholder="Search note, customer name, or transaction ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#09090B] border border-[#27272A] rounded-md pl-9 pr-3 py-2 text-xs text-white placeholder-[#71717A] focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[#27272A] flex items-center justify-between bg-[#09090B]">
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">
            Append-Only Wallet Transaction Ledger
          </h2>
          <span className="text-[10px] text-[#71717A] font-mono">
            RLS Protected: UPDATE & DELETE prohibited
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#FAFAFA]">
            <thead className="bg-[#09090B] text-[#71717A] font-semibold border-b border-[#27272A] uppercase tracking-wider">
              <tr>
                <th className="p-4">Tx ID</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Type</th>
                <th className="p-4">Note / Source</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Balance After</th>
                <th className="p-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272A]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#71717A]">
                    Loading ledger transactions...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#71717A]">
                    No wallet transactions recorded.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#27272A]/40 transition-colors">
                    <td className="p-4 font-mono text-[11px] text-[#A1A1AA]">{tx.id}</td>
                    <td className="p-4 font-semibold text-white">{tx.customer_name}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                        tx.amount > 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' : 'bg-amber-950 text-amber-400 border border-amber-800/40'
                      }`}>
                        {tx.transaction_type}
                      </span>
                    </td>
                    <td className="p-4 text-[#A1A1AA]">
                      <div className="text-white text-xs">{tx.note || 'No note attached'}</div>
                      <div className="text-[10px] text-[#71717A]">Created by: {tx.created_by}</div>
                    </td>
                    <td className="p-4 font-mono font-bold">
                      {tx.amount > 0 ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <ArrowUpRight className="h-3.5 w-3.5" /> +{((tx.amount || 0) / 100).toLocaleString()} KES
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1">
                          <ArrowDownLeft className="h-3.5 w-3.5" /> {((tx.amount || 0) / 100).toLocaleString()} KES
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-white font-semibold">
                      {((tx.balance_after || 0) / 100).toLocaleString()} KES
                    </td>
                    <td className="p-4 text-[#A1A1AA] font-mono text-[11px]">
                      {tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Credit Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleAdjustSubmit} className="bg-[#18181B] border border-[#27272A] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-500" /> Manual Wallet Ledger Entry
              </h3>
              <button type="button" onClick={() => setShowAdjustModal(false)} className="text-[#A1A1AA] hover:text-white cursor-pointer">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Target Customer</label>
                <select
                  required
                  value={targetCustId}
                  onChange={(e) => setTargetCustId(e.target.value)}
                  className="w-full bg-[#09090B] border border-[#27272A] rounded p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Select Customer --</option>
                  {customers.map((c) => (
                    <option key={c?.id} value={c?.id}>
                      {c?.full_name} ({c?.phone}) - Current: {((c?.quest_wallet_balance || 0) / 100).toLocaleString()} KES
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Entry Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('credit')}
                    className={`py-2 text-xs font-medium rounded border cursor-pointer ${
                      adjustType === 'credit'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-600'
                        : 'bg-[#09090B] text-[#A1A1AA] border-[#27272A]'
                    }`}
                  >
                    + Credit (+ KES)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('debit')}
                    className={`py-2 text-xs font-medium rounded border cursor-pointer ${
                      adjustType === 'debit'
                        ? 'bg-amber-950 text-amber-400 border-amber-600'
                        : 'bg-[#09090B] text-[#A1A1AA] border-[#27272A]'
                    }`}
                  >
                    - Debit / Reversal (- KES)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Amount (KES)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={adjustAmountKes}
                  onChange={(e) => setAdjustAmountKes(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#09090B] border border-[#27272A] rounded p-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Mandatory Audit Note</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Reason for manual credit adjustment..."
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className="w-full bg-[#09090B] border border-[#27272A] rounded p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-[#27272A]">
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="px-4 py-2 bg-[#27272A] text-white rounded text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-xs cursor-pointer"
              >
                Post Ledger Entry
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
