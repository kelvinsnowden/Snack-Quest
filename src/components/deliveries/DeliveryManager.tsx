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
  Info
} from 'lucide-react';
import {
  PickupStation,
  DeliveryZone,
  DeliveryMethodRule,
  Shipment,
  ShipmentTimelineEvent,
  DeliveryExceptionRecord,
  SalesAgent
} from '../../types/database';

export const DeliveryManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'packing' | 'shipping' | 'stations' | 'rules' | 'shipments' | 'exceptions' | 'agents' | 'analytics'
  >('stations');

  // Core Data
  const [packingQueue, setPackingQueue] = useState<any[]>([]);
  const [shippingQueue, setShippingQueue] = useState<any[]>([]);
  const [pickupStations, setPickupStations] = useState<PickupStation[]>([]);
  const [deliveryRules, setDeliveryRules] = useState<DeliveryMethodRule[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [exceptions, setExceptions] = useState<DeliveryExceptionRecord[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters & Searches
  const [selectedCounty, setSelectedCounty] = useState<string>('all');
  const [searchStation, setSearchStation] = useState<string>('');
  const [csvImportText, setCsvImportText] = useState<string>('');
  const [showCsvModal, setShowCsvModal] = useState<boolean>(false);

  // Station Version History Modal
  const [selectedStationVersions, setSelectedStationVersions] = useState<any[] | null>(null);
  const [selectedStationName, setSelectedStationName] = useState<string>('');

  // Edit Station Fee Modal
  const [editingStation, setEditingStation] = useState<PickupStation | null>(null);
  const [newFeeCents, setNewFeeCents] = useState<string>('15000');
  const [updateReason, setUpdateReason] = useState<string>('');

  // Shipment Timeline Modal
  const [selectedShipmentTimeline, setSelectedShipmentTimeline] = useState<ShipmentTimelineEvent[] | null>(null);
  const [selectedShipmentTracking, setSelectedShipmentTracking] = useState<string>('');

  // Exception Modal
  const [showRaiseExceptionModal, setShowRaiseExceptionModal] = useState<boolean>(false);
  const [exceptionForm, setExceptionForm] = useState({ shipment_id: 'shp-101', exception_type: 'uncollected_parcel', notes: '' });

  // Dispatch Form Modal
  const [selectedDelivery, setSelectedDelivery] = useState<any | null>(null);
  const [courierId, setCourierId] = useState('courier-jumia');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resPack, resShip, resStations, resRules, resShipments, resExc, resAgents, resAnal] = await Promise.all([
        fetch('/api/v1/deliveries/packing-queue').then((r) => r.json()),
        fetch('/api/v1/deliveries/shipping-queue').then((r) => r.json()),
        fetch('/api/v1/delivery/pickup-stations').then((r) => r.json()),
        fetch('/api/v1/delivery/method-rules').then((r) => r.json()),
        fetch('/api/v1/delivery/shipments').then((r) => r.json()),
        fetch('/api/v1/delivery/exceptions').then((r) => r.json()),
        fetch('/api/v1/delivery/agents').then((r) => r.json()),
        fetch('/api/v1/delivery/analytics').then((r) => r.json())
      ]);

      setPackingQueue(resPack.data || []);
      setShippingQueue(resShip.data || []);
      setPickupStations(resStations.data || []);
      setDeliveryRules(resRules.data || []);
      setShipments(resShipments.data || []);
      setExceptions(resExc.data || []);
      setAgents(resAgents.data || []);
      setAnalytics(resAnal || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleMarkPacked = async (deliveryId: string) => {
    try {
      await fetch(`/api/v1/deliveries/${deliveryId}/pack`, { method: 'POST' });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDispatch = async () => {
    if (!selectedDelivery) return;
    setDispatching(true);
    try {
      await fetch(`/api/v1/deliveries/${selectedDelivery.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courier_id: courierId, tracking_number: trackingNumber })
      });
      setSelectedDelivery(null);
      setTrackingNumber('');
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setDispatching(false);
    }
  };

  const handleUpdateStationFee = async () => {
    if (!editingStation) return;
    try {
      await fetch(`/api/v1/delivery/pickup-stations/${editingStation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_fee: parseInt(newFeeCents),
          reason: updateReason || 'Adjusted station delivery rate'
        })
      });
      setEditingStation(null);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleViewVersions = async (station: PickupStation) => {
    try {
      const res = await fetch(`/api/v1/delivery/pickup-stations/${station.id}/versions`).then((r) => r.json());
      setSelectedStationVersions(res.data || []);
      setSelectedStationName(station.name);
    } catch (e) {
      console.error(e);
    }
  };

  const handleViewShipmentTimeline = async (shipment: Shipment) => {
    try {
      const res = await fetch(`/api/v1/delivery/shipments/${shipment.id}/timeline`).then((r) => r.json());
      setSelectedShipmentTimeline(res.data || []);
      setSelectedShipmentTracking(shipment.tracking_number);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateShipmentStatus = async (shipmentId: string, status: string) => {
    try {
      await fetch(`/api/v1/delivery/shipments/${shipmentId}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: `Status updated in delivery hub to ${status}` })
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRaiseException = async () => {
    try {
      await fetch('/api/v1/delivery/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exceptionForm)
      });
      setShowRaiseExceptionModal(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResolveException = async (id: string) => {
    try {
      await fetch(`/api/v1/delivery/exceptions/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_action: 'Resolved by operations team via hub' })
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCsvImport = async () => {
    if (!csvImportText.trim()) return;
    try {
      // Basic CSV parsing
      const lines = csvImportText.trim().split('\n');
      const parsedStations = lines.map((line, idx) => {
        const parts = line.split(',');
        return {
          station_code: parts[0]?.trim() || `JUM-IMP-${idx}`,
          name: parts[1]?.trim() || 'Imported Jumia Station',
          county: parts[2]?.trim() || 'Nairobi',
          area: parts[3]?.trim() || 'CBD',
          address: parts[4]?.trim() || 'Main Station Address',
          delivery_fee: parseInt(parts[5]?.trim()) || 15000,
          estimated_delivery_days: parseInt(parts[6]?.trim()) || 2
        };
      });

      await fetch('/api/v1/delivery/pickup-stations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stations: parsedStations })
      });

      setShowCsvModal(false);
      setCsvImportText('');
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const formatKes = (cents: number) => `KSh ${((cents || 0) / 100).toLocaleString()}`;

  const filteredStations = pickupStations.filter((s) => {
    const matchesCounty = selectedCounty === 'all' || s.county.toLowerCase() === selectedCounty.toLowerCase();
    const matchesSearch =
      s.name.toLowerCase().includes(searchStation.toLowerCase()) ||
      s.address.toLowerCase().includes(searchStation.toLowerCase()) ||
      s.area.toLowerCase().includes(searchStation.toLowerCase());
    return matchesCounty && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Phase 5 Delivery Operations Architecture</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-xs font-mono font-semibold border border-orange-500/20">
              Jumia Logistics Primary
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            Decoupled courier adapter engine, 200+ Kenya Jumia Pickup Stations, versioned rate auditing, human-assisted Nairobi door delivery dispatch, and real-time shipment timeline tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-orange-400" /> Refresh Operations
          </button>
        </div>
      </div>

      {/* Analytics High-Level Ribbon */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Active Pickup Stations</span>
            <div className="text-lg font-bold text-white font-mono">{analytics.active_pickup_stations_count} Stations</div>
            <span className="text-[10px] text-zinc-400">Across 47 Counties</span>
          </div>
          <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Active Shipments</span>
            <div className="text-lg font-bold text-amber-400 font-mono">{analytics.dispatched_count} In Transit</div>
            <span className="text-[10px] text-zinc-400">Avg {analytics.avg_delivery_days} Days SLA</span>
          </div>
          <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Parcel Collection Rate</span>
            <div className="text-lg font-bold text-emerald-400 font-mono">{analytics.collection_rate_pct}%</div>
            <span className="text-[10px] text-emerald-400 font-medium">High Station Retention</span>
          </div>
          <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Carrier SLA Compliance</span>
            <div className="text-lg font-bold text-blue-400 font-mono">{analytics.courier_sla_compliance_pct}%</div>
            <span className="text-[10px] text-zinc-400">Jumia Express Hubs</span>
          </div>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-zinc-800 scrollbar-none">
        <button
          onClick={() => setActiveTab('stations')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'stations'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" /> Pickup Stations ({pickupStations.length})
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'rules'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" /> Delivery Rules ({deliveryRules.length})
        </button>

        <button
          onClick={() => setActiveTab('shipments')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'shipments'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Truck className="w-3.5 h-3.5" /> Shipments ({shipments.length})
        </button>

        <button
          onClick={() => setActiveTab('packing')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'packing'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Package className="w-3.5 h-3.5" /> Packing Queue ({packingQueue.length})
        </button>

        <button
          onClick={() => setActiveTab('exceptions')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'exceptions'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Exceptions ({exceptions.filter((e) => e.status === 'open').length})
        </button>

        <button
          onClick={() => setActiveTab('agents')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'agents'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" /> Sales Agents ({agents.length})
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> SLA Analytics
        </button>
      </div>

      {/* TAB 1: PICKUP STATIONS */}
      {activeTab === 'stations' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 p-4 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search station name, address, area..."
                  value={searchStation}
                  onChange={(e) => setSearchStation(e.target.value)}
                  className="pl-9 pr-4 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 w-64 focus:outline-none focus:border-orange-500"
                />
              </div>

              <select
                value={selectedCounty}
                onChange={(e) => setSelectedCounty(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                <option value="all">All Counties</option>
                <option value="nairobi">Nairobi</option>
                <option value="kiambu">Kiambu</option>
                <option value="mombasa">Mombasa</option>
                <option value="kisumu">Kisumu</option>
                <option value="nakuru">Nakuru</option>
                <option value="eldoret">Eldoret</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCsvModal(true)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-orange-400" /> CSV Batch Import
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStations.map((station) => (
              <div key={station.id} className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-[10px] text-orange-400 font-bold block">{station.station_code}</span>
                    <h3 className="text-xs font-bold text-white mt-0.5">{station.name}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold">
                    v{station.version}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="truncate">{station.address}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span>{station.opening_hours}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Jumia Pickup Fee</span>
                    <span className="font-mono text-xs font-bold text-emerald-400">{formatKes(station.delivery_fee)}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleViewVersions(station)}
                      className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title="View Rate Version History"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingStation(station);
                        setNewFeeCents(station.delivery_fee.toString());
                      }}
                      className="px-2.5 py-1 rounded bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 text-xs font-semibold border border-orange-500/30 transition-colors cursor-pointer"
                    >
                      Adjust Fee
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: DELIVERY METHOD RULES */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-1">
            <h3 className="text-sm font-bold text-white">Delivery Rules Engine Configuration</h3>
            <p className="text-xs text-zinc-400">
              Decoupled delivery rule sets for automated Jumia Pickup Stations vs human-assisted Nairobi door delivery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deliveryRules.map((rule) => (
              <div key={rule.id} className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-orange-400">{rule.code}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      rule.automation_type === 'fully_automated' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {rule.automation_type.replace('_', ' ')}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white">{rule.name}</h4>
                  <p className="text-xs text-zinc-400 mt-1">{rule.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-3 rounded-lg text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-zinc-500 block uppercase">Coverage</span>
                    <span className="text-zinc-200">{rule.coverage_counties.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block uppercase">Fee Strategy</span>
                    <span className="text-emerald-400">{rule.fee_strategy}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-zinc-400">Agent Handoff Required: {rule.agent_assignment_required ? 'Yes (Nairobi)' : 'No'}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono">ACTIVE</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SHIPMENTS */}
      {activeTab === 'shipments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-zinc-900 p-4 rounded-xl border border-zinc-800">
            <span className="text-xs text-zinc-400">All active Jumia courier shipments with tracking numbers and immutable event timeline.</span>
            <button
              onClick={() => setShowRaiseExceptionModal(true)}
              className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold border border-red-500/30 flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Log Delivery Exception
            </button>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 font-mono text-[10px] text-zinc-400 uppercase border-b border-zinc-800">
                <tr>
                  <th className="p-3">Tracking Number</th>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Pickup Station / Address</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {shipments.map((shp) => (
                  <tr key={shp.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-mono font-bold text-orange-400">{shp.tracking_number}</td>
                    <td className="p-3 font-mono text-white">{shp.order_id}</td>
                    <td className="p-3 font-medium text-white">{(shp as any).customer_name}</td>
                    <td className="p-3 text-zinc-300">{shp.pickup_station_name || 'Door Delivery Nairobi'}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                          shp.status === 'collected'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : shp.status === 'dispatched'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {shp.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => handleViewShipmentTimeline(shp)}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer"
                      >
                        Timeline
                      </button>
                      {shp.status !== 'collected' && (
                        <button
                          onClick={() => handleUpdateShipmentStatus(shp.id, 'collected')}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs cursor-pointer"
                        >
                          Mark Collected
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PACKING QUEUE */}
      {activeTab === 'packing' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 font-mono text-[10px] text-zinc-400 uppercase border-b border-zinc-800">
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Package Type</th>
                  <th className="p-3">Destination</th>
                  <th className="p-3">Stock Alert</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {packingQueue.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-mono font-bold text-white">{item.order_id}</td>
                    <td className="p-3 font-medium text-white">{item.customer_name} ({item.customer_phone})</td>
                    <td className="p-3 text-zinc-300">{item.package_name}</td>
                    <td className="p-3 text-zinc-400">{item.delivery_address}, {item.county}</td>
                    <td className="p-3">
                      {item.stock_shortage ? (
                        <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] font-mono">SHORTAGE</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono">READY</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleMarkPacked(item.id)}
                        className="px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs cursor-pointer"
                      >
                        Mark Packed
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: EXCEPTIONS */}
      {activeTab === 'exceptions' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800">
            <h3 className="text-xs font-bold text-white">Delivery Exceptions & Dispute Log</h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">Uncollected parcels, damaged items, station closures, or requested station transfers.</p>
          </div>

          <div className="space-y-3">
            {exceptions.map((exc) => (
              <div key={exc.id} className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-red-400 uppercase">{exc.exception_type.replace('_', ' ')}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${exc.status === 'open' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {exc.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">{exc.notes}</p>
                  <span className="text-[10px] font-mono text-zinc-500 block">Shipment ID: {exc.shipment_id} | Order ID: {exc.order_id}</span>
                </div>

                {exc.status === 'open' && (
                  <button
                    onClick={() => handleResolveException(exc.id)}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
                  >
                    Resolve Case
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: SALES AGENTS */}
      {activeTab === 'agents' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800">
            <h3 className="text-xs font-bold text-white">Nairobi Door Delivery Sales Agents</h3>
            <p className="text-[11px] text-zinc-400">Workload balancing for human-assisted door delivery orders in Nairobi.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div key={agent.id} className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">{agent.name}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase">
                    {agent.status}
                  </span>
                </div>

                <div className="text-xs space-y-1 text-zinc-400">
                  <div>Phone: <span className="font-mono text-white">{agent.phone}</span></div>
                  <div>Assigned Counties: <span className="text-zinc-300">{agent.assigned_counties.join(', ')}</span></div>
                </div>

                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Current Workload:</span>
                  <span className="font-mono text-xs font-bold text-orange-400">{agent.current_workload} / {agent.max_workload} Active Orders</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 7: ANALYTICS */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 p-5 rounded-xl border border-zinc-800 space-y-3">
            <h3 className="text-sm font-bold text-white">Delivery SLA & Courier Performance Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase font-mono block">Delivery Cost Efficiency</span>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-1">KSh 150 Base Rate</div>
                <p className="text-[10px] text-zinc-400 mt-1">Jumia Pickup PUDO model saves 60% compared to direct door dispatch.</p>
              </div>
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase font-mono block">Average Regional SLA</span>
                <div className="text-xl font-bold font-mono text-amber-400 mt-1">1.8 Business Days</div>
                <p className="text-[10px] text-zinc-400 mt-1">Next-day fulfillment for Nairobi & Kiambu; 2-3 days for Coastal hubs.</p>
              </div>
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase font-mono block">Customer Collection Index</span>
                <div className="text-xl font-bold font-mono text-blue-400 mt-1">98.4% On-Time</div>
                <p className="text-[10px] text-zinc-400 mt-1">SMS & WhatsApp arrival notification automated integration active.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: EDIT STATION FEE */}
      {editingStation && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-md w-full space-y-4">
            <h4 className="text-sm font-bold text-white">Adjust Rate for {editingStation.name}</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">New Delivery Fee (in Cents - e.g. 15000 for KSh 150):</label>
                <input
                  type="number"
                  value={newFeeCents}
                  onChange={(e) => setNewFeeCents(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white font-mono"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Audit Log Reason:</label>
                <input
                  type="text"
                  placeholder="e.g. Jumia regional transport fee adjustment"
                  value={updateReason}
                  onChange={(e) => setUpdateReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingStation(null)} className="px-3 py-1.5 bg-zinc-800 text-xs text-zinc-300 rounded cursor-pointer">
                Cancel
              </button>
              <button onClick={handleUpdateStationFee} className="px-3 py-1.5 bg-orange-600 text-xs text-white rounded cursor-pointer font-semibold">
                Save Station Fee Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VERSION HISTORY */}
      {selectedStationVersions && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h4 className="text-sm font-bold text-white">Version Audit Trail — {selectedStationName}</h4>
              <button onClick={() => setSelectedStationVersions(null)} className="text-zinc-400 hover:text-white text-xs cursor-pointer">
                Close
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {selectedStationVersions.length === 0 ? (
                <p className="text-xs text-zinc-500">No previous rate modifications recorded.</p>
              ) : (
                selectedStationVersions.map((v) => (
                  <div key={v.id} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-orange-400 font-bold">Version {v.version}</span>
                      <span className="text-[10px] text-zinc-500">{new Date(v.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-zinc-300">{v.reason}</p>
                    <div className="text-[10px] text-zinc-400 font-mono">Changed by: {v.changed_by}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SHIPMENT TIMELINE */}
      {selectedShipmentTimeline && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h4 className="text-sm font-bold text-white">Shipment Event Log — {selectedShipmentTracking}</h4>
              <button onClick={() => setSelectedShipmentTimeline(null)} className="text-zinc-400 hover:text-white text-xs cursor-pointer">
                Close
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {selectedShipmentTimeline.map((evt) => (
                <div key={evt.id} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-emerald-400 font-bold uppercase">{evt.event_type}</span>
                    <span className="text-[10px] text-zinc-500">{new Date(evt.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-zinc-200">{evt.message}</p>
                  <span className="text-[10px] text-zinc-500 font-mono block">Actor: {evt.actor}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CSV BATCH IMPORT */}
      {showCsvModal && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-lg w-full space-y-4">
            <h4 className="text-sm font-bold text-white">Batch Import Jumia Pickup Stations (CSV Format)</h4>
            <p className="text-xs text-zinc-400">Paste CSV rows format: `station_code, station_name, county, area, address, fee_cents, est_days`</p>
            <textarea
              rows={6}
              placeholder="JUM-NRB-101, Nairobi South Station, Nairobi, South C, Mombasa Road Junction, 15000, 1"
              value={csvImportText}
              onChange={(e) => setCsvImportText(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-xs text-white font-mono"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCsvModal(false)} className="px-3 py-1.5 bg-zinc-800 text-xs text-zinc-300 rounded cursor-pointer">
                Cancel
              </button>
              <button onClick={handleCsvImport} className="px-3 py-1.5 bg-orange-600 text-xs text-white rounded cursor-pointer font-semibold">
                Import Stations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: LOG EXCEPTION */}
      {showRaiseExceptionModal && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-md w-full space-y-4">
            <h4 className="text-sm font-bold text-white">Log Delivery Exception / Dispute</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Exception Category:</label>
                <select
                  value={exceptionForm.exception_type}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, exception_type: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
                >
                  <option value="uncollected_parcel">Uncollected Parcel (Timeout Exceeded)</option>
                  <option value="station_closed">Pickup Station Temporarily Closed</option>
                  <option value="parcel_damaged">Parcel Damaged in Transit</option>
                  <option value="customer_requested_station_change">Customer Requested Station Change</option>
                  <option value="failed_delivery_attempt">Failed Door Delivery Attempt</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Operational Notes:</label>
                <textarea
                  rows={3}
                  placeholder="Describe exception context..."
                  value={exceptionForm.notes}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, notes: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRaiseExceptionModal(false)} className="px-3 py-1.5 bg-zinc-800 text-xs text-zinc-300 rounded cursor-pointer">
                Cancel
              </button>
              <button onClick={handleRaiseException} className="px-3 py-1.5 bg-red-600 text-xs text-white rounded cursor-pointer font-semibold">
                Submit Exception Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
