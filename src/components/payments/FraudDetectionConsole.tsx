import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2, RefreshCw, Lock, ShieldCheck } from 'lucide-react';

export const FraudDetectionConsole: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [overridingId, setOverridingId] = useState<string | null>(null);

  const fetchFraudAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/payments/fraud');
      const data = await res.json();
      setAlerts(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFraudAlerts();
  }, []);

  const handleOverride = async (alertId: string) => {
    setOverridingId(alertId);
    try {
      const res = await fetch('/api/v1/payments/fraud/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: alertId,
          notes: 'Customer verified via direct phone call by Finance Admin'
        })
      });
      if (res.ok) {
        fetchFraudAlerts();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setOverridingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="border-b border-zinc-800 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" /> Payment Fraud Detection & Risk Analysis Engine
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Automated scoring engine detecting rapid STK pushes, phone number mismatch, high-value anomalies, and referral abuse.
            </p>
          </div>

          <button onClick={fetchFraudAlerts} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Risk Feed
          </button>
        </div>

        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 bg-zinc-950 rounded-xl border border-zinc-800">
              <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              No active payment fraud flags detected.
            </div>
          ) : (
            alerts.map((a) => (
              <div
                key={a.id}
                className={`p-4 rounded-xl border space-y-3 ${
                  a.status === 'cleared'
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-rose-600 text-white uppercase tracking-wide">
                      Risk Score: {a.fraud_score}/100 ({a.risk_level})
                    </span>
                    <span className="font-mono font-bold text-white text-xs">{a.order_id ? `Order ${a.order_id}` : `Phone ${a.phone_number}`}</span>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.status === 'cleared' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/20 text-rose-300'}`}>
                    {a.status.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-300">Triggered Risk Indicators:</div>
                  <ul className="list-disc list-inside text-xs text-zinc-400 space-y-1 pl-1">
                    {a.triggers.map((t: string, idx: number) => (
                      <li key={idx} className="text-rose-300/90">{t}</li>
                    ))}
                  </ul>
                </div>

                {a.status !== 'cleared' && (
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => handleOverride(a.id)}
                      disabled={overridingId === a.id}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {overridingId === a.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Clear Flag & Approve
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
