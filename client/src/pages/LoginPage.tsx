import type { FC, FormEvent } from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { buildApiUrl } from "../config";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "signin" | "signup";

// Invite signup is a 3-step wizard:
//  step 1 — enter email + org ID + invite code → validate
//  step 2 — enter full name + password → create account
//  step 3 — success / auto-sign-in
type InviteStep = "code" | "password" | "done";

interface ValidatedInvite {
  id: string;
  org_id: string;
  org_name: string | null;
  email: string;
  role: string;
  inviteCode: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export const LoginPage: FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { signIn, user, globalRole, authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("signin");
  const isLight = theme === "light";

  // Sign-in state
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siError, setSiError] = useState<string | null>(null);
  const [siLoading, setSiLoading] = useState(false);
  const [showSiPassword, setShowSiPassword] = useState(false);

  // Invite signup state
  const [inviteStep, setInviteStep] = useState<InviteStep>("code");
  const [invEmail, setInvEmail] = useState("");
  const [invOrgId, setInvOrgId] = useState("");
  const [invCode, setInvCode] = useState("");
  const [invFullName, setInvFullName] = useState("");
  const [invPassword, setInvPassword] = useState("");
  const [invConfirm, setInvConfirm] = useState("");
  const [showInvPassword, setShowInvPassword] = useState(false);
  const [showInvConfirm, setShowInvConfirm] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invLoading, setInvLoading] = useState(false);
  const [validatedInvite, setValidatedInvite] = useState<ValidatedInvite | null>(null);
  const redirectTo = (location.state as any)?.from?.pathname || (globalRole === 'platform_admin' ? '/admin' : '/dashboard');

  useEffect(() => {
    const route = globalRole === 'platform_admin' ? '/admin' : redirectTo;
    if (user) navigate(route, { replace: true });
  }, [globalRole, navigate, redirectTo, user]);

  useEffect(() => {
    const message = (location.state as any)?.authError || authError;
    if (message) setSiError(message);
  }, [authError, location.state]);

  // ── Styles ──
  const isLight_ = isLight;
  const pageClass = isLight_ ? "min-h-screen bg-[#f6f6f7] text-slate-950" : "min-h-screen bg-[#030711] text-white";
  const panelClass = isLight_
    ? "border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
    : "border-white/[0.07] bg-slate-950/72 shadow-[0_28px_70px_rgba(0,0,0,0.32)]";
  const mutedText = isLight_ ? "text-slate-600" : "text-slate-400";
  const titleText = isLight_ ? "text-slate-950" : "text-white";
  const inactiveTab = isLight_ ? "text-slate-600 hover:text-slate-950" : "text-slate-400 hover:text-slate-100";
  const toggleClass = isLight_
    ? "border-slate-300 bg-white text-slate-700"
    : "border-white/[0.08] bg-white/[0.035] text-slate-200";
  const inputClass = isLight_
    ? "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
    : "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20";

  // ── Handlers ──

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setSiError(null);
    setSiLoading(true);
    const { error } = await signIn(siEmail, siPassword);
    setSiLoading(false);
    if (error) { setSiError(error); return; }
  };

  // Step 1: validate invite code
  const handleValidateInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInvError(null);
    const email = invEmail.trim().toLowerCase();
    const orgId = invOrgId.trim();
    const code = invCode.trim().toUpperCase();
    if (!email || !orgId || !code) { setInvError("All fields are required."); return; }

    setInvLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/validate-invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, orgId, inviteCode: code }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setInvError(
          data.error === "invite_not_found_or_invalid_code"
            ? "Invite code not found. Check your email, Org ID and code."
            : data.detail || data.error || "Validation failed."
        );
      } else {
        setValidatedInvite({ ...data.invite, inviteCode: code });
        setInvStep("password");
      }
    } catch {
      setInvError("Network error. Please try again.");
    } finally {
      setInvLoading(false);
    }
  };

  // Step 2: create account
  const handleCreateAccount = async (e: FormEvent) => {
    e.preventDefault();
    setInvError(null);
    if (!validatedInvite) return;
    if (invPassword.length < 8) { setInvError("Password must be at least 8 characters."); return; }
    if (invPassword !== invConfirm) { setInvError("Passwords do not match."); return; }

    setInvLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/signup-with-invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: validatedInvite.email,
          password: invPassword,
          orgId: validatedInvite.org_id,
          inviteCode: validatedInvite.inviteCode,
          fullName: invFullName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          data.error === "account_already_exists" ? "An account with this email already exists. Try signing in." :
          data.error === "weak_password" ? data.detail || "Password too weak." :
          data.detail || data.error || "Sign-up failed.";
        setInvError(msg);
        return;
      }
      // Auto sign-in after account creation
      const { error: signInErr } = await signIn(validatedInvite.email, invPassword);
      if (signInErr) {
        // Account created but auto-login failed — let them sign in manually
        setInvStep("done");
      } else {
        navigate("/dashboard");
      }
    } catch {
      setInvError("Network error. Please try again.");
    } finally {
      setInvLoading(false);
    }
  };

  const setInvStep = (step: InviteStep) => {
    setInviteStep(step);
    setInvError(null);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setSiError(null);
    setInvError(null);
    setInvStep("code");
    setValidatedInvite(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <main className={pageClass}>
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">

        {/* Left hero panel */}
        <section className={`relative hidden overflow-hidden border-r lg:flex ${isLight_ ? "border-slate-200 bg-white" : "border-white/[0.06] bg-[#07111f]"}`}>
          <div className={isLight_
            ? "absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(6,182,212,0.14),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.12),transparent_26%),linear-gradient(145deg,rgba(255,255,255,0.72),rgba(226,232,240,0.86))]"
            : "absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(6,182,212,0.18),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(145deg,rgba(3,7,18,0.05),rgba(3,7,18,0.78))]"
          } />
          <div className="relative flex w-full flex-col justify-between p-12 xl:p-16">
            <BrandMark isLight={isLight_} />
            <div className="max-w-2xl">
              <div className={`mb-5 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] ${isLight_ ? "text-emerald-700" : "text-emerald-100"}`}>
                Invite-Only Access
              </div>
              <h2 className={`text-5xl font-black leading-[1.02] tracking-normal xl:text-6xl ${titleText}`}>
                Live operations, calls, leads, and client reporting in one command center.
              </h2>
              <p className={`mt-6 max-w-xl text-base leading-7 ${mutedText}`}>
                Sign in or use your invite code to access VictorySync — monitor activity, manage lead intake, review recordings, and keep every client workspace accountable.
              </p>
            </div>
            <div className={`flex items-center justify-between text-xs ${mutedText}`}>
              <span>Multi-tenant operations platform</span>
              <span>dashboard.victorysync.com</span>
            </div>
          </div>
        </section>

        {/* Right auth panel */}
        <section className="flex min-h-screen items-center justify-center px-4 py-5 sm:px-8 sm:py-8">
          <div className="w-full max-w-[460px]">

            <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
              <BrandMark isLight={isLight_} compact />
              <ThemeButton className={toggleClass} isLight={isLight_} onClick={toggleTheme} />
            </div>

            <div className={`rounded-[28px] border p-5 sm:p-8 ${panelClass}`}>

              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-500">Account Access</div>
                  <h1 className={`mt-3 text-3xl font-black tracking-normal ${titleText}`}>
                    {mode === "signin" ? "Welcome back" : inviteStep === "done" ? "Account created!" : "Join your workspace"}
                  </h1>
                  <p className={`mt-2 text-sm leading-6 ${mutedText}`}>
                    {mode === "signin"
                      ? "Sign in to access VictorySync."
                      : inviteStep === "code"
                      ? "Enter your invite code to create an account."
                      : inviteStep === "password"
                      ? `Setting up access for ${validatedInvite?.org_name || "your workspace"}.`
                      : "You can now sign in with your credentials."}
                  </p>
                </div>
                <ThemeButton className={`hidden lg:block ${toggleClass}`} isLight={isLight_} onClick={toggleTheme} />
              </div>

              {/* Tab switcher */}
              <div className={`mt-7 grid grid-cols-2 rounded-2xl border p-1 ${isLight_ ? "border-slate-200 bg-slate-100" : "border-white/[0.06] bg-white/[0.035]"}`}>
                <button type="button" onClick={() => switchMode("signin")}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mode === "signin" ? "bg-cyan-500 text-slate-950 shadow-[0_10px_24px_rgba(6,182,212,0.18)]" : inactiveTab}`}>
                  Sign in
                </button>
                <button type="button" onClick={() => switchMode("signup")}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mode === "signup" ? "bg-emerald-400 text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.16)]" : inactiveTab}`}>
                  Use invite code
                </button>
              </div>

              {/* ── SIGN IN ── */}
              {mode === "signin" && (
                <div className="mt-6 space-y-4">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <Field label="Email" isLight={isLight_} mutedText={mutedText}>
                      <input type="email" required autoComplete="email" placeholder="you@example.com"
                        value={siEmail} onChange={e => setSiEmail(e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Password" isLight={isLight_} mutedText={mutedText}>
                      <PasswordInput
                        value={siPassword}
                        onChange={setSiPassword}
                        show={showSiPassword}
                        onToggle={() => setShowSiPassword((show) => !show)}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        inputClass={inputClass}
                      />
                    </Field>
                    {siError && <ErrorBanner msg={siError} />}
                    <button type="submit" disabled={siLoading}
                      className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_10px_24px_rgba(6,182,212,0.22)] transition hover:bg-cyan-400 disabled:opacity-60">
                      {siLoading ? "Signing in..." : "Sign in"}
                    </button>
                  </form>
                </div>
              )}

              {/* ── SIGNUP — STEP 1: invite code ── */}
              {mode === "signup" && inviteStep === "code" && (
                <form onSubmit={handleValidateInvite} className="mt-6 space-y-4">
                  <Field label="Email address" isLight={isLight_} mutedText={mutedText}>
                    <input type="email" required autoComplete="email" placeholder="you@example.com"
                      value={invEmail} onChange={e => setInvEmail(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Organisation ID" isLight={isLight_} mutedText={mutedText}>
                    <input type="text" required placeholder="e.g. d6b7bbde-54bb-4782-…"
                      value={invOrgId} onChange={e => setInvOrgId(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Invite code" isLight={isLight_} mutedText={mutedText}>
                    <input type="text" required placeholder="XXXXXXXX" autoCapitalize="characters"
                      value={invCode} onChange={e => setInvCode(e.target.value.toUpperCase())} className={inputClass} />
                  </Field>
                  {invError && <ErrorBanner msg={invError} />}
                  <button type="submit" disabled={invLoading}
                    className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.22)] transition hover:bg-emerald-300 disabled:opacity-60">
                    {invLoading ? "Checking..." : "Validate invite"}
                  </button>
                </form>
              )}

              {/* ── SIGNUP — STEP 2: set password ── */}
              {mode === "signup" && inviteStep === "password" && validatedInvite && (
                <form onSubmit={handleCreateAccount} className="mt-6 space-y-4">
                  {/* Confirmed invite banner */}
                  <div className={`rounded-xl border px-4 py-3 text-sm ${isLight_ ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"}`}>
                    <span className="font-semibold">Invite confirmed</span> - {validatedInvite.org_name || validatedInvite.org_id}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold uppercase ${isLight_ ? "bg-emerald-100 text-emerald-700" : "bg-emerald-400/20 text-emerald-300"}`}>
                      {validatedInvite.role}
                    </span>
                  </div>

                  <Field label="Full name (optional)" isLight={isLight_} mutedText={mutedText}>
                    <input type="text" autoComplete="name" placeholder="Jane Smith"
                      value={invFullName} onChange={e => setInvFullName(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Password" isLight={isLight_} mutedText={mutedText}>
                    <PasswordInput
                      value={invPassword}
                      onChange={setInvPassword}
                      show={showInvPassword}
                      onToggle={() => setShowInvPassword((show) => !show)}
                      autoComplete="new-password"
                      placeholder="Min. 8 characters"
                      inputClass={inputClass}
                    />
                  </Field>
                  <Field label="Confirm password" isLight={isLight_} mutedText={mutedText}>
                    <PasswordInput
                      value={invConfirm}
                      onChange={setInvConfirm}
                      show={showInvConfirm}
                      onToggle={() => setShowInvConfirm((show) => !show)}
                      autoComplete="new-password"
                      placeholder="Confirm password"
                      inputClass={inputClass}
                    />
                  </Field>

                  {invError && <ErrorBanner msg={invError} />}

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setInvStep("code")}
                      className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${isLight_ ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-white/[0.08] text-slate-400 hover:bg-white/[0.04]"}`}>
                      Back
                    </button>
                    <button type="submit" disabled={invLoading}
                      className="flex-1 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.22)] transition hover:bg-emerald-300 disabled:opacity-60">
                      {invLoading ? "Creating account..." : "Create account"}
                    </button>
                  </div>
                </form>
              )}

              {/* ── SIGNUP — STEP 3: done ── */}
              {mode === "signup" && inviteStep === "done" && (
                <div className="mt-6 space-y-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10 text-3xl">✓</div>
                  <p className={`text-sm ${mutedText}`}>Your account has been created. Sign in with your email and password.</p>
                  <button type="button" onClick={() => switchMode("signin")}
                    className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_10px_24px_rgba(6,182,212,0.22)] transition hover:bg-cyan-400">
                    Go to sign in
                  </button>
                </div>
              )}

            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

// ─── Small helpers ─────────────────────────────────────────────────────────────

function Field({ label, isLight, mutedText, children }: { label: string; isLight: boolean; mutedText: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide ${mutedText}`}>{label}</label>
      {children}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  placeholder,
  inputClass,
}: {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  placeholder: string;
  inputClass: string;
}) {
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} pr-20`}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{msg}</p>;
}

function BrandMark({ isLight, compact = false }: { isLight: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`${compact ? "h-11 w-11" : "h-12 w-12"} flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 shadow-[0_18px_45px_rgba(6,182,212,0.12)]`}>
        <span className={`text-sm font-black tracking-wide ${isLight ? "text-cyan-700" : "text-cyan-100"}`}>VS</span>
      </div>
      <div>
        <div className={`text-sm font-semibold tracking-[0.16em] ${isLight ? "text-cyan-800" : "text-cyan-100"}`}>VictorySync</div>
        <div className={`text-xs uppercase tracking-[0.2em] text-slate-500`}>Operations Hub</div>
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
