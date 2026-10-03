import React, { useRef } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
} from 'motion/react';
import { AestificLogo, AestificArchIcon } from './AestificLogo';
import { User } from '../types';

interface CinematicLandingPageProps {
  user: User | null;
  onGetStarted: () => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onStartWithPrompt: (prompt: string) => void;
}

export const CinematicLandingPage: React.FC<CinematicLandingPageProps> = ({
  onOpenAuth,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleOpenSignUp = () => {
    onOpenAuth('register');
  };

  const scrollToTop = () => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ===========================================================================
  // SCROLL = CONTROLLED, SILKY CAMERA TIMELINE
  // ===========================================================================
  const { scrollYProgress } = useScroll({
    container: scrollContainerRef,
  });

  // High-damping spring for composed, unhurried, film-grade interpolation
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 48,
    damping: 26,
    mass: 0.45,
    restDelta: 0.00005,
  });

  // ===========================================================================
  // GLOBAL BACKGROUND POLARITY
  // - First Screen (0.00 -> 0.14): Clean WHITE (#ffffff)
  // - Cinematic Scroll Sections (0.19 -> 0.84): Pure BLACK (#000000)
  // - Final Section (0.89 -> 1.00): Clean WHITE (#ffffff)
  // ===========================================================================
  const pageBackground = useTransform(
    smoothProgress,
    [0.0, 0.13, 0.19, 0.84, 0.90, 1.0],
    ['#ffffff', '#ffffff', '#000000', '#000000', '#ffffff', '#ffffff']
  );

  // Top Header (First Screen only: Logo + Name on left, "Get Started" on right)
  const headerOpacity = useTransform(smoothProgress, [0.0, 0.10, 0.15], [1, 1, 0]);
  const headerPointerEvents = useTransform(smoothProgress, (v) =>
    v < 0.14 ? 'auto' : 'none'
  );

  // ===========================================================================
  // FIRST SCREEN: CENTERED BLACK CINEMATIC HERO BOX (0.00 -> 0.22)
  // Calm -> Controlled camera zoom into the screen
  // ===========================================================================
  const heroStageOpacity = useTransform(smoothProgress, [0.0, 0.16, 0.21], [1, 1, 0]);
  const heroStagePointerEvents = useTransform(smoothProgress, (v) =>
    v < 0.20 ? 'auto' : 'none'
  );

  // Subtle, purposeful camera push into the black box as scroll begins
  const heroBoxScale = useTransform(
    smoothProgress,
    [0.0, 0.08, 0.19],
    [1.0, 1.03, 1.36]
  );
  const heroBoxRadius = useTransform(
    smoothProgress,
    [0.0, 0.12, 0.19],
    ['32px', '28px', '0px']
  );

  // Inner composition subtle parallax inside the Hero Box
  const heroInnerScale = useTransform(smoothProgress, [0.0, 0.19], [1.0, 1.08]);
  const heroInnerOpacity = useTransform(smoothProgress, [0.0, 0.14, 0.19], [1, 1, 0]);

  // "scroll to explore" below the Hero Box
  const scrollCueOpacity = useTransform(smoothProgress, [0.0, 0.06, 0.11], [1, 0.7, 0]);
  const scrollCueY = useTransform(smoothProgress, [0.0, 0.11], [0, 10]);

  // ===========================================================================
  // SCROLL SECTION 1 (0.20 -> 0.44): CALM ARCHITECTURAL DEPTH
  // Slow camera drift, abstract geometric light aperture, small Comfortaa text
  // ===========================================================================
  const s1Opacity = useTransform(smoothProgress, [0.19, 0.24, 0.39, 0.44], [0, 1, 1, 0]);
  const s1Scale = useTransform(smoothProgress, [0.19, 0.32, 0.44], [0.95, 1.0, 1.06]);
  const s1TextY = useTransform(smoothProgress, [0.20, 0.26, 0.39, 0.44], [14, 0, 0, -12]);
  const s1LightScale = useTransform(smoothProgress, [0.19, 0.44], [0.9, 1.12]);

  // ===========================================================================
  // SCROLL SECTION 2 (0.42 -> 0.66): THE AESTIFIC SCREEN IN SPACE
  // Subtle perspective parallax of a minimal monochrome Aestific frame
  // ===========================================================================
  const s2Opacity = useTransform(smoothProgress, [0.42, 0.47, 0.61, 0.66], [0, 1, 1, 0]);
  const s2Scale = useTransform(smoothProgress, [0.42, 0.54, 0.66], [0.96, 1.0, 1.05]);
  const s2FrameY = useTransform(smoothProgress, [0.42, 0.54, 0.66], [18, 0, -16]);
  const s2TextOpacity = useTransform(smoothProgress, [0.45, 0.49, 0.60, 0.65], [0, 1, 1, 0]);
  const s2TextY = useTransform(smoothProgress, [0.45, 0.50, 0.60, 0.65], [12, 0, 0, -10]);

  // ===========================================================================
  // SCROLL SECTION 3 (0.64 -> 0.86): QUIET CONVERGENCE
  // Controlled camera zoom toward the luminous Aestific emblem before stillness
  // ===========================================================================
  const s3Opacity = useTransform(smoothProgress, [0.64, 0.69, 0.81, 0.86], [0, 1, 1, 0]);
  const s3Scale = useTransform(smoothProgress, [0.64, 0.75, 0.86], [0.94, 1.0, 1.14]);
  const s3RingScale = useTransform(smoothProgress, [0.64, 0.86], [0.88, 1.22]);
  const s3TextY = useTransform(smoothProgress, [0.66, 0.71, 0.81, 0.86], [14, 0, 0, -12]);

  // ===========================================================================
  // FINAL SECTION (0.88 -> 1.00): CLEAN WHITE BACKGROUND
  // Centered black small elegant typography: "welcome to the aestific era"
  // Below it: "generate intelligence" final CTA
  // ===========================================================================
  const finalOpacity = useTransform(smoothProgress, [0.88, 0.93, 1.0], [0, 1, 1]);
  const finalPointerEvents = useTransform(smoothProgress, (v) =>
    v >= 0.88 ? 'auto' : 'none'
  );
  const finalY = useTransform(smoothProgress, [0.88, 0.94, 1.0], [16, 0, 0]);

  return (
    <div
      ref={scrollContainerRef}
      className="relative h-[100dvh] w-full overflow-y-auto overflow-x-hidden bg-white selection:bg-black selection:text-white scroll-smooth"
    >
      {/* =====================================================================
          FIRST SCREEN TOP NAVIGATION
          - Top-Left: Existing official Aestific logo + Aestific name beside it
          - Top-Right: ONLY "Get Started" button
          - Nothing else.
         ===================================================================== */}
      <motion.header
        style={{
          opacity: headerOpacity,
          pointerEvents: headerPointerEvents,
        }}
        className="fixed top-0 left-0 right-0 z-50 h-20 px-6 sm:px-12 flex items-center justify-between"
      >
        <button
          onClick={scrollToTop}
          className="flex items-center focus:outline-none cursor-pointer"
          aria-label="Aestific"
        >
          <AestificLogo size="sm" variant="horizontal" color="#000000" />
        </button>

        <button
          onClick={handleOpenSignUp}
          className="px-5 py-2 rounded-full bg-black text-white hover:bg-zinc-800 text-xs font-normal lowercase tracking-[0.14em] transition-colors cursor-pointer whitespace-nowrap"
          style={{ fontFamily: "'Comfortaa', cursive, sans-serif" }}
        >
          get started
        </button>
      </motion.header>

      {/* =====================================================================
          CONTINUOUS SCROLL TIMELINE
         ===================================================================== */}
      <div className="relative w-full h-[1600vh]">
        <motion.div
          style={{ backgroundColor: pageBackground }}
          className="sticky top-0 h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-center select-none"
        >
          {/* =================================================================
              FIRST SCREEN — CENTERED BLACK CINEMATIC HERO BOX
             ================================================================= */}
          <motion.div
            style={{
              opacity: heroStageOpacity,
              pointerEvents: heroStagePointerEvents,
            }}
            className="absolute inset-0 flex flex-col items-center justify-center px-5 sm:px-10 pt-6"
          >
            {/* Large Centered Black Cinematic Box */}
            <motion.div
              style={{
                scale: heroBoxScale,
                borderRadius: heroBoxRadius,
              }}
              className="relative w-full max-w-[1060px] aspect-[16/9] max-h-[64vh] bg-[#050506] shadow-[0_32px_90px_rgba(0,0,0,0.22),0_8px_24px_rgba(0,0,0,0.10)] overflow-hidden flex items-center justify-center"
            >
              {/* Subtle Glass Rim */}
              <div className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.12] pointer-events-none z-20" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-[1px] bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none z-20" />

              {/* Internal Abstract Cinematic Design Treatment */}
              <motion.div
                style={{
                  scale: heroInnerScale,
                  opacity: heroInnerOpacity,
                }}
                className="relative w-full h-full flex flex-col items-center justify-center px-8 text-center"
              >
                {/* Controlled Volumetric Light Horizon */}
                <motion.div
                  animate={{ opacity: [0.55, 0.78, 0.55] }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(ellipse 58% 46% at 50% 44%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.03) 52%, transparent 80%)',
                  }}
                />

                {/* Elegant Animated Circular Geometric Design Behind the Text */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {/* Soft Breathing Core Halo */}
                  <motion.div
                    animate={{
                      scale: [0.94, 1.08, 0.94],
                      opacity: [0.45, 0.85, 0.45],
                    }}
                    transition={{
                      duration: 5.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="absolute w-[340px] sm:w-[460px] aspect-square rounded-full"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 45%, transparent 72%)',
                      filter: 'blur(16px)',
                    }}
                  />

                  {/* Outer Architectural Ring with Smooth Orbital Rotation & Breathing Scale */}
                  <motion.div
                    animate={{
                      rotate: 360,
                      scale: [0.98, 1.04, 0.98],
                    }}
                    transition={{
                      rotate: { duration: 28, repeat: Infinity, ease: 'linear' },
                      scale: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
                    }}
                    className="relative w-[380px] sm:w-[520px] aspect-square rounded-full flex items-center justify-center"
                  >
                    <svg viewBox="0 0 500 500" className="w-full h-full overflow-visible">
                      <defs>
                        <linearGradient id="outerOrbitalGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.08" />
                          <stop offset="70%" stopColor="#ffffff" stopOpacity="0.0" />
                          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.28" />
                        </linearGradient>
                      </defs>
                      <circle
                        cx="250"
                        cy="250"
                        r="230"
                        fill="none"
                        stroke="url(#outerOrbitalGlow)"
                        strokeWidth="1.2"
                      />
                      <circle
                        cx="250"
                        cy="250"
                        r="230"
                        fill="none"
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth="1.5"
                        strokeDasharray="90 280"
                        strokeLinecap="round"
                      />
                    </svg>
                  </motion.div>

                  {/* Middle Counter-Rotating Luminous Eclipse Ring */}
                  <motion.div
                    animate={{
                      rotate: -360,
                      scale: [1.03, 0.96, 1.03],
                    }}
                    transition={{
                      rotate: { duration: 20, repeat: Infinity, ease: 'linear' },
                      scale: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
                    }}
                    className="absolute w-[270px] sm:w-[370px] aspect-square rounded-full flex items-center justify-center"
                  >
                    <svg viewBox="0 0 400 400" className="w-full h-full overflow-visible">
                      <defs>
                        <linearGradient id="innerEclipseArc" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.0" />
                          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.65" />
                          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <circle
                        cx="200"
                        cy="200"
                        r="185"
                        fill="none"
                        stroke="rgba(255,255,255,0.09)"
                        strokeWidth="1"
                      />
                      <circle
                        cx="200"
                        cy="200"
                        r="185"
                        fill="none"
                        stroke="url(#innerEclipseArc)"
                        strokeWidth="2"
                        strokeDasharray="160 420"
                        strokeLinecap="round"
                      />
                    </svg>
                  </motion.div>

                  {/* Inner Pulsing Halo Ring */}
                  <motion.div
                    animate={{
                      scale: [0.92, 1.06, 0.92],
                      opacity: [0.35, 0.75, 0.35],
                    }}
                    transition={{
                      duration: 4.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="absolute w-[180px] sm:w-[240px] aspect-square rounded-full border border-white/[0.16] shadow-[0_0_50px_rgba(255,255,255,0.08),inset_0_0_30px_rgba(255,255,255,0.06)]"
                  />

                  {/* Subtle Horizon Line */}
                  <motion.div
                    animate={{ opacity: [0.25, 0.55, 0.25], scaleX: [0.92, 1.04, 0.92] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute w-[64%] max-w-[520px] h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  />
                </div>

                {/* Foreground Composition: Official Mark + Small Lowercase Comfortaa Text */}
                <div className="relative z-10 flex flex-col items-center">
                  <div className="mb-6 opacity-95">
                    <AestificArchIcon size={28} className="text-white" />
                  </div>

                  <h1
                    className="text-sm sm:text-lg md:text-xl font-light lowercase tracking-[0.20em] text-white leading-relaxed"
                    style={{ fontFamily: "'Comfortaa', cursive, sans-serif" }}
                  >
                    dive into intelligence with aestific
                  </h1>
                </div>
              </motion.div>
            </motion.div>

            {/* Below the Hero Box: Pure Dark Black, High-Visibility "scroll to explore" */}
            <motion.div
              style={{
                opacity: scrollCueOpacity,
                y: scrollCueY,
              }}
              className="mt-7 sm:mt-8 flex flex-col items-center gap-2.5 pointer-events-none"
            >
              <motion.div
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="flex flex-col items-center gap-2"
              >
                <span
                  className="text-xs sm:text-sm font-bold lowercase tracking-[0.26em] text-black drop-shadow-[0_1px_1px_rgba(0,0,0,0.08)]"
                  style={{
                    fontFamily: "'Comfortaa', cursive, sans-serif",
                    color: '#000000',
                  }}
                >
                  scroll to explore
                </span>

                {/* Crisp Dark Black Animated Scroll Indicator */}
                <div className="flex flex-col items-center gap-1">
                  <div className="w-5 h-8 rounded-full border-2 border-black flex items-start justify-center p-1 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.12)]">
                    <motion.div
                      animate={{ y: [0, 10, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-1.5 h-2 rounded-full bg-black"
                    />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* =================================================================
              SCROLL SECTION 1 (0.20 -> 0.44) — BLACK BG + WHITE TYPOGRAPHY
              Minimal Geometric Light Aperture & Calm Reveal
             ================================================================= */}
          <motion.div
            style={{
              opacity: s1Opacity,
              scale: s1Scale,
            }}
            className="absolute inset-0 flex flex-col items-center justify-center px-6 pointer-events-none"
          >
            {/* Abstract Geometric Light Composition */}
            <motion.div
              style={{ scale: s1LightScale }}
              className="relative w-[260px] sm:w-[340px] aspect-square flex items-center justify-center mb-10"
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.02) 55%, transparent 75%)',
                }}
              />
              <div className="w-full h-full rounded-full border border-white/[0.08]" />
              <div className="absolute w-[70%] h-[70%] rounded-full border border-white/[0.14]" />
              <div className="w-2 h-2 rounded-full bg-white/80 shadow-[0_0_24px_6px_rgba(255,255,255,0.4)]" />
            </motion.div>

            <motion.div
              style={{ y: s1TextY }}
              className="flex flex-col items-center text-center space-y-3"
            >
              <p
                className="text-sm sm:text-lg md:text-xl font-light lowercase tracking-[0.20em] text-white"
                style={{ fontFamily: "'Comfortaa', cursive, sans-serif" }}
              >
                clarity in every thought
              </p>
              <p
                className="text-[11px] sm:text-xs font-light lowercase tracking-[0.18em] text-zinc-400"
                style={{ fontFamily: "'Comfortaa', cursive, sans-serif" }}
              >
                where reasoning meets form
              </p>
            </motion.div>
          </motion.div>

          {/* =================================================================
              SCROLL SECTION 2 (0.42 -> 0.66) — BLACK BG + WHITE TYPOGRAPHY
              Refined Monochrome Screen Frame & Parallax Depth
             ================================================================= */}
          <motion.div
            style={{
              opacity: s2Opacity,
              scale: s2Scale,
            }}
            className="absolute inset-0 flex flex-col items-center justify-center px-6 pointer-events-none"
          >
            {/* Minimalist Cinematic Screen Frame */}
            <motion.div
              style={{ y: s2FrameY }}
              className="relative w-full max-w-[680px] aspect-[16/9] rounded-[24px] bg-[#070709] border border-white/[0.12] shadow-[0_30px_90px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col justify-between p-6 sm:p-9 mb-10"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />

              {/* Top minimal header inside screen */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 opacity-80">
                  <AestificArchIcon size={16} className="text-white" />
                  <span
                    className="text-[11px] font-light lowercase tracking-[0.22em] text-white"
                    style={{ fontFamily: "'Comfortaa', cursive, sans-serif" }}
                  >
                    aestific
                  </span>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
              </div>

              {/* Center clean abstract dialogue geometry */}
              <div className="my-auto space-y-4 max-w-md mx-auto w-full">
                <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <p
                  className="text-xs sm:text-sm font-light lowercase tracking-[0.14em] text-zinc-300 text-center leading-relaxed"
                  style={{ fontFamily: "'Comfortaa', cursive, sans-serif" }}
                >
                  understanding context, memory, and creation within a single quiet space
                </p>
                <div className="h-[1px] w-2/3 mx-auto bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>

              {/* Bottom subtle bar */}
              <div className="h-8 rounded-full bg-white/[0.03] border border-white/[0.07] flex items-center px-4 justify-between">
                <span
                  className="text-[10px] font-light lowercase tracking-[0.18em] text-zinc-500"
                  style={{ fontFamily: "'Comfortaa', cursive, sans-serif" }}
                >
                  ask anything
                </span>
                <div className="w-4 h-4 rounded-full bg-white/80" />
              </div>
            </motion.div>

            <motion.p
              style={{
                opacity: s2TextOpacity,
                y: s2TextY,
                fontFamily: "'Comfortaa', cursive, sans-serif",
              }}
              className="text-sm sm:text-lg md:text-xl font-light lowercase tracking-[0.20em] text-white text-center"
            >
              designed for deep understanding
            </motion.p>
          </motion.div>

          {/* =================================================================
              SCROLL SECTION 3 (0.64 -> 0.86) — BLACK BG + WHITE TYPOGRAPHY
              Quiet Convergence Around the Official Aestific Mark
             ================================================================= */}
          <motion.div
            style={{
              opacity: s3Opacity,
              scale: s3Scale,
            }}
            className="absolute inset-0 flex flex-col items-center justify-center px-6 pointer-events-none"
          >
            <motion.div
              style={{ scale: s3RingScale }}
              className="relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center mb-9"
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 70%)',
                }}
              />
              <div className="absolute inset-0 rounded-full border border-white/[0.08]" />
              <AestificArchIcon size={38} className="text-white" />
            </motion.div>

            <motion.p
              style={{
                y: s3TextY,
                fontFamily: "'Comfortaa', cursive, sans-serif",
              }}
              className="text-sm sm:text-lg md:text-xl font-light lowercase tracking-[0.22em] text-white text-center"
            >
              one continuous intelligence
            </motion.p>
          </motion.div>

          {/* =================================================================
              FINAL SECTION (0.88 -> 1.00) — CLEAN WHITE BACKGROUND
              Centered small black Comfortaa typography:
              "welcome to the aestific era"
              Below it: "generate intelligence" final CTA
             ================================================================= */}
          <motion.div
            style={{
              opacity: finalOpacity,
              pointerEvents: finalPointerEvents,
              y: finalY,
            }}
            className="absolute inset-0 bg-white flex flex-col items-center justify-center px-6 z-30"
          >
            <div className="flex flex-col items-center text-center">
              <h2
                className="text-base sm:text-xl md:text-2xl font-light text-black lowercase tracking-[0.20em] mb-8 select-none"
                style={{ fontFamily: "'Comfortaa', cursive, sans-serif" }}
              >
                welcome to the aestific era
              </h2>

              <button
                onClick={handleOpenSignUp}
                className="px-7 py-3.5 rounded-full bg-black text-white hover:bg-zinc-800 text-xs sm:text-sm font-light lowercase tracking-[0.18em] transition-all cursor-pointer whitespace-nowrap shadow-[0_12px_36px_rgba(0,0,0,0.14)]"
                style={{ fontFamily: "'Comfortaa', cursive, sans-serif" }}
              >
                generate intelligence
              </button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default CinematicLandingPage;
