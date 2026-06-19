import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { motion } from 'framer-motion';
import { Mail, Lock, User as UserIcon, Sparkles, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';

export const AuthLayout: React.FC = () => {
  const { login, signUp, verifyEmailCode, forgotPasswordEmail, resetPasswordFields, user } = useAuth();
  const { toast } = useToast();
  
  // Auth state: 'login' | 'signup' | 'verify' | 'forgot' | 'reset'
  const [mode, setMode] = useState<'login' | 'signup' | 'verify' | 'forgot' | 'reset'>(
    user && !user.isVerified ? 'verify' : 'login'
  );

  // Form inputs
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // 6-digit OTP box states
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
  const otpRefs = useRef<HTMLInputElement[]>([]);

  // UI States
  const [loading, setLoading] = useState(false);

  const handleOtpChange = (value: string, idx: number) => {
    // Only accept numbers
    if (value && isNaN(Number(value))) return;

    const newDigits = [...otpDigits];
    newDigits[idx] = value.substring(value.length - 1); // take last character
    setOtpDigits(newDigits);

    // Auto focus next box
    if (value && idx < 5) {
      otpRefs.current[idx + 1].focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1].focus();
    }
  };

  const getOtpCode = (): string => otpDigits.join('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast('Please enter credentials', 'error');
    
    setLoading(true);
    try {
      const u = await login(email, password);
      toast(`Welcome back, ${u.displayName}!`, 'success');
      if (!u.isVerified) {
        setMode('verify');
      }
    } catch (err: any) {
      toast(err.message || 'Invalid credentials', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !username || !email || !password) {
      return toast('Please fill in all fields', 'error');
    }
    
    setLoading(true);
    try {
      await signUp(displayName, username, email, password);
      setMode('verify');
      toast('Verification code sent to server logs!', 'success');
    } catch (err: any) {
      toast(err.message || 'Signup failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = getOtpCode();
    if (code.length < 6) return toast('Please enter 6-digit code', 'error');
    
    setLoading(true);
    try {
      await verifyEmailCode(code);
      toast('Email verified successfully!', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      toast(err.message || 'Verification failed. Double check code in logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast('Please enter your email', 'error');
    
    setLoading(true);
    try {
      await forgotPasswordEmail(email);
      toast('Reset code sent to server logs!', 'success');
      setMode('reset');
    } catch (err: any) {
      toast(err.message || 'Forgot request failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = getOtpCode();
    if (!email || code.length < 6 || !newPassword) {
      return toast('Please enter all credentials', 'error');
    }
    
    setLoading(true);
    try {
      await resetPasswordFields(email, code, newPassword);
      toast('Password reset successfully. You can now login.', 'success');
      setMode('login');
      setPassword('');
      setOtpDigits(Array(6).fill(''));
    } catch (err: any) {
      toast(err.message || 'Reset password failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 relative">
      {/* Glow Orbs */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500/10 dark:bg-blue-600/5 rounded-full filter blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/10 dark:bg-purple-600/5 rounded-full filter blur-[120px] pointer-events-none -z-10" />

      {/* Glass Card Wrapper */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md p-8 rounded-[2rem] glass-panel relative z-10 shadow-2xl"
      >
        {/* Header Block */}
        <div className="flex flex-col items-center mb-8 select-none">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4 cursor-pointer"
          >
            <Sparkles className="w-7 h-7 text-white" />
          </motion.div>
          <h1 className="text-3xl font-extrabold font-display bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-500 dark:from-blue-400 dark:to-purple-300 tracking-tight mb-2">
            Altma Chat
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center font-medium px-4">
            {mode === 'login' && 'Connect securely with your closest friends'}
            {mode === 'signup' && 'Create your account to start private chatting'}
            {mode === 'verify' && 'Verify your account using the code from server logs'}
            {mode === 'forgot' && 'Reset your account password'}
            {mode === 'reset' && 'Enter your reset code and new password'}
          </p>
        </div>

        {/* Dynamic Forms */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Email or Username</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter email or username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs"
                  required
                />
                <Mail className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase font-bold text-slate-400">Password</label>
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-xs font-bold text-indigo-500 hover:text-indigo-600 transition"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 rounded-xl glass-input text-xs"
                  required
                />
                <Lock className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-xl transition shadow-lg shadow-indigo-600/10 flex items-center justify-center cursor-pointer"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
            </button>

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="font-black text-indigo-500 hover:text-indigo-600 transition"
              >
                Sign Up
              </button>
            </p>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Display Name</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs"
                  required
                />
                <UserIcon className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Username</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="johndoe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs"
                  required
                />
                <UserIcon className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  placeholder="john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs"
                  required
                />
                <Mail className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Password</label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs"
                  required
                />
                <Lock className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-xl transition shadow-lg flex items-center justify-center cursor-pointer"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
            </button>

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="font-black text-indigo-500 hover:text-indigo-600 transition"
              >
                Sign In
              </button>
            </p>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-6">
            <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center">
              <p className="text-[10px] text-indigo-400 font-bold leading-normal">
                Check server console/terminal logs or open the tasks file to get your verification code.
              </p>
            </div>

            {/* 6-Box OTP Input */}
            <div className="flex justify-between items-center gap-2 px-2 select-none">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { otpRefs.current[idx] = el as HTMLInputElement; }}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(e.target.value, idx)}
                  onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                  className="w-12 h-12 rounded-xl text-center glass-input text-lg font-extrabold focus:border-indigo-500"
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl transition flex items-center justify-center cursor-pointer"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Account'}
            </button>

            <div className="flex justify-center select-none">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-xs text-slate-400 hover:text-indigo-400 flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs"
                  required
                />
                <Mail className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl transition flex items-center justify-center cursor-pointer"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Code'}
            </button>

            <div className="flex justify-center select-none">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-xs text-slate-400 hover:text-indigo-400 flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
              </button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs"
                  required
                />
                <Mail className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Reset Code</label>
              {/* 6-Box OTP Input */}
              <div className="flex justify-between items-center gap-2 py-2 select-none">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { otpRefs.current[idx] = el as HTMLInputElement; }}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(e.target.value, idx)}
                    onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                    className="w-12 h-12 rounded-xl text-center glass-input text-base font-extrabold focus:border-indigo-500"
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">New Password</label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs"
                  required
                />
                <Lock className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl transition flex items-center justify-center cursor-pointer"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reset Password'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};
export default AuthLayout;
