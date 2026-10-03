import React, { useState } from 'react';
import { Sparkles, Download, Eye, Check, AlertCircle, Grid, Maximize2 } from 'lucide-react';
import { ImageGenerationProgress } from '../types';
import { useExperienceSettings } from '../lib/ExperienceSettingsContext';
import { getAuthMediaUrl } from '../lib/api';

interface ImageGenerationSurfaceProps {
  imageGen: ImageGenerationProgress;
  onPreviewImage?: (url: string) => void;
  className?: string;
}

export const ImageGenerationSurface: React.FC<ImageGenerationSurfaceProps> = ({
  imageGen,
  onPreviewImage,
  className = '',
}) => {
  const { generationEffects } = useExperienceSettings();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [activeVariationIndex, setActiveVariationIndex] = useState<number | null>(null);

  const phase = imageGen.phase || 'creating';
  const label = imageGen.label || (
    phase === 'understanding'
      ? 'Understanding prompt'
      : phase === 'creating'
      ? 'Creating your image'
      : phase === 'rendering'
      ? 'Rendering'
      : phase === 'refining'
      ? 'Refining details'
      : phase === 'ready'
      ? 'Almost ready'
      : 'Generating'
  );

  const imagesList: string[] = (imageGen.imageUrls && imageGen.imageUrls.length > 0)
    ? imageGen.imageUrls
    : (imageGen.imageUrl ? [imageGen.imageUrl] : []);

  const hasImages = imagesList.length > 0;
  const isMulti = imagesList.length > 1;

  const handleCopyPrompt = () => {
    if (imageGen.prompt) {
      navigator.clipboard.writeText(imageGen.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSingleImageLoaded = (idx: number) => {
    setLoadedImages((prev) => ({ ...prev, [idx]: true }));
    setImageLoaded(true);
  };

  return (
    <div
      className={`relative w-full max-w-lg rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/10 bg-zinc-100/90 dark:bg-black/60 shadow-md my-3 transition-all duration-500 ${className}`}
    >
      {/* Aspect Ratio Container (Square 1:1 or adaptive) */}
      <div className="relative w-full aspect-square max-h-[460px] overflow-hidden flex items-center justify-center bg-zinc-950/20">
        {/* Animated Generation Surface: Flowing Pink -> Purple -> Blue Gradient */}
        <div
          className={`absolute inset-0 ${
            generationEffects === 'off'
              ? 'bg-zinc-100 dark:bg-zinc-900'
              : generationEffects === 'minimal'
              ? 'bg-gradient-to-br from-pink-500/15 via-purple-500/15 to-blue-500/15 dark:from-pink-950/30 dark:via-purple-950/30 dark:to-blue-950/30'
              : 'aestific-image-surface'
          } transition-opacity duration-700 ${
            imageLoaded && hasImages ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {/* Subtle Scanning Light Sweep (Full mode only) */}
          {generationEffects === 'full' && (
            <div
              className="absolute inset-0 w-full h-[200%] pointer-events-none"
              style={{
                background:
                  'linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.08) 50%, transparent 100%)',
                animation: 'aestific-light-sweep 4.5s ease-in-out infinite',
              }}
            />
          )}

          {/* Ambient Particles / Glowing Orbs (Full mode only) */}
          {generationEffects === 'full' && (
            <>
              <div className="absolute top-1/4 left-1/4 w-32 h-32 rounded-full bg-pink-500/20 blur-2xl animate-pulse pointer-events-none" />
              <div className="absolute bottom-1/4 right-1/4 w-36 h-36 rounded-full bg-blue-500/20 blur-2xl animate-pulse pointer-events-none" style={{ animationDelay: '1.2s' }} />
              <div className="absolute top-1/2 right-1/3 w-28 h-28 rounded-full bg-purple-500/20 blur-2xl animate-pulse pointer-events-none" style={{ animationDelay: '2.4s' }} />
            </>
          )}

          {/* Center Loading Badge - Always Visible across Full, Minimal, and Off */}
          {(!imageLoaded || !hasImages) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
              {/* Outer ring */}
              <div className="relative mb-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    generationEffects === 'off'
                      ? 'bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-200'
                      : 'bg-black/40 dark:bg-white/10 backdrop-blur-md border border-white/20 shadow-lg text-pink-400'
                  }`}
                  style={generationEffects === 'full' ? { animation: 'aestific-pulse-soft 2.5s ease-in-out infinite' } : undefined}
                >
                  <Sparkles
                    className={`w-6 h-6 ${
                      generationEffects === 'full'
                        ? 'animate-spin text-pink-400'
                        : generationEffects === 'minimal'
                        ? 'text-pink-400'
                        : 'text-zinc-600 dark:text-zinc-300'
                    }`}
                    style={generationEffects === 'full' ? { animationDuration: '6s' } : undefined}
                  />
                </div>
                {/* Flowing Accent Ring (Full mode only) */}
                {generationEffects === 'full' && (
                  <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 opacity-40 blur-xs -z-10 animate-pulse" />
                )}
              </div>

              {/* Status Label - Always Visible */}
              <div className="space-y-1.5 max-w-xs">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white tracking-wide flex items-center justify-center gap-1.5">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      generationEffects === 'off' ? 'bg-zinc-500 dark:bg-zinc-400' : 'bg-pink-500'
                    } ${generationEffects === 'full' ? 'animate-ping' : ''}`}
                  />
                  {label}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                  Aestific Visual Engine
                </p>
              </div>

              {/* Prompt snippet preview - Always Visible */}
              {imageGen.prompt && (
                <div
                  className={`mt-4 px-3 py-1.5 rounded-lg max-w-[280px] ${
                    generationEffects === 'off'
                      ? 'bg-zinc-200/90 dark:bg-zinc-800/90 border border-zinc-300 dark:border-white/10'
                      : 'bg-black/30 dark:bg-black/40 backdrop-blur-xs border border-white/10'
                  }`}
                >
                  <p
                    className={`text-[11px] truncate italic ${
                      generationEffects === 'off'
                        ? 'text-zinc-700 dark:text-zinc-300'
                        : 'text-zinc-300'
                    }`}
                  >
                    "{imageGen.prompt}"
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Generated Image(s) Display */}
        {hasImages && (
          isMulti && activeVariationIndex === null ? (
            /* Multi-Image Grid View */
            <div className={`w-full h-full p-2 grid ${imagesList.length === 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2'} gap-2 z-10`}>
              {imagesList.map((url, idx) => (
                <div
                  key={idx}
                  className="relative group rounded-xl overflow-hidden bg-black/40 border border-white/10 aspect-square flex items-center justify-center cursor-pointer shadow-sm"
                  onClick={() => onPreviewImage ? onPreviewImage(url) : setActiveVariationIndex(idx)}
                >
                  <img
                    src={getAuthMediaUrl(url)}
                    alt={`${imageGen.prompt || 'Generated Variation'} #${idx + 1}`}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onLoad={() => handleSingleImageLoaded(idx)}
                    className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
                      loadedImages[idx] ? 'opacity-100 filter-none' : 'opacity-0 filter blur-lg'
                    }`}
                  />
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] font-mono text-white/90 border border-white/10 pointer-events-none">
                    #{idx + 1}
                  </div>
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveVariationIndex(idx);
                      }}
                      className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-transform hover:scale-110"
                      title="Focus view"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    {onPreviewImage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewImage(url);
                        }}
                        className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-transform hover:scale-110"
                        title="Fullscreen preview"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <a
                      href={getAuthMediaUrl(url)}
                      download={`aestific-variation-${idx + 1}.jpg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-transform hover:scale-110"
                      title="Download image"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Single Image View (or active focused variation) */
            <div className="relative w-full h-full z-10">
              <img
                src={getAuthMediaUrl(isMulti && activeVariationIndex !== null ? imagesList[activeVariationIndex] : imagesList[0])}
                alt={imageGen.prompt || 'Generated AI Artwork'}
                referrerPolicy="no-referrer"
                onLoad={() => setImageLoaded(true)}
                onClick={() => {
                  const targetUrl = getAuthMediaUrl(isMulti && activeVariationIndex !== null ? imagesList[activeVariationIndex] : imagesList[0]);
                  if (onPreviewImage) onPreviewImage(targetUrl);
                }}
                className={`w-full h-full object-cover cursor-pointer transition-all duration-700 ease-out ${
                  imageLoaded
                    ? 'opacity-100 filter-none scale-100'
                    : 'opacity-0 filter blur-xl scale-105'
                }`}
              />
              {isMulti && (
                <button
                  type="button"
                  onClick={() => setActiveVariationIndex(null)}
                  className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[11px] font-medium border border-white/15 transition-all shadow-md"
                >
                  <Grid className="w-3 h-3" />
                  <span>Show All ({imagesList.length})</span>
                </button>
              )}
            </div>
          )
        )}

        {/* Error State */}
        {imageGen.phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-black/50 backdrop-blur-xs">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-red-300 mb-1">
              Generation Encountered an Issue
            </p>
            <p className="text-xs text-zinc-400 max-w-xs">
              {imageGen.error || 'Please try again in a few moments.'}
            </p>
          </div>
        )}
      </div>

      {/* Interactive Footer Toolbar */}
      <div className="p-2.5 flex items-center justify-between text-xs bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs border-t border-zinc-200 dark:border-white/10">
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-500 dark:text-pink-400 border border-pink-500/20 shrink-0">
            Aestific Visual
          </span>
          {isMulti && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20 shrink-0">
              {imagesList.length} Variations
            </span>
          )}
          <span
            className="text-zinc-700 dark:text-zinc-300 text-[11px] truncate max-w-[200px] select-text"
            title={imageGen.prompt}
          >
            {imageGen.prompt || 'AI Artwork'}
          </span>
        </div>

        {hasImages && imageLoaded && (
          <div className="flex items-center gap-1.5 shrink-0">
            {isMulti && activeVariationIndex !== null && (
              <button
                type="button"
                onClick={() => setActiveVariationIndex(null)}
                className="p-1 rounded text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                title="View grid"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
            )}

            {onPreviewImage && (
              <button
                type="button"
                onClick={() => {
                  const targetUrl = getAuthMediaUrl(isMulti && activeVariationIndex !== null ? imagesList[activeVariationIndex] : imagesList[0]);
                  onPreviewImage(targetUrl);
                }}
                className="p-1 rounded text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                title="Preview fullscreen"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyPrompt}
              className="p-1 rounded text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
              title="Copy prompt"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <span className="text-[11px] px-1 font-mono">Prompt</span>}
            </button>

            <a
              href={getAuthMediaUrl(isMulti && activeVariationIndex !== null ? imagesList[activeVariationIndex] : imagesList[0])}
              download={`aestific-artwork${activeVariationIndex !== null ? `-${activeVariationIndex + 1}` : ''}.jpg`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-pink-500 px-2 py-0.5 rounded bg-white/70 dark:bg-white/5 border border-zinc-200 dark:border-white/5 transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>Save</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
