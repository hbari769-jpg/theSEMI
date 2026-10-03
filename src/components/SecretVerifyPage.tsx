import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  KeyRound,
  UserCheck,
  ArrowRight,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Users,
  Database,
  FileText,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Trash2,
  Edit3,
  Sliders,
  CheckCircle2,
  Search,
  Server,
  Activity,
  Layers,
  Zap,
  Ban,
  Mail,
  Send,
  HelpCircle,
  Headphones,
  FileCode,
  Shield,
  Eye,
  EyeOff,
  UserX,
  History,
  Check,
  X,
  ChevronDown,
  Globe,
  Radio,
  TrendingUp,
  TrendingDown,
  Minus,
  UserCheck2,
  Calendar,
  Flame,
  Copy,
  Cpu,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { authFetch, clearAuthToken, setAuthToken } from '../lib/api';
import { useToast } from './Toast';
import { SupportTicket, AdminLog, BannedAdmin } from '../types';
import { AdminAiMonitoring } from './AdminAiMonitoring';
import { AdminBehaviorCenter } from './AdminBehaviorCenter';
import {
  DocTab,
  EditableDocumentItem,
  DEFAULT_EDITABLE_DOCUMENTS,
  getCachedEditableDocuments,
  saveCachedEditableDocuments,
} from '../lib/defaultDocuments';

const PENALTY_SECONDS = [10, 20, 30, 3600]; // 10s, 20s, 30s, 1hr (3600s)

export interface AnalyticsDataPoint {
  date: string;
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  chats: number;
  photos: number;
  files: number;
}

interface AdminOverviewData {
  stats: {
    totalUsers: number;
    activeUsersLive: number;
    activeUsers24h: number;
    activeUsers7d: number;
    activeUsers30d: number;
    userGrowthRate7d: number;
    chatGrowthRate7d: number;
    growthStatus: 'growing' | 'stable' | 'declining';
    totalConversations: number;
    totalMessages: number;
    totalFiles: number;
    todayChatCount: number;
    todayPhotoCount: number;
    todayFileCount: number;
    timeline: AnalyticsDataPoint[];
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    status?: 'active' | 'suspended' | 'banned';
    isEmailVerified: boolean;
    isBanned?: boolean;
    bannedAt?: string;
    bannedReason?: string;
    memoryEnabled: boolean;
    preferredModel?: string;
    createdAt: string;
    lastActiveAt?: string;
    activity?: {
      conversationsCount: number;
      messagesCount: number;
      filesCount: number;
      memoriesCount: number;
      todayChats: number;
      todayPhotos: number;
      todayFiles: number;
    };
    usage?: {
      chatCount: number;
      photoCount: number;
      fileCount: number;
    };
  }>;
  system: {
    nodeEnv: string;
    uptime: number;
    groqConfigured: boolean;
    neuralEngineConfigured?: boolean;
    brevoConfigured: boolean;
    appVersion: string;
    memoryUsage?: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
  };
}

export interface AdminOfficer {
  adminName: string;
  isActive: boolean;
  lastActiveAt: string;
  ip: string;
  actionCount: number;
  lastAction: string;
}

interface SecretVerifyPageProps {
  onBackToApp: () => void;
}

export const SecretVerifyPage: React.FC<SecretVerifyPageProps> = ({ onBackToApp }) => {
  const { showToast } = useToast();

  // Verification flow states
  const [currentStep, setCurrentStep] = useState<number>(1); // 1 to 5
  const [inputValue, setInputValue] = useState<string>('');
  const [adminName, setAdminName] = useState<string>('');
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [stepSuccessMsg, setStepSuccessMsg] = useState<string>('');
  const [isVerifyingStep, setIsVerifyingStep] = useState<boolean>(false);

  // Lockout Penalty state: Enforces cooldown timers on wrong passcodes that cannot be bypassed
  const [failCount, setFailCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('aestific_admin_fails');
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(() => {
    try {
      const lockoutUntil = localStorage.getItem('aestific_admin_lockout_until');
      if (lockoutUntil) {
        const remaining = Math.ceil((parseInt(lockoutUntil, 10) - Date.now()) / 1000);
        return remaining > 0 ? remaining : 0;
      }
      return 0;
    } catch {
      return 0;
    }
  });
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Admin Dashboard Tabs: 'overview' | 'monitoring' | 'analytics' | 'behavior' | 'users' | 'documents' | 'support' | 'email' | 'logs' | 'security'
  const [adminTab, setAdminTab] = useState<'overview' | 'monitoring' | 'analytics' | 'behavior' | 'users' | 'documents' | 'support' | 'email' | 'logs' | 'security'>('overview');
  const [editableDocs, setEditableDocs] = useState<Record<DocTab, EditableDocumentItem>>(() =>
    getCachedEditableDocuments()
  );
  const [selectedDocTab, setSelectedDocTab] = useState<DocTab>('about');
  const [isSavingDocs, setIsSavingDocs] = useState<boolean>(false);
  const [analyticsMetric, setAnalyticsMetric] = useState<'users' | 'activity' | 'all'>('all');
  const [adminData, setAdminData] = useState<AdminOverviewData | null>(null);
  const [isLoadingAdminData, setIsLoadingAdminData] = useState<boolean>(false);
  const [searchUserQuery, setSearchUserQuery] = useState<string>('');
  const [userPlanFilter, setUserPlanFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'banned'>('all');

  // User Inspector Modal State
  const [inspectModalUser, setInspectModalUser] = useState<any | null>(null);
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState<boolean>(false);

  // Support Tickets State
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState<boolean>(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketReplyText, setTicketReplyText] = useState<string>('');
  const [isReplyingTicket, setIsReplyingTicket] = useState<boolean>(false);
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open' | 'replied'>('all');

  // Direct Email Dispatcher State
  const [emailTo, setEmailTo] = useState<string>('');
  const [emailRecipientName, setEmailRecipientName] = useState<string>('');
  const [emailSenderDisplayName, setEmailSenderDisplayName] = useState<string>('aestific Executive Desk');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AdminLog[]>([]);
  const [adminRoster, setAdminRoster] = useState<AdminOfficer[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');

  // Passcodes & Security State
  const [envStepsStatus, setEnvStepsStatus] = useState<Array<{ step: number; envVar: string; isConfigured: boolean }>>([]);
  const [bannedAdminsList, setBannedAdminsList] = useState<BannedAdmin[]>([]);
  const [targetBanAdminName, setTargetBanAdminName] = useState<string>('');
  const [isBanningAdmin, setIsBanningAdmin] = useState<boolean>(false);

  // Authorization & Gatekeeping State
  const [isVerifyingAccess, setIsVerifyingAccess] = useState<boolean>(true);
  const [accessDenied, setAccessDenied] = useState<boolean>(false);
  const [stepToken, setStepToken] = useState<string | null>(null);
  const adminSessionTokenRef = useRef<string>('');

  // Wrapper around authFetch that attaches the in-memory elevated admin token
  const adminFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers || {});
    if (adminSessionTokenRef.current) {
      headers.set('X-Admin-Token', adminSessionTokenRef.current);
    }
    return authFetch(input, {
      ...init,
      headers,
    });
  };

  // User Ban Modal / Action
  const [banModalUser, setBanModalUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [banReason, setBanReason] = useState<string>('Violation of aestific usage policies and security guidelines.');

  // Handle countdown timer for lockout
  useEffect(() => {
    if (lockoutRemaining > 0) {
      timerRef.current = setInterval(() => {
        setLockoutRemaining((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            localStorage.removeItem('aestific_admin_lockout_until');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lockoutRemaining]);

  // Verify candidate administrative access on mount — ALWAYS start locked at Step 1
  useEffect(() => {
    let isMounted = true;
    // Always lock panel on initial entry so password is required every time
    adminSessionTokenRef.current = '';
    setIsVerified(false);
    setCurrentStep(1);
    setStepToken(null);
    setInputValue('');

    const verifyCandidateAccess = async () => {
      try {
        // Terminate any prior elevated admin session cookie so password cannot be bypassed
        await authFetch('/api/admin/logout', { method: 'POST' }).catch(() => {});

        const checkRes = await authFetch('/api/admin/check-access');
        if (!checkRes.ok) {
          if (isMounted) {
            setAccessDenied(true);
            setIsVerifyingAccess(false);
            showToast('Access denied: Administrative privileges required.', 'error');
            onBackToApp();
          }
          return;
        }
        const checkData = await checkRes.json().catch(() => ({ authorized: false }));
        if (!checkData.authorized) {
          if (isMounted) {
            setAccessDenied(true);
            setIsVerifyingAccess(false);
            showToast('Access denied: Administrative privileges required.', 'error');
            onBackToApp();
          }
          return;
        }

        if (isMounted) {
          setIsVerifyingAccess(false);
        }
      } catch {
        if (isMounted) {
          setAccessDenied(true);
          setIsVerifyingAccess(false);
          showToast('Access denied: Administrative privileges required.', 'error');
          onBackToApp();
        }
      }
    };
    verifyCandidateAccess();
    return () => {
      isMounted = false;
      adminSessionTokenRef.current = '';
    };
  }, []);

  const handleApplyLockout = () => {
    const nextFail = failCount + 1;
    setFailCount(nextFail);
    localStorage.setItem('aestific_admin_fails', String(nextFail));

    let penaltySec = PENALTY_SECONDS[0]; // 10s
    if (nextFail === 2) penaltySec = PENALTY_SECONDS[1]; // 20s
    else if (nextFail === 3) penaltySec = PENALTY_SECONDS[2]; // 30s
    else if (nextFail >= 4) penaltySec = PENALTY_SECONDS[3]; // 3600s (1 hr)

    const expiryTime = Date.now() + penaltySec * 1000;
    localStorage.setItem('aestific_admin_lockout_until', String(expiryTime));
    setLockoutRemaining(penaltySec);
  };

  const handleStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutRemaining > 0 || isVerifyingStep) return;

    setErrorMsg('');
    setStepSuccessMsg('');
    const trimmedInput = inputValue.trim();

    if (!trimmedInput) {
      setErrorMsg(
        currentStep === 5
          ? 'Admin Name cannot be empty. Please enter your Admin Name.'
          : `Password for Step ${currentStep} cannot be empty.`
      );
      return;
    }

    setIsVerifyingStep(true);

    try {
      if (currentStep >= 1 && currentStep <= 4) {
        const res = await authFetch('/api/admin/verify-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: currentStep,
            code: trimmedInput,
            stepToken: currentStep > 1 ? stepToken : undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          handleApplyLockout();
          if (data.expired) {
            setCurrentStep(1);
            setStepToken(null);
          }
          setErrorMsg(data.error || `Incorrect password for Step ${currentStep}. Penalty lockout triggered.`);
          setInputValue('');
          return;
        }

        // Passed this step! Save signed progression token for next step
        if (data.stepToken) {
          setStepToken(data.stepToken);
        }
        setStepSuccessMsg(`Step ${currentStep} password verified.`);
        setInputValue('');
        setTimeout(() => {
          setStepSuccessMsg('');
          setCurrentStep((prev) => prev + 1);
        }, 400);
      } else if (currentStep === 5) {
        // Step 5: Admin Name & Final Clearance
        const res = await authFetch('/api/admin/verify-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: 5,
            adminName: trimmedInput,
            stepToken,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          if (data.error === 'ADMIN_BANNED') {
            setErrorMsg(data.message || `Admin identity "${trimmedInput}" is banned for 24 hours.`);
          } else {
            handleApplyLockout();
            if (data.expired) {
              setCurrentStep(1);
              setStepToken(null);
            }
            setErrorMsg(data.error || 'Verification failed. Security violation recorded.');
          }
          return;
        }

        // Authorized! Keep admin token strictly in memory for this session
        if (data.token) {
          adminSessionTokenRef.current = data.token;
        }
        setStepToken(null);
        setInputValue('');
        setAdminName(data.adminName || trimmedInput);
        setIsVerified(true);
        // Reset failures on full success
        setFailCount(0);
        localStorage.removeItem('aestific_admin_fails');
        localStorage.removeItem('aestific_admin_lockout_until');
        showToast(`Welcome, Commander ${data.adminName || trimmedInput}. Admin Panel unlocked.`, 'success');
        fetchAdminOverview();
        fetchPasscodes();
        fetchBannedAdmins();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gateway connection error.');
    } finally {
      setIsVerifyingStep(false);
    }
  };

  // Fetch Telemetry & Overview
  const fetchAdminOverview = async () => {
    try {
      setIsLoadingAdminData(true);
      const res = await adminFetch('/api/admin/overview');
      if (res.ok) {
        const data = await res.json();
        setAdminData(data);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setIsLoadingAdminData(false);
    }
  };

  // Fetch Passcodes Configuration Status
  const fetchPasscodes = async () => {
    try {
      const res = await adminFetch('/api/admin/passcodes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.stepsStatus)) {
          setEnvStepsStatus(data.stepsStatus);
        }
      }
    } catch (err) {
      console.error('Error fetching passcodes status:', err);
    }
  };

  // Fetch Banned Admins
  const fetchBannedAdmins = async () => {
    try {
      const res = await adminFetch('/api/admin/banned-admins');
      if (res.ok) {
        const data = await res.json();
        setBannedAdminsList(data.bannedAdmins || []);
      }
    } catch (err) {
      console.error('Error fetching banned admins:', err);
    }
  };

  // Ban Admin
  const handleBanAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBanAdminName.trim()) {
      showToast('Please enter the admin name to ban.', 'error');
      return;
    }

    const cleanTarget = targetBanAdminName.trim();
    setIsBanningAdmin(true);
    try {
      const res = await adminFetch('/api/admin/ban-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAdminName: cleanTarget,
          adminName,
          durationHours: 24,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Admin "${cleanTarget}" banned for 24 hours.`, 'success');
        setTargetBanAdminName('');
        
        // If current admin banned themselves, immediately revoke session
        if (adminName.toLowerCase().trim() === cleanTarget.toLowerCase()) {
          setIsVerified(false);
          adminSessionTokenRef.current = '';
          adminFetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
          showToast('Your administrative clearance has been suspended.', 'error');
          return;
        }

        fetchBannedAdmins();
        fetchAuditLogs();
      } else {
        showToast(data.error || 'Failed to ban admin.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error banning admin.', 'error');
    } finally {
      setIsBanningAdmin(false);
    }
  };

  // Unban Admin
  const handleUnbanAdmin = async (targetName: string) => {
    try {
      const res = await adminFetch('/api/admin/unban-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAdminName: targetName, adminName }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Admin "${targetName}" unbanned.`, 'success');
        fetchBannedAdmins();
        fetchAuditLogs();
      } else {
        showToast(data.error || 'Failed to unban admin.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error unbanning admin.', 'error');
    }
  };

  // Fetch Support Tickets
  const fetchSupportTickets = async () => {
    try {
      setIsLoadingTickets(true);
      const res = await adminFetch('/api/admin/support');
      if (res.ok) {
        const data = await res.json();
        setSupportTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Error fetching support tickets:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  // Reply to Support Ticket
  const handleReplyTicket = async (ticketId: string) => {
    if (!ticketReplyText.trim()) {
      showToast('Reply text cannot be empty.', 'error');
      return;
    }

    setIsReplyingTicket(true);
    try {
      const res = await adminFetch(`/api/admin/support/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: ticketReplyText.trim(), adminName }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Reply sent directly to user!', 'success');
        setTicketReplyText('');
        fetchSupportTickets();
        fetchAuditLogs();
      } else {
        showToast(data.error || 'Failed to send reply.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error sending reply.', 'error');
    } finally {
      setIsReplyingTicket(false);
    }
  };

  // Delete Support Ticket
  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm('Are you sure you want to delete this support ticket?')) return;
    try {
      const res = await adminFetch(`/api/admin/support/${ticketId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName }),
      });
      if (res.ok) {
        showToast('Support ticket deleted.', 'success');
        fetchSupportTickets();
        fetchAuditLogs();
      }
    } catch (err) {
      console.error('Error deleting ticket:', err);
    }
  };

  // Direct Email Dispatcher (Via Brevo)
  const handleSendDirectEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
      showToast('Recipient Email, Subject, and Message are required.', 'error');
      return;
    }

    setIsSendingEmail(true);
    try {
      const res = await adminFetch('/api/admin/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: emailTo.trim(),
          toName: emailRecipientName.trim() || emailTo.trim(),
          senderDisplayName: emailSenderDisplayName.trim() || 'aestific Official Support',
          subject: emailSubject.trim(),
          textContent: emailBody.trim(),
          adminName,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Email dispatched to ${emailTo} via Brevo!`, 'success');
        setEmailSubject('');
        setEmailBody('');
        fetchAuditLogs();
      } else {
        showToast(data.error || 'Failed to dispatch email.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Network error dispatching email.', 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Fetch Audit Logs
  const fetchAuditLogs = async () => {
    try {
      setIsLoadingLogs(true);
      const res = await adminFetch('/api/admin/logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
        if (data.adminRoster && Array.isArray(data.adminRoster)) {
          setAdminRoster(data.adminRoster);
        }
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Fetch & Save Platform Documents
  const fetchPlatformDocuments = async () => {
    try {
      const res = await adminFetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        if (data?.documents && typeof data.documents === 'object') {
          const merged = { ...DEFAULT_EDITABLE_DOCUMENTS };
          for (const key of Object.keys(DEFAULT_EDITABLE_DOCUMENTS) as DocTab[]) {
            if (data.documents[key]) {
              merged[key] = {
                ...DEFAULT_EDITABLE_DOCUMENTS[key],
                ...data.documents[key],
              };
            }
          }
          setEditableDocs(merged);
          saveCachedEditableDocuments(merged);
        }
      }
    } catch (err) {
      console.error('Error fetching platform documents:', err);
    }
  };

  const handleUpdateDocField = (docId: DocTab, field: keyof EditableDocumentItem, value: any) => {
    setEditableDocs((prev) => ({
      ...prev,
      [docId]: {
        ...prev[docId],
        [field]: value,
        isCustom: true,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const handleSavePlatformDocuments = async (targetDocId?: DocTab) => {
    try {
      setIsSavingDocs(true);
      const updatedMap: Record<DocTab, EditableDocumentItem> = {
        ...editableDocs,
      };
      if (targetDocId) {
        updatedMap[targetDocId] = {
          ...updatedMap[targetDocId],
          isCustom: true,
          updatedAt: new Date().toISOString(),
        };
      }
      setEditableDocs(updatedMap);
      saveCachedEditableDocuments(updatedMap);

      const res = await adminFetch('/api/admin/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: updatedMap,
          updatedDocId: targetDocId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(
          targetDocId
            ? `"${updatedMap[targetDocId].label}" saved & published to Documents!`
            : 'All documents saved & published successfully!',
          'success'
        );
      } else {
        showToast(data.error || 'Saved locally, but server sync returned an error.', 'info');
      }
    } catch (err: any) {
      showToast('Saved locally.', 'info');
    } finally {
      setIsSavingDocs(false);
    }
  };

  const handleResetDocumentToDefault = async (docId: DocTab) => {
    const defaultDoc = DEFAULT_EDITABLE_DOCUMENTS[docId];
    const updatedMap: Record<DocTab, EditableDocumentItem> = {
      ...editableDocs,
      [docId]: {
        ...defaultDoc,
        isCustom: false,
      },
    };
    setEditableDocs(updatedMap);
    saveCachedEditableDocuments(updatedMap);
    try {
      setIsSavingDocs(true);
      await adminFetch('/api/admin/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: updatedMap,
          updatedDocId: `${docId} (reset to default)`,
        }),
      });
      showToast(`"${defaultDoc.label}" restored to default content.`, 'info');
    } catch {
      showToast(`"${defaultDoc.label}" restored to default locally.`, 'info');
    } finally {
      setIsSavingDocs(false);
    }
  };

  // User Actions: Status, Delete, Ban/Unban
  const handleToggleVerified = async (userId: string, currentStatus: boolean) => {
    try {
      const res = await adminFetch(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEmailVerified: !currentStatus, adminName }),
      });
      if (res.ok) {
        showToast(`Verification status set to ${!currentStatus ? 'VERIFIED' : 'UNVERIFIED'}`, 'success');
        fetchAdminOverview();
        fetchAuditLogs();
      }
    } catch (err) {
      showToast('Failed to update status', 'error');
    }
  };

  const handleConfirmBanUser = async () => {
    if (!banModalUser) return;
    try {
      const res = await adminFetch(`/api/admin/users/${banModalUser.id}/ban`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isBanned: true,
          reason: banReason,
          adminName,
        }),
      });

      if (res.ok) {
        showToast(`User ${banModalUser.name} (${banModalUser.email}) has been banned.`, 'success');
        setBanModalUser(null);
        fetchAdminOverview();
        fetchAuditLogs();
      }
    } catch (err) {
      showToast('Failed to ban user', 'error');
    }
  };

  const handleUnbanUser = async (userId: string, userName: string) => {
    try {
      const res = await adminFetch(`/api/admin/users/${userId}/ban`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isBanned: false,
          adminName,
        }),
      });

      if (res.ok) {
        showToast(`User ${userName} has been restored and unbanned.`, 'success');
        fetchAdminOverview();
        fetchAuditLogs();
      }
    } catch (err) {
      showToast('Failed to unban user', 'error');
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`CRITICAL WARNING: Permanently delete ${userEmail} and all their conversations, files, and records?`)) return;
    try {
      const res = await adminFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName }),
      });
      if (res.ok) {
        showToast(`User ${userEmail} deleted permanently.`, 'success');
        fetchAdminOverview();
        fetchAuditLogs();
      }
    } catch (err) {
      showToast('Failed to delete user', 'error');
    }
  };

  const handleInspectUser = async (userId: string) => {
    setIsLoadingUserDetails(true);
    setInspectModalUser(null);
    try {
      const res = await adminFetch(`/api/admin/users/${userId}/details`);
      if (res.ok) {
        const data = await res.json();
        setInspectModalUser(data);
      } else {
        showToast('Failed to retrieve user details from server.', 'error');
      }
    } catch {
      showToast('Error connecting to user details endpoint.', 'error');
    } finally {
      setIsLoadingUserDetails(false);
    }
  };

  // Filter users
  const filteredUsers = (adminData?.users || []).filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.id.toLowerCase().includes(searchUserQuery.toLowerCase());
    const matchesStatus =
      userStatusFilter === 'all' ||
      (userStatusFilter === 'banned' && u.isBanned) ||
      (userStatusFilter === 'active' && !u.isBanned);
    return matchesSearch && matchesStatus;
  });

  // Filter support tickets
  const filteredTickets = supportTickets.filter((t) => {
    if (ticketFilter === 'open') return t.status === 'open' && !t.adminReply;
    if (ticketFilter === 'replied') return t.status === 'replied' || Boolean(t.adminReply);
    return true;
  });

  // Filter audit logs
  const filteredAuditLogs = auditLogs.filter((l) => {
    return (
      l.adminName.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      l.ip.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      l.action.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      (l.details || '').toLowerCase().includes(logSearchQuery.toLowerCase())
    );
  });

  // =========================================================================
  // VIEW: 5-STEP GATEWAY VERIFICATION (DEEP BLACK & DEEP RED THEME)
  // =========================================================================
  if (isVerifyingAccess) {
    return (
      <div className="fixed inset-0 z-50 bg-[#000000] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (accessDenied) {
    return null;
  }

  if (!isVerified) {
    const isLockedOut = lockoutRemaining > 0;
    const formatLockout = (sec: number) => {
      if (sec >= 3600) {
        const hrs = Math.floor(sec / 3600);
        const mins = Math.floor((sec % 3600) / 60);
        const secs = sec % 60;
        return `${hrs}h ${mins}m ${secs}s`;
      }
      const mins = Math.floor(sec / 60);
      const secs = sec % 60;
      return `${mins > 0 ? `${mins}m ` : ''}${secs}s`;
    };

    return (
      <div className="fixed inset-0 z-50 bg-[#000000] text-zinc-100 flex flex-col items-center justify-center p-4 overflow-y-auto selection:bg-red-900 selection:text-white">
        {/* Ambient Deep Red Cyberpunk Glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-red-950/20 rounded-full blur-[140px]" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-red-900/10 rounded-full blur-[120px]" />
          <div className="absolute inset-0 bg-[radial-gradient(#1c0000_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />
        </div>

        {/* Back to App button */}
        <button
          onClick={onBackToApp}
          className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold text-zinc-500 hover:text-red-400 bg-[#0a0000] border border-red-950/60 hover:border-red-800/80 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all duration-200 shadow-lg cursor-pointer z-10"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit to Application</span>
        </button>

        {/* Gateway Security Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg bg-[#050002] border border-red-900/40 rounded-3xl p-5 sm:p-8 shadow-[0_0_50px_rgba(220,38,38,0.15)] relative overflow-hidden z-10 my-auto"
        >
          {/* Header Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-900 via-red-600 to-red-900" />

          {/* Badge & Lock Icon */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-red-950 to-red-900 border border-red-700/50 flex items-center justify-center shadow-lg shadow-red-950/80 mb-4 relative">
              <ShieldAlert className="w-8 h-8 text-red-500 animate-pulse" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-[10px] font-bold text-black">
                {currentStep}
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-wider uppercase font-mono">
              aestific Sentinel Gateway
            </h1>
            <p className="text-xs text-red-400/80 mt-1 font-mono tracking-wide">
              Level 5 Classified Admin Authorization Protocol
            </p>
          </div>

          {/* 5-Step Progress Indicators */}
          <div className="grid grid-cols-5 gap-2 mb-8">
            {[1, 2, 3, 4, 5].map((step) => {
              const isPast = step < currentStep;
              const isCurrent = step === currentStep;
              return (
                <div key={step} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-full h-1.5 rounded-full transition-all duration-300 ${
                      isPast
                        ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                        : isCurrent
                        ? 'bg-red-600 animate-pulse'
                        : 'bg-red-950/60'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      isPast
                        ? 'text-red-400'
                        : isCurrent
                        ? 'text-white'
                        : 'text-zinc-700'
                    }`}
                  >
                    {step === 5 ? 'ID' : `S0${step}`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Lockout Warning Banner - Strict timer enforcement that cannot be bypassed */}
          {isLockedOut ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#180202] border border-red-700/60 rounded-2xl p-6 mb-6 text-center space-y-3 shadow-inner"
            >
              <div className="flex items-center justify-center gap-2 text-red-500 text-sm font-bold font-mono">
                <Clock className="w-5 h-5 animate-spin" />
                SECURITY LOCKOUT ACTIVE
              </div>
              <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-widest text-red-400">
                {formatLockout(lockoutRemaining)}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
                Maximum security threshold breached ({failCount} violation{failCount > 1 ? 's' : ''}). The Sentinel Gateway is locked down. Please wait for the cooldown timer to elapse.
              </p>
            </motion.div>
          ) : (
            <form onSubmit={handleStepSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-red-400/90 mb-2 flex items-center justify-between">
                  <span>
                    {currentStep === 5
                      ? 'Step 05: Admin Name'
                      : `Step 0${currentStep} Secret Password`}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {currentStep === 5 ? 'Step 5 of 5 (Identity)' : `Password Step ${currentStep} of 4`}
                  </span>
                </label>

                <div className="relative">
                  {currentStep === 5 ? (
                    <UserCheck className="w-4 h-4 text-red-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  ) : (
                    <KeyRound className="w-4 h-4 text-red-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  )}
                  <input
                    type={currentStep === 5 ? 'text' : 'password'}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onCopy={(e) => {
                      if (currentStep !== 5) e.preventDefault();
                    }}
                    onCut={(e) => {
                      if (currentStep !== 5) e.preventDefault();
                    }}
                    autoComplete={currentStep === 5 ? 'off' : 'new-password'}
                    spellCheck={false}
                    placeholder={
                      currentStep === 5
                        ? 'Enter Admin Name...'
                        : `Enter Step ${currentStep} Secret Password...`
                    }
                    autoFocus
                    disabled={isVerifyingStep}
                    className="w-full bg-[#0d0003] border border-red-900/50 rounded-xl pl-10 pr-4 py-3 text-xs sm:text-sm font-mono text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                  />
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 bg-red-950/40 border border-red-700/50 rounded-xl flex items-start gap-2.5 text-xs text-red-300 font-mono"
                >
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </motion.div>
              )}

              {/* Success Message */}
              {stepSuccessMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 bg-emerald-950/40 border border-emerald-700/50 rounded-xl flex items-center gap-2 text-xs text-emerald-300 font-mono"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{stepSuccessMsg}</span>
                </motion.div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isVerifyingStep || !inputValue.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-red-800 via-red-600 to-red-800 hover:from-red-700 hover:via-red-500 hover:to-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-red-950 cursor-pointer"
                >
                  {isVerifyingStep ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Decryption in progress...
                    </>
                  ) : (
                    <>
                      {currentStep === 5 ? 'Authenticate & Enter' : `Verify Step ${currentStep}`}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Security Notice Footer */}
          <div className="mt-6 pt-4 border-t border-red-950/60 flex items-center justify-between text-[10px] font-mono text-zinc-600">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-red-500" />
              AES-256 Multi-Stage Shield
            </span>
            <span>Violations logged: {failCount}</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: FULLSCREEN MASTER ADMIN COMMAND CENTER (DEEP BLACK & DEEP RED)
  // =========================================================================
  return (
    <div className="fixed inset-0 z-50 bg-[#020204] text-zinc-100 flex flex-col overflow-hidden font-sans selection:bg-red-900 selection:text-white">
      {/* Top Admin HUD Header */}
      <header className="h-16 border-b border-red-950/80 bg-[#050102]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-lg z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-950 to-red-700 border border-red-600/50 flex items-center justify-center shadow-md shadow-red-950">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-white tracking-wide font-mono uppercase">
                aestific Executive Matrix
              </span>
              <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-red-950/80 text-red-400 border border-red-800/60 rounded-md">
                MASTER ROOT
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Commander: <span className="text-red-400 font-bold">{adminName}</span> • Session Active
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              if (adminTab === 'overview' || adminTab === 'users') fetchAdminOverview();
              if (adminTab === 'support') fetchSupportTickets();
              if (adminTab === 'logs') fetchAuditLogs();
              if (adminTab === 'security') {
                fetchPasscodes();
                fetchBannedAdmins();
              }
              showToast('Refreshed data telemetry', 'info');
            }}
            className="p-2 rounded-xl bg-[#0e0204] border border-red-950 text-zinc-400 hover:text-red-300 hover:border-red-800 transition-all cursor-pointer"
            title="Refresh current view"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={async () => {
              try {
                await adminFetch('/api/admin/logout', { method: 'POST' });
              } catch {
                // Ignore
              }
              adminSessionTokenRef.current = '';
              setStepToken(null);
              setIsVerified(false);
              setAdminName('');
              setCurrentStep(1);
              setInputValue('');
              showToast('Admin panel locked.', 'info');
            }}
            className="px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-red-950/80 hover:bg-zinc-800 text-zinc-300 hover:text-red-400 text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Lock Admin Panel"
          >
            <Lock className="w-3.5 h-3.5" />
            Lock Panel
          </button>

          <button
            onClick={async () => {
              try {
                await adminFetch('/api/admin/logout', { method: 'POST' });
              } catch {
                // Ignore
              }
              adminSessionTokenRef.current = '';
              setStepToken(null);
              setIsVerified(false);
              setAdminName('');
              setCurrentStep(1);
              setInputValue('');
              onBackToApp();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-900 to-red-700 hover:from-red-800 hover:to-red-600 text-white text-xs font-mono font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-red-950 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Exit Admin Panel
          </button>
        </div>
      </header>

      {/* Main Layout: Admin Sidebar & Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Admin Navigation Sidebar (Deep Black / Deep Red) */}
        <aside className="w-56 shrink-0 bg-[#040102] border-r border-red-950/80 p-3 space-y-1.5 flex flex-col justify-between hidden md:flex">
          <div className="space-y-1">
            <div className="px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-red-500/70">
              Command Modules
            </div>

            {[
              { id: 'overview', label: 'Telemetry & Stats', icon: Activity },
              { id: 'behavior', label: 'Behavior Center', icon: Sparkles },
              { id: 'monitoring', label: 'AI Usage Monitor', icon: Cpu },
              { id: 'analytics', label: 'Growth & Analytics', icon: TrendingUp },
              { id: 'users', label: 'User Directory & Bans', icon: Users },
              { id: 'documents', label: 'Documents Editor', icon: FileText },
              { id: 'support', label: 'Support Desk Messages', icon: Headphones },
              { id: 'email', label: 'Direct Email Sender', icon: Mail },
              { id: 'logs', label: 'Admin Audit Logs', icon: History },
              { id: 'security', label: 'Passcodes & Admin Bans', icon: KeyRound },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = adminTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setAdminTab(tab.id as any);
                    if (tab.id === 'documents') fetchPlatformDocuments();
                    if (tab.id === 'support') fetchSupportTickets();
                    if (tab.id === 'logs') fetchAuditLogs();
                    if (tab.id === 'security') {
                      fetchPasscodes();
                      fetchBannedAdmins();
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-red-950/70 text-red-200 border border-red-800/80 shadow-[0_0_12px_rgba(220,38,38,0.2)] font-semibold'
                      : 'text-zinc-400 hover:text-red-300 hover:bg-[#0c0203]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-red-400' : 'text-zinc-500'}`} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="p-3 rounded-2xl bg-[#090102] border border-red-950/60 text-center space-y-1">
            <div className="text-[10px] font-mono text-zinc-500">ENGINE STATUS</div>
            <div className="text-xs font-mono font-bold text-red-400 flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              ONLINE 100%
            </div>
          </div>
        </aside>

        {/* Mobile Horizontal Nav Bar */}
        <div className="md:hidden flex overflow-x-auto no-scrollbar border-b border-red-950 bg-[#040102] p-2 gap-1.5 shrink-0">
          {[
            { id: 'overview', label: 'Telemetry', icon: Activity },
            { id: 'behavior', label: 'Behavior', icon: Sparkles },
            { id: 'monitoring', label: 'AI Monitor', icon: Cpu },
            { id: 'analytics', label: 'Growth', icon: TrendingUp },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'documents', label: 'Documents', icon: FileText },
            { id: 'support', label: 'Support', icon: Headphones },
            { id: 'email', label: 'Email', icon: Mail },
            { id: 'logs', label: 'Logs', icon: History },
            { id: 'security', label: 'Security', icon: KeyRound },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setAdminTab(tab.id as any);
                if (tab.id === 'documents') fetchPlatformDocuments();
                if (tab.id === 'support') fetchSupportTickets();
                if (tab.id === 'logs') fetchAuditLogs();
                if (tab.id === 'security') {
                  fetchPasscodes();
                  fetchBannedAdmins();
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono shrink-0 ${
                adminTab === tab.id
                  ? 'bg-red-950 text-red-200 border border-red-800'
                  : 'text-zinc-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-[#020204] p-4 sm:p-6 lg:p-8">
          {/* ================================================================= */}
          {/* TAB 1: TELEMETRY & STATS */}
          {/* ================================================================= */}
          {adminTab === 'overview' && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
                    <Activity className="w-5 h-5 text-red-500" />
                    Real-Time Telemetry & Core Metrics
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Global ecosystem statistics, real-time online users, and high-speed engine diagnostics.
                  </p>
                </div>

                {/* Real-Time Live Active Badge */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-red-950/60 border border-red-800/80 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-mono font-bold text-zinc-200">
                      Live Active Right Now: <span className="text-emerald-400 text-sm font-extrabold">{adminData?.stats.activeUsersLive ?? 0}</span>
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setAdminTab('documents');
                      fetchPlatformDocuments();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 border border-amber-700/80 text-amber-200 text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    Documents Editor
                  </button>

                  <button
                    onClick={() => setAdminTab('monitoring')}
                    className="px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 border border-purple-800/80 text-purple-200 text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                  >
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    AI Usage Monitor
                  </button>

                  <button
                    onClick={() => setAdminTab('analytics')}
                    className="px-3 py-1.5 rounded-xl bg-red-900/50 hover:bg-red-800/60 border border-red-700/60 text-red-200 text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-red-400" />
                    View Growth Graphs
                  </button>
                </div>
              </div>

              {/* Top Stats Cards with Active Users breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {[
                  {
                    label: 'Total Registered Users',
                    value: adminData?.stats.totalUsers ?? 0,
                    icon: Users,
                    subtext: `${(adminData?.stats.userGrowthRate7d || 0) > 0 ? '+' : ''}${adminData?.stats.userGrowthRate7d || 0}% 7d growth`,
                    subColor: (adminData?.stats.userGrowthRate7d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
                  },
                  {
                    label: 'Active (Live 15m)',
                    value: adminData?.stats.activeUsersLive ?? 0,
                    icon: Radio,
                    subtext: 'Real-time online now',
                    subColor: 'text-emerald-400',
                  },
                  {
                    label: 'Active (24h Today)',
                    value: adminData?.stats.activeUsers24h ?? 0,
                    icon: UserCheck2,
                    subtext: 'Today active users',
                    subColor: 'text-zinc-400',
                  },
                  {
                    label: 'Active (7-Day)',
                    value: adminData?.stats.activeUsers7d ?? 0,
                    icon: Calendar,
                    subtext: 'Weekly active users',
                    subColor: 'text-zinc-400',
                  },
                  {
                    label: 'Total Conversations',
                    value: adminData?.stats.totalConversations ?? 0,
                    icon: MessageSquare,
                    subtext: `${adminData?.stats.todayChatCount ?? 0} chats today`,
                    subColor: 'text-zinc-400',
                  },
                  {
                    label: 'Messages Exchanged',
                    value: adminData?.stats.totalMessages ?? 0,
                    icon: FileText,
                    subtext: 'All time volume',
                    subColor: 'text-zinc-400',
                  },
                  {
                    label: 'Files & Media Saved',
                    value: adminData?.stats.totalFiles ?? 0,
                    icon: Database,
                    subtext: 'User uploaded assets',
                    subColor: 'text-cyan-400',
                  },
                  {
                    label: "Today's Volume",
                    value: (adminData?.stats.todayChatCount ?? 0) + (adminData?.stats.todayPhotoCount ?? 0),
                    icon: Zap,
                    subtext: `${adminData?.stats.todayChatCount ?? 0} chats • ${adminData?.stats.todayPhotoCount ?? 0} photos`,
                    subColor: 'text-amber-400',
                  },
                ].map((stat, idx) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={idx}
                      className="bg-[#070102] border border-red-950/80 hover:border-red-800/80 rounded-2xl p-4 transition-all"
                    >
                      <div className="flex items-center justify-between text-zinc-500 mb-2">
                        <span className="text-[11px] font-medium">{stat.label}</span>
                        <Icon className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="text-2xl font-extrabold font-mono text-white">
                        {stat.value.toLocaleString()}
                      </div>
                      <div className={`text-[10px] font-mono mt-1 ${stat.subColor}`}>
                        {stat.subtext}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* System Infrastructure Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#070102] border border-red-950/80 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                    <Server className="w-4 h-4 text-red-500" />
                    Engine Health Diagnostics
                  </h3>

                  <div className="space-y-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between py-2 border-b border-red-950/40">
                      <span className="text-zinc-400">Environment</span>
                      <span className="text-white font-bold">{adminData?.system.nodeEnv || 'production'}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-red-950/40">
                      <span className="text-zinc-400">App Core Version</span>
                      <span className="text-red-400 font-bold">{adminData?.system.appVersion || '2.4.0'}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-red-950/40">
                      <span className="text-zinc-400">System Uptime</span>
                      <span className="text-zinc-200">
                        {Math.floor((adminData?.system.uptime || 0) / 60)} minutes ({Math.round(adminData?.system.uptime || 0)}s)
                      </span>
                    </div>
                    {adminData?.system.memoryUsage && (
                      <div className="flex items-center justify-between py-2 border-b border-red-950/40">
                        <span className="text-zinc-400">Server RAM (Heap / RSS)</span>
                        <span className="text-emerald-400 font-bold">
                          {Math.round(adminData.system.memoryUsage.heapUsed / 1024 / 1024)}MB / {Math.round(adminData.system.memoryUsage.rss / 1024 / 1024)}MB
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-[#070102] border border-red-950/80 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4 text-red-500" />
                    Integrated API Pipelines
                  </h3>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#0d0204] border border-red-950">
                      <span className="text-xs text-zinc-300 font-medium">Brevo SMTP Verification Engine</span>
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-md">
                        {adminData?.system.brevoConfigured ? 'READY' : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#0d0204] border border-red-950">
                      <span className="text-xs text-zinc-300 font-medium">Groq LPU Inference (High-Speed)</span>
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-md">
                        {adminData?.system.groqConfigured ? 'ONLINE' : 'FALLBACK'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#0d0204] border border-red-950">
                      <span className="text-xs text-zinc-300 font-medium">Aestific Intelligence Pipeline</span>
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-md">
                        {adminData?.system.neuralEngineConfigured ? 'READY' : 'OFFLINE'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: AUTONOMOUS AI USAGE & ANOMALY MONITORING */}
          {/* ================================================================= */}
          {adminTab === 'monitoring' && (
            <div className="max-w-6xl mx-auto">
              <AdminAiMonitoring authFetch={adminFetch} showToast={showToast} />
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: GROWTH & ANALYTICS GRAPHS (USER & CHAT TRENDS) */}
          {/* ================================================================= */}
          {adminTab === 'analytics' && (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Analytics Header & Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-red-500" />
                    Growth Analytics & User Trends
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Visualise user acquisition, daily active users, and chat generation volume to analyze platform health.
                  </p>
                </div>

                {/* Growth Status Badge */}
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold ${
                      adminData?.stats.growthStatus === 'growing'
                        ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400'
                        : adminData?.stats.growthStatus === 'declining'
                        ? 'bg-red-950/60 border-red-800/80 text-red-400'
                        : 'bg-zinc-900/60 border-zinc-700/80 text-zinc-300'
                    }`}
                  >
                    {adminData?.stats.growthStatus === 'growing' ? (
                      <>
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        Platform Status: GROWING (Up +{adminData.stats.userGrowthRate7d}%)
                      </>
                    ) : adminData?.stats.growthStatus === 'declining' ? (
                      <>
                        <TrendingDown className="w-4 h-4 text-red-400" />
                        Platform Status: FALLING ({adminData.stats.userGrowthRate7d}%)
                      </>
                    ) : (
                      <>
                        <Minus className="w-4 h-4 text-zinc-400" />
                        Platform Status: STABLE
                      </>
                    )}
                  </div>

                  {/* Filter selector */}
                  <div className="flex items-center bg-[#070102] border border-red-950 rounded-xl p-1">
                    {(['all', 'users', 'activity'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setAnalyticsMetric(mode)}
                        className={`px-3 py-1 text-xs font-mono rounded-lg transition-all capitalize cursor-pointer ${
                          analyticsMetric === mode
                            ? 'bg-red-950 text-red-200 border border-red-800 font-bold'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {mode === 'all' ? 'All Metrics' : mode === 'users' ? 'Users & Active' : 'Chat & Volume'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Growth Summary Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#070102] border border-red-950/80 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-zinc-500 mb-1">
                    <span className="text-[11px] font-medium">Live Active (Right Now)</span>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-emerald-400">
                    {adminData?.stats.activeUsersLive ?? 0}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-1">Users active within last 15 mins</div>
                </div>

                <div className="bg-[#070102] border border-red-950/80 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-zinc-500 mb-1">
                    <span className="text-[11px] font-medium">7-Day User Growth Rate</span>
                    <Flame className="w-4 h-4 text-red-500" />
                  </div>
                  <div
                    className={`text-2xl font-extrabold font-mono ${
                      (adminData?.stats.userGrowthRate7d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {(adminData?.stats.userGrowthRate7d || 0) >= 0 ? '+' : ''}
                    {adminData?.stats.userGrowthRate7d || 0}%
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-1">Acquisition vs previous 7-day period</div>
                </div>

                <div className="bg-[#070102] border border-red-950/80 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-zinc-500 mb-1">
                    <span className="text-[11px] font-medium">7-Day Chat Volume Trend</span>
                    <MessageSquare className="w-4 h-4 text-red-500" />
                  </div>
                  <div
                    className={`text-2xl font-extrabold font-mono ${
                      (adminData?.stats.chatGrowthRate7d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {(adminData?.stats.chatGrowthRate7d || 0) >= 0 ? '+' : ''}
                    {adminData?.stats.chatGrowthRate7d || 0}%
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-1">Chat activity vs previous 7-day period</div>
                </div>

                <div className="bg-[#070102] border border-red-950/80 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-zinc-500 mb-1">
                    <span className="text-[11px] font-medium">Total Registered Base</span>
                    <Users className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-white">
                    {adminData?.stats.totalUsers || 0}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-1">
                    {adminData?.stats.activeUsers30d || 1} monthly active users
                  </div>
                </div>
              </div>

              {/* Chart 1: Total Users Growth & Daily Active Users Area Chart */}
              {(analyticsMetric === 'all' || analyticsMetric === 'users') && (
                <div className="bg-[#070102] border border-red-950/80 rounded-2xl p-5 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-mono font-bold text-white flex items-center gap-2">
                        <Users className="w-4 h-4 text-red-500" />
                        User Base Accumulation & Active Users (Last 14 Days)
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Track cumulative user signups vs daily active users engaged on aestific.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm bg-red-600 inline-block" />
                        <span className="text-zinc-300">Total Users</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
                        <span className="text-zinc-300">Daily Active Users</span>
                      </div>
                    </div>
                  </div>

                  <div className="h-72 w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={adminData?.stats.timeline || []}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorTotalUsers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#dc2626" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="colorActiveUsers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#260408" vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke="#71717a"
                          tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                          tickFormatter={(val) => val.slice(5)}
                        />
                        <YAxis
                          stroke="#71717a"
                          tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#090102',
                            borderColor: '#7f1d1d',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            color: '#fff',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="totalUsers"
                          name="Total Registered"
                          stroke="#dc2626"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorTotalUsers)"
                        />
                        <Area
                          type="monotone"
                          dataKey="activeUsers"
                          name="Daily Active"
                          stroke="#10b981"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorActiveUsers)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Chart 2: Daily Chats & Interactions Activity Bar Chart */}
              {(analyticsMetric === 'all' || analyticsMetric === 'activity') && (
                <div className="bg-[#070102] border border-red-950/80 rounded-2xl p-5 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-mono font-bold text-white flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-red-500" />
                        Daily Chat Engagements & Activity Volume (Last 14 Days)
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Monitor daily interaction spikes, AI inferences, and user retention.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />
                        <span className="text-zinc-300">Chats Sent</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" />
                        <span className="text-zinc-300">Photos/Files</span>
                      </div>
                    </div>
                  </div>

                  <div className="h-72 w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={adminData?.stats.timeline || []}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#260408" vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke="#71717a"
                          tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                          tickFormatter={(val) => val.slice(5)}
                        />
                        <YAxis
                          stroke="#71717a"
                          tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#090102',
                            borderColor: '#7f1d1d',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            color: '#fff',
                          }}
                        />
                        <Bar dataKey="chats" name="Chat Messages" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="photos" name="Photos/Images" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Historical Raw Telemetry Table */}
              <div className="bg-[#070102] border border-red-950/80 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider">
                  Daily Growth Breakdown Log (Last 14 Days)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="border-b border-red-950/80 text-zinc-500 bg-[#090102]">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Total Users</th>
                        <th className="p-2.5">New Signups</th>
                        <th className="p-2.5">Active Users</th>
                        <th className="p-2.5">Chats</th>
                        <th className="p-2.5">Photos</th>
                        <th className="p-2.5">Files</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-950/40 text-zinc-300">
                      {(adminData?.stats.timeline || []).slice().reverse().map((day) => (
                        <tr key={day.date} className="hover:bg-red-950/20 transition-colors">
                          <td className="p-2.5 font-bold text-white">{day.date}</td>
                          <td className="p-2.5 text-red-400 font-extrabold">{day.totalUsers}</td>
                          <td className="p-2.5 text-emerald-400">+{day.newUsers}</td>
                          <td className="p-2.5 text-zinc-200">{day.activeUsers}</td>
                          <td className="p-2.5 text-zinc-200">{day.chats}</td>
                          <td className="p-2.5 text-zinc-400">{day.photos}</td>
                          <td className="p-2.5 text-zinc-400">{day.files}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: USER DIRECTORY & BAN CONTROLS */}
          {/* ================================================================= */}
          {adminTab === 'users' && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
                    <Users className="w-5 h-5 text-red-500" />
                    User Directory & Account Intelligence ({filteredUsers.length} Users)
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Live monitored registered users, real-time activity metrics, usage telemetry, and security clearance controls.
                  </p>
                </div>
              </div>

              {/* User Directory Quick Intelligence Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-[#070102] border border-red-950/80 rounded-xl p-3.5">
                  <div className="text-[10px] text-zinc-500 font-mono uppercase">Total Users</div>
                  <div className="text-xl font-extrabold text-white font-mono mt-1">
                    {adminData?.users.length || 0}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Monitored identities</div>
                </div>

                <div className="bg-[#070102] border border-red-950/80 rounded-xl p-3.5">
                  <div className="text-[10px] text-zinc-500 font-mono uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Online Now
                  </div>
                  <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                    {(adminData?.users || []).filter(
                      (u) => u.lastActiveAt && Date.now() - new Date(u.lastActiveAt).getTime() < 15 * 60 * 1000
                    ).length}
                  </div>
                  <div className="text-[10px] text-emerald-500/80 font-mono mt-0.5">Active in last 15m</div>
                </div>

                <div className="bg-[#070102] border border-red-950/80 rounded-xl p-3.5">
                  <div className="text-[10px] text-zinc-500 font-mono uppercase">Active (24h)</div>
                  <div className="text-xl font-extrabold text-white font-mono mt-1">
                    {(adminData?.users || []).filter(
                      (u) => u.lastActiveAt && Date.now() - new Date(u.lastActiveAt).getTime() < 24 * 3600 * 1000
                    ).length}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Active today</div>
                </div>

                <div className="bg-[#070102] border border-red-950/80 rounded-xl p-3.5">
                  <div className="text-[10px] text-zinc-500 font-mono uppercase">Email Verified</div>
                  <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                    {(adminData?.users || []).filter((u) => u.isEmailVerified).length}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Verified accounts</div>
                </div>

                <div className="bg-[#070102] border border-red-950/80 rounded-xl p-3.5">
                  <div className="text-[10px] text-zinc-500 font-mono uppercase">Suspended / Banned</div>
                  <div className="text-xl font-extrabold text-red-500 font-mono mt-1">
                    {(adminData?.users || []).filter((u) => u.isBanned).length}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Restricted users</div>
                </div>
              </div>

              {/* Filters Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8 relative">
                  <Search className="w-4 h-4 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchUserQuery}
                    onChange={(e) => setSearchUserQuery(e.target.value)}
                    placeholder="Search by name, email, or user ID..."
                    className="w-full bg-[#070102] border border-red-950 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-600"
                  />
                </div>

                <div className="sm:col-span-4">
                  <select
                    value={userStatusFilter}
                    onChange={(e) => setUserStatusFilter(e.target.value as any)}
                    className="w-full bg-[#070102] border border-red-950 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-red-600"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="banned">Banned Only</option>
                  </select>
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-[#060102] border border-red-950/80 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#0c0204] border-b border-red-950 text-red-400 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3.5">User Identity & Presence</th>
                        <th className="p-3.5">All-Time Activity</th>
                        <th className="p-3.5">Today's Volume</th>
                        <th className="p-3.5">Account Status</th>
                        <th className="p-3.5">Email Verification</th>
                        <th className="p-3.5">Joined Date</th>
                        <th className="p-3.5 text-right">Admin Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-950/40">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-zinc-600">
                            No matching users found.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => {
                          const isBanned = Boolean(u.isBanned);
                          const lastActiveMs = u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0;
                          const isOnlineNow = lastActiveMs && Date.now() - lastActiveMs < 15 * 60 * 1000;

                          return (
                            <tr
                              key={u.id}
                              className={`transition-colors ${
                                isBanned ? 'bg-red-950/20 hover:bg-red-950/30' : 'hover:bg-[#0c0204]'
                              }`}
                            >
                              <td className="p-3.5">
                                <div className="font-bold text-white flex items-center gap-2">
                                  {u.name}
                                  {isOnlineNow ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      ONLINE
                                    </span>
                                  ) : null}
                                  {isBanned && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-600 text-black rounded font-mono">
                                      BANNED
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-zinc-400">{u.email}</div>
                                <div className="text-[9px] text-zinc-600 flex items-center gap-2 mt-0.5">
                                  <span>{u.id}</span>
                                  {!isOnlineNow && u.lastActiveAt && (
                                    <span className="text-zinc-500">
                                      • Active {formatRelativeTime(u.lastActiveAt)}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="p-3.5 text-zinc-300 font-mono">
                                <div className="font-bold text-white">
                                  {u.activity?.conversationsCount ?? 0} <span className="text-[10px] text-zinc-500 font-normal">chats</span>
                                </div>
                                <div className="text-[10px] text-zinc-400">
                                  {u.activity?.messagesCount ?? 0} msgs • {u.activity?.filesCount ?? 0} files
                                </div>
                              </td>

                              <td className="p-3.5 text-zinc-300 font-mono">
                                <div className="font-bold text-red-400">
                                  {u.activity?.todayChats ?? 0} <span className="text-[10px] text-zinc-500 font-normal">chats</span>
                                </div>
                                <div className="text-[10px] text-zinc-400">
                                  {u.activity?.todayPhotos ?? 0} photos • {u.activity?.todayFiles ?? 0} files
                                </div>
                              </td>

                              <td className="p-3.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${
                                    isBanned
                                      ? 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                                      : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                                  }`}
                                >
                                  {isBanned ? 'BANNED' : 'ACTIVE'}
                                </span>
                              </td>

                              <td className="p-3.5 space-y-1">
                                <button
                                  onClick={() => handleToggleVerified(u.id, u.isEmailVerified)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                    u.isEmailVerified
                                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                                      : 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                                  }`}
                                >
                                  {u.isEmailVerified ? '✓ VERIFIED' : 'UNVERIFIED'}
                                </button>
                              </td>

                              <td className="p-3.5 text-zinc-400 text-[11px]">
                                {new Date(u.createdAt).toLocaleDateString()}
                              </td>

                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Inspect User Details button */}
                                  <button
                                    onClick={() => handleInspectUser(u.id)}
                                    className="p-1.5 rounded-lg bg-[#140305] text-zinc-400 hover:text-white border border-red-950 hover:border-red-700 transition-colors cursor-pointer"
                                    title="Inspect User Details & Activity"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-zinc-300" />
                                  </button>

                                  {/* Ban / Unban Button */}
                                  {isBanned ? (
                                    <button
                                      onClick={() => handleUnbanUser(u.id, u.name)}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-bold hover:bg-emerald-900 transition-colors cursor-pointer"
                                      title="Restore & Unban User"
                                    >
                                      Unban
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setBanModalUser({ id: u.id, name: u.name, email: u.email })}
                                      className="px-2.5 py-1 rounded-lg bg-red-950 text-red-400 border border-red-800 text-[11px] font-bold hover:bg-red-900 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                                      title="Ban User"
                                    >
                                      <Ban className="w-3 h-3" />
                                      Ban
                                    </button>
                                  )}

                                  {/* Quick Email Direct button */}
                                  <button
                                    onClick={() => {
                                      setEmailTo(u.email);
                                      setEmailRecipientName(u.name);
                                      setAdminTab('email');
                                    }}
                                    className="p-1.5 rounded-lg bg-[#140305] text-zinc-400 hover:text-red-400 border border-red-950 hover:border-red-800 transition-colors cursor-pointer"
                                    title={`Send Email to ${u.email}`}
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Delete Account */}
                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.email)}
                                    className="p-1.5 rounded-lg bg-[#140305] text-zinc-400 hover:text-red-500 border border-red-950 hover:border-red-800 transition-colors cursor-pointer"
                                    title="Delete User"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: SUPPORT DESK MESSAGES & TICKETS */}
          {/* ================================================================= */}
          {adminTab === 'support' && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
                    <Headphones className="w-5 h-5 text-red-500" />
                    Support Desk Inbox ({filteredTickets.length})
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Direct messages sent from users in their sidebar Support Center. Send official replies here.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {(['all', 'open', 'replied'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTicketFilter(filter)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono capitalize transition-colors cursor-pointer ${
                        ticketFilter === filter
                          ? 'bg-red-950 text-red-200 border border-red-700 font-bold'
                          : 'bg-[#0a0203] text-zinc-500 border border-red-950'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tickets List */}
              {isLoadingTickets && supportTickets.length === 0 ? (
                <div className="p-12 text-center text-zinc-600 font-mono text-xs">
                  Loading tickets...
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="bg-[#070102] border border-red-950 rounded-2xl p-12 text-center text-zinc-600 font-mono text-xs">
                  No support tickets found in this filter category.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTickets.map((t) => {
                    const isSelected = selectedTicketId === t.id;
                    const isReplied = t.status === 'replied' || Boolean(t.adminReply);

                    return (
                      <div
                        key={t.id}
                        className={`bg-[#060102] border rounded-2xl p-5 transition-all ${
                          isSelected
                            ? 'border-red-600/80 shadow-[0_0_20px_rgba(220,38,38,0.15)] bg-[#090102]'
                            : 'border-red-950/80 hover:border-red-900/60'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white font-mono">{t.subject}</span>
                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-full ${
                                  isReplied
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                                }`}
                              >
                                {isReplied ? 'REPLIED' : 'OPEN / PENDING'}
                              </span>
                            </div>
                            <div className="text-xs text-red-400 mt-0.5 font-mono">
                              From: <strong className="text-zinc-200">{t.userName}</strong> ({t.userEmail}) • ID: {t.id}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                            <span>{new Date(t.createdAt).toLocaleString()}</span>
                            <button
                              onClick={() => handleDeleteTicket(t.id)}
                              className="p-1 rounded bg-red-950 text-red-400 hover:text-white transition-colors cursor-pointer"
                              title="Delete Ticket"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* User message text */}
                        <div className="bg-[#0b0203] border border-red-950/60 rounded-xl p-3.5 text-xs text-zinc-200 leading-relaxed font-sans mb-4">
                          {t.message}
                        </div>

                        {/* Existing Admin Reply */}
                        {t.adminReply && (
                          <div className="bg-red-950/20 border border-red-800/40 rounded-xl p-3.5 mb-4 space-y-1">
                            <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-red-400">
                              <Shield className="w-3.5 h-3.5" />
                              Official Admin Reply ({t.repliedBy || 'Admin'})
                            </div>
                            <p className="text-xs text-zinc-300 leading-relaxed font-sans">{t.adminReply}</p>
                            {t.repliedAt && (
                              <div className="text-[9px] font-mono text-zinc-600">
                                Replied at {new Date(t.repliedAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Reply Form */}
                        <div className="pt-2 border-t border-red-950/60">
                          {selectedTicketId === t.id ? (
                            <div className="space-y-3">
                              <textarea
                                rows={3}
                                value={ticketReplyText}
                                onChange={(e) => setTicketReplyText(e.target.value)}
                                placeholder="Type your official administrative reply to the user..."
                                className="w-full bg-[#0d0204] border border-red-900/60 rounded-xl p-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-red-600 resize-none font-sans"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedTicketId(null);
                                    setTicketReplyText('');
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-zinc-900 text-zinc-400 text-xs font-mono cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleReplyTicket(t.id)}
                                  disabled={isReplyingTicket || !ticketReplyText.trim()}
                                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-red-800 to-red-600 hover:from-red-700 hover:to-red-500 disabled:opacity-50 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-md shadow-red-950 cursor-pointer"
                                >
                                  {isReplyingTicket ? (
                                    <>
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      Sending...
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-3 h-3" />
                                      Send Reply
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedTicketId(t.id);
                                setTicketReplyText(t.adminReply || '');
                              }}
                              className="text-xs font-mono font-bold text-red-400 hover:text-red-300 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              {t.adminReply ? 'Update / Resend Reply' : 'Compose Reply to User'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: DIRECT EMAIL DISPATCHER (VIA BREVO) */}
          {/* ================================================================= */}
          {adminTab === 'email' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
                  <Mail className="w-5 h-5 text-red-500" />
                  Direct Email Dispatcher (Powered by Brevo)
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Send official messages directly to user Gmail inboxes. Customize the sender display name as requested.
                </p>
              </div>

              <div className="bg-[#060102] border border-red-950/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
                {/* Pre-fill Quick Template Pills */}
                <div>
                  <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
                    Quick Email Templates
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        title: '⚠️ Security Notice',
                        sender: 'Aestific Security Taskforce',
                        subject: 'Important Security Notification Regarding Your Aestific Account',
                        body: 'Dear Member,\n\nOur system recorded atypical activity. Please verify your credentials immediately.\n\nRegards,\nAestific Security Team',
                      },
                      {
                        title: '📢 Cloud Gateway Notice',
                        sender: 'Aestific Cloud Desk',
                        subject: 'Notice Regarding Your Aestific Account',
                        body: 'Greetings,\n\nWe have updated your Aestific account settings with high-speed AI inference throughput.\n\nEnjoy the next generation of AI,\nAestific Core',
                      },
                      {
                        title: '🛠️ Support Response',
                        sender: 'Aestific Senior Support Lead',
                        subject: 'Response from Aestific Administrative Desk',
                        body: 'Hello,\n\nFollowing your inquiry, we have reviewed your request and made the requested adjustments.\n\nBest regards,\nAestific Support Team',
                      },
                    ].map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setEmailSenderDisplayName(tpl.sender);
                          setEmailSubject(tpl.subject);
                          setEmailBody(tpl.body);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#0e0204] border border-red-950 text-xs font-mono text-zinc-300 hover:text-red-300 hover:border-red-800 transition-colors cursor-pointer"
                      >
                        {tpl.title}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleSendDirectEmail} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono font-bold text-red-400 mb-1.5">
                        Recipient Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        placeholder="user@gmail.com"
                        className="w-full bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono font-bold text-red-400 mb-1.5">
                        Recipient Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={emailRecipientName}
                        onChange={(e) => setEmailRecipientName(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="w-full bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-red-400 mb-1.5 flex items-center justify-between">
                      <span>Sender Display Name (Shows in User Gmail) *</span>
                      <span className="text-[10px] text-zinc-500 font-normal">
                        What recipient sees as Sender
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={emailSenderDisplayName}
                      onChange={(e) => setEmailSenderDisplayName(e.target.value)}
                      placeholder="e.g. Aestific Official Admin / Support Lead"
                      className="w-full bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-red-400 mb-1.5">
                      Email Subject *
                    </label>
                    <input
                      type="text"
                      required
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Official communication regarding your account..."
                      className="w-full bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-red-400 mb-1.5">
                      Email Message Content (HTML or Plain Text) *
                    </label>
                    <textarea
                      rows={6}
                      required
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      placeholder="Type the message body to be dispatched directly through Brevo..."
                      className="w-full bg-[#0d0204] border border-red-950 rounded-xl p-3.5 text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-600 font-sans leading-relaxed resize-none"
                    />
                  </div>

                  {/* Live Dispatch Preview */}
                  <div className="p-4 rounded-xl bg-[#090102] border border-red-950 space-y-1.5 text-xs font-mono">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase">Brevo Dispatch Manifest</div>
                    <div className="text-zinc-300">
                      From: <strong className="text-red-400">{emailSenderDisplayName || 'Aestific Support'}</strong>
                    </div>
                    <div className="text-zinc-300">
                      To: <strong className="text-white">{emailTo || '(unspecified)'}</strong>
                    </div>
                    <div className="text-zinc-300">
                      Subject: <span className="text-zinc-100">{emailSubject || '(no subject)'}</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSendingEmail || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-red-800 via-red-600 to-red-800 hover:from-red-700 hover:via-red-500 hover:to-red-700 disabled:opacity-40 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-950 cursor-pointer"
                  >
                    {isSendingEmail ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Transmitting via Brevo SMTP...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Dispatch Email via Brevo
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 5: ADMIN AUDIT LOGS */}
          {/* ================================================================= */}
          {adminTab === 'logs' && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
                    <History className="w-5 h-5 text-red-500" />
                    Admin Login & Activity Audit Logs ({filteredAuditLogs.length})
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Full chronological audit trail of all administrators, login times, IP addresses, and executed operations.
                  </p>
                </div>

                <div className="w-full sm:w-72 relative">
                  <Search className="w-4 h-4 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="Search logs by admin, IP, action..."
                    className="w-full bg-[#070102] border border-red-950 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>

              {/* Active Administrators Presence & Operations Summary */}
              {adminRoster.length > 0 && (
                <div className="space-y-3 bg-[#080102] border border-red-950/80 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between pb-2 border-b border-red-950/60">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-red-400">
                      <ShieldCheck className="w-4 h-4 text-red-500" />
                      <span>Registered Administrators &amp; Live Officer Presence</span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400">
                      <strong className="text-emerald-400">{adminRoster.filter((a) => a.isActive).length}</strong> / {adminRoster.length} Admins Active
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {adminRoster.map((officer) => (
                      <div
                        key={officer.adminName}
                        className={`p-3.5 rounded-xl border transition-all ${
                          officer.isActive
                            ? 'bg-[#100305] border-red-800/80 shadow-[0_0_12px_rgba(220,38,38,0.2)]'
                            : 'bg-[#0a0203] border-red-950/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs font-mono shrink-0 ${
                                officer.isActive
                                  ? 'bg-red-950 text-red-300 border border-red-700'
                                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                              }`}
                            >
                              {officer.adminName.slice(0, 2).toUpperCase()}
                            </div>
                            <h4 className="text-xs sm:text-sm font-bold text-white truncate font-mono">
                              {officer.adminName}
                            </h4>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 shrink-0 ${
                              officer.isActive
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                officer.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                              }`}
                            />
                            {officer.isActive ? 'Online / Active' : 'Offline'}
                          </span>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-red-950/50 text-[11px] font-mono">
                          <div className="flex items-center justify-between text-zinc-400">
                            <span>Admin IP Address:</span>
                            <span className="text-zinc-200 bg-black/50 px-1.5 py-0.5 rounded border border-red-950/80 text-[10px]">
                              {officer.ip || '—'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-zinc-400">
                            <span>Last Operation:</span>
                            <span className="text-red-300 font-semibold truncate max-w-[140px] text-[10px]">
                              {officer.lastAction || 'Active'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-zinc-400">
                            <span>Activity Count:</span>
                            <span className="text-zinc-300">
                              {officer.actionCount} operations
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-zinc-500 text-[10px] pt-0.5">
                            <span>Last Recorded:</span>
                            <span>{new Date(officer.lastActiveAt).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Logs Table */}
              <div className="bg-[#060102] border border-red-950/80 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#0c0204] border-b border-red-950 text-red-400 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3.5">Timestamp</th>
                        <th className="p-3.5">Admin Identity</th>
                        <th className="p-3.5">IP Address</th>
                        <th className="p-3.5">Action Executed</th>
                        <th className="p-3.5">Operation Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-950/40">
                      {filteredAuditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-zinc-600">
                            No audit logs recorded yet.
                          </td>
                        </tr>
                      ) : (
                        filteredAuditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-[#0c0204] transition-colors">
                            <td className="p-3.5 text-zinc-500 whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="p-3.5">
                              <span className="font-bold text-red-400">{log.adminName}</span>
                            </td>
                            <td className="p-3.5">
                              <span className="px-2 py-0.5 bg-[#120204] border border-red-950 rounded text-zinc-300">
                                {log.ip}
                              </span>
                            </td>
                            <td className="p-3.5">
                              <span className="px-2 py-0.5 bg-red-950/80 text-red-300 border border-red-800/60 rounded text-[10px] font-bold">
                                {log.action}
                              </span>
                            </td>
                            <td className="p-3.5 text-zinc-300 max-w-xs truncate">
                              {log.details || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 6: PASSCODES & ADMIN BANNING */}
          {/* ================================================================= */}
          {adminTab === 'security' && (
            <div className="max-w-4xl mx-auto space-y-8">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-red-500" />
                  Passcode Configuration & Admin Banishment
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Manage Sentinel multi-step verification secrets and 24-hour administrator access suspensions.
                </p>
              </div>

              {/* Passcode Configuration Form */}
              <div className="bg-[#060102] border border-red-950/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Lock className="w-4 h-4 text-red-500" />
                    Sentinel Multi-Step Environment Secrets
                  </h3>
                  <button
                    type="button"
                    onClick={fetchPasscodes}
                    className="flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-red-300 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh Status
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-900/40 text-xs font-mono text-zinc-300 space-y-1">
                  <div className="text-red-400 font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Secure Server-Only Environment Configuration
                  </div>
                  <p className="text-zinc-400 leading-relaxed">
                    Step 1–4 passwords are loaded exclusively from server Secrets (<code className="text-red-300">ADMIN_STEP_1</code> through <code className="text-red-300">ADMIN_STEP_4</code>), followed by Admin Name verification in Step 5. Plaintext secrets are never stored in code, databases, or exposed to client browsers.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {[1, 2, 3, 4, 5].map((stepNum) => {
                    const statusObj = envStepsStatus.find((s) => s.step === stepNum);
                    const isConfigured = stepNum === 5 ? true : statusObj ? statusObj.isConfigured : false;
                    return (
                      <div
                        key={stepNum}
                        className="bg-[#0d0204] border border-red-950/80 rounded-xl p-3.5 flex items-center justify-between font-mono"
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-red-400">
                            {stepNum === 5 ? 'Step 05: Admin Name' : `Step 0${stepNum} Secret Password`}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {stepNum === 5 ? 'Administrator Identity' : `ADMIN_STEP_${stepNum} (Hidden in Secrets)`}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            isConfigured
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                              : 'bg-zinc-900/80 text-zinc-400 border-zinc-800'
                          }`}
                        >
                          {stepNum === 5 ? 'Required' : isConfigured ? 'Locked in Secrets' : 'Missing in Secrets'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Admin Lifetime Banishment & Recovery Controls */}
              <div className="bg-[#060102] border border-red-950/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
                <div>
                  <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <UserX className="w-4 h-4 text-red-500" />
                    Permanently Ban Administrator (Lifetime Lockdown with Recovery)
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                    Entering an administrator's name here permanently bans them for life and terminates all active sessions. You can recover and restore their access at any time below.
                  </p>
                </div>

                <form onSubmit={handleBanAdmin} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    value={targetBanAdminName}
                    onChange={(e) => setTargetBanAdminName(e.target.value)}
                    placeholder="Enter administrator name / call-sign to ban..."
                    className="flex-1 bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-600"
                  />
                  <button
                    type="submit"
                    disabled={isBanningAdmin || !targetBanAdminName.trim()}
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-[0_0_12px_rgba(220,38,38,0.4)]"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Ban Permanently for Life</span>
                  </button>
                </form>

                {/* Banned Admins List */}
                <div className="pt-4 border-t border-red-950 space-y-3">
                  <div className="text-[11px] font-mono text-zinc-500 font-bold uppercase flex items-center justify-between">
                    <span>Permanently Banned Administrators ({bannedAdminsList.length})</span>
                    <span className="text-[10px] text-emerald-400">Fully Recoverable</span>
                  </div>

                  {bannedAdminsList.length === 0 ? (
                    <div className="text-xs text-zinc-600 font-mono">No administrators currently banned.</div>
                  ) : (
                    <div className="space-y-2">
                      {bannedAdminsList.map((b, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-[#0c0204] border border-red-950 rounded-xl flex items-center justify-between text-xs font-mono"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-red-400">{b.adminName}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-red-950 text-red-300 border border-red-800">
                                Banned for Life
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              Enforced by {b.bannedBy || 'System'} on {new Date(b.bannedAt).toLocaleDateString()} • Permanent Status
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnbanAdmin(b.adminName)}
                            className="px-3.5 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Recover / Unban</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: DOCUMENTS EDITOR (EDIT ALL PLATFORM DOCUMENTS IN ONE PLACE) */}
          {/* ================================================================= */}
          {adminTab === 'documents' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white font-mono flex items-center gap-2">
                    <FileText className="w-5 h-5 text-red-500" />
                    Platform Documents &amp; Policies Editor
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Edit the title, description, headings, and full text of all 7 platform documents from one unified command center.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingDocs}
                    onClick={() => handleSavePlatformDocuments()}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 disabled:opacity-50 text-white text-xs font-mono font-bold flex items-center gap-2 shadow-lg shadow-red-950 cursor-pointer transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSavingDocs ? 'Saving...' : 'Save All Documents'}</span>
                  </button>
                </div>
              </div>

              {/* 7 Document Selector Pills */}
              <div className="flex flex-wrap gap-2 p-2 rounded-2xl bg-[#070102] border border-red-950/90">
                {(Object.keys(DEFAULT_EDITABLE_DOCUMENTS) as DocTab[]).map((docKey) => {
                  const docItem = editableDocs[docKey] || DEFAULT_EDITABLE_DOCUMENTS[docKey];
                  const isSelected = selectedDocTab === docKey;
                  return (
                    <button
                      key={docKey}
                      type="button"
                      onClick={() => setSelectedDocTab(docKey)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                        isSelected
                          ? 'bg-red-950/90 text-white border border-red-600 shadow-[0_0_12px_rgba(220,38,38,0.25)]'
                          : 'bg-[#0c0204] text-zinc-400 hover:text-red-300 border border-red-950/50'
                      }`}
                    >
                      <FileText className={`w-3.5 h-3.5 ${isSelected ? 'text-red-400' : 'text-zinc-600'}`} />
                      <span>{docItem.label}</span>
                      {docItem.isCustom && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Custom edited" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active Document Editor Form */}
              {(() => {
                const activeDoc = editableDocs[selectedDocTab] || DEFAULT_EDITABLE_DOCUMENTS[selectedDocTab];
                return (
                  <div className="bg-[#070102] border border-red-950/90 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-red-950/80">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-red-950/80 border border-red-800/60 text-red-300 text-xs font-mono font-bold uppercase">
                          {selectedDocTab}
                        </span>
                        <h3 className="text-base font-mono font-bold text-white">
                          Editing: {activeDoc.label}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isSavingDocs}
                          onClick={() => handleResetDocumentToDefault(selectedDocTab)}
                          className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-red-950 text-zinc-300 hover:text-white text-xs font-mono transition-colors cursor-pointer"
                        >
                          Reset to Default
                        </button>
                        <button
                          type="button"
                          disabled={isSavingDocs}
                          onClick={() => handleSavePlatformDocuments(selectedDocTab)}
                          className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-md shadow-red-950 cursor-pointer transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSavingDocs ? 'Saving...' : 'Save This Document'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-mono font-bold text-red-400 mb-1.5">
                          Document Button Title (Label)
                        </label>
                        <input
                          type="text"
                          value={activeDoc.label}
                          onChange={(e) => handleUpdateDocField(selectedDocTab, 'label', e.target.value)}
                          className="w-full bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-mono font-bold text-red-400 mb-1.5">
                          Badge / Category Tag
                        </label>
                        <input
                          type="text"
                          value={activeDoc.tag}
                          onChange={(e) => handleUpdateDocField(selectedDocTab, 'tag', e.target.value)}
                          className="w-full bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-600"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-mono font-bold text-red-400 mb-1.5">
                          Short Description (Shown on Documents List Card)
                        </label>
                        <input
                          type="text"
                          value={activeDoc.description}
                          onChange={(e) => handleUpdateDocField(selectedDocTab, 'description', e.target.value)}
                          className="w-full bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-mono font-bold text-red-400 mb-1.5">
                          Inside Document Main Heading
                        </label>
                        <input
                          type="text"
                          value={activeDoc.heading}
                          onChange={(e) => handleUpdateDocField(selectedDocTab, 'heading', e.target.value)}
                          className="w-full bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-mono font-bold text-red-400 mb-1.5">
                          Subheading / Last Updated Note
                        </label>
                        <input
                          type="text"
                          value={activeDoc.subheading}
                          onChange={(e) => handleUpdateDocField(selectedDocTab, 'subheading', e.target.value)}
                          className="w-full bg-[#0d0204] border border-red-950 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-600"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-mono font-bold text-red-400">
                          Full Document Text / Content (Supports Plain Text &amp; Markdown)
                        </label>
                        <span className="text-[11px] font-mono text-zinc-500">
                          {activeDoc.content?.length || 0} characters
                        </span>
                      </div>
                      <textarea
                        rows={18}
                        value={activeDoc.content}
                        onChange={(e) => handleUpdateDocField(selectedDocTab, 'content', e.target.value)}
                        placeholder="Write or edit the full document text here..."
                        className="w-full bg-[#0d0204] border border-red-950 rounded-2xl p-4 text-xs sm:text-sm text-zinc-100 leading-relaxed font-mono focus:outline-none focus:border-red-600 resize-y"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        disabled={isSavingDocs}
                        onClick={() => handleSavePlatformDocuments(selectedDocTab)}
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 disabled:opacity-50 text-white text-xs font-mono font-bold flex items-center gap-2 shadow-lg shadow-red-950 cursor-pointer transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isSavingDocs ? 'Saving & Publishing...' : `Save & Publish "${activeDoc.label}"`}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: AESTIFIC BEHAVIOR CENTER (ADMIN CHAT & GLOBAL RULES)         */}
          {/* ================================================================= */}
          {adminTab === 'behavior' && (
            <AdminBehaviorCenter adminFetch={adminFetch} />
          )}
        </main>
      </div>

      {/* ================================================================= */}
      {/* BAN USER MODAL DIALOG */}
      {/* ================================================================= */}
      <AnimatePresence>
        {banModalUser && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#090102] border border-red-700/80 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-950 border border-red-700 flex items-center justify-center text-red-500">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-mono font-bold text-white">Confirm User Banishment</h3>
                  <p className="text-xs text-zinc-400">{banModalUser.name} ({banModalUser.email})</p>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                This will immediately suspend the user account. The user will be unable to send messages, generate images, or access services and will only see a ban notice.
              </p>

              <div>
                <label className="block text-xs font-mono font-bold text-red-400 mb-1">
                  Reason for Ban (Visible in User Audit)
                </label>
                <textarea
                  rows={3}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full bg-[#120204] border border-red-950 rounded-xl p-3 text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-600 resize-none font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBanModalUser(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white text-xs font-mono cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBanUser}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-red-950 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Confirm Ban
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* USER DETAILED INSPECTOR MODAL */}
        {(inspectModalUser || isLoadingUserDetails) && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-3xl bg-[#090102] border border-red-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 my-8"
            >
              {isLoadingUserDetails ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-red-500 animate-spin mx-auto" />
                  <p className="text-xs font-mono text-zinc-400">Loading user activity and telemetry data...</p>
                </div>
              ) : inspectModalUser ? (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between border-b border-red-950 pb-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-red-950/80 border border-red-800/60 flex items-center justify-center text-red-400 font-bold text-lg font-mono">
                        {inspectModalUser.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-mono font-bold text-white">
                            {inspectModalUser.user.name}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${
                              inspectModalUser.user.isBanned
                                ? 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                                : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                            }`}
                          >
                            {inspectModalUser.user.isBanned ? 'BANNED' : 'ACTIVE'}
                          </span>
                          {inspectModalUser.user.isEmailVerified && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 font-mono">
                              ✓ VERIFIED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 font-mono mt-0.5">
                          {inspectModalUser.user.email} • ID: <span className="text-zinc-500">{inspectModalUser.user.id}</span>
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setInspectModalUser(null)}
                      className="p-1.5 rounded-xl bg-zinc-900/80 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Quick Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#050102] border border-red-950 rounded-xl p-3">
                      <div className="text-[10px] font-mono text-zinc-500 uppercase">Total Conversations</div>
                      <div className="text-xl font-bold font-mono text-white mt-1">
                        {inspectModalUser.activity.conversationsCount}
                      </div>
                    </div>
                    <div className="bg-[#050102] border border-red-950 rounded-xl p-3">
                      <div className="text-[10px] font-mono text-zinc-500 uppercase">Messages Sent</div>
                      <div className="text-xl font-bold font-mono text-red-400 mt-1">
                        {inspectModalUser.activity.messagesCount}
                      </div>
                    </div>
                    <div className="bg-[#050102] border border-red-950 rounded-xl p-3">
                      <div className="text-[10px] font-mono text-zinc-500 uppercase">Files & Uploads</div>
                      <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                        {inspectModalUser.activity.filesCount}
                      </div>
                    </div>
                    <div className="bg-[#050102] border border-red-950 rounded-xl p-3">
                      <div className="text-[10px] font-mono text-zinc-500 uppercase">Today's Chats</div>
                      <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                        {inspectModalUser.activity.todayChats}
                      </div>
                    </div>
                  </div>

                  {/* Account Information Section */}
                  <div className="bg-[#0c0204] border border-red-950 rounded-2xl p-4 space-y-2.5 text-xs font-mono">
                    <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
                      Account Configuration & Timeline
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-zinc-300">
                      <div>
                        <span className="text-zinc-500">Registered: </span>
                        {new Date(inspectModalUser.user.createdAt).toLocaleString()}
                      </div>
                      <div>
                        <span className="text-zinc-500">Last Active: </span>
                        {inspectModalUser.user.lastActiveAt
                          ? new Date(inspectModalUser.user.lastActiveAt).toLocaleString()
                          : 'Never'}
                      </div>
                      <div>
                        <span className="text-zinc-500">Preferred Model: </span>
                        <span className="text-red-300 font-bold">{inspectModalUser.user.preferredModel || 'Default AI'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Context Memory: </span>
                        <span className={inspectModalUser.user.memoryEnabled ? 'text-emerald-400' : 'text-zinc-500'}>
                          {inspectModalUser.user.memoryEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Conversations Breakdown */}
                  <div className="space-y-2.5">
                    <div className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-red-500" />
                      Recent User Conversations ({inspectModalUser.recentConversations?.length || 0})
                    </div>
                    {(!inspectModalUser.recentConversations || inspectModalUser.recentConversations.length === 0) ? (
                      <div className="p-4 rounded-xl bg-[#070102] border border-red-950 text-xs font-mono text-zinc-500 text-center">
                        No conversations recorded yet.
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                        {inspectModalUser.recentConversations.map((conv: any) => (
                          <div
                            key={conv.id}
                            className="p-3 rounded-xl bg-[#060102] border border-red-950/80 flex items-center justify-between text-xs font-mono hover:border-red-900 transition-colors"
                          >
                            <div className="space-y-0.5 truncate max-w-md">
                              <div className="text-white font-bold truncate">
                                {conv.title || 'Untitled Session'}
                              </div>
                              <div className="text-[10px] text-zinc-500">
                                Model: <span className="text-zinc-400">{conv.model || 'Standard'}</span> • {conv.messageCount} messages
                              </div>
                            </div>
                            <div className="text-[10px] text-zinc-500 text-right shrink-0">
                              {new Date(conv.updatedAt || conv.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer Action Buttons */}
                  <div className="flex items-center justify-between pt-4 border-t border-red-950">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEmailTo(inspectModalUser.user.email);
                          setEmailRecipientName(inspectModalUser.user.name);
                          setInspectModalUser(null);
                          setAdminTab('email');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Send Direct Email
                      </button>
                    </div>

                    <button
                      onClick={() => setInspectModalUser(null)}
                      className="px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono font-bold cursor-pointer"
                    >
                      Close Inspector
                    </button>
                  </div>
                </>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

function formatRelativeTime(isoDate?: string): string {
  if (!isoDate) return 'Never';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (diffMs < 0) return 'Just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

function RotateCcwIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
