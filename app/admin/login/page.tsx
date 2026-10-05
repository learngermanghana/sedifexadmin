'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

type LoginResponse = {
  ok?: boolean;
  role?: string;
  scope?: string;
  error?: string;
};

const accessNotes = [
  'Protected admin access',
  'Staff and platform roles',
  'Fast, image-free login screen',
];

const REMEMBERED_EMAIL_KEY = 'sedifex_admin_remembered_email';
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  async function login(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const trimmedEmail = email.trim();

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password, rememberMe }),
      });

      const data = (await res.json().catch(() => ({}))) as LoginResponse;

      if (!res.ok || !data.ok || !data.role || !data.scope) {
        setError(data?.error ?? 'Unable to sign in. Check your email and password.');
        return;
      }

      if (rememberMe) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, trimmedEmail);
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      router.push('/admin');
    } catch {
      setError('Unable to reach the login service. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-white">
      <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="absolute -right-24 bottom-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="hidden border-r border-white/10 bg-slate-900/70 p-8 lg:block">
          <Link href="/admin/login" className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 text-lg font-black shadow-lg shadow-indigo-500/20">
              S
            </span>
            <span>
              <span className="block text-sm font-semibold uppercase tracking-[0.22em] text-indigo-200">
                Sedifex
              </span>
              <span className="block text-xs text-slate-400">Admin Console</span>
            </span>
          </Link>

          <div className="mt-16">
            <p className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 inline-flex">
              Secure access
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight">
              Sign in and manage Sedifex operations.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-7 text-slate-300">
              Manage stores, integrations, checkout setup, and support tasks from one focused admin area.
            </p>
          </div>

          <div className="mt-10 space-y-3">
            {accessNotes.map((note) => (
              <div key={note} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                <span className="h-2 w-2 rounded-full bg-indigo-300" />
                {note}
              </div>
            ))}
          </div>
        </aside>

        <div className="p-5 sm:p-8 lg:p-10">
          <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
            <Link href="/admin/login" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500 text-base font-black">
                S
              </span>
              <span>
                <span className="block text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">
                  Sedifex
                </span>
                <span className="block text-xs text-slate-400">Admin Console</span>
              </span>
            </Link>
          </div>

          <div className="mx-auto max-w-md">
            <p className="text-sm font-semibold text-indigo-200">Welcome back</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">
              Admin login
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Use your assigned admin or staff credentials to continue.
            </p>

            <form className="mt-8 space-y-5" onSubmit={login}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/15"
                  placeholder="admin@sedifex.com"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-slate-200" htmlFor="password">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-xs font-semibold text-indigo-200 transition hover:text-indigo-100"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/15"
                  placeholder="Enter your password"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.06]" htmlFor="rememberMe">
                <input
                  id="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-900 text-indigo-500 accent-indigo-500"
                />
                <span>
                  <span className="block font-semibold text-slate-100">Remember me</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Keep this device signed in for 30 days and remember your email address.
                  </span>
                </span>
              </label>

              {error ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              <button
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign in to dashboard'}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-6 text-slate-400">
              Credentials are controlled by Vercel environment variables. Keep admin passwords private and rotate them when staff access changes.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
