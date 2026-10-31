import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../api';
import type { SessionUser } from '../types';

type Props = {
  googleConfigured: boolean;
  error: string;
  onError: (error: string) => void;
  onLogin: (user: SessionUser) => void;
};

export function LoginScreen({ googleConfigured, error, onError, onLogin }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function validateEmail(val: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  }

  function validatePassword(pass: string): { valid: boolean; message?: string } {
    if (pass.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long.' };
    }
    if (!/[A-Za-z]/.test(pass)) {
      return { valid: false, message: 'Password must contain at least one letter.' };
    }
    if (!/[0-9]/.test(pass)) {
      return { valid: false, message: 'Password must contain at least one number.' };
    }
    return { valid: true };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onError('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      onError('Please enter your email address.');
      return;
    }
    if (!validateEmail(cleanEmail)) {
      onError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      onError('Please enter your password.');
      return;
    }

    if (mode === 'signup') {
      const passCheck = validatePassword(password);
      if (!passCheck.valid) {
        onError(passCheck.message || 'Invalid password.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const res = await api.register({
          email: cleanEmail,
          password,
          name: name.trim() || undefined,
        });
        onLogin(res.user);
      } else {
        const res = await api.login({
          email: cleanEmail,
          password,
        });
        onLogin(res.user);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-6">
      <div className="bg-white border border-gray-100 w-full max-w-md rounded-3xl p-8 shadow-2xl relative">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <span className="text-2xl font-black tracking-tighter text-black">ONE</span>
          <span className="h-2 w-2 rounded-full bg-[#00b050]" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">
          {mode === 'signin' ? 'Sign In' : 'Create an Account'}
        </h1>

        <a
          href="/api/auth/google"
          className="w-full bg-[#e6f4ea] hover:bg-[#daf0e0] text-gray-800 font-medium py-2.5 px-4 rounded-xl flex items-center justify-center space-x-3 transition border border-[#d2ead6]"
        >
          <GoogleMark />
          <span className="text-sm font-semibold">Continue with Google</span>
        </a>

        {!googleConfigured && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5 mt-3">
            Google OAuth is not configured yet. Add the client id and secret in `.env`, then restart the API.
          </p>
        )}

        <div className="relative flex items-center justify-center my-5">
          <div className="border-t border-gray-200 w-full" />
          <span className="bg-white px-3 text-[11px] text-gray-400 font-medium whitespace-nowrap absolute">
            {mode === 'signin' ? 'or sign in with email' : 'or sign up with email'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <div>
              <label htmlFor="name" className="block text-[11px] font-semibold text-gray-500 mb-1">Full Name</label>
              <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Alex Johnson"
                type="text"
                autoComplete="name"
                className="w-full bg-[#f4f5f7] border-0 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00b050] transition"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-[11px] font-semibold text-gray-500 mb-1">Email Address</label>
            <input
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              type="email"
              autoComplete="email"
              className="w-full bg-[#f4f5f7] border-0 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00b050] transition"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[11px] font-semibold text-gray-500 mb-1">Password</label>
            <div className="relative">
              <input
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'signup' ? 'Min 8 chars, 1 letter & 1 number' : 'Enter password'}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full bg-[#f4f5f7] border-0 rounded-xl px-4 py-3 pr-11 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00b050] transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-500 bg-rose-50 p-2.5 rounded-lg border border-rose-100">{error}</p>
          )}

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={submitting}
            className="w-full bg-[#00b050] hover:bg-[#009644] text-white font-semibold py-3 px-4 rounded-xl text-sm transition shadow-md mt-2 disabled:opacity-50"
          >
            {submitting
              ? mode === 'signup'
                ? 'Creating Account…'
                : 'Signing In…'
              : mode === 'signup'
              ? 'Sign Up'
              : 'Sign In'}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-gray-500">
          {mode === 'signin' ? (
            <p>
              Don't have an account?{' '}
              <button
                id="toggle-auth-mode-btn"
                type="button"
                onClick={() => {
                  setMode('signup');
                  onError('');
                }}
                className="text-[#00b050] font-semibold hover:underline"
              >
                Sign Up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                id="toggle-auth-mode-btn"
                type="button"
                onClick={() => {
                  setMode('signin');
                  onError('');
                }}
                className="text-[#00b050] font-semibold hover:underline"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.1 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.3 5.3c3.6-3.4 5.7-8.3 5.7-14 0-1.7-.2-3.4-.6-5z" />
    </svg>
  );
}
