import React, { useState, useEffect } from 'react';
import { Settings, User as UserIcon, Bot, Palette, Brain, Shield, Save, Check, Trash2, X, Download, Sparkles, Sun, Moon, Laptop, CheckCircle2, MessageSquare, Globe, Volume2, VolumeX, Zap, Activity, LogOut, Lock, Key, ChevronDown, Wand2, FileText } from 'lucide-react';
import { User, AIModelOption } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../lib/ThemeContext';
import { useChatSettings } from '../lib/ChatSettingsContext';
import { useLanguage } from '../lib/LanguageContext';
import { useExperienceSettings } from '../lib/ExperienceSettingsContext';
import { useAiEngineSettings } from '../lib/AiEngineSettingsContext';
import { PersonalizeSection } from './PersonalizeSection';
import { DocumentsView, DocTab } from './DocumentsView';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateProfile: (updates: Partial<User>) => Promise<void>;
  onChangePassword: (currentPass: string, newPass: string) => Promise<void>;
  onClearAllConversations: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onExportData: () => void;
  onLogout?: () => void;
  onViewTerms?: () => void;
  onOpenDocuments?: (doc?: DocTab) => void;
  availableModels?: AIModelOption[];
  serverGroqStatus?: { serverGroqConfigured: boolean; activeProvider: string };
  onUserUpdated?: (user: User) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateProfile,
  onChangePassword,
  onClearAllConversations,
  onDeleteAccount,
  onExportData,
  onLogout,
  onViewTerms,
  onOpenDocuments,
  availableModels = [],
  serverGroqStatus,
  onUserUpdated,
}) => {
  const { themeSetting, setThemeSetting, theme, themeVariant, setTheme, setThemeVariant, isDark, reduceMotion, setReduceMotion } = useTheme();
  const {
    enterToSend,
    setEnterToSend,
    streamingResponses,
    setStreamingResponses,
    autoScroll,
    setAutoScroll,
    showTimestamps,
    setShowTimestamps,
    saveChatHistory,
    setSaveChatHistory,
    temporaryChat,
    setTemporaryChat,
  } = useChatSettings();
  const {
    interfaceLanguage,
    setInterfaceLanguage,
    responseLanguage,
    setResponseLanguage,
    t,
  } = useLanguage();
  const {
    responseAnimation,
    setResponseAnimation,
    generationEffects,
    setGenerationEffects,
    soundEffects,
    setSoundEffects,
    playUiSound,
  } = useExperienceSettings();
  const {
    engine,
    setEngine,
    intelligence,
    setIntelligence,
    context,
    setContext,
    responseLength,
    setResponseLength,
  } = useAiEngineSettings();
  const [openDropdown, setOpenDropdown] = useState<'engine' | 'intelligence' | 'context' | 'responseLength' | null>(null);
  const [activeTab, setActiveTab] = useState<'account' | 'personalize' | 'ai_engine' | 'appearance' | 'chat' | 'language' | 'experience' | 'privacy' | 'documents'>('account');

  // Account tab state
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passMessage, setPassMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // AI tab state
  const [selectedModel, setSelectedModel] = useState(user.preferredModel || 'aestific-core');
  const [systemPrompt, setSystemPrompt] = useState(user.systemPrompt || 'You are Aestific, an advanced, highly capable, and thoughtful AI assistant.');

  // Memory tab state
  const [memoryEnabled, setMemoryEnabled] = useState(user.memoryEnabled);

  // Confirmation modals
  const [confirmClearChats, setConfirmClearChats] = useState(false);
  const [confirmDeleteAcc, setConfirmDeleteAcc] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (user.languagePreference) {
      if (user.languagePreference === 'English' || user.languagePreference === 'বাংলা' || user.languagePreference === 'Auto') {
        setResponseLanguage(user.languagePreference as any);
      }
    }
  }, [user.languagePreference, setResponseLanguage]);

  if (!isOpen) return null;

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await onUpdateProfile({
        name,
        preferredModel: selectedModel,
        systemPrompt,
        memoryEnabled,
        languagePreference: responseLanguage,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    try {
      await onChangePassword(currentPassword, newPassword);
      setPassMessage({ text: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPassMessage({ text: err.message || 'Password update failed', error: true });
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          className="w-full max-w-2xl bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-white border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[88vh] relative"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-white/10 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50 relative z-10 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-900 dark:text-white shadow-sm shrink-0">
                <Settings className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white truncate">{t('settingsTitle')}</h3>
                <p className="text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-400 truncate">{t('settingsSubtitle')}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors shrink-0"
              title="Close Settings"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body: Tabs + Content */}
          <div className="flex-1 flex flex-col sm:flex-row overflow-hidden min-h-0">
            {/* Sidebar Tabs */}
            <div className="sm:w-48 border-b sm:border-b-0 sm:border-r border-zinc-200 dark:border-white/10 p-2 sm:p-3 flex sm:flex-col gap-1 overflow-x-auto no-scrollbar shrink-0 bg-zinc-50 dark:bg-black">
              {[
                { id: 'account', label: t('tabAccount'), icon: UserIcon },
                { id: 'personalize', label: 'Personalize Aestific', icon: Wand2 },
                { id: 'ai_engine', label: t('tabAi') || 'AI Engine', icon: Brain },
                { id: 'appearance', label: t('tabAppearance'), icon: Palette },
                { id: 'chat', label: t('tabChat'), icon: MessageSquare },
                { id: 'language', label: t('tabLanguage'), icon: Globe },
                { id: 'experience', label: t('tabExperience'), icon: Sparkles },
                { id: 'privacy', label: t('tabPrivacy'), icon: Shield },
                { id: 'documents', label: t('tabDocuments') || 'Documents', icon: FileText },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === tab.id
                        ? 'bg-zinc-200 text-black dark:bg-white dark:text-black font-semibold'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content Panels */}
            <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-6">
              {/* ACCOUNT TAB (TOP TAB) */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">
                      Account &amp; Security
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Manage your profile display name and password credentials. Email address cannot be changed.
                    </p>
                  </div>

                  {/* ID & Profile Details */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-4">
                    <div className="flex items-center gap-3 pb-3 border-b border-zinc-200 dark:border-white/10">
                      <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-white/10 flex items-center justify-center text-zinc-800 dark:text-zinc-100 font-semibold text-sm">
                        {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white truncate">{user.name || 'User'}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate">{user.email}</div>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        Active ID
                      </span>
                    </div>

                    <div className="space-y-3.5">
                      {/* Name input */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            Full Name / Display Name
                          </label>
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Editable</span>
                        </div>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Enter your name"
                          className="w-full bg-white dark:bg-black/60 border border-zinc-300 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-colors"
                        />
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                          This name is displayed in chat conversations and profile interactions.
                        </p>
                      </div>

                      {/* Email input (Non-editable / Permanent) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                            <span>Email Address</span>
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 font-normal">
                              <Lock className="w-2.5 h-2.5" /> Cannot be changed
                            </span>
                          </label>
                        </div>
                        <div className="relative">
                          <input
                            type="email"
                            value={user.email}
                            disabled
                            readOnly
                            className="w-full bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-500 dark:text-zinc-400 cursor-not-allowed select-none font-mono"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
                            <Lock className="w-3.5 h-3.5" />
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                          Email address is permanently bound to this user account for security and cannot be changed.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Change Password Card */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-4">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-900 dark:text-white">Change Account Password</h4>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">Update your account login password</p>
                      </div>
                    </div>

                    <form onSubmit={handlePasswordSubmit} className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
                          Current Password
                        </label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-white dark:bg-black/60 border border-zinc-300 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          className="w-full bg-white dark:bg-black/60 border border-zinc-300 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-colors"
                        />
                      </div>

                      {passMessage && (
                        <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                          passMessage.error
                            ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-current" />
                          <span>{passMessage.text}</span>
                        </div>
                      )}

                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Keep your password confidential</span>
                        <button
                          type="submit"
                          disabled={!currentPassword || !newPassword}
                          className="px-4 py-2 rounded-xl bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200 text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer shadow-sm"
                        >
                          Update Password
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* PERSONALIZE AESTIFIC TAB */}
              {activeTab === 'personalize' && (
                <PersonalizeSection
                  user={user}
                  onUpdateProfile={onUpdateProfile}
                  onUserUpdated={onUserUpdated}
                />
              )}

              {/* AI ENGINE TAB */}
              {activeTab === 'ai_engine' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">
                      {t('aiEngineTitle')}
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t('aiEngineSubtitle')}
                    </p>
                  </div>

                  {/* 1. Engine */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{t('engineTitle')}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white">
                            {engine === 'auto' ? t('engineAuto') : engine === 'fast' ? t('engineFast') : t('engineDeep')}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {t('engineDesc')}
                        </p>
                      </div>
                    </div>

                    {/* Dropdown Control */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'engine' ? null : 'engine')}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium bg-white dark:bg-black/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white hover:border-zinc-300 dark:hover:border-white/20 transition-all cursor-pointer shadow-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {engine === 'auto' ? t('engineAuto') : engine === 'fast' ? t('engineFast') : t('engineDeep')}
                          </span>
                          {engine === 'auto' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400">
                              Default
                            </span>
                          )}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openDropdown === 'engine' ? 'rotate-180' : ''}`} />
                      </button>

                      {openDropdown === 'engine' && (
                        <div className="mt-2 space-y-1 p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-lg">
                          {[
                            { id: 'auto' as const, label: t('engineAuto'), desc: t('engineAutoDesc'), isDefault: true },
                            { id: 'fast' as const, label: t('engineFast'), desc: t('engineFastDesc') },
                            { id: 'deep' as const, label: t('engineDeep'), desc: t('engineDeepDesc') },
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setEngine(item.id);
                                setOpenDropdown(null);
                              }}
                              className={`w-full flex items-start justify-between p-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                                engine === item.id
                                  ? 'bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white'
                                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold">{item.label}</span>
                                  {item.isDefault && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{item.desc}</p>
                              </div>
                              {engine === item.id && <Check className="w-4 h-4 text-zinc-900 dark:text-white shrink-0 mt-0.5" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Intelligence */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{t('intelligenceTitle')}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white">
                            {intelligence === 'balanced' ? t('intelBalanced') : intelligence === 'precise' ? t('intelPrecise') : t('intelCreative')}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {t('intelligenceDesc')}
                        </p>
                      </div>
                    </div>

                    {/* Dropdown Control */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'intelligence' ? null : 'intelligence')}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium bg-white dark:bg-black/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white hover:border-zinc-300 dark:hover:border-white/20 transition-all cursor-pointer shadow-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {intelligence === 'balanced' ? t('intelBalanced') : intelligence === 'precise' ? t('intelPrecise') : t('intelCreative')}
                          </span>
                          {intelligence === 'balanced' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400">
                              Default
                            </span>
                          )}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openDropdown === 'intelligence' ? 'rotate-180' : ''}`} />
                      </button>

                      {openDropdown === 'intelligence' && (
                        <div className="mt-2 space-y-1 p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-lg">
                          {[
                            { id: 'balanced' as const, label: t('intelBalanced'), desc: t('intelBalancedDesc'), isDefault: true },
                            { id: 'precise' as const, label: t('intelPrecise'), desc: t('intelPreciseDesc') },
                            { id: 'creative' as const, label: t('intelCreative'), desc: t('intelCreativeDesc') },
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setIntelligence(item.id);
                                setOpenDropdown(null);
                              }}
                              className={`w-full flex items-start justify-between p-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                                intelligence === item.id
                                  ? 'bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white'
                                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold">{item.label}</span>
                                  {item.isDefault && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{item.desc}</p>
                              </div>
                              {intelligence === item.id && <Check className="w-4 h-4 text-zinc-900 dark:text-white shrink-0 mt-0.5" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Context */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{t('contextTitle')}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white">
                            {context === 'on' ? t('contextOn') : t('contextOff')}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {t('contextDesc')}
                        </p>
                      </div>
                    </div>

                    {/* Segmented / Toggle Control matching [ On ] style */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setContext('on')}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          context === 'on'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-white dark:bg-black/50 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <Check className={`w-3.5 h-3.5 ${context === 'on' ? 'opacity-100' : 'opacity-0'}`} />
                        <span>{t('contextOn')} (Default)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setContext('off')}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          context === 'off'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-white dark:bg-black/50 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <Check className={`w-3.5 h-3.5 ${context === 'off' ? 'opacity-100' : 'opacity-0'}`} />
                        <span>{t('contextOff')}</span>
                      </button>
                    </div>
                  </div>

                  {/* 4. Response Length */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{t('responseLengthTitle')}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white">
                            {responseLength === 'auto' ? t('respLenAuto') : responseLength === 'short' ? t('respLenShort') : responseLength === 'medium' ? t('respLenMedium') : t('respLenDetailed')}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {t('responseLengthDesc')}
                        </p>
                      </div>
                    </div>

                    {/* Dropdown Control */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'responseLength' ? null : 'responseLength')}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium bg-white dark:bg-black/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white hover:border-zinc-300 dark:hover:border-white/20 transition-all cursor-pointer shadow-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {responseLength === 'auto' ? t('respLenAuto') : responseLength === 'short' ? t('respLenShort') : responseLength === 'medium' ? t('respLenMedium') : t('respLenDetailed')}
                          </span>
                          {responseLength === 'auto' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400">
                              Default
                            </span>
                          )}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openDropdown === 'responseLength' ? 'rotate-180' : ''}`} />
                      </button>

                      {openDropdown === 'responseLength' && (
                        <div className="mt-2 space-y-1 p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-lg">
                          {[
                            { id: 'auto' as const, label: t('respLenAuto'), desc: t('respLenAutoDesc'), isDefault: true },
                            { id: 'short' as const, label: t('respLenShort'), desc: t('respLenShortDesc') },
                            { id: 'medium' as const, label: t('respLenMedium'), desc: t('respLenMediumDesc') },
                            { id: 'detailed' as const, label: t('respLenDetailed'), desc: t('respLenDetailedDesc') },
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setResponseLength(item.id);
                                setOpenDropdown(null);
                              }}
                              className={`w-full flex items-start justify-between p-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                                responseLength === item.id
                                  ? 'bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white'
                                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold">{item.label}</span>
                                  {item.isDefault && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{item.desc}</p>
                              </div>
                              {responseLength === item.id && <Check className="w-4 h-4 text-zinc-900 dark:text-white shrink-0 mt-0.5" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* APPEARANCE TAB */}
              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">Visual Theme &amp; Appearance</h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Customize interface theme and motion preferences.
                    </p>
                  </div>

                  {/* 1. THEME: System | Light | Dark */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>Theme</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white">
                            {themeSetting === 'system'
                              ? `System (${isDark ? 'Dark' : 'Light'})`
                              : themeSetting === 'light'
                              ? 'Light'
                              : 'Dark'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {themeSetting === 'system'
                            ? 'Follows device and browser appearance preference automatically'
                            : themeSetting === 'light'
                            ? 'Crisp, high-contrast light background'
                            : 'Pure deep black canvas with high contrast typography'}
                        </p>
                      </div>
                    </div>

                    {/* Segmented Theme Buttons */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setThemeSetting('system')}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          themeSetting === 'system'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <Laptop className="w-3.5 h-3.5" />
                        <span>System</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setThemeSetting('light')}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          themeSetting === 'light'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        <span>Light</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setThemeSetting('dark')}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          themeSetting === 'dark'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>Dark</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. REDUCE MOTION: On | Off */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>Reduce Motion</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            reduceMotion
                              ? 'bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'
                          }`}>
                            {reduceMotion ? 'On' : 'Off'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          Minimize non-essential animations and page motion effects. Important loading, streaming, and generation status indicators remain fully active.
                        </p>
                      </div>
                    </div>

                    {/* Segmented Motion Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setReduceMotion(true)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          reduceMotion
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>On</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReduceMotion(false)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          !reduceMotion
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>Off</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAT CONTROLS TAB */}
              {activeTab === 'chat' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">{t('chatTabTitle')}</h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t('chatTabSubtitle')}
                    </p>
                  </div>

                  {/* 1. Enter to Send */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{t('enterToSendTitle')}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            enterToSend
                              ? 'bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'
                          }`}>
                            {enterToSend ? t('on') : t('off')}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {enterToSend
                            ? t('enterToSendOnDesc')
                            : t('enterToSendOffDesc')}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEnterToSend(true)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          enterToSend
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>{t('on')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEnterToSend(false)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          !enterToSend
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>{t('off')}</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Streaming Responses */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{t('streamingTitle')}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            streamingResponses
                              ? 'bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'
                          }`}>
                            {streamingResponses ? t('on') : t('off')}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {streamingResponses
                            ? t('streamingOnDesc')
                            : t('streamingOffDesc')}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setStreamingResponses(true)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          streamingResponses
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>{t('on')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStreamingResponses(false)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          !streamingResponses
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>{t('off')}</span>
                      </button>
                    </div>
                  </div>

                  {/* 3. Auto-scroll */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{t('autoScrollTitle')}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            autoScroll
                              ? 'bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'
                          }`}>
                            {autoScroll ? t('on') : t('off')}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {autoScroll
                            ? t('autoScrollOnDesc')
                            : t('autoScrollOffDesc')}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setAutoScroll(true)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          autoScroll
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>{t('on')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAutoScroll(false)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          !autoScroll
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>{t('off')}</span>
                      </button>
                    </div>
                  </div>

                  {/* 4. Show Timestamps */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{t('timestampsTitle')}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            showTimestamps
                              ? 'bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'
                          }`}>
                            {showTimestamps ? t('on') : t('off')}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {showTimestamps
                            ? t('timestampsOnDesc')
                            : t('timestampsOffDesc')}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowTimestamps(true)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          showTimestamps
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>{t('on')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowTimestamps(false)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          !showTimestamps
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-black/50 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span>{t('off')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* EXPERIENCE TAB */}
              {activeTab === 'experience' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {t('experienceTitle')}
                      </h4>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t('experienceSubtitle')}
                    </p>
                  </div>

                  {/* 1. Response Animation */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                          <span>{t('responseAnimation')}</span>
                        </label>
                        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-200/80 dark:bg-white/10 text-zinc-700 dark:text-zinc-300">
                          {responseAnimation === 'smooth' ? t('animSmooth') : t('animInstant')}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                        {t('responseAnimationDesc')}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setResponseAnimation('smooth')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          responseAnimation === 'smooth'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                            : 'bg-white dark:bg-black/50 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{t('animSmooth')}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            responseAnimation === 'smooth'
                              ? 'bg-white/20 text-white dark:bg-black/10 dark:text-black'
                              : 'bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400'
                          }`}>
                            Default
                          </span>
                        </div>
                        <p className={`text-[11px] leading-relaxed ${
                          responseAnimation === 'smooth'
                            ? 'text-zinc-300 dark:text-zinc-600'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {t('animSmoothDesc')}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setResponseAnimation('instant')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          responseAnimation === 'instant'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                            : 'bg-white dark:bg-black/50 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{t('animInstant')}</span>
                          <Zap className={`w-3.5 h-3.5 ${responseAnimation === 'instant' ? 'text-amber-300 dark:text-amber-500' : 'text-zinc-400'}`} />
                        </div>
                        <p className={`text-[11px] leading-relaxed ${
                          responseAnimation === 'instant'
                            ? 'text-zinc-300 dark:text-zinc-600'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {t('animInstantDesc')}
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* 2. Generation Effects */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                          <span>{t('generationEffects')}</span>
                        </label>
                        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-200/80 dark:bg-white/10 text-zinc-700 dark:text-zinc-300">
                          {generationEffects === 'full' ? t('genEffectsFull') : generationEffects === 'minimal' ? t('genEffectsMinimal') : t('genEffectsOff')}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                        {t('generationEffectsDesc')}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setGenerationEffects('full')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          generationEffects === 'full'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                            : 'bg-white dark:bg-black/50 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{t('genEffectsFull')}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            generationEffects === 'full'
                              ? 'bg-white/20 text-white dark:bg-black/10 dark:text-black'
                              : 'bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400'
                          }`}>
                            Default
                          </span>
                        </div>
                        <p className={`text-[11px] leading-relaxed ${
                          generationEffects === 'full'
                            ? 'text-zinc-300 dark:text-zinc-600'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {t('genEffectsFullDesc')}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGenerationEffects('minimal')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          generationEffects === 'minimal'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                            : 'bg-white dark:bg-black/50 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{t('genEffectsMinimal')}</span>
                        </div>
                        <p className={`text-[11px] leading-relaxed ${
                          generationEffects === 'minimal'
                            ? 'text-zinc-300 dark:text-zinc-600'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {t('genEffectsMinimalDesc')}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGenerationEffects('off')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          generationEffects === 'off'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                            : 'bg-white dark:bg-black/50 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{t('genEffectsOff')}</span>
                        </div>
                        <p className={`text-[11px] leading-relaxed ${
                          generationEffects === 'off'
                            ? 'text-zinc-300 dark:text-zinc-600'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {t('genEffectsOffDesc')}
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* 3. Sound Effects */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          {soundEffects === 'on' ? (
                            <Volume2 className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                          ) : (
                            <VolumeX className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                          )}
                          <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {t('soundEffects')}
                          </label>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                          {t('soundEffectsDesc')}
                        </p>
                      </div>

                      {soundEffects === 'on' && (
                        <button
                          type="button"
                          onClick={() => playUiSound('test')}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white bg-zinc-200/80 dark:bg-white/10 hover:bg-zinc-300 dark:hover:bg-white/20 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer shadow-xs"
                          title="Preview sound cue"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>{t('testSound')}</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setSoundEffects('off')}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          soundEffects === 'off'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-white dark:bg-black/50 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>{t('soundOff')} (Default)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSoundEffects('on');
                          playUiSound('test');
                        }}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          soundEffects === 'on'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-white dark:bg-black/50 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{t('soundOn')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'language' && (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Globe className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {t('langTabTitle')}
                      </h4>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t('langTabSubtitle')}
                    </p>
                  </div>

                  {/* 1. Interface Language */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center justify-between">
                        <span>{t('interfaceLanguageTitle')}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white">
                          {interfaceLanguage === 'bn' ? 'বাংলা' : 'English'}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                        {t('interfaceLanguageDesc')}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setInterfaceLanguage('en')}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          interfaceLanguage === 'en'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-700 dark:bg-black/50 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span className="font-semibold">English</span>
                        {interfaceLanguage === 'en' && <Check className="w-4 h-4 text-white dark:text-black shrink-0" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setInterfaceLanguage('bn')}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                          interfaceLanguage === 'bn'
                            ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm font-semibold'
                            : 'bg-zinc-100 text-zinc-700 dark:bg-black/50 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                        }`}
                      >
                        <span className="font-semibold">বাংলা</span>
                        {interfaceLanguage === 'bn' && <Check className="w-4 h-4 text-white dark:text-black shrink-0" />}
                      </button>
                    </div>
                  </div>

                  {/* 2. Response Language */}
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center justify-between">
                        <span>{t('responseLanguageTitle')}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white">
                          {responseLanguage === 'Auto' ? t('responseAuto') : responseLanguage === 'বাংলা' ? 'বাংলা' : 'English'}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                        {t('responseLanguageDesc')}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      {[
                        { id: 'Auto' as const, label: t('responseAuto'), desc: t('responseAutoDesc') },
                        { id: 'English' as const, label: 'English', desc: t('responseEnglishDesc') },
                        { id: 'বাংলা' as const, label: 'বাংলা', desc: t('responseBanglaDesc') },
                      ].map((item) => {
                        const isSelected = responseLanguage === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setResponseLanguage(item.id)}
                            className={`flex flex-col text-left p-3 rounded-xl transition-all border cursor-pointer ${
                              isSelected
                                ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-sm'
                                : 'bg-zinc-100 text-zinc-800 dark:bg-black/50 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold">{item.label}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-white dark:text-black shrink-0" />}
                            </div>
                            <span className={`text-[10px] leading-snug line-clamp-2 ${
                              isSelected ? 'text-zinc-300 dark:text-zinc-700' : 'text-zinc-500 dark:text-zinc-400'
                            }`}>
                              {item.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* PRIVACY & DATA TAB */}
              {activeTab === 'privacy' && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">Privacy &amp; Account Controls</h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4">Manage conversation history persistence, temporary sessions, and personal data governance.</p>

                    <div className="space-y-3">
                      {/* 1. Save Chat History */}
                      <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                            <span>Save Chat History</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${saveChatHistory ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400'}`}>
                              {saveChatHistory ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                            Persist new conversations to your account and local vault. When turned off, new chats are not saved. Existing history is preserved.
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={saveChatHistory}
                            onChange={(e) => setSaveChatHistory(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black dark:peer-checked:bg-white" />
                        </label>
                      </div>

                      {/* 2. Temporary Chat */}
                      <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                            <span>Temporary Chat</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${temporaryChat ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400'}`}>
                              {temporaryChat ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                            Turn on temporary chat mode. New conversations will not be saved to history or stored in the database.
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={temporaryChat}
                            onChange={(e) => setTemporaryChat(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black dark:peer-checked:bg-white" />
                        </label>
                      </div>

                      {/* 3. Download My Data */}
                      <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-white">Download My Data</div>
                          <div className="text-[11px] text-zinc-600 dark:text-zinc-400">Export a complete, secure JSON archive of your personal conversations, messages, and memories</div>
                        </div>
                        <button
                          type="button"
                          onClick={onExportData}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:text-white dark:hover:bg-zinc-700 text-xs font-medium transition-colors cursor-pointer shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download My Data
                        </button>
                      </div>

                      {/* 4. Log Out */}
                      <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-white">Log Out</div>
                          <div className="text-[11px] text-zinc-600 dark:text-zinc-400">Safely terminate your current authenticated session on this device</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmLogout(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:text-white dark:hover:bg-zinc-700 text-xs font-medium transition-colors cursor-pointer shrink-0"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Log Out
                        </button>
                      </div>

                      {/* 5. Delete Account */}
                      <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-500/30 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold text-rose-700 dark:text-rose-200">Delete Account</div>
                          <div className="text-[11px] text-rose-600 dark:text-rose-300">Permanently delete your account, conversations, and all associated personal data</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAcc(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Account
                        </button>
                      </div>

                      {/* Clear Chats */}
                      <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-white">Clear All Chat History</div>
                          <div className="text-[11px] text-zinc-600 dark:text-zinc-400">Permanently delete all existing messages and conversations</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmClearChats(true)}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium hover:bg-rose-500/20 transition-colors cursor-pointer shrink-0"
                        >
                          Clear Chats
                        </button>
                      </div>

                      {/* Terms & Conditions */}
                      {onViewTerms && (
                        <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-between gap-4">
                          <div>
                            <div className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                              <span>Aestific Terms &amp; Conditions</span>
                            </div>
                            <div className="text-[11px] text-zinc-600 dark:text-zinc-400">Read official terms of service, AI disclaimers, and user policies</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onViewTerms();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 border border-zinc-300 dark:border-white/10 text-xs font-medium transition-colors cursor-pointer shrink-0"
                          >
                            View Terms
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {confirmLogout && (
                    <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-white/10 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Are you sure you want to log out of your account?</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setConfirmLogout(false)} className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer">Cancel</button>
                        <button
                          type="button"
                          onClick={async () => {
                            setConfirmLogout(false);
                            onClose();
                            if (onLogout) await onLogout();
                          }}
                          className="px-3 py-1 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-medium cursor-pointer"
                        >
                          Confirm Log Out
                        </button>
                      </div>
                    </div>
                  )}

                  {confirmClearChats && (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-rose-800 dark:text-rose-200">Are you sure? This cannot be undone.</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setConfirmClearChats(false)} className="text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">Cancel</button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onClearAllConversations();
                            setConfirmClearChats(false);
                          }}
                          className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-medium cursor-pointer"
                        >
                          Confirm Clear
                        </button>
                      </div>
                    </div>
                  )}

                  {confirmDeleteAcc && (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-rose-800 dark:text-rose-200">Permanently delete your account? All chats and data will be wiped.</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setConfirmDeleteAcc(false)} className="text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">Cancel</button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteAccount();
                            setConfirmDeleteAcc(false);
                            onClose();
                          }}
                          className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-medium cursor-pointer"
                        >
                          Confirm Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* DOCUMENTS TAB (BOTTOM TAB) */}
              {activeTab === 'documents' && (
                <DocumentsView
                  onOpenFullScreen={(doc) => {
                    onClose();
                    if (onOpenDocuments) {
                      onOpenDocuments(doc);
                    } else if (onViewTerms) {
                      onViewTerms();
                    }
                  }}
                />
              )}
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="p-3.5 sm:p-4 border-t border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{saveSuccess ? t('saved') : ''}</span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={onClose}
                className="px-3.5 sm:px-4 py-2 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
              >
                {t('close')}
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 rounded-xl bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? t('saving') : t('saveChanges')}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
