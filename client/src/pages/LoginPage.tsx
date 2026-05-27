import type { FC } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { buildApiUrl } from "../config";

type Mode = "signin" | "signup";

export const LoginPage: FC = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();

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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        navigate("/");
      }
    } catch (err: any) {
      setError(err?.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
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
        body: JSON.stringify({
          email,
          orgId,
          inviteCode,
        }),
      });
      const validateJson = await validateRes.json().catch(() => ({}));
      if (!validateRes.ok || !validateJson?.valid) {
        setError(validateJson?.detail || validateJson?.error || "Invalid invite information.");
        return;
      }

      const signupRes = await fetch(buildApiUrl("/api/auth/signup-with-invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          orgId,
          inviteCode,
          fullName,
        }),
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

  return (
    <main className="min-h-screen bg-[#030711] text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden border-r border-white/[0.06] bg-[#07111f] lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(6,182,212,0.18),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(145deg,rgba(3,7,18,0.05),rgba(3,7,18,0.78))]" />
          <div className="relative flex w-full flex-col justify-between p-12 xl:p-16">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_18px_45px_rgba(6,182,212,0.12)]">
                <span className="text-base font-black tracking-wide text-cyan-100">VS</span>
              </div>
              <div>
                <div className="text-sm font-semibold tracking-[0.18em] text-cyan-100">VictorySync</div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Operations Hub</div>
              </div>
            </div>

            <div className="max-w-2xl">
              <div className="mb-5 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-100">
                Secure Client Portal
              </div>
              <h2 className="text-5xl font-black leading-[1.02] tracking-normal text-white xl:text-6xl">
                Live operations, calls, leads, and client reporting in one command center.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
                Sign in to monitor MightyCall activity, manage lead intake, review recordings, and keep every client workspace accountable.
              </p>

              <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Access</div>
                  <div className="mt-3 text-sm font-semibold text-slate-100">RBAC secured</div>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Data</div>
                  <div className="mt-3 text-sm font-semibold text-slate-100">Org isolated</div>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Status</div>
                  <div className="mt-3 text-sm font-semibold text-emerald-200">Live sync</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Multi-tenant operations platform</span>
              <span>dashboard.victorysync.com</span>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[460px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                <span className="text-sm font-black text-cyan-100">VS</span>
              </div>
              <div>
                <div className="text-sm font-semibold tracking-[0.16em] text-cyan-100">VictorySync</div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Operations Hub</div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.07] bg-slate-950/72 p-6 shadow-[0_28px_70px_rgba(0,0,0,0.32)] sm:p-8">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Account Access</div>
                <h1 className="mt-3 text-3xl font-black tracking-normal text-white">
                  {mode === "signin" ? "Welcome back" : "Join your workspace"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {mode === "signin"
                    ? "Use your VictorySync credentials to enter the operations dashboard."
                    : "Create your account with the invite details provided by your administrator."}
                </p>
              </div>

              <div className="mt-7 grid grid-cols-2 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    resetMessages();
                  }}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    mode === "signin" ? "bg-cyan-500 text-slate-950 shadow-[0_10px_24px_rgba(6,182,212,0.18)]" : "text-slate-400 hover:text-slate-100"
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
                    mode === "signup" ? "bg-emerald-400 text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.16)]" : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  Sign up
                </button>
              </div>

              {mode === "signin" ? (
                <form onSubmit={handleSignIn} className="mt-7 space-y-5">
                  <Field label="Email">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-50 placeholder-slate-600 outline-none transition focus:border-cyan-300/50 focus:bg-white/[0.055]"
                      required
                    />
                  </Field>

                  <Field label="Password">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-50 placeholder-slate-600 outline-none transition focus:border-cyan-300/50 focus:bg-white/[0.055]"
                      required
                    />
                  </Field>

                  {error && <Message tone="error">{error}</Message>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-cyan-400 px-5 py-3.5 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Signing in..." : "Enter Dashboard"}
                  </button>
                  <p className="text-center text-xs text-slate-500">Need access? Ask your VictorySync administrator for an invite.</p>
                </form>
              ) : (
                <form onSubmit={handleSignUp} className="mt-7 space-y-4">
                  <Field label="Full name">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-50 placeholder-slate-600 outline-none transition focus:border-emerald-300/50 focus:bg-white/[0.055]"
                    />
                  </Field>

                  <Field label="Email">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="owner-or-member@example.com"
                      className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-50 placeholder-slate-600 outline-none transition focus:border-emerald-300/50 focus:bg-white/[0.055]"
                      required
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Organization ID">
                      <input
                        type="text"
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value)}
                        placeholder="UUID"
                        className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-50 placeholder-slate-600 outline-none transition focus:border-emerald-300/50 focus:bg-white/[0.055]"
                        required
                      />
                    </Field>
                    <Field label="Invite code">
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="ABCDE-12345"
                        className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-50 placeholder-slate-600 outline-none transition focus:border-emerald-300/50 focus:bg-white/[0.055]"
                        required
                      />
                    </Field>
                  </div>

                  <Field label="Password">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-50 placeholder-slate-600 outline-none transition focus:border-emerald-300/50 focus:bg-white/[0.055]"
                      required
                    />
                  </Field>

                  <Field label="Confirm password">
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-50 placeholder-slate-600 outline-none transition focus:border-emerald-300/50 focus:bg-white/[0.055]"
                      required
                    />
                  </Field>

                  {error && <Message tone="error">{error}</Message>}
                  {success && <Message tone="success">{success}</Message>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-emerald-400 px-5 py-3.5 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Message({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const classes = tone === "error"
    ? "border-rose-300/20 bg-rose-400/10 text-rose-200"
    : "border-emerald-300/20 bg-emerald-400/10 text-emerald-200";
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}>
      {children}
    </div>
  );
}
