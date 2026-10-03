import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export interface ChatSettingsContextType {
  enterToSend: boolean;
  setEnterToSend: (val: boolean) => void;
  streamingResponses: boolean;
  setStreamingResponses: (val: boolean) => void;
  autoScroll: boolean;
  setAutoScroll: (val: boolean) => void;
  showTimestamps: boolean;
  setShowTimestamps: (val: boolean) => void;
  saveChatHistory: boolean;
  setSaveChatHistory: (val: boolean) => void;
  temporaryChat: boolean;
  setTemporaryChat: (val: boolean) => void;
  setUserId: (userId: string | null | undefined) => void;
}

const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);

function getUserStorageKey(key: string, userId?: string | null): string {
  if (userId && userId.trim()) {
    return `aestific_${userId.trim()}_${key}`;
  }
  return `aestific_${key}`;
}

export const ChatSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUserIdRef = useRef<string | null>(null);

  // 1. Enter to Send (default true)
  const [enterToSend, setEnterToSendState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aestific_chat_enter_to_send');
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore
    }
    return true;
  });

  // 2. Streaming Responses (default true)
  const [streamingResponses, setStreamingResponsesState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aestific_chat_streaming_responses');
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore
    }
    return true;
  });

  // 3. Auto-scroll (default true)
  const [autoScroll, setAutoScrollState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aestific_chat_auto_scroll');
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore
    }
    return true;
  });

  // 4. Show Timestamps (default true)
  const [showTimestamps, setShowTimestampsState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aestific_chat_show_timestamps');
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore
    }
    return true;
  });

  // 5. Save Chat History (default true)
  const [saveChatHistory, setSaveChatHistoryState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aestific_chat_save_history');
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore
    }
    return true;
  });

  // 6. Temporary Chat (default false)
  const [temporaryChat, setTemporaryChatState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aestific_chat_temporary_chat');
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore
    }
    return false;
  });

  // User isolation & persistence
  const setUserId = useCallback((userId: string | null | undefined) => {
    const cleanId = userId?.trim() || null;
    currentUserIdRef.current = cleanId;

    if (!cleanId) {
      // Reset to defaults on signout
      setSaveChatHistoryState(true);
      setTemporaryChatState(false);
      return;
    }

    try {
      // Restore user-specific Enter to Send
      const userEnter = localStorage.getItem(getUserStorageKey('chat_enter_to_send', cleanId));
      if (userEnter !== null) {
        setEnterToSendState(userEnter === 'true');
      }

      // Restore user-specific Streaming
      const userStreaming = localStorage.getItem(getUserStorageKey('chat_streaming_responses', cleanId));
      if (userStreaming !== null) {
        setStreamingResponsesState(userStreaming === 'true');
      }

      // Restore user-specific Auto-scroll
      const userAutoScroll = localStorage.getItem(getUserStorageKey('chat_auto_scroll', cleanId));
      if (userAutoScroll !== null) {
        setAutoScrollState(userAutoScroll === 'true');
      }

      // Restore user-specific Timestamps
      const userTimestamps = localStorage.getItem(getUserStorageKey('chat_show_timestamps', cleanId));
      if (userTimestamps !== null) {
        setShowTimestampsState(userTimestamps === 'true');
      }

      // Restore user-specific Save Chat History
      const userSaveHistory = localStorage.getItem(getUserStorageKey('chat_save_history', cleanId));
      if (userSaveHistory !== null) {
        setSaveChatHistoryState(userSaveHistory === 'true');
      } else {
        setSaveChatHistoryState(true);
      }

      // Restore user-specific Temporary Chat
      const userTempChat = localStorage.getItem(getUserStorageKey('chat_temporary_chat', cleanId));
      if (userTempChat !== null) {
        setTemporaryChatState(userTempChat === 'true');
      } else {
        setTemporaryChatState(false);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setEnterToSend = useCallback((val: boolean) => {
    setEnterToSendState(val);
    try {
      localStorage.setItem('aestific_chat_enter_to_send', val ? 'true' : 'false');
      localStorage.setItem(getUserStorageKey('chat_enter_to_send', currentUserIdRef.current), val ? 'true' : 'false');
    } catch {
      // Ignore
    }
  }, []);

  const setStreamingResponses = useCallback((val: boolean) => {
    setStreamingResponsesState(val);
    try {
      localStorage.setItem('aestific_chat_streaming_responses', val ? 'true' : 'false');
      localStorage.setItem(getUserStorageKey('chat_streaming_responses', currentUserIdRef.current), val ? 'true' : 'false');
    } catch {
      // Ignore
    }
  }, []);

  const setAutoScroll = useCallback((val: boolean) => {
    setAutoScrollState(val);
    try {
      localStorage.setItem('aestific_chat_auto_scroll', val ? 'true' : 'false');
      localStorage.setItem(getUserChatStorageKey_AutoScroll(currentUserIdRef.current), val ? 'true' : 'false');
    } catch {
      // Ignore
    }
  }, []);

  const setShowTimestamps = useCallback((val: boolean) => {
    setShowTimestampsState(val);
    try {
      localStorage.setItem('aestific_chat_show_timestamps', val ? 'true' : 'false');
      localStorage.setItem(getUserStorageKey('chat_show_timestamps', currentUserIdRef.current), val ? 'true' : 'false');
    } catch {
      // Ignore
    }
  }, []);

  const setSaveChatHistory = useCallback((val: boolean) => {
    setSaveChatHistoryState(val);
    try {
      localStorage.setItem('aestific_chat_save_history', val ? 'true' : 'false');
      localStorage.setItem(getUserStorageKey('chat_save_history', currentUserIdRef.current), val ? 'true' : 'false');
    } catch {
      // Ignore
    }
  }, []);

  const setTemporaryChat = useCallback((val: boolean) => {
    setTemporaryChatState(val);
    try {
      localStorage.setItem('aestific_chat_temporary_chat', val ? 'true' : 'false');
      localStorage.setItem(getUserStorageKey('chat_temporary_chat', currentUserIdRef.current), val ? 'true' : 'false');
    } catch {
      // Ignore
    }
  }, []);

  return (
    <ChatSettingsContext.Provider
      value={{
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
        setUserId,
      }}
    >
      {children}
    </ChatSettingsContext.Provider>
  );
};

function getUserChatStorageKey_AutoScroll(userId?: string | null): string {
  return getUserStorageKey('chat_auto_scroll', userId);
}

export const useChatSettings = (): ChatSettingsContextType => {
  const context = useContext(ChatSettingsContext);
  if (!context) {
    throw new Error('useChatSettings must be used within a ChatSettingsProvider');
  }
  return context;
};
