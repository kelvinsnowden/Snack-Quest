import React, { useState, useEffect } from 'react';
import { Snack, SnackBatch, PackagingItem, Supplier, PurchaseOrder } from '../../types/database';
import { Boxes, Package, AlertTriangle, Plus, CheckCircle, RefreshCw, Truck, Tag, Layers, Sparkles } from 'lucide-react';
import { ProductCatalogManager } from './ProductCatalogManager';

export const InventoryManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'snacks' | 'batches' | 'packaging' | 'recipes' | 'suppliers' | 'po'>('catalog');

  // Data states
  const [snacks, setSnacks] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [packaging, setPackaging] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modals
  const [showAddSnack, setShowAddSnack] = useState(false);
  const [newSnack, setNewSnack] = useState({ name: '', sku: '', supplier_id: '', purchase_price: '1500', selling_cost_allocation: '3000', category: 'Imported Snack', country_of_origin: 'Japan', minimum_stock: '20' });

  const [showAddPO, setShowAddPO] = useState(false);
  const [newPO, setNewPO] = useState({ supplier_id: '', item_type: 'snack', item_id: '', quantity: '100', unit_cost: '1500' });

  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ package_id: 'pkg-alpha', packaging_item_id: '', quantity_required: '1' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resSnacks, resBatches, resPack, resRec, resSup, resPO] = await Promise.all([
        fetch('/api/v1/inventory/snacks').then((r) => r.json()),
        fetch('/api/v1/inventory/batches').then((r) => r.json()),
        fetch('/api/v1/inventory/packaging').then((r) => r.json()),
        fetch('/api/v1/inventory/recipes').then((r) => r.json()),
        fetch('/api/v1/inventory/suppliers').then((r) => r.json()),
        fetch('/api/v1/inventory/purchase-orders').then((r) => r.json())
      ]);

      setSnacks(resSnacks.data || []);
      setBatches(resBatches.data || []);
      setPackaging(resPack.data || []);
      setRecipes(resRec.data || []);
      setSuppliers(resSup.data || []);
      setPos(resPO.data || []);
    } catch (e) {
      console.error('Error fetching inventory data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleCreateSnack = async () => {
    if (!newSnack.name || !newSnack.sku) return;
    try {
      await fetch('/api/v1/inventory/snacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSnack)
      });
      setShowAddSnack(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreatePO = async () => {
    if (!newPO.supplier_id || !newPO.item_id) return;
    try {
      await fetch('/api/v1/inventory/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPO)
      });
      setShowAddPO(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReceivePO = async (poId: string) => {
    try {
      await fetch(`/api/v1/inventory/purchase-orders/${poId}/receive`, { method: 'POST' });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateRecipeReq = async () => {
    if (!newRecipe.packaging_item_id) return;
    try {
      await fetch('/api/v1/inventory/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecipe)
      });
      setShowAddRecipe(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRecipeReq = async (id: string) => {
    try {
      await fetch(`/api/v1/inventory/recipes/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const formatKes = (cents: number) => `KSh ${(cents / 100).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Inventory & Packaging Operations
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Imported snack catalog, FEFO batch tracking, packaging materials, package recipes, and purchase order fulfillment.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="self-start sm:self-auto px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Inventory
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'catalog' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-zinc-900 text-amber-400 hover:text-amber-300'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Product Catalog & Knowledge Engine
        </button>

        <button
          onClick={() => setActiveTab('snacks')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'snacks' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          Snacks Items ({snacks.length})
        </button>

        <button
          onClick={() => setActiveTab('batches')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'batches' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          Batch Tracking & Expiry ({batches.length})
        </button>

        <button
          onClick={() => setActiveTab('packaging')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'packaging' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          Packaging Materials ({packaging.length})
        </button>

        <button
          onClick={() => setActiveTab('recipes')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'recipes' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          Package Recipes ({recipes.length})
        </button>

        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'suppliers' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          Suppliers ({suppliers.length})
        </button>

        <button
          onClick={() => setActiveTab('po')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'po' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          Purchase Orders ({pos.length})
        </button>
      </div>

      {/* Tab 0: Product Catalog & Knowledge Engine */}
      {activeTab === 'catalog' && <ProductCatalogManager />}

      {/* Tab 1: Snacks */}
      {activeTab === 'snacks' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400">Manage individual imported snack items and stock status.</span>
            <button
              onClick={() => setShowAddSnack(true)}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add New Snack
            </button>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 uppercase font-mono text-[10px] text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3">Snack Name</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Stock Remaining</th>
                  <th className="p-3">Min Stock</th>
                  <th className="p-3 text-right">Purchase Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {snacks.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-semibold text-white">{s.name}</td>
                    <td className="p-3 font-mono text-zinc-400">{s.sku}</td>
                    <td className="p-3 text-zinc-300">{s.supplier_name}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                        s.status === 'in_stock' ? 'bg-emerald-500/10 text-emerald-400' : s.status === 'low_stock' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-white">{s.quantity_remaining}</td>
                    <td className="p-3 font-mono text-zinc-500">{s.minimum_stock}</td>
                    <td className="p-3 font-mono text-right text-emerald-400">{formatKes(s.purchase_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Batches & Expiry */}
      {activeTab === 'batches' && (
        <div className="space-y-4">
          <span className="text-xs text-zinc-400 block">FEFO (First-Expiry-First-Out) warehouse batches. Batches expiring within 14 days are highlighted.</span>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 uppercase font-mono text-[10px] text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3">Batch Ref</th>
                  <th className="p-3">Snack Item</th>
                  <th className="p-3">Purchase Date</th>
                  <th className="p-3">Expiry Date</th>
                  <th className="p-3">Qty Remaining</th>
                  <th className="p-3 text-right">Unit Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {batches.map((b) => {
                  const isExpiringSoon = b.expiry_date && new Date(b.expiry_date).getTime() - Date.now() < 14 * 24 * 3600 * 1000;
                  return (
                    <tr key={b.id} className={isExpiringSoon ? 'bg-amber-950/20' : 'hover:bg-zinc-800/40'}>
                      <td className="p-3 font-mono font-bold text-white">{b.batch_reference}</td>
                      <td className="p-3 font-medium text-zinc-200">{b.snack_name}</td>
                      <td className="p-3 text-zinc-400">{new Date(b.purchase_date).toLocaleDateString()}</td>
                      <td className="p-3">
                        <span className={`font-mono font-semibold ${isExpiringSoon ? 'text-amber-400 flex items-center gap-1' : 'text-zinc-300'}`}>
                          {isExpiringSoon && <AlertTriangle className="w-3.5 h-3.5" />}
                          {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : 'N/A'}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-white">{b.quantity_remaining}</td>
                      <td className="p-3 font-mono text-right text-emerald-400">{formatKes(b.purchase_price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Packaging Items */}
      {activeTab === 'packaging' && (
        <div className="space-y-4">
          <span className="text-xs text-zinc-400 block">Packaging inventory (boxes, ribbons, stickers, bubble wrap). Deducted automatically when order confirms.</span>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 uppercase font-mono text-[10px] text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3">Item Name</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Stock Level</th>
                  <th className="p-3">Min Level</th>
                  <th className="p-3 text-right">Unit Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {packaging.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-semibold text-white">{p.name}</td>
                    <td className="p-3 text-zinc-400">{p.supplier_name}</td>
                    <td className="p-3 font-mono font-bold text-white">{p.current_stock}</td>
                    <td className="p-3 font-mono text-zinc-500">{p.minimum_stock}</td>
                    <td className="p-3 font-mono text-right text-emerald-400">{formatKes(p.unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Package Recipes */}
      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400">Recipes specify mandatory packaging materials required for each package.</span>
            <button
              onClick={() => setShowAddRecipe(true)}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Recipe Material
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recipes.map((r) => (
              <div key={r.package_id} className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="font-bold text-white text-sm">{r.package_name}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    r.is_valid ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {r.is_valid ? 'Recipe Active' : 'Missing Recipe'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {r.requirements.length === 0 ? (
                    <p className="text-xs text-red-400">No packaging items defined! Blocked from activation.</p>
                  ) : (
                    r.requirements.map((req: any) => (
                      <div key={req.id} className="flex items-center justify-between text-xs bg-zinc-950 p-2 rounded border border-zinc-800">
                        <span className="text-zinc-200">{req.packaging_item_name}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-zinc-400">Qty: {req.quantity_required}</span>
                          <button onClick={() => handleDeleteRecipeReq(req.id)} className="text-red-400 hover:text-red-300 font-bold">×</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Suppliers */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          <span className="text-xs text-zinc-400 block">Registered suppliers for imported snacks and local packaging items.</span>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 uppercase font-mono text-[10px] text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3">Supplier Name</th>
                  <th className="p-3">Contact Person</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {suppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-semibold text-white">{sup.name}</td>
                    <td className="p-3 text-zinc-300">{sup.contact_person}</td>
                    <td className="p-3 font-mono text-zinc-400">{sup.contact_phone}</td>
                    <td className="p-3 text-zinc-400">{sup.contact_email}</td>
                    <td className="p-3 text-zinc-500 text-[11px]">{sup.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Purchase Orders */}
      {activeTab === 'po' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400">Purchase orders sent to suppliers. Receiving PO automatically increments warehouse inventory.</span>
            <button
              onClick={() => setShowAddPO(true)}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Create Purchase Order
            </button>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 uppercase font-mono text-[10px] text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3">PO Reference</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Item</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Quantity</th>
                  <th className="p-3">Total Cost</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {pos.map((po) => (
                  <tr key={po.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-mono font-bold text-white">{po.id}</td>
                    <td className="p-3 text-zinc-300">{po.supplier_name}</td>
                    <td className="p-3 text-white font-medium">{po.item_name}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                        po.status === 'received' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="p-3 font-mono">{po.quantity}</td>
                    <td className="p-3 font-mono text-emerald-400">{formatKes(po.total_cost)}</td>
                    <td className="p-3 text-right">
                      {po.status === 'ordered' && (
                        <button
                          onClick={() => handleReceivePO(po.id)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
                        >
                          Receive & Restock
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

      {/* Add Snack Modal */}
      {showAddSnack && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl max-w-md w-full space-y-4">
            <h4 className="text-base font-bold text-white">Add New Snack to Catalog</h4>
            <div className="space-y-2 text-xs">
              <input
                type="text"
                placeholder="Snack Name (e.g. Takis Fuego Mini)"
                value={newSnack.name}
                onChange={(e) => setNewSnack({ ...newSnack, name: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
              />
              <input
                type="text"
                placeholder="SKU (e.g. SNK-MEX-002)"
                value={newSnack.sku}
                onChange={(e) => setNewSnack({ ...newSnack, sku: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white font-mono"
              />
              <select
                value={newSnack.supplier_id}
                onChange={(e) => setNewSnack({ ...newSnack, supplier_id: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Purchase Price (Cents)"
                  value={newSnack.purchase_price}
                  onChange={(e) => setNewSnack({ ...newSnack, purchase_price: e.target.value })}
                  className="bg-zinc-950 border border-zinc-800 p-2 rounded text-white font-mono"
                />
                <input
                  type="number"
                  placeholder="Min Stock Alert Level"
                  value={newSnack.minimum_stock}
                  onChange={(e) => setNewSnack({ ...newSnack, minimum_stock: e.target.value })}
                  className="bg-zinc-950 border border-zinc-800 p-2 rounded text-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddSnack(false)} className="px-3 py-1.5 bg-zinc-800 text-xs text-zinc-300 rounded">
                Dismiss
              </button>
              <button onClick={handleCreateSnack} className="px-3 py-1.5 bg-blue-600 text-xs text-white rounded">
                Save Snack
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add PO Modal */}
      {showAddPO && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl max-w-md w-full space-y-4">
            <h4 className="text-base font-bold text-white">Create Supplier Purchase Order</h4>
            <div className="space-y-2 text-xs">
              <select
                value={newPO.supplier_id}
                onChange={(e) => setNewPO({ ...newPO, supplier_id: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <select
                value={newPO.item_type}
                onChange={(e) => setNewPO({ ...newPO, item_type: e.target.value as any })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
              >
                <option value="snack">Snack Item</option>
                <option value="packaging">Packaging Material</option>
              </select>

              <select
                value={newPO.item_id}
                onChange={(e) => setNewPO({ ...newPO, item_id: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
              >
                <option value="">Select Item</option>
                {newPO.item_type === 'snack'
                  ? snacks.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
                  : packaging.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Quantity"
                  value={newPO.quantity}
                  onChange={(e) => setNewPO({ ...newPO, quantity: e.target.value })}
                  className="bg-zinc-950 border border-zinc-800 p-2 rounded text-white font-mono"
                />
                <input
                  type="number"
                  placeholder="Unit Cost (Cents)"
                  value={newPO.unit_cost}
                  onChange={(e) => setNewPO({ ...newPO, unit_cost: e.target.value })}
                  className="bg-zinc-950 border border-zinc-800 p-2 rounded text-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddPO(false)} className="px-3 py-1.5 bg-zinc-800 text-xs text-zinc-300 rounded">
                Dismiss
              </button>
              <button onClick={handleCreatePO} className="px-3 py-1.5 bg-blue-600 text-xs text-white rounded">
                Submit Purchase Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Recipe Modal */}
      {showAddRecipe && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl max-w-md w-full space-y-4">
            <h4 className="text-base font-bold text-white">Add Packaging Requirement to Recipe</h4>
            <div className="space-y-2 text-xs">
              <select
                value={newRecipe.package_id}
                onChange={(e) => setNewRecipe({ ...newRecipe, package_id: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
              >
                <option value="pkg-alpha">Mystery Snack Box Alpha</option>
                <option value="pkg-mega">Snack Quest Mega Chest</option>
              </select>

              <select
                value={newRecipe.packaging_item_id}
                onChange={(e) => setNewRecipe({ ...newRecipe, packaging_item_id: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white"
              >
                <option value="">Select Packaging Material</option>
                {packaging.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Quantity Required per Box"
                value={newRecipe.quantity_required}
                onChange={(e) => setNewRecipe({ ...newRecipe, quantity_required: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 p-2 rounded text-white font-mono"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddRecipe(false)} className="px-3 py-1.5 bg-zinc-800 text-xs text-zinc-300 rounded">
                Dismiss
              </button>
              <button onClick={handleCreateRecipeReq} className="px-3 py-1.5 bg-blue-600 text-xs text-white rounded">
                Save Recipe Material
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
