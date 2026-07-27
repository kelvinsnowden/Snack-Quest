import React, { useState, useEffect } from 'react';
import { Order, Customer, Package, Payment, OrderStatusHistory } from '../../types/database';
import { X, CheckCircle, Package as PackageIcon, Truck, AlertCircle, XCircle, DollarSign, Clock, ArrowRight, RefreshCw, FileText } from 'lucide-react';

interface Props {
  orderId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export const OrderDetailModal: React.FC<Props> = ({ orderId, onClose, onUpdate }) => {
  const [data, setData] = useState<{
    order: Order;
    customer: Customer;
    package: Package;
    courier: any;
    payments: Payment[];
    items: any[];
    history: OrderStatusHistory[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [advanceNote, setAdvanceNote] = useState('');
  const [processing, setProcessing] = useState(false);

  // Timeline State
  const [timelineData, setTimelineData] = useState<{ events: any[]; reservations: any[] } | null>(null);

  // Cancel & Refund form state
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [returnCredits, setReturnCredits] = useState(true);
  const [refundReason, setRefundReason] = useState('');

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const [res, resTimeline] = await Promise.all([
        fetch(`/api/v1/orders/${orderId}`).then((r) => r.json()),
        fetch(`/api/v1/payments/timeline/${orderId}`).then((r) => r.json())
      ]);
      setData(res);
      setTimelineData(resTimeline);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [orderId]);

  const handleAdvanceStatus = async (nextStatus: string) => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/advance-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_status: nextStatus, note: advanceNote })
      });
      if (res.ok) {
        setAdvanceNote('');
        fetchDetail();
        onUpdate();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason })
      });
      if (res.ok) {
        setShowCancelModal(false);
        setCancelReason('');
        fetchDetail();
        onUpdate();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  const handleRefundOrder = async () => {
    if (!refundReason.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_credits_to_wallet: returnCredits, reason: refundReason })
      });
      if (res.ok) {
        setShowRefundModal(false);
        setRefundReason('');
        fetchDetail();
        onUpdate();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  const formatKes = (amountCents: number) => `KSh ${(amountCents / 100).toLocaleString()}`;

  const getNextPossibleStatus = (currentStatus: string) => {
    switch (currentStatus) {
      case 'pending': return 'confirmed';
      case 'confirmed': return 'packed';
      case 'packed': return 'dispatched';
      case 'dispatched': return 'delivered';
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end transition-opacity">
      <div className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 h-full overflow-y-auto p-6 flex flex-col justify-between text-zinc-100">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Order Lifecycle & Audit Timeline</span>
              <h3 className="text-xl font-bold text-white mt-0.5 font-mono">Order {data?.order.id || '...'}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading || !data ? (
            <div className="py-12 text-center text-zinc-500 text-xs">Loading order record...</div>
          ) : (
            <div className="mt-6 space-y-6">
              {/* Status Header Banner */}
              <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-mono block">Current Status</span>
                  <span className="font-mono text-sm font-bold text-white uppercase mt-1 block">
                    {data.order.order_status} {data.order.stock_shortage && '(STOCK SHORTAGE DETECTED)'}
                  </span>
                </div>

                {/* Advance Action */}
                {getNextPossibleStatus(data.order.order_status) && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAdvanceStatus(getNextPossibleStatus(data.order.order_status)!)}
                      disabled={processing}
                      className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      Advance to {getNextPossibleStatus(data.order.order_status)} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Customer & Delivery Card */}
              <div className="grid grid-cols-2 gap-4 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80">
                <div className="space-y-1.5 text-xs">
                  <span className="text-[10px] uppercase font-mono text-zinc-500 block">Customer Information</span>
                  <span className="font-semibold text-white block">{data.customer?.full_name}</span>
                  <span className="font-mono text-zinc-400 block">{data.customer?.phone}</span>
                  <span className="text-zinc-400 block">{data.customer?.delivery_address}, {data.customer?.town}, {data.customer?.county}</span>
                </div>

                <div className="space-y-1.5 text-xs border-l border-zinc-800 pl-4">
                  <span className="text-[10px] uppercase font-mono text-zinc-500 block">Package & Dispatch</span>
                  <span className="font-semibold text-white block">{data.package?.name}</span>
                  <span className="text-zinc-400 block">Courier: {data.courier?.name || 'Standard Courier'}</span>
                  <span className="font-mono text-zinc-400 block">Tracking #: {data.order.tracking_number || 'Pending'}</span>
                </div>
              </div>

              {/* Financial Breakdown Grid */}
              <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-3">
                <span className="text-xs font-semibold text-zinc-300 block">Financial & Cost Allocation Breakdown</span>
                <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Selling Price</span>
                    <span className="text-white font-bold">{formatKes(data.order.selling_price)}</span>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Quest Credits Used</span>
                    <span className="text-amber-400 font-bold">{formatKes(data.order.quest_credits_used)}</span>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Final Amount Paid</span>
                    <span className="text-emerald-400 font-bold">{formatKes(data.order.final_amount_paid)}</span>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Snack Cost (FEFO)</span>
                    <span className="text-zinc-300">{formatKes(data.order.snack_cost)}</span>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Packaging Cost</span>
                    <span className="text-zinc-300">{formatKes(data.order.packaging_cost)}</span>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Delivery Fee</span>
                    <span className="text-zinc-300">{formatKes(data.order.delivery_cost)}</span>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Payment Fee</span>
                    <span className="text-zinc-300">{formatKes(data.order.payment_fees)}</span>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Gross Profit</span>
                    <span className="text-blue-400 font-bold">{formatKes(data.order.gross_profit)}</span>
                  </div>
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Net Profit</span>
                    <span className="text-emerald-400 font-bold">{formatKes(data.order.net_profit)}</span>
                  </div>
                </div>
              </div>

              {/* Snack Items Picked (FEFO) */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-zinc-300 block">Picked Snack Items (FEFO Inventory Deduction)</span>
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-900 text-[10px] font-mono text-zinc-500 uppercase border-b border-zinc-800">
                      <tr>
                        <th className="p-2.5">Snack Item</th>
                        <th className="p-2.5">Batch Ref</th>
                        <th className="p-2.5">Expiry Date</th>
                        <th className="p-2.5">Qty</th>
                        <th className="p-2.5 text-right">Unit Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {data.items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-3 text-center text-zinc-500">No items picked yet (Pending order confirmation).</td>
                        </tr>
                      ) : (
                        data.items.map((i) => (
                          <tr key={i.id}>
                            <td className="p-2.5 text-white font-medium">{i.snack_name}</td>
                            <td className="p-2.5 font-mono text-zinc-400">{i.batch_reference}</td>
                            <td className="p-2.5 text-zinc-400">{i.expiry_date ? new Date(i.expiry_date).toLocaleDateString() : 'N/A'}</td>
                            <td className="p-2.5 font-mono">{i.quantity}</td>
                            <td className="p-2.5 font-mono text-right text-zinc-300">{formatKes(i.unit_cost)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Timeline & Inventory Reservation Event Stream */}
              {timelineData && timelineData.events && timelineData.events.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" /> Immutable Payment & Reservation Timeline
                  </span>
                  <div className="bg-zinc-900/60 p-3.5 rounded-lg border border-zinc-800 space-y-2 text-xs">
                    {timelineData.events.map((e: any) => (
                      <div key={e.id} className="flex items-start justify-between gap-2 border-l-2 border-cyan-500 pl-3 py-1">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-cyan-400 uppercase text-[10px] bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded">
                              {e.event_type}
                            </span>
                            <span className="text-zinc-200 font-medium">{e.message}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-3">
                            <span>Source: <strong className="text-zinc-400">{e.source}</strong></span>
                            <span>Actor: <strong className="text-zinc-400">{e.actor}</strong></span>
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Danger Zone: Cancellation / Refund */}
              {!['cancelled', 'refunded'].includes(data.order.order_status) && (
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-white block">Order Cancellation & Refund Actions</span>
                    <span className="text-[11px] text-zinc-400 block">Cancel order to restock items, or process refund and restore credits.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-medium cursor-pointer"
                    >
                      Cancel Order
                    </button>
                    <button
                      onClick={() => setShowRefundModal(true)}
                      className="px-3 py-1.5 rounded bg-pink-600/20 hover:bg-pink-600/30 text-pink-400 border border-pink-500/30 text-xs font-medium cursor-pointer"
                    >
                      Refund Order
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Cancellation Prompt */}
        {showCancelModal && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl max-w-md w-full space-y-4">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400" /> Confirm Order Cancellation
              </h4>
              <p className="text-xs text-zinc-300">
                Cancelling will reverse deducted stock back into warehouse batches and record an audit entry.
              </p>
              <textarea
                rows={3}
                placeholder="Reason for cancellation (Mandatory)..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:outline-none focus:border-red-500"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCancelModal(false)} className="px-3 py-1.5 rounded bg-zinc-800 text-xs text-zinc-300">
                  Dismiss
                </button>
                <button onClick={handleCancelOrder} disabled={processing} className="px-3 py-1.5 rounded bg-red-600 text-xs text-white">
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Refund Prompt */}
        {showRefundModal && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl max-w-md w-full space-y-4">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-pink-400" /> Confirm Order Refund
              </h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={returnCredits}
                    onChange={(e) => setReturnCredits(e.target.checked)}
                    className="rounded bg-zinc-950 border-zinc-800 text-pink-500 focus:ring-0"
                  />
                  Return redeemed Quest Credits ({formatKes(data?.order.quest_credits_used || 0)}) back to customer wallet
                </label>
                <textarea
                  rows={3}
                  placeholder="Reason for refund (Mandatory)..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowRefundModal(false)} className="px-3 py-1.5 rounded bg-zinc-800 text-xs text-zinc-300">
                  Dismiss
                </button>
                <button onClick={handleRefundOrder} disabled={processing} className="px-3 py-1.5 rounded bg-pink-600 text-xs text-white">
                  Execute Refund
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-zinc-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium cursor-pointer"
          >
            Close Order
          </button>
        </div>
      </div>
    </div>
  );
};
