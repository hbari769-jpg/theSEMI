import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Shield,
  Scale,
  Sparkles,
  Info,
  AlertTriangle,
  Lock,
  Ban,
  Code2,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Maximize2,
  BookOpen,
} from 'lucide-react';
import {
  DocTab,
  EditableDocumentItem,
  DEFAULT_EDITABLE_DOCUMENTS,
  getCachedEditableDocuments,
  saveCachedEditableDocuments,
} from '../lib/defaultDocuments';

export type { DocTab };

export interface DocItemConfig {
  id: DocTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tag: string;
}

export const DOC_ITEMS: DocItemConfig[] = [
  {
    id: 'about',
    label: 'About Aestific',
    description: 'Intelligence, reimagined. Overview, architecture principles, and creator information.',
    icon: Info,
    tag: 'Overview',
  },
  {
    id: 'privacy',
    label: 'Privacy Policy',
    description: 'Transparent overview of user information, AI processing, cloud storage, and retention.',
    icon: Shield,
    tag: 'Privacy',
  },
  {
    id: 'terms',
    label: 'Terms of Service',
    description: 'User agreement, account responsibilities, service availability, and legal terms.',
    icon: Scale,
    tag: 'Terms',
  },
  {
    id: 'safety',
    label: 'AI Safety and Limitations',
    description: 'Understanding model probabilistic nature, verification guidelines, and safety filters.',
    icon: AlertTriangle,
    tag: 'Safety',
  },
  {
    id: 'data_security',
    label: 'Data and Security',
    description: 'Strict multi-tenant isolation, cryptographic bcrypt hashing, and secure storage.',
    icon: Lock,
    tag: 'Security',
  },
  {
    id: 'acceptable_use',
    label: 'Acceptable Use Policy',
    description: 'Mandatory rules, strictly prohibited activities, abuse prevention, and enforcement.',
    icon: Ban,
    tag: 'Conduct',
  },
  {
    id: 'licenses',
    label: 'Open Source Licenses',
    description: 'Official attribution and license disclosures for third-party libraries used in Aestific.',
    icon: Code2,
    tag: 'Licenses',
  },
];

export interface DocumentsViewProps {
  initialDoc?: DocTab | null;
  currentDoc?: DocTab | null;
  onDocChange?: (doc: DocTab | null) => void;
  showHeader?: boolean;
  onOpenFullScreen?: (doc: DocTab) => void;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  initialDoc = null,
  currentDoc: controlledDoc,
  onDocChange,
  showHeader = true,
  onOpenFullScreen,
}) => {
  const [internalDoc, setInternalDoc] = useState<DocTab | null>(initialDoc);
  const [editableDocs, setEditableDocs] = useState<Record<DocTab, EditableDocumentItem>>(() =>
    getCachedEditableDocuments()
  );
  const currentDoc = controlledDoc !== undefined ? controlledDoc : internalDoc;

  useEffect(() => {
    if (controlledDoc !== undefined) {
      setInternalDoc(controlledDoc);
    }
  }, [controlledDoc]);

  useEffect(() => {
    let mounted = true;
    const syncDocuments = async () => {
      try {
        const res = await fetch('/api/documents');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data?.documents && typeof data.documents === 'object') {
            const merged = { ...DEFAULT_EDITABLE_DOCUMENTS };
            for (const key of Object.keys(DEFAULT_EDITABLE_DOCUMENTS) as DocTab[]) {
              if (data.documents[key]) {
                merged[key] = {
                  ...DEFAULT_EDITABLE_DOCUMENTS[key],
                  ...data.documents[key],
                };
              }
            }
            setEditableDocs(merged);
            saveCachedEditableDocuments(merged);
          }
        }
      } catch {
        // Fallback to cached/default documents
      }
    };

    syncDocuments();

    const handleLocalUpdate = () => {
      if (mounted) {
        setEditableDocs(getCachedEditableDocuments());
      }
    };
    window.addEventListener('aestific-documents-updated', handleLocalUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('aestific-documents-updated', handleLocalUpdate);
    };
  }, []);

  const handleSelectDoc = (tab: DocTab | null) => {
    setInternalDoc(tab);
    if (onDocChange) {
      onDocChange(tab);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 font-sans">
      {/* CASE 1: NO DOCUMENT SELECTED -> DISPLAY ONLY THE 7 BUTTONS VERTICALLY */}
      {currentDoc === null ? (
        <div className="space-y-5 max-w-2xl mx-auto py-1">
          {showHeader && (
            <div className="text-center space-y-2 pb-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono tracking-wider uppercase bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300">
                <BookOpen className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                <span>Documents &amp; Policies</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Aestific Platform Documentation
              </h3>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
                Explore official platform architecture, safety standards, security specifications, and legal policies.
              </p>
            </div>
          )}

          {/* 7 Vertical Buttons ("khali ei buttongula niche niche ashbe") */}
          <div className="space-y-2.5">
            {DOC_ITEMS.map((item) => {
              const Icon = item.icon;
              const customDoc = editableDocs[item.id];
              const displayLabel = customDoc?.label || item.label;
              const displayTag = customDoc?.tag || item.tag;
              const displayDesc = customDoc?.description || item.description;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectDoc(item.id)}
                  className="w-full flex items-center justify-between p-4 sm:p-4.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-white/10 hover:border-zinc-400 dark:hover:border-white/30 hover:bg-zinc-50 dark:hover:bg-zinc-800/70 shadow-xs hover:shadow-md transition-all duration-150 group text-left cursor-pointer active:scale-[0.995]"
                >
                  <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200/80 dark:border-white/10 flex items-center justify-center text-zinc-800 dark:text-zinc-200 group-hover:bg-black group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-black transition-colors shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white group-hover:text-black dark:group-hover:text-white truncate">
                          {displayLabel}
                        </h4>
                        <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-white/5">
                          {displayTag}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                        {displayDesc}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors shrink-0 ml-3">
                    <span className="text-xs font-medium hidden sm:inline opacity-0 group-hover:opacity-100 transition-opacity">
                      Read
                    </span>
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* CASE 2: DOCUMENT SELECTED -> FULL SCREEN / COMPLETE DOCUMENT VIEW */
        <div className="space-y-4">
          {/* Top Bar with Back Button & Quick Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-zinc-200 dark:border-white/10">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectDoc(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors border border-zinc-300 dark:border-white/10 cursor-pointer"
                title="Back to all documents"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Documents</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {onOpenFullScreen && (
                <button
                  type="button"
                  onClick={() => onOpenFullScreen(currentDoc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-white/10 cursor-pointer"
                  title="Open in full screen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Full Screen</span>
                </button>
              )}
            </div>
          </div>

          {/* Sub-buttons Bar (Horizontal scroll with smooth pills) */}
          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200/80 dark:border-white/10 overflow-x-auto no-scrollbar">
            {DOC_ITEMS.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentDoc === tab.id;
              const customLabel = editableDocs[tab.id]?.label || tab.label;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectDoc(tab.id as DocTab)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200/60 dark:border-white/10 scale-[1.01]'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{customLabel}</span>
                </button>
              );
            })}
          </div>

          {/* DOCUMENT CONTENT CANVAS (OpenAI Sans / Clean Sans-Serif Typography) */}
          <div className="p-5 sm:p-7 rounded-2xl bg-zinc-50/80 dark:bg-zinc-950/70 border border-zinc-200 dark:border-white/10 shadow-sm text-zinc-900 dark:text-zinc-100">
            {currentDoc && editableDocs[currentDoc]?.isCustom ? (
              <article className="space-y-5 leading-relaxed text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13.5px] font-normal">
                <div className="pb-5 border-b border-zinc-200 dark:border-white/10 space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200/70 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 uppercase">
                    <Sparkles className="w-3 h-3 text-zinc-700 dark:text-zinc-300" />
                    <span>{editableDocs[currentDoc].tag || 'DOCUMENT'}</span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                    {editableDocs[currentDoc].heading || editableDocs[currentDoc].label}
                  </h1>
                  {editableDocs[currentDoc].subheading && (
                    <p className="text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      {editableDocs[currentDoc].subheading}
                    </p>
                  )}
                </div>
                <div className="markdown-content text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13.5px] leading-relaxed whitespace-pre-line">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {editableDocs[currentDoc].content || ''}
                  </ReactMarkdown>
                </div>
              </article>
            ) : (
              <>
        
        {/* ================= 1. ABOUT AESTIFIC ================= */}
        {currentDoc === 'about' && (
          <article className="space-y-6 leading-relaxed text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13px] font-normal">
            <div className="pb-5 border-b border-zinc-200 dark:border-white/10 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200/70 dark:bg-white/10 text-zinc-800 dark:text-zinc-200">
                <Sparkles className="w-3 h-3 text-zinc-700 dark:text-zinc-300" />
                <span>OVERVIEW</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                About Aestific
              </h1>
              <h2 className="text-sm sm:text-base font-semibold text-zinc-700 dark:text-zinc-300">
                Intelligence, Reimagined.
              </h2>
            </div>

            <p className="leading-relaxed font-normal">
              Aestific is an AI-powered platform designed to make advanced artificial intelligence feel simple, useful, and natural.
            </p>

            <p className="leading-relaxed font-normal">
              Instead of forcing users to think about which model or technology they need, Aestific is designed to understand the task and use the appropriate intelligence behind the scenes.
            </p>

            <p className="leading-relaxed font-normal">
              From everyday questions and deep reasoning to coding, research, image understanding, file analysis, creative work, and image generation, Aestific brings different forms of AI capability into one experience.
            </p>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Built for the way you work
              </h3>

              <p className="leading-relaxed font-normal">
                Aestific is designed around a simple idea:
              </p>

              <div className="p-4 sm:p-4.5 rounded-xl bg-white dark:bg-white/5 border-l-4 border-l-zinc-900 dark:border-l-white border-y border-r border-zinc-200/80 dark:border-white/10 shadow-xs my-3">
                <p className="font-semibold text-zinc-900 dark:text-white text-xs sm:text-sm leading-snug">
                  You should focus on what you want to accomplish — not on which AI model should do it.
                </p>
              </div>

              <p className="leading-relaxed font-normal">
                Its intelligent architecture can route different types of tasks through the appropriate AI capabilities while keeping the experience unified inside Aestific.
              </p>

              <p className="leading-relaxed font-normal">
                Aestific also supports personalization, allowing users to shape how Aestific communicates with them, including preferred language, tone, response style, and other personal instructions.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                More than a chatbot
              </h3>

              <p className="leading-relaxed font-normal">
                Aestific is built as a broader AI experience rather than simply a text box.
              </p>

              <p className="leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
                Depending on the features available in the product, users can use Aestific to:
              </p>

              <ul className="grid sm:grid-cols-2 gap-2 pt-1">
                {[
                  'Ask questions and explore ideas',
                  'Learn and understand difficult topics',
                  'Solve problems and reason through complex tasks',
                  'Write, rewrite, and improve content',
                  'Work with code and technical problems',
                  'Research information',
                  'Understand images and files',
                  'Generate images from natural-language requests',
                  'Personalize how Aestific communicates',
                  'Keep conversations organized in one place',
                ].map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/70 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                    <span className="text-xs text-zinc-800 dark:text-zinc-200 font-normal">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Built with a vision for accessible intelligence
              </h3>

              <p className="leading-relaxed font-normal">
                Aestific aims to make powerful AI accessible through a clean, understandable, and focused experience — without requiring users to understand the technical systems working behind the scenes.
              </p>

              <p className="leading-relaxed font-normal">
                The product will continue to evolve as new AI capabilities become available.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-white/10">
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 space-y-2.5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Made by Atif Al Wasi
                </h3>
                <p className="leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
                  Aestific is created and developed by <strong className="text-zinc-900 dark:text-white font-semibold">Atif Al Wasi</strong>, with the goal of building an AI experience that combines intelligence, creativity, and simplicity into one platform.
                </p>
                <div className="pt-2 flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-white">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Aestific — AI, reimagined.</span>
                </div>
              </div>
            </div>
          </article>
        )}

        {/* ================= 2. PRIVACY POLICY ================= */}
        {currentDoc === 'privacy' && (
          <article className="space-y-6 leading-relaxed text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13px] font-normal">
            <div className="pb-5 border-b border-zinc-200 dark:border-white/10 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200/70 dark:bg-white/10 text-zinc-800 dark:text-zinc-200">
                <Shield className="w-3 h-3 text-zinc-700 dark:text-zinc-300" />
                <span>LEGAL &amp; PRIVACY</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                Privacy Policy
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                <strong>Last Updated:</strong> 25th September 2026
              </p>
            </div>

            <p className="leading-relaxed font-normal">
              Aestific (&ldquo;Aestific&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) respects your privacy and is committed to handling your information responsibly.
            </p>

            <p className="leading-relaxed font-normal">
              This Privacy Policy explains what information may be processed when you use Aestific, why it may be processed, and the choices available to you.
            </p>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                1. Information You Provide
              </h3>
              <p className="leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
                Depending on how you use Aestific, you may provide information such as:
              </p>
              <ul className="grid sm:grid-cols-2 gap-2 pt-1">
                {[
                  'Account and authentication information',
                  'Your name or preferred name',
                  'Personalization preferences',
                  'Messages and conversations',
                  'Files, images, and other content you choose to upload',
                  'Prompts submitted for AI generation',
                  'Images generated through Aestific',
                  'Feedback, support requests, and other information you voluntarily provide',
                ].map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/70 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                    <span className="text-xs text-zinc-800 dark:text-zinc-200 font-normal">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs font-normal">
                You should avoid submitting highly sensitive personal information unless it is necessary for your use of the service.
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                2. Information Generated Through Your Use
              </h3>
              <p className="leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
                Aestific may process information associated with your use of the service, including:
              </p>
              <ul className="grid sm:grid-cols-2 gap-2 pt-1">
                {[
                  'Conversation history',
                  'AI-generated responses',
                  'Generated images',
                  'Uploaded files',
                  'Personalization settings',
                  'Account and security information',
                  'Technical information required to operate and protect the service',
                ].map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/70 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                    <span className="text-xs text-zinc-800 dark:text-zinc-200 font-normal">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                3. How We Use Information
              </h3>
              <p className="leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
                Information may be used to:
              </p>
              <ul className="grid sm:grid-cols-2 gap-2 pt-1">
                {[
                  'Provide and operate Aestific',
                  'Generate AI responses and images',
                  'Maintain conversation and account functionality',
                  'Apply your personalization preferences',
                  'Store and retrieve content you choose to save',
                  'Protect accounts and prevent abuse',
                  'Diagnose technical problems',
                  'Improve reliability and performance',
                  'Provide support',
                  'Comply with applicable legal obligations',
                ].map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/70 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                    <span className="text-xs text-zinc-800 dark:text-zinc-200 font-normal">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                4. AI Processing
              </h3>
              <p className="leading-relaxed font-normal">
                When you use AI features, your prompts and relevant content may be processed by the AI systems required to provide that feature.
              </p>
              <p className="leading-relaxed font-normal">
                For example, an image-generation request may require your image prompt to be sent to the configured image-generation service.
              </p>
              <div className="p-4 rounded-xl bg-white dark:bg-white/5 border border-zinc-200/80 dark:border-white/10 shadow-xs">
                <p className="text-xs text-zinc-700 dark:text-zinc-300 font-normal">
                  Aestific does not represent that AI-generated content is always accurate, complete, or appropriate for every purpose.
                </p>
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                5. Storage
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific uses cloud infrastructure to operate its application and store applicable application data.
              </p>
              <p className="leading-relaxed font-normal">
                Different types of information may be stored in different systems depending on the function involved.
              </p>
              <p className="leading-relaxed font-normal">
                Your information is intended to remain associated with the authenticated account to which it belongs, subject to the application&apos;s security and retention mechanisms.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                6. Data Retention
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific may retain information for as long as necessary to provide the relevant service, maintain security, comply with legal obligations, or fulfill the purpose for which the information was collected.
              </p>
              <p className="leading-relaxed font-normal">
                Specific retention periods may vary by data type and product functionality.
              </p>
              <p className="leading-relaxed font-normal">
                If Aestific implements a stated automatic deletion period for a particular category of data, that period will be described in the applicable product documentation or policy.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                7. Account Security
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific uses technical and organizational measures designed to protect user information against unauthorized access, alteration, disclosure, or destruction.
              </p>
              <p className="leading-relaxed text-zinc-600 dark:text-zinc-400 italic font-normal">
                However, no internet-based service can guarantee absolute security.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                8. Your Choices
              </h3>
              <p className="leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
                Depending on the features available in your account, you may be able to:
              </p>
              <ul className="grid sm:grid-cols-2 gap-2 pt-1">
                {[
                  'Update your account information',
                  'Change personalization preferences',
                  'Manage conversation history',
                  'Log out of your account',
                  'Request account or data-related assistance',
                  'Delete your account where the feature is available',
                ].map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/70 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                    <span className="text-xs text-zinc-800 dark:text-zinc-200 font-normal">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                9. Third-Party Services
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific may rely on third-party infrastructure, AI providers, communication services, storage systems, or other service providers to operate certain features.
              </p>
              <p className="leading-relaxed font-normal">
                Those services may process information according to their own terms and privacy policies.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                10. Children&apos;s Privacy
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific is not intended to knowingly collect personal information from children in violation of applicable law.
              </p>
              <p className="leading-relaxed font-normal">
                If you believe that a child has provided personal information to Aestific in a way that violates applicable requirements, contact us so the matter can be reviewed.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                11. Changes to This Policy
              </h3>
              <p className="leading-relaxed font-normal">
                We may update this Privacy Policy as Aestific evolves.
              </p>
              <p className="leading-relaxed font-normal">
                When material changes are made, the updated version will be published with a new &ldquo;Last Updated&rdquo; date.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-white/10 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                12. Contact
              </h3>
              <p className="leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
                For privacy-related questions or requests:
              </p>
              <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-xs font-normal">
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:atifwasee1048@gmail.com"
                  className="text-zinc-900 dark:text-white font-medium hover:underline"
                >
                  atifwasee1048@gmail.com
                </a>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-white/10">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic leading-relaxed font-normal">
                This Privacy Policy describes the general privacy practices of Aestific and should be reviewed and adapted to the actual data practices, applicable laws, and legal requirements of the service before publication.
              </p>
            </div>
          </article>
        )}

        {/* ================= 3. TERMS OF SERVICE ================= */}
        {currentDoc === 'terms' && (
          <article className="space-y-6 leading-relaxed text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13px] font-normal">
            <div className="pb-5 border-b border-zinc-200 dark:border-white/10 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200/70 dark:bg-white/10 text-zinc-800 dark:text-zinc-200">
                <Scale className="w-3 h-3 text-zinc-700 dark:text-zinc-300" />
                <span>LEGAL &amp; USAGE</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                Terms of Service
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                <strong>Last Updated:</strong> 25th September 2026
              </p>
            </div>

            <p className="leading-relaxed font-normal">
              Welcome to Aestific.
            </p>

            <p className="leading-relaxed font-normal">
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Aestific and its related features.
            </p>

            <p className="leading-relaxed font-normal">
              By accessing or using Aestific, you agree to these Terms. If you do not agree with them, please do not use the service.
            </p>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                1. About Aestific
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific is an AI-powered platform created and developed by <strong className="text-zinc-900 dark:text-white font-semibold">Atif Al Wasi</strong>.
              </p>
              <p className="leading-relaxed font-normal">
                The service may provide conversational AI, reasoning, coding assistance, research capabilities, multimodal understanding, file and image analysis, image generation, personalization, and other AI-powered functionality.
              </p>
              <p className="leading-relaxed font-normal">
                Features may change, be added, or be removed over time.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                2. Eligibility
              </h3>
              <p className="leading-relaxed font-normal">
                You may use Aestific only if you are legally permitted to use the service under the laws applicable to you.
              </p>
              <p className="leading-relaxed font-normal">
                If a particular feature has additional age or eligibility requirements, those requirements also apply.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                3. Your Account
              </h3>
              <p className="leading-relaxed font-normal">
                You are responsible for maintaining the security of your account and authentication credentials.
              </p>
              <p className="leading-relaxed font-normal">
                You should not share your account credentials with others or knowingly allow unauthorized access to your account.
              </p>
              <p className="leading-relaxed font-normal">
                You are responsible for activity performed through your account, except where unauthorized activity results from circumstances outside your reasonable control.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                4. Your Content
              </h3>
              <p className="leading-relaxed font-normal">
                You retain your rights to content you submit to Aestific, subject to the rights and permissions necessary for Aestific to process that content and provide the requested service.
              </p>
              <p className="leading-relaxed font-normal">
                You are responsible for ensuring that you have the necessary rights to upload, submit, or process content through Aestific.
              </p>
              <p className="leading-relaxed font-normal">
                Do not upload content that you are not legally permitted to use.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                5. AI-Generated Content
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific may generate text, code, images, or other content based on your instructions.
              </p>
              <p className="leading-relaxed font-normal">
                AI-generated content may contain mistakes, omissions, unexpected results, or inaccurate information.
              </p>
              <p className="leading-relaxed font-normal">
                You are responsible for reviewing AI-generated content before relying on it, publishing it, or using it for important decisions.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                6. Acceptable Use
              </h3>
              <p className="leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
                You must not use Aestific to:
              </p>
              <ul className="grid sm:grid-cols-2 gap-2 pt-1">
                {[
                  'Violate applicable law',
                  'Attempt unauthorized access to systems or accounts',
                  'Steal credentials or personal information',
                  'Distribute malware or malicious code',
                  'Abuse or disrupt the service',
                  'Circumvent security controls or usage restrictions',
                  'Infringe the rights of others',
                  'Conduct fraudulent activity',
                  'Use the service in ways that create unreasonable risk to other users or the service',
                ].map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/70 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                    <span className="text-xs text-zinc-800 dark:text-zinc-200 font-normal">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-normal">
                Additional restrictions may apply to specific AI or image-generation features.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                7. Availability
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific is provided on an evolving basis.
              </p>
              <p className="leading-relaxed font-normal">
                We do not guarantee that every feature will always be available, uninterrupted, or error-free.
              </p>
              <p className="leading-relaxed font-normal">
                Maintenance, provider outages, infrastructure failures, security incidents, or other circumstances may temporarily affect availability.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                8. Third-Party Services
              </h3>
              <p className="leading-relaxed font-normal">
                Some Aestific functionality may depend on third-party services.
              </p>
              <p className="leading-relaxed font-normal">
                Third-party services may have their own terms, usage restrictions, availability limitations, and privacy policies.
              </p>
              <p className="leading-relaxed font-normal">
                Aestific is not responsible for independent failures or policy changes of third-party services.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                9. Security
              </h3>
              <p className="leading-relaxed font-normal">
                You must not attempt to bypass Aestific&apos;s authentication, authorization, rate limits, security controls, or other technical protections.
              </p>
              <p className="leading-relaxed font-normal">
                Security vulnerabilities should be reported responsibly through the appropriate support channel.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                10. Changes to Aestific
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific may evolve over time.
              </p>
              <p className="leading-relaxed font-normal">
                Features, interfaces, AI systems, limits, integrations, and technical architecture may change as the service develops.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                11. Suspension or Termination
              </h3>
              <p className="leading-relaxed font-normal">
                Access may be suspended or terminated when reasonably necessary to protect users, the service, security, or comply with legal requirements.
              </p>
              <p className="leading-relaxed font-normal">
                Where appropriate, users may also terminate their account through available account controls.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                12. Disclaimer
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific and its AI-generated outputs are provided subject to applicable law.
              </p>
              <div className="p-4 rounded-xl bg-white dark:bg-white/5 border border-zinc-200/80 dark:border-white/10 shadow-xs">
                <p className="text-xs text-zinc-700 dark:text-zinc-300 font-normal">
                  AI output should not be treated as professional medical, legal, financial, or other specialized professional advice unless independently reviewed by an appropriately qualified professional.
                </p>
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                13. Limitation of Liability
              </h3>
              <p className="leading-relaxed font-normal">
                To the maximum extent permitted by applicable law, Aestific and its operators will not be responsible for losses arising from reliance on inaccurate AI-generated content, temporary service interruptions, third-party service failures, or misuse of the service.
              </p>
              <p className="leading-relaxed font-normal text-zinc-600 dark:text-zinc-400">
                Nothing in these Terms excludes rights or protections that cannot legally be excluded.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                14. Changes to These Terms
              </h3>
              <p className="leading-relaxed font-normal">
                We may update these Terms as Aestific evolves.
              </p>
              <p className="leading-relaxed font-normal">
                Updated Terms will be published with a new &ldquo;Last Updated&rdquo; date.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-white/10 space-y-3">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                15. Contact
              </h3>
              <p className="leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
                For questions regarding these Terms:
              </p>
              <div className="p-3.5 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-xs font-normal">
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:atifwasee1048@gmail.com"
                  className="text-zinc-900 dark:text-white font-medium hover:underline"
                >
                  atifwasee1048@gmail.com
                </a>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-white/10">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic leading-relaxed font-normal">
                These Terms should be reviewed by a qualified legal professional and adapted to the laws and actual operating structure of Aestific before public launch.
              </p>
            </div>
          </article>
        )}

        {/* ================= 4. AI SAFETY AND LIMITATIONS ================= */}
        {currentDoc === 'safety' && (
          <article className="space-y-6 leading-relaxed text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13px] font-normal">
            <div className="pb-5 border-b border-zinc-200 dark:border-white/10 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>SAFETY &amp; BOUNDARIES</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                AI Safety and Limitations
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                Understanding model capabilities, probabilistic outputs, and verification responsibilities.
              </p>
            </div>

            <p className="leading-relaxed font-normal">
              Aestific provides AI-generated text, code, image, and multimodal outputs. These outputs are generated by AI systems and may sometimes be inaccurate, incomplete, outdated, or unexpected.
            </p>

            {/* AI-Generated Responses */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                AI-Generated Responses
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific&apos;s responses are generated from the AI systems configured for the requested task. An answer that sounds confident may still contain mistakes.
              </p>
              <p className="leading-relaxed font-normal">
                Users should independently verify important information before relying on it, especially when accuracy is critical.
              </p>
            </div>

            {/* Coding & Technical Output */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Coding &amp; Technical Output
              </h3>
              <p className="leading-relaxed font-normal">
                AI-generated code may contain errors or security issues. Code should be reviewed, tested, and understood before being used in a production system.
              </p>
            </div>

            {/* Current Information */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Current Information
              </h3>
              <p className="leading-relaxed font-normal">
                AI responses are not necessarily real-time. When a task uses Aestific&apos;s web-search capability, information may be retrieved from external sources. Retrieved information should still be checked when accuracy is important.
              </p>
            </div>

            {/* Image Generation */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Image Generation
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific can generate images from user prompts. Generated images may not always reproduce every requested detail exactly and may contain visual inaccuracies or unexpected elements.
              </p>
              <p className="leading-relaxed font-normal">
                Image-generation requests may also be rejected by the configured image-generation system&apos;s safety controls.
              </p>
            </div>

            {/* Important Decisions */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Important Decisions
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific is an AI assistance tool and should not be treated as a replacement for qualified professional advice. Important medical, legal, financial, or other high-impact decisions should be independently verified with appropriate authoritative sources or professionals.
              </p>
            </div>
          </article>
        )}

        {/* ================= 5. DATA AND SECURITY ================= */}
        {currentDoc === 'data_security' && (
          <article className="space-y-6 leading-relaxed text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13px] font-normal">
            <div className="pb-5 border-b border-zinc-200 dark:border-white/10 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>ARCHITECTURE &amp; PROTECTION</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                Data and Security
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                Transparent verification of real, implemented storage engines, session isolation, and cryptographic standards.
              </p>
            </div>

            <p className="leading-relaxed font-normal">
              Aestific uses separate systems for structured application data and stored files.
            </p>

            {/* Account Isolation */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Account Isolation
              </h3>
              <p className="leading-relaxed font-normal">
                User-owned conversations, messages, files, memories, usage information, and personalization data are associated with the authenticated user&apos;s account.
              </p>
              <p className="leading-relaxed font-normal">
                Database operations use the authenticated user ID when accessing user-owned records.
              </p>
            </div>

            {/* Production Database */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Production Database
              </h3>
              <p className="leading-relaxed font-normal">
                In the production architecture, Cloudflare D1 is used as the authoritative structured database.
              </p>
              <p className="leading-relaxed font-normal">
                Production database configuration is required for the production database path, and database availability failures are handled explicitly rather than silently treating a missing production database as normal operation.
              </p>
            </div>

            {/* File Storage */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                File Storage
              </h3>
              <p className="leading-relaxed font-normal">
                Supabase Storage is used for persistent file and image storage in the production storage architecture.
              </p>
              <p className="leading-relaxed font-normal">
                Production storage uses private-bucket requirements and authenticated server-side access.
              </p>
            </div>

            {/* File Security */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                File Security
              </h3>
              <p className="leading-relaxed font-normal">
                Uploaded files are checked using file-content signatures (magic bytes) in addition to normal file information.
              </p>
              <p className="leading-relaxed font-normal">
                Uploaded paths and filenames are handled to prevent directory traversal such as <code className="font-mono text-[11px] text-pink-600 dark:text-pink-400">../</code>.
              </p>
            </div>

            {/* Password Security */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Password Security
              </h3>
              <p className="leading-relaxed font-normal">
                Passwords are not stored as plaintext. Aestific uses bcrypt-based password hashing for account passwords.
              </p>
            </div>

            {/* Authentication Cookies */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Authentication Cookies
              </h3>
              <p className="leading-relaxed font-normal">
                Authentication sessions use HTTP-only cookies so session tokens are not directly accessible to normal client-side JavaScript.
              </p>
              <p className="leading-relaxed font-normal">
                Secure and SameSite cookie settings are applied according to the request environment.
              </p>
            </div>

            {/* Data Retention */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Data Retention
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific includes an automated 30-day retention cleanup system for data covered by the retention policy.
              </p>
              <p className="leading-relaxed font-normal">
                Users can also manually clear available conversation history or memory items through the application.
              </p>
            </div>

            {/* Development vs Production */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Development vs Production
              </h3>
              <p className="leading-relaxed font-normal">
                Development and test environments may use local fallback storage where the production services are not configured. These development behaviors are separate from the authoritative production storage architecture.
              </p>
            </div>
          </article>
        )}

        {/* ================= 6. ACCEPTABLE USE POLICY ================= */}
        {currentDoc === 'acceptable_use' && (
          <article className="space-y-6 leading-relaxed text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13px] font-normal">
            <div className="pb-5 border-b border-zinc-200 dark:border-white/10 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-800 dark:text-red-300">
                <Ban className="w-3 h-3 text-red-600 dark:text-red-400" />
                <span>CODE OF CONDUCT</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                Acceptable Use Policy (AUP)
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                Mandatory rules for all users, accounts, API clients, and automated integrations.
              </p>
            </div>

            <p className="leading-relaxed font-normal">
              Aestific is intended to be used for lawful, responsible, and constructive purposes.
            </p>
            <p className="leading-relaxed font-normal">
              By using Aestific, you agree not to use the service to:
            </p>

            {/* Abuse or Attack the Service */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Abuse or Attack the Service
              </h3>
              <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-normal">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Attempt to bypass authentication or authorization.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Circumvent rate limits or other technical protections.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Attempt unauthorized access to another user&apos;s account or data.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Disrupt, overload, or interfere with the service or its infrastructure.</span>
                </li>
              </ul>
            </div>

            {/* Fraud and Deception */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Fraud and Deception
              </h3>
              <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-normal">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Use Aestific to facilitate scams, phishing, credential theft, or other fraudulent activity.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Impersonate another person or organization in a way intended to deceive others.</span>
                </li>
              </ul>
            </div>

            {/* Malicious Software or Unauthorized Access */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Malicious Software or Unauthorized Access
              </h3>
              <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-normal">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Use Aestific to facilitate malware, credential theft, unauthorized access, or other malicious activity.</span>
                </li>
              </ul>
            </div>

            {/* Harassment and Harmful Abuse */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Harassment and Harmful Abuse
              </h3>
              <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-normal">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Use Aestific to facilitate targeted harassment, threats, or abusive campaigns.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Use generated content to deliberately deceive, harass, or harm other people.</span>
                </li>
              </ul>
            </div>

            {/* Illegal or Abusive Content */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Illegal or Abusive Content
              </h3>
              <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-normal">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Use Aestific for activities that violate applicable law or the rights of others.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Submit or generate content that violates applicable safety requirements or the restrictions of the underlying AI services.</span>
                </li>
              </ul>
            </div>

            {/* Account and Data Abuse */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Account and Data Abuse
              </h3>
              <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-normal">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Attempt to access, modify, or delete another user&apos;s data.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-300 mt-1.5 shrink-0" />
                  <span>Share or misuse another user&apos;s private information without authorization.</span>
                </li>
              </ul>
            </div>

            {/* Enforcement */}
            <div className="pt-2 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-zinc-900 dark:bg-white" />
                Enforcement
              </h3>
              <p className="leading-relaxed font-normal">
                Aestific may apply technical restrictions, limit access, suspend an account, or terminate access when necessary to protect the service, its users, or comply with applicable requirements.
              </p>
            </div>
          </article>
        )}

        {/* ================= 7. OPEN SOURCE LICENSES ================= */}
        {currentDoc === 'licenses' && (
          <article className="space-y-6 leading-relaxed text-zinc-800 dark:text-zinc-200 text-xs sm:text-[13px] font-normal">
            <div className="pb-5 border-b border-zinc-200 dark:border-white/10 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-800 dark:text-blue-300">
                <Code2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                <span>THIRD-PARTY SOFTWARE</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                Open Source Licenses
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                Official attribution and license disclosures for open-source libraries utilized by Aestific.
              </p>
            </div>

            <p className="leading-relaxed font-normal">
              Aestific is built using open-source software libraries. In accordance with license requirements, the table below lists the third-party open-source dependencies directly utilized by Aestific, along with their respective verified licenses:
            </p>

            {/* Verified Package License Grid */}
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-white/5 border-b border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white font-medium">
                    <th className="p-3">Package</th>
                    <th className="p-3">License</th>
                    <th className="p-3 hidden sm:table-cell">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-white/5 font-normal text-zinc-700 dark:text-zinc-300">
                  {[
                    { name: 'react & react-dom', license: 'MIT', desc: 'Component rendering and virtual DOM lifecycle' },
                    { name: 'vite', license: 'MIT', desc: 'Next-generation frontend tooling and bundler' },
                    { name: 'express', license: 'MIT', desc: 'Minimalist Node.js API framework' },
                    { name: 'motion', license: 'MIT', desc: 'Animation and gesture library for React' },
                    { name: 'lucide-react', license: 'ISC', desc: 'Accessible iconography library' },
                    { name: '@tailwindcss/vite', license: 'MIT', desc: 'Tailwind CSS Vite integration plugin' },
                    { name: 'clsx', license: 'MIT', desc: 'Utility for constructing className strings conditionally' },
                    { name: 'tailwind-merge', license: 'MIT', desc: 'Utility for merging Tailwind CSS classes without style conflicts' },
                    { name: '@google/genai', license: 'Apache-2.0', desc: 'Official Google Gemini AI JavaScript SDK' },
                    { name: 'groq-sdk', license: 'Apache-2.0', desc: 'Official JavaScript/TypeScript SDK for Groq inference' },
                    { name: '@aws-sdk/client-s3', license: 'Apache-2.0', desc: 'AWS SDK for JavaScript S3 client for object storage' },
                    { name: 'jsonwebtoken', license: 'MIT', desc: 'JSON Web Token implementation for secure sessions' },
                    { name: 'bcryptjs', license: 'BSD-3-Clause', desc: 'Optimized bcrypt password hashing in pure JavaScript' },
                    { name: 'pdf-parse', license: 'Apache-2.0', desc: 'Pure JavaScript PDF text extraction library' },
                    { name: 'recharts', license: 'MIT', desc: 'Redesigned charting library built on React components' },
                    { name: 'react-markdown & remark-gfm', license: 'MIT', desc: 'Markdown renderer and GitHub Flavored Markdown plugin' },
                    { name: 'cookie-parser', license: 'MIT', desc: 'HTTP request cookie parsing middleware' },
                    { name: 'multer', license: 'MIT', desc: 'Multipart/form-data middleware for file uploads' },
                    { name: 'dotenv', license: 'BSD-2-Clause', desc: 'Zero-dependency environment variable parser' },
                  ].map((pkg, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 font-mono font-medium text-zinc-900 dark:text-white text-[11px] sm:text-xs">
                        {pkg.name}
                      </td>
                      <td className="p-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200/80 dark:bg-white/10 text-zinc-800 dark:text-zinc-200">
                          {pkg.license}
                        </span>
                      </td>
                      <td className="p-3 hidden sm:table-cell text-zinc-500 dark:text-zinc-400 text-[11px]">
                        {pkg.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 p-4 rounded-xl bg-zinc-100/70 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 space-y-1">
              <h4 className="text-xs font-semibold text-zinc-900 dark:text-white">Notice of Copyright</h4>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-normal">
                All copyright notices, permissions, and license texts of the respective authors and contributors are retained within the distributed package artifacts and node_modules dependencies.
              </p>
            </div>
          </article>
        )}
              </>
            )}

          </div>

          {/* Bottom Bar to Return to Documents List */}
          <div className="pt-3 pb-2 flex items-center justify-between border-t border-zinc-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => handleSelectDoc(null)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors border border-zinc-300 dark:border-white/10 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Documents List</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
