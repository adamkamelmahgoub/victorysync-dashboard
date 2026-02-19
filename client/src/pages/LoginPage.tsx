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
    <div className="min-h-screen flex items-stretch bg-gradient-to-b from-slate-900 to-slate-950 text-white">
      <div className="hidden md:flex md:flex-1 items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-600 p-12">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 mx-auto rounded-lg bg-white/10 flex items-center justify-center mb-6">
            <span className="text-white font-bold text-2xl">VS</span>
          </div>
          <h2 className="text-3xl font-bold mb-2">VictorySync</h2>
          <p className="text-slate-100/90">Invite-code onboarding for secure organization access.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <div className="bg-slate-900/80 rounded-2xl p-8 shadow-xl ring-1 ring-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">VictorySync</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-50">
                  {mode === "signin" ? "Sign in" : "Sign up with invite"}
                </h1>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  resetMessages();
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  mode === "signin" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300"
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
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  mode === "signup" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"
                }`}
              >
                Sign up
              </button>
            </div>

            {mode === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="********"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                    required
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-400">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 px-6 py-3 text-sm font-semibold text-slate-900 transition-colors"
                  >
                    {loading ? "Signing in..." : "Sign in"}
                  </button>
                  <div className="text-xs text-slate-400">Need invite access? Contact your admin.</div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full name (optional)</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email (must match invite)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner-or-member@example.com"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Organization ID</label>
                    <input
                      type="text"
                      value={orgId}
                      onChange={(e) => setOrgId(e.target.value)}
                      placeholder="UUID"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Invite code</label>
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="ABCDE-12345"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-400">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-300">
                    {success}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 px-6 py-3 text-sm font-semibold text-slate-900 transition-colors"
                  >
                    {loading ? "Creating account..." : "Create account"}
                  </button>
                  <div className="text-xs text-slate-400">Invite code required</div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
