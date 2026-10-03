import React, { useState } from 'react';
import { Brain, Trash2, Plus, Search, Sparkles, Check, ToggleLeft, ToggleRight, ArrowLeft } from 'lucide-react';
import { Memory } from '../types';
import { motion } from 'motion/react';
import { useLanguage } from '../lib/LanguageContext';

interface MemoriesPageProps {
  memories: Memory[];
  memoryEnabled: boolean;
  onToggleMemory: (enabled: boolean) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onClearMemories: () => Promise<void>;
  onCreateMemory: (content: string, category: Memory['category']) => Promise<void>;
  onBackToChat: () => void;
}

export const MemoriesPage: React.FC<MemoriesPageProps> = ({
  memories,
  memoryEnabled,
  onToggleMemory,
  onDeleteMemory,
  onClearMemories,
  onCreateMemory,
  onBackToChat,
}) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<Memory['category']>('preference');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filteredMemories = memories.filter((m) => {
    const matchesSearch = m.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.sourceConversationTitle && m.sourceConversationTitle.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCat = selectedCategory === 'all' || m.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    await onCreateMemory(newContent.trim(), newCategory);
    setNewContent('');
    setIsAdding(false);
  };

  const getCategoryBadge = (cat: Memory['category']) => {
    switch (cat) {
      case 'preference':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-pink-500/10 text-pink-700 dark:text-pink-300 border border-pink-500/20">Preference</span>;
      case 'personal':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">Personal</span>;
      case 'project':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyan-500/10 text-cyan-800 dark:text-cyan-300 border border-cyan-500/20">Project</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700">General</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 overflow-y-auto z-10 relative transition-colors">
      {/* Top Header */}
      <div className="p-4 sm:p-8 border-b border-zinc-200 dark:border-white/10 bg-zinc-50/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl shrink-0">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={onBackToChat}
            className="flex items-center gap-2 text-xs text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white mb-4 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToChat')}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-900 dark:text-white shrink-0">
                  <Brain className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight truncate">Account Intelligence Memory</h1>
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
                    Aestific AI remembers key preferences across conversations for your private account.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
              <button
                onClick={() => onToggleMemory(!memoryEnabled)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  memoryEnabled
                    ? 'bg-zinc-100 dark:bg-white/10 border-zinc-300 dark:border-white/20 text-zinc-900 dark:text-white'
                    : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {memoryEnabled ? <ToggleRight className="w-5 h-5 text-black dark:text-white" /> : <ToggleLeft className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />}
                <span>Memory {memoryEnabled ? 'Active' : 'Paused'}</span>
              </button>

              <button
                onClick={() => setIsAdding(!isAdding)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 text-xs font-semibold shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Memory
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto w-full p-4 sm:p-8 flex-1 flex flex-col gap-6">
        {/* Info Card */}
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#0a0a0a] border border-zinc-200 dark:border-white/10 flex items-start gap-3.5">
          <Sparkles className="w-5 h-5 text-zinc-600 dark:text-zinc-400 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <span className="font-semibold text-zinc-900 dark:text-white">Private & Isolated: </span>
            Memories are strictly tied to your authenticated account and are never shared with other users.
            During chat inference, Aestific AI automatically references these memories to tailor explanations, code styles, and language preferences.
          </div>
        </div>

        {/* Add Memory Form */}
        {isAdding && (
          <motion.form
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleAddSubmit}
            className="p-5 rounded-2xl bg-zinc-50 dark:bg-[#0e0e16] border border-zinc-300 dark:border-white/10 shadow-xl flex flex-col gap-4"
          >
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Add Custom Account Memory</h3>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="e.g. I prefer code snippets in TypeScript with strict typing, or I am a senior engineer building cloud apps..."
              className="w-full h-24 bg-white dark:bg-black/50 border border-zinc-300 dark:border-white/10 rounded-xl p-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-colors resize-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">Category:</span>
                {(['preference', 'personal', 'project', 'general'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg capitalize transition-colors cursor-pointer ${
                      newCategory === cat
                        ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                        : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3.5 py-1.5 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newContent.trim()}
                  className="px-4 py-1.5 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-all cursor-pointer"
                >
                  Save Memory
                </button>
              </div>
            </div>
          </motion.form>
        )}

        {/* Filter / Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-zinc-600 dark:text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search memories..."
              className="w-full bg-zinc-100 dark:bg-[#0d0d14] border border-zinc-200 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 transition-colors"
            />
          </div>

          <div className="flex items-center justify-between w-full sm:w-auto gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['all', 'preference', 'personal', 'project', 'general'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs capitalize transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {memories.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors whitespace-nowrap ml-auto cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Clear Confirmation Modal */}
        {showClearConfirm && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 flex items-center justify-between gap-3">
            <span className="text-xs text-rose-800 dark:text-rose-200 font-medium">Are you sure you want to delete all saved account memories?</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onClearMemories();
                  setShowClearConfirm(false);
                }}
                className="px-3.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors cursor-pointer"
              >
                Confirm Delete All
              </button>
            </div>
          </div>
        )}

        {/* Memories Grid / List */}
        {filteredMemories.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-zinc-50 dark:bg-[#09090f] border border-zinc-200 dark:border-white/10">
            <Brain className="w-12 h-12 text-zinc-500 dark:text-zinc-400 mb-3" />
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">No memories found</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mt-1">
              As you converse with Aestific, key preferences and project facts will automatically be stored here, or you can add custom items manually.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMemories.map((mem) => (
              <motion.div
                key={mem.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-xl bg-zinc-50 dark:bg-[#0c0c14] border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 transition-all flex flex-col justify-between group relative overflow-hidden shadow-sm"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  {getCategoryBadge(mem.category)}
                  <button
                    onClick={() => onDeleteMemory(mem.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded transition-all cursor-pointer"
                    title="Delete Memory"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed font-normal flex-1">
                  {mem.content}
                </p>

                <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-white/10 flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400">
                  <span>
                    {mem.sourceConversationTitle ? `From: ${mem.sourceConversationTitle}` : 'Manually Added'}
                  </span>
                  <span>{new Date(mem.createdAt).toLocaleDateString()}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
