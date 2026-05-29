import type { FC, FormEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";

type Mode = "signin" | "signup";

export const LoginPage: FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLight = theme === "light";

  const pageClass = isLight
    ? "min-h-screen bg-slate-100 text-slate-950"
    : "min-h-screen bg-[#030711] text-white";
  const panelClass = isLight
    ? "border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
    : "border-white/[0.07] bg-slate-950/72 shadow-[0_28px_70px_rgba(0,0,0,0.32)]";
  const mutedText = isLight ? "text-slate-600" : "text-slate-400";
  const titleText = isLight ? "text-slate-950" : "text-white";
  const inactiveTab = isLight ? "text-slate-600 hover:text-slate-950" : "text-slate-400 hover:text-slate-100";
  const toggleClass = isLight
    ? "border-slate-300 bg-white text-slate-700"
    : "border-white/[0.08] bg-white/[0.035] text-slate-200";
  const inputClass = isLight
    ? "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
    : "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      setSubmitting(true);
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      setSubmitting(false);
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setError("Check your email for a confirmation link.");
      }
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);

    if (signInError) {
      setError(signInError);
    } else {
      navigate("/dashboard");
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (oauthError) setError(oauthError.message);
  };

  return (
    <main className={pageClass}>
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className={`relative hidden overflow-hidden border-r lg:flex ${isLight ? "border-slate-200 bg-white" : "border-white/[0.06] bg-[#07111f]"}`}>
          <div className={isLight
            ? "absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(6,182,212,0.14),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.12),transparent_26%),linear-gradient(145deg,rgba(255,255,255,0.72),rgba(226,232,240,0.86))]"
            : "absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(6,182,212,0.18),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(145deg,rgba(3,7,18,0.05),rgba(3,7,18,0.78))]"
          } />
          <div className="relative flex w-full flex-col justify-between p-12 xl:p-16">
            <BrandMark isLight={isLight} />
            <div className="max-w-2xl">
              <div className={`mb-5 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] ${isLight ? "text-emerald-700" : "text-emerald-100"}`}>
                Secure Portal
              </div>
              <h2 className={`text-5xl font-black leading-[1.02] tracking-normal xl:text-6xl ${titleText}`}>
                Live operations, calls, leads, and client reporting in one command center.
              </h2>
              <p className={`mt-6 max-w-xl text-base leading-7 ${mutedText}`}>
                Sign in to monitor activity, manage lead intake, review recordings, and keep every client workspace accountable.
              </p>
            </div>
            <div className={`flex items-center justify-between text-xs ${isLight ? "text-slate-500" : "text-slate-500"}`}>
              <span>Multi-tenant operations platform</span>
              <span>dashboard.victorysync.com</span>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-5 sm:px-8 sm:py-8">
          <div className="w-full max-w-[460px]">
            <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
              <BrandMark isLight={isLight} compact />
              <ThemeButton className={toggleClass} isLight={isLight} onClick={toggleTheme} />
            </div>

            <div className={`rounded-[28px] border p-5 sm:p-8 ${panelClass}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-500">Account Access</div>
                  <h1 className={`mt-3 text-3xl font-black tracking-normal ${titleText}`}>
                    {mode === "signin" ? "Welcome back" : "Join your workspace"}
                  </h1>
                  <p className={`mt-2 text-sm leading-6 ${mutedText}`}>
                    Sign in to access VictorySync.
                  </p>
                </div>
                <ThemeButton className={`hidden lg:block ${toggleClass}`} isLight={isLight} onClick={toggleTheme} />
              </div>

              {/* Tab switcher */}
              <div className={`mt-7 grid grid-cols-2 rounded-2xl border p-1 ${isLight ? "border-slate-200 bg-slate-100" : "border-white/[0.06] bg-white/[0.035]"}`}>
                <button
                  type="button"
                  onClick={() => { setMode("signin"); setError(null); }}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    mode === "signin" ? "bg-cyan-500 text-slate-950 shadow-[0_10px_24px_rgba(6,182,212,0.18)]" : inactiveTab
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("signup"); setError(null); }}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    mode === "signup" ? "bg-emerald-400 text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.16)]" : inactiveTab
                  }`}
                >
                  Sign up
                </button>
              </div>

              {/* Google OAuth */}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className={`flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition hover:opacity-80 ${
                    isLight ? "border-slate-200 bg-white text-slate-700" : "border-white/[0.08] bg-white/[0.04] text-slate-200"
                  }`}
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
              </div>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className={`h-px flex-1 ${isLight ? "bg-slate-200" : "bg-white/[0.07]"}`} />
                <span className={`text-xs font-medium ${mutedText}`}>or</span>
                <div className={`h-px flex-1 ${isLight ? "bg-slate-200" : "bg-white/[0.07]"}`} />
              </div>

              {/* Email / password form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide ${mutedText}`}>
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide ${mutedText}`}>
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
                {mode === "signup" && (
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide ${mutedText}`}>
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}

                {error && (
                  <p className={`rounded-xl px-4 py-3 text-sm ${
                    error.startsWith("Check") ? "bg-emerald-400/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_10px_24px_rgba(6,182,212,0.22)] transition hover:bg-cyan-400 disabled:opacity-60"
                >
                  {submitting
                    ? mode === "signin" ? "Signing in…" : "Creating account…"
                    : mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

function BrandMark({ isLight, compact = false }: { isLight: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`${compact ? "h-11 w-11" : "h-12 w-12"} flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 shadow-[0_18px_45px_rgba(6,182,212,0.12)]`}>
        <span className={`text-sm font-black tracking-wide ${isLight ? "text-cyan-700" : "text-cyan-100"}`}>VS</span>
      </div>
      <div>
        <div className={`text-sm font-semibold tracking-[0.16em] ${isLight ? "text-cyan-800" : "text-cyan-100"}`}>VictorySync</div>
        <div className={`text-xs uppercase tracking-[0.2em] ${isLight ? "text-slate-500" : "text-slate-500"}`}>Operations Hub</div>
      </div>
    </div>
  );
}

function ThemeButton({ className, isLight, onClick }: { className: string; isLight: boolean; onClick: () => Promise<void> }) {
  return (
    <button type="button" onClick={() => void onClick()} className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${className}`}>
      {isLight ? "Dark" : "Light"}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2045C17.64 8.5663 17.5827 7.9527 17.4764 7.3636H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.2045Z" fill="#4285F4"/>
      <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853"/>
      <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.5931 3.68182 9C3.68182 8.4068 3.78409 7.8299 3.96409 7.2899V4.9581H0.957275C0.347727 6.1731 0 7.5477 0 9C0 10.4522 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
      <path d="M9 3.5795C10.3214 3.5795 11.5077 4.0336 12.4405 4.9254L15.0218 2.344C13.4632 0.891816 11.4259 0 9 0C5.48182 0 2.43818 2.0168 0.957275 4.9581L3.96409 7.2899C4.67182 5.1627 6.65591 3.5795 9 3.5795Z" fill="#EA4335"/>
    </svg>
  );
}
