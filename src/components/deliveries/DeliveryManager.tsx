import React, { useState, useEffect } from 'react';
import {
  Truck,
  Package,
  CheckCircle,
  RefreshCw,
  Plus,
  Clock,
  MapPin,
  Phone,
  Building2,
  Sliders,
  History,
  AlertTriangle,
  UserCheck,
  BarChart3,
  Search,
  Upload,
  FileSpreadsheet,
  Edit2,
  ShieldAlert,
  Calendar,
  Check,
  ChevronRight,
  Info,
  Database,
  Globe,
  Layers,
  Sparkles,
  Navigation
} from 'lucide-react';
import { PickupStationRecord, DELIVERY_PROVIDERS, ZONE_PRICING_MATRIX } from '../../data/deliveryDataset';

export const DeliveryManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'stations' | 'matrix' | 'counties' | 'packing' | 'shipping' | 'exceptions' | 'import' | 'analytics'
  >('stations');

  // Core Intelligence Platform Data
  const [stations, setStations] = useState<PickupStationRecord[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCounty, setSelectedCounty] = useState('All');
  const [selectedZone, setSelectedZone] = useState('All');
  const [selectedTown, setSelectedTown] = useState('All');

  // Interactive Quote Calculator State
  const [quoteCalc, setQuoteCalc] = useState({
    county: 'Nairobi',
    town: 'Nairobi CBD',
    weight_kg: 1,
    promo_code: ''
  });
  const [calculatedQuote, setCalculatedQuote] = useState<any>(null);

  // JSON Import modal
  const [jsonImportText, setJsonImportText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Packing & Shipping Queues
  const [packingQueue, setPackingQueue] = useState<any[]>([]);
  const [shippingQueue, setShippingQueue] = useState<any[]>([]);

  const fetchStations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (selectedCounty !== 'All') params.append('county', selectedCounty);
      if (selectedZone !== 'All') params.append('zone', selectedZone);
      if (selectedTown !== 'All') params.append('town', selectedTown);

      const [resStations, resPack, resShip] = await Promise.all([
        fetch(`/api/v1/delivery/pickup-stations?${params.toString()}`).then((r) => r.json()),
        fetch('/api/v1/deliveries/packing-queue').then((r) => r.json()).catch(() => ({ data: [] })),
        fetch('/api/v1/deliveries/shipping-queue').then((r) => r.json()).catch(() => ({ data: [] }))
      ]);

      if (resStations.success) {
        setStations(resStations.data || []);
        setMeta(resStations.meta || null);
      }
      setPackingQueue(resPack.data || []);
      setShippingQueue(resShip.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [searchQuery, selectedCounty, selectedZone, selectedTown]);

  const handleCalculateQuote = async () => {
    try {
      const res = await fetch('/api/v1/delivery/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteCalc)
      }).then((r) => r.json());

      if (res.success) {
        setCalculatedQuote(res.quote);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    handleCalculateQuote();
  }, [quoteCalc.county, quoteCalc.town, quoteCalc.weight_kg, quoteCalc.promo_code]);

  const handleJsonImport = async () => {
    setImportStatus(null);
    try {
      let parsed = [];
      try {
        parsed = JSON.parse(jsonImportText);
      } catch (e) {
        setImportStatus('Error: Invalid JSON format. Please paste valid station JSON.');
        return;
      }

      const res = await fetch('/api/v1/delivery/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stations: Array.isArray(parsed) ? parsed : [parsed] })
      }).then((r) => r.json());

      if (res.success) {
        setImportStatus(`Success! ${res.meta?.imported_count || 0} pickup stations normalized and loaded.`);
        setJsonImportText('');
        fetchStations();
      } else {
        setImportStatus(`Error: ${res.error || 'Import failed'}`);
      }
    } catch (e) {
      setImportStatus('Error: Server failed to process batch import.');
    }
  };

  // Extract unique counties for filter dropdown
  const uniqueCounties = Array.from(new Set(stations.map((s) => s.county))).sort();
  const uniqueTowns = selectedCounty === 'All'
    ? Array.from(new Set(stations.map((s) => s.town))).sort()
    : Array.from(new Set(stations.filter((s) => s.county === selectedCounty).map((s) => s.town))).sort();

  return (
    <div className="space-y-6">
      {/* Platform Header */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400 text-xs font-mono font-semibold border border-orange-500/30">
                Stage 13 Module
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Database className="w-5 h-5 text-orange-400" /> Enterprise Delivery Intelligence Platform
              </h2>
            </div>
            <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
              Kenya Nationwide Single Source of Truth for logistics. Powers WhatChimp AI, Customer Checkout, Creator Portal, Customer Portal, and Admin Operations with 116 normalized Jumia Pickup Stations across Zones 1–6.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStations}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${loading ? 'animate-spin' : ''}`} /> Sync Network
            </button>
          </div>
        </div>

        {/* Live System Metrics Ribbon */}
        {meta && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-zinc-800/80">
            <div className="bg-zinc-900/90 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Total Stations</span>
              <span className="text-base font-bold text-white font-mono">{meta.total_records}</span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">100% Normalized</span>
            </div>
            <div className="bg-zinc-900/90 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Counties Covered</span>
              <span className="text-base font-bold text-amber-400 font-mono">{meta.counties_count}</span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Kenya Nationwide</span>
            </div>
            <div className="bg-zinc-900/90 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Towns Covered</span>
              <span className="text-base font-bold text-sky-400 font-mono">{meta.towns_count}</span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Regional Hubs</span>
            </div>
            <div className="bg-zinc-900/90 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Zone 1 (Nairobi)</span>
              <span className="text-base font-bold text-orange-400 font-mono">{meta.zones_breakdown['Zone 1'] || 0}</span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">KSh 150 / 1 Day</span>
            </div>
            <div className="bg-zinc-900/90 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Zones 2-5</span>
              <span className="text-base font-bold text-indigo-400 font-mono">
                {(meta.zones_breakdown['Zone 2'] || 0) + (meta.zones_breakdown['Zone 3'] || 0) + (meta.zones_breakdown['Zone 4'] || 0) + (meta.zones_breakdown['Zone 5'] || 0)}
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Inter-County</span>
            </div>
            <div className="bg-zinc-900/90 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Zone 6 (Frontier)</span>
              <span className="text-base font-bold text-rose-400 font-mono">{meta.zones_breakdown['Zone 6'] || 0}</span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">KSh 500 / 5 Days</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-zinc-800 scrollbar-none">
        <button
          onClick={() => setActiveTab('stations')}
          className={`px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'stations'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 font-semibold'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" /> Pickup Station Registry ({stations.length})
        </button>

        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'matrix'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 font-semibold'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-800'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Pricing Matrix & Calculator
        </button>

        <button
          onClick={() => setActiveTab('counties')}
          className={`px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'counties'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 font-semibold'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-800'
          }`}
        >
          <Globe className="w-3.5 h-3.5" /> County & Town Taxonomy
        </button>

        <button
          onClick={() => setActiveTab('import')}
          className={`px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'import'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 font-semibold'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-800'
          }`}
        >
          <Upload className="w-3.5 h-3.5" /> Batch JSON Import
        </button>

        <button
          onClick={() => setActiveTab('packing')}
          className={`px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'packing'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 font-semibold'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-800'
          }`}
        >
          <Package className="w-3.5 h-3.5" /> Packing Queue ({packingQueue.length})
        </button>
      </div>

      {/* TAB 1: PICKUP STATIONS REGISTRY */}
      {activeTab === 'stations' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-zinc-900 p-4 rounded-xl border border-zinc-800">
            <div className="relative md:col-span-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search station name, address, code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <select
                value={selectedCounty}
                onChange={(e) => {
                  setSelectedCounty(e.target.value);
                  setSelectedTown('All');
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
              >
                <option value="All">All Counties ({uniqueCounties.length})</option>
                {uniqueCounties.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedTown}
                onChange={(e) => setSelectedTown(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
              >
                <option value="All">All Towns ({uniqueTowns.length})</option>
                {uniqueTowns.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
              >
                <option value="All">All Delivery Zones</option>
                <option value="Zone 1">Zone 1 (Nairobi - KSh 150)</option>
                <option value="Zone 2">Zone 2 (Central/Rift - KSh 220)</option>
                <option value="Zone 3">Zone 3 (Coast/Lake - KSh 280)</option>
                <option value="Zone 4">Zone 4 (Western/Border - KSh 350)</option>
                <option value="Zone 5">Zone 5 (High-Cost - KSh 420)</option>
                <option value="Zone 6">Zone 6 (Frontier - KSh 500)</option>
              </select>
            </div>
          </div>

          {/* Stations Table */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 font-mono uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Station Code & Name</th>
                    <th className="px-4 py-3">Location / County</th>
                    <th className="px-4 py-3">Delivery Zone</th>
                    <th className="px-4 py-3">Physical Address</th>
                    <th className="px-4 py-3">Coordinates</th>
                    <th className="px-4 py-3">Fee & SLA</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-zinc-500">
                        Loading Pickup Station Registry...
                      </td>
                    </tr>
                  ) : stations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-zinc-500">
                        No pickup stations match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    stations.map((stn) => (
                      <tr key={stn.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-white">
                          <div className="font-semibold text-white">{stn.station_name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{stn.station_code}</div>
                        </td>

                        <td className="px-4 py-3 text-zinc-300">
                          <div className="font-medium text-amber-400">{stn.county} County</div>
                          <div className="text-[11px] text-zinc-400">{stn.town}</div>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            stn.delivery_zone === 'Zone 1' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            stn.delivery_zone === 'Zone 2' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                            stn.delivery_zone === 'Zone 3' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            stn.delivery_zone === 'Zone 4' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                            stn.delivery_zone === 'Zone 5' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                            'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {stn.delivery_zone}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-zinc-400 max-w-xs">
                          <div className="truncate" title={stn.physical_address}>{stn.physical_address}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">{stn.opening_hours}</div>
                        </td>

                        <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                          <div className="flex items-center gap-1">
                            <Navigation className="w-3 h-3 text-orange-400" />
                            {stn.latitude.toFixed(4)}, {stn.longitude.toFixed(4)}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-bold text-emerald-400 font-mono">KSh {stn.delivery_fee_kes}</div>
                          <div className="text-[10px] text-zinc-400">{stn.eta_text}</div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
                            Active PUDO
                          </span>
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

      {/* TAB 2: PRICING MATRIX & CALCULATOR */}
      {activeTab === 'matrix' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pricing Matrix Table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-orange-400" /> Kenya Small Package Pricing Matrix
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Official authoritative pricing matrix used across Customer Checkout, Creator Portal, and WhatChimp AI.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded bg-orange-500/10 text-orange-400 text-xs font-mono font-bold">
                  Small Package Matrix
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Zone Code</th>
                      <th className="px-4 py-3">Delivery Zone Name</th>
                      <th className="px-4 py-3">Flat Fee (KES)</th>
                      <th className="px-4 py-3">Estimated SLA</th>
                      <th className="px-4 py-3">Weight Policy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {Object.entries(ZONE_PRICING_MATRIX).map(([zone, data]) => (
                      <tr key={zone} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-orange-400 font-bold">{zone}</td>
                        <td className="px-4 py-3 font-medium text-white">
                          {zone === 'Zone 1' ? 'Nairobi Metropolitan' :
                           zone === 'Zone 2' ? 'Central & Kiambu Hubs' :
                           zone === 'Zone 3' ? 'Rift, Coast & Lake Region' :
                           zone === 'Zone 4' ? 'Western, Nyanza & Border' :
                           zone === 'Zone 5' ? 'High-Cost Transport Hubs' :
                           'Remote Frontier Counties'}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-400 font-mono text-sm">
                          KSh {data.fee_kes}
                        </td>
                        <td className="px-4 py-3 text-zinc-300 font-mono">{data.eta_text}</td>
                        <td className="px-4 py-3 text-zinc-400 text-[11px]">
                          Up to 3kg base, +KSh 50/kg
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Interactive Live Price Calculator */}
          <div className="space-y-4">
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> Interactive Quote Simulator
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-zinc-400 block mb-1">Select County</label>
                  <select
                    value={quoteCalc.county}
                    onChange={(e) => setQuoteCalc({ ...quoteCalc, county: e.target.value, town: 'All' })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    {uniqueCounties.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-400 block mb-1">Select Town</label>
                  <select
                    value={quoteCalc.town}
                    onChange={(e) => setQuoteCalc({ ...quoteCalc, town: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    {uniqueTowns.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-400 block mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={quoteCalc.weight_kg}
                    onChange={(e) => setQuoteCalc({ ...quoteCalc, weight_kg: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-400 block mb-1">Promo Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. SNACK25"
                    value={quoteCalc.promo_code}
                    onChange={(e) => setQuoteCalc({ ...quoteCalc, promo_code: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {calculatedQuote && (
                <div className="bg-zinc-950 p-4 rounded-xl border border-orange-500/30 space-y-2 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Classified Zone</span>
                    <span className="text-xs font-bold text-orange-400 font-mono">{calculatedQuote.delivery_zone}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Base Zone Fee</span>
                    <span className="text-xs text-zinc-200 font-mono">KSh {calculatedQuote.base_fee_kes}</span>
                  </div>
                  {calculatedQuote.weight_surcharge_kes > 0 && (
                    <div className="flex justify-between items-center text-amber-400">
                      <span className="text-xs">Weight Surcharge</span>
                      <span className="text-xs font-mono">+KSh {calculatedQuote.weight_surcharge_kes}</span>
                    </div>
                  )}
                  {calculatedQuote.discount_kes > 0 && (
                    <div className="flex justify-between items-center text-emerald-400">
                      <span className="text-xs">Promo Discount</span>
                      <span className="text-xs font-mono">-KSh {calculatedQuote.discount_kes}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-zinc-800 flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Final Customer Cost</span>
                    <span className="text-base font-bold text-emerald-400 font-mono">KSh {calculatedQuote.total_delivery_fee_kes}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 text-right">
                    Guaranteed Delivery: <span className="text-white font-medium">{calculatedQuote.guaranteed_by}</span> ({calculatedQuote.eta_text})
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COUNTY & TOWN TAXONOMY */}
      {activeTab === 'counties' && (
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400" /> Kenya Regional Logistics Taxonomy
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Structured county-to-town mappings and verified station counts across Kenya.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {uniqueCounties.map((county) => {
              const countyStations = stations.filter((s) => s.county === county);
              const towns = Array.from(new Set(countyStations.map((s) => s.town)));

              return (
                <div key={county} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                    <span className="font-bold text-white text-xs">{county} County</span>
                    <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 font-mono text-[10px]">
                      {countyStations.length} Station{countyStations.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {towns.map((town) => (
                      <span key={town} className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 text-[10px]">
                        {town}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: BATCH JSON IMPORT */}
      {activeTab === 'import' && (
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-4 max-w-3xl">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-orange-400" /> Admin Station Dataset Batch Ingestion
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Paste raw or normalized Jumia pickup station records in JSON array format to update or seed the Delivery Intelligence Platform database.
            </p>
          </div>

          <textarea
            rows={10}
            value={jsonImportText}
            onChange={(e) => setJsonImportText(e.target.value)}
            placeholder='[ { "station_name": "Jumia Station Name", "longitude": 36.82, "latitude": -1.28, "description": "Address details" } ]'
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500"
          />

          {importStatus && (
            <div className={`p-3 rounded-lg text-xs font-mono ${
              importStatus.startsWith('Success') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {importStatus}
            </div>
          )}

          <button
            onClick={handleJsonImport}
            className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Run Station Batch Normalization & Ingest
          </button>
        </div>
      )}

      {/* TAB 5: PACKING QUEUE */}
      {activeTab === 'packing' && (
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-orange-400" /> Warehouse Packing Queue
          </h3>

          {packingQueue.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs">
              No orders pending fulfillment in the packing queue.
            </div>
          ) : (
            <div className="space-y-3">
              {packingQueue.map((item) => (
                <div key={item.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-white text-xs">Order #{item.order_id || item.id}</div>
                    <div className="text-[11px] text-zinc-400">{item.customer_name || 'Customer Order'}</div>
                  </div>
                  <button className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold">
                    Mark Packed & Ready
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
