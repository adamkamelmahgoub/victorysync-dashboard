import type { FC, FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { buildApiUrl } from "../config";
import victorySyncLogo from "../assets/victorysync-logo.png";

type Mode = "signin" | "invite";
type InviteStep = "code" | "password" | "done";

interface ValidatedInvite {
  id: string;
  org_id: string;
  org_name: string | null;
  email: string;
  role: string;
  inviteCode: string;
}

export const LoginPage: FC = () => {
  const { signIn, sendMfaEmailCode, verifyMfa, pendingMfa, signOut, user, globalRole, authError, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as any)?.from?.pathname || (globalRole === "platform_admin" ? "/admin" : "/dashboard");

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [signinError, setSigninError] = useState<string | null>(null);
  const [signinLoading, setSigninLoading] = useState(false);
  const [mfaMethod, setMfaMethod] = useState<"totp" | "email">("totp");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [mfaEmailSent, setMfaEmailSent] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

  const [inviteStep, setInviteStep] = useState<InviteStep>("code");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOrgId, setInviteOrgId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteVerificationCode, setInviteVerificationCode] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteConfirm, setInviteConfirm] = useState("");
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [showInviteConfirm, setShowInviteConfirm] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [validatedInvite, setValidatedInvite] = useState<ValidatedInvite | null>(null);

  useEffect(() => {
    if (!user || authLoading || pendingMfa) return;
    navigate(globalRole === "platform_admin" ? "/admin" : redirectTo, { replace: true });
  }, [authLoading, globalRole, navigate, pendingMfa, redirectTo, user]);

  useEffect(() => {
    const message = (location.state as any)?.authError || authError;
    if (message) setSigninError(message);
  }, [authError, location.state]);

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setSigninError(null);
    setMfaCode("");
    setMfaMessage(null);
    setMfaEmailSent(false);
    setInviteError(null);
    setInviteStep("code");
    setValidatedInvite(null);
  };

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setSigninError(null);
    setMfaMessage(null);
    setMfaCode("");
    setMfaEmailSent(false);
    setSigninLoading(true);
    const result = await signIn(email, password, rememberLogin);
    setSigninLoading(false);
    if (result.error) setSigninError(result.error);
    if (result.mfaRequired) {
      const hasTotp = result.factors?.some((factor) => factor.type === "totp");
      setMfaMethod(hasTotp ? "totp" : "email");
      setSigninError(null);
    }
  };

  const handleSendMfaEmail = async () => {
    setSigninError(null);
    setMfaMessage(null);
    setMfaLoading(true);
    const { error } = await sendMfaEmailCode();
    setMfaLoading(false);
    if (error) {
      setSigninError(error);
      return;
    }
    setMfaEmailSent(true);
    setMfaMessage("We sent a new 6-digit code to your account email.");
  };

  const handleVerifyMfa = async (event: FormEvent) => {
    event.preventDefault();
    setSigninError(null);
    setMfaMessage(null);
    const cleanCode = mfaCode.replace(/\D/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      setSigninError("Enter the 6-digit two-factor code.");
      return;
    }
    setMfaLoading(true);
    const { error } = await verifyMfa(cleanCode, mfaMethod);
    setMfaLoading(false);
    if (error) setSigninError(error);
  };

  const handleDifferentAccount = async () => {
    setSigninError(null);
    setMfaCode("");
    setMfaMessage(null);
    setMfaEmailSent(false);
    await signOut();
  };

  const handleValidateInvite = async (event: FormEvent) => {
    event.preventDefault();
    setInviteError(null);
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    const orgId = inviteOrgId.trim();
    const code = inviteCode.trim().toUpperCase();
    if (!normalizedEmail || !orgId || !code) {
      setInviteError("Email, organization ID, and invite code are required.");
      return;
    }

    setInviteLoading(true);
    try {
      const response = await fetch(buildApiUrl("/api/auth/validate-invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, orgId, inviteCode: code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.valid) {
        setInviteError(data.detail || data.error || "Invite code could not be validated.");
        return;
      }
      setValidatedInvite({ ...data.invite, inviteCode: code });
      setInviteVerificationCode("");
      setInviteStep("password");
    } catch {
      setInviteError("Unable to validate the invite right now. Please try again.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCreateAccount = async (event: FormEvent) => {
    event.preventDefault();
    setInviteError(null);
    if (!validatedInvite) return;
    if (invitePassword.length < 8) {
      setInviteError("Password must be at least 8 characters.");
      return;
    }
    if (invitePassword !== inviteConfirm) {
      setInviteError("Passwords do not match.");
      return;
    }

    setInviteLoading(true);
    try {
      const response = await fetch(buildApiUrl("/api/auth/signup-with-invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: validatedInvite.email,
          password: invitePassword,
          orgId: validatedInvite.org_id,
          inviteCode: validatedInvite.inviteCode,
          verificationCode: inviteVerificationCode.trim(),
          fullName: inviteName.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setInviteError(data.detail || data.error || "Account creation failed.");
        return;
      }
      const { error } = await signIn(validatedInvite.email, invitePassword);
      if (error) {
        setInviteStep("done");
        return;
      }
      navigate("/dashboard", { replace: true });
    } catch {
      setInviteError("Unable to create the account right now. Please try again.");
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_18%_-10%,rgba(124,58,237,0.12),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f6f6f7_45%,#eef1f5_100%)] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <section className="hidden lg:block">
            <BrandBlock />
            <div className="mt-10 grid max-w-xl gap-3">
              <InfoRow title="Live operations" description="Monitor calls, SMS, recordings, and current agent status from one workspace." />
              <InfoRow title="Client-ready reporting" description="Keep every client scoped to the right organization, numbers, and reports." />
              <InfoRow title="Secure access" description="Role-aware routing, organization scoping, and authenticated API calls are enforced across the dashboard." />
            </div>
          </section>

          <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white/96 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_28px_70px_rgba(15,23,42,0.14)] ring-1 ring-white backdrop-blur sm:p-8">
            <div className="mb-8 lg:hidden">
              <BrandBlock compact />
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">VictorySync</div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                {pendingMfa ? "Verify your sign in" : mode === "signin" ? "Sign in to your dashboard" : inviteStep === "done" ? "Account created" : "Join your workspace"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {pendingMfa
                  ? "Enter your second factor before VictorySync opens your workspace."
                  : mode === "signin"
                  ? "Use your VictorySync account to access operations, reports, recordings, and billing."
                  : "Invite signup is available only for users with a valid organization invite."}
              </p>
            </div>

            {!pendingMfa && <div className="mt-6 grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100/80 p-1 shadow-inner">
              <button type="button" onClick={() => switchMode("signin")} className={mode === "signin" ? "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-violet-700 shadow-sm ring-1 ring-violet-100" : "rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white/70 hover:text-slate-950"}>
                Sign in
              </button>
              <button type="button" onClick={() => switchMode("invite")} className={mode === "invite" ? "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-violet-700 shadow-sm ring-1 ring-violet-100" : "rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white/70 hover:text-slate-950"}>
                Use invite
              </button>
            </div>}

            {pendingMfa && (
              <form onSubmit={handleVerifyMfa} className="mt-6 space-y-4">
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950">
                  Password accepted for <span className="font-semibold">{pendingMfa.email || email}</span>. Complete two-factor verification to continue.
                </div>

                <div className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Verification method</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!pendingMfa.factors.some((factor) => factor.type === "totp")}
                      onClick={() => {
                        setMfaMethod("totp");
                        setSigninError(null);
                        setMfaMessage(null);
                      }}
                      className={mfaMethod === "totp" ? "vs-button-primary" : "vs-button-secondary"}
                    >
                      Auth app
                    </button>
                    <button
                      type="button"
                      disabled={!pendingMfa.factors.some((factor) => factor.type === "email")}
                      onClick={() => {
                        setMfaMethod("email");
                        setSigninError(null);
                        setMfaMessage(null);
                      }}
                      className={mfaMethod === "email" ? "vs-button-primary" : "vs-button-secondary"}
                    >
                      Email code
                    </button>
                  </div>
                </div>

                {mfaMethod === "email" && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm leading-6 text-slate-700">Send a one-time code to your account email, then enter it below.</p>
                    <button type="button" onClick={handleSendMfaEmail} disabled={mfaLoading} className="vs-button-secondary mt-3 w-full">
                      {mfaLoading ? "Sending..." : mfaEmailSent ? "Send another email code" : "Send email code"}
                    </button>
                  </div>
                )}

                <Field label={mfaMethod === "email" ? "Email code" : "Authenticator code"}>
                  <input
                    className="vs-input w-full text-center text-lg font-semibold tracking-[0.22em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                  />
                </Field>
                {mfaMessage && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mfaMessage}</div>}
                {signinError && <ErrorBanner>{signinError}</ErrorBanner>}
                <button type="submit" disabled={mfaLoading || authLoading} className="vs-button-primary w-full">
                  {mfaLoading || authLoading ? "Verifying..." : "Verify and continue"}
                </button>
                <button type="button" onClick={handleDifferentAccount} className="vs-button-secondary w-full">
                  Use a different account
                </button>
              </form>
            )}

            {!pendingMfa && mode === "signin" && (
              <form onSubmit={handleSignIn} className="mt-6 space-y-4">
                <Field label="Email">
                  <input className="vs-input w-full" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
                </Field>
                <Field label="Password">
                  <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="current-password" placeholder="Enter your password" />
                </Field>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                  Keep me signed in on this device
                </label>
                {signinError && <ErrorBanner>{signinError}</ErrorBanner>}
                <button type="submit" disabled={signinLoading || authLoading} className="vs-button-primary w-full">
                  {signinLoading || authLoading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            )}

            {mode === "invite" && inviteStep === "code" && (
              <form onSubmit={handleValidateInvite} className="mt-6 space-y-4">
                <Field label="Email">
                  <input className="vs-input w-full" type="email" autoComplete="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="you@company.com" />
                </Field>
                <Field label="Organization ID">
                  <input className="vs-input w-full" required value={inviteOrgId} onChange={(event) => setInviteOrgId(event.target.value)} placeholder="Organization ID" />
                </Field>
                <Field label="Invite code">
                  <input className="vs-input w-full" required value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="Invite code" />
                </Field>
                {inviteError && <ErrorBanner>{inviteError}</ErrorBanner>}
                <button type="submit" disabled={inviteLoading} className="vs-button-primary w-full">
                  {inviteLoading ? "Checking invite..." : "Continue"}
                </button>
              </form>
            )}

            {mode === "invite" && inviteStep === "password" && validatedInvite && (
              <form onSubmit={handleCreateAccount} className="mt-6 space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Invite confirmed for <span className="font-semibold">{validatedInvite.org_name || validatedInvite.org_id}</span>. We sent a verification code to {validatedInvite.email}.
                </div>
                <Field label="Email verification code">
                  <input
                    className="vs-input w-full tracking-[0.22em]"
                    inputMode="numeric"
                    required
                    value={inviteVerificationCode}
                    onChange={(event) => setInviteVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                  />
                </Field>
                <Field label="Full name">
                  <input className="vs-input w-full" autoComplete="name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Jane Smith" />
                </Field>
                <Field label="Password">
                  <PasswordField value={invitePassword} onChange={setInvitePassword} show={showInvitePassword} onToggle={() => setShowInvitePassword((value) => !value)} autoComplete="new-password" placeholder="At least 8 characters" />
                </Field>
                <Field label="Confirm password">
                  <PasswordField value={inviteConfirm} onChange={setInviteConfirm} show={showInviteConfirm} onToggle={() => setShowInviteConfirm((value) => !value)} autoComplete="new-password" placeholder="Confirm password" />
                </Field>
                {inviteError && <ErrorBanner>{inviteError}</ErrorBanner>}
                <div className="grid grid-cols-[auto_1fr] gap-3">
                  <button type="button" onClick={() => setInviteStep("code")} className="vs-button-secondary">Back</button>
                  <button type="submit" disabled={inviteLoading} className="vs-button-primary">
                    {inviteLoading ? "Creating..." : "Create account"}
                  </button>
                </div>
              </form>
            )}

            {mode === "invite" && inviteStep === "done" && (
              <div className="mt-6 space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Your account was created. Sign in with your email and password to continue.
                </div>
                <button type="button" onClick={() => switchMode("signin")} className="vs-button-primary w-full">Go to sign in</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src={victorySyncLogo} alt="VictorySync logo" className={`${compact ? "h-10 w-10" : "h-12 w-12"} rounded-2xl object-cover shadow-[0_14px_30px_rgba(15,23,42,0.25)] ring-1 ring-slate-300`} />
      <div>
        <div className="text-base font-semibold text-slate-950">VictorySync</div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">CX command center</div>
      </div>
    </div>
  );
}

function InfoRow({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm ring-1 ring-white">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <input
        className="vs-input w-full pr-20"
        type={show ? "text" : "password"}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function ErrorBanner({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{children}</div>;
}
