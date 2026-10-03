import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { ToastProvider, useToast } from './components/Toast';
import { ThemeProvider, useTheme } from './lib/ThemeContext';
import { ChatSettingsProvider, useChatSettings } from './lib/ChatSettingsContext';
import { LanguageProvider, useLanguage } from './lib/LanguageContext';
import { ExperienceSettingsProvider, useExperienceSettings } from './lib/ExperienceSettingsContext';
import { AiEngineSettingsProvider, useAiEngineSettings } from './lib/AiEngineSettingsContext';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { VoiceRecorderModal } from './components/VoiceRecorderModal';
import { FilesPage } from './components/FilesPage';
import { MemoriesPage } from './components/MemoriesPage';
import { SettingsModal } from './components/SettingsModal';
import { ImageGenerationModal } from './components/ImageGenerationModal';
import { AuthModal } from './components/AuthModal';
import { CinematicLandingPage } from './components/CinematicLandingPage';
import { SplashScreen } from './components/SplashScreen';
import { InitialWhiteLoadingScreen } from './components/InitialWhiteLoadingScreen';
import { TermsBanner } from './components/TermsBanner';
import { TermsPage } from './components/TermsPage';
import { SecretVerifyPage } from './components/SecretVerifyPage';
import { SupportCenterPage } from './components/SupportCenterPage';
import { SpatialAtmosphere } from './components/SpatialAtmosphere';
import { AestificLogo } from './components/AestificLogo';
import { Ban } from 'lucide-react';
import { authFetch, setAuthToken, clearAuthToken } from './lib/api';
import {
  saveConversationLocal,
  saveConversationsBulkLocal,
  getConversationsLocal,
  saveMessageLocal,
  saveMessagesBulkLocal,
  deleteMessageLocal,
  getMessagesLocal,
  deleteConversationLocal,
  clearUserLocalVault,
  exportAllLocalData,
  importLocalVaultData,
  normalizeMessage,
} from './lib/localDb';
import {
  User,
  Conversation,
  Message,
  Attachment,
  Memory,
  FileRecord,
  DailyUsage,
  ActiveView,
  AIModelOption,
} from './types';

function MainApp() {
  const { showToast } = useToast();
  const { setUserId: setThemeUserId } = useTheme();
  const {
    streamingResponses,
    saveChatHistory,
    setSaveChatHistory,
    temporaryChat,
    setTemporaryChat,
    setUserId: setChatSettingsUserId,
  } = useChatSettings();
  const { setUserId: setLanguageUserId } = useLanguage();
  const { setUserId: setExperienceUserId } = useExperienceSettings();
  const {
    engine,
    intelligence,
    context,
    responseLength,
    setUserId: setAiEngineUserId,
  } = useAiEngineSettings();

  // Animated splash video: ONLY plays when signing in / registering and entering
  const [showSplash, setShowSplash] = useState(false);

  // Initial full-screen white loading screen upon entering the app
  const [showInitialWhiteLoading, setShowInitialWhiteLoading] = useState(true);
  const [minLoadingTimePassed, setMinLoadingTimePassed] = useState(false);

  // Terms & Conditions Consent State
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState<boolean>(true);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'login' | 'register'>('login');
  const [pendingLandingPrompt, setPendingLandingPrompt] = useState<string | null>(null);

  // App Navigation & Views
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageModalPrompt, setImageModalPrompt] = useState<string>('');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);

  // Core Data State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage | undefined>(undefined);
  const [serverStatus, setServerStatus] = useState<{ serverGroqConfigured: boolean; activeProvider: string; availableModels?: AIModelOption[] } | undefined>(undefined);
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([]);

  // Streaming Controller
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const skipNextLoadForConvIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync refs with state
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Load user session on startup
  useEffect(() => {
    checkAuthSession();
  }, []);

  // Ensure initial full-screen white splash with aestific logo displays smoothly without flicker
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinLoadingTimePassed(true);
    }, 950);
    return () => clearTimeout(timer);
  }, []);

  // Dismiss initial white loading screen once min duration passed and auth is resolved
  useEffect(() => {
    if (minLoadingTimePassed && !authLoading) {
      setShowInitialWhiteLoading(false);
    }
  }, [minLoadingTimePassed, authLoading]);

  // Sync terms acceptance, appearance settings, chat settings, language, and experience settings for current user
  useEffect(() => {
    if (user?.id) {
      setThemeUserId(user.id);
      setChatSettingsUserId(user.id);
      setLanguageUserId(user.id);
      setExperienceUserId(user.id);
      setAiEngineUserId(user.id);
      const accepted =
        localStorage.getItem(`aestific_terms_accepted_${user.id}`) === 'true';
      setHasAcceptedTerms(accepted);
    } else {
      setThemeUserId(null);
      setChatSettingsUserId(null);
      setLanguageUserId(null);
      setExperienceUserId(null);
      setAiEngineUserId(null);
    }
  }, [user, setThemeUserId, setChatSettingsUserId, setLanguageUserId, setExperienceUserId, setAiEngineUserId]);

  // When active conversation changes, load messages
  useEffect(() => {
    if (!activeConversationId || !user) {
      if (!isStreamingRef.current) {
        setMessages([]);
      }
      return;
    }
    // If this conversation was just initialized during handleSendMessage, skip loading from server so optimistic streaming is not wiped
    if (skipNextLoadForConvIdRef.current === activeConversationId) {
      return;
    }
    // If currently streaming for this conversation, do not overwrite the active stream
    if (isStreamingRef.current && activeConversationIdRef.current === activeConversationId) {
      return;
    }
    loadConversationMessages(activeConversationId);
  }, [activeConversationId, user]);

  // Global ⌘K (macOS) / Ctrl+K (Windows/Linux) shortcut for New Chat
  const handleNewChatRef = useRef<(() => void) | undefined>(undefined);

  // Check URL hash for admin entry (e.g. /#admin)
  useEffect(() => {
    const handleHashCheck = async () => {
      if (window.location.hash === '#admin') {
        try {
          const res = await authFetch('/api/admin/check-access');
          if (res.ok) {
            const data = await res.json();
            if (data.authorized) {
              setActiveView('secret_verify');
            }
          }
        } catch {
          // Silent if unauthorized
        }
      }
    };
    handleHashCheck();
    window.addEventListener('hashchange', handleHashCheck);
    return () => window.removeEventListener('hashchange', handleHashCheck);
  }, [user]);

  // Global keyboard shortcuts:
  // - "ctrl+6+k" (or ⌘+6+k on macOS) for Admin Panel Access
  // - ⌘K (macOS) / Ctrl+K (Windows/Linux) for New Chat (when '6' is not pressed)
  useEffect(() => {
    const activeKeys = new Set<string>();
    let last6Timestamp = 0;
    let lastKTimestamp = 0;

    const triggerAdminFromShortcut = async () => {
      try {
        const res = await authFetch('/api/admin/check-access');
        if (res.ok) {
          const data = await res.json();
          if (data.authorized) {
            setActiveView('secret_verify');
          }
        }
      } catch {
        // Intentionally silent
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key ? e.key.toLowerCase() : '';

      if (key) {
        activeKeys.add(key);
      }

      // Check for PC Admin Shortcut: "ctrl+6+k" (or ⌘+6+k)
      if (isCtrlOrMeta) {
        const now = Date.now();

        if (key === '6') {
          e.preventDefault();
          last6Timestamp = now;

          // Check if 'k' was already pressed or is being held
          if (activeKeys.has('k') || (now - lastKTimestamp < 2500 && lastKTimestamp > 0)) {
            last6Timestamp = 0;
            lastKTimestamp = 0;
            triggerAdminFromShortcut();
            return;
          }
        } else if (key === 'k') {
          // If '6' was already pressed or is being held with Ctrl -> Admin Access!
          if (activeKeys.has('6') || (now - last6Timestamp < 2500 && last6Timestamp > 0)) {
            e.preventDefault();
            last6Timestamp = 0;
            lastKTimestamp = 0;
            triggerAdminFromShortcut();
            return;
          }

          // Otherwise, normal New Chat shortcut: ⌘K or Ctrl+K
          e.preventDefault();
          lastKTimestamp = now;
          if (handleNewChatRef.current) {
            handleNewChatRef.current();
          }
          return;
        }
      } else {
        // If user pressed Ctrl+6 then pressed K within 2.5s (or vice versa)
        const now = Date.now();
        if (key === 'k' && now - last6Timestamp < 2500 && last6Timestamp > 0) {
          e.preventDefault();
          last6Timestamp = 0;
          triggerAdminFromShortcut();
          return;
        } else if (key === '6' && now - lastKTimestamp < 2500 && lastKTimestamp > 0) {
          e.preventDefault();
          lastKTimestamp = 0;
          triggerAdminFromShortcut();
          return;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key ? e.key.toLowerCase() : '';
      if (key) {
        activeKeys.delete(key);
      }
    };

    const handleWindowBlur = () => {
      activeKeys.clear();
      last6Timestamp = 0;
      lastKTimestamp = 0;
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  const checkAuthSession = async () => {
    try {
      setAuthLoading(true);
      const res = await authFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          setAuthToken(data.token);
        }
        setUser(data.user);
        await loadInitialData(data.user);
      } else {
        clearAuthToken();
        setUser(null);
      }
    } catch {
      clearAuthToken();
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const loadInitialData = async (activeUser?: User | null) => {
    const currentUser = activeUser !== undefined ? activeUser : user;
    await Promise.all([
      loadConversations(currentUser?.id),
      loadMemories(),
      loadFiles(),
      loadUsage(),
      loadServerStatus(),
    ]);
  };

  const dedupeConversations = (list: Conversation[]): Conversation[] => {
    const seen = new Set<string>();
    return list.filter((c) => {
      if (!c || !c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  };

  const loadConversations = async (explicitUserId?: string) => {
    try {
      const uid = explicitUserId || user?.id;
      // 1. Instant local read for zero-latency UI
      if (uid) {
        const cached = await getConversationsLocal(uid);
        if (cached && cached.length > 0) {
          const uniqueCached = dedupeConversations(cached);
          setConversations(uniqueCached);
          if (!activeConversationIdRef.current) {
            activeConversationIdRef.current = uniqueCached[0].id;
            setActiveConversationId(uniqueCached[0].id);
          }
        }
      }

      // 2. Network sync with server
      const res = await authFetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        const serverConvs: Conversation[] = data.conversations || [];
        const uniqueServer = dedupeConversations(serverConvs);
        setConversations(uniqueServer);
        if (uniqueServer.length > 0 && !activeConversationIdRef.current) {
          activeConversationIdRef.current = uniqueServer[0].id;
          setActiveConversationId(uniqueServer[0].id);
        }
        if (uniqueServer.length > 0) {
          await saveConversationsBulkLocal(uniqueServer);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const loadConversationMessages = async (convId: string) => {
    try {
      // If currently streaming for this conversation, never wipe or overwrite active messages
      if (isStreamingRef.current && activeConversationIdRef.current === convId) {
        return;
      }

      // 1. Instant local read for zero-latency UI
      const cached = await getMessagesLocal(convId);
      if (cached && cached.length > 0) {
        if (!isStreamingRef.current) {
          setMessages(cached);
        }
      }

      // 2. Network sync from server/database
      const res = await authFetch(`/api/conversations/${convId}`);
      if (res.status === 404) {
        // If conversation no longer exists on server, reset active state cleanly
        setActiveConversationId(null);
        activeConversationIdRef.current = null;
        setMessages([]);
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        return;
      }
      if (res.ok) {
        // Guard against race condition if streaming started while fetch was in flight
        if (isStreamingRef.current && activeConversationIdRef.current === convId) {
          return;
        }

        const data = await res.json();
        const rawServerMsgs: any[] = data.messages || [];
        const serverMsgs: Message[] = rawServerMsgs.map(normalizeMessage);
        
        // If server returns messages, update UI and sync to local vault
        if (serverMsgs.length > 0) {
          setMessages(serverMsgs);
          await saveMessagesBulkLocal(serverMsgs);
        } else if (!cached || cached.length === 0) {
          // If neither local nor server has messages, ensure clean empty list only if we don't already have messages in memory for this chat
          setMessages((prev) => {
            if (isStreamingRef.current) return prev;
            if (prev.length > 0 && prev[0].conversationId === convId) return prev;
            return [];
          });
        }
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const loadMemories = async () => {
    try {
      const res = await authFetch('/api/memories');
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch (err) {
      console.error('Failed to load memories:', err);
    }
  };

  const loadFiles = async () => {
    try {
      const res = await authFetch('/api/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  };

  const loadUsage = async () => {
    try {
      const res = await authFetch('/api/usage');
      if (res.ok) {
        const data = await res.json();
        setDailyUsage(data.dailyUsage);
      }
    } catch (err) {
      console.error('Failed to load usage telemetry:', err);
    }
  };

  const loadServerStatus = async () => {
    try {
      const res = await authFetch('/api/settings/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus({
          serverGroqConfigured: data.serverGroqConfigured,
          activeProvider: data.activeProvider,
          availableModels: data.availableModels,
        });
        if (data.availableModels && Array.isArray(data.availableModels)) {
          setAvailableModels(data.availableModels);
        }
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  // --- Auth Actions ---
  const handleLogin = async (email: string, pass: string, remember: boolean) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass, remember }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.requiresVerification) {
        return { requiresVerification: true, email: data.email || email };
      }
      throw new Error(data.error || 'Login failed');
    }
    setAuthToken(data.token);
    setUser(data.user);
    setShowAuthModal(false);
    setShowSplash(true);
    showToast(`Welcome back, ${data.user.name}`, 'success');
    await loadInitialData();
    setActiveView('chat');
    if (pendingLandingPrompt) {
      const p = pendingLandingPrompt;
      setPendingLandingPrompt(null);
      setTimeout(() => {
        handleSendMessage(p, []);
      }, 500);
    }
  };

  const handleRegister = async (name: string, email: string, pass: string, confirm: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: pass, confirmPassword: confirm }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.error || 'Registration failed');
      err.code = data.code;
      err.status = res.status;
      throw err;
    }
    if (data.user && data.requiresVerification === false) {
      setAuthToken(data.token);
      setUser(data.user);
      setShowAuthModal(false);
      setShowSplash(true);
      showToast('Welcome to Aestific!', 'success');
      await loadInitialData(data.user);
      setActiveView('chat');
      if (pendingLandingPrompt) {
        const p = pendingLandingPrompt;
        setPendingLandingPrompt(null);
        setTimeout(() => {
          handleSendMessage(p, []);
        }, 500);
      }
      return { requiresVerification: false, email: data.email || email };
    }
    return { requiresVerification: true, email: data.email || email };
  };

  const handleDemoLogin = async () => {
    const res = await fetch('/api/auth/demo', {
      method: 'POST',
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Demo login failed');
    setAuthToken(data.token);
    setUser(data.user);
    setShowAuthModal(false);
    setShowSplash(true);
    showToast('Welcome to Aestific Sandbox', 'success');
    await loadInitialData(data.user);
    setActiveView('chat');
  };

  const handleVerifyEmail = async (email: string, code: string) => {
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Verification failed');
    setAuthToken(data.token);
    setUser(data.user);
    setShowAuthModal(false);
    setShowSplash(true);
    showToast('Email verified successfully. Welcome to Aestific!', 'success');
    await loadInitialData(data.user);
    setActiveView('chat');
    if (pendingLandingPrompt) {
      const p = pendingLandingPrompt;
      setPendingLandingPrompt(null);
      setTimeout(() => {
        handleSendMessage(p, []);
      }, 500);
    }
  };

  const handleResendVerification = async (email: string): Promise<string> => {
    const res = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to resend code');
    return data.message || 'Verification code sent.';
  };

  const handleForgotPassword = async (email: string): Promise<string> => {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to request password reset');
    return data.message || 'If an account exists for this email, a password reset email has been sent.';
  };

  const handleResetPassword = async (
    email: string,
    code: string,
    newPassword: string,
    confirmPassword: string
  ) => {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword, confirmPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reset password');

    // 1. Use the authentication/session information already issued by the existing backend
    if (data.token) {
      setAuthToken(data.token);
    }

    // 2. Synchronize the frontend authentication state correctly
    setUser(data.user);
    setShowAuthModal(false);

    // 3. Ensure the newly authenticated session is recognized by /api/auth/me
    try {
      const meRes = await authFetch('/api/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.user) {
          setUser(meData.user);
        }
        if (meData.token) {
          setAuthToken(meData.token);
        }
      }
    } catch (meErr) {
      console.warn('Session check after password reset:', meErr);
    }

    // 5. Open the normal main Aestific interface
    setShowSplash(true);
    showToast('Password updated successfully. Welcome back!', 'success');
    setActiveView('chat');

    // 4. Load initial authenticated data only after authentication has been established
    try {
      await loadInitialData(data.user);
    } catch (loadErr) {
      console.warn('Initial data load after password reset:', loadErr);
    }
  };

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on signout
    }
    clearAuthToken();
    setUser(null);
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setMemories([]);
    setFiles([]);
    setDailyUsage(undefined);
    activeConversationIdRef.current = null;
    isStreamingRef.current = false;
    setChatSettingsUserId(null);
    setThemeUserId(null);
    setLanguageUserId(null);
    setExperienceUserId(null);
    setAiEngineUserId(null);
    showToast('Signed out of Aestific', 'info');
  };

  const handleAcceptTerms = () => {
    if (user) {
      localStorage.setItem(`aestific_terms_accepted_${user.id}`, 'true');
    }
    setHasAcceptedTerms(true);
    showToast('Terms & Conditions accepted. Welcome to Aestific!', 'success');
    if (activeView === 'terms') {
      setActiveView('chat');
    }
  };

  // --- Chat Actions ---
  const handleNewChat = async () => {
    // If Save Chat History is disabled OR Temporary Chat is enabled:
    if (!saveChatHistory || temporaryChat) {
      const tempConvId = 'temp-' + Date.now();
      activeConversationIdRef.current = tempConvId;
      setActiveConversationId(tempConvId);
      setMessages([]);
      setActiveView('chat');
      return;
    }

    try {
      const res = await authFetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Conversation' }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversations((prev) => [data.conversation, ...prev.filter((c) => c.id !== data.conversation.id)]);
        skipNextLoadForConvIdRef.current = data.conversation.id;
        activeConversationIdRef.current = data.conversation.id;
        setActiveConversationId(data.conversation.id);
        setMessages([]);
        setActiveView('chat');
        saveConversationLocal(data.conversation).catch(() => {});
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Could not create conversation', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Could not create conversation', 'error');
    }
  };
  handleNewChatRef.current = handleNewChat;

  const handleSendMessage = async (
    text: string,
    attachments: Attachment[],
    options?: {
      isRegenerate?: boolean;
      replaceAssistantId?: string;
      reuseUserMessageId?: string;
      customTemperature?: number;
    }
  ) => {
    let convId = activeConversationIdRef.current || activeConversationId;
    const isTemp = !saveChatHistory || temporaryChat || (convId ? convId.startsWith('temp-') : false);
    const provisionalConvId = convId || ('temp_' + Date.now());

    // Optimistic User Message (only created when not regenerating/retrying an existing prompt)
    const tempUserMsgId = options?.reuseUserMessageId || ('temp_' + Date.now());
    const optimisticUserMsg: Message = {
      id: tempUserMsgId,
      conversationId: provisionalConvId,
      role: 'user',
      sender: 'user',
      content: text,
      attachments,
      createdAt: new Date().toISOString(),
    };

    // Placeholder Assistant Message for live streaming
    const tempAssistantId = 'stream_' + Date.now();
    const optimisticAssistantMsg: Message = {
      id: tempAssistantId,
      conversationId: provisionalConvId,
      role: 'assistant',
      sender: 'assistant',
      content: '',
      isStreaming: true,
      createdAt: new Date().toISOString(),
    };

    // Set streaming state and render message bubbles IMMEDIATELY to prevent any blank/black screen flash
    isStreamingRef.current = true;
    setIsStreaming(true);

    if (options?.isRegenerate) {
      setMessages((prev) => {
        if (options.replaceAssistantId && prev.some((m) => m.id === options.replaceAssistantId)) {
          return prev.map((m) => (m.id === options.replaceAssistantId ? optimisticAssistantMsg : m));
        }
        // Fallback: replace the last assistant message if present, otherwise append
        const lastIdx = [...prev].reverse().findIndex((m) => m.role === 'assistant' || m.sender === 'assistant');
        if (lastIdx !== -1) {
          const actualIdx = prev.length - 1 - lastIdx;
          return prev.map((m, idx) => (idx === actualIdx ? optimisticAssistantMsg : m));
        }
        return [...prev, optimisticAssistantMsg];
      });
    } else {
      setMessages((prev) => [...prev, optimisticUserMsg, optimisticAssistantMsg]);
    }

    // Create conversation on the fly if none active
    if (!convId) {
      if (isTemp) {
        convId = 'temp-' + Date.now();
        activeConversationIdRef.current = convId;
        setActiveConversationId(convId);
      } else {
        try {
          const res = await authFetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: text.slice(0, 30) || 'New Conversation' }),
          });
          if (res.ok) {
            const data = await res.json();
            convId = data.conversation.id;
            skipNextLoadForConvIdRef.current = convId;
            activeConversationIdRef.current = convId;
            setConversations((prev) => [data.conversation, ...prev.filter((c) => c.id !== data.conversation.id)]);
            setActiveConversationId(convId);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempUserMsgId || m.id === tempAssistantId
                  ? { ...m, conversationId: convId! }
                  : m
              )
            );
            saveConversationLocal(data.conversation).catch(() => {});
          } else {
            const errData = await res.json().catch(() => ({}));
            showToast(errData.error || 'Error initializing conversation', 'error');
            setIsStreaming(false);
            isStreamingRef.current = false;
            return;
          }
        } catch (convErr: any) {
          showToast(convErr?.message || 'Error initializing conversation', 'error');
          setIsStreaming(false);
          isStreamingRef.current = false;
          return;
        }
      }
    }

    // Abort controller for Stop button
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let accumulatedText = '';

    try {
      const response = await authFetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: convId,
          message: text,
          attachments,
          temporary: isTemp,
          saveHistory: !isTemp,
          isRegenerate: Boolean(options?.isRegenerate),
          reuseUserMessageId: options?.reuseUserMessageId,
          temperature: options?.customTemperature,
          history: isTemp
            ? messages.filter((m) => !m.isStreaming).map((m) => ({ role: m.role, content: m.content }))
            : undefined,
          aiEnginePreferences: {
            engine,
            intelligence,
            context,
            responseLength,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Server error while generating response.');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response stream not readable.');

      const decoder = new TextDecoder();
      let buffer = '';
      accumulatedText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          const match = block.match(/event:\s*([^\r\n]+)\r?\ndata:\s*(.+)/s);
          if (match) {
            const event = match[1].trim();
            const dataStr = match[2].trim();
            try {
              const parsed = JSON.parse(dataStr);

              if (event === 'user_message') {
                const rawServerUserMsg = parsed.userMessage ? normalizeMessage(parsed.userMessage) : null;
                if (rawServerUserMsg && rawServerUserMsg.id) {
                  const serverUserMsg: Message = {
                    ...rawServerUserMsg,
                    attachments:
                      rawServerUserMsg.attachments && rawServerUserMsg.attachments.length > 0
                        ? rawServerUserMsg.attachments.map((att, idx) => ({
                            ...optimisticUserMsg.attachments?.[idx],
                            ...att,
                            previewUrl: optimisticUserMsg.attachments?.[idx]?.previewUrl || att.previewUrl,
                            dataUrl: optimisticUserMsg.attachments?.[idx]?.dataUrl || att.dataUrl,
                          }))
                        : optimisticUserMsg.attachments,
                  };
                  setMessages((prev) => {
                    const hasTemp = prev.some((m) => m.id === tempUserMsgId);
                    if (hasTemp) {
                      return prev.map((m) => (m.id === tempUserMsgId ? serverUserMsg : m));
                    }
                    const exists = prev.some((m) => m.id === serverUserMsg.id);
                    if (!exists) {
                      return [...prev, serverUserMsg];
                    }
                    return prev;
                  });
                  if (!isTemp) {
                    deleteMessageLocal(tempUserMsgId).catch(() => {});
                    saveMessageLocal(serverUserMsg).catch(() => {});
                  }
                }
              } else if (event === 'search_status') {
                const searchSources = Array.isArray(parsed.sources) ? parsed.sources : [];
                setMessages((prev) => {
                  const hasAssistant = prev.some((m) => m.id === tempAssistantId);
                  const searchStateObj = {
                    isSearching: parsed.phase !== 'done',
                    phase: parsed.phase as 'searching' | 'sources_found' | 'done',
                    query: parsed.query,
                    sources: searchSources,
                  };
                  if (hasAssistant) {
                    return prev.map((m) =>
                      m.id === tempAssistantId
                        ? {
                            ...m,
                            webSearchUsed: true,
                            searchState: searchStateObj,
                            sources: searchSources.length > 0 ? searchSources : m.sources,
                          }
                        : m
                    );
                  }
                  return [
                    ...prev,
                    {
                      id: tempAssistantId,
                      conversationId: convId!,
                      role: 'assistant',
                      sender: 'assistant',
                      content: '',
                      isStreaming: true,
                      webSearchUsed: true,
                      searchState: searchStateObj,
                      sources: searchSources.length > 0 ? searchSources : undefined,
                      createdAt: new Date().toISOString(),
                    },
                  ];
                });
              } else if (event === 'start') {
                // Connection established, inference stream started
                if (parsed.isImageGeneration) {
                  accumulatedText = '';
                }
                setMessages((prev) => {
                  const hasAssistant = prev.some((m) => m.id === tempAssistantId);
                  const effectiveSources = Array.isArray(parsed.sources) && parsed.sources.length > 0 ? parsed.sources : undefined;
                  if (hasAssistant) {
                    return prev.map((m) =>
                      m.id === tempAssistantId
                        ? {
                            ...m,
                            content: parsed.isImageGeneration ? '' : m.content,
                            modelUsed: parsed.modelUsed,
                            model: parsed.modelUsed,
                            webSearchUsed: Boolean(parsed.webSearchUsed || m.webSearchUsed),
                            sources: effectiveSources || m.sources,
                            searchState: m.searchState
                              ? {
                                  ...m.searchState,
                                  isSearching: false,
                                  phase: 'done',
                                  sources: effectiveSources || m.searchState.sources,
                                }
                              : undefined,
                            imageGen: parsed.isImageGeneration
                              ? {
                                  isGenerating: true,
                                  phase: 'understanding',
                                  label: parsed.quantity && parsed.quantity > 1 ? `Understanding prompt (${parsed.quantity} images)` : 'Understanding prompt',
                                  prompt: parsed.prompt,
                                  quantity: parsed.quantity,
                                  variations: parsed.variations,
                                }
                              : m.imageGen,
                          }
                        : m
                    );
                  }
                  return [
                    ...prev,
                    {
                      id: tempAssistantId,
                      conversationId: convId!,
                      role: 'assistant',
                      sender: 'assistant',
                      content: '',
                      isStreaming: true,
                      modelUsed: parsed.modelUsed,
                      model: parsed.modelUsed,
                      webSearchUsed: Boolean(parsed.webSearchUsed),
                      sources: effectiveSources,
                      searchState: parsed.webSearchUsed
                        ? {
                            isSearching: false,
                            phase: 'done',
                            sources: effectiveSources,
                          }
                        : undefined,
                      imageGen: parsed.isImageGeneration
                        ? {
                            isGenerating: true,
                            phase: 'understanding',
                            label: parsed.quantity && parsed.quantity > 1 ? `Understanding prompt (${parsed.quantity} images)` : 'Understanding prompt',
                            prompt: parsed.prompt,
                            quantity: parsed.quantity,
                            variations: parsed.variations,
                          }
                        : undefined,
                      createdAt: new Date().toISOString(),
                    },
                  ];
                });
              } else if (event === 'image_status') {
                setMessages((prev) => {
                  return prev.map((m) =>
                    m.id === tempAssistantId
                      ? {
                          ...m,
                          imageGen: {
                            isGenerating: parsed.phase !== 'ready' && parsed.phase !== 'error',
                            phase: parsed.phase,
                            label: parsed.label,
                            prompt: parsed.prompt,
                            imageUrl: parsed.imageUrl,
                            imageUrls: parsed.imageUrls || (parsed.imageUrl ? [parsed.imageUrl] : undefined),
                            fileId: parsed.fileId,
                            fileIds: parsed.fileIds,
                            quantity: parsed.quantity,
                            error: parsed.error,
                          },
                        }
                      : m
                  );
                });
              } else if (event === 'token') {
                accumulatedText += parsed.token;
                if (streamingResponses) {
                  setMessages((prev) => {
                    const hasAssistant = prev.some((m) => m.id === tempAssistantId);
                    if (hasAssistant) {
                      return prev.map((m) =>
                        m.id === tempAssistantId ? { ...m, content: accumulatedText } : m
                      );
                    }
                    return [
                      ...prev,
                      {
                        id: tempAssistantId,
                        conversationId: convId!,
                        role: 'assistant',
                        sender: 'assistant',
                        content: accumulatedText,
                        isStreaming: true,
                        createdAt: new Date().toISOString(),
                      },
                    ];
                  });
                }
              } else if (event === 'done') {
                const rawAssistant = parsed.assistantMessage || {};
                const finalMsg: Message = normalizeMessage({
                  ...rawAssistant,
                  content: rawAssistant.content || accumulatedText,
                });
                setMessages((prev) => {
                  const hasAssistant = prev.some((m) => m.id === tempAssistantId || m.id === finalMsg.id);
                  if (hasAssistant) {
                    return prev.map((m) =>
                      (m.id === tempAssistantId || m.id === finalMsg.id)
                        ? {
                            ...finalMsg,
                            webSearchUsed: Boolean(finalMsg.webSearchUsed || m.webSearchUsed),
                            sources: finalMsg.sources && finalMsg.sources.length > 0 ? finalMsg.sources : m.sources,
                            imageGen: m.imageGen,
                            isStreaming: false,
                          }
                        : m
                    );
                  }
                  return [...prev, { ...finalMsg, isStreaming: false }];
                });
                if (!isTemp) {
                  deleteMessageLocal(tempAssistantId).catch(() => {});
                  saveMessageLocal(finalMsg).catch(() => {});
                  // Refresh conversations and memories in background
                  loadConversations();
                  loadMemories();
                }
                loadUsage();
              } else if (event === 'error') {
                const errorText = parsed.error || 'AI inference streaming error';
                throw new Error(errorText);
              }
            } catch (e: any) {
              if (event === 'error') {
                throw e;
              }
              console.warn('Error parsing SSE block:', e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        showToast('Generation stopped', 'info');
        setMessages((prev) => {
          const hasAssistant = prev.some((m) => m.id === tempAssistantId);
          if (hasAssistant) {
            return prev.map((m) =>
              m.id === tempAssistantId
                ? {
                    ...m,
                    content: m.content || accumulatedText || '(Generation stopped by user)',
                    isStreaming: false,
                  }
                : m
            );
          }
          return prev;
        });
      } else {
        const errorMsg = err.message || 'Something went wrong while connecting to Aestific AI.';
        showToast(errorMsg, 'error');
        setMessages((prev) => {
          const hasAssistant = prev.some((m) => m.id === tempAssistantId);
          if (hasAssistant) {
            return prev.map((m) =>
              m.id === tempAssistantId
                ? {
                    ...m,
                    content:
                      m.content ||
                      `⚠️ **Error:** ${errorMsg}`,
                    isStreaming: false,
                  }
                : m
            );
          }
          return [
            ...prev,
            {
              id: tempAssistantId,
              conversationId: convId!,
              role: 'assistant',
              sender: 'assistant',
              content: `⚠️ **Error:** ${errorMsg}`,
              isStreaming: false,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      }
    } finally {
      setIsStreaming(false);
      isStreamingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleRegenerate = (targetAssistantId?: string, mode: 'regenerate' | 'retry' = 'regenerate') => {
    if (isStreaming || messages.length === 0) return;

    let assistantIdx = -1;
    if (targetAssistantId) {
      assistantIdx = messages.findIndex((m) => m.id === targetAssistantId);
    }
    if (assistantIdx === -1) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' || messages[i].sender === 'assistant') {
          assistantIdx = i;
          break;
        }
      }
    }

    // Find the user message preceding this assistant message (or the latest user message)
    let targetUserMsg: Message | undefined;
    const searchStart = assistantIdx !== -1 ? assistantIdx - 1 : messages.length - 1;
    for (let i = searchStart; i >= 0; i--) {
      if (messages[i].role === 'user' || messages[i].sender === 'user') {
        targetUserMsg = messages[i];
        break;
      }
    }

    if (!targetUserMsg) {
      targetUserMsg = [...messages].reverse().find((m) => m.role === 'user' || m.sender === 'user');
    }

    if (targetUserMsg) {
      const replaceId = assistantIdx !== -1 ? messages[assistantIdx].id : undefined;
      handleSendMessage(targetUserMsg.content, targetUserMsg.attachments || [], {
        isRegenerate: true,
        replaceAssistantId: replaceId,
        reuseUserMessageId: targetUserMsg.id,
        customTemperature: mode === 'regenerate' ? 0.85 : 0.7,
      });
    }
  };

  const handleReactMessage = async (messageId: string, liked?: boolean, disliked?: boolean) => {
    try {
      const res = await authFetch(`/api/messages/${messageId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked, disliked }),
      });
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  liked: Boolean(liked),
                  disliked: Boolean(disliked),
                  reactions: { liked: Boolean(liked), disliked: Boolean(disliked) },
                }
              : m
          )
        );
      }
    } catch {
      // Quiet fail
    }
  };

  // --- Voice Actions ---
  const handleSendVoiceNote = async (audioBlob: Blob, duration: number) => {
    setIsTranscribingVoice(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `voice-note-${Date.now()}.webm`);
      formData.append('duration', duration.toString());
      if (activeConversationId) {
        formData.append('conversationId', activeConversationId);
      }

      const res = await authFetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voice transcription failed');

      const transcribedText = data.transcription;
      showToast('Voice note transcribed successfully', 'success');

      // Send the transcribed message to Aestific AI
      await handleSendMessage(transcribedText, [
        {
          id: data.file.id,
          name: data.file.originalName,
          type: 'audio',
          mimeType: data.file.mimeType,
          size: data.file.size,
          url: data.file.url,
          duration,
          createdAt: data.file.createdAt,
        },
      ]);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        showToast('Voice transcription request timed out. Please try again.', 'error');
      } else {
        showToast(err.message || 'Voice transcription error', 'error');
      }
    } finally {
      setIsTranscribingVoice(false);
    }
  };

  // --- File Actions ---
  const handleUploadFile = async (file: File): Promise<FileRecord> => {
    const formData = new FormData();
    formData.append('file', file);
    if (
      activeConversationId &&
      !activeConversationId.startsWith('temp_') &&
      !activeConversationId.startsWith('temp-') &&
      !activeConversationId.startsWith('temporary-')
    ) {
      formData.append('conversationId', activeConversationId);
    }

    const res = await authFetch('/api/files/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'File upload failed');

    showToast(`Uploaded ${file.name}`, 'success');
    loadFiles();
    loadUsage();
    return data.file;
  };

  const handleDeleteFile = async (id: string) => {
    try {
      const res = await authFetch(`/api/files/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
        showToast('File removed', 'info');
      }
    } catch {
      showToast('Failed to delete file', 'error');
    }
  };

  const handleAskAboutFile = (file: FileRecord) => {
    setActiveView('chat');
    const prompt = file.type === 'pdf'
      ? `Please explain and summarize the contents of "${file.originalName}". Extract key points and actionable insights.`
      : `Please analyze this uploaded file "${file.originalName}".`;

    handleSendMessage(prompt, [
      {
        id: file.id,
        name: file.originalName,
        type: file.type,
        mimeType: file.mimeType,
        size: file.size,
        url: file.url,
        extractedText: file.extractedText,
        createdAt: file.createdAt,
      },
    ]);
  };

  // --- Conversation Management ---
  const handlePinConversation = async (id: string, isPinned: boolean) => {
    try {
      const res = await authFetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isPinned } : c))
        );
      }
    } catch {
      showToast('Failed to pin conversation', 'error');
    }
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      const res = await authFetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
        );
        showToast('Conversation renamed', 'success');
      }
    } catch {
      showToast('Failed to rename conversation', 'error');
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversationLocal(id);
      const res = await authFetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          const remaining = conversations.filter((c) => c.id !== id);
          setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
        }
        showToast('Conversation deleted', 'info');
      }
    } catch {
      showToast('Failed to delete conversation', 'error');
    }
  };

  const handleArchiveConversation = async (id: string) => {
    try {
      const res = await authFetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        showToast('Conversation archived', 'info');
      }
    } catch {
      showToast('Failed to archive conversation', 'error');
    }
  };

  const handleClearAllConversations = async () => {
    try {
      if (user?.id) {
        await clearUserLocalVault(user.id);
      }
      const res = await authFetch('/api/conversations', { method: 'DELETE' });
      if (res.ok) {
        setConversations([]);
        setActiveConversationId(null);
        setMessages([]);
        showToast('All chat history cleared from Cloud and Local Vault', 'info');
      }
    } catch {
      showToast('Failed to clear conversations', 'error');
    }
  };

  // --- Memory Management ---
  const handleToggleMemory = async (enabled: boolean) => {
    try {
      const res = await authFetch('/api/memories/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        if (user) setUser({ ...user, memoryEnabled: enabled });
        showToast(`Account memory ${enabled ? 'enabled' : 'disabled'}`, 'info');
      }
    } catch {
      showToast('Failed to toggle memory', 'error');
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const res = await authFetch(`/api/memories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
        showToast('Memory deleted', 'info');
      }
    } catch {
      showToast('Failed to delete memory', 'error');
    }
  };

  const handleClearMemories = async () => {
    try {
      const res = await authFetch('/api/memories', { method: 'DELETE' });
      if (res.ok) {
        setMemories([]);
        showToast('All memories cleared', 'info');
      }
    } catch {
      showToast('Failed to clear memories', 'error');
    }
  };

  const handleCreateMemory = async (content: string, category: Memory['category']) => {
    try {
      const res = await authFetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, category }),
      });
      if (res.ok) {
        const data = await res.json();
        setMemories((prev) => [data.memory, ...prev]);
        showToast('Account memory saved', 'success');
      }
    } catch {
      showToast('Failed to save memory', 'error');
    }
  };

  // --- Profile & Settings ---
  const handleUpdateProfile = async (updates: Partial<User>) => {
    try {
      const res = await authFetch('/api/auth/update-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      setUser(data.user);
      showToast('Profile updated', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleChangePassword = async (currentPass: string, newPass: string) => {
    const res = await authFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Password update failed');
    showToast('Password changed successfully', 'success');
  };

  const handleDeleteAccount = async () => {
    try {
      const res = await authFetch('/api/auth/account', { method: 'DELETE' });
      if (res.ok) {
        if (user?.id) {
          clearUserLocalVault(user.id).catch(() => {});
        }
        clearAuthToken();
        setUser(null);
        setConversations([]);
        setActiveConversationId(null);
        setMessages([]);
        setMemories([]);
        setFiles([]);
        setDailyUsage(undefined);
        activeConversationIdRef.current = null;
        isStreamingRef.current = false;
        setChatSettingsUserId(null);
        setThemeUserId(null);
        setLanguageUserId(null);
        setExperienceUserId(null);
        setAiEngineUserId(null);
        showToast('Account deleted permanently', 'info');
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to delete account', 'error');
      }
    } catch {
      showToast('Failed to delete account', 'error');
    }
  };

  const handleExportData = async () => {
    try {
      const localVault = await exportAllLocalData(user?.id);
      const data = {
        user: { id: user?.id, name: user?.name, email: user?.email },
        conversations,
        messages,
        memories,
        files,
        localVault,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aestific-vault-export-${Date.now()}.json`;
      a.click();
      showToast('Local Vault & Cloud Data exported successfully', 'success');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const handleExportChat = () => {
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    let md = `# ${activeConv?.title || 'Aestific Conversation'}\n\n`;
    md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

    for (const m of messages) {
      const isUser = m.role === 'user' || m.sender === 'user';
      md += `### ${isUser ? 'User' : 'Aestific AI'} (${new Date(m.createdAt).toLocaleTimeString()})\n\n`;
      md += `${m.content}\n\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeConv?.title || 'chat').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    a.click();
    showToast('Conversation exported as Markdown', 'success');
  };

  const handleOpenAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthModalInitialMode(mode);
    setShowAuthModal(true);
  };

  const handleStartWithPrompt = (prompt: string) => {
    if (!user) {
      setPendingLandingPrompt(prompt);
      handleOpenAuth('register');
    } else {
      setActiveView('chat');
      handleSendMessage(prompt, []);
    }
  };

  const handleLandingGetStarted = () => {
    if (!user) {
      handleOpenAuth('register');
    } else {
      setActiveView('chat');
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-white dark:bg-black">
      {authLoading || showInitialWhiteLoading ? (
        <div className="h-[100dvh] w-full bg-white flex items-center justify-center relative overflow-hidden select-none" />
      ) : !user ? (
        <div className="h-[100dvh] w-full bg-white overflow-hidden relative select-text">
          <CinematicLandingPage
            user={null}
            onGetStarted={handleLandingGetStarted}
            onOpenAuth={(mode) => handleOpenAuth(mode || 'login')}
            onStartWithPrompt={handleStartWithPrompt}
          />
          {showAuthModal && (
            <AuthModal
              initialMode={authModalInitialMode}
              onLogin={handleLogin}
              onRegister={handleRegister}
              onDemoLogin={handleDemoLogin}
              onVerifyEmail={handleVerifyEmail}
              onResendVerification={handleResendVerification}
              onForgotPassword={handleForgotPassword}
              onResetPassword={handleResetPassword}
              onClose={() => setShowAuthModal(false)}
              pendingPrompt={pendingLandingPrompt}
            />
          )}
        </div>
      ) : user.isBanned || (user as any).status === 'banned' ? (
        <div className="h-[100dvh] w-full bg-white dark:bg-black flex flex-col items-center justify-center p-6 text-center text-zinc-900 dark:text-white relative transition-colors">
          <SpatialAtmosphere />
          <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 mb-4">
            <Ban className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Account Access Suspended</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mb-6">
            {user.bannedReason || 'This account has been suspended by system administration.'}
          </p>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 rounded-xl bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 text-xs font-semibold"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="h-[100dvh] w-full flex bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans relative transition-colors"
        >
      {/* Global Animated Cosmic Atmosphere Layer */}
      <SpatialAtmosphere />

      {/* Terms & Conditions Acceptance Banner */}
      {!hasAcceptedTerms && (
        <TermsBanner
          isOpen={!hasAcceptedTerms}
          onAccept={handleAcceptTerms}
          onOpenFullTerms={() => setActiveView('terms')}
        />
      )}

      {/* Sidebar with Real Conversations & Navigation */}
      <Sidebar
        user={user}
        conversations={conversations}
        activeConversationId={activeConversationId}
        activeView={activeView}
        onSelectView={(view) => setActiveView(view)}
        onSelectConversation={(id) => {
          setActiveConversationId(id);
          setActiveView('chat');
        }}
        onNewChat={handleNewChat}
        onPinConversation={handlePinConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onArchiveConversation={handleArchiveConversation}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenImageStudio={() => setIsImageModalOpen(true)}
        isImageStudioOpen={isImageModalOpen}
        onLogout={handleLogout}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main View Area Routing */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {activeView === 'chat' && (
          <ChatView
            user={user}
            conversation={activeConversation}
            messages={messages}
            isStreaming={isStreaming}
            onSendMessage={handleSendMessage}
            onStopGeneration={handleStopGeneration}
            onRegenerate={(msgId?: string) => handleRegenerate(msgId, 'regenerate')}
            onRetry={(msgId?: string) => handleRegenerate(msgId, 'retry')}
            onReactMessage={handleReactMessage}
            onClearChat={() => {
              if (activeConversationId) {
                handleDeleteConversation(activeConversationId);
              }
            }}
            onExportChat={handleExportChat}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenVoiceStudio={() => setIsVoiceModalOpen(true)}
            onOpenImageStudio={(prompt?: string) => {
              if (prompt) {
                setImageModalPrompt(prompt);
              }
              setIsImageModalOpen(true);
            }}
            onUploadFile={handleUploadFile}
            onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          />
        )}

        {activeView === 'files' && (
          <FilesPage
            files={files}
            onDeleteFile={handleDeleteFile}
            onAskAboutFile={handleAskAboutFile}
            onBackToChat={() => setActiveView('chat')}
            onUploadFile={async (f) => {
              await handleUploadFile(f);
            }}
          />
        )}

        {activeView === 'memories' && (
          <MemoriesPage
            memories={memories}
            memoryEnabled={Boolean(user.memoryEnabled)}
            onToggleMemory={handleToggleMemory}
            onDeleteMemory={handleDeleteMemory}
            onClearMemories={handleClearMemories}
            onCreateMemory={handleCreateMemory}
            onBackToChat={() => setActiveView('chat')}
          />
        )}

        {(activeView === 'terms' || activeView === 'documents') && (
          <TermsPage
            initialDoc={activeView === 'terms' ? 'terms' : null}
            onBack={() => setActiveView('chat')}
            onAccept={handleAcceptTerms}
            isAccepted={hasAcceptedTerms}
          />
        )}

        {activeView === 'support' && (
          <SupportCenterPage user={user} onBackToChat={() => setActiveView('chat')} />
        )}

        {activeView === 'secret_verify' && (
          <SecretVerifyPage onBackToApp={() => setActiveView('chat')} />
        )}

        {activeView === 'landing' && (
          <div className="flex-1 h-full overflow-hidden bg-white">
            <CinematicLandingPage
              user={user}
              onGetStarted={() => setActiveView('chat')}
              onOpenAuth={() => setActiveView('chat')}
              onStartWithPrompt={handleStartWithPrompt}
            />
          </div>
        )}
      </main>

      {/* Voice Recording Modal */}
      <VoiceRecorderModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onSendVoice={handleSendVoiceNote}
        isProcessing={isTranscribingVoice}
      />

      {/* AI Picture Studio Generator Modal */}
      <ImageGenerationModal
        isOpen={isImageModalOpen}
        onClose={() => {
          setIsImageModalOpen(false);
          setImageModalPrompt('');
        }}
        conversationId={activeConversationId}
        initialPrompt={imageModalPrompt}
        onImageGenerated={async (imageUrl, prompt) => {
          if (activeConversationId) {
            await loadConversationMessages(activeConversationId);
            showToast('Image added to conversation', 'success');
          } else {
            handleSendMessage(`Generated Image: "${prompt}"`, [
              {
                id: 'img-' + Date.now(),
                name: 'Generated Artwork.png',
                type: 'image',
                mimeType: 'image/png',
                size: 1024 * 1024,
                url: imageUrl,
                createdAt: new Date().toISOString(),
              },
            ]);
          }
          setActiveView('chat');
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        onUpdateProfile={handleUpdateProfile}
        onUserUpdated={(updatedUser) => setUser(updatedUser)}
        onChangePassword={handleChangePassword}
        onClearAllConversations={handleClearAllConversations}
        onDeleteAccount={handleDeleteAccount}
        onExportData={handleExportData}
        onLogout={handleLogout}
        onViewTerms={() => {
          setIsSettingsOpen(false);
          setActiveView('terms');
        }}
        onOpenDocuments={() => {
          setIsSettingsOpen(false);
          setActiveView('documents');
        }}
        availableModels={availableModels}
        serverGroqStatus={serverStatus}
      />
        </motion.div>
      )}

      {/* Initial Entry Full-Screen White Loading Screen with Aestific Logo & Text */}
      <AnimatePresence>
        {showInitialWhiteLoading && (
          <InitialWhiteLoadingScreen />
        )}
      </AnimatePresence>

      {/* Aestific Brand Intro Experience Overlay (Only plays on sign in/up) */}
      <AnimatePresence>
        {showSplash && (
          <SplashScreen onComplete={() => setShowSplash(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AppWithMotionConfig() {
  const { reduceMotion } = useTheme();
  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
      <ToastProvider>
        <MainApp />
      </ToastProvider>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ChatSettingsProvider>
          <ExperienceSettingsProvider>
            <AiEngineSettingsProvider>
              <AppWithMotionConfig />
            </AiEngineSettingsProvider>
          </ExperienceSettingsProvider>
        </ChatSettingsProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

