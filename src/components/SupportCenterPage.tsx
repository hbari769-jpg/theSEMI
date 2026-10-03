import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Headphones,
  Send,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Shield,
  HelpCircle,
  ChevronRight,
  Inbox,
  User,
  ArrowLeft,
} from 'lucide-react';
import { AestificLogo } from './AestificLogo';
import { authFetch } from '../lib/api';
import { SupportTicket, User as UserType } from '../types';

interface SupportCenterPageProps {
  user: UserType;
  onBackToChat: () => void;
}

export const SupportCenterPage: React.FC<SupportCenterPageProps> = ({ user, onBackToChat }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  const fetchTickets = async () => {
    try {
      setIsLoading(true);
      const res = await authFetch('/api/support');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
        if (selectedTicket) {
          const updated = (data.tickets || []).find((t: SupportTicket) => t.id === selectedTicket.id);
          if (updated) setSelectedTicket(updated);
        }
      }
    } catch (err) {
      console.error('Error fetching support tickets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setSubmitError('Please enter both subject and message.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await authFetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Failed to submit support request.');
        return;
      }

      setSubmitSuccess('Your message has been delivered to Aestific Administration. We will respond shortly.');
      setSubject('');
      setMessage('');
      fetchTickets();
      if (data.ticket) {
        setSelectedTicket(data.ticket);
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col w-screen h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      {/* Top Header Bar */}
      <header className="h-16 px-4 sm:px-6 border-b border-zinc-200 dark:border-white/10 bg-zinc-50/90 dark:bg-zinc-950/80 backdrop-blur-md flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBackToChat}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors border border-zinc-300 dark:border-white/10 cursor-pointer"
            title="Return to Chat"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Chat</span>
          </button>

          <div className="flex items-center gap-2.5">
            <AestificLogo className="w-5 h-5 text-black dark:text-white" />
            <span className="font-bold text-sm sm:text-base tracking-tight text-zinc-900 dark:text-white">
              Aestific Platform
            </span>
            <span className="text-zinc-400 dark:text-zinc-600 text-xs hidden sm:inline">•</span>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <Headphones className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Support Center
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchTickets}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border border-zinc-200 dark:border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
          {/* Main Grid: Create Ticket & Ticket List */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Submit New Ticket */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-zinc-50 dark:bg-[#0e0e18] border border-zinc-200 dark:border-white/10 rounded-2xl p-4 sm:p-6 shadow-sm relative overflow-hidden">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white mb-2 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                Contact Administrator
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-5">
                Have a query, bug report, or billing inquiry? Send a message directly to our admin team.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Subject / Topic
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Account query / Technical question / Bug report"
                    maxLength={120}
                    className="w-full bg-white dark:bg-[#141422] border border-zinc-300 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Your Message
                  </label>
                  <textarea
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Provide details about your question or issue..."
                    className="w-full bg-white dark:bg-[#141422] border border-zinc-300 dark:border-white/10 rounded-xl p-3.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-colors resize-none leading-relaxed"
                  />
                </div>

                {submitError && (
                  <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {submitSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{submitSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !subject.trim() || !message.trim()}
                  className="w-full py-2.5 rounded-xl bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Sending to Admin...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Message to Admin
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Quick Tips */}
            <div className="bg-zinc-50 dark:bg-[#0e0e18]/60 border border-zinc-200 dark:border-white/5 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-300 flex items-center gap-2">
                <HelpCircle className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                Support Guidelines
              </h3>
              <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 mt-1 shrink-0" />
                  Admin responses will appear directly on this page in real-time.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 mt-1 shrink-0" />
                  Include relevant error messages or detailed questions for faster resolution.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 mt-1 shrink-0" />
                  All communications are encrypted and kept strictly confidential.
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Ticket History & Conversation */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <Inbox className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                Your Messages & Responses ({tickets.length})
              </h2>
            </div>

            {isLoading && tickets.length === 0 ? (
              <div className="bg-zinc-50 dark:bg-[#0e0e18] border border-zinc-200 dark:border-white/10 rounded-2xl p-12 text-center text-zinc-600 dark:text-zinc-400 text-xs flex flex-col items-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-zinc-500" />
                Loading your support history...
              </div>
            ) : tickets.length === 0 ? (
              <div className="bg-zinc-50 dark:bg-[#0e0e18] border border-zinc-200 dark:border-white/10 rounded-2xl p-12 text-center text-zinc-500 text-xs flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-white/5 flex items-center justify-center text-zinc-600 dark:text-zinc-400">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <p className="text-zinc-800 dark:text-zinc-300 font-medium">No messages sent yet</p>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px] max-w-xs">
                  When you submit a query, the conversation thread and admin replies will show up here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((t) => {
                  const isSelected = selectedTicket?.id === t.id;
                  const isReplied = t.status === 'replied' || Boolean(t.adminReply);

                  return (
                    <motion.div
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className={`bg-zinc-50 dark:bg-[#0e0e18] border rounded-2xl p-4 cursor-pointer transition-all duration-200 ${
                        isSelected
                          ? 'border-zinc-400 dark:border-white/40 bg-zinc-100 dark:bg-[#121222] shadow-sm'
                          : 'border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/15 hover:bg-zinc-100/50 dark:hover:bg-[#10101c]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="font-semibold text-xs text-zinc-900 dark:text-white truncate flex-1">
                          {t.subject}
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0 flex items-center gap-1 ${
                            isReplied
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                              : 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                          }`}
                        >
                          {isReplied ? (
                            <>
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Admin Replied
                            </>
                          ) : (
                            <>
                              <Clock className="w-2.5 h-2.5" />
                              Pending Review
                            </>
                          )}
                        </span>
                      </div>

                      <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-3 leading-relaxed">
                        {t.message}
                      </p>

                      {/* Admin Reply Callout Preview if available */}
                      {t.adminReply && (
                        <div className="mt-3 p-3 bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/10 rounded-xl">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-900 dark:text-white mb-1">
                            <Shield className="w-3 h-3" />
                            Admin Reply ({t.repliedBy || 'Administrator'})
                          </div>
                          <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed">
                            {t.adminReply}
                          </p>
                          {t.repliedAt && (
                            <div className="text-[10px] text-zinc-500 mt-1.5">
                              Replied on {new Date(t.repliedAt).toLocaleString()}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-3 pt-2 border-t border-zinc-200 dark:border-white/5">
                        <span>Submitted {new Date(t.createdAt).toLocaleDateString()}</span>
                        <span className="text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-0.5">
                          View details <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
