import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  X,
  Download,
  RefreshCw,
  Wand2,
  Image as ImageIcon,
  Check,
  Copy,
  Send,
  Maximize2,
  AlertCircle,
  Clipboard,
} from 'lucide-react';
import { authFetch, getAuthMediaUrl } from '../lib/api';
import { useExperienceSettings } from '../lib/ExperienceSettingsContext';

interface ImageGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string | null;
  initialPrompt?: string;
  onImageGenerated?: (imageUrl: string, prompt: string) => void;
}

const STYLES = [
  { id: 'photorealistic', name: 'Photorealistic', desc: 'Ultra-detailed cinematic photography' },
  { id: 'anime', name: 'Anime & Manga', desc: 'Japanese animation aesthetic' },
  { id: 'cyberpunk', name: 'Cyberpunk & Neon', desc: 'Futuristic glowing cityscapes' },
  { id: '3d_render', name: '3D Octane Render', desc: 'Smooth lighting and hyper-real materials' },
  { id: 'fantasy', name: 'Fantasy & Ethereal', desc: 'Mythical digital painting' },
  { id: 'minimalist', name: 'Vector & Minimalist', desc: 'Clean lines and modern flat art' },
];

const RATIOS = [
  { id: '1:1', label: '1:1 Square', desc: '1024 × 1024' },
  { id: '16:9', label: '16:9 Landscape', desc: '1280 × 720' },
  { id: '9:16', label: '9:16 Portrait', desc: '720 × 1280' },
  { id: '4:3', label: '4:3 Classic', desc: '1024 × 768' },
  { id: '3:4', label: '3:4 Vertical', desc: '768 × 1024' },
];

const PROMPT_SUGGESTIONS = [
  'A majestic futuristic cyberpunk city floating in neon nebula clouds, cinematic lighting',
  'A serene sunset over a crystalline lake surrounded by golden autumn trees and glowing fireflies',
  'Futuristic holographic humanoid AI meditating in a dark neon laboratory, glowing circuits',
  'A cute futuristic robotic cat wearing aviator goggles sitting on a cozy cafe table in Tokyo',
  'Hyperrealistic portrait of an astronaut looking at earth with reflections in helmet visor, cinematic lighting',
  'Scenic Bengali river bank village with traditional wooden boat, golden hour sunset, 8k masterpiece',
];

export const ImageGenerationModal: React.FC<ImageGenerationModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  initialPrompt,
  onImageGenerated,
}) => {
  const { playUiSound } = useExperienceSettings();
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [selectedStyle, setSelectedStyle] = useState('photorealistic');
  const [selectedRatio, setSelectedRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{ url: string; downloadUrl?: string; prompt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sentToChat, setSentToChat] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  useEffect(() => {
    if (initialPrompt && isOpen) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt, isOpen]);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setPrompt(text.trim());
        setError(null);
      }
    } catch {
      // Browser clipboard read permission fallback
    }
  };

  if (!isOpen) return null;

  const handleGenerate = async (customPrompt?: string) => {
    const textPrompt = (customPrompt || prompt).trim();
    if (!textPrompt) {
      setError('Please enter a description for the image you want to generate.');
      return;
    }

    setError(null);
    setIsGenerating(true);
    setSentToChat(false);
    playUiSound('send');

    try {
      const res = await authFetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textPrompt,
          aspectRatio: selectedRatio,
          style: selectedStyle,
          conversationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate image.');
      }

      const displayUrl = data.image.dataUrl || data.image.url;
      setGeneratedImage({
        url: displayUrl,
        downloadUrl: data.image.url,
        prompt: data.image.prompt || textPrompt,
      });
      playUiSound('complete');
    } catch (err: any) {
      setError(err.message || 'Image generation encountered an error.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPrompt = () => {
    if (generatedImage) {
      navigator.clipboard.writeText(generatedImage.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendToChat = () => {
    if (!generatedImage) return;
    if (onImageGenerated) {
      onImageGenerated(generatedImage.downloadUrl || generatedImage.url, prompt || generatedImage.prompt);
      setSentToChat(true);
      setTimeout(() => {
        onClose();
      }, 600);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 dark:bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-white border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[92vh] relative"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-white/10 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/60 relative z-10 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-900 dark:text-white shadow-xs shrink-0">
                <Wand2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2 truncate">
                  AI Picture Studio
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-white/10 border border-zinc-200 dark:border-white/15 text-zinc-700 dark:text-zinc-300 font-medium shrink-0">
                    Neural Engine
                  </span>
                </h3>
                <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  High-fidelity generative visual studio powered by neural models
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 active:scale-95 transition-all min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Close Picture Studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Area */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 min-h-0 bg-white dark:bg-[#0a0a0a]">
            {/* Prompt Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Image Prompt
                </label>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-[11px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/5 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 transition-colors cursor-pointer"
                  title="Paste from clipboard"
                >
                  <Clipboard className="w-3 h-3" />
                  <span>Paste Prompt</span>
                </button>
              </div>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setError(null);
                  }}
                  placeholder="Describe your visual concept: e.g. A serene sunset over a mountain lake, a cute white cat on green grass, or a sleek red sports car..."
                  rows={3}
                  className="w-full bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 focus:border-zinc-400 dark:focus:border-white/30 rounded-2xl p-4 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none transition-all resize-none shadow-xs"
                />
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                💡 Paste a prompt from chat or describe any visual scene to create high-detail imagery.
              </p>
            </div>

            {/* Quick Prompt Suggestions */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Quick Ideas:</span>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(s);
                      setError(null);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.04] dark:hover:bg-white/10 border border-zinc-200/80 dark:border-white/10 text-zinc-700 dark:text-zinc-300 transition-colors text-left truncate max-w-full cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Style Selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Artistic Style</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStyle(st.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedStyle === st.id
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-zinc-900 dark:border-white shadow-xs'
                        : 'bg-zinc-50/70 dark:bg-white/[0.02] border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-semibold">{st.name}</div>
                    <div className={`text-[10px] truncate ${
                      selectedStyle === st.id
                        ? 'text-zinc-300 dark:text-zinc-600'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}>{st.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio Selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Aspect Ratio</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {RATIOS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRatio(r.id as any)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      selectedRatio === r.id
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-zinc-900 dark:border-white font-semibold shadow-xs'
                        : 'bg-zinc-50/70 dark:bg-white/[0.02] border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-semibold">{r.label}</div>
                    <div className={`text-[10px] ${
                      selectedRatio === r.id
                        ? 'text-zinc-300 dark:text-zinc-600'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}>{r.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 p-3 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* Generated Image Preview & Actions */}
            {generatedImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-white/10 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                    Generated Artwork
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyPrompt}
                      className="text-[11px] text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 transition-colors cursor-pointer shadow-xs"
                      title="Copy Prompt"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copied' : 'Prompt'}
                    </button>
                    <button
                      onClick={() => setShowFullscreen(true)}
                      className="text-[11px] text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 transition-colors cursor-pointer shadow-xs"
                      title="Fullscreen Preview"
                    >
                      <Maximize2 className="w-3 h-3" />
                      Preview
                    </button>
                    <a
                      href={getAuthMediaUrl(generatedImage.downloadUrl || generatedImage.url)}
                      download="aestific-generated-image.png"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-3 py-1 rounded-lg flex items-center gap-1 font-semibold transition-colors shadow-xs"
                    >
                      <Download className="w-3 h-3" />
                      Save
                    </a>
                  </div>
                </div>

                <div
                  onClick={() => setShowFullscreen(true)}
                  className="rounded-xl overflow-hidden border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black flex items-center justify-center max-h-[340px] cursor-pointer group relative"
                >
                  <img
                    src={getAuthMediaUrl(generatedImage.url)}
                    alt={generatedImage.prompt}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                    onError={async () => {
                      const fallbackTarget = generatedImage.downloadUrl;
                      if (fallbackTarget && !generatedImage.url.startsWith('blob:') && !generatedImage.url.startsWith('data:')) {
                        try {
                          const res = await authFetch(fallbackTarget);
                          if (res.ok) {
                            const blob = await res.blob();
                            const localBlobUrl = URL.createObjectURL(blob);
                            setGeneratedImage((prev) => (prev ? { ...prev, url: localBlobUrl } : null));
                          }
                        } catch (err) {
                          console.warn('Image fetch fallback note:', err);
                        }
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1.5 pointer-events-none backdrop-blur-xs">
                    <Maximize2 className="w-4 h-4" /> Click to enlarge
                  </div>
                </div>

                {/* Secondary Action Toolbar */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => handleGenerate()}
                    disabled={isGenerating}
                    className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-white/[0.03] hover:bg-zinc-100 dark:hover:bg-white/[0.08] border border-zinc-200 dark:border-white/10 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>Regenerate</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendToChat}
                    className="text-xs text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-semibold transition-colors shadow-xs cursor-pointer"
                  >
                    {sentToChat ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
                        <span>Added to Chat!</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send to Chat</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="p-4 border-t border-zinc-200 dark:border-white/10 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/60">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => handleGenerate()}
              disabled={isGenerating || !prompt.trim()}
              className="px-6 py-2.5 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 active:scale-95 text-xs font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-zinc-400 dark:text-zinc-600" />
                  <span>Generating Image...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{generatedImage ? 'Generate New' : 'Generate Image'}</span>
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Fullscreen Image Preview Lightbox */}
        {showFullscreen && generatedImage && (
          <div
            onClick={() => setShowFullscreen(false)}
            className="fixed inset-0 z-60 bg-black/90 dark:bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-zoom-out"
          >
            <button
              onClick={() => setShowFullscreen(false)}
              className="absolute top-5 right-5 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={getAuthMediaUrl(generatedImage.url)}
              alt={generatedImage.prompt}
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/15"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="mt-4 text-xs text-zinc-200 max-w-xl text-center">
              {generatedImage.prompt}
            </p>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};
