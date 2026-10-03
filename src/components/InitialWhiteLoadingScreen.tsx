import React from 'react';
import { motion } from 'motion/react';
import { AestificArchIcon } from './AestificLogo';

export const InitialWhiteLoadingScreen: React.FC = () => {
  return (
    <motion.div
      key="aestific-initial-white-loader"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        filter: 'blur(4px)',
        scale: 1.01,
        transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
      }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-white text-black select-none overflow-hidden"
      style={{ backgroundColor: '#ffffff' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.94 }}
        animate={{
          opacity: 1,
          y: [16, 0, -3, 0],
          scale: 1,
        }}
        transition={{
          opacity: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
          scale: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 1.6, times: [0, 0.45, 0.75, 1], ease: 'easeInOut' },
        }}
        className="flex flex-col items-center justify-center text-center px-4"
      >
        {/* Emblem */}
        <div className="relative mb-3.5 flex items-center justify-center">
          <AestificArchIcon size={50} className="text-black" />
        </div>

        {/* Wordmark */}
        <div className="flex flex-col items-center">
          <span
            className="lowercase font-medium tracking-[0.24em] text-black leading-none select-none text-2xl sm:text-[26px] inline-flex items-baseline"
            style={{
              fontFamily: "'Comfortaa', 'Outfit', system-ui, -apple-system, sans-serif",
            }}
          >
            <span style={{ fontFamily: "'Comfortaa', 'Outfit', cursive, sans-serif", fontWeight: 500 }}>a</span>
            <span style={{ fontFamily: "'Comfortaa', 'Outfit', cursive, sans-serif", fontWeight: 500 }}>estific</span>
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
};
