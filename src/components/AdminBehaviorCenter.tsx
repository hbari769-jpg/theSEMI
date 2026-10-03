import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Sliders,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Edit3,
  Trash2,
  RotateCcw,
  Check,
  X,
  Plus,
  Search,
  BookOpen,
  Code2,
  MessageSquare,
  ShieldCheck,
  Cpu,
  History,
  Eye,
  ArrowRight,
  Info,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useToast } from './Toast';

export interface BehaviorRuleVersion {
  version: number;
  title: string;
  instruction: string;
  category: string;
  priority: 'critical' | 'high' | 'standard';
  updatedAt: string;
  updatedBy: string;
  changeNote?: string;
}

export interface BehaviorRule {
  id: string;
  title: string;
  instruction: string;
  category: string;
  priority: 'critical' | 'high' | 'standard';
  status: 'active' | 'disabled';
  version: number;
  createdAt: string;
  createdBy: string;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  versions: BehaviorRuleVersion[];
}

export interface BehaviorAuditLog {
  id: string;
  adminId: string;
  adminName: string;
  action: 'CREATE' | 'UPDATE' | 'ENABLE' | 'DISABLE' | 'DELETE' | 'ROLLBACK';
  ruleId: string;
  ruleTitle: string;
  previousVersion?: number;
  newVersion?: number;
  timestamp: string;
  details: string;
}

export interface ProposedRule {
  title: string;
  instruction: string;
  category: string;
  priority: 'critical' | 'high' | 'standard';
  previewExplanation: string;
}

export interface BehaviorChatMessage {
  id: string;
  sender: 'admin' | 'aestific';
  content: string;
  timestamp: string;
  proposedRule?: ProposedRule | null;
  isApplied?: boolean;
}

interface AdminBehaviorCenterProps {
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export const AdminBehaviorCenter: React.FC<AdminBehaviorCenterProps> = ({ adminFetch }) => {
  const { showToast } = useToast();
  const addToast = ({ type, message }: { type?: 'success' | 'error' | 'info'; message: string }) => {
    showToast(message, type || 'info');
  };

  // Sub-tabs: 'chat' | 'rules' | 'test' | 'audit'
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'rules' | 'test' | 'audit'>('chat');

  // Rules & Audit Data
  const [rules, setRules] = useState<BehaviorRule[]>([]);
  const [auditLogs, setAuditLogs] = useState<BehaviorAuditLog[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');

  // Chat State
  const [messages, setMessages] = useState<BehaviorChatMessage[]>([
    {
      id: 'welcome_msg',
      sender: 'aestific',
      content:
        'Welcome to the Aestific Behavior Center. You can instruct me in natural language on how I should respond, explain concepts, format outputs, address users, or balance tone across the platform. Once you propose an instruction, I will formulate it into a production behavior rule for your preview, testing, and approval.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isProcessingChat, setIsProcessingChat] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Edit Rule Modal State
  const [editingRule, setEditingRule] = useState<BehaviorRule | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editInstruction, setEditInstruction] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('General Behavior');
  const [editPriority, setEditPriority] = useState<'critical' | 'high' | 'standard'>('high');
  const [editChangeNote, setEditChangeNote] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Rollback / History Modal State
  const [historyRule, setHistoryRule] = useState<BehaviorRule | null>(null);
  const [isRollingBack, setIsRollingBack] = useState<boolean>(false);

  // Test Mode Modal / Sandbox State
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false);
  const [testSampleQuestion, setTestSampleQuestion] = useState<string>(
    'Can you explain how neural transformers process language?'
  );
  const [testCandidateRule, setTestCandidateRule] = useState<string>('');
  const [testCurrentResponse, setTestCurrentResponse] = useState<string>('');
  const [testCandidateResponse, setTestCandidateResponse] = useState<string>('');
  const [isRunningTest, setIsRunningTest] = useState<boolean>(false);
  const [pendingProposalToApply, setPendingProposalToApply] = useState<ProposedRule | null>(null);

  // Load Rules and Audit on mount
  useEffect(() => {
    fetchRules();
    fetchAuditLogs();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessingChat]);

  const fetchRules = async () => {
    setIsLoadingRules(true);
    try {
      const res = await adminFetch('/api/admin/behavior/rules');
      if (res.ok) {
        const data = await res.json();
        if (data?.rules && Array.isArray(data.rules)) {
          setRules(data.rules);
        }
      }
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to load behavior rules.' });
    } finally {
      setIsLoadingRules(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await adminFetch('/api/admin/behavior/audit-logs');
      if (res.ok) {
        const data = await res.json();
        if (data?.logs && Array.isArray(data.logs)) {
          setAuditLogs(data.logs);
        }
      }
    } catch {
      // Non-critical
    }
  };

  // Send admin teaching message to Behavior Assistant
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isProcessingChat) return;

    const userMsg: BehaviorChatMessage = {
      id: `msg_admin_${Date.now()}`,
      sender: 'admin',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsProcessingChat(true);

    try {
      const res = await adminFetch('/api/admin/behavior/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (res.ok) {
        const data = await res.json();
        const aestificMsg: BehaviorChatMessage = {
          id: `msg_aestific_${Date.now()}`,
          sender: 'aestific',
          content: data.aestificResponse || 'Understood. I have formulated your rule below.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          proposedRule: data.proposedRule || null,
        };
        setMessages((prev) => [...prev, aestificMsg]);
      } else {
        const err = await res.json();
        addToast({ type: 'error', message: err.error || 'Failed to interpret instruction.' });
      }
    } catch {
      addToast({ type: 'error', message: 'Network error communicating with Behavior Assistant.' });
    } finally {
      setIsProcessingChat(false);
    }
  };

  // Apply proposed rule globally
  const handleApplyProposedRule = async (msgId: string, proposal: ProposedRule) => {
    try {
      const res = await adminFetch('/api/admin/behavior/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: proposal.title,
          instruction: proposal.instruction,
          category: proposal.category,
          priority: proposal.priority,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        addToast({ type: 'success', message: 'Rule applied globally to all user conversations!' });
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, isApplied: true } : m))
        );
        fetchRules();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        addToast({ type: 'error', message: err.error || 'Failed to apply rule globally.' });
      }
    } catch {
      addToast({ type: 'error', message: 'Network error applying rule.' });
    }
  };

  // Toggle Rule Status (Active <-> Disabled)
  const handleToggleRule = async (ruleId: string) => {
    try {
      const res = await adminFetch(`/api/admin/behavior/rules/${ruleId}/toggle`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const data = await res.json();
        addToast({
          type: 'success',
          message: `Rule is now ${data.rule.status === 'active' ? 'active' : 'disabled'}.`,
        });
        fetchRules();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        addToast({ type: 'error', message: err.error || 'Failed to toggle rule.' });
      }
    } catch {
      addToast({ type: 'error', message: 'Network error updating rule.' });
    }
  };

  // Delete Rule
  const handleDeleteRule = async (ruleId: string, ruleTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete the rule "${ruleTitle}"?`)) {
      return;
    }

    try {
      const res = await adminFetch(`/api/admin/behavior/rules/${ruleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        addToast({ type: 'success', message: 'Behavior rule deleted successfully.' });
        fetchRules();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        addToast({ type: 'error', message: err.error || 'Failed to delete rule.' });
      }
    } catch {
      addToast({ type: 'error', message: 'Network error deleting rule.' });
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (rule: BehaviorRule) => {
    setEditingRule(rule);
    setEditTitle(rule.title);
    setEditInstruction(rule.instruction);
    setEditCategory(rule.category);
    setEditPriority(rule.priority);
    setEditChangeNote('');
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingRule) return;
    setIsSavingEdit(true);
    try {
      const res = await adminFetch(`/api/admin/behavior/rules/${editingRule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          instruction: editInstruction,
          category: editCategory,
          priority: editPriority,
          changeNote: editChangeNote || 'Edited via Behavior Center',
        }),
      });

      if (res.ok) {
        addToast({ type: 'success', message: 'Behavior rule updated with new version.' });
        setEditingRule(null);
        fetchRules();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        addToast({ type: 'error', message: err.error || 'Failed to save changes.' });
      }
    } catch {
      addToast({ type: 'error', message: 'Network error updating rule.' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open History / Rollback Modal
  const handleOpenHistory = (rule: BehaviorRule) => {
    setHistoryRule(rule);
  };

  // Perform Rollback
  const handleRollback = async (ruleId: string, targetVersion: number) => {
    setIsRollingBack(true);
    try {
      const res = await adminFetch(`/api/admin/behavior/rules/${ruleId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion }),
      });

      if (res.ok) {
        addToast({ type: 'success', message: `Rolled back to version v${targetVersion} specs!` });
        setHistoryRule(null);
        fetchRules();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        addToast({ type: 'error', message: err.error || 'Failed to rollback rule.' });
      }
    } catch {
      addToast({ type: 'error', message: 'Network error rolling back rule.' });
    } finally {
      setIsRollingBack(false);
    }
  };

  // Run Test Mode Comparison
  const handleRunTest = async (overrideInstruction?: string) => {
    const instruction = overrideInstruction || testCandidateRule;
    if (!instruction.trim()) {
      addToast({ type: 'error', message: 'Candidate instruction is required for test.' });
      return;
    }
    if (!testSampleQuestion.trim()) {
      addToast({ type: 'error', message: 'Please enter a sample question to test.' });
      return;
    }

    setIsRunningTest(true);
    setTestCurrentResponse('');
    setTestCandidateResponse('');

    try {
      const res = await adminFetch('/api/admin/behavior/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleQuestion: testSampleQuestion,
          candidateInstruction: instruction,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTestCurrentResponse(data.currentResponse || 'No current response generated.');
        setTestCandidateResponse(data.candidateResponse || 'No candidate response generated.');
      } else {
        const err = await res.json();
        addToast({ type: 'error', message: err.error || 'Failed to run comparison test.' });
      }
    } catch {
      addToast({ type: 'error', message: 'Network error running comparison test.' });
    } finally {
      setIsRunningTest(false);
    }
  };

  // Open Test Modal with a proposed rule from chat
  const handleOpenTestWithProposal = (proposal: ProposedRule) => {
    setPendingProposalToApply(proposal);
    setTestCandidateRule(proposal.instruction);
    setTestModalOpen(true);
    setTestCurrentResponse('');
    setTestCandidateResponse('');
    handleRunTest(proposal.instruction);
  };

  // Filtered Rules
  const filteredRules = rules.filter((rule) => {
    const matchesSearch =
      rule.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.instruction.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ? true : rule.status === statusFilter;
    const matchesCategory =
      categoryFilter === 'all' ? true : rule.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const categories = Array.from(new Set(rules.map((r) => r.category)));
  const activeCount = rules.filter((r) => r.status === 'active').length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050102] text-zinc-100 overflow-hidden font-sans select-none">
      {/* Top Header Bar */}
      <div className="h-16 px-4 sm:px-6 border-b border-red-950/80 bg-[#070102]/95 backdrop-blur-md flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-950/80 border border-red-800/80 flex items-center justify-center text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.25)]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white">
                Aestific Behavior Center
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold bg-red-950 text-red-300 border border-red-800/60">
                Admin Exclusive
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Calibrate and govern global neural behaviors applied across all user conversations.
            </p>
          </div>
        </div>

        {/* Global Active Indicator */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-950/40 border border-red-900/40 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-zinc-300">
              <strong className="text-emerald-400">{activeCount}</strong> Active Global Rules
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="px-4 sm:px-6 py-2.5 bg-[#090102] border-b border-red-950/60 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0">
        <div className="flex items-center gap-1.5">
          {[
            { id: 'chat', label: 'Teach & Chat', icon: MessageSquare },
            { id: 'rules', label: `Active Rules (${rules.length})`, icon: Sliders },
            { id: 'test', label: 'Test Sandbox', icon: Eye },
            { id: 'audit', label: `Governance Logs (${auditLogs.length})`, icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-red-950 text-red-200 border border-red-800/80 shadow-[0_0_10px_rgba(220,38,38,0.2)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-red-400' : 'text-zinc-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            fetchRules();
            fetchAuditLogs();
            addToast({ type: 'info', message: 'Rules synced with engine.' });
          }}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {/* ========================================== */}
        {/* 1. TEACH & CHAT TAB */}
        {/* ========================================== */}
        {activeSubTab === 'chat' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 space-y-4">
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.sender === 'admin' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-[10px] font-mono uppercase text-zinc-500">
                        {msg.sender === 'admin' ? 'Administrator' : 'Aestific Core'}
                      </span>
                      <span className="text-[10px] text-zinc-600">• {msg.timestamp}</span>
                    </div>

                    <div
                      className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-2xl ${
                        msg.sender === 'admin'
                          ? 'bg-red-950/80 text-red-100 border border-red-800/80 shadow-md'
                          : 'bg-[#0f0305] text-zinc-200 border border-red-950/90 shadow-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {/* Interactive Proposed Rule Card */}
                      {msg.proposedRule && (
                        <div className="mt-4 pt-4 border-t border-red-900/50 space-y-3 bg-[#150407] rounded-xl p-3.5 border border-red-900/60">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold bg-red-950 text-red-300 border border-red-800">
                                {msg.proposedRule.category}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold ${
                                  msg.proposedRule.priority === 'critical'
                                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}
                              >
                                {msg.proposedRule.priority.toUpperCase()} Priority
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">
                              Proposed Rule Preview
                            </span>
                          </div>

                          <div>
                            <h4 className="text-xs font-bold text-white mb-1">
                              {msg.proposedRule.title}
                            </h4>
                            <p className="text-xs text-zinc-300 font-mono bg-black/40 p-2.5 rounded-lg border border-red-950">
                              "{msg.proposedRule.instruction}"
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-2">
                              {msg.isApplied ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Applied Globally (Active)</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleApplyProposedRule(msg.id, msg.proposedRule!)}
                                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_12px_rgba(220,38,38,0.4)] transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Apply Rule Globally</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleOpenTestWithProposal(msg.proposedRule!)}
                                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-500 transition-colors flex items-center gap-1.5 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Test Behavior</span>
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                handleOpenEdit({
                                  id: 'temp_proposal',
                                  title: msg.proposedRule!.title,
                                  instruction: msg.proposedRule!.instruction,
                                  category: msg.proposedRule!.category,
                                  priority: msg.proposedRule!.priority,
                                  status: 'active',
                                  version: 1,
                                  createdAt: new Date().toISOString(),
                                  createdBy: 'Admin',
                                  lastUpdatedAt: new Date().toISOString(),
                                  lastUpdatedBy: 'Admin',
                                  versions: [],
                                });
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            >
                              Edit Details
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isProcessingChat && (
                  <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#0f0305] text-zinc-400 text-xs w-fit border border-red-950 animate-pulse">
                    <Sparkles className="w-3.5 h-3.5 text-red-400 animate-spin" />
                    <span>Aestific Behavior Engine is formulating your rule...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            </div>

            {/* Quick Inspiration Pills */}
            <div className="px-4 sm:px-8 py-2 bg-[#080102] border-t border-red-950/60 overflow-x-auto no-scrollbar shrink-0">
              <div className="max-w-3xl mx-auto flex items-center gap-2 text-xs">
                <span className="text-[10px] font-mono text-zinc-500 uppercase shrink-0">
                  Quick Teach:
                </span>
                {[
                  'When explaining difficult topics, first explain simply, then give an example.',
                  'When the user asks for code, explain what the code does after providing it.',
                  'Use a calm, friendly, and intellectually supportive tone.',
                  'Be concise for factual answers, but provide structured depth for architectures.',
                ].map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(sample)}
                    className="px-2.5 py-1 rounded-full text-[11px] bg-red-950/40 hover:bg-red-950 text-red-200 border border-red-900/40 hover:border-red-700 transition-colors shrink-0 truncate max-w-xs cursor-pointer"
                  >
                    "{sample.slice(0, 38)}..."
                  </button>
                ))}
              </div>
            </div>

            {/* Input Bar */}
            <div className="p-4 sm:px-8 bg-[#060102] border-t border-red-950/80 shrink-0">
              <div className="max-w-3xl mx-auto flex items-center gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Tell Aestific how to behave with users (e.g. 'When explaining science questions, give a simple analogy first')..."
                  className="flex-1 bg-[#100305] border border-red-950 focus:border-red-700 text-xs sm:text-sm text-white rounded-xl px-4 py-3 outline-none transition-colors placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isProcessingChat}
                  className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(220,38,38,0.3)] cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Teach</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* 2. ACTIVE RULES DIRECTORY TAB */}
        {/* ========================================== */}
        {activeSubTab === 'rules' && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
            <div className="max-w-5xl mx-auto space-y-4">
              {/* Controls Header */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0a0203] p-3.5 rounded-2xl border border-red-950">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search behavior rules by title, keyword, or category..."
                    className="w-full bg-[#120305] border border-red-950 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-red-700 transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-[#120305] border border-red-950 text-xs text-zinc-300 rounded-xl px-3 py-2 outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="disabled">Disabled Only</option>
                  </select>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-[#120305] border border-red-950 text-xs text-zinc-300 rounded-xl px-3 py-2 outline-none cursor-pointer"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rules Cards */}
              {isLoadingRules ? (
                <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                  Loading behavior directives from neural engine...
                </div>
              ) : filteredRules.length === 0 ? (
                <div className="text-center py-12 bg-[#090102] rounded-2xl border border-red-950/60 p-6 space-y-2">
                  <p className="text-sm font-semibold text-zinc-400">No behavior rules found.</p>
                  <p className="text-xs text-zinc-600">
                    Use the "Teach & Chat" tab above to instruct Aestific and create your first behavior rule.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRules.map((rule) => {
                    const isActive = rule.status === 'active';
                    return (
                      <div
                        key={rule.id}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                          isActive
                            ? 'bg-[#0d0204] border-red-950 hover:border-red-800/80 shadow-sm'
                            : 'bg-[#080102] border-zinc-900 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                                {rule.title}
                              </h3>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                  isActive
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                                }`}
                              >
                                {rule.status}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-red-950 text-red-300 border border-red-900">
                                {rule.category}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-zinc-900 text-zinc-400 border border-zinc-800">
                                v{rule.version}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold ${
                                  rule.priority === 'critical'
                                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}
                              >
                                {rule.priority}
                              </span>
                            </div>

                            <p className="text-xs sm:text-sm text-zinc-300 font-mono bg-black/50 p-3 rounded-xl border border-red-950/80 leading-relaxed">
                              "{rule.instruction}"
                            </p>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 font-mono">
                              <span>Created: {new Date(rule.createdAt).toLocaleDateString()} by {rule.createdBy}</span>
                              <span>•</span>
                              <span>Updated: {new Date(rule.lastUpdatedAt).toLocaleDateString()} by {rule.lastUpdatedBy}</span>
                            </div>
                          </div>

                          {/* Rule Actions */}
                          <div className="flex items-center gap-1.5 shrink-0 pt-2 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleToggleRule(rule.id)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-800'
                                  : 'bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-800'
                              }`}
                            >
                              {isActive ? 'Disable' : 'Enable'}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setTestCandidateRule(rule.instruction);
                                setTestModalOpen(true);
                                handleRunTest(rule.instruction);
                              }}
                              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              title="Test Rule in Sandbox"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEdit(rule)}
                              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              title="Edit Rule"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenHistory(rule)}
                              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              title="Version History & Rollback"
                            >
                              <History className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteRule(rule.id, rule.title)}
                              className="p-2 rounded-xl text-rose-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                              title="Delete Rule"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* 3. TEST SANDBOX TAB */}
        {/* ========================================== */}
        {activeSubTab === 'test' && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="bg-[#0c0204] p-5 rounded-2xl border border-red-950 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-red-400" />
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Behavior Comparison Sandbox
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">
                    Dual Engine Evaluation
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                      Candidate Behavior Rule:
                    </label>
                    <textarea
                      rows={2}
                      value={testCandidateRule}
                      onChange={(e) => setTestCandidateRule(e.target.value)}
                      placeholder="e.g. When explaining difficult topics, first explain simply, then give an example."
                      className="w-full bg-[#120305] border border-red-950 rounded-xl p-3 text-xs sm:text-sm text-white font-mono outline-none focus:border-red-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                      Sample User Question:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={testSampleQuestion}
                        onChange={(e) => setTestSampleQuestion(e.target.value)}
                        placeholder="Enter any sample question..."
                        className="flex-1 bg-[#120305] border border-red-950 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-red-700"
                      />
                      <button
                        type="button"
                        onClick={() => handleRunTest()}
                        disabled={isRunningTest || !testCandidateRule.trim()}
                        className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                      >
                        {isRunningTest ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>Run Test</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Comparison Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column 1: Current Response */}
                <div className="bg-[#090102] rounded-2xl border border-zinc-800 p-4 sm:p-5 space-y-3 flex flex-col">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-xs font-mono font-bold uppercase text-zinc-400">
                      Current Response (Without Rule)
                    </span>
                    <span className="text-[10px] font-mono text-zinc-600">Standard Engine</span>
                  </div>
                  <div className="flex-1 text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap min-h-[160px]">
                    {isRunningTest ? (
                      <div className="flex items-center justify-center h-full text-zinc-600 text-xs font-mono animate-pulse">
                        Generating standard response...
                      </div>
                    ) : testCurrentResponse ? (
                      testCurrentResponse
                    ) : (
                      <div className="text-zinc-600 text-xs font-mono">
                        Run a test above to preview current system response.
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Candidate Response with New Behavior */}
                <div className="bg-[#100305] rounded-2xl border border-red-900/80 p-4 sm:p-5 space-y-3 flex flex-col shadow-[0_0_15px_rgba(220,38,38,0.15)]">
                  <div className="flex items-center justify-between pb-2 border-b border-red-950">
                    <span className="text-xs font-mono font-bold uppercase text-red-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Response With New Behavior
                    </span>
                    <span className="text-[10px] font-mono text-red-500/80">Rule Applied</span>
                  </div>
                  <div className="flex-1 text-xs sm:text-sm text-red-100 leading-relaxed font-sans whitespace-pre-wrap min-h-[160px]">
                    {isRunningTest ? (
                      <div className="flex items-center justify-center h-full text-red-400/60 text-xs font-mono animate-pulse">
                        Evaluating behavior directive...
                      </div>
                    ) : testCandidateResponse ? (
                      testCandidateResponse
                    ) : (
                      <div className="text-zinc-600 text-xs font-mono">
                        Run a test above to evaluate output with new behavior rule.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* 4. GOVERNANCE AUDIT LOGS TAB */}
        {/* ========================================== */}
        {activeSubTab === 'audit' && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-4">
            <div className="max-w-5xl mx-auto space-y-3">
              <div className="flex items-center justify-between bg-[#0a0203] p-3 rounded-2xl border border-red-950">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                    Behavior Audit & Governance Trail
                  </span>
                </div>
                <span className="text-[11px] font-mono text-zinc-500">
                  {auditLogs.length} Logged Governance Events
                </span>
              </div>

              {auditLogs.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                  No governance logs recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 sm:p-4 rounded-xl bg-[#090102] border border-red-950/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold ${
                              log.action === 'CREATE'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : log.action === 'UPDATE'
                                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                : log.action === 'ROLLBACK'
                                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                : log.action === 'DELETE'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {log.action}
                          </span>
                          <span className="font-semibold text-white">{log.ruleTitle}</span>
                          {log.newVersion && (
                            <span className="text-[10px] font-mono text-zinc-400">
                              (v{log.newVersion})
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-400 text-[11px]">{log.details}</p>
                      </div>

                      <div className="text-[10px] font-mono text-zinc-500 text-right shrink-0">
                        <div>Admin: {log.adminName}</div>
                        <div>{new Date(log.timestamp).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* EDIT MODAL */}
      {/* ========================================== */}
      {editingRule && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#0e0204] border border-red-900 rounded-2xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-red-950">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-bold text-white">
                  Edit Behavior Rule (Creates v{(editingRule.version || 1) + 1})
                </h3>
              </div>
              <button
                onClick={() => setEditingRule(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-mono uppercase text-zinc-400 mb-1">
                  Rule Title:
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-[#140306] border border-red-950 rounded-xl px-3 py-2 text-white outline-none focus:border-red-700"
                />
              </div>

              <div>
                <label className="block font-mono uppercase text-zinc-400 mb-1">
                  Instruction:
                </label>
                <textarea
                  rows={3}
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  className="w-full bg-[#140306] border border-red-950 rounded-xl p-3 text-white font-mono outline-none focus:border-red-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono uppercase text-zinc-400 mb-1">
                    Category:
                  </label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-[#140306] border border-red-950 rounded-xl px-3 py-2 text-white outline-none focus:border-red-700"
                  />
                </div>

                <div>
                  <label className="block font-mono uppercase text-zinc-400 mb-1">
                    Priority:
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as any)}
                    className="w-full bg-[#140306] border border-red-950 rounded-xl px-3 py-2 text-white outline-none focus:border-red-700"
                  >
                    <option value="standard">Standard Priority</option>
                    <option value="high">High Priority</option>
                    <option value="critical">Critical Priority</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-mono uppercase text-zinc-400 mb-1">
                  Change Note (Reason for update):
                </label>
                <input
                  type="text"
                  value={editChangeNote}
                  onChange={(e) => setEditChangeNote(e.target.value)}
                  placeholder="e.g. Refined pedagogical example criteria"
                  className="w-full bg-[#140306] border border-red-950 rounded-xl px-3 py-2 text-white outline-none focus:border-red-700"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-red-950">
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit || !editTitle.trim() || !editInstruction.trim()}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
              >
                {isSavingEdit ? 'Saving...' : 'Save & Publish Version'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* VERSION HISTORY & ROLLBACK MODAL */}
      {/* ========================================== */}
      {historyRule && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#0e0204] border border-red-900 rounded-2xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-red-950 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-bold text-white">
                  Version History: {historyRule.title}
                </h3>
              </div>
              <button
                onClick={() => setHistoryRule(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 shrink-0">
              Select any previous version to restore. Restoring creates a new forward version preserving complete audit history.
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {(historyRule.versions || []).slice().reverse().map((v) => {
                const isCurrent = v.version === historyRule.version;
                return (
                  <div
                    key={v.version}
                    className={`p-3.5 rounded-xl border space-y-2 ${
                      isCurrent
                        ? 'bg-red-950/40 border-red-700/80 shadow-xs'
                        : 'bg-[#120305] border-red-950'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs font-mono text-white">
                          Version v{v.version}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                            Current Active
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-zinc-500">
                          {new Date(v.updatedAt).toLocaleString()} by {v.updatedBy}
                        </span>
                      </div>

                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => handleRollback(historyRule.id, v.version)}
                          disabled={isRollingBack}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore v{v.version}</span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs font-mono text-zinc-300 bg-black/40 p-2 rounded-lg border border-red-950">
                      "{v.instruction}"
                    </p>

                    {v.changeNote && (
                      <p className="text-[11px] text-zinc-400 italic">
                        Note: {v.changeNote}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-red-950 shrink-0">
              <button
                type="button"
                onClick={() => setHistoryRule(null)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
