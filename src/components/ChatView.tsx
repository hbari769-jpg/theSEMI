import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AestificLogo } from './AestificLogo';
import {
  Menu,
  Settings,
  Plus,
  Globe,
  Lightbulb,
  Mic,
  ArrowUp,
  MessageSquare,
  Code2,
  Search,
  Image as ImageIcon,
  BarChart3,
  ChevronRight,
  Square,
  FileText,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  RefreshCw,
  Download,
  Trash2,
  Sparkles,
  Maximize2,
  X,
  Film,
  Loader2,
  Play,
  FileArchive,
  ExternalLink,
} from 'lucide-react';
import { Conversation, Message, Attachment, User, FileRecord, WebSearchSource } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { getAuthMediaUrl } from '../lib/api';
import { ImageGenerationSurface } from './ImageGenerationSurface';
import { useChatSettings } from '../lib/ChatSettingsContext';
import { useLanguage } from '../lib/LanguageContext';
import { useExperienceSettings } from '../lib/ExperienceSettingsContext';

const ProgressiveChatImage: React.FC<{
  src: string;
  alt?: string;
  onPreview: (url: string) => void;
}> = ({ src, alt, onPreview }) => {
  const { generationEffects } = useExperienceSettings();
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (alt) {
      navigator.clipboard.writeText(alt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-3 max-w-lg rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black/60 group relative shadow-md">
      {/* Reveal image container */}
      <div className="relative aspect-square max-h-[440px] w-full overflow-hidden bg-zinc-900/10 flex items-center justify-center">
        {!loaded && (
          <div className={`absolute inset-0 flex items-center justify-center ${
            generationEffects === 'off'
              ? 'bg-zinc-100 dark:bg-zinc-900'
              : generationEffects === 'minimal'
              ? 'bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-blue-500/10 dark:from-pink-950/20 dark:via-purple-950/20 dark:to-blue-950/20'
              : 'aestific-image-surface'
          }`}>
            <div className={`w-8 h-8 rounded-full border-2 ${
              generationEffects === 'off'
                ? 'border-zinc-300 dark:border-zinc-700 border-t-zinc-600 dark:border-t-zinc-300'
                : 'border-pink-500/30 border-t-pink-500'
            } animate-spin`} />
          </div>
        )}
        <img
          src={src}
          alt={alt || 'Generated artwork'}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onClick={() => onPreview(src)}
          className={`w-full h-full object-cover cursor-pointer transition-all duration-700 ease-out hover:scale-[1.01] ${
            loaded ? 'opacity-100 filter-none scale-100' : 'opacity-0 filter blur-xl scale-105'
          }`}
        />
      </div>
      {/* Footer metadata & toolbar */}
      <div className="p-2.5 flex items-center justify-between text-xs bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs border-t border-zinc-200 dark:border-white/10">
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-500 dark:text-pink-400 border border-pink-500/20 shrink-0">
            Aestific Visual
          </span>
          <span className="text-zinc-600 dark:text-zinc-400 text-[11px] truncate max-w-[240px]" title={alt}>
            {alt || 'Aestific Artwork'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {alt && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
              title="Copy prompt"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
          <a
            href={src}
            download="aestific-artwork.jpg"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-pink-500 px-2 py-0.5 rounded bg-white/70 dark:bg-white/5 border border-zinc-200 dark:border-white/5 transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>Save</span>
          </a>
        </div>
      </div>
    </div>
  );
};

interface ChatViewProps {
  conversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  user: User;
  onSendMessage: (content: string, attachments: Attachment[]) => void;
  onStopGeneration: () => void;
  onRegenerate?: (messageId?: string) => void;
  onRetry?: (messageId?: string) => void;
  onReactMessage?: (messageId: string, liked?: boolean, disliked?: boolean) => void;
  onClearChat?: () => void;
  onExportChat?: () => void;
  onOpenSettings?: () => void;
  onOpenVoiceStudio?: () => void;
  onOpenImageStudio?: (initialPrompt?: string) => void;
  onUploadFile?: (file: File) => Promise<FileRecord | null>;
  onToggleMobileSidebar?: () => void;
}

/**
 * Premium Aestific Blue Concentric O-Ring Response Generation Animation.
 * Starts with a core thin blue O-ring surrounded by concentric O-rings that
 * smoothly expand, overlap, gently merge, separate, and reform with organic timing.
 */
const AestificBlueORingLoader: React.FC<{ size?: number; instant?: boolean }> = ({
  size = 28,
  instant = false,
}) => {
  if (instant) {
    return (
      <div
        style={{ width: size, height: size }}
        className="relative inline-flex items-center justify-center shrink-0 select-none"
        aria-hidden="true"
      >
        <svg viewBox="0 0 40 40" className="w-full h-full overflow-visible">
          <circle
            cx="20"
            cy="20"
            r="7"
            fill="none"
            stroke="#3B82F6"
            strokeWidth="1.6"
          />
          <circle
            cx="20"
            cy="20"
            r="12"
            fill="none"
            stroke="#60A5FA"
            strokeWidth="1.2"
            strokeOpacity="0.65"
          />
        </svg>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.72 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.68, filter: 'blur(3px)' }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      style={{ width: size, height: size }}
      className="relative inline-flex items-center justify-center shrink-0 select-none"
      aria-hidden="true"
    >
      {/* Subtle luminous blue aura behind the O-rings */}
      <motion.div
        animate={{
          scale: [0.85, 1.18, 0.92, 1.12, 0.85],
          opacity: [0.22, 0.42, 0.28, 0.38, 0.22],
        }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(59, 130, 246, 0.38) 0%, rgba(37, 99, 235, 0.12) 55%, transparent 78%)',
          filter: 'blur(3px)',
        }}
      />

      <svg viewBox="0 0 44 44" className="w-full h-full relative z-10 overflow-visible">
        <defs>
          <linearGradient id="aestificBlueRingPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="50%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
          <linearGradient id="aestificBlueRingSecondary" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#93C5FD" />
            <stop offset="55%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>

        {/* Outer Concentric O-Ring 4: Expands wide, merges inward, and reforms */}
        <motion.circle
          cx="22"
          cy="22"
          r="7"
          fill="none"
          stroke="url(#aestificBlueRingSecondary)"
          strokeWidth="1.15"
          style={{ transformOrigin: '22px 22px' }}
          animate={{
            scale: [1.0, 2.35, 1.65, 2.55, 1.0],
            opacity: [0.0, 0.48, 0.72, 0.28, 0.0],
          }}
          transition={{
            duration: 3.6,
            repeat: Infinity,
            ease: [0.4, 0, 0.2, 1],
            times: [0, 0.34, 0.62, 0.85, 1],
          }}
        />

        {/* Mid-Outer Concentric O-Ring 3: Overlaps & merges with Ring 2 and Ring 4 */}
        <motion.circle
          cx="22"
          cy="22"
          r="7"
          fill="none"
          stroke="url(#aestificBlueRingPrimary)"
          strokeWidth="1.3"
          style={{ transformOrigin: '22px 22px' }}
          animate={{
            scale: [1.0, 1.95, 1.32, 2.1, 1.0],
            scaleX: [1.0, 1.04, 0.97, 1.02, 1.0],
            scaleY: [1.0, 0.97, 1.04, 0.98, 1.0],
            opacity: [0.25, 0.78, 0.52, 0.68, 0.25],
          }}
          transition={{
            duration: 3.1,
            delay: 0.22,
            repeat: Infinity,
            ease: 'easeInOut',
            times: [0, 0.3, 0.58, 0.84, 1],
          }}
        />

        {/* Mid-Inner Concentric O-Ring 2: Separates from core, merges with Ring 3, reforms */}
        <motion.circle
          cx="22"
          cy="22"
          r="7"
          fill="none"
          stroke="url(#aestificBlueRingSecondary)"
          strokeWidth="1.45"
          style={{ transformOrigin: '22px 22px' }}
          animate={{
            scale: [1.0, 1.52, 1.88, 1.24, 1.0],
            scaleX: [1.0, 0.96, 1.03, 0.99, 1.0],
            scaleY: [1.0, 1.04, 0.97, 1.01, 1.0],
            opacity: [0.55, 0.92, 0.64, 0.85, 0.55],
          }}
          transition={{
            duration: 2.65,
            delay: 0.1,
            repeat: Infinity,
            ease: 'easeInOut',
            times: [0, 0.32, 0.6, 0.82, 1],
          }}
        />

        {/* Primary Core O-Ring 1: Always anchored, subtly breathing as rings emerge and merge */}
        <motion.circle
          cx="22"
          cy="22"
          r="7"
          fill="none"
          stroke="url(#aestificBlueRingPrimary)"
          strokeWidth="1.75"
          style={{ transformOrigin: '22px 22px' }}
          animate={{
            scale: [1.0, 1.18, 0.94, 1.12, 1.0],
            opacity: [0.92, 1, 0.88, 1, 0.92],
          }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </svg>
    </motion.div>
  );
};

/**
 * Helper to clean and format model name into a secondary metadata string.
 * Maps intelligence engine identifiers to native Aestific brand designations.
 */
export const formatModelName = (modelName?: string): string => {
  if (!modelName) return 'Aestific Core';
  const clean = modelName.toLowerCase();
  if (clean.includes('visual') || clean.includes('image') || clean.includes('photo') || clean.includes('art') || clean.includes('synth')) {
    return 'Aestific Visual';
  }
  if (clean.includes('reason') || clean.includes('code') || clean.includes('coding') || clean.includes('logic') || clean.includes('algo')) {
    return 'Aestific Reason';
  }
  if (clean.includes('ultra') || clean.includes('pro') || clean.includes('hard') || clean.includes('deep')) {
    return 'Aestific Ultra';
  }
  return 'Aestific Core';
};

/**
 * Polished, subtle, compact badge for AI model metadata.
 * Remians strictly secondary to Aestific branding, AI response, user prompt, and main composer.
 *
 * Requirements met:
 * - Subtle, compact badge (px-1.5 py-0.5 rounded text-[10.5px] font-mono)
 * - Controlled contrast: readable dark/gray text in Light Mode, readable light/gray text in Dark Mode
 * - Not extremely faint: passes WCAG AA/AAA contrast without washing out
 * - Neutral monochrome aesthetic: no aggressive colorful accents
 * - Clean alignment and vertical rhythm
 */
export const ModelBadge: React.FC<{ model?: string; className?: string }> = ({ model, className = '' }) => {
  if (!model) return null;
  const displayName = formatModelName(model);
  if (!displayName) return null;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-mono font-medium tracking-normal leading-none bg-zinc-100/90 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 border border-zinc-200/90 dark:border-white/10 select-none ${className}`}
      title={`Intelligence: ${displayName}`}
    >
      {displayName}
    </span>
  );
};

/**
 * Custom Code Block with language tag and one-click copy feedback
 */
const CodeBlock: React.FC<{ language?: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-5 rounded-xl border border-zinc-200 dark:border-white/10 overflow-hidden bg-[#0d0d10] text-zinc-100 shadow-xs">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 dark:bg-white/[0.03] border-b border-zinc-800 dark:border-white/8 text-[11px] font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 dark:bg-white/10 text-[10px] font-mono uppercase tracking-wider text-zinc-300 font-medium">
            {language || 'code'}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/60 dark:hover:bg-white/5 transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-[11px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code Content */}
      <div className="p-4 overflow-x-auto text-[13px] leading-[1.65] font-mono">
        <pre className="!bg-transparent !p-0 !m-0 !border-0 text-zinc-200">
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
};

/**
 * Error Boundary around Markdown rendering so partial/complex streaming markdown
 * can NEVER crash the React tree or cause a black/blank screen.
 */
class SafeMarkdownErrorBoundary extends React.Component<
  { fallbackText: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallbackText: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { fallbackText: string }) {
    if (prevProps.fallbackText !== this.props.fallbackText && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100 leading-[1.75]">
          {this.props.fallbackText}
        </div>
      );
    }
    return this.props.children;
  }
}

const KNOWN_LABEL_DOMAINS: Record<string, string> = {
  'prothom alo': 'prothomalo.com',
  'prothom alo english': 'en.prothomalo.com',
  'the daily star': 'thedailystar.net',
  'the daily star bangla': 'bangla.thedailystar.net',
  'bbc': 'bbc.com',
  'bbc news': 'bbc.com',
  'reuters': 'reuters.com',
  'ap news': 'apnews.com',
  'associated press': 'apnews.com',
  'al jazeera': 'aljazeera.com',
  'the guardian': 'theguardian.com',
  'cnn': 'cnn.com',
  'bdnews24': 'bdnews24.com',
  'dhaka tribune': 'dhakatribune.com',
  'the business standard': 'tbsnews.net',
  'tbs news': 'tbsnews.net',
  'samakal': 'samakal.com',
  'jugantor': 'jugantor.com',
  'kaler kantho': 'kalerkantho.com',
  'ittefaq': 'ittefaq.com.bd',
  'the daily ittefaq': 'ittefaq.com.bd',
  'somoy news': 'somoynews.tv',
  'somoy tv': 'somoynews.tv',
  'jamuna tv': 'jamuna.tv',
  'bangla tribune': 'banglatribune.com',
  'dhaka post': 'dhakapost.com',
  'jagonews24': 'jagonews24.com',
  'kalbela': 'kalbela.com',
  'espncricinfo': 'espncricinfo.com',
  'cricbuzz': 'cricbuzz.com',
  'espn': 'espn.com',
  'fifa': 'fifa.com',
  'icc': 'icc-cricket.com',
  'wikipedia': 'wikipedia.org',
  'techcrunch': 'techcrunch.com',
  'the verge': 'theverge.com',
  'gsmarena': 'gsmarena.com',
  'bloomberg': 'bloomberg.com',
  'forbes': 'forbes.com',
  'coinmarketcap': 'coinmarketcap.com',
};

/**
 * ChatGPT-style Compact Source Citation Badge:
 * Sits naturally inline beside facts or in the sources row.
 * Displays the website's authentic favicon/logo + readable name.
 * Clicking opens the verified source/page in a new tab without showing giant raw URLs.
 */
export const ChatCitationBadge: React.FC<{
  href: string;
  label?: string;
  domain?: string;
  sourceName?: string;
  className?: string;
}> = ({ href, label, domain: propDomain, sourceName, className = '' }) => {
  const [imgError, setImgError] = useState(false);

  const cleanLabel = (() => {
    if (sourceName && sourceName.trim()) return sourceName.trim();
    const strLabel = (label || '').trim();
    if (strLabel && !strLabel.startsWith('http://') && !strLabel.startsWith('https://') && strLabel.length < 35) {
      return strLabel;
    }
    const rawDom = propDomain || (() => {
      try {
        return new URL(href).hostname.replace(/^www\./i, '');
      } catch {
        return '';
      }
    })();
    if (rawDom) {
      const parts = rawDom.split('.');
      const main = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
      if (main && main.length > 2) {
        return main.charAt(0).toUpperCase() + main.slice(1);
      }
      return rawDom;
    }
    return 'Source';
  })();

  const domain = propDomain || (() => {
    const rawCheck = `${sourceName || ''} ${cleanLabel} ${label || ''}`.toLowerCase().trim();
    for (const [name, dom] of Object.entries(KNOWN_LABEL_DOMAINS)) {
      if (rawCheck.includes(name)) return dom;
    }
    try {
      const u = new URL(href);
      return u.hostname.replace(/^www\./i, '');
    } catch {
      return '';
    }
  })();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${cleanLabel} • ${href}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 mx-1 my-0.5 rounded-full bg-zinc-100 hover:bg-zinc-200/90 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] border border-zinc-200/80 hover:border-blue-500/30 dark:border-white/10 dark:hover:border-blue-400/30 text-zinc-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-300 text-[11px] sm:text-[11.5px] font-medium no-underline transition-all shadow-2xs hover:scale-[1.03] cursor-pointer align-baseline select-none ${className}`}
    >
      {!imgError && domain ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
          alt=""
          className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
          onError={() => setImgError(true)}
        />
      ) : (
        <Globe className="w-3 h-3 text-blue-500 shrink-0" />
      )}
      <span className="truncate max-w-[130px] sm:max-w-[190px]">{cleanLabel}</span>
      <ExternalLink className="w-2.5 h-2.5 opacity-50 shrink-0" />
    </a>
  );
};

/**
 * Progressive Streaming Markdown Renderer:
 * Ensures AI responses appear smoothly and gradually ("dhire dhire lekha ashbe")
 * even when upstream tokens arrive in fast bursts, and never renders a blank screen.
 */
const ProgressiveMarkdownMessage: React.FC<{
  content: string;
  isStreaming?: boolean;
  instant?: boolean;
  onPreviewImage: (url: string) => void;
}> = ({ content, isStreaming = false, instant = false, onPreviewImage }) => {
  const wasStreamingRef = useRef<boolean>(Boolean(isStreaming));
  const [displayedLength, setDisplayedLength] = useState<number>(() =>
    isStreaming && !instant ? 0 : content.length
  );

  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
    }
  }, [isStreaming]);

  useEffect(() => {
    if (instant || !wasStreamingRef.current) {
      setDisplayedLength(content.length);
      return;
    }

    if (displayedLength >= content.length) {
      if (!isStreaming && displayedLength > content.length) {
        setDisplayedLength(content.length);
      }
      return;
    }

    const timer = setInterval(() => {
      setDisplayedLength((prev) => {
        const remaining = content.length - prev;
        if (remaining <= 0) return content.length;
        // Smooth adaptive step: reveals 2–10 chars per 18ms frame for natural reading cadence
        const step = Math.max(2, Math.min(14, Math.ceil(remaining / 12)));
        return Math.min(content.length, prev + step);
      });
    }, 18);

    return () => clearInterval(timer);
  }, [content, isStreaming, instant, displayedLength]);

  const visibleText =
    instant || !wasStreamingRef.current
      ? content
      : content.slice(0, Math.max(1, displayedLength));
  const isActivelyTyping = Boolean(isStreaming || displayedLength < content.length);

  return (
    <div className="markdown-content text-zinc-900 dark:text-zinc-100 text-[15px] sm:text-[15.5px] leading-[1.75]">
      <SafeMarkdownErrorBoundary fallbackText={visibleText}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '');
              const codeString = String(children ?? '').replace(/\n$/, '');
              const isBlock = Boolean(match || codeString.includes('\n'));
              if (isBlock) {
                return (
                  <CodeBlock
                    language={match ? match[1] : ''}
                    value={codeString}
                  />
                );
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            img({ src, alt }: any) {
              const authSrc = getAuthMediaUrl(src);
              return (
                <ProgressiveChatImage
                  src={authSrc}
                  alt={alt}
                  onPreview={onPreviewImage}
                />
              );
            },
            a({ href, children, ...props }: any) {
              if (!href) return <span>{children}</span>;
              const isWebUrl = /^https?:\/\//i.test(href);
              if (isWebUrl) {
                const rawText = typeof children === 'string' ? children : String(children ?? '');
                return <ChatCitationBadge href={href} label={rawText} />;
              }
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                  {...props}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {visibleText}
        </ReactMarkdown>
      </SafeMarkdownErrorBoundary>
      {isActivelyTyping && !instant && (
        <span
          className="inline-block w-1.5 h-4 ml-1 align-middle rounded-xs bg-blue-500 animate-pulse"
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = ({
  conversation,
  messages,
  isStreaming,
  user,
  onSendMessage,
  onStopGeneration,
  onRegenerate,
  onRetry,
  onReactMessage,
  onClearChat,
  onExportChat,
  onOpenSettings,
  onOpenVoiceStudio,
  onOpenImageStudio,
  onUploadFile,
  onToggleMobileSidebar,
}) => {
  const { enterToSend, autoScroll, showTimestamps, saveChatHistory, temporaryChat } = useChatSettings();
  const { t } = useLanguage();
  const { responseAnimation, playUiSound } = useExperienceSettings();
  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState<
    Array<{
      tempId: string;
      name: string;
      size: number;
      mimeType: string;
      type: 'image' | 'video' | 'pdf' | 'audio' | 'other';
      previewUrl?: string;
    }>
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isWebSearchActive, setIsWebSearchActive] = useState(false);
  const [isReasonActive, setIsReasonActive] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  type ThinkingLatencyPhase = 'normal' | 'longer' | 'slow_network' | 'check_connection';
  const [thinkingPhase, setThinkingPhase] = useState<ThinkingLatencyPhase>('normal');

  // Monitor generation latency:
  // - 2.5s: "Thinking longer for better answer..."
  // - 7.5s (7-8s late): "Late thinking due to slow network"
  // - 12s (12s late): "Check your internet connection"
  useEffect(() => {
    let t1: NodeJS.Timeout | null = null;
    let t2: NodeJS.Timeout | null = null;
    let t3: NodeJS.Timeout | null = null;

    if (isStreaming) {
      setThinkingPhase('normal');
      t1 = setTimeout(() => {
        setThinkingPhase('longer');
      }, 2500);

      t2 = setTimeout(() => {
        setThinkingPhase('slow_network');
      }, 7500);

      t3 = setTimeout(() => {
        setThinkingPhase('check_connection');
      }, 12000);
    } else {
      setThinkingPhase('normal');
    }

    return () => {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
      if (t3) clearTimeout(t3);
    };
  }, [isStreaming]);

  // Focus tracking for signature flowing gradient border
  const [isHeroFocused, setIsHeroFocused] = useState(false);
  const [isBottomFocused, setIsBottomFocused] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomFileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll control states
  const isAtBottomRef = useRef<boolean>(true);
  const userScrolledUpRef = useRef<boolean>(false);
  const scrollRafIdRef = useRef<number | null>(null);
  const prevMessagesLengthRef = useRef<number>(messages.length);
  const prevConversationIdRef = useRef<string | undefined>(conversation?.id);

  // Measure distance to bottom with mobile-friendly tolerance (120px)
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const threshold = 120;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom <= threshold;

    isAtBottomRef.current = nearBottom;

    if (!nearBottom) {
      // User intentionally scrolled upward — do not force them back down
      userScrolledUpRef.current = true;
    } else {
      // User returned back to bottom — resume auto-following
      userScrolledUpRef.current = false;
    }
  }, []);

  // 1. When a new message is appended (user prompt or initial assistant response)
  useEffect(() => {
    const prevLen = prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (messages.length === 0) return;

    if (messages.length > prevLen) {
      const latestMsg = messages[messages.length - 1];
      const prevMsg = messages[messages.length - 2];

      // If the user just submitted a prompt, scroll to bottom
      if (latestMsg?.role === 'user' || prevMsg?.role === 'user') {
        userScrolledUpRef.current = false;
        isAtBottomRef.current = true;
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (container) {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: responseAnimation === 'instant' ? 'auto' : 'smooth',
            });
          }
        });
        return;
      }

      // If new assistant response starts and user was already at bottom
      if (autoScroll && isAtBottomRef.current && !userScrolledUpRef.current) {
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (container && isAtBottomRef.current && !userScrolledUpRef.current) {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: responseAnimation === 'instant' ? 'auto' : 'smooth',
            });
          }
        });
      }
    }
  }, [messages.length, autoScroll, responseAnimation]);

  // 2. During AI streaming: follow ONLY if user was already at/near bottom
  const lastMessage = messages[messages.length - 1];
  const lastMessageContent = lastMessage?.content;

  useEffect(() => {
    if (!isStreaming || !autoScroll) return;

    // If user scrolled up, stop forcing viewport downward immediately
    if (userScrolledUpRef.current || !isAtBottomRef.current) {
      return;
    }

    // Throttle to requestAnimationFrame to prevent excessive repeated scrollIntoView calls
    if (scrollRafIdRef.current === null) {
      scrollRafIdRef.current = requestAnimationFrame(() => {
        scrollRafIdRef.current = null;
        const container = scrollContainerRef.current;
        if (container && isAtBottomRef.current && !userScrolledUpRef.current) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [lastMessageContent, isStreaming, autoScroll]);

  // 3. When streaming completes, settle at bottom and play completion sound cue if enabled
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      playUiSound('complete');
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, playUiSound]);

  useEffect(() => {
    if (!isStreaming && autoScroll) {
      if (isAtBottomRef.current && !userScrolledUpRef.current) {
        const container = scrollContainerRef.current;
        if (container) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: responseAnimation === 'instant' ? 'auto' : 'smooth',
          });
        }
      }
    }
  }, [isStreaming, autoScroll, responseAnimation]);

  // 4. Conversation switch: jump to bottom of loaded thread
  useEffect(() => {
    if (conversation?.id !== prevConversationIdRef.current) {
      prevConversationIdRef.current = conversation?.id;
      userScrolledUpRef.current = false;
      isAtBottomRef.current = true;
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [conversation?.id]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (scrollRafIdRef.current !== null) {
        cancelAnimationFrame(scrollRafIdRef.current);
      }
    };
  }, []);

  // Adjust textarea heights dynamically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
    if (bottomTextareaRef.current) {
      bottomTextareaRef.current.style.height = 'auto';
      bottomTextareaRef.current.style.height = `${Math.min(bottomTextareaRef.current.scrollHeight, 140)}px`;
    }
  }, [inputText]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter must always create a new line
        return;
      }
      if (enterToSend) {
        e.preventDefault();
        handleSend();
      }
      // When enterToSend is false, Enter creates a new line by default
    }
  };

  const handleSend = (textToSend?: string) => {
    const finalContent = textToSend !== undefined ? textToSend : inputText;
    if ((!finalContent.trim() && pendingAttachments.length === 0) || isStreaming || isUploading || uploadingAttachments.length > 0) {
      return;
    }

    const payloadText = finalContent;

    onSendMessage(payloadText, pendingAttachments);
    playUiSound('send');
    setInputText('');
    setPendingAttachments([]);

    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (bottomTextareaRef.current) bottomTextareaRef.current.style.height = 'auto';

    userScrolledUpRef.current = false;
    isAtBottomRef.current = true;
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: responseAnimation === 'instant' ? 'auto' : 'smooth',
        });
      }
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string | undefined> =>
    new Promise((resolve) => {
      if (file.size > 18 * 1024 * 1024) {
        resolve(undefined);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    });

  const detectClientAttachmentType = (file: File): 'image' | 'video' | 'pdf' | 'audio' | 'other' => {
    const mime = (file.type || '').toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) return 'image';
    if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio';
    return 'other';
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (selectedFiles.length === 0 || !onUploadFile) return;

    const queuedItems = selectedFiles.map((file, idx) => {
      const detectedType = detectClientAttachmentType(file);
      const previewUrl =
        detectedType === 'image' || detectedType === 'video'
          ? URL.createObjectURL(file)
          : undefined;
      return {
        file,
        tempId: `uploading_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        type: detectedType,
        previewUrl,
      };
    });

    setIsUploading(true);
    setUploadingAttachments((prev) => [
      ...prev,
      ...queuedItems.map(({ file: _f, ...rest }) => rest),
    ]);

    try {
      for (const item of queuedItems) {
        try {
          const isVisualMedia = item.type === 'image' || item.type === 'video';
          const [record, dataUrl] = await Promise.all([
            onUploadFile(item.file),
            isVisualMedia ? readFileAsDataUrl(item.file) : Promise.resolve(undefined),
          ]);

          if (record) {
            setPendingAttachments((prev) => [
              ...prev,
              {
                id: record.id,
                name: record.originalName || item.name,
                filename: record.filename,
                type: record.type || item.type,
                mimeType: record.mimeType || item.mimeType,
                url: record.url,
                previewUrl: item.previewUrl,
                dataUrl,
                size: record.size || item.size,
                extractedText: record.extractedText,
                chunks: record.chunks,
                isScanned: record.isScanned,
                pageCount: record.pageCount,
                duration: record.duration,
                createdAt: record.createdAt,
              },
            ]);
          } else if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
        } catch (fileErr) {
          console.error('File upload error in chatview:', fileErr);
          if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
        } finally {
          setUploadingAttachments((prev) => prev.filter((u) => u.tempId !== item.tempId));
        }
      }
    } finally {
      setIsUploading(false);
    }
  };

  const renderComposerAttachmentsTray = () => {
    if (uploadingAttachments.length === 0 && pendingAttachments.length === 0) {
      return null;
    }

    return (
      <div className="w-full flex flex-wrap items-center justify-start gap-2.5 pb-2 mb-1">
        {/* 1. Currently Loading / Uploading Attachments */}
        {uploadingAttachments.map((item) => {
          const isImg = item.type === 'image';
          const isVid = item.type === 'video';

          if (isImg || isVid) {
            return (
              <div
                key={item.tempId}
                className="relative group w-20 h-20 rounded-xl overflow-hidden bg-zinc-900 border border-blue-500/40 shadow-md shrink-0 flex items-center justify-center"
                title={`Loading ${item.name}...`}
              >
                {isImg && item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    className="w-full h-full object-cover opacity-45 scale-105 blur-[1px] transition-all"
                  />
                ) : isVid && item.previewUrl ? (
                  <video
                    src={item.previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover opacity-45"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                    {isVid ? <Film className="w-6 h-6 text-zinc-500" /> : <ImageIcon className="w-6 h-6 text-zinc-500" />}
                  </div>
                )}

                {/* Prominent Loading Overlay */}
                <div className="absolute inset-0 bg-black/55 backdrop-blur-[1.5px] flex flex-col items-center justify-center gap-1 p-1">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  <span className="text-[9.5px] font-medium text-white tracking-wide leading-none">
                    Loading...
                  </span>
                </div>

                {/* Bottom filename bar */}
                <div className="absolute bottom-0 inset-x-0 bg-black/75 px-1.5 py-0.5 text-[9px] text-zinc-300 truncate text-left">
                  {item.name}
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.tempId}
              className="relative flex items-center gap-2.5 px-3 py-2 rounded-xl bg-zinc-900/95 border border-blue-500/40 text-xs text-zinc-200 shadow-md min-w-[170px] max-w-[240px]"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-400/30 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              </div>
              <div className="flex flex-col min-w-0 flex-1 text-left">
                <span className="text-[11.5px] font-medium text-white truncate">{item.name}</span>
                <span className="text-[10px] text-blue-400 font-medium flex items-center gap-1">
                  <span>Loading file...</span>
                  {item.size ? <span>• {formatFileSize(item.size)}</span> : null}
                </span>
              </div>
            </div>
          );
        })}

        {/* 2. Ready / Attached Visual Items */}
        {pendingAttachments.map((att, idx) => {
          const isImg =
            att.type === 'image' ||
            att.mimeType?.startsWith('image/') ||
            Boolean(att.url && /\.(png|jpe?g|webp|gif|svg|bmp)/i.test(att.url));
          const isVid =
            att.type === 'video' ||
            att.mimeType?.startsWith('video/') ||
            Boolean(att.url && /\.(mp4|webm|mov|avi|mkv)/i.test(att.url));
          const mediaSrc = att.previewUrl || att.dataUrl || getAuthMediaUrl(att.url);

          if (isImg) {
            return (
              <div
                key={att.id || idx}
                className="relative group w-20 h-20 rounded-xl overflow-hidden bg-zinc-900 border border-white/20 hover:border-white/40 shadow-md shrink-0 transition-all"
              >
                <img
                  src={mediaSrc}
                  alt={att.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPreviewImage(mediaSrc);
                  }}
                  className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-1.5 pt-2 pb-1 pointer-events-none">
                  <span className="block text-[9.5px] font-medium text-white truncate leading-tight">
                    {att.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 hover:bg-rose-600 text-white border border-white/20 flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                  title="Remove picture"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          }

          if (isVid) {
            return (
              <div
                key={att.id || idx}
                className="relative group w-24 h-20 rounded-xl overflow-hidden bg-zinc-900 border border-white/20 hover:border-white/40 shadow-md shrink-0 transition-all"
              >
                {mediaSrc ? (
                  <video
                    src={mediaSrc}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                    <Film className="w-6 h-6 text-zinc-400" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
                  <div className="w-7 h-7 rounded-full bg-black/65 border border-white/25 flex items-center justify-center">
                    <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-1.5 pt-2 pb-1 pointer-events-none flex items-center justify-between gap-1">
                  <span className="text-[9.5px] font-medium text-white truncate leading-tight">
                    {att.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 hover:bg-rose-600 text-white border border-white/20 flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                  title="Remove video"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          }

          const isZip =
            Boolean(att.name && /\.(zip|tar|gz|tgz|7z|rar)$/i.test(att.name)) ||
            Boolean(att.mimeType && att.mimeType.includes('zip'));
          const isOffice = Boolean(att.name && /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv)$/i.test(att.name));

          return (
            <div
              key={att.id || idx}
              className="relative group flex items-center gap-2.5 pl-2.5 pr-7 py-2 rounded-xl bg-zinc-900/95 border border-white/20 hover:border-white/35 text-xs text-zinc-200 shadow-md min-w-[165px] max-w-[240px] transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                {isZip ? (
                  <FileArchive className="w-4 h-4 text-amber-400" />
                ) : (
                  <FileText className="w-4 h-4 text-white" />
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1 text-left">
                <span className="text-[11.5px] font-medium text-white truncate">{att.name}</span>
                <span className="text-[10px] text-zinc-400 truncate">
                  {att.type === 'pdf'
                    ? 'PDF Document'
                    : isZip
                    ? 'ZIP Archive'
                    : isOffice
                    ? 'Office Document'
                    : 'Attached File'}
                  {att.size ? ` • ${formatFileSize(att.size)}` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
                }}
                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/10 hover:bg-rose-600 text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Remove file"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 5 Capability Cards - Strictly Monochrome Minimal Design
  const capabilityCards = [
    {
      icon: MessageSquare,
      title: 'Chat',
      description: 'Conversations, ideas and brainstorms',
      action: () => {
        handleSend('Can you help me brainstorm some innovative startup concepts?');
      },
    },
    {
      icon: Code2,
      title: 'Code',
      description: 'Write, debug and explain code',
      action: () => {
        handleSend('Write a high-performance debounce utility function in TypeScript');
      },
    },
    {
      icon: Search,
      title: 'Search',
      description: 'Find facts, papers and answers',
      action: () => {
        handleSend('Summarize recent breakthroughs in quantum computing architecture');
      },
    },
    {
      icon: ImageIcon,
      title: 'Create',
      description: 'Generate images and visual concepts',
      action: () => {
        if (onOpenImageStudio) {
          onOpenImageStudio('A minimal architectural villa with warm evening lighting');
        } else {
          handleSend('A minimal architectural villa with warm evening lighting');
        }
      },
    },
    {
      icon: BarChart3,
      title: 'Analyze',
      description: 'Analyze data and get insights',
      action: () => {
        handleSend('Analyze this data structure and summarize key performance metrics');
      },
    },
  ];

  // "You can try asking" prompt suggestions
  const promptSuggestions = [
    { text: 'Explain this concept in simple terms', prompt: 'Explain quantum computing in simple terms with intuitive real-world examples.' },
    { text: 'Write a Python function to sort a list', prompt: 'Write a clean, optimized Python function to sort a list with error handling.' },
    { text: "What's new in AI today?", prompt: "What are the latest breakthroughs, model releases, and trends in AI today?" },
    { text: 'Create a realistic futuristic city image', prompt: 'Create a realistic futuristic architectural city at twilight.' },
    { text: 'Analyze this data and summarize', prompt: 'Analyze this sample quarterly dataset and provide strategic insights and summaries.' },
    { text: 'Plan a 7-day trip to Switzerland', prompt: 'Plan a comprehensive 7-day scenic travel itinerary for Switzerland including scenic trains and hikes.' },
  ];

  const isHeroComposerActive = isHeroFocused || inputText.length > 0;
  const isBottomComposerActive = isBottomFocused || inputText.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 relative overflow-hidden select-text z-10 transition-colors duration-200">
      {/* 1. Top Header Bar - Minimalist Monochrome Header */}
      <div className="h-14 sm:h-16 px-3 sm:px-6 flex items-center justify-between border-b border-zinc-200 dark:border-white/10 bg-white/90 dark:bg-black/90 backdrop-blur-xl z-30 relative shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile Sidebar Toggle Button */}
          <button
            onClick={onToggleMobileSidebar}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white md:hidden transition-colors shrink-0"
            title="Toggle Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {conversation ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-white/10 border border-zinc-200/80 dark:border-white/10 flex items-center justify-center shrink-0">
                <AestificLogo size="xs" variant="mark-only" />
              </div>
              <h2 className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-white truncate max-w-[160px] xs:max-w-[220px] sm:max-w-md">
                {conversation.title}
              </h2>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-white/10 border border-zinc-200/80 dark:border-white/10 flex items-center justify-center shrink-0">
                <AestificLogo size="xs" variant="mark-only" />
              </div>
              <span className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                Aestific
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Temporary Chat / History Off status indicator */}
          {temporaryChat ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>Temporary Chat</span>
            </span>
          ) : !saveChatHistory ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-200/80 dark:bg-white/10 border border-zinc-300 dark:border-white/15 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              <span>History Off</span>
            </span>
          ) : null}

          {messages.length > 0 && onExportChat && (
            <button
              onClick={onExportChat}
              className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-all cursor-pointer"
              title="Export Conversation"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {messages.length > 0 && onClearChat && (
            <button
              onClick={onClearChat}
              className="p-2 rounded-xl bg-zinc-100 hover:bg-rose-50 dark:bg-white/5 dark:hover:bg-rose-500/15 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 transition-all cursor-pointer"
              title="Clear Thread"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Settings Icon Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-all cursor-pointer"
            title={t('settings')}
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Main Scrollable View Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 ${
          messages.length === 0
            ? 'overflow-y-auto sm:overflow-y-hidden flex flex-col justify-center'
            : 'overflow-y-auto'
        } px-3 sm:px-6 py-2 sm:py-3 z-10 custom-scrollbar`}
      >
        {messages.length === 0 ? (
          /* Aestific Hero & Discovery Landing - Clean, calm, compact focused hierarchy fitting on one screen */
          <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-center text-center my-auto py-1 sm:py-2">
            {/* 1. Aestific Branding & 2. Short Tagline */}
            <div className="mb-2 sm:mb-2.5 flex flex-col items-center justify-center">
              <AestificLogo size="hero" glow={false} showSubtitle={false} />
              <p className="text-xs sm:text-[13px] text-zinc-500 dark:text-zinc-400 font-normal mt-1 sm:mt-1.5 tracking-wide max-w-xs sm:max-w-sm leading-snug">
                Your intelligent partner for answers, creativity and productivity.
              </p>
            </div>

            {/* 3. Main Chatbox Composer - Slimmer, shorter length & compact on mobile, full on PC */}
            <div className="w-[88%] max-w-[320px] sm:w-full sm:max-w-2xl mx-auto mb-2 sm:mb-3 relative">
              <div className={`aestific-composer-dock ${isHeroComposerActive ? 'is-active' : ''}`}>
                <div className="aestific-composer-beam" />
                <div 
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button')) {
                      textareaRef.current?.focus();
                    }
                  }}
                  className="aestific-composer-inner px-2.5 py-1.5 sm:p-3 flex flex-col min-h-[54px] sm:min-h-[92px] justify-between text-left cursor-text"
                >
                  {/* Pending & Uploading Attachments visual tray above chatbox */}
                  {renderComposerAttachmentsTray()}

                  {/* Input Textarea - Solid Black chatbox, Pure White readable text, zero inner border */}
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onFocus={() => setIsHeroFocused(true)}
                    onBlur={() => setIsHeroFocused(false)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('generateIntelligence')}
                    rows={1}
                    className="aestific-composer-textarea w-full flex-1 min-h-[22px] sm:min-h-[40px] py-0 bg-transparent text-white placeholder:text-white focus:outline-none focus:ring-0 focus:border-0 border-0 resize-none text-[12.5px] sm:text-[14px] font-medium leading-snug sm:leading-normal cursor-text"
                    style={{
                      color: '#ffffff',
                      WebkitTextFillColor: '#ffffff',
                      caretColor: '#ffffff',
                      backgroundColor: 'transparent',
                      outline: 'none',
                      border: 'none',
                      boxShadow: 'none',
                    }}
                  />

                  {/* Bottom Controls Toolbar - Clean High-Contrast inside black composer */}
                  <div className="flex items-center justify-between pt-1 sm:pt-1.5 gap-1 sm:gap-2">
                    {/* Left Buttons: + , Web Search, Reason */}
                    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        multiple
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 hover:border-white/30 flex items-center justify-center text-white transition-all cursor-pointer disabled:opacity-40 shrink-0"
                        title="Upload file or knowledge doc"
                      >
                        <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => e.preventDefault()}
                        className="flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border bg-white/[0.06] border-white/15 text-zinc-300 shrink-0 select-none cursor-default"
                      >
                        <Globe className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white shrink-0" />
                        <span className="text-zinc-300">Web Search</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => e.preventDefault()}
                        className="flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border bg-white/[0.06] border-white/15 text-zinc-300 shrink-0 select-none cursor-default"
                      >
                        <Lightbulb className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white shrink-0" />
                        <span className="text-zinc-300">Reason</span>
                      </button>
                    </div>

                    {/* Right Buttons: Mic & Send Arrow - White on Black */}
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      {onOpenVoiceStudio && (
                        <button
                          onClick={onOpenVoiceStudio}
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 hover:border-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
                          title="Record voice note"
                        >
                          <Mic className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
                        </button>
                      )}

                      <button
                        onClick={() => handleSend()}
                        disabled={(!inputText.trim() && pendingAttachments.length === 0) || isStreaming || isUploading || uploadingAttachments.length > 0}
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all shadow-sm ${
                          (inputText.trim() || pendingAttachments.length > 0) && !isUploading && uploadingAttachments.length === 0
                            ? 'bg-white/20 hover:bg-white/30 border border-white/40 text-white active:scale-95 cursor-pointer'
                            : 'bg-white/[0.05] border border-white/10 text-white/30 cursor-not-allowed'
                        }`}
                        title={isUploading ? 'Waiting for attachment to finish loading...' : t('sendMessage')}
                      >
                        {isUploading || uploadingAttachments.length > 0 ? (
                          <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin text-white/80" />
                        ) : (
                          <ArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5] text-white" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Existing Capabilities - Visually lightweight & compact */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mb-2 sm:mb-2.5 max-w-xl">
              {capabilityCards.map((card, idx) => {
                const Icon = card.icon;
                return (
                  <button
                    key={idx}
                    onClick={card.action}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 sm:py-1 rounded-full bg-zinc-100/80 hover:bg-zinc-200/80 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-zinc-200/70 hover:border-zinc-300 dark:border-white/8 dark:hover:border-white/15 transition-all text-[11px] font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white cursor-pointer group"
                    title={card.description}
                  >
                    <Icon className="w-3 h-3 text-zinc-400 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-200 transition-colors" />
                    <span>{card.title}</span>
                  </button>
                );
              })}
            </div>

            {/* 4. Existing Useful Suggestions - Refined, compact 2x2 grid on both mobile & PC */}
            <div className="w-full max-w-xl">
              <div className="grid grid-cols-2 gap-1.5">
                {promptSuggestions.slice(0, 4).map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(item.prompt)}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-50/60 hover:bg-zinc-100/90 dark:bg-white/[0.02] dark:hover:bg-white/[0.05] border border-zinc-200/60 hover:border-zinc-300/80 dark:border-white/6 dark:hover:border-white/12 text-left transition-all cursor-pointer group flex items-center justify-between gap-2"
                  >
                    <span className="text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors truncate">
                      {item.text}
                    </span>
                    <ChevronRight className="w-3 h-3 text-zinc-400 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300 shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Active Chat Thread - Editorial / Knowledge Canvas Layout */
          <div className="max-w-3xl xl:max-w-[48rem] mx-auto space-y-8 sm:space-y-10 pb-36 px-3 sm:px-4">
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user' || msg.sender === 'user';
              const isLastAssistant = !isUser && index === messages.length - 1;

              return (
                <div key={msg.id} className="w-full">
                  {isUser ? (
                    /* User Prompt: Clean, minimal, distinct query container */
                    <div className="user-prompt-box w-full rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/50 border border-zinc-200/90 dark:border-white/10 p-4 sm:p-5 text-zinc-900 dark:text-zinc-100 transition-colors">
                      {/* Header Row: Subtle User Identity & Timestamp */}
                      <div className="flex items-center justify-between mb-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[10px] font-semibold select-none">
                            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            {user?.name || 'You'}
                          </span>
                        </div>
                        {showTimestamps && msg.createdAt && (
                          <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      {/* Attachments Preview */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2.5 mb-3">
                          {msg.attachments.map((att, attIdx) => {
                            const isImg =
                              att.type === 'image' ||
                              att.mimeType?.startsWith('image/') ||
                              Boolean(att.url && /\.(png|jpe?g|webp|gif|svg|bmp)/i.test(att.url));
                            const isVid =
                              att.type === 'video' ||
                              att.mimeType?.startsWith('video/') ||
                              Boolean(att.url && /\.(mp4|webm|mov|avi|mkv)/i.test(att.url));
                            const mediaSrc = att.previewUrl || att.dataUrl || getAuthMediaUrl(att.url);

                            if (isImg && mediaSrc) {
                              return (
                                <div
                                  key={attIdx}
                                  className="group relative rounded-xl overflow-hidden border border-zinc-300 dark:border-white/10 bg-black/5 dark:bg-black/40 max-w-[240px] shadow-xs hover:shadow-md transition-shadow"
                                >
                                  <img
                                    src={mediaSrc}
                                    alt={att.name || 'Attached image'}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-32 object-cover cursor-pointer hover:scale-[1.02] transition-transform duration-300"
                                    onClick={() => setSelectedPreviewImage(mediaSrc)}
                                    loading="lazy"
                                  />
                                  <div className="p-1.5 flex items-center justify-between text-[11px] bg-zinc-100/90 dark:bg-zinc-900/90 backdrop-blur-xs border-t border-zinc-200 dark:border-white/10">
                                    <span className="truncate text-zinc-700 dark:text-zinc-300 font-medium max-w-[150px]">
                                      {att.name}
                                    </span>
                                    <a
                                      href={mediaSrc}
                                      download={att.name || 'image.png'}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-0.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded"
                                      title="Download image"
                                    >
                                      <Download className="w-3 h-3" />
                                    </a>
                                  </div>
                                </div>
                              );
                            }

                            if (isVid && mediaSrc) {
                              return (
                                <div
                                  key={attIdx}
                                  className="group relative rounded-xl overflow-hidden border border-zinc-300 dark:border-white/10 bg-black/80 max-w-[280px] shadow-xs hover:shadow-md transition-shadow"
                                >
                                  <video
                                    src={mediaSrc}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="w-full max-h-44 object-contain bg-black"
                                  />
                                  <div className="p-1.5 flex items-center justify-between text-[11px] bg-zinc-100/90 dark:bg-zinc-900/90 backdrop-blur-xs border-t border-zinc-200 dark:border-white/10">
                                    <span className="truncate text-zinc-700 dark:text-zinc-300 font-medium max-w-[180px]">
                                      {att.name}
                                    </span>
                                    <a
                                      href={mediaSrc}
                                      download={att.name || 'video.mp4'}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-0.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded"
                                      title="Download video"
                                    >
                                      <Download className="w-3 h-3" />
                                    </a>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={attIdx}
                                className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-zinc-200/70 dark:bg-white/5 border border-zinc-300/80 dark:border-white/10 text-xs text-zinc-800 dark:text-zinc-200 shadow-2xs"
                              >
                                <div className="w-7 h-7 rounded-lg bg-zinc-300/70 dark:bg-white/10 flex items-center justify-center shrink-0">
                                  <FileText className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="max-w-[190px] truncate text-xs font-medium">{att.name}</span>
                                  {att.size ? (
                                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                      {formatFileSize(att.size)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Prompt Content */}
                      <div className="text-[15px] sm:text-[15.5px] leading-[1.68] text-zinc-900 dark:text-zinc-100 font-normal whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* AI Assistant Response: Premium Knowledge / Workspace Interface */
                    <div className={`w-full space-y-3 ${responseAnimation === 'instant' ? 'response-instant' : ''}`}>
                      {/* Header Row: Subtle Aestific Emblem + Live Web Search Badge */}
                      <div className="flex items-center justify-between flex-wrap gap-2 pb-0.5">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white flex items-center justify-center text-xs shrink-0">
                            <AestificLogo size="xs" variant="mark-only" />
                          </div>
                          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                            Aestific
                          </span>
                          {(msg.webSearchUsed || (msg.sources && msg.sources.length > 0)) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-[10.5px] font-medium text-blue-600 dark:text-blue-400">
                              <Globe className="w-2.5 h-2.5 shrink-0" />
                              <span>Live Web Search</span>
                            </span>
                          )}
                          {showTimestamps && msg.createdAt && (
                            <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hidden sm:inline ml-0.5">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* In-Chat Image Generation Surface (when active or in progress) */}
                      {msg.imageGen && (msg.imageGen.isGenerating || msg.imageGen.phase) && (
                        <ImageGenerationSurface
                          imageGen={msg.imageGen}
                          onPreviewImage={setSelectedPreviewImage}
                        />
                      )}

                      {/* Live Initial Thinking / Web Search Generating State inside message */}
                      <AnimatePresence mode="wait">
                        {msg.isStreaming && !msg.content && !msg.imageGen?.isGenerating && (
                          <motion.div
                            key={(msg.webSearchUsed || msg.searchState) ? 'live-search-state' : 'initial-blue-oring-state'}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, filter: 'blur(2px)' }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="py-2.5 px-3.5 rounded-2xl bg-zinc-50/90 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-white/10 text-xs shadow-xs space-y-2.5"
                          >
                            {(msg.webSearchUsed || msg.searchState) ? (
                              <>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5">
                                    <AestificBlueORingLoader
                                      size={22}
                                      instant={responseAnimation === 'instant'}
                                    />
                                    <div className="flex items-center gap-1.5">
                                      <Globe className="w-3.5 h-3.5 text-blue-500 animate-pulse shrink-0" />
                                      <span className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200">
                                        {((msg.searchState?.sources && msg.searchState.sources.length > 0) || (msg.sources && msg.sources.length > 0))
                                          ? `Searching the web • Found ${(msg.searchState?.sources || msg.sources || []).length} sources`
                                          : 'Searching the live web for recent updates...'}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-mono tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                                    Web Search
                                  </span>
                                </div>

                                {/* Staggered Appearing Sources with Logo and Name */}
                                {((msg.searchState?.sources && msg.searchState.sources.length > 0) || (msg.sources && msg.sources.length > 0)) && (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                    {(msg.searchState?.sources || msg.sources || []).map((src: WebSearchSource, sIdx: number) => (
                                      <motion.div
                                        key={sIdx}
                                        initial={{ opacity: 0, scale: 0.85, y: 3 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        transition={{
                                          delay: sIdx * 0.08,
                                          duration: 0.22,
                                          ease: [0.16, 1, 0.3, 1],
                                        }}
                                      >
                                        <ChatCitationBadge
                                          href={src.url}
                                          domain={src.domain}
                                          sourceName={src.sourceName}
                                          label={src.title}
                                        />
                                      </motion.div>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center gap-3 font-mono text-zinc-500 dark:text-zinc-400">
                                <AestificBlueORingLoader
                                  size={24}
                                  instant={responseAnimation === 'instant'}
                                />
                                <span className="text-[12px] tracking-wide transition-colors duration-300">
                                  {thinkingPhase === 'check_connection' ? (
                                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                                      Check your internet connection
                                    </span>
                                  ) : thinkingPhase === 'slow_network' ? (
                                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                                      Late thinking due to slow network
                                    </span>
                                  ) : thinkingPhase === 'longer' ? (
                                    <span className="text-zinc-700 dark:text-zinc-200 font-medium">
                                      Thinking longer for better answer...
                                    </span>
                                  ) : (
                                    'Aestific is generating response...'
                                  )}
                                </span>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Rich Markdown Response Body (Progressive Typewriter Streaming + Error Boundary) */}
                      {(() => {
                        if (msg.imageGen?.phase === 'error') return null;
                        const hasActiveImageSurface = Boolean(
                          msg.imageGen && (msg.imageGen.imageUrl || (msg.imageGen.imageUrls && msg.imageGen.imageUrls.length > 0))
                        );
                        // If ImageGenerationSurface is already rendering the image, omit markdown image embeds to prevent duplicates
                        const baseContent = hasActiveImageSurface
                          ? (msg.content || '').replace(/!\[.*?\]\(.*?\)\n*/g, '').trim()
                          : (msg.content || '');

                        // Clean redundant trailing ### Sources or raw URL dumps at bottom
                        const renderedContent = baseContent
                          .replace(/\n*#{2,4}\s*(?:🌐\s*)?(?:Sources|Visited Links|তথ্যসূত্র|সূত্রসমূহ|সূত্র|Web Sources)[\s\S]*$/i, '')
                          .trim();

                        if (!renderedContent) return null;
                        if (msg.imageGen?.isGenerating && !renderedContent) return null;

                        return (
                          <ProgressiveMarkdownMessage
                            content={renderedContent}
                            isStreaming={msg.isStreaming}
                            instant={responseAnimation === 'instant'}
                            onPreviewImage={setSelectedPreviewImage}
                          />
                        );
                      })()}

                      {/* Verified Web Search Sources Panel (Compact ChatGPT-style pill badges with authentic logos) */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="pt-2">
                          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 select-none">
                            <Globe className="w-3 h-3 text-blue-500 shrink-0" />
                            <span>Sources ({msg.sources.length})</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {msg.sources.map((src: WebSearchSource, sIdx: number) => (
                              <ChatCitationBadge
                                key={sIdx}
                                href={src.url}
                                domain={src.domain}
                                sourceName={src.sourceName}
                                label={src.title}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Integrated Workspace Actions & Status Toolbar */}
                      <div className="flex items-center justify-between flex-wrap gap-2 pt-2.5 mt-3 border-t border-zinc-100 dark:border-white/5 text-xs text-zinc-600 dark:text-zinc-400">
                        <div className="flex items-center gap-2">
                          {msg.tokensUsed ? (
                            <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                              {msg.tokensUsed} tokens
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                              Aestific AI
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                          <button
                            onClick={() => copyToClipboard(msg.content, msg.id)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            title="Copy response"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-emerald-500 font-medium">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          {onReactMessage && (
                            <div className="flex items-center border-l border-zinc-200 dark:border-white/10 pl-1.5 ml-0.5">
                              <button
                                onClick={() => onReactMessage(msg.id, !msg.liked, false)}
                                className={`p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer ${
                                  msg.liked
                                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                                    : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                                }`}
                                title="Helpful"
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onReactMessage(msg.id, false, !msg.disliked)}
                                className={`p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer ml-0.5 ${
                                  msg.disliked
                                    ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10'
                                    : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                                }`}
                                title="Unhelpful"
                              >
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {!msg.isStreaming && !isStreaming && (onRegenerate || onRetry) && (
                            <div className="flex items-center gap-1.5 border-l border-zinc-200 dark:border-white/10 pl-2 ml-0.5">
                              {onRegenerate && (
                                <button
                                  type="button"
                                  onClick={() => onRegenerate(msg.id)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white bg-zinc-100 hover:bg-zinc-200/90 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] border border-zinc-200/90 dark:border-white/10 transition-colors cursor-pointer"
                                  title="Regenerate a new response"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Regenerate</span>
                                </button>
                              )}

                              {(onRetry || onRegenerate) && (
                                <button
                                  type="button"
                                  onClick={() => (onRetry ? onRetry(msg.id) : onRegenerate?.(msg.id))}
                                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                                    msg.content?.includes('⚠️') || msg.imageGen?.phase === 'error'
                                      ? 'text-blue-600 dark:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 font-semibold'
                                      : 'text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white bg-zinc-100 hover:bg-zinc-200/90 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] border-zinc-200/90 dark:border-white/10'
                                  }`}
                                  title="Retry generating response"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Retry</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Real-time Streaming State Indicator */}
            <AnimatePresence>
              {isStreaming && (
                <motion.div
                  key="streaming-blue-oring-bar"
                  initial={responseAnimation === 'instant' ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    responseAnimation === 'instant'
                      ? { opacity: 0 }
                      : { opacity: 0, y: 4, filter: 'blur(2px)' }
                  }
                  transition={
                    responseAnimation === 'instant'
                      ? { duration: 0 }
                      : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }
                  }
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-white/10 text-xs shadow-xs"
                >
                  {(() => {
                    const activeStreamingMsg = messages.slice().reverse().find((m) => m.role === 'assistant' && m.isStreaming);
                    const isSearchingWeb = Boolean(
                      (activeStreamingMsg?.webSearchUsed || activeStreamingMsg?.searchState) &&
                      !activeStreamingMsg?.content
                    );
                    const foundCount = (activeStreamingMsg?.searchState?.sources || activeStreamingMsg?.sources || []).length;

                    return (
                      <div className="flex items-center gap-3">
                        <AestificBlueORingLoader
                          size={24}
                          instant={responseAnimation === 'instant'}
                        />
                        {isSearchingWeb ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-200">
                            <Globe className="w-3.5 h-3.5 text-blue-500 animate-pulse shrink-0" />
                            <span>
                              {foundCount > 0
                                ? `Searching the web • Found ${foundCount} sources`
                                : 'Searching the live web for recent updates...'}
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 transition-colors duration-300">
                            {thinkingPhase === 'check_connection' ? (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                Check your internet connection
                              </span>
                            ) : thinkingPhase === 'slow_network' ? (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                Late thinking due to slow network
                              </span>
                            ) : thinkingPhase === 'longer' ? (
                              <span className="text-zinc-700 dark:text-zinc-200 font-medium">
                                Thinking longer for better answer...
                              </span>
                            ) : (
                              'Aestific is generating response...'
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <button
                    onClick={onStopGeneration}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-medium cursor-pointer hover:opacity-85 transition-opacity"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                    <span>Stop</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 3. Sticky Bottom Composer (when thread is active) - Slimmer, shorter length & compact on mobile, full on PC */}
      {messages.length > 0 && (
        <div className="px-2 pt-2 pb-1.5 sm:px-6 sm:pt-3.5 sm:pb-2.5 bg-white/95 dark:bg-black/95 border-t border-zinc-200 dark:border-white/10 backdrop-blur-2xl z-20 relative shrink-0">
          <div className="w-[90%] max-w-[330px] sm:w-full sm:max-w-3xl xl:max-w-[48rem] mx-auto">
            <div className={`aestific-composer-dock ${isBottomComposerActive ? 'is-active' : ''}`}>
              <div className="aestific-composer-beam" />
              <div
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button')) {
                    bottomTextareaRef.current?.focus();
                  }
                }}
                className="aestific-composer-inner px-2.5 py-1.5 sm:p-3 flex flex-col min-h-[52px] sm:min-h-[86px] justify-between text-left cursor-text"
              >
                {/* Pending & Uploading attachments visual tray in bottom composer */}
                {renderComposerAttachmentsTray()}

                <textarea
                  ref={bottomTextareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onFocus={() => setIsBottomFocused(true)}
                  onBlur={() => setIsBottomFocused(false)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('generateIntelligence')}
                  rows={1}
                  className="aestific-composer-textarea w-full flex-1 min-h-[20px] sm:min-h-[38px] max-h-32 py-0 bg-transparent text-white placeholder:text-white focus:outline-none focus:ring-0 focus:border-0 border-0 resize-none text-[12.5px] sm:text-[14px] font-medium leading-snug sm:leading-normal cursor-text"
                  style={{
                    color: '#ffffff',
                    WebkitTextFillColor: '#ffffff',
                    caretColor: '#ffffff',
                    backgroundColor: 'transparent',
                    outline: 'none',
                    border: 'none',
                    boxShadow: 'none',
                  }}
                />

                {/* Bottom Controls Toolbar - Unified PC-like row on both mobile and desktop with NO middle border */}
                <div className="flex items-center justify-between pt-1 sm:pt-1.5 gap-1 sm:gap-2">
                  {/* Left Buttons: + , Web Search, Reason */}
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                    <input
                      type="file"
                      ref={bottomFileInputRef}
                      onChange={handleFileSelect}
                      multiple
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => bottomFileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 hover:border-white/30 flex items-center justify-center text-white transition-all cursor-pointer disabled:opacity-40 shrink-0"
                      title="Attach file"
                    >
                      <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => e.preventDefault()}
                      className="flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border bg-white/[0.06] border-white/15 text-zinc-300 shrink-0 select-none cursor-default"
                    >
                      <Globe className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white shrink-0" />
                      <span className="text-zinc-300">Web Search</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => e.preventDefault()}
                      className="flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border bg-white/[0.06] border-white/15 text-zinc-300 shrink-0 select-none cursor-default"
                    >
                      <Lightbulb className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white shrink-0" />
                      <span className="text-zinc-300">Reason</span>
                    </button>
                  </div>

                  {/* Right Buttons: Mic & Send Arrow */}
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    {onOpenVoiceStudio && (
                      <button
                        type="button"
                        onClick={onOpenVoiceStudio}
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 hover:border-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
                        title="Record voice note"
                      >
                        <Mic className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSend()}
                      disabled={(!inputText.trim() && pendingAttachments.length === 0) || isStreaming || isUploading || uploadingAttachments.length > 0}
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all shadow-sm ${
                        (inputText.trim() || pendingAttachments.length > 0) && !isUploading && uploadingAttachments.length === 0
                          ? 'bg-white/20 hover:bg-white/30 border border-white/40 text-white active:scale-95 cursor-pointer'
                          : 'bg-white/[0.05] border border-white/10 text-white/30 cursor-not-allowed'
                      }`}
                      title={isUploading ? 'Waiting for attachment to finish loading...' : t('sendMessage')}
                    >
                      {isUploading || uploadingAttachments.length > 0 ? (
                        <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin text-white/80" />
                      ) : (
                        <ArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5] text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Bottom Center Disclaimer */}
      <footer className="w-full py-1.5 pb-2.5 px-4 sm:px-6 flex items-center justify-center z-20 relative shrink-0 bg-white dark:bg-black select-none">
        <p className="text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-400 font-normal sm:font-medium tracking-normal text-center leading-normal max-w-xl">
          Aestific can make mistakes.
        </p>
      </footer>

      {/* Fullscreen Lightbox Preview for Generated and Attached Images */}
      {selectedPreviewImage && (
        <div
          onClick={() => setSelectedPreviewImage(null)}
          className="fixed inset-0 z-60 bg-black/95 flex flex-col items-center justify-center p-4 cursor-zoom-out"
        >
          <button
            onClick={() => setSelectedPreviewImage(null)}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={selectedPreviewImage}
            alt="Enlarged Artwork"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
