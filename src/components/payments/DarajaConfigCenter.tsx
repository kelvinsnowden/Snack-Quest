import React, { useState, useEffect } from 'react';
import { Sliders, ShieldCheck, Key, RefreshCw, Zap, CheckCircle2, AlertTriangle, Globe, Lock } from 'lucide-react';

export const DarajaConfigCenter: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Form State
  const [env, setEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [passkey, setPasskey] = useState('');
  const [shortcode, setShortcode] = useState('');
  const [tillNumber, setTillNumber] = useState('');
  const [paybillNumber, setPaybillNumber] = useState('');
  const [initiatorName, setInitiatorName] = useState('');
  const [stkCallbackUrl, setStkCallbackUrl] = useState('');
  const [b2cResultUrl, setB2cResultUrl] = useState('');

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/payments/config');
      const json = await res.json();
      if (json.data) {
        setConfig(json.data);
        setEnv(json.data.environment || 'sandbox');
        setConsumerKey(json.data.consumer_key_masked || '');
        setConsumerSecret(json.data.consumer_secret_masked || '');
        setPasskey(json.data.passkey_masked || '');
        setShortcode(json.data.business_shortcode || '174379');
        setTillNumber(json.data.till_number || '889900');
        setPaybillNumber(json.data.paybill_number || '4088200');
        setInitiatorName(json.data.initiator_name || 'SnackQuestFinOps');
        setStkCallbackUrl(json.data.stk_callback_url || '');
        setB2cResultUrl(json.data.b2c_result_url || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/payments/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment: env,
          consumer_key: consumerKey,
          consumer_secret: consumerSecret,
          passkey,
          business_shortcode: shortcode,
          till_number: tillNumber,
          paybill_number: paybillNumber,
          initiator_name: initiatorName,
          stk_callback_url: stkCallbackUrl,
          b2c_result_url: b2cResultUrl
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Configuration saved successfully!');
        fetchConfig();
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setMessage(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/v1/payments/config/test', {
        method: 'POST'
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
        Loading Daraja Configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-blue-400" /> Safaricom Daraja 2.0 Configuration Center
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Manage live Daraja Express credentials, M-Pesa Till/Paybill numbers, RSA certificates & Webhook URLs.
            </p>
          </div>

          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
          >
            {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-300" />} Test Daraja OAuth Connection
          </button>
        </div>

        {testResult && (
          <div className={`p-4 rounded-xl border text-xs space-y-1 ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
            <div className="font-bold flex items-center gap-2">
              {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
              {testResult.message || testResult.error}
            </div>
            {testResult.oauth_token && (
              <div className="font-mono text-[11px] text-zinc-400">
                Token: {testResult.oauth_token} | Expires: {testResult.expires_in_seconds}s | Latency: {testResult.latency_ms}ms
              </div>
            )}
          </div>
        )}

        {message && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-medium">
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Environment</label>
              <select
                value={env}
                onChange={(e: any) => setEnv(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-bold"
              >
                <option value="sandbox">Sandbox (Testing / Simulator)</option>
                <option value="production">Production (Safaricom Live)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Business Shortcode</label>
              <input
                type="text"
                value={shortcode}
                onChange={(e) => setShortcode(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Till Number</label>
              <input
                type="text"
                value={tillNumber}
                onChange={(e) => setTillNumber(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Consumer Key</label>
              <div className="relative">
                <input
                  type="text"
                  value={consumerKey}
                  onChange={(e) => setConsumerKey(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono pl-8"
                />
                <Key className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-3" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Consumer Secret</label>
              <div className="relative">
                <input
                  type="password"
                  value={consumerSecret}
                  onChange={(e) => setConsumerSecret(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono pl-8"
                />
                <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-3" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Lipa Na M-Pesa Passkey</label>
              <input
                type="password"
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">STK Push Callback Webhook URL</label>
              <div className="relative">
                <input
                  type="text"
                  value={stkCallbackUrl}
                  onChange={(e) => setStkCallbackUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono pl-8"
                />
                <Globe className="w-3.5 h-3.5 text-blue-400 absolute left-2.5 top-3" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">B2C Payout Result Webhook URL</label>
              <div className="relative">
                <input
                  type="text"
                  value={b2cResultUrl}
                  onChange={(e) => setB2cResultUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono pl-8"
                />
                <Globe className="w-3.5 h-3.5 text-blue-400 absolute left-2.5 top-3" />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Save Daraja Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
