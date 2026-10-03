import React, { useState, useEffect } from 'react';
import { AestificLogo, AestificArchIcon } from './AestificLogo';
import { SpatialAtmosphere } from './SpatialAtmosphere';
import {
  Mail,
  Lock,
  User as UserIcon,
  ArrowRight,
  KeyRound,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  Key,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { setAuthToken } from '../lib/api';

interface AuthModalProps {
  initialMode?: 'login' | 'register';
  onLogin: (email: string, pass: string, remember: boolean) => Promise<{ requiresVerification?: boolean; email?: string } | void>;
  onRegister: (name: string, email: string, pass: string, confirm: string) => Promise<{ requiresVerification?: boolean; email?: string } | void>;
  onDemoLogin?: () => Promise<void>;
  onVerifyEmail?: (email: string, code: string) => Promise<void>;
  onResendVerification?: (email: string) => Promise<string>;
  onForgotPassword?: (email: string) => Promise<string>;
  onResetPassword?: (email: string, code: string, newPass: string, confirmPass: string) => Promise<void>;
  onClose?: () => void;
  pendingPrompt?: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode = 'login',
  onLogin,
  onRegister,
  onDemoLogin,
  onVerifyEmail,
  onResendVerification,
  onForgotPassword,
  onResetPassword,
  onClose,
  pendingPrompt,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'forgot' | 'reset'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialMode && (initialMode === 'login' || initialMode === 'register')) {
      setMode(initialMode);
      setError(null);
      setSuccessInfo(null);
    }
  }, [initialMode]);

  // Resend cooldown timer in seconds
  const [resendCooldown, setResendCooldown] = useState(0);

  // Expiration countdown in seconds (600s for verify, 900s for reset)
  const [expireSecondsRemaining, setExpireSecondsRemaining] = useState(600);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendCooldown > 0) {
      interval = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendCooldown]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if ((mode === 'verify' || mode === 'reset') && expireSecondsRemaining > 0) {
      interval = setInterval(() => {
        setExpireSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [mode, expireSecondsRemaining]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessInfo(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        if (!email || !password) {
          throw new Error('Please enter both email and password.');
        }
        const res = await onLogin(email.trim(), password, remember);
        if (res && res.requiresVerification && res.email) {
          setEmail(res.email);
          setMode('verify');
          setExpireSecondsRemaining(600);
          setResendCooldown(30);
          setSuccessInfo('Please verify your email address to continue.');
        }
      } else if (mode === 'register') {
        if (!name || !email || !password) {
          throw new Error('All fields are required.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        const res = await onRegister(name.trim(), email.trim(), password, confirmPassword);
        if (res && res.requiresVerification) {
          setMode('verify');
          setExpireSecondsRemaining(600);
          setResendCooldown(60);
          setSuccessInfo(`Verification code sent via Brevo to ${res.email || email.trim()}`);
        }
      } else if (mode === 'verify') {
        const cleanCode = verificationCode.trim();
        if (!cleanCode) {
          throw new Error('Please enter the 6-digit verification code.');
        }
        if (!/^\d{6}$/.test(cleanCode)) {
          throw new Error('Verification code must be exactly 6 digits.');
        }
        if (expireSecondsRemaining <= 0) {
          throw new Error('This verification code has expired. Please click Resend Code.');
        }

        if (onVerifyEmail) {
          await onVerifyEmail(email.trim(), cleanCode);
        } else {
          const res = await fetch('/api/auth/verify-email', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), code: cleanCode }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Verification failed');
          window.location.reload();
        }
      } else if (mode === 'forgot') {
        if (!email) {
          throw new Error('Please enter your email address.');
        }
        if (onForgotPassword) {
          const msg = await onForgotPassword(email.trim());
          setSuccessInfo(msg || 'If an account exists for this email, a password reset email has been sent.');
        } else {
          const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Password reset request failed.');
          setSuccessInfo(data.message || 'If an account exists for this email, a password reset email has been sent.');
        }
        setMode('reset');
        setExpireSecondsRemaining(900); // 15 minutes
        setResendCooldown(60);
        setVerificationCode('');
        setPassword('');
        setConfirmPassword('');
      } else if (mode === 'reset') {
        const cleanCode = verificationCode.trim();
        if (!email) {
          throw new Error('Email address is required.');
        }
        if (!cleanCode) {
          throw new Error('Please enter the 6-digit reset code.');
        }
        if (!/^\d{6}$/.test(cleanCode)) {
          throw new Error('Password reset code must be exactly 6 digits.');
        }
        if (expireSecondsRemaining <= 0) {
          throw new Error('This reset code has expired. Please request a new code.');
        }
        if (!password) {
          throw new Error('Please enter a new password.');
        }
        if (password.length < 6) {
          throw new Error('New password must be at least 6 characters.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        if (onResetPassword) {
          await onResetPassword(email.trim(), cleanCode, password, confirmPassword);
          onClose();
        } else {
          const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email.trim(),
              code: cleanCode,
              newPassword: password,
              confirmPassword,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Password reset failed.');
          if (data.token) {
            setAuthToken(data.token);
          }
          onClose();
          window.location.reload();
        }
      }
    } catch (err: any) {
      if (err.requiresVerification) {
        setEmail(err.email || email);
        setMode('verify');
        setExpireSecondsRemaining(600);
        setResendCooldown(30);
        setError(err.message || 'Please enter the verification code sent to your email.');
      } else if (
        err.code === 'ACCOUNT_EXISTS' ||
        err.status === 409 ||
        (err.message && err.message.toLowerCase().includes('already exists'))
      ) {
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setError('An account with this email address already exists. Please sign in with your password.');
      } else {
        setError(err.message || 'Authentication error. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setSuccessInfo(null);
    setLoading(true);

    try {
      if (mode === 'reset') {
        if (onForgotPassword) {
          const msg = await onForgotPassword(email.trim());
          setSuccessInfo(msg || 'If an account exists for this email, a password reset email has been sent.');
        } else {
          const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to resend code');
          setSuccessInfo(data.message || 'If an account exists for this email, a password reset email has been sent.');
        }
        setResendCooldown(60);
        setExpireSecondsRemaining(900);
        setVerificationCode('');
      } else {
        if (onResendVerification) {
          const msg = await onResendVerification(email.trim());
          setSuccessInfo(msg || 'A new verification code has been dispatched.');
        } else {
          const res = await fetch('/api/auth/resend-verification', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to resend code');
          setSuccessInfo(data.message || 'A new verification code has been dispatched.');
        }
        setResendCooldown(60);
        setExpireSecondsRemaining(600);
        setVerificationCode('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/95 backdrop-blur-md overflow-y-auto select-none">
      {/* Dynamic Animated Cosmic Atmosphere */}
      <SpatialAtmosphere isStreaming={false} />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px] bg-white dark:bg-[#0a0a0c] border border-zinc-200/90 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 my-auto text-zinc-900 dark:text-white transition-colors"
      >
        {/* Optional Close / Back Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Back to home"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Brand Header with Refined, Appropriately Sized Logo */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-2.5 flex items-center justify-center">
            {/* Subtle luminous aura maintaining neutral palette */}
            <div className="absolute -inset-2.5 rounded-full bg-zinc-200/60 dark:bg-white/[0.05] blur-md pointer-events-none" />
            <AestificArchIcon size={38} className="relative z-10" />
          </div>

          {/* Refined, smaller "aestific" lowercase wordmark */}
          <div className="flex flex-col items-center">
            <span
              className="lowercase font-medium tracking-[0.24em] text-black dark:text-white leading-none select-none text-xl sm:text-[22px] inline-flex items-baseline"
              style={{
                fontFamily: "'Comfortaa', 'Outfit', system-ui, -apple-system, sans-serif",
              }}
            >
              <span style={{ fontFamily: "'Comfortaa', 'Outfit', cursive, sans-serif", fontWeight: 500 }}>a</span>
              <span style={{ fontFamily: "'Comfortaa', 'Outfit', cursive, sans-serif", fontWeight: 500 }}>estific</span>
            </span>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 max-w-xs leading-relaxed">
            {mode === 'login'
              ? 'Sign in to access your intelligence workspace.'
              : mode === 'register'
              ? 'Create an account to start generating with Aestific.'
              : mode === 'verify'
              ? 'Enter the 6-digit code sent to your email.'
              : mode === 'forgot'
              ? 'Enter your account email to receive a recovery code.'
              : 'Choose a secure new password for your account.'}
          </p>
        </div>

        {/* Pending Prompt Indicator Banner */}
        {pendingPrompt && (
          <div className="mb-5 p-3 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 text-xs text-zinc-700 dark:text-zinc-300">
            <div className="flex items-center gap-1.5 font-semibold text-black dark:text-white mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-black dark:bg-white" />
              <span>Prompt ready to execute</span>
            </div>
            <p className="italic text-zinc-600 dark:text-zinc-400 line-clamp-2 font-mono text-[11px] mb-1">
              "{pendingPrompt}"
            </p>
            <p className="text-[10px] text-zinc-500">
              Sign in or create an account to start generating intelligence.
            </p>
          </div>
        )}

        {/* Tab switch (only in login / register modes) */}
        {mode === 'login' || mode === 'register' ? (
          <div className="flex p-1 bg-zinc-100/90 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.08] rounded-2xl mb-6 relative">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setSuccessInfo(null); }}
              className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); setSuccessInfo(null); }}
              className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        ) : mode === 'verify' ? (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white mb-2.5">
              <Mail className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-wide">Verify Your Email</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
              We sent a 6-digit verification code to <span className="text-zinc-900 dark:text-zinc-200 font-semibold">{email}</span>
            </p>
          </div>
        ) : mode === 'forgot' ? (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white mb-2.5">
              <Key className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-wide">Reset Your Password</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
              Enter your account email and we'll dispatch a secure 15-minute password reset code.
            </p>
          </div>
        ) : (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white mb-2.5">
              <KeyRound className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-wide">Choose New Password</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
              Enter the 6-digit code sent to <span className="text-zinc-900 dark:text-zinc-200 font-semibold">{email}</span> and your new password.
            </p>
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 mb-5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-medium"
          >
            {error}
          </motion.div>
        )}

        {successInfo && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 mb-5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successInfo}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">Full Name</label>
              <div className="relative group">
                <UserIcon className="w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Elena Rostova"
                  required
                  className="w-full h-11 bg-zinc-50/80 dark:bg-black/40 border border-zinc-200/90 dark:border-white/10 rounded-xl pl-10 pr-3.5 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-900/5 dark:focus:ring-white/10 transition-all"
                />
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">Email Address</label>
              <div className="relative group">
                <Mail className="w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@aestific.ai"
                  required
                  className="w-full h-11 bg-zinc-50/80 dark:bg-black/40 border border-zinc-200/90 dark:border-white/10 rounded-xl pl-10 pr-3.5 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-900/5 dark:focus:ring-white/10 transition-all"
                />
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Password</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); setSuccessInfo(null); }}
                    className="text-[11px] text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative group">
                <Lock className="w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full h-11 bg-zinc-50/80 dark:bg-black/40 border border-zinc-200/90 dark:border-white/10 rounded-xl pl-10 pr-10 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-900/5 dark:focus:ring-white/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 cursor-pointer transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">Confirm Password</label>
              <div className="relative group">
                <Lock className="w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full h-11 bg-zinc-50/80 dark:bg-black/40 border border-zinc-200/90 dark:border-white/10 rounded-xl pl-10 pr-10 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-900/5 dark:focus:ring-white/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 cursor-pointer transition-colors"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'verify' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">6-Digit Verification Code</label>
                  <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-medium">
                    ⏱ {formatTimeRemaining(expireSecondsRemaining)}
                  </span>
                </div>
                <div className="relative group">
                  <KeyRound className="w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    autoFocus
                    required
                    className="w-full h-12 bg-zinc-50/80 dark:bg-black/60 border border-zinc-300 dark:border-white/20 rounded-xl pl-10 pr-3.5 text-center text-lg font-mono tracking-[0.4em] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-700 placeholder:tracking-normal focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 focus:ring-2 focus:ring-zinc-900/5 dark:focus:ring-white/10 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 text-zinc-600 dark:text-zinc-400">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setSuccessInfo(null); }}
                  className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors py-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className="flex items-center gap-1 text-zinc-800 dark:text-zinc-200 hover:text-black dark:hover:text-white disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors py-1 font-medium cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>{resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend Code'}</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'reset' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">6-Digit Reset Code</label>
                  <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-medium">
                    ⏱ {formatTimeRemaining(expireSecondsRemaining)}
                  </span>
                </div>
                <div className="relative group">
                  <KeyRound className="w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    autoFocus
                    required
                    className="w-full h-11 bg-zinc-50/80 dark:bg-black/60 border border-zinc-300 dark:border-white/20 rounded-xl pl-10 pr-3.5 text-center text-base font-mono tracking-[0.3em] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-700 placeholder:tracking-normal focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 focus:ring-2 focus:ring-zinc-900/5 dark:focus:ring-white/10 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">New Password</label>
                <div className="relative group">
                  <Lock className="w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    className="w-full h-11 bg-zinc-50/80 dark:bg-black/40 border border-zinc-200/90 dark:border-white/10 rounded-xl pl-10 pr-10 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-900/5 dark:focus:ring-white/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 cursor-pointer transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">Confirm New Password</label>
                <div className="relative group">
                  <Lock className="w-4 h-4 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-white transition-colors absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    className="w-full h-11 bg-zinc-50/80 dark:bg-black/40 border border-zinc-200/90 dark:border-white/10 rounded-xl pl-10 pr-10 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-900/5 dark:focus:ring-white/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 cursor-pointer transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 text-zinc-600 dark:text-zinc-400">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setSuccessInfo(null); }}
                  className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors py-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className="flex items-center gap-1 text-zinc-800 dark:text-zinc-200 hover:text-black dark:hover:text-white disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors py-1 font-medium cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>{resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend Code'}</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="flex items-center justify-between text-xs pt-1 text-zinc-600 dark:text-zinc-400">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); setSuccessInfo(null); }}
                className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors py-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setError(null);
                  setSuccessInfo(null);
                }}
                className="text-zinc-800 dark:text-zinc-200 hover:text-black dark:hover:text-white transition-colors py-1 font-medium cursor-pointer"
              >
                Already have a reset code?
              </button>
            </div>
          )}

          {mode === 'login' && (
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-zinc-100 dark:bg-black/40 border-zinc-300 dark:border-white/20 text-black dark:text-white focus:ring-1 focus:ring-zinc-400 cursor-pointer"
                />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">Remember session</span>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 text-xs font-semibold hover:opacity-95 shadow-xs transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50 cursor-pointer active:scale-[0.99] group"
          >
            <span>
              {loading
                ? mode === 'verify'
                  ? 'Verifying Code...'
                  : mode === 'forgot'
                  ? 'Dispatching Reset Email...'
                  : mode === 'reset'
                  ? 'Updating Password...'
                  : 'Authenticating...'
                : mode === 'verify'
                ? 'Verify & Enter Aestific'
                : mode === 'forgot'
                ? 'Send Reset Code'
                : mode === 'reset'
                ? 'Reset Password & Sign In'
                : mode === 'login'
                ? 'Enter Aestific'
                : 'Create Account'}
            </span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>
      </motion.div>

      {/* Login Page Footer Copyright */}
      <div className="fixed bottom-3 left-0 right-0 text-center text-[11px] text-zinc-500 select-none z-10 font-mono">
        © 2026 Aestific AI. All rights reserved.
      </div>
    </div>
  );
};
