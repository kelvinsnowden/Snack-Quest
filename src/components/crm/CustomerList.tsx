import React, { useState, useEffect } from 'react';
import { Customer, CustomerStatus } from '../../types/database';
import { Search, Filter, ShieldAlert, Award, UserCheck, UserX, Clock, ChevronRight, MessageSquare, Tag, Eye, RefreshCw, FileText } from 'lucide-react';
import { CustomerDetailModal } from './CustomerDetailModal';

export const CustomerList: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [countyFilter, setCountyFilter] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (countyFilter) params.append('county', countyFilter);

      const res = await fetch(`/api/v1/crm/customers?${params.toString()}`);
      const json = await res.json();
      setCustomers(json.data || []);
    } catch (e) {
      console.error('Failed to fetch customers', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search, statusFilter, countyFilter]);

  const getStatusBadge = (status: CustomerStatus) => {
    switch (status) {
      case 'vip':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><Award className="w-3 h-3" /> VIP</span>;
      case 'active':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><UserCheck className="w-3 h-3" /> Active</span>;
      case 'new':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20"><Clock className="w-3 h-3" /> New</span>;
      case 'dormant':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"><UserX className="w-3 h-3" /> Dormant</span>;
      case 'blacklisted':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20"><ShieldAlert className="w-3 h-3" /> Blacklisted</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300">{status}</span>;
    }
  };

  const formatKes = (amountCents: number) => {
    return `KSh ${(amountCents / 100).toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Customer CRM Engine
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time customer metrics, status computation, attribution history, and manual status overrides.
          </p>
        </div>
        <button
          onClick={fetchCustomers}
          className="self-start sm:self-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh List
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name, phone (+254...), email, referral code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Customer Statuses</option>
            <option value="vip">VIP (LTV ≥ 20,000 KES or 6+ orders)</option>
            <option value="active">Active (2+ orders or order within 60d)</option>
            <option value="new">New (1 order within 14d)</option>
            <option value="dormant">Dormant (No order in 90d+)</option>
            <option value="blacklisted">Blacklisted (Manual Override)</option>
          </select>
        </div>

        <div>
          <select
            value={countyFilter}
            onChange={(e) => setCountyFilter(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Counties (Kenya)</option>
            <option value="Nairobi">Nairobi</option>
            <option value="Mombasa">Mombasa</option>
            <option value="Kisumu">Kisumu</option>
            <option value="Nakuru">Nakuru</option>
            <option value="Kiambu">Kiambu</option>
          </select>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 uppercase font-mono text-[11px] text-zinc-400">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">County / Town</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Lifetime Revenue</th>
                <th className="px-4 py-3">Lifetime Profit</th>
                <th className="px-4 py-3">Referrals</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                    Loading customer data...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                    No customers found matching the search criteria.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-semibold text-white block">{customer.full_name}</span>
                        <span className="text-[11px] font-mono text-zinc-500 block">{customer.phone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(customer.status)}</td>
                    <td className="px-4 py-3 text-zinc-300">
                      <div>
                        <span className="block font-medium">{customer.county}</span>
                        <span className="text-[10px] text-zinc-500">{customer.town}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-white">{customer.lifetime_orders}</td>
                    <td className="px-4 py-3 font-mono text-emerald-400 font-semibold">{formatKes(customer.lifetime_revenue)}</td>
                    <td className="px-4 py-3 font-mono text-blue-400">{formatKes(customer.lifetime_profit)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                        {customer.total_referrals} Ref ({customer.referral_code})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedCustomerId(customer.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-xs font-medium border border-blue-500/20 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomerId && (
        <CustomerDetailModal
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onUpdate={fetchCustomers}
        />
      )}
    </div>
  );
};
