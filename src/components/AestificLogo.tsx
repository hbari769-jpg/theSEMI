import React from 'react';

export interface AestificLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero';
  variant?: 'auto' | 'stacked' | 'horizontal' | 'mark-only' | 'hero';
  glow?: boolean;
  showTagline?: boolean;
  showSubtitle?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  color?: string;
}

/**
 * Exact Aestific Brand Icon Emblem:
 * - Continuous circular stroke starting at the bottom (with rounded terminal)
 * - Curves around bottom-left, up the left side, over the top arch, and down the right
 * - Smooth U-turn at bottom right into the vertical stem
 * - Inner concentric lowercase 'a' circular bowl
 * - Dynamic color: pure black on white backgrounds, pure white on black backgrounds
 */
export const AestificArchIcon: React.FC<{
  className?: string;
  size?: number | string;
  color?: string;
}> = ({ className = '', size, color }) => {
  const hasCustomTextColor = className.includes('text-');
  const defaultTextClass = color || hasCustomTextColor ? '' : 'text-black dark:text-white';

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 transition-colors ${defaultTextClass} ${className}`}
      style={{
        ...(color ? { color } : {}),
        ...(size ? { width: size, height: size } : {}),
      }}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full relative z-10 overflow-visible"
      >
        {/* Exact Aestific continuous geometric icon mark */}
        <path
          d="M 54 79.5 A 32 32 0 1 1 82 48 L 82 64 A 7.5 7.5 0 0 1 67 64 L 67 48 A 17 17 0 0 0 33 48 A 17 17 0 0 0 67 48"
          stroke="currentColor"
          strokeWidth="6.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export const AestificMarkIcon = AestificArchIcon;

/**
 * Master Aestific Logo Component
 * - Exact reproduction of the brand logo
 * - Responsive to light/dark themes:
 *   - Background white -> logo & text are pure BLACK
 *   - Background black -> logo & text are pure WHITE
 */
export const AestificLogo: React.FC<AestificLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'auto',
  showSubtitle = false,
  showTagline = false,
  onClick,
  style,
  color,
}) => {
  const isHero = size === 'hero' || variant === 'hero';
  const isLg = size === 'lg';
  const isSm = size === 'sm';
  const isXs = size === 'xs';
  const isMarkOnly = variant === 'mark-only';
  const isStacked = variant === 'stacked' || isHero || isLg;

  const hasCustomTextColor = className.includes('text-');
  const dynamicTextColor = color || hasCustomTextColor ? '' : 'text-black dark:text-white';

  // Mark-only mode (for compact badges, avatars, quick icons)
  if (isMarkOnly || isXs) {
    return (
      <div
        onClick={onClick}
        style={{ color, ...style }}
        className={`relative inline-flex items-center justify-center select-none ${dynamicTextColor} ${
          onClick ? 'cursor-pointer' : ''
        } ${className}`}
      >
        <AestificArchIcon
          size={isXs ? 18 : isSm ? 22 : 28}
          color={color}
          className={`shrink-0 ${hasCustomTextColor ? 'text-current' : ''}`}
        />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{ color, ...style }}
      className={`relative inline-flex ${
        isStacked
          ? 'flex-col items-center justify-center text-center'
          : 'flex-row items-center justify-center gap-2.5 sm:gap-3'
      } select-none ${dynamicTextColor} transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* 1. Exact Signature Emblem Icon */}
      <div
        className={`relative z-10 flex items-center justify-center ${
          isHero ? 'mb-1.5 sm:mb-2' : isLg ? 'mb-1' : ''
        }`}
      >
        <AestificArchIcon
          size={
            isHero
              ? 42
              : isLg
              ? 32
              : isSm
              ? 22
              : 28
          }
          color={color}
          className={hasCustomTextColor ? 'text-current' : ''}
        />
      </div>

      {/* 2. Exact "aestific" Wordmark */}
      <div
        className={`relative z-10 flex flex-col ${
          isStacked ? 'items-center' : 'items-start'
        }`}
      >
        <span
          className={`lowercase font-medium tracking-[0.24em] leading-none select-none transition-colors inline-flex items-baseline ${
            dynamicTextColor
          } ${
            isHero
              ? 'text-2xl sm:text-[26px] md:text-[28px] tracking-[0.22em] pt-0.5'
              : isLg
              ? 'text-xl sm:text-2xl tracking-[0.22em]'
              : isSm
              ? 'text-base sm:text-lg tracking-[0.20em]'
              : 'text-lg sm:text-xl tracking-[0.22em]'
          }`}
          style={{
            fontFamily:
              "'Comfortaa', cursive, sans-serif",
            color: color || (hasCustomTextColor ? 'inherit' : undefined),
          }}
        >
          <span
            className="inline-block"
            style={{
              fontFamily: "'Comfortaa', cursive, sans-serif",
              fontWeight: 500,
            }}
          >
            a
          </span>
          <span
            style={{
              fontFamily: "'Comfortaa', cursive, sans-serif",
              fontWeight: 500,
            }}
          >
            estific
          </span>
        </span>

        {/* Optional Subtitle / Tagline */}
        {(showSubtitle || showTagline) && (
          <div
            className={`flex items-center justify-center gap-1.5 ${
              isHero ? 'mt-2' : 'mt-0.5'
            }`}
          >
            <span
              className={`font-mono font-medium tracking-[0.2em] text-zinc-500 dark:text-zinc-400 uppercase ${
                isHero ? 'text-[10px] sm:text-[11px]' : 'text-[8px]'
              }`}
            >
              AI
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AestificLogo;
