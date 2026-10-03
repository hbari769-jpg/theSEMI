import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, FileText, CheckCircle2, ArrowRight, Sparkles, ExternalLink } from 'lucide-react';
import { AestificLogo } from './AestificLogo';

interface TermsBannerProps {
  isOpen: boolean;
  onAccept: () => void;
  onOpenFullTerms: () => void;
}

export const TermsBanner: React.FC<TermsBannerProps> = ({
  isOpen,
  onAccept,
  onOpenFullTerms,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-xl bg-white dark:bg-[#0e0e12] border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden text-zinc-900 dark:text-zinc-100 max-h-[92dvh] overflow-y-auto"
      >
        <div className="p-4 sm:p-7 relative z-10">
          {/* Header with Logo & Notification Badge */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <AestificLogo size="sm" showSubtitle={false} />
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-white/10">
                  <Sparkles className="w-3 h-3 text-zinc-600 dark:text-zinc-400" />
                  Terms & Conditions
                </span>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight mt-1">
                  Welcome to Aestific
                </h3>
              </div>
            </div>
            <div className="hidden sm:flex p-2 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          {/* Banner Summary / Excerpt Content */}
          <div className="space-y-3 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl p-4 mb-5">
            <p className="leading-relaxed">
              Before exploring the intelligence suite, please review and agree to our updated policies. By continuing to use Aestific, you acknowledge and agree to our{' '}
              <button
                type="button"
                onClick={onOpenFullTerms}
                className="inline-flex items-center gap-1 text-zinc-950 dark:text-white font-semibold underline underline-offset-4 decoration-zinc-400 hover:decoration-zinc-900 dark:decoration-zinc-500 dark:hover:decoration-white transition-colors cursor-pointer group"
              >
                <span>Terms &amp; Conditions</span>
                <ExternalLink className="w-3.5 h-3.5 inline group-hover:translate-x-0.5 transition-transform" />
              </button>
              .
            </p>

            <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 border-t border-zinc-200 dark:border-white/10 pt-2.5">
              <li className="flex items-start gap-2">
                <span className="text-zinc-900 dark:text-white font-bold">•</span>
                <span><strong className="text-zinc-900 dark:text-zinc-200">AI Responses:</strong> Responses are generated via advanced AI models and should be verified for critical matters.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-900 dark:text-white font-bold">•</span>
                <span><strong className="text-zinc-900 dark:text-zinc-200">Acceptable Use:</strong> Lawful, safe, and respectful usage is strictly required across all workspaces.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-900 dark:text-white font-bold">•</span>
                <span><strong className="text-zinc-900 dark:text-zinc-200">Privacy &amp; Data:</strong> Your credentials and data security are governed by our platform standards.</span>
              </li>
            </ul>
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenFullTerms}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 border border-transparent hover:border-zinc-200 dark:hover:border-white/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              <span>Read Full Document</span>
            </button>

            <button
              type="button"
              onClick={onAccept}
              className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 shadow-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Accept all of it</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
