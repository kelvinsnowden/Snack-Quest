import React, { useState, useEffect } from 'react';
import { Package, Sparkles, CheckCircle2, XCircle, ShieldCheck, HelpCircle, ArrowRight, Zap, RefreshCw, Cpu, Layers } from 'lucide-react';
import { safeFetchJson } from '../../lib/safeFetch';

export const ProductCatalogManager: React.FC = () => {
  const [packages, setPackages] = useState<any[]>([]);
  const [comparisonMatrix, setComparisonMatrix] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Recommendation engine tester state
  const [testQuery, setTestQuery] = useState('I want imported drinks in my box');
  const [testIntent, setTestIntent] = useState('best_value');
  const [testWantsDrinks, setTestWantsDrinks] = useState(true);
  const [recommendResult, setRecommendResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resPkg, resComp] = await Promise.all([
        safeFetchJson('/api/v1/packages'),
        safeFetchJson('/api/v1/packages/comparison')
      ]);
      setPackages(resPkg?.data || []);
      setComparisonMatrix(resComp?.matrix || []);
    } catch (e) {
      console.error('Error loading catalog data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTestRecommendation = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/v1/packages/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: testQuery,
          intent: testIntent,
          wants_drinks: testWantsDrinks
        })
      });
      const data = await res.json();
      setRecommendResult(data);
    } catch (e) {
      console.error('Error running recommendation test', e);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/20 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wide">
              Centralized Source of Truth
            </span>
            <span className="text-xs text-slate-400 font-mono">Stage 11.1 Enterprise Product Intelligence</span>
          </div>
          <h2 className="text-xl font-black text-white mt-1.5 flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-400" />
            Official Snack Quest Product Catalog & Knowledge Engine
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl mt-1">
            Authoritative package registry driving WhatChimp WhatsApp AI, Checkout, Creator Portal, Quest Center, Landing Pages, CRM, and Financial Reporting.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Catalog
        </button>
      </div>

      {/* Primary Catalog Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {packages.map((pkg) => {
          const priceKes = Math.round(pkg.selling_price / 100);
          return (
            <div
              key={pkg.id}
              className={`bg-slate-900/90 border rounded-2xl p-5 flex flex-col justify-between transition-all relative overflow-hidden ${
                pkg.sku === 'ULT-3500'
                  ? 'border-amber-500/50 shadow-lg shadow-amber-500/10'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {pkg.sku === 'ULT-3500' && (
                <div className="absolute top-0 right-0 bg-amber-500 text-slate-950 text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                  Best Value
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-amber-400 font-bold mb-1">
                  <span>SKU: {pkg.sku}</span>
                  <span>•</span>
                  <span>{pkg.currency || 'KES'}</span>
                </div>

                <h3 className="text-lg font-black text-white">{pkg.name}</h3>

                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white">KSh {priceKes.toLocaleString()}</span>
                  <span className="text-xs text-slate-400 font-medium">/ box</span>
                </div>

                <p className="text-xs text-slate-300 mt-3 leading-relaxed min-h-[60px]">
                  {pkg.description}
                </p>

                {/* Best For Note */}
                <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Best For:</span>
                  <span className="text-amber-300 font-medium">{pkg.best_for}</span>
                </div>

                {/* Characteristics Checklist */}
                <div className="mt-4 space-y-2 border-t border-slate-800/60 pt-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Imported Drinks</span>
                    {pkg.includes_drinks ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Included
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Snacks Only (No Drinks)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Referral Discounts</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Eligible
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Quest Wallet Redemption</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Eligible
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Creator Commission</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Applies
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Availability</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Nationwide
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>Active Status</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  LIVE
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drinks Rule & AI Knowledge Engine Tester */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drinks Rule Knowledge Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Drinks Rule & AI Recommendation Engine</h3>
              <p className="text-xs text-slate-400">System rules enforced across Gemini & WhatChimp</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-2 text-xs">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              The Official Drinks Rule
            </div>
            <p className="text-slate-300 leading-relaxed">
              If a customer requests drinks, beverages, soda, juice, or Asian drinks:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
              <li><strong className="text-white">Explorer Box (KSh 2,500)</strong> DOES NOT contain drinks.</li>
              <li>Recommend <strong className="text-amber-300">Ultimate Explorer Box (KSh 3,500)</strong> or <strong className="text-amber-300">Legendary Explorer Box (KSh 5,000)</strong>.</li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-bold block text-[10px] uppercase">"Never Tried" Query</span>
              <span className="text-white font-semibold">Explorer Box (KSh 2,500)</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-bold block text-[10px] uppercase">"Full Experience" Query</span>
              <span className="text-white font-semibold">Ultimate Explorer (KSh 3,500)</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-bold block text-[10px] uppercase">"Biggest Box" Query</span>
              <span className="text-white font-semibold">Legendary Explorer (KSh 5,000)</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-bold block text-[10px] uppercase">"Best Value" Query</span>
              <span className="text-white font-semibold">Ultimate Explorer (KSh 3,500)</span>
            </div>
          </div>
        </div>

        {/* Live Recommendation Engine Console */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Live Product Knowledge Test Console</h3>
              <p className="text-xs text-slate-400">Test AI recommendation output and rule execution</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-300 font-bold block mb-1">Customer Query / Input Prompt:</label>
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono text-xs focus:border-amber-500 outline-none"
                placeholder="e.g. Do you have Japanese sodas or drinks?"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-bold block mb-1">Intent Flag:</label>
                <select
                  value={testIntent}
                  onChange={(e) => setTestIntent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs outline-none"
                >
                  <option value="best_value">best_value</option>
                  <option value="never_tried">never_tried / entry</option>
                  <option value="full_experience">full_experience</option>
                  <option value="biggest_box">biggest_box</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Explicit Drinks Flag:</label>
                <label className="flex items-center gap-2 mt-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testWantsDrinks}
                    onChange={(e) => setTestWantsDrinks(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span>User Wants Drinks</span>
                </label>
              </div>
            </div>

            <button
              onClick={handleTestRecommendation}
              disabled={testing}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
            >
              {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Run Recommendation Engine Evaluation
            </button>

            {recommendResult && (
              <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono text-[10px] uppercase">Recommended Product:</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold font-mono">
                    {recommendResult.recommended_package?.name} ({recommendResult.recommended_package?.sku})
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Drinks Rule Triggered:</span>
                  <span className={recommendResult.drinks_rule_applied ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                    {recommendResult.drinks_rule_applied ? 'YES — Applied' : 'NO'}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800/60">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Reasoning:</span>
                  <p className="text-slate-300 text-xs italic">{recommendResult.reasoning}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/60">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">AI Response Text:</span>
                  <p className="text-amber-200 text-xs bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                    "{recommendResult.natural_language_response}"
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comparison Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Official Product Comparison Engine</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">Dynamic API: /api/v1/packages/comparison</span>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-300 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3.5 font-bold">Feature</th>
                <th className="p-3.5 font-bold text-amber-400">Explorer Box</th>
                <th className="p-3.5 font-bold text-amber-400">Ultimate Explorer Box</th>
                <th className="p-3.5 font-bold text-amber-400">Legendary Explorer Box</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {comparisonMatrix.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30">
                  <td className="p-3.5 font-bold text-white bg-slate-950/40">{row.feature}</td>
                  <td className="p-3.5 font-mono">{String(row.explorer)}</td>
                  <td className="p-3.5 font-mono font-bold text-amber-300 bg-amber-500/5">{String(row.ultimate)}</td>
                  <td className="p-3.5 font-mono">{String(row.legendary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
