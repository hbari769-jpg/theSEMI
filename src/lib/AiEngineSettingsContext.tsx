import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

export type EngineSetting = 'auto' | 'fast' | 'deep';
export type IntelligenceSetting = 'balanced' | 'precise' | 'creative';
export type ContextSetting = 'on' | 'off';
export type ResponseLengthSetting = 'auto' | 'short' | 'medium' | 'detailed';

export interface AiEngineSettingsContextType {
  engine: EngineSetting;
  setEngine: (val: EngineSetting) => void;
  intelligence: IntelligenceSetting;
  setIntelligence: (val: IntelligenceSetting) => void;
  context: ContextSetting;
  setContext: (val: ContextSetting) => void;
  responseLength: ResponseLengthSetting;
  setResponseLength: (val: ResponseLengthSetting) => void;
  setUserId: (userId: string | null | undefined) => void;
}

const AiEngineSettingsContext = createContext<AiEngineSettingsContextType | undefined>(undefined);

function getUserStorageKey(key: string, userId?: string | null): string {
  if (userId && userId.trim()) {
    return `aestific_${userId.trim()}_${key}`;
  }
  return `aestific_${key}`;
}

export const AiEngineSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUserIdRef = useRef<string | null>(null);

  // 1. Engine (default: 'auto' -> Aestific Auto)
  const [engine, setEngineState] = useState<EngineSetting>(() => {
    try {
      const saved = localStorage.getItem('aestific_ai_engine');
      if (saved === 'auto' || saved === 'fast' || saved === 'deep') return saved;
    } catch {}
    return 'auto';
  });

  // 2. Intelligence (default: 'balanced' -> Balanced)
  const [intelligence, setIntelligenceState] = useState<IntelligenceSetting>(() => {
    try {
      const saved = localStorage.getItem('aestific_ai_intelligence');
      if (saved === 'balanced' || saved === 'precise' || saved === 'creative') return saved;
    } catch {}
    return 'balanced';
  });

  // 3. Context (default: 'on' -> On)
  const [context, setContextState] = useState<ContextSetting>(() => {
    try {
      const saved = localStorage.getItem('aestific_ai_context');
      if (saved === 'on' || saved === 'off') return saved;
    } catch {}
    return 'on';
  });

  // 4. Response Length (default: 'auto' -> Auto)
  const [responseLength, setResponseLengthState] = useState<ResponseLengthSetting>(() => {
    try {
      const saved = localStorage.getItem('aestific_ai_response_length');
      if (saved === 'auto' || saved === 'short' || saved === 'medium' || saved === 'detailed') return saved;
    } catch {}
    return 'auto';
  });

  // User isolation & persistence
  const setUserId = useCallback((userId: string | null | undefined) => {
    const cleanId = userId?.trim() || null;
    currentUserIdRef.current = cleanId;

    if (!cleanId) {
      // Reset to defaults on signout
      setEngineState('auto');
      setIntelligenceState('balanced');
      setContextState('on');
      setResponseLengthState('auto');
      return;
    }

    try {
      const userEngine = localStorage.getItem(getUserStorageKey('ai_engine', cleanId));
      if (userEngine === 'auto' || userEngine === 'fast' || userEngine === 'deep') {
        setEngineState(userEngine);
      } else {
        setEngineState('auto');
      }

      const userIntelligence = localStorage.getItem(getUserStorageKey('ai_intelligence', cleanId));
      if (userIntelligence === 'balanced' || userIntelligence === 'precise' || userIntelligence === 'creative') {
        setIntelligenceState(userIntelligence);
      } else {
        setIntelligenceState('balanced');
      }

      const userContext = localStorage.getItem(getUserStorageKey('ai_context', cleanId));
      if (userContext === 'on' || userContext === 'off') {
        setContextState(userContext);
      } else {
        setContextState('on');
      }

      const userLength = localStorage.getItem(getUserStorageKey('ai_response_length', cleanId));
      if (userLength === 'auto' || userLength === 'short' || userLength === 'medium' || userLength === 'detailed') {
        setResponseLengthState(userLength);
      } else {
        setResponseLengthState('auto');
      }
    } catch {}
  }, []);

  const setEngine = useCallback((val: EngineSetting) => {
    setEngineState(val);
    try {
      localStorage.setItem('aestific_ai_engine', val);
      localStorage.setItem(getUserStorageKey('ai_engine', currentUserIdRef.current), val);
    } catch {}
  }, []);

  const setIntelligence = useCallback((val: IntelligenceSetting) => {
    setIntelligenceState(val);
    try {
      localStorage.setItem('aestific_ai_intelligence', val);
      localStorage.setItem(getUserStorageKey('ai_intelligence', currentUserIdRef.current), val);
    } catch {}
  }, []);

  const setContext = useCallback((val: ContextSetting) => {
    setContextState(val);
    try {
      localStorage.setItem('aestific_ai_context', val);
      localStorage.setItem(getUserStorageKey('ai_context', currentUserIdRef.current), val);
    } catch {}
  }, []);

  const setResponseLength = useCallback((val: ResponseLengthSetting) => {
    setResponseLengthState(val);
    try {
      localStorage.setItem('aestific_ai_response_length', val);
      localStorage.setItem(getUserStorageKey('ai_response_length', currentUserIdRef.current), val);
    } catch {}
  }, []);

  return (
    <AiEngineSettingsContext.Provider
      value={{
        engine,
        setEngine,
        intelligence,
        setIntelligence,
        context,
        setContext,
        responseLength,
        setResponseLength,
        setUserId,
      }}
    >
      {children}
    </AiEngineSettingsContext.Provider>
  );
};

export const useAiEngineSettings = (): AiEngineSettingsContextType => {
  const ctx = useContext(AiEngineSettingsContext);
  if (!ctx) {
    throw new Error('useAiEngineSettings must be used within an AiEngineSettingsProvider');
  }
  return ctx;
};
