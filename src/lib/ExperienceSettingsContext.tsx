import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { playUiSound, SoundCue } from './sound';

export type ResponseAnimationSetting = 'smooth' | 'instant';
export type GenerationEffectsSetting = 'full' | 'minimal' | 'off';
export type SoundEffectsSetting = 'on' | 'off';

export interface ExperienceSettingsContextType {
  responseAnimation: ResponseAnimationSetting;
  setResponseAnimation: (val: ResponseAnimationSetting) => void;
  generationEffects: GenerationEffectsSetting;
  setGenerationEffects: (val: GenerationEffectsSetting) => void;
  soundEffects: SoundEffectsSetting;
  setSoundEffects: (val: SoundEffectsSetting) => void;
  playUiSound: (cue: SoundCue) => void;
  setUserId: (userId: string | null | undefined) => void;
}

const ExperienceSettingsContext = createContext<ExperienceSettingsContextType | undefined>(undefined);

function getUserStorageKey(key: string, userId?: string | null): string {
  if (userId && userId.trim()) {
    return `aestific_${userId.trim()}_${key}`;
  }
  return `aestific_${key}`;
}

export const ExperienceSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUserIdRef = useRef<string | null>(null);

  // 1. Response Animation (default: 'smooth')
  const [responseAnimation, setResponseAnimationState] = useState<ResponseAnimationSetting>(() => {
    try {
      const saved = localStorage.getItem('aestific_experience_response_animation');
      if (saved === 'instant' || saved === 'smooth') return saved;
    } catch {}
    return 'smooth';
  });

  // 2. Generation Effects (default: 'full')
  const [generationEffects, setGenerationEffectsState] = useState<GenerationEffectsSetting>(() => {
    try {
      const saved = localStorage.getItem('aestific_experience_generation_effects');
      if (saved === 'full' || saved === 'minimal' || saved === 'off') return saved;
    } catch {}
    return 'full';
  });

  // 3. Sound Effects (default: 'off')
  const [soundEffects, setSoundEffectsState] = useState<SoundEffectsSetting>(() => {
    try {
      const saved = localStorage.getItem('aestific_experience_sound_effects');
      if (saved === 'on' || saved === 'off') return saved;
    } catch {}
    return 'off';
  });

  // User isolation & persistence
  const setUserId = useCallback((userId: string | null | undefined) => {
    const cleanId = userId?.trim() || null;
    currentUserIdRef.current = cleanId;
    if (!cleanId) return;

    try {
      const userResp = localStorage.getItem(getUserStorageKey('experience_response_animation', cleanId));
      if (userResp === 'instant' || userResp === 'smooth') {
        setResponseAnimationState(userResp);
      }

      const userGen = localStorage.getItem(getUserStorageKey('experience_generation_effects', cleanId));
      if (userGen === 'full' || userGen === 'minimal' || userGen === 'off') {
        setGenerationEffectsState(userGen);
      }

      const userSound = localStorage.getItem(getUserStorageKey('experience_sound_effects', cleanId));
      if (userSound === 'on' || userSound === 'off') {
        setSoundEffectsState(userSound);
      }
    } catch {}
  }, []);

  const setResponseAnimation = useCallback((val: ResponseAnimationSetting) => {
    setResponseAnimationState(val);
    try {
      localStorage.setItem('aestific_experience_response_animation', val);
      localStorage.setItem(getUserStorageKey('experience_response_animation', currentUserIdRef.current), val);
    } catch {}
  }, []);

  const setGenerationEffects = useCallback((val: GenerationEffectsSetting) => {
    setGenerationEffectsState(val);
    try {
      localStorage.setItem('aestific_experience_generation_effects', val);
      localStorage.setItem(getUserStorageKey('experience_generation_effects', currentUserIdRef.current), val);
    } catch {}
  }, []);

  const setSoundEffects = useCallback((val: SoundEffectsSetting) => {
    setSoundEffectsState(val);
    try {
      localStorage.setItem('aestific_experience_sound_effects', val);
      localStorage.setItem(getUserStorageKey('experience_sound_effects', currentUserIdRef.current), val);
    } catch {}
  }, []);

  const handlePlaySound = useCallback((cue: SoundCue) => {
    playUiSound(cue, soundEffects === 'on');
  }, [soundEffects]);

  return (
    <ExperienceSettingsContext.Provider
      value={{
        responseAnimation,
        setResponseAnimation,
        generationEffects,
        setGenerationEffects,
        soundEffects,
        setSoundEffects,
        playUiSound: handlePlaySound,
        setUserId,
      }}
    >
      {children}
    </ExperienceSettingsContext.Provider>
  );
};

export const useExperienceSettings = (): ExperienceSettingsContextType => {
  const context = useContext(ExperienceSettingsContext);
  if (!context) {
    throw new Error('useExperienceSettings must be used within an ExperienceSettingsProvider');
  }
  return context;
};
