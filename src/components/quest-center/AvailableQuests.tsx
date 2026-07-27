import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Search,
  Filter,
  Clock,
  Zap,
  ExternalLink,
  Upload,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Star
} from 'lucide-react';
import QuestSubmitModal from './QuestSubmitModal';

interface AvailableQuestsProps {
  customerId: string;
  onSubmissionCreated: () => void;
}

export default function AvailableQuests({ customerId, onSubmissionCreated }: AvailableQuestsProps) {
  const [quests, setQuests] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeModalQuest, setActiveModalQuest] = useState<any | null>(null);

  const fetchQuests = () => {
    setLoading(true);
    fetch('/api/v1/customer/portal/available-quests')
      .then((res) => res.json())
      .then((data) => {
        if (data.data && Array.isArray(data.data)) {
          setQuests(data.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load available quests', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchQuests();
  }, []);

  const categories = ['All', 'Reviews', 'Social', 'Video', 'Creative', 'Referral'];

  const filteredQuests = quests.filter((q) => {
    const matchesCategory = selectedCategory === 'All' || q.category === selectedCategory;
    const matchesSearch =
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Available Quest Catalog</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Choose a quest below, complete the action on social media or Google, and submit your proof screenshot or video link.
          </p>
        </div>

        {/* Search & Category Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search quests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Quests Grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading active quest catalog...</div>
      ) : filteredQuests.length === 0 ? (
        <div className="py-12 text-center bg-slate-900/50 border border-slate-800 rounded-2xl p-8">
          <p className="text-slate-400 text-sm">No active quests found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredQuests.map((quest) => (
            <div
              key={quest.id}
              className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between group transition-all hover:scale-[1.01]"
            >
              <div>
                {/* Image Banner */}
                <div className="relative h-44 overflow-hidden bg-slate-800">
                  <img
                    src={quest.image_url}
                    alt={quest.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

                  {/* Reward Badge */}
                  <div className="absolute top-3 right-3 px-3 py-1 rounded-xl bg-slate-950/90 backdrop-blur-md border border-amber-500/40 text-amber-400 font-extrabold text-xs shadow-lg">
                    +{quest.credit_value_kes.toLocaleString()} KES
                  </div>

                  {/* Difficulty & Category Chip */}
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase">
                      {quest.category}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-slate-900/80 text-slate-300 text-[10px] font-semibold border border-slate-700">
                      ⚡ {quest.difficulty}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="font-bold text-white text-base group-hover:text-amber-400 transition-colors mb-2">
                    {quest.title}
                  </h3>
                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-4">
                    {quest.description}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      ~{quest.est_minutes} mins
                    </span>
                    <span>•</span>
                    <span className="text-slate-400">
                      {quest.requires_approval ? 'Requires Admin Proof Review' : 'Instant Verification'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="p-5 pt-0">
                <button
                  onClick={() => setActiveModalQuest(quest)}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <span>Start Quest & Submit Proof</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quest Submission Modal */}
      {activeModalQuest && (
        <QuestSubmitModal
          quest={activeModalQuest}
          customerId={customerId}
          onClose={() => setActiveModalQuest(null)}
          onSuccess={() => {
            setActiveModalQuest(null);
            onSubmissionCreated();
          }}
        />
      )}
    </div>
  );
}
