import { useState, useEffect } from 'react';
import {
  Trophy,
  Search,
  Clock,
  ArrowRight,
  Flame,
  Zap,
  CheckCircle2,
  Sparkles,
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
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((data) => {
        if (data && data.data && Array.isArray(data.data)) {
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
    <div className="space-y-5 pb-8 animate-in fade-in duration-200">
      {/* Gamified Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Trophy className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-white">Available Campaigns & Quests</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Complete short quests, earn withdrawable KSh credits & unlock creator levels.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search active quests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
      </div>

      {/* Category Horizontal Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer min-h-[40px] ${
              selectedCategory === cat
                ? 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/20'
                : 'bg-zinc-900/90 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Quests Grid */}
      {loading ? (
        <div className="py-16 text-center text-zinc-400 font-medium text-xs">Loading available quests...</div>
      ) : filteredQuests.length === 0 ? (
        <div className="py-12 text-center bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8 space-y-2">
          <Trophy className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-zinc-400 text-xs font-medium">No active quests found in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuests.map((quest) => (
            <div
              key={quest.id}
              className="bg-zinc-900/90 border border-zinc-800/90 hover:border-amber-500/40 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between group transition-all duration-200"
            >
              <div>
                {/* Image Banner */}
                <div className="relative h-44 overflow-hidden bg-zinc-950">
                  <img
                    src={quest.image_url}
                    alt={quest.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />

                  {/* Reward Badge */}
                  <div className="absolute top-3 right-3 px-3 py-1 rounded-2xl bg-zinc-950/90 backdrop-blur-md border border-amber-500/40 text-amber-400 font-black text-xs shadow-lg flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 fill-amber-400" />
                    <span>+KSh {quest.credit_value_kes.toLocaleString()}</span>
                  </div>

                  {/* Difficulty & Category */}
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase">
                      {quest.category}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-xl bg-zinc-900/80 text-zinc-300 text-[10px] font-bold border border-zinc-700 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" /> {quest.difficulty}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 space-y-2">
                  <h3 className="font-extrabold text-white text-base group-hover:text-amber-400 transition-colors">
                    {quest.title}
                  </h3>
                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {quest.description}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-medium pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      ~{quest.est_minutes} mins
                    </span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">
                      {quest.requires_approval ? 'Manual Review' : 'Auto Verify'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action CTA */}
              <div className="p-5 pt-0">
                <button
                  onClick={() => setActiveModalQuest(quest)}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 min-h-[44px]"
                >
                  <span>Start Quest & Earn KSh {quest.credit_value_kes}</span>
                  <ArrowRight className="w-4 h-4" />
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
