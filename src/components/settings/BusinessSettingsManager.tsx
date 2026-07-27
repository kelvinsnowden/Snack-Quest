import React, { useState, useEffect } from 'react';
import {
  Building2,
  Warehouse as WarehouseIcon,
  Coins,
  Receipt,
  Flag,
  Globe,
  Plus,
  CheckCircle2,
  RefreshCw,
  Save,
  Info,
  Layers,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../common/Modal';
import { DomainManager } from './DomainManager';
import { Organization, Warehouse, Currency, TaxRate, FeatureFlag } from '../../types/database';

export const BusinessSettingsManager: React.FC = () => {
  const { addToast, currentStaffUser } = useApp();
  const [activeTab, setActiveTab] = useState<'domains' | 'org' | 'warehouses' | 'finance' | 'flags' | 'roadmap'>('domains');

  const [org, setOrg] = useState<Organization | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states for adding
  const [isWhModalOpen, setIsWhModalOpen] = useState(false);
  const [whName, setWhName] = useState('');
  const [whCounty, setWhCounty] = useState('Nairobi');

  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [taxCountry, setTaxCountry] = useState('KE');
  const [taxLabel, setTaxLabel] = useState('');
  const [taxRate, setTaxRate] = useState(0);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [orgRes, whRes, currRes, taxRes, flagRes] = await Promise.all([
        fetch('/api/v1/organizations'),
        fetch('/api/v1/settings/warehouses'),
        fetch('/api/v1/settings/currencies'),
        fetch('/api/v1/settings/tax-rates'),
        fetch('/api/v1/feature-flags')
      ]);

      const orgData = await orgRes.json();
      const whData = await whRes.json();
      const currData = await currRes.json();
      const taxData = await taxRes.json();
      const flagData = await flagRes.json();

      if (orgData.data && orgData.data[0]) setOrg(orgData.data[0]);
      if (whData.data) setWarehouses(whData.data);
      if (currData.data) setCurrencies(currData.data);
      if (taxData.data) setTaxRates(taxData.data);
      if (flagData.data) setFeatureFlags(flagData.data);
    } catch (e) {
      console.error('Failed to load business settings', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveOrg = async () => {
    if (!org) return;
    try {
      const res = await fetch(`/api/v1/organizations/${org.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...org, staff_user_id: currentStaffUser.id })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Organization Saved', message: 'Organization identity updated' });
        fetchSettings();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Could not save organization settings' });
    }
  };

  const handleCreateWarehouse = async () => {
    if (!whName.trim()) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Warehouse name required' });
      return;
    }
    try {
      const res = await fetch('/api/v1/settings/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: whName, county: whCounty, staff_user_id: currentStaffUser.id })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Warehouse Created', message: 'New warehouse added' });
        setIsWhModalOpen(false);
        setWhName('');
        fetchSettings();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to create warehouse' });
    }
  };

  const handleToggleWarehouse = async (wh: Warehouse) => {
    try {
      const res = await fetch(`/api/v1/settings/warehouses/${wh.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !wh.is_active, staff_user_id: currentStaffUser.id })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Warehouse Updated', message: `Status updated for ${wh.name}` });
        fetchSettings();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Could not update warehouse' });
    }
  };

  const handleCreateTaxRate = async () => {
    if (!taxLabel.trim()) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Tax label required' });
      return;
    }
    try {
      const res = await fetch('/api/v1/settings/tax-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country_code: taxCountry, label: taxLabel, rate_percent: taxRate, staff_user_id: currentStaffUser.id })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Tax Rate Created', message: 'New tax rate configured' });
        setIsTaxModalOpen(false);
        setTaxLabel('');
        fetchSettings();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to create tax rate' });
    }
  };

  const handleToggleFeatureFlag = async (flag: FeatureFlag) => {
    try {
      const res = await fetch(`/api/v1/feature-flags/${flag.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !flag.is_enabled, staff_user_id: currentStaffUser.id })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Feature Flag Toggled', message: `${flag.label} is now ${!flag.is_enabled ? 'ENABLED' : 'DISABLED'}` });
        fetchSettings();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to toggle feature flag' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#27272A] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Enterprise & Business Settings</h1>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Configure multi-country organizational parameters, warehouse facilities, tax rates, and feature toggles.
          </p>
        </div>

        <button
          onClick={fetchSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181B] text-xs font-medium text-[#A1A1AA] hover:text-white border border-[#27272A] transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          Reload Settings
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#27272A] pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('domains')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'domains'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[#71717A] hover:text-[#A1A1AA]'
          }`}
        >
          <Globe className="w-4 h-4 text-amber-400" />
          Domain &amp; URL Manager
        </button>

        <button
          onClick={() => setActiveTab('org')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'org'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[#71717A] hover:text-[#A1A1AA]'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Organization Identity
        </button>

        <button
          onClick={() => setActiveTab('warehouses')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'warehouses'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[#71717A] hover:text-[#A1A1AA]'
          }`}
        >
          <WarehouseIcon className="w-4 h-4" />
          Fulfillment Warehouses
        </button>

        <button
          onClick={() => setActiveTab('finance')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'finance'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[#71717A] hover:text-[#A1A1AA]'
          }`}
        >
          <Coins className="w-4 h-4" />
          Currencies &amp; Tax Rates
        </button>

        <button
          onClick={() => setActiveTab('flags')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'flags'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[#71717A] hover:text-[#A1A1AA]'
          }`}
        >
          <Flag className="w-4 h-4" />
          Feature Flags
        </button>

        <button
          onClick={() => setActiveTab('roadmap')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'roadmap'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[#71717A] hover:text-[#A1A1AA]'
          }`}
        >
          <Layers className="w-4 h-4" />
          Integration Roadmap &amp; Hooks
        </button>
      </div>

      {/* TAB 0: DOMAIN & URL MANAGER */}
      {activeTab === 'domains' && <DomainManager />}

      {/* TAB 1: ORGANIZATION */}
      {activeTab === 'org' && org && (
        <div className="bg-[#09090B] border border-[#27272A] rounded-xl p-6 space-y-6 max-w-2xl">
          <h3 className="text-sm font-bold text-white">Organization Global Defaults</h3>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#A1A1AA]">Organization Legal Name</label>
              <input
                type="text"
                value={org.name}
                onChange={(e) => setOrg({ ...org, name: e.target.value })}
                className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[#A1A1AA]">Default Currency Code</label>
                <input
                  type="text"
                  value={org.default_currency}
                  onChange={(e) => setOrg({ ...org, default_currency: e.target.value })}
                  className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#A1A1AA]">Default Country Code</label>
                <input
                  type="text"
                  value={org.default_country_code}
                  onChange={(e) => setOrg({ ...org, default_country_code: e.target.value })}
                  className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#A1A1AA]">Default Timezone</label>
              <input
                type="text"
                value={org.timezone}
                onChange={(e) => setOrg({ ...org, timezone: e.target.value })}
                className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#A1A1AA]">Brand Logo URL</label>
              <input
                type="text"
                value={org.logo_url || ''}
                onChange={(e) => setOrg({ ...org, logo_url: e.target.value })}
                className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={handleSaveOrg}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors"
              >
                <Save className="w-4 h-4" />
                Save Organization Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WAREHOUSES */}
      {activeTab === 'warehouses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Active Fulfillment Warehouses ({warehouses.length})</h3>
            <button
              onClick={() => setIsWhModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              Add Warehouse
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.map((wh) => (
              <div key={wh.id} className="bg-[#09090B] border border-[#27272A] rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-lg bg-[#18181B] text-amber-400 border border-[#27272A]">
                    <WarehouseIcon className="w-5 h-5" />
                  </div>
                  <button
                    onClick={() => handleToggleWarehouse(wh)}
                    className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${
                      wh.is_active
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-[#18181B] text-[#71717A] border-[#27272A]'
                    }`}
                  >
                    {wh.is_active ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white">{wh.name}</h4>
                  <p className="text-xs text-[#A1A1AA] mt-0.5">County/Location: {wh.county}</p>
                  <p className="text-[10px] font-mono text-[#71717A] mt-2">ID: {wh.id}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: CURRENCIES & TAX RATES */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          {/* Currencies */}
          <div className="bg-[#09090B] border border-[#27272A] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Supported Currencies</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {currencies.map((c) => (
                <div key={c.id} className="p-3 bg-[#121215] border border-[#27272A] rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-white text-sm">{c.code}</span>
                    <span className="text-xs text-amber-400 font-bold">{c.symbol}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold">ACTIVE</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tax Rates */}
          <div className="bg-[#09090B] border border-[#27272A] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Tax Configurations &amp; VAT</h3>
              <button
                onClick={() => setIsTaxModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                Add Tax Rate
              </button>
            </div>

            <div className="space-y-2">
              {taxRates.map((tr) => (
                <div key={tr.id} className="flex items-center justify-between p-3 bg-[#121215] border border-[#27272A] rounded-lg text-xs">
                  <div>
                    <span className="font-bold text-white">{tr.label}</span>
                    <span className="ml-2 font-mono text-[#71717A]">({tr.country_code})</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-amber-400 font-bold">{tr.rate_percent}%</span>
                    <span className="text-emerald-400 font-bold text-[10px]">ACTIVE</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FEATURE FLAGS */}
      {activeTab === 'flags' && (
        <div className="space-y-4">
          <div className="bg-[#09090B] border border-[#27272A] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white">Application Feature Flags</h3>
              <p className="text-xs text-[#A1A1AA]">
                Toggle features in real-time across the platform without redeploying code.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {featureFlags.map((flag) => (
                <div
                  key={flag.key}
                  className="flex items-center justify-between p-4 bg-[#121215] border border-[#27272A] rounded-lg"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{flag.label}</span>
                      <span className="font-mono text-[10px] text-[#71717A]">({flag.key})</span>
                    </div>
                    <p className="text-xs text-[#A1A1AA]">{flag.description}</p>
                  </div>

                  <button
                    onClick={() => handleToggleFeatureFlag(flag)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      flag.is_enabled
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-[#18181B] text-[#71717A] border border-[#27272A]'
                    }`}
                  >
                    {flag.is_enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ROADMAP & HOOKS */}
      {activeTab === 'roadmap' && (
        <div className="bg-[#09090B] border border-[#27272A] rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">Future Integration Scaffolding &amp; Architecture Hooks</h3>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Pre-built API endpoints and database hooks ready for external service connections without schema breaking changes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#121215] border border-[#27272A] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-amber-400 font-mono uppercase">Shopify Storefront Sync</h4>
              <p className="text-xs text-[#A1A1AA]">
                Ingests external web orders via <code className="text-amber-300">/api/v1/webhooks/shopify</code> and automatically writes order line items to <code className="text-amber-300">orders</code> and <code className="text-amber-300">order_snack_items</code>.
              </p>
            </div>

            <div className="p-4 bg-[#121215] border border-[#27272A] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-amber-400 font-mono uppercase">Wells Fargo Courier API</h4>
              <p className="text-xs text-[#A1A1AA]">
                Dispatches waybill requests directly to dispatch carrier endpoints and ingests real-time courier status tracking updates into <code className="text-amber-300">delivery_status_history</code>.
              </p>
            </div>

            <div className="p-4 bg-[#121215] border border-[#27272A] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-amber-400 font-mono uppercase">Meta &amp; TikTok Ad CAPI Telemetry</h4>
              <p className="text-xs text-[#A1A1AA]">
                Reads <code className="text-amber-300">fbclid</code> and <code className="text-amber-300">ttclid</code> from customer sessions upon order confirmation and posts server-to-server offline conversion payloads to Meta CAPI / TikTok Events API.
              </p>
            </div>

            <div className="p-4 bg-[#121215] border border-[#27272A] rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-amber-400 font-mono uppercase">Transactional Email &amp; SMS Gateway</h4>
              <p className="text-xs text-[#A1A1AA]">
                Extends <code className="text-amber-300">notifications_log</code> with SendGrid, Postmark, and Africa’s Talking gateways for automated digital receipts and delivery SMS updates.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Warehouse Modal */}
      {isWhModalOpen && (
        <Modal
          isOpen={isWhModalOpen}
          onClose={() => setIsWhModalOpen(false)}
          title="Add New Fulfillment Warehouse"
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#A1A1AA]">Warehouse Name</label>
              <input
                type="text"
                placeholder="e.g. Mombasa Port Distribution Hub"
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#A1A1AA]">County / Region</label>
              <input
                type="text"
                placeholder="e.g. Mombasa"
                value={whCounty}
                onChange={(e) => setWhCounty(e.target.value)}
                className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsWhModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#18181B] text-xs font-medium text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWarehouse}
                className="px-4 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold"
              >
                Create Warehouse
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Tax Modal */}
      {isTaxModalOpen && (
        <Modal
          isOpen={isTaxModalOpen}
          onClose={() => setIsTaxModalOpen(false)}
          title="Add Tax Rate Configuration"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#A1A1AA]">Country Code</label>
                <input
                  type="text"
                  placeholder="KE"
                  value={taxCountry}
                  onChange={(e) => setTaxCountry(e.target.value)}
                  className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#A1A1AA]">Tax Percent (%)</label>
                <input
                  type="number"
                  placeholder="16"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#A1A1AA]">Tax Name / Label</label>
              <input
                type="text"
                placeholder="e.g. Kenya Standard VAT"
                value={taxLabel}
                onChange={(e) => setTaxLabel(e.target.value)}
                className="w-full mt-1.5 bg-[#18181B] border border-[#27272A] rounded-lg p-2.5 text-xs text-white focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsTaxModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#18181B] text-xs font-medium text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTaxRate}
                className="px-4 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold"
              >
                Save Tax Rate
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
