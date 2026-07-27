import React, { useState, useEffect } from 'react';
import { Customer, Order, CustomerStatus, CustomerTimelineEvent, SupportTicket, CustomerInternalNote, CustomerCommunicationLog, CustomerSurveyRecord, CustomerPrivacyConsent, CustomerSegment } from '../../types/database';
import { X, ShieldAlert, Award, Tag, Plus, MessageSquare, History, Phone, Mail, MapPin, Share2, Check, AlertTriangle, HeartPulse, Ticket, FileText, Sparkles, Download, Trash2, UserCheck, RefreshCw, Zap, Lock, Gift, Smile, Send, Calendar, Clock, ChevronRight, UserX } from 'lucide-react';

interface Props {
  customerId: string;
  onClose: () => void;
  onUpdate: () => void;
}

type TabType = 'overview' | 'timeline' | 'health_retention' | 'support_tickets' | 'staff_notes' | 'communications' | 'privacy_consent' | 'ai_intelligence';

export const CustomerDetailModal: React.FC<Props> = ({ customerId, onClose, onUpdate }) => {
  const [data, setData] = useState<{
    customer: Customer;
    tags: string[];
    orders: Order[];
    wallet_transactions: any[];
    timeline_events: CustomerTimelineEvent[];
    support_tickets: SupportTicket[];
    internal_notes: CustomerInternalNote[];
    communication_logs: CustomerCommunicationLog[];
    surveys: CustomerSurveyRecord[];
    privacy_consent: CustomerPrivacyConsent;
    health_details: { score: number; status: 'healthy' | 'attention_needed' | 'at_risk'; factors: string[] };
    matched_segments: CustomerSegment[];
    referred_by: any;
    referrals_made: any[];
    preferred_pickup_station: any;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Tag form state
  const [newTag, setNewTag] = useState('');

  // Status override state
  const [overrideStatus, setOverrideStatus] = useState<CustomerStatus>('blacklisted');
  const [overrideNote, setOverrideNote] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState('');

  // Preferences form state
  const [favCategories, setFavCategories] = useState<string>('');
  const [favCountries, setFavCountries] = useState<string>('');
  const [dietary, setDietary] = useState<string>('');
  const [language, setLanguage] = useState<string>('en');
  const [savingPrefs, setSavingPrefs] = useState(false);

  // New Timeline Event state
  const [newEvtTitle, setNewEvtTitle] = useState('');
  const [newEvtDesc, setNewEvtDesc] = useState('');
  const [newEvtType, setNewEvtType] = useState('note_added');

  // New Ticket state
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketCat, setNewTicketCat] = useState('general_inquiry');
  const [newTicketPri, setNewTicketPri] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [newTicketDesc, setNewTicketDesc] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  // New Internal Note state
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteCat, setNewNoteCat] = useState<'preference' | 'gift_packaging' | 'influencer_vip' | 'delivery_instruction' | 'warning' | 'general'>('general');
  const [creatingNote, setCreatingNote] = useState(false);

  // New Comm Log state
  const [commChannel, setCommChannel] = useState<'whatsapp' | 'email' | 'sms' | 'phone_call'>('whatsapp');
  const [commMessage, setCommMessage] = useState('');
  const [loggingComm, setLoggingComm] = useState(false);

  // PrivacyConsent state
  const [privacyState, setPrivacyState] = useState({ marketing_whatsapp: true, marketing_email: true, marketing_sms: false, data_analytics: true });
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // AI draft state
  const [aiDraftPrompt, setAiDraftPrompt] = useState('');
  const [aiDraftReply, setAiDraftReply] = useState('');
  const [generatingAiReply, setGeneratingAiReply] = useState(false);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/crm/customers/${customerId}`);
      const json = await res.json();
      if (res.ok) {
        setData(json);
        setOverrideStatus(json.customer.status === 'blacklisted' ? 'active' : 'blacklisted');
        setFavCategories((json.customer.favourite_categories || []).join(', '));
        setFavCountries((json.customer.favourite_countries_of_origin || []).join(', '));
        setDietary((json.customer.dietary_preferences || []).join(', '));
        setLanguage(json.customer.preferred_language || 'en');
        if (json.privacy_consent) {
          setPrivacyState({
            marketing_whatsapp: json.privacy_consent.marketing_whatsapp,
            marketing_email: json.privacy_consent.marketing_email,
            marketing_sms: json.privacy_consent.marketing_sms,
            data_analytics: json.privacy_consent.data_analytics
          });
        }
      }
    } catch (e) {
      console.error('Failed to load customer details', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [customerId]);

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      await fetch(`/api/v1/crm/customers/${customerId}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_language: language,
          favourite_categories: favCategories.split(',').map((s) => s.trim()).filter(Boolean),
          favourite_countries_of_origin: favCountries.split(',').map((s) => s.trim()).filter(Boolean),
          dietary_preferences: dietary.split(',').map((s) => s.trim()).filter(Boolean)
        })
      });
      fetchDetail();
      onUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    try {
      await fetch(`/api/v1/crm/customers/${customerId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: newTag.toUpperCase().replace(/\s+/g, '_'), action: 'add' })
      });
      setNewTag('');
      fetchDetail();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    try {
      await fetch(`/api/v1/crm/customers/${customerId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: tagToRemove, action: 'remove' })
      });
      fetchDetail();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStatusOverride = async () => {
    setOverrideError('');
    if (!overrideNote.trim() || overrideNote.trim().length < 5) {
      setOverrideError('A mandatory note explaining the reason (min 5 chars) is required.');
      return;
    }

    setSavingOverride(true);
    try {
      const res = await fetch(`/api/v1/crm/customers/${customerId}/status-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_status: overrideStatus, note: overrideNote })
      });
      const json = await res.json();
      if (!res.ok) {
        setOverrideError(json.error || 'Failed to override status');
      } else {
        setOverrideNote('');
        fetchDetail();
        onUpdate();
      }
    } catch (e) {
      setOverrideError('Network error executing status override');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleAddTimelineEvent = async () => {
    if (!newEvtTitle.trim()) return;
    try {
      await fetch(`/api/v1/crm/customers/${customerId}/timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: newEvtType, title: newEvtTitle, description: newEvtDesc, actor: 'staff' })
      });
      setNewEvtTitle('');
      setNewEvtDesc('');
      fetchDetail();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateSupportTicket = async () => {
    if (!newTicketSubject.trim()) return;
    setCreatingTicket(true);
    try {
      await fetch(`/api/v1/crm/support/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          subject: newTicketSubject,
          category: newTicketCat,
          priority: newTicketPri,
          description: newTicketDesc
        })
      });
      setNewTicketSubject('');
      setNewTicketDesc('');
      fetchDetail();
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleCreateInternalNote = async () => {
    if (!newNoteContent.trim()) return;
    setCreatingNote(true);
    try {
      await fetch(`/api/v1/crm/customers/${customerId}/internal-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newNoteContent,
          note_category: newNoteCat
        })
      });
      setNewNoteContent('');
      fetchDetail();
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingNote(false);
    }
  };

  const handleLogCommunication = async () => {
    if (!commMessage.trim()) return;
    setLoggingComm(true);
    try {
      await fetch(`/api/v1/crm/customers/${customerId}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: commChannel,
          direction: 'outbound',
          message_content: commMessage
        })
      });
      setCommMessage('');
      fetchDetail();
    } catch (e) {
      console.error(e);
    } finally {
      setLoggingComm(false);
    }
  };

  const handleTriggerRetention = async (actionType: string) => {
    try {
      await fetch(`/api/v1/crm/retention/trigger-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          action_type: actionType,
          reward_amount_cents: 30000,
          notes: `Granted KSh 300 retention credit`
        })
      });
      fetchDetail();
      onUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePrivacy = async () => {
    setSavingPrivacy(true);
    try {
      await fetch(`/api/v1/crm/customers/${customerId}/privacy/consent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(privacyState)
      });
      fetchDetail();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleExportData = async () => {
    window.open(`/api/v1/crm/customers/${customerId}/privacy/export`, '_blank');
  };

  const handleDeletePII = async () => {
    if (window.confirm('CRITICAL WARN: Are you sure you want to anonymize this customer PII per right-to-delete request? Financial order records will be preserved.')) {
      try {
        await fetch(`/api/v1/crm/customers/${customerId}/privacy/delete-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        fetchDetail();
        onUpdate();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleGenerateAiReply = async () => {
    setGeneratingAiReply(true);
    try {
      const res = await fetch(`/api/v1/crm/ai/draft-support-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_instruction: aiDraftPrompt })
      });
      const json = await res.json();
      setAiDraftReply(json.draft);
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingAiReply(false);
    }
  };

  const formatKes = (amountCents: number) => `KSh ${(amountCents / 100).toLocaleString()}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end transition-opacity">
      <div className="w-full max-w-4xl bg-zinc-950 border-l border-zinc-800 h-full overflow-y-auto p-6 flex flex-col justify-between text-zinc-100">
        <div>
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Customer Intelligence Platform</span>
                {data?.customer.privacy_anonymized && (
                  <span className="px-2 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700 text-[10px] font-mono">PII ANONYMIZED</span>
                )}
              </div>
              <h3 className="text-xl font-bold text-white mt-0.5 flex items-center gap-2">
                {data?.customer.full_name || 'Loading Customer...'}
                {data?.customer.health_status && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    data.customer.health_status === 'healthy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    data.customer.health_status === 'attention_needed' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    Score: {data.customer.health_score}/100
                  </span>
                )}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sub-Nav Tabs */}
          <div className="flex items-center gap-1 mt-4 overflow-x-auto border-b border-zinc-800 pb-2 scrollbar-none">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'overview' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" /> 360 Profile
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'timeline' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <History className="w-3.5 h-3.5" /> Timeline ({data?.timeline_events.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('health_retention')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'health_retention' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5" /> Health & Retention
            </button>
            <button
              onClick={() => setActiveTab('support_tickets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'support_tickets' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" /> Support Tickets ({data?.support_tickets.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('staff_notes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'staff_notes' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Internal Notes ({data?.internal_notes.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('communications')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'communications' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <Send className="w-3.5 h-3.5" /> Comms Log ({data?.communication_logs.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('privacy_consent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'privacy_consent' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <Lock className="w-3.5 h-3.5" /> Privacy & Consent
            </button>
            <button
              onClick={() => setActiveTab('ai_intelligence')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'ai_intelligence' ? 'bg-purple-600 text-white font-semibold' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-300" /> AI Insights
            </button>
          </div>

          {loading || !data ? (
            <div className="py-16 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
              Loading complete 360 customer profile...
            </div>
          ) : (
            <div className="mt-6">
              {/* TAB 1: OVERVIEW & 360 PROFILE */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Contact & Status Card */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80">
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Phone className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="font-mono font-medium">{data.customer.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Mail className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{data.customer.email || 'No email provided'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300">
                        <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{data.customer.delivery_address || 'No address'}, {data.customer.town}, {data.customer.county}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Joined: {new Date(data.customer.registration_date).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs border-t md:border-t-0 md:border-l border-zinc-800 pt-3 md:pt-0 md:pl-4">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Computed Status:</span>
                        <span className="inline-block mt-1 font-mono uppercase font-bold text-xs px-2.5 py-0.5 rounded bg-zinc-800 text-white border border-zinc-700">
                          {data.customer.status}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Quest Wallet Balance:</span>
                        <span className="font-mono font-bold text-emerald-400 text-sm">{formatKes(data.customer.quest_wallet_balance)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Preferred Station / Method:</span>
                        <span className="text-xs text-zinc-300 font-medium">
                          {data.preferred_pickup_station ? `${data.preferred_pickup_station.station_name} (${data.preferred_pickup_station.town})` : 'Jumia Pickup Station'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lifetime Financial Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Lifetime Revenue</span>
                      <span className="text-lg font-bold font-mono text-emerald-400 mt-0.5 block">{formatKes(data.customer.lifetime_revenue)}</span>
                    </div>
                    <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Net Profit</span>
                      <span className="text-lg font-bold font-mono text-blue-400 mt-0.5 block">{formatKes(data.customer.lifetime_profit)}</span>
                    </div>
                    <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Lifetime Orders</span>
                      <span className="text-lg font-bold font-mono text-white mt-0.5 block">{data.customer.lifetime_orders}</span>
                    </div>
                    <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Referrals Made</span>
                      <span className="text-lg font-bold font-mono text-amber-400 mt-0.5 block">{data.referrals_made.length}</span>
                    </div>
                  </div>

                  {/* Snack Preferences Form */}
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-amber-400" /> Snack & Language Preferences
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-zinc-400 block mb-1">Favorite Categories (comma-separated):</label>
                        <input
                          type="text"
                          value={favCategories}
                          onChange={(e) => setFavCategories(e.target.value)}
                          placeholder="e.g. Japanese, Matcha, Spicy"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">Favorite Origins (comma-separated):</label>
                        <input
                          type="text"
                          value={favCountries}
                          onChange={(e) => setFavCountries(e.target.value)}
                          placeholder="e.g. Japan, South Korea, USA"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">Dietary Restrictions & Allergies:</label>
                        <input
                          type="text"
                          value={dietary}
                          onChange={(e) => setDietary(e.target.value)}
                          placeholder="e.g. Halal, Vegan, Nut Allergy"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">Preferred Language:</label>
                        <select
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-white"
                        >
                          <option value="en">English</option>
                          <option value="sw">Swahili</option>
                          <option value="sheng">Sheng / Casual</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={handleSavePreferences}
                      disabled={savingPrefs}
                      className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition-colors cursor-pointer"
                    >
                      {savingPrefs ? 'Saving Preferences...' : 'Save Preferences'}
                    </button>
                  </div>

                  {/* Customer Tags */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-blue-400" /> Customer Tags & Segments
                    </span>
                    <div className="flex flex-wrap gap-2 items-center">
                      {data.tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 text-zinc-200 text-xs font-mono border border-zinc-700">
                          {tag}
                          <button onClick={() => handleRemoveTag(tag)} className="text-zinc-500 hover:text-red-400 cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {data.matched_segments.map((seg) => (
                        <span key={seg.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-purple-900/40 text-purple-300 text-xs font-mono border border-purple-700">
                          SEG: {seg.name}
                        </span>
                      ))}
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="NEW_TAG"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          className="bg-zinc-900 border border-zinc-800 text-xs font-mono px-2 py-1 rounded text-white w-28 focus:outline-none focus:border-blue-500"
                        />
                        <button onClick={handleAddTag} className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white cursor-pointer">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Order History */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-blue-400" /> Order History ({data.orders.length})
                    </span>
                    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-900 font-mono text-[10px] text-zinc-500 uppercase border-b border-zinc-800">
                          <tr>
                            <th className="p-2.5">Order ID</th>
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Status</th>
                            <th className="p-2.5">Paid</th>
                            <th className="p-2.5 text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {data.orders.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-3 text-center text-zinc-500">No orders recorded yet.</td>
                            </tr>
                          ) : (
                            data.orders.map((o) => (
                              <tr key={o.id}>
                                <td className="p-2.5 font-mono text-white font-medium">{o.id}</td>
                                <td className="p-2.5 text-zinc-400">{new Date(o.order_date).toLocaleDateString()}</td>
                                <td className="p-2.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 uppercase">
                                    {o.order_status}
                                  </span>
                                </td>
                                <td className="p-2.5 font-mono text-emerald-400">{formatKes(o.final_amount_paid)}</td>
                                <td className="p-2.5 font-mono text-right text-blue-400">{formatKes(o.net_profit)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Manual Status Override & Blacklisting Section */}
                  <div className="bg-red-950/20 border border-red-900/40 p-4 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-red-400 font-semibold text-xs">
                      <ShieldAlert className="w-4 h-4" /> Manual Status Override & Blacklisting
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Override computed status (e.g. mark customer as Blacklisted due to fraud, or revert to Active).
                      A mandatory note will be permanently logged in audit logs.
                    </p>

                    {overrideError && (
                      <div className="p-2 bg-red-900/50 border border-red-700 text-red-200 text-xs rounded flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {overrideError}
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-zinc-300">Target Status:</label>
                        <select
                          value={overrideStatus}
                          onChange={(e) => setOverrideStatus(e.target.value as CustomerStatus)}
                          className="bg-zinc-900 border border-zinc-800 text-xs px-3 py-1.5 rounded text-white focus:outline-none focus:border-red-500"
                        >
                          <option value="blacklisted">Blacklisted (Restricted)</option>
                          <option value="active">Active (Normal)</option>
                          <option value="vip">VIP (Manual Grant)</option>
                          <option value="dormant">Dormant</option>
                        </select>
                      </div>

                      <input
                        type="text"
                        placeholder="Mandatory audit note explaining override reason..."
                        value={overrideNote}
                        onChange={(e) => setOverrideNote(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-xs p-2.5 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                      />

                      <button
                        onClick={handleStatusOverride}
                        disabled={savingOverride}
                        className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-medium text-xs transition-colors cursor-pointer"
                      >
                        {savingOverride ? 'Processing Override...' : 'Execute Status Override'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CUSTOMER TIMELINE */}
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  {/* Add Event Form */}
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-blue-400" /> Log Custom Timeline Event
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <input
                        type="text"
                        placeholder="Event Title (e.g. Phone call inquiry)"
                        value={newEvtTitle}
                        onChange={(e) => setNewEvtTitle(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white"
                      />
                      <select
                        value={newEvtType}
                        onChange={(e) => setNewEvtType(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white"
                      >
                        <option value="note_added">Staff Note Added</option>
                        <option value="phone_call">Phone Call Received</option>
                        <option value="whatsapp_started">WhatsApp Conversation</option>
                        <option value="address_updated">Address Change Request</option>
                        <option value="custom_event">Custom Event</option>
                      </select>
                      <button
                        onClick={handleAddTimelineEvent}
                        className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors cursor-pointer"
                      >
                        Add to Timeline
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Event details / description..."
                      value={newEvtDesc}
                      onChange={(e) => setNewEvtDesc(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-white"
                    />
                  </div>

                  {/* Timeline Stream */}
                  <div className="relative border-l border-zinc-800 ml-4 pl-6 space-y-6">
                    {data.timeline_events.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-4">No timeline events recorded yet.</p>
                    ) : (
                      data.timeline_events.map((evt) => (
                        <div key={evt.id} className="relative group">
                          <span className="absolute -left-[31px] top-0 w-3 h-3 rounded-full bg-blue-500 border-2 border-zinc-950" />
                          <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-semibold text-white">{evt.title}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">{new Date(evt.created_at).toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-zinc-300">{evt.description}</p>
                            <span className="inline-block mt-2 px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 font-mono">
                              Actor: {evt.actor} ({evt.event_type})
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: HEALTH SCORE & RETENTION ENGINE */}
              {activeTab === 'health_retention' && (
                <div className="space-y-6">
                  {/* Health Score Box */}
                  <div className="bg-zinc-900/60 p-5 rounded-xl border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-zinc-500">Customer Health Score</span>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-3xl font-black font-mono text-white">{data.health_details.score}/100</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                          data.health_details.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          data.health_details.status === 'attention_needed' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {data.health_details.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-2">
                        Computed dynamically based on purchase recency, support ticket complaints, quest participation, and refund history.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleTriggerRetention('winback_offer')}
                        className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5" /> Trigger KSh 300 Win-back Offer
                      </button>
                      <button
                        onClick={() => handleTriggerRetention('vip_upgrade')}
                        className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Award className="w-3.5 h-3.5" /> Grant VIP Loyalty Credit
                      </button>
                    </div>
                  </div>

                  {/* Factor Breakdown */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Health Score Weight Factors
                    </span>
                    <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800 space-y-2">
                      {data.health_details.factors.map((factor, idx) => (
                        <div key={idx} className="text-xs text-zinc-300 font-mono bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
                          {factor}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: SUPPORT TICKETS & CASE MANAGEMENT */}
              {activeTab === 'support_tickets' && (
                <div className="space-y-6">
                  {/* Create Ticket */}
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-blue-400" /> Open New Support Case
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <input
                        type="text"
                        placeholder="Ticket Subject..."
                        value={newTicketSubject}
                        onChange={(e) => setNewTicketSubject(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white"
                      />
                      <select
                        value={newTicketCat}
                        onChange={(e) => setNewTicketCat(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white"
                      >
                        <option value="general_inquiry">General Inquiry</option>
                        <option value="delivery_issue">Delivery / Pickup Issue</option>
                        <option value="payment_query">M-Pesa Payment Query</option>
                        <option value="damaged_product">Damaged / Missing Item</option>
                        <option value="refund_request">Refund Request</option>
                      </select>
                      <select
                        value={newTicketPri}
                        onChange={(e) => setNewTicketPri(e.target.value as any)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white"
                      >
                        <option value="low">Low Priority (8h SLA)</option>
                        <option value="medium">Medium Priority (4h SLA)</option>
                        <option value="high">High Priority (2h SLA)</option>
                        <option value="urgent">Urgent Priority (30m SLA)</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Ticket description / customer message..."
                      value={newTicketDesc}
                      onChange={(e) => setNewTicketDesc(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white"
                    />
                    <button
                      onClick={handleCreateSupportTicket}
                      disabled={creatingTicket}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors cursor-pointer"
                    >
                      {creatingTicket ? 'Creating Case...' : 'Open Case'}
                    </button>
                  </div>

                  {/* Tickets List */}
                  <div className="space-y-3">
                    {data.support_tickets.length === 0 ? (
                      <p className="text-xs text-zinc-500 text-center py-6">No support tickets associated with this customer.</p>
                    ) : (
                      data.support_tickets.map((ticket) => (
                        <div key={ticket.id} className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-white">{ticket.ticket_number} - {ticket.subject}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                              ticket.status === 'open' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                              {ticket.status}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-300">{ticket.description}</p>
                          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800">
                            <span>Category: {ticket.category} | Priority: {ticket.priority}</span>
                            <span>SLA Expires: {new Date(ticket.sla_expires_at).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: STAFF INTERNAL NOTES */}
              {activeTab === 'staff_notes' && (
                <div className="space-y-6">
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-400" /> Record Staff Internal Note
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={newNoteCat}
                        onChange={(e) => setNewNoteCat(e.target.value as any)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-white"
                      >
                        <option value="general">General Note</option>
                        <option value="preference">Snack Preference</option>
                        <option value="gift_packaging">Gift Ribbon / Packaging Request</option>
                        <option value="influencer_vip">Influencer / VIP Note</option>
                        <option value="delivery_instruction">Delivery Instruction</option>
                        <option value="warning">Behavior Warning</option>
                      </select>
                    </div>
                    <textarea
                      rows={3}
                      placeholder="Enter confidential internal note for team members..."
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-xs text-white"
                    />
                    <button
                      onClick={handleCreateInternalNote}
                      disabled={creatingNote}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors cursor-pointer"
                    >
                      {creatingNote ? 'Saving Note...' : 'Save Note'}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {data.internal_notes.length === 0 ? (
                      <p className="text-xs text-zinc-500 text-center py-6">No internal staff notes recorded.</p>
                    ) : (
                      data.internal_notes.map((note) => (
                        <div key={note.id} className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-zinc-200">{note.author_name} ({note.note_category})</span>
                            <span className="text-[10px] text-zinc-500 font-mono">{new Date(note.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-zinc-300">{note.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: COMMUNICATION LOG */}
              {activeTab === 'communications' && (
                <div className="space-y-6">
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-emerald-400" /> Log Outbound Communication
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={commChannel}
                        onChange={(e) => setCommChannel(e.target.value as any)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-white"
                      >
                        <option value="whatsapp">WhatsApp (WhatChimp Gateway)</option>
                        <option value="email">Email</option>
                        <option value="sms">SMS Gateway</option>
                        <option value="phone_call">Phone Call Log</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Message content sent to customer..."
                      value={commMessage}
                      onChange={(e) => setCommMessage(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-xs text-white"
                    />
                    <button
                      onClick={handleLogCommunication}
                      disabled={loggingComm}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors cursor-pointer"
                    >
                      {loggingComm ? 'Logging Message...' : 'Log Message Entry'}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {data.communication_logs.map((comm) => (
                      <div key={comm.id} className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-white uppercase font-mono">{comm.channel} ({comm.direction})</span>
                          <span className="text-[10px] text-zinc-500 font-mono">{new Date(comm.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-zinc-300">{comm.message_content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 7: PRIVACY & DATA GOVERNANCE */}
              {activeTab === 'privacy_consent' && (
                <div className="space-y-6">
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-4">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-blue-400" /> Customer Marketing & Data Consents
                    </span>
                    <div className="space-y-3 text-xs">
                      <label className="flex items-center justify-between text-zinc-300">
                        <span>WhatsApp Marketing Broadcasts:</span>
                        <input
                          type="checkbox"
                          checked={privacyState.marketing_whatsapp}
                          onChange={(e) => setPrivacyState({ ...privacyState, marketing_whatsapp: e.target.checked })}
                          className="rounded border-zinc-800 text-blue-600 focus:ring-0"
                        />
                      </label>
                      <label className="flex items-center justify-between text-zinc-300">
                        <span>Email Promotional Newsletters:</span>
                        <input
                          type="checkbox"
                          checked={privacyState.marketing_email}
                          onChange={(e) => setPrivacyState({ ...privacyState, marketing_email: e.target.checked })}
                          className="rounded border-zinc-800 text-blue-600 focus:ring-0"
                        />
                      </label>
                      <label className="flex items-center justify-between text-zinc-300">
                        <span>SMS Flash Sale Notifications:</span>
                        <input
                          type="checkbox"
                          checked={privacyState.marketing_sms}
                          onChange={(e) => setPrivacyState({ ...privacyState, marketing_sms: e.target.checked })}
                          className="rounded border-zinc-800 text-blue-600 focus:ring-0"
                        />
                      </label>
                    </div>
                    <button
                      onClick={handleSavePrivacy}
                      disabled={savingPrivacy}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors cursor-pointer"
                    >
                      {savingPrivacy ? 'Saving Consent...' : 'Update Consent Settings'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5 text-emerald-400" /> 360 Profile Data Export
                      </span>
                      <p className="text-xs text-zinc-400">Generate and download complete JSON file containing customer history.</p>
                      <button
                        onClick={handleExportData}
                        className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium cursor-pointer"
                      >
                        Download 360 Profile Export
                      </button>
                    </div>

                    <div className="bg-red-950/20 p-4 rounded-xl border border-red-900/40 space-y-2">
                      <span className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" /> Right-to-Delete PII Anonymization
                      </span>
                      <p className="text-xs text-zinc-400">Safely anonymize full name, phone number, and email while retaining order financial totals for tax integrity.</p>
                      <button
                        onClick={handleDeletePII}
                        className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium cursor-pointer"
                      >
                        Anonymize Customer PII
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 8: AI INSIGHTS & READINESS */}
              {activeTab === 'ai_intelligence' && (
                <div className="space-y-6">
                  <div className="bg-purple-950/20 border border-purple-900/40 p-4 rounded-xl space-y-3">
                    <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" /> AI Support Reply Assistant
                    </span>
                    <input
                      type="text"
                      placeholder="Enter instruction for AI (e.g. Apologize for delay and offer KSh 200 coupon)..."
                      value={aiDraftPrompt}
                      onChange={(e) => setAiDraftPrompt(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-xs text-white"
                    />
                    <button
                      onClick={handleGenerateAiReply}
                      disabled={generatingAiReply}
                      className="px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> {generatingAiReply ? 'Drafting Reply...' : 'Draft AI Response'}
                    </button>

                    {aiDraftReply && (
                      <div className="p-3 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 font-sans space-y-2">
                        <span className="text-[10px] font-mono text-purple-400 uppercase block">Generated Draft:</span>
                        <p>{aiDraftReply}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-zinc-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium cursor-pointer"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
};
