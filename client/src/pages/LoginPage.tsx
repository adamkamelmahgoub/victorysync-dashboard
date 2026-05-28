import type { FC, FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { buildApiUrl } from "../config";

type Mode = "signin" | "signup";

export const LoginPage: FC = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgId, setOrgId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const result = await signIn(email, password);
      if (result.error) setError(result.error);
      else navigate("/");
    } catch (err: any) {
      setError(err?.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!email.trim() || !password || !orgId.trim() || !inviteCode.trim()) {
      setError("Email, password, org ID, and invite code are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const validateRes = await fetch(buildApiUrl("/api/auth/validate-invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, orgId, inviteCode }),
      });
      const validateJson = await validateRes.json().catch(() => ({}));
      if (!validateRes.ok || !validateJson?.valid) {
        setError(validateJson?.detail || validateJson?.error || "Invalid invite information.");
        return;
      }

      const signupRes = await fetch(buildApiUrl("/api/auth/signup-with-invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, orgId, inviteCode, fullName }),
      });
      const signupJson = await signupRes.json().catch(() => ({}));
      if (!signupRes.ok) {
        setError(signupJson?.detail || signupJson?.error || "Sign up failed.");
        return;
      }

      const login = await signIn(email, password);
      if (login.error) {
        setSuccess("Account created. Please sign in.");
        setMode("signin");
        return;
      }

      navigate("/");
    } catch (err: any) {
      setError(err?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const pageClass = isLight
    ? "min-h-screen bg-slate-100 text-slate-950"
    : "min-h-screen bg-[#030711] text-white";
  const brandPanelClass = isLight
    ? "relative hidden overflow-hidden border-r border-slate-200 bg-white lg:flex"
    : "relative hidden overflow-hidden border-r border-white/[0.06] bg-[#07111f] lg:flex";
  const brandOverlayClass = isLight
    ? "absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(6,182,212,0.14),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.12),transparent_26%),linear-gradient(145deg,rgba(255,255,255,0.72),rgba(226,232,240,0.86))]"
    : "absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(6,182,212,0.18),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(145deg,rgba(3,7,18,0.05),rgba(3,7,18,0.78))]";
  const cardClass = isLight
    ? "rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-8"
    : "rounded-[28px] border border-white/[0.07] bg-slate-950/72 p-5 shadow-[0_28px_70px_rgba(0,0,0,0.32)] sm:p-8";
  const inputClass = isLight
    ? "w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:bg-white"
    : "w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-50 placeholder-slate-600 outline-none transition focus:border-cyan-300/50 focus:bg-white/[0.055]";
  const titleText = isLight ? "text-slate-950" : "text-white";
  const mutedText = isLight ? "text-slate-600" : "text-slate-400";
  const subtleText = isLight ? "text-slate-500" : "text-slate-500";
  const surfaceClass = isLight ? "border-slate-200 bg-slate-50" : "border-white/[0.07] bg-white/[0.035]";
  const inactiveTab = isLight ? "text-slate-600 hover:text-slate-950" : "text-slate-400 hover:text-slate-100";
  const toggleClass = isLight
    ? "border-slate-300 bg-white text-slate-700"
    : "border-white/[0.08] bg-white/[0.035] text-slate-200";

  return (
    <main className={pageClass}>
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className={brandPanelClass}>
          <div className={brandOverlayClass} />
          <div className="relative flex w-full flex-col justify-between p-12 xl:p-16">
            <BrandMark isLight={isLight} />

            <div className="max-w-2xl">
              <div className={`mb-5 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] ${isLight ? "text-emerald-700" : "text-emerald-100"}`}>
                Secure Client Portal
              </div>
              <h2 className={`text-5xl font-black leading-[1.02] tracking-normal xl:text-6xl ${titleText}`}>
                Live operations, calls, leads, and client reporting in one command center.
              </h2>
              <p className={`mt-6 max-w-xl text-base leading-7 ${mutedText}`}>
                Sign in to monitor activity, manage lead intake, review recordings, and keep every client workspace accountable.
              </p>

              <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
                <TrustTile label="Access" value="RBAC secured" isLight={isLight} surfaceClass={surfaceClass} />
                <TrustTile label="Data" value="Org isolated" isLight={isLight} surfaceClass={surfaceClass} />
                <TrustTile label="Status" value="Live sync" isLight={isLight} surfaceClass={surfaceClass} accent />
              </div>
            </div>

            <div className={`flex items-center justify-between text-xs ${subtleText}`}>
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

            <div className={cardClass}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-500">Account Access</div>
                  <h1 className={`mt-3 text-3xl font-black tracking-normal ${titleText}`}>
                    {mode === "signin" ? "Welcome back" : "Join your workspace"}
                  </h1>
                  <p className={`mt-2 text-sm leading-6 ${mutedText}`}>
                    {mode === "signin"
                      ? "Use your VictorySync credentials to enter the operations dashboard."
                      : "Create your account with the invite details provided by your administrator."}
                  </p>
                </div>
                <ThemeButton className={`hidden lg:block ${toggleClass}`} isLight={isLight} onClick={toggleTheme} />
              </div>

              <div className={`mt-7 grid grid-cols-2 rounded-2xl border p-1 ${isLight ? "border-slate-200 bg-slate-100" : "border-white/[0.06] bg-white/[0.035]"}`}>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    resetMessages();
                  }}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    mode === "signin" ? "bg-cyan-500 text-slate-950 shadow-[0_10px_24px_rgba(6,182,212,0.18)]" : inactiveTab
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    resetMessages();
                  }}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    mode === "signup" ? "bg-emerald-400 text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.16)]" : inactiveTab
                  }`}
                >
                  Sign up
                </button>
              </div>

              {mode === "signin" ? (
                <form onSubmit={handleSignIn} className="mt-7 space-y-5">
                  <Field label="Email">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} required />
                  </Field>
                  <Field label="Password">
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className={inputClass} required />
                  </Field>
                  {error && <Message tone="error" isLight={isLight}>{error}</Message>}
                  <button type="submit" disabled={loading} className="w-full rounded-2xl bg-cyan-400 px-5 py-3.5 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">
                    {loading ? "Signing in..." : "Enter Dashboard"}
                  </button>
                  <p className={`text-center text-xs ${subtleText}`}>Need access? Ask your VictorySync administrator for an invite.</p>
                </form>
              ) : (
                <form onSubmit={handleSignUp} className="mt-7 space-y-4">
                  <Field label="Full name">
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className={inputClass} />
                  </Field>
                  <Field label="Email">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner-or-member@example.com" className={inputClass} required />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Organization ID">
                      <input type="text" value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="UUID" className={inputClass} required />
                    </Field>
                    <Field label="Invite code">
                      <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="ABCDE-12345" className={inputClass} required />
                    </Field>
                  </div>
                  <Field label="Password">
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={inputClass} required />
                  </Field>
                  <Field label="Confirm password">
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" className={inputClass} required />
                  </Field>
                  {error && <Message tone="error" isLight={isLight}>{error}</Message>}
                  {success && <Message tone="success" isLight={isLight}>{success}</Message>}
                  <button type="submit" disabled={loading} className="w-full rounded-2xl bg-emerald-400 px-5 py-3.5 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">
                    {loading ? "Creating account..." : "Create Account"}
                  </button>
                </form>
              )}
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

function TrustTile({ label, value, isLight, surfaceClass, accent = false }: { label: string; value: string; isLight: boolean; surfaceClass: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${surfaceClass}`}>
      <div className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isLight ? "text-slate-500" : "text-slate-500"}`}>{label}</div>
      <div className={`mt-3 text-sm font-semibold ${accent ? (isLight ? "text-emerald-700" : "text-emerald-200") : (isLight ? "text-slate-950" : "text-slate-100")}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Message({ tone, isLight, children }: { tone: "error" | "success"; isLight: boolean; children: ReactNode }) {
  const classes = tone === "error"
    ? (isLight ? "border-rose-200 bg-rose-50 text-rose-700" : "border-rose-300/20 bg-rose-400/10 text-rose-200")
    : (isLight ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-emerald-300/20 bg-emerald-400/10 text-emerald-200");
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}>{children}</div>;
}
