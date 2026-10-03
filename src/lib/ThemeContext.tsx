import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type ThemeMode = 'dark' | 'light';
export type ThemeVariant = 'obsidian' | 'cyan' | 'aurora-light';

interface ThemeContextType {
  themeSetting: ThemeSetting;
  theme: ThemeMode;
  themeVariant: ThemeVariant;
  setThemeSetting: (setting: ThemeSetting) => void;
  setTheme: (theme: ThemeMode) => void;
  setThemeVariant: (variant: ThemeVariant) => void;
  toggleTheme: () => void;
  isDark: boolean;
  reduceMotion: boolean;
  setReduceMotion: (reduce: boolean) => void;
  setUserId: (userId: string | null | undefined) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function getUserStorageKey(key: string, userId?: string | null): string {
  if (userId && userId.trim()) {
    return `aestific_${userId.trim()}_${key}`;
  }
  return `aestific_${key}`;
}

function applyThemeToDOM(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;

  if (mode === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
    body.classList.remove('dark');
    body.classList.add('light');
    body.style.backgroundColor = '#ffffff';
    body.style.color = '#09090b';
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
    body.classList.remove('light');
    body.classList.add('dark');
    body.style.backgroundColor = '#000000';
    body.style.color = '#ffffff';
  }
}

function applyReduceMotionToDOM(reduce: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (reduce) {
    root.classList.add('reduce-motion');
    root.setAttribute('data-reduce-motion', 'true');
  } else {
    root.classList.remove('reduce-motion');
    root.setAttribute('data-reduce-motion', 'false');
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUserIdRef = useRef<string | null>(null);

  // Initialize theme setting from localStorage
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>(() => {
    try {
      const saved = localStorage.getItem('aestific_theme_setting');
      if (saved === 'system' || saved === 'light' || saved === 'dark') {
        return saved;
      }
      const isExplicit = localStorage.getItem('aestific_theme_explicit') === 'true';
      if (isExplicit) {
        const legacyTheme = localStorage.getItem('aestific_theme');
        if (legacyTheme === 'light' || legacyTheme === 'dark') {
          return legacyTheme;
        }
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
    return 'system';
  });

  // Effective resolved theme mode ('light' | 'dark')
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (themeSetting === 'system') {
      return getSystemTheme();
    }
    return themeSetting;
  });

  const [themeVariant, setThemeVariantState] = useState<ThemeVariant>(() => {
    try {
      const saved = localStorage.getItem('aestific_theme_variant');
      if (saved === 'obsidian' || saved === 'cyan' || saved === 'aurora-light') return saved as ThemeVariant;
    } catch {
      // Ignore storage errors
    }
    return 'aurora-light';
  });

  // Initialize reduce motion setting
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aestific_reduce_motion');
      if (saved !== null) {
        return saved === 'true';
      }
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
    } catch {
      // Ignore storage errors
    }
    return false;
  });

  // Apply theme immediately to DOM on mount and changes
  useEffect(() => {
    const resolved = themeSetting === 'system' ? getSystemTheme() : themeSetting;
    setThemeState(resolved);
    applyThemeToDOM(resolved);
    try {
      localStorage.setItem('aestific_theme', resolved);
    } catch {
      // Ignore storage errors
    }
  }, [themeSetting]);

  // Listen to system theme preference changes when themeSetting is 'system'
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (themeSetting === 'system') {
        const newResolved: ThemeMode = e.matches ? 'dark' : 'light';
        setThemeState(newResolved);
        applyThemeToDOM(newResolved);
        try {
          localStorage.setItem('aestific_theme', newResolved);
        } catch {
          // Ignore
        }
      }
    };

    try {
      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    } catch {
      mediaQuery.addListener(handleSystemChange);
      return () => mediaQuery.removeListener(handleSystemChange);
    }
  }, [themeSetting]);

  // Apply reduce motion immediately to DOM on mount and changes
  useEffect(() => {
    applyReduceMotionToDOM(reduceMotion);
  }, [reduceMotion]);

  // Variant sync
  useEffect(() => {
    try {
      localStorage.setItem('aestific_theme_variant', themeVariant);
    } catch {
      // Ignore
    }
    document.documentElement.setAttribute('data-theme-variant', themeVariant);
  }, [themeVariant]);

  // Switch or restore per-user settings when user logs in or changes
  const setUserId = useCallback((userId: string | null | undefined) => {
    const cleanId = userId?.trim() || null;
    currentUserIdRef.current = cleanId;

    if (!cleanId) return;

    try {
      // Restore user-specific Theme Setting
      const userThemeSetting = localStorage.getItem(getUserStorageKey('theme_setting', cleanId));
      if (userThemeSetting === 'system' || userThemeSetting === 'light' || userThemeSetting === 'dark') {
        setThemeSettingState(userThemeSetting as ThemeSetting);
        const resolved = userThemeSetting === 'system' ? getSystemTheme() : (userThemeSetting as ThemeMode);
        setThemeState(resolved);
        applyThemeToDOM(resolved);
      }

      // Restore user-specific Reduce Motion
      const userReduceMotion = localStorage.getItem(getUserStorageKey('reduce_motion', cleanId));
      if (userReduceMotion !== null) {
        const enabled = userReduceMotion === 'true';
        setReduceMotionState(enabled);
        applyReduceMotionToDOM(enabled);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setThemeSetting = useCallback((setting: ThemeSetting) => {
    setThemeSettingState(setting);
    const resolved = setting === 'system' ? getSystemTheme() : setting;
    setThemeState(resolved);
    applyThemeToDOM(resolved);

    if (resolved === 'light') {
      setThemeVariantState('aurora-light');
    } else if (themeVariant === 'aurora-light') {
      setThemeVariantState('obsidian');
    }

    try {
      localStorage.setItem('aestific_theme_explicit', 'true');
      localStorage.setItem('aestific_theme_setting', setting);
      localStorage.setItem('aestific_theme', resolved);
      localStorage.setItem(getUserStorageKey('theme_setting', currentUserIdRef.current), setting);
    } catch {
      // Ignore
    }
  }, [themeVariant]);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeSetting(newTheme);
  }, [setThemeSetting]);

  const setThemeVariant = useCallback((variant: ThemeVariant) => {
    setThemeVariantState(variant);
    if (variant === 'aurora-light') {
      setThemeSetting('light');
    } else {
      setThemeSetting('dark');
    }
  }, [setThemeSetting]);

  const toggleTheme = useCallback(() => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setThemeSetting(nextTheme);
  }, [theme, setThemeSetting]);

  const setReduceMotion = useCallback((enabled: boolean) => {
    setReduceMotionState(enabled);
    applyReduceMotionToDOM(enabled);

    try {
      localStorage.setItem('aestific_reduce_motion', enabled ? 'true' : 'false');
      localStorage.setItem(getUserStorageKey('reduce_motion', currentUserIdRef.current), enabled ? 'true' : 'false');
    } catch {
      // Ignore
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        themeSetting,
        theme,
        themeVariant,
        setThemeSetting,
        setTheme,
        setThemeVariant,
        toggleTheme,
        isDark: theme === 'dark',
        reduceMotion,
        setReduceMotion,
        setUserId,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
