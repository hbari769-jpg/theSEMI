import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Plus,
  Search,
  Settings,
  X,
  MoreVertical,
  Pin,
  PinOff,
  Trash2,
  Edit2,
  Check,
  Brain,
  FolderOpen,
  ImageIcon,
  LifeBuoy,
  Archive,
  LogOut,
  FileText,
} from 'lucide-react';
import { Conversation, User, ActiveView } from '../types';
import { AestificLogo } from './AestificLogo';
import { authFetch, setAuthToken } from '../lib/api';
import { useLanguage } from '../lib/LanguageContext';

interface SidebarProps {
  user: User;
  conversations: Conversation[];
  activeConversationId: string | null;
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onPinConversation?: (id: string, isPinned: boolean) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
  onDeleteConversation?: (id: string) => void;
  onArchiveConversation?: (id: string) => void;
  onOpenSettings?: () => void;
  onOpenImageStudio?: () => void;
  isImageStudioOpen?: boolean;
  onLogout?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

/**
 * Platform-aware keyboard shortcut detection.
 * macOS: ⌘ K
 * Windows/Linux: Ctrl K
 */
export const getPlatformNewChatShortcut = (): string => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Ctrl K';
  }
  const nav = navigator as any;
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
  const isMac = /Mac|iPod|iPhone|iPad/i.test(platform);
  return isMac ? '⌘ K' : 'Ctrl K';
};

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  conversations,
  activeConversationId,
  activeView,
  onSelectView,
  onSelectConversation,
  onNewChat,
  onPinConversation,
  onRenameConversation,
  onDeleteConversation,
  onArchiveConversation,
  onOpenSettings,
  onOpenImageStudio,
  isImageStudioOpen = false,
  onLogout,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [shortcutLabel, setShortcutLabel] = useState<string>(() => getPlatformNewChatShortcut());
  const { t } = useLanguage();

  // Detect platform on mount to ensure accurate shortcut display (macOS: ⌘ K, Windows/Linux: Ctrl K)
  useEffect(() => {
    setShortcutLabel(getPlatformNewChatShortcut());
  }, []);

  // Mobile Long-Press (3 seconds) to trigger discreet admin access on "© 2026 aestific • All rights reserved"
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const startLongPress = (clientX: number, clientY: number) => {
    touchStartPosRef.current = { x: clientX, y: clientY };
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(async () => {
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(50);
        }
        const res = await authFetch('/api/admin/check-access');
        if (res.ok) {
          const data = await res.json();
          if (data.authorized) {
            onSelectView('secret_verify');
            if (onCloseMobile) onCloseMobile();
          }
        }
      } catch {
        // Intentionally silent
      }
    }, 3000);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !e.touches[0]) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
    if (dx > 12 || dy > 12) {
      cancelLongPress();
    }
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-conversation-menu]')) {
        setActiveMenuId(null);
      }
      if (!target.closest('[data-profile-card]') && !target.closest('[data-profile-menu]')) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Strict deduplication of conversations by ID
  const uniqueConversations = useMemo(() => {
    const seen = new Set<string>();
    return conversations.filter((c) => {
      if (!c || !c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [conversations]);

  // Filtered list based on search term
  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return uniqueConversations;
    const term = searchTerm.toLowerCase();
    return uniqueConversations.filter((c) => (c.title || '').toLowerCase().includes(term));
  }, [uniqueConversations, searchTerm]);

  // Group conversations chronologically & by pinned state
  const groupedConversations = useMemo(() => {
    const groups: { [key: string]: Conversation[] } = {
      Pinned: [],
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      'Previous 30 Days': [],
      Older: [],
    };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOf7Days = startOfToday - 86400000 * 7;
    const startOf30Days = startOfToday - 86400000 * 30;

    const seenInGroups = new Set<string>();

    for (const c of filteredConversations) {
      if (seenInGroups.has(c.id)) continue;
      seenInGroups.add(c.id);

      if (c.isPinned) {
        groups['Pinned'].push(c);
        continue;
      }
      const time = new Date(c.updatedAt || c.createdAt).getTime();
      if (time >= startOfToday) {
        groups['Today'].push(c);
      } else if (time >= startOfYesterday) {
        groups['Yesterday'].push(c);
      } else if (time >= startOf7Days) {
        groups['Previous 7 Days'].push(c);
      } else if (time >= startOf30Days) {
        groups['Previous 30 Days'].push(c);
      } else {
        groups['Older'].push(c);
      }
    }

    return groups;
  }, [filteredConversations]);

  const handleStartRename = (c: Conversation) => {
    setEditingId(c.id);
    setEditTitle(c.title);
    setActiveMenuId(null);
  };

  const handleSaveRename = async (id: string) => {
    if (editTitle.trim() && onRenameConversation) {
      await onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-[280px] sm:w-[270px] max-w-[85vw] h-full h-[100dvh] flex flex-col bg-white dark:bg-black border-r border-zinc-200 dark:border-white/10 select-none shrink-0 transition-transform duration-300 md:translate-x-0 overflow-hidden ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* 1. Brand Logo Header */}
        <div className="pt-4 pb-3 px-4 flex items-center justify-between shrink-0">
          <div
            className="cursor-pointer flex items-center"
            onClick={() => {
              onSelectView('chat');
              onNewChat();
            }}
          >
            <AestificLogo size="md" variant="horizontal" />
          </div>

          {isOpenMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white md:hidden transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 2. "+ New Chat" Button with Shortcut Indicator */}
        <div className="px-3 mb-2.5 shrink-0">
          <button
            onClick={() => {
              onSelectView('chat');
              onNewChat();
              if (onCloseMobile) onCloseMobile();
            }}
            title={`${t('newChat')} (${shortcutLabel})`}
            aria-label={`${t('newChat')} (${shortcutLabel})`}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-950 text-white hover:bg-black dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 font-medium text-xs transition-all cursor-pointer group shadow-xs active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 shrink-0 transition-transform duration-200 group-hover:rotate-90" />
              <span>{t('newChat')}</span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 dark:bg-zinc-200 dark:text-zinc-800 text-[10px] font-mono tracking-tight select-none">
              {shortcutLabel}
            </span>
          </button>
        </div>

        {/* 3. Primary Navigation Section - Exact 5 Items Preserved */}
        <div className="px-2.5 mb-2.5 space-y-0.5 shrink-0">
          <button
            onClick={() => {
              onSelectView('chat');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              activeView === 'chat'
                ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80 dark:bg-white/10 dark:text-white dark:border-white/10'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 border border-transparent'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>{t('chats')}</span>
          </button>

          <button
            onClick={() => {
              onSelectView('files');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              activeView === 'files'
                ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80 dark:bg-white/10 dark:text-white dark:border-white/10'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 border border-transparent'
            }`}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span>{t('knowledgeFiles')}</span>
          </button>

          <button
            onClick={() => {
              onSelectView('memories');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              activeView === 'memories'
                ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80 dark:bg-white/10 dark:text-white dark:border-white/10'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 border border-transparent'
            }`}
          >
            <Brain className="w-4 h-4 shrink-0" />
            <span>{t('accountMemory')}</span>
          </button>

          <button
            onClick={() => {
              if (onOpenImageStudio) onOpenImageStudio();
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              isImageStudioOpen
                ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80 dark:bg-white/10 dark:text-white dark:border-white/10'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 border border-transparent'
            }`}
          >
            <ImageIcon className="w-4 h-4 shrink-0" />
            <span>{t('pictureStudio')}</span>
          </button>

          <button
            onClick={() => {
              onSelectView('support');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              activeView === 'support'
                ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80 dark:bg-white/10 dark:text-white dark:border-white/10'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 border border-transparent'
            }`}
          >
            <LifeBuoy className="w-4 h-4 shrink-0" />
            <span>{t('support')}</span>
          </button>

          <button
            onClick={() => {
              onSelectView('documents');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              activeView === 'documents'
                ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80 dark:bg-white/10 dark:text-white dark:border-white/10'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 border border-transparent'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>{t('tabDocuments') || 'Documents'}</span>
          </button>
        </div>

        {/* 4. Conversation History Search Bar */}
        <div className="px-3 mb-2 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 pointer-events-none shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchConversations')}
              className="w-full bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-white/10 rounded-xl pl-8.5 pr-7 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 focus:bg-white dark:focus:bg-zinc-900 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 p-0.5 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 rounded transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 5. Chronological Conversation History List */}
        <div className="flex-1 overflow-y-auto px-2.5 space-y-3 custom-scrollbar">
          {conversations.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="w-5 h-5 text-zinc-400 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-xs text-zinc-800 dark:text-zinc-200 font-medium">{t('noConversations')}</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Start a new chat to begin reasoning</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No chats matching &quot;{searchTerm}&quot;
            </div>
          ) : (
            Object.entries(groupedConversations).map(([groupTitle, groupItems]) => {
              if (groupItems.length === 0) return null;
              const displayGroupTitle =
                groupTitle === 'Pinned'
                  ? t('pinned')
                  : groupTitle === 'Today'
                  ? t('today')
                  : groupTitle === 'Yesterday'
                  ? t('yesterday')
                  : groupTitle;
              return (
                <div key={groupTitle}>
                  <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-2 pt-1.5 pb-0.5 flex items-center gap-1.5">
                    {groupTitle === 'Pinned' && <Pin className="w-2.5 h-2.5 text-zinc-500 dark:text-zinc-400" />}
                    <span>{displayGroupTitle}</span>
                  </div>

                  <div className="space-y-0.5">
                    {groupItems.map((c) => {
                      const isActive = activeConversationId === c.id && activeView === 'chat';
                      const isEditing = editingId === c.id;
                      const isMenuOpen = activeMenuId === c.id;

                      return (
                        <div
                          key={c.id}
                          className="relative rounded-xl"
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-white/20 rounded-xl">
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRename(c.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                autoFocus
                                className="flex-1 bg-transparent text-xs text-zinc-900 dark:text-white focus:outline-none"
                              />
                              <button
                                onClick={() => handleSaveRename(c.id)}
                                className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white rounded"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 rounded"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                onSelectView('chat');
                                onSelectConversation(c.id);
                                if (onCloseMobile) onCloseMobile();
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                                isActive
                                  ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80 dark:bg-white/10 dark:text-white dark:border-white/15 shadow-xs'
                                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/5 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                                <MessageSquare
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive
                                      ? 'text-zinc-950 dark:text-white'
                                      : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'
                                  }`}
                                />
                                <span className="truncate text-xs leading-normal">{c.title || 'Untitled'}</span>
                              </div>

                              {/* Hover & Options Slot - Fixed Width to Prevent Jitter */}
                              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                                {c.isPinned && !isMenuOpen && (
                                  <Pin className="w-3 h-3 text-zinc-400 dark:text-zinc-500 group-hover:hidden" />
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(isMenuOpen ? null : c.id);
                                  }}
                                  className={`p-1 rounded-md text-zinc-400 hover:text-black dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/10 transition-opacity ${
                                    isMenuOpen ? 'opacity-100 bg-zinc-200/70 dark:bg-white/10' : 'opacity-70 sm:opacity-0 group-hover:opacity-100 focus:opacity-100'
                                  }`}
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Options Dropdown Menu */}
                          {isMenuOpen && (
                            <div
                              data-conversation-menu
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-2 top-full mt-1 z-50 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl p-1 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
                            >
                              {onPinConversation && (
                                <button
                                  onClick={() => {
                                    onPinConversation(c.id, !c.isPinned);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/8 transition-colors cursor-pointer"
                                >
                                  {c.isPinned ? (
                                    <>
                                      <PinOff className="w-3.5 h-3.5 shrink-0" />
                                      <span>Unpin</span>
                                    </>
                                  ) : (
                                    <>
                                      <Pin className="w-3.5 h-3.5 shrink-0" />
                                      <span>Pin</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {onRenameConversation && (
                                <button
                                  onClick={() => handleStartRename(c)}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/8 transition-colors cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Rename</span>
                                </button>
                              )}

                              {onArchiveConversation && (
                                <button
                                  onClick={() => {
                                    onArchiveConversation(c.id);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/8 transition-colors cursor-pointer"
                                >
                                  <Archive className="w-3.5 h-3.5 shrink-0" />
                                  <span>Archive</span>
                                </button>
                              )}

                              {onDeleteConversation && (
                                <button
                                  onClick={() => {
                                    onDeleteConversation(c.id);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Delete</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 6. User Profile Footer Card with Quick Settings & Logout */}
        <div className="p-2.5 border-t border-zinc-200 dark:border-white/10 bg-white dark:bg-black relative shrink-0">
          <div className="flex items-center justify-between p-1.5 rounded-xl border border-transparent hover:bg-zinc-100/80 dark:hover:bg-white/5 hover:border-zinc-200/60 dark:hover:border-white/10 transition-colors">
            <div
              data-profile-card
              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer pr-1"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <div className="w-7 h-7 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center text-xs font-semibold shrink-0 shadow-xs">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-900 dark:text-white truncate leading-tight">{user.name || 'User'}</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate leading-tight mt-0.5">{user.email || ''}</p>
              </div>
            </div>

            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-black hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              title={t('settings')}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* User Profile Popup Menu */}
          {showUserMenu && (
            <div
              data-profile-menu
              className="absolute bottom-14 left-2.5 right-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl p-1 shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
            >
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  if (onOpenSettings) onOpenSettings();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-700 hover:text-black hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/8 transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>{t('accountPreferences')}</span>
              </button>

              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onSelectView('documents');
                  if (onCloseMobile) onCloseMobile();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-700 hover:text-black hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/8 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>Documents &amp; Policies</span>
              </button>

              {onLogout && (
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('signOut')}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Discreet Sidebar Footer */}
        <div className="py-2.5 px-3 text-center border-t border-zinc-100 dark:border-white/5 bg-transparent shrink-0 select-none">
          <span
            id="discreet-admin-entry"
            data-testid="discreet-admin-entry"
            onTouchStart={(e) => {
              if (e.touches[0]) {
                startLongPress(e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
            onTouchEnd={cancelLongPress}
            onTouchCancel={cancelLongPress}
            onTouchMove={handleTouchMove}
            onMouseDown={(e) => {
              startLongPress(e.clientX, e.clientY);
            }}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onContextMenu={(e) => {
              // Prevent context menu popup on mobile long-press
              e.preventDefault();
            }}
            style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
            className="text-[10px] text-zinc-400 dark:text-zinc-600 cursor-default select-none transition-none focus:outline-none focus:ring-0 active:opacity-100"
          >
            © 2026 aestific • All rights reserved
          </span>
        </div>
      </aside>
    </>
  );
};

