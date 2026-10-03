import React, { useEffect, useCallback } from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  onComplete: () => void;
  minDuration?: number;
}

// Exact geometric contour of the Aestific mark forming the stylized lowercase 'a'
const AESTIFIC_PATH =
  'M 54 79.5 A 32 32 0 1 1 82 48 L 82 64 A 7.5 7.5 0 0 1 67 64 L 67 48 A 17 17 0 0 0 33 48 A 17 17 0 0 0 67 48';

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onComplete,
  minDuration = 2800,
}) => {
  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Keyboard shortcut (Escape, Space, Enter to skip)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleComplete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleComplete]);

  // Sequence timer to complete brand intro
  useEffect(() => {
    const timer = setTimeout(() => {
      handleComplete();
    }, minDuration);

    return () => clearTimeout(timer);
  }, [minDuration, handleComplete]);

  return (
    <motion.div
      key="aestific-splash"
      initial={{ opacity: 1 }}
      exit={{
        opacity: 0,
        scale: 0.992,
        filter: 'blur(3px)',
      }}
      transition={{
        duration: 0.65,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black select-none overflow-hidden cursor-default"
      style={{ backgroundColor: '#000000' }}
    >
      {/* 1. Subtle, unobtrusive skip control */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        whileHover={{ opacity: 0.9 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        onClick={handleComplete}
        className="absolute top-7 right-8 text-[11px] font-mono tracking-widest text-zinc-500 hover:text-zinc-200 transition-opacity cursor-pointer bg-transparent border-none p-0 focus:outline-none"
        aria-label="Skip intro"
      >
        esc / skip
      </motion.button>

      {/* Main Brand Stage */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center">
        {/* 2, 3 & 4: Vivid Chromatic Awakening of the 'a' Symbol */}
        <div className="relative flex items-center justify-center">
          {/* Subtle Ambient Chromatic Hue reacting to the 'a' symbol */}
          <motion.div
            className="absolute -inset-10 rounded-full pointer-events-none"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{
              opacity: [0, 0.22, 0.35, 0.28, 0.25],
              scale: [0.85, 1.05, 1.15, 1.08, 1],
              background: [
                'radial-gradient(circle at 45% 75%, #FF007A 0%, transparent 65%)',
                'radial-gradient(circle at 35% 35%, #A855F7 0%, transparent 65%)',
                'radial-gradient(circle at 75% 45%, #2563EB 0%, transparent 65%)',
                'radial-gradient(circle at 50% 50%, #00F0FF 0%, transparent 65%)',
                'radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.18) 0%, transparent 70%)',
              ],
            }}
            transition={{
              duration: 1.6,
              delay: 0.25,
              times: [0, 0.3, 0.6, 0.85, 1],
              ease: 'easeInOut',
            }}
            style={{ filter: 'blur(32px)' }}
          />

          {/* SVG Symbol Container - clearly sized and sharp */}
          <div className="relative w-[92px] h-[92px] sm:w-[104px] sm:h-[104px]">
            <svg
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full relative z-10 overflow-visible"
            >
              <defs>
                {/* Vivid Pink → Purple → Blue → Neon Cyan gradient that permanently illuminates the 'a' */}
                <linearGradient id="aSymbolVividGradient" x1="5%" y1="95%" x2="95%" y2="5%">
                  <stop offset="0%" stopColor="#FF007A" />
                  <stop offset="32%" stopColor="#A855F7" />
                  <stop offset="68%" stopColor="#2563EB" />
                  <stop offset="100%" stopColor="#00F0FF" />
                </linearGradient>

                {/* Soft glow filter for the chromatic beam */}
                <filter id="aSymbolGlow" x="-35%" y="-35%" width="170%" height="170%">
                  <feGaussianBlur stdDeviation="3.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Step A: Faint dormant guide trace so the geometric shape is subtly perceptible */}
              <motion.path
                d={AESTIFIC_PATH}
                stroke="rgba(255, 255, 255, 0.09)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, delay: 0.1 }}
              />

              {/* Step B: Chromatic Glow Aura Layer (Pink → Purple → Blue → Neon Cyan) */}
              <motion.path
                d={AESTIFIC_PATH}
                stroke="url(#aSymbolVividGradient)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#aSymbolGlow)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: 1,
                  opacity: [0, 0.75, 0.65],
                }}
                transition={{
                  duration: 1.25,
                  delay: 0.25,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />

              {/* Step C: Vivid, High-Clarity Awakened 'a' Stroke (Rich Color Gradient that STAYS VISIBLE) */}
              <motion.path
                d={AESTIFIC_PATH}
                stroke="url(#aSymbolVividGradient)"
                strokeWidth="7.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: 1,
                  opacity: 1,
                }}
                transition={{
                  duration: 1.25,
                  delay: 0.25,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />

              {/* Step D: Bright Traveling Spark Node guiding the eye as the letter 'a' awakens */}
              <motion.path
                d={AESTIFIC_PATH}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{
                  pathLength: 0.14,
                  pathOffset: 0,
                  opacity: 0,
                }}
                animate={{
                  pathLength: [0.14, 0.25, 0.18, 0.04],
                  pathOffset: [0, 0.35, 0.75, 1.0],
                  opacity: [0, 1, 0.9, 0],
                }}
                transition={{
                  duration: 1.25,
                  delay: 0.25,
                  ease: [0.22, 1, 0.36, 1],
                  times: [0, 0.35, 0.75, 1],
                }}
              />
            </svg>
          </div>
        </div>

        {/* 5. Reveal the "aestific" wordmark in crisp, classic monochrome (like before, without gradient) */}
        <motion.div
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{
            duration: 0.65,
            delay: 1.1,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="mt-6 sm:mt-7 flex items-center justify-center"
        >
          <span
            className="text-white text-3xl sm:text-[38px] md:text-[42px] font-medium lowercase leading-none select-none tracking-[0.26em] sm:tracking-[0.28em]"
            style={{
              fontFamily: "'Comfortaa', 'Outfit', system-ui, -apple-system, sans-serif",
            }}
          >
            aestific
          </span>
        </motion.div>

        {/* 6. Reveal the tagline: "Where intelligence takes form." */}
        <motion.div
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{
            duration: 0.6,
            delay: 1.5,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="mt-3.5 sm:mt-4 flex items-center justify-center"
        >
          <p
            className="text-zinc-400 text-xs sm:text-sm font-normal tracking-[0.16em] sm:tracking-[0.18em] select-none"
            style={{
              fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            }}
          >
            Where intelligence takes form.
          </p>
        </motion.div>
      </div>

      {/* 7. Sleek Pink → Purple → Blue → Neon border at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none flex flex-col items-center">
        {/* Soft diffused glow above the bottom line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0.35] }}
          transition={{ delay: 0.4, duration: 1.1, ease: 'easeOut' }}
          className="w-full max-w-4xl h-3"
          style={{
            background:
              'radial-gradient(ellipse at bottom, rgba(168, 85, 247, 0.35) 0%, rgba(0, 240, 255, 0.2) 50%, transparent 80%)',
            filter: 'blur(8px)',
          }}
        />

        {/* Precision Laser Accent Line: Pink → Purple → Blue → Neon Cyan */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0.25 }}
          animate={{ opacity: [0, 0.95, 0.85], scaleX: 1 }}
          transition={{
            delay: 0.3,
            duration: 1.1,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="w-full h-[1.5px] sm:h-[2px]"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,0,122,0.2) 8%, #FF007A 22%, #A855F7 45%, #2563EB 70%, #00F0FF 90%, transparent 100%)',
            boxShadow:
              '0 -1px 12px rgba(255, 0, 122, 0.35), 0 -1px 16px rgba(0, 240, 255, 0.3)',
          }}
        />
      </div>
    </motion.div>
  );
};
