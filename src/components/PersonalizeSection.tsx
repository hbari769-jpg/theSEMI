import React, { useState, useEffect, useRef } from 'react';
import {
  User as UserIcon,
  Smile,
  ShieldCheck,
  Globe,
  Zap,
  Briefcase,
  Users,
  RotateCcw,
  Check,
  AlertCircle,
  Code2,
  GraduationCap,
  Palette,
  Building2,
  Search,
  BookOpen,
  Video,
  Layers,
  HelpCircle,
  Loader2,
  FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  UserPersonalization,
  CallPreferenceType,
  TonePreferenceType,
  AddressStyleType,
  PersonalLanguageType,
  ResponseFeelType,
  OccupationType,
  WorkingRelationshipType,
} from '../types';
import { authFetch } from '../lib/api';

interface PersonalizeSectionProps {
  user: User;
  onUpdateProfile: (updates: Partial<User>) => Promise<void>;
  onUserUpdated?: (user: User) => void;
}

export const PersonalizeSection: React.FC<PersonalizeSectionProps> = ({
  user,
  onUpdateProfile,
  onUserUpdated,
}) => {
  const initial = user.personalization || {};

  // Form State
  const [callPreference, setCallPreference] = useState<CallPreferenceType>(initial.callPreference || 'No preference');
  const [customCallName, setCustomCallName] = useState<string>(initial.customCallName || '');
  const [tone, setTone] = useState<TonePreferenceType>(initial.tone || 'Friendly');
  const [addressStyle, setAddressStyle] = useState<AddressStyleType>(initial.addressStyle || 'Auto');
  const [preferredLanguage, setPreferredLanguage] = useState<PersonalLanguageType>(initial.preferredLanguage || 'Auto');
  const [responseFeel, setResponseFeel] = useState<ResponseFeelType>(initial.responseFeel || 'Balanced');
  const [occupation, setOccupation] = useState<OccupationType>(initial.occupation || 'Developer');
  const [customOccupation, setCustomOccupation] = useState<string>(initial.customOccupation || '');
  const [workContext, setWorkContext] = useState<string>(initial.workContext || '');
  const [workingRelationship, setWorkingRelationship] = useState<WorkingRelationshipType>(initial.workingRelationship || 'Assistant');
  const [customInstructions, setCustomInstructions] = useState<string>(initial.customInstructions || '');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestPayloadRef = useRef<UserPersonalization | null>(null);

  // Sync state if user prop changes externally
  useEffect(() => {
    const p = user.personalization || {};
    setCallPreference(p.callPreference || 'No preference');
    setCustomCallName(p.customCallName || '');
    setTone(p.tone || 'Friendly');
    setAddressStyle(p.addressStyle || 'Auto');
    setPreferredLanguage(p.preferredLanguage || 'Auto');
    setResponseFeel(p.responseFeel || 'Balanced');
    setOccupation(p.occupation || 'Developer');
    setCustomOccupation(p.customOccupation || '');
    setWorkContext(p.workContext || '');
    setWorkingRelationship(p.workingRelationship || 'Assistant');
    setCustomInstructions(p.customInstructions || '');
  }, [user.personalization]);

  // Central persistence handler (Auto-saves to /api/user/personalization)
  const persistChanges = async (payload: UserPersonalization) => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await authFetch('/api/user/personalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalization: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save personalization preferences.');

      // Update local state without altering other user properties
      if (data.user && onUserUpdated) {
        onUserUpdated(data.user);
      } else {
        onUpdateProfile({ personalization: payload });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save personalization.');
    } finally {
      setIsSaving(false);
    }
  };

  // Clean up timer on unmount and flush pending changes
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        if (latestPayloadRef.current) {
          persistChanges(latestPayloadRef.current);
        }
      }
    };
  }, []);

  // Immediate save for pill/option clicks
  const handleImmediateChange = (override: Partial<UserPersonalization>) => {
    const payload: UserPersonalization = {
      callPreference: override.callPreference !== undefined ? override.callPreference : callPreference,
      customCallName: customCallName.trim() || undefined,
      tone: override.tone !== undefined ? override.tone : tone,
      addressStyle: override.addressStyle !== undefined ? override.addressStyle : addressStyle,
      preferredLanguage: override.preferredLanguage !== undefined ? override.preferredLanguage : preferredLanguage,
      responseFeel: override.responseFeel !== undefined ? override.responseFeel : responseFeel,
      occupation: override.occupation !== undefined ? override.occupation : occupation,
      customOccupation: (override.occupation || occupation) === 'Other' ? (customOccupation.trim() || undefined) : undefined,
      workContext: workContext.trim() || undefined,
      workingRelationship: override.workingRelationship !== undefined ? override.workingRelationship : workingRelationship,
      customInstructions: customInstructions.trim() || undefined,
    };
    latestPayloadRef.current = payload;
    persistChanges(payload);
  };

  // Debounced save for text inputs
  const handleDebouncedTextChange = (field: 'customCallName' | 'customOccupation' | 'workContext' | 'customInstructions', val: string) => {
    const payload: UserPersonalization = {
      callPreference,
      customCallName: field === 'customCallName' ? (val.trim() || undefined) : (customCallName.trim() || undefined),
      tone,
      addressStyle,
      preferredLanguage,
      responseFeel,
      occupation,
      customOccupation: field === 'customOccupation' ? (val.trim() || undefined) : (occupation === 'Other' ? (customOccupation.trim() || undefined) : undefined),
      workContext: field === 'workContext' ? (val.trim() || undefined) : (workContext.trim() || undefined),
      workingRelationship,
      customInstructions: field === 'customInstructions' ? (val.trim() || undefined) : (customInstructions.trim() || undefined),
    };
    latestPayloadRef.current = payload;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      persistChanges(payload);
    }, 500);
  };

  // Flush text changes on input blur
  const handleInputBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      if (latestPayloadRef.current) {
        persistChanges(latestPayloadRef.current);
      }
    }
  };

  // Reset handler
  const handleReset = async () => {
    setIsResetting(true);
    setErrorMessage(null);
    try {
      const res = await authFetch('/api/user/personalization/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset personalization');

      if (data.user && onUserUpdated) {
        onUserUpdated(data.user);
      } else {
        await onUpdateProfile({
          personalization: null as any,
        });
      }

      // Reset local state to defaults
      setCallPreference('No preference');
      setCustomCallName('');
      setTone('Friendly');
      setAddressStyle('Auto');
      setPreferredLanguage('Auto');
      setResponseFeel('Balanced');
      setOccupation('Developer');
      setCustomOccupation('');
      setWorkContext('');
      setWorkingRelationship('Assistant');
      setCustomInstructions('');
      setShowResetConfirm(false);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset personalization settings.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6 text-zinc-900 dark:text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-200 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Personalize Aestific
            </h4>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:text-white">
              AI Preferences
            </span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Tailor how Aestific addresses you, talks to you, and structures answers across all models.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. What should Aestific call you? */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h5 className="text-xs font-semibold text-zinc-900 dark:text-white">
            1. What should Aestific call you?
          </h5>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Select how you prefer to be addressed during conversations.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['Name', 'Nickname', 'Username', 'No preference'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setCallPreference(opt);
                handleImmediateChange({ callPreference: opt });
              }}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer text-center ${
                callPreference === opt
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-xs'
                  : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {callPreference !== 'No preference' && (
          <div className="pt-1">
            <input
              type="text"
              value={customCallName}
              onChange={(e) => {
                setCustomCallName(e.target.value);
                handleDebouncedTextChange('customCallName', e.target.value);
              }}
              onBlur={handleInputBlur}
              placeholder={callPreference === 'Nickname' ? 'Enter your nickname...' : `Enter your preferred ${callPreference.toLowerCase()}...`}
              maxLength={80}
              className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-black/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:border-zinc-400 dark:focus:border-white/30 transition-colors"
            />
          </div>
        )}
      </div>

      {/* 2. How should Aestific talk to you? (Tone) */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Smile className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h5 className="text-xs font-semibold text-zinc-900 dark:text-white">
            2. How should Aestific talk to you?
          </h5>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Choose the default tone and attitude for responses.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { id: 'Friendly' as const, label: 'Friendly', desc: 'Warm & conversational' },
            { id: 'Professional' as const, label: 'Professional', desc: 'Polished & objective' },
            { id: 'Direct' as const, label: 'Direct', desc: 'Concise & straight to the point' },
            { id: 'Casual' as const, label: 'Casual', desc: 'Relaxed & easygoing' },
            { id: 'Creative' as const, label: 'Creative', desc: 'Expressive & imaginative' },
            { id: 'Tutor' as const, label: 'Tutor', desc: 'Patient & educational' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTone(item.id);
                handleImmediateChange({ tone: item.id });
              }}
              className={`p-3 rounded-xl text-left transition-all cursor-pointer border flex flex-col justify-between ${
                tone === item.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-xs'
                  : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
              }`}
            >
              <div className="text-xs font-semibold">{item.label}</div>
              <div
                className={`text-[10px] mt-1 ${
                  tone === item.id
                    ? 'text-zinc-300 dark:text-zinc-700'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {item.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 3. How should Aestific address you? (Formality) */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h5 className="text-xs font-semibold text-zinc-900 dark:text-white">
            3. How should Aestific address you?
          </h5>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Set formality levels (e.g., respectful vs. friendly phrasing).
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'Formal' as const, label: 'Formal', desc: 'Respectful (আপনি)' },
            { id: 'Casual' as const, label: 'Casual', desc: 'Friendly (তুমি)' },
            { id: 'Very Casual' as const, label: 'Very Casual', desc: 'Informal' },
            { id: 'Auto' as const, label: 'Auto', desc: 'Context-based' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setAddressStyle(item.id);
                handleImmediateChange({ addressStyle: item.id });
              }}
              className={`p-3 rounded-xl text-left transition-all cursor-pointer border flex flex-col justify-between ${
                addressStyle === item.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-xs'
                  : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
              }`}
            >
              <div className="text-xs font-semibold">{item.label}</div>
              <div
                className={`text-[10px] mt-1 ${
                  addressStyle === item.id
                    ? 'text-zinc-300 dark:text-zinc-700'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {item.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Preferred Language */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h5 className="text-xs font-semibold text-zinc-900 dark:text-white">
            4. Preferred Language
          </h5>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Choose the language Aestific speaks with you.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'Auto' as const, label: 'Auto', desc: 'Matches your query' },
            { id: 'বাংলা' as const, label: 'বাংলা', desc: 'Natural Bengali' },
            { id: 'English' as const, label: 'English', desc: 'Standard English' },
            { id: 'বাংলা + English' as const, label: 'বাংলা + English', desc: 'Bilingual Banglish' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPreferredLanguage(item.id);
                handleImmediateChange({ preferredLanguage: item.id });
              }}
              className={`p-3 rounded-xl text-left transition-all cursor-pointer border flex flex-col justify-between ${
                preferredLanguage === item.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-xs'
                  : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
              }`}
            >
              <div className="text-xs font-semibold">{item.label}</div>
              <div
                className={`text-[10px] mt-1 ${
                  preferredLanguage === item.id
                    ? 'text-zinc-300 dark:text-zinc-700'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {item.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 5. How should answers feel? */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h5 className="text-xs font-semibold text-zinc-900 dark:text-white">
            5. How should answers feel?
          </h5>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Control the default depth and structure of generated explanations.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'Quick' as const, label: 'Quick', desc: 'Punchy & succinct' },
            { id: 'Balanced' as const, label: 'Balanced', desc: 'Optimal depth' },
            { id: 'Detailed' as const, label: 'Detailed', desc: 'Nuanced & complete' },
            { id: 'Deep Explanation' as const, label: 'Deep Explanation', desc: 'From first principles' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setResponseFeel(item.id);
                handleImmediateChange({ responseFeel: item.id });
              }}
              className={`p-3 rounded-xl text-left transition-all cursor-pointer border flex flex-col justify-between ${
                responseFeel === item.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-xs'
                  : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
              }`}
            >
              <div className="text-xs font-semibold">{item.label}</div>
              <div
                className={`text-[10px] mt-1 ${
                  responseFeel === item.id
                    ? 'text-zinc-300 dark:text-zinc-700'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {item.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 6. What do you do? */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h5 className="text-xs font-semibold text-zinc-900 dark:text-white">
            6. What do you do?
          </h5>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Aestific uses your field to provide relevant analogies and optimal technical depth.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { id: 'Student' as const, label: 'Student', icon: GraduationCap },
            { id: 'Developer' as const, label: 'Developer', icon: Code2 },
            { id: 'Designer' as const, label: 'Designer', icon: Palette },
            { id: 'Business Owner' as const, label: 'Business Owner', icon: Building2 },
            { id: 'Researcher' as const, label: 'Researcher', icon: Search },
            { id: 'Teacher' as const, label: 'Teacher', icon: BookOpen },
            { id: 'Content Creator' as const, label: 'Content Creator', icon: Video },
            { id: 'Freelancer' as const, label: 'Freelancer', icon: Layers },
            { id: 'Other' as const, label: 'Other', icon: HelpCircle },
          ].map((item) => {
            const IconComp = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setOccupation(item.id);
                  handleImmediateChange({ occupation: item.id });
                }}
                className={`p-2.5 rounded-xl text-left transition-all cursor-pointer border flex items-center gap-2.5 ${
                  occupation === item.id
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-xs'
                    : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
                }`}
              >
                <IconComp className="w-4 h-4 shrink-0" />
                <span className="text-xs font-semibold truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {occupation === 'Other' && (
          <div className="pt-1">
            <input
              type="text"
              value={customOccupation}
              onChange={(e) => {
                setCustomOccupation(e.target.value);
                handleDebouncedTextChange('customOccupation', e.target.value);
              }}
              onBlur={handleInputBlur}
              placeholder="Specify your role or domain (e.g. Doctor, Architect, Accountant)..."
              maxLength={100}
              className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-black/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:border-zinc-400 dark:focus:border-white/30 transition-colors"
            />
          </div>
        )}

        <div className="pt-1">
          <input
            type="text"
            value={workContext}
            onChange={(e) => {
              setWorkContext(e.target.value);
              handleDebouncedTextChange('workContext', e.target.value);
            }}
            onBlur={handleInputBlur}
            placeholder="Studies or work details (e.g. Computer Science student, building SaaS apps)..."
            maxLength={300}
            className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-black/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:border-zinc-400 dark:focus:border-white/30 transition-colors"
          />
        </div>
      </div>

      {/* 7. How should Aestific work with you? */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h5 className="text-xs font-semibold text-zinc-900 dark:text-white">
            7. How should Aestific work with you?
          </h5>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Define the working dynamic between you and Aestific.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { id: 'Assistant' as const, label: 'Assistant', desc: 'Organized & highly capable' },
            { id: 'Friend' as const, label: 'Friend', desc: 'Warmer & conversational' },
            { id: 'Study Partner' as const, label: 'Study Partner', desc: 'Tests & learns together' },
            { id: 'Creative Partner' as const, label: 'Creative Partner', desc: 'Brainstorms ideas' },
            { id: 'Work Partner' as const, label: 'Work Partner', desc: 'Collaborates on tasks' },
            { id: 'Technical Partner' as const, label: 'Technical Partner', desc: 'Senior engineering co-pilot' },
            { id: 'Coach' as const, label: 'Coach', desc: 'Constructive feedback & guidance' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setWorkingRelationship(item.id);
                handleImmediateChange({ workingRelationship: item.id });
              }}
              className={`p-3 rounded-xl text-left transition-all cursor-pointer border flex flex-col justify-between ${
                workingRelationship === item.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-xs'
                  : 'bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
              }`}
            >
              <div className="text-xs font-semibold">{item.label}</div>
              <div
                className={`text-[10px] mt-1 line-clamp-1 ${
                  workingRelationship === item.id
                    ? 'text-zinc-300 dark:text-zinc-700'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {item.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 8. Custom Instructions */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h5 className="text-xs font-semibold text-zinc-900 dark:text-white">
            8. Custom Instructions
          </h5>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          What else should Aestific know about you or how it should respond?
        </p>

        <div>
          <textarea
            value={customInstructions}
            onChange={(e) => {
              const val = e.target.value;
              setCustomInstructions(val);
              handleDebouncedTextChange('customInstructions', val);
            }}
            onBlur={handleInputBlur}
            rows={3}
            placeholder="E.g. Always provide practical examples, keep answers concise, prefer TypeScript over JavaScript, be encouraging..."
            maxLength={2000}
            className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-black/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:border-zinc-400 dark:focus:border-white/30 transition-colors resize-y"
          />
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 text-right mt-1">
            {customInstructions.length}/2000
          </div>
        </div>
      </div>

      {/* Footer Info & Auto-save Status (No Save Button) */}
      <div className="pt-3 pb-1 border-t border-zinc-200 dark:border-white/10 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          Preferences apply naturally across all models.
        </div>

        <div className="flex items-center gap-2">
          {isSaving ? (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              <span>Saving...</span>
            </span>
          ) : saveSuccess ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <Check className="w-3.5 h-3.5" />
              <span>Auto-saved</span>
            </span>
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Auto-saved
            </span>
          )}
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    Reset Personalization?
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    This will restore personalization options to their defaults.
                  </p>
                </div>
              </div>

              <p className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/60 p-3 rounded-xl border border-zinc-200 dark:border-white/10">
                Your chat history, memories, uploaded files, and account credentials will remain completely untouched.
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  disabled={isResetting}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isResetting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isResetting ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  <span>{isResetting ? 'Resetting...' : 'Reset Now'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
