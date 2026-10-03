import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { InterfaceLanguage, ResponseLanguage, Translations, translations } from './translations';

export interface LanguageContextType {
  interfaceLanguage: InterfaceLanguage;
  setInterfaceLanguage: (lang: InterfaceLanguage) => void;
  responseLanguage: ResponseLanguage;
  setResponseLanguage: (lang: ResponseLanguage) => void;
  t: (key: keyof Translations) => string;
  setUserId: (userId: string | null | undefined) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function getUserStorageKey(key: string, userId?: string | null): string {
  if (userId && userId.trim()) {
    return `aestific_${userId.trim()}_${key}`;
  }
  return `aestific_${key}`;
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUserIdRef = useRef<string | null>(null);

  // 1. Interface Language (default: 'en')
  const [interfaceLanguage, setInterfaceLanguageState] = useState<InterfaceLanguage>(() => {
    try {
      const saved = localStorage.getItem('aestific_interface_lang');
      if (saved === 'en' || saved === 'bn') return saved;
    } catch {
      // Ignore
    }
    return 'en';
  });

  // 2. Response Language (default: 'Auto')
  const [responseLanguage, setResponseLanguageState] = useState<ResponseLanguage>(() => {
    try {
      const saved = localStorage.getItem('aestific_response_lang');
      if (saved === 'Auto' || saved === 'English' || saved === 'বাংলা') return saved as ResponseLanguage;
    } catch {
      // Ignore
    }
    return 'Auto';
  });

  // User isolation & persistence
  const setUserId = useCallback((userId: string | null | undefined) => {
    const cleanId = userId?.trim() || null;
    currentUserIdRef.current = cleanId;

    if (!cleanId) return;

    try {
      const userInterfaceLang = localStorage.getItem(getUserStorageKey('interface_lang', cleanId));
      if (userInterfaceLang === 'en' || userInterfaceLang === 'bn') {
        setInterfaceLanguageState(userInterfaceLang);
      }

      const userResponseLang = localStorage.getItem(getUserStorageKey('response_lang', cleanId));
      if (userResponseLang === 'Auto' || userResponseLang === 'English' || userResponseLang === 'বাংলা') {
        setResponseLanguageState(userResponseLang as ResponseLanguage);
      }
    } catch {
      // Ignore
    }
  }, []);

  const setInterfaceLanguage = useCallback((lang: InterfaceLanguage) => {
    setInterfaceLanguageState(lang);
    try {
      localStorage.setItem('aestific_interface_lang', lang);
      if (currentUserIdRef.current) {
        localStorage.setItem(getUserStorageKey('interface_lang', currentUserIdRef.current), lang);
      }
    } catch {
      // Ignore
    }
  }, []);

  const setResponseLanguage = useCallback((lang: ResponseLanguage) => {
    setResponseLanguageState(lang);
    try {
      localStorage.setItem('aestific_response_lang', lang);
      if (currentUserIdRef.current) {
        localStorage.setItem(getUserStorageKey('response_lang', currentUserIdRef.current), lang);
      }
    } catch {
      // Ignore
    }
  }, []);

  const t = useCallback((key: keyof Translations): string => {
    const dict = translations[interfaceLanguage] || translations.en;
    return dict[key] || translations.en[key] || String(key);
  }, [interfaceLanguage]);

  return (
    <LanguageContext.Provider
      value={{
        interfaceLanguage,
        setInterfaceLanguage,
        responseLanguage,
        setResponseLanguage,
        t,
        setUserId,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
