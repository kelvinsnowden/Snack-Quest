import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Smartphone,
  Globe,
  Clock,
  Tag,
  ChevronRight,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ShoppingBag,
  Eye,
  RefreshCw
} from 'lucide-react';

export interface JourneySession {
  id: string;
  visitor_id: string;
  landing_page_id: string;
  device_type: string;
  browser: string;
  os: string;
  location: string;
  ip_address: string;
  referrer: string;
  utm_source: string;
  utm_campaign: string;
  ref_code?: string | null;
  creator_id?: string | null;
  first_visit_timestamp: string;
  last_activity: string;
  is_active: boolean;
  event_count: number;
  events: Array<{
    id: string;
    event_name: string;
    timestamp: string;
    page_url: string;
    metadata?: any;
  }>;
}

export const SessionJourneyExplorer: React.FC = () => {
  const [sessions, setSessions] = useState<JourneySession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<JourneySession | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/marketing/sessions/explorer');
      const json = await res.json();
      const data: JourneySession[] = json.data || [];
      setSessions(data);
      if (data.length > 0 && !selectedSession) {
        setSelectedSession(data[0]);
      }
    } catch (e) {
      console.error('Failed to load session explorer data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const filteredSessions = sessions.filter((s) => {
    const q = searchTerm.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      s.visitor_id.toLowerCase().includes(q) ||
      (s.ref_code && s.ref_code.toLowerCase().includes(q)) ||
      (s.utm_source && s.utm_source.toLowerCase().includes(q)) ||
      (s.landing_page_id && s.landing_page_id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            Visitor Journey Explorer & Session Timeline
          </h3>
          <p className="text-xs text-slate-500">
            Real-time event stream timeline connecting ad click, landing page interaction, creator code, and WhatsApp order
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search session ID, ref code, campaign..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <button
            onClick={fetchSessions}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh Sessions"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">
          Loading visitor journeys...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Sessions List (Left) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active & Recent Sessions</span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {filteredSessions.length} Recorded
              </span>
            </div>

            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
              {filteredSessions.map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => setSelectedSession(sess)}
                  className={`p-4 cursor-pointer transition-all ${
                    selectedSession?.id === sess.id ? 'bg-amber-50/80 border-l-4 border-amber-500' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs font-bold text-slate-900">{sess.id}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                        sess.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {sess.is_active ? '● Live Now' : 'Ended'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 flex items-center gap-2 mb-2">
                    <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{sess.device_type} ({sess.os})</span>
                    <span className="text-slate-300">•</span>
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span>{sess.location}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-700">{sess.landing_page_id}</span>
                    {sess.ref_code && (
                      <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {sess.ref_code}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Session Timeline Replay (Right) */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            {selectedSession ? (
              <>
                {/* Session Header Details */}
                <div className="border-b border-slate-100 pb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        Session: {selectedSession.id}
                        {selectedSession.is_active && (
                          <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                            Active Stream
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Visitor ID: <span className="font-mono text-slate-700">{selectedSession.visitor_id}</span> | IP: {selectedSession.ip_address}
                      </p>
                    </div>

                    <div className="text-right text-xs">
                      <div className="font-semibold text-slate-700">First Touch: {selectedSession.utm_source}</div>
                      <div className="text-slate-500">Campaign: {selectedSession.utm_campaign}</div>
                    </div>
                  </div>

                  {/* Attribution Banner */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">Landing Page:</span>
                      <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">{selectedSession.landing_page_id}</span>
                    </div>

                    {selectedSession.ref_code && (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-800">Creator Referral:</span>
                        <span className="font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-200">
                          {selectedSession.ref_code}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(selectedSession.first_visit_timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>

                {/* Event Timeline Flow (Event Replay Format) */}
                <div className="space-y-4">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Chronological Journey Timeline ({selectedSession.events.length} Events)
                  </h5>

                  <div className="relative border-l-2 border-slate-200 ml-3 pl-6 space-y-6">
                    {selectedSession.events.map((evt, idx) => {
                      const isWhatsApp = evt.event_name === 'WhatsAppClick';
                      const isScroll = evt.event_name === 'ScrollDepth';
                      const isPage = evt.event_name === 'PageView';

                      return (
                        <div key={evt.id || idx} className="relative group">
                          {/* Timeline Dot */}
                          <div
                            className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-xs flex items-center justify-center ${
                              isWhatsApp
                                ? 'bg-emerald-500'
                                : isScroll
                                ? 'bg-blue-500'
                                : isPage
                                ? 'bg-amber-500'
                                : 'bg-slate-400'
                            }`}
                          />

                          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-1">
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs font-bold ${
                                  isWhatsApp ? 'text-emerald-700' : isScroll ? 'text-blue-700' : 'text-slate-900'
                                }`}
                              >
                                {evt.event_name}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {new Date(evt.timestamp).toLocaleTimeString()}
                              </span>
                            </div>

                            <div className="text-xs text-slate-600 truncate">{evt.page_url}</div>

                            {evt.metadata && (
                              <div className="mt-2 text-[11px] bg-white p-2 rounded border border-slate-200 font-mono text-slate-700">
                                {JSON.stringify(evt.metadata)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-slate-400 text-sm">Select a session on the left to inspect timeline.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
